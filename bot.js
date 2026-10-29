// ───────────────────────────────────────────────────────────────
// PEPE REY DEL NOXZ · Bot de Voz 24/7 Conversacional (Groq + Jorge)
// ───────────────────────────────────────────────────────────────
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { execFile } from 'node:child_process';
import dotenv from 'dotenv';
import prism from 'prism-media';
import {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  EmbedBuilder,
  ActivityType
} from 'discord.js';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  StreamType,
  NoSubscriberBehavior,
  EndBehaviorType
} from '@discordjs/voice';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const TOKEN = process.env.DISCORD_TOKEN?.trim();
const GROQ_KEY = process.env.GROQ_API_KEY?.trim();
const PREF_CANAL = process.env.CANAL_ID?.trim() || '1557238620857831474';
const PREF_GUILD = process.env.GUILD_ID?.trim() || '1310662226109272074';
const PORT = process.env.PORT || 3000;
const AFK_STATE_PATH = path.join(__dirname, 'canal_afk.json');
const CACHE_DIR = path.join(__dirname, 'temp_audio');
fs.mkdirSync(CACHE_DIR, { recursive: true });

process.on('unhandledRejection', (err) => {
  console.warn('⚠️ [Aviso de red/Discord]:', err?.message || err);
});
process.on('uncaughtException', (err) => {
  console.warn('⚠️ [Excepción controlada]:', err?.message || err);
});

if (!TOKEN) {
  console.error('❌ DISCORD_TOKEN no configurado.');
  process.exit(1);
}

// ───────────────────────────────────────────────────────────────
// CONFIGURACIÓN DE PERSONALIDAD & MEMORIA
// ───────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Eres Pepe Rey Del Noxz, un compa mexicano que está en el canal de voz de Discord jugando con sus amigos del gremio Noxz en Aion 2.
Personalidad y estilo:
- Eres el compa chistoso, sarcástico, a veces mamoncito y pesado, pero en el fondo leal a la banda.
- Conoces muy bien Aion 2 (Gladiador, Hechicero, Ranger, Espiritualista, builds, mazmorras, estigmas, Daevanion, PvP y PvE).
- Les tiras carrilla y bromas a tus amigos, a veces sales con mamadas o respuestas inesperadas y graciosas.
- Usas modismos mexicanos naturales (wey, no mames, qué pedo, Simón, al chile, cabrón, etc.) sin exagerar ni sonar fingido.
- REGLA DE ORO: Tus respuestas serán leídas en voz alta en Discord. Responde CORTO y DIRECTO (1 a 2 oraciones máximo, como en una plática real). NUNCA uses listas, asteriscos, negritas ni viñetas.`;

const historial = []; // últimos mensajes en memoria
let modoCharlaContinua = false; // false = solo responde si dicen 'pepe' o usan /decir; true = escucha todo
let botHablando = false; // anti-eco

// ───────────────────────────────────────────────────────────────
// 1. MINI SERVIDOR WEB KEEP-ALIVE (Render.com + UptimeRobot)
// ───────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const uptimeSec = Math.floor(process.uptime());
  const dias = Math.floor(uptimeSec / 86400);
  const horas = Math.floor((uptimeSec % 86400) / 3600);
  const mins = Math.floor((uptimeSec % 3600) / 60);

  const voiceChannel = client.guilds.cache.get(PREF_GUILD)?.members?.me?.voice?.channel;

  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({
    status: 'ONLINE',
    bot: client.user ? client.user.tag : 'Iniciando...',
    uptime: `${dias}d ${horas}h ${mins}m`,
    canal_voz: voiceChannel ? voiceChannel.name : 'Conectando...',
    modo_charla: modoCharlaContinua ? 'CONTINUO (/pepe on)' : 'SOLO MENCIÓN (/pepe off)',
    voz: 'es-MX-JorgeNeural (Jorge Mexicano)',
    ping_discord: `${client.ws?.ping || 0} ms`,
    mensaje: '👑 Pepe Rey Del Noxz cuidando la racha y cotorreando 24/7'
  }, null, 2));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Servidor Keep-Alive activo en el puerto ${PORT}`);
});

// ───────────────────────────────────────────────────────────────
// 2. GESTIÓN DEL CANAL GUARDADO
// ───────────────────────────────────────────────────────────────
function leerCanalesAFK() {
  try {
    if (fs.existsSync(AFK_STATE_PATH)) {
      return JSON.parse(fs.readFileSync(AFK_STATE_PATH, 'utf-8'));
    }
  } catch {}
  return {};
}

function guardarCanalAFK(guildId, channelId) {
  try {
    const data = leerCanalesAFK();
    if (channelId) data[guildId] = channelId;
    else delete data[guildId];
    fs.writeFileSync(AFK_STATE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch {}
}

// ───────────────────────────────────────────────────────────────
// 3. GENERACIÓN DE AUDIO WAV PARA WHISPER
// ───────────────────────────────────────────────────────────────
function createWavBuffer(pcmBuffer, sampleRate = 48000, channels = 2) {
  const wavHeader = Buffer.alloc(44);
  const totalLength = pcmBuffer.length + 36;
  wavHeader.write('RIFF', 0);
  wavHeader.writeUInt32LE(totalLength, 4);
  wavHeader.write('WAVE', 8);
  wavHeader.write('fmt ', 12);
  wavHeader.writeUInt32LE(16, 16);
  wavHeader.writeUInt16LE(1, 20); // PCM
  wavHeader.writeUInt16LE(channels, 22);
  wavHeader.writeUInt32LE(sampleRate, 24);
  wavHeader.writeUInt32LE(sampleRate * channels * 2, 28);
  wavHeader.writeUInt16LE(channels * 2, 32);
  wavHeader.writeUInt16LE(16, 34);
  wavHeader.write('data', 36);
  wavHeader.writeUInt32LE(pcmBuffer.length, 40);
  return Buffer.concat([wavHeader, pcmBuffer]);
}

// ───────────────────────────────────────────────────────────────
// 4. TRANSCRIPCIÓN CON GROQ WHISPER
// ───────────────────────────────────────────────────────────────
async function transcribirConGroq(wavBuffer) {
  if (!GROQ_KEY) return null;

  const boundary = '----PepeFormBoundary' + crypto.randomBytes(8).toString('hex');
  const body = [];

  body.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.wav"\r\nContent-Type: audio/wav\r\n\r\n`));
  body.push(wavBuffer);
  body.push(Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-large-v3-turbo\r\n`));
  body.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nes\r\n`));
  body.push(Buffer.from(`--${boundary}--\r\n`));

  const payload = Buffer.concat(body);

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_KEY}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'User-Agent': 'Mozilla/5.0'
    },
    body: payload
  });

  if (!res.ok) {
    const errText = await res.text();
    console.warn('⚠️ Error en Groq Whisper:', res.status, errText);
    return null;
  }

  const json = await res.json();
  return json.text?.trim() || null;
}

// ───────────────────────────────────────────────────────────────
// 5. CEREBRO IA CON GROQ (LLM)
// ───────────────────────────────────────────────────────────────
async function responderConIA(mensajeUsuario, nombreUsuario = 'Compa') {
  if (!GROQ_KEY) return 'No tengo configurada mi clave de Groq carnal.';

  historial.push({ role: 'user', content: `${nombreUsuario}: ${mensajeUsuario}` });
  if (historial.length > 8) historial.shift();

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...historial
  ];

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_KEY}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages,
        max_tokens: 120,
        temperature: 0.85
      })
    });

    if (!res.ok) {
      console.warn('⚠️ Error en Groq Chat:', res.status, await res.text());
      return 'Me trabé tantito con la chela, repíteme eso.';
    }

    const data = await res.json();
    let respuesta = data.choices?.[0]?.message?.content?.trim() || 'Simón.';
    // Limpieza de caracteres no hablables
    respuesta = respuesta.replace(/[*_#`~>\[\]]/g, '').replace(/\n+/g, ' ');

    historial.push({ role: 'assistant', content: respuesta });
    if (historial.length > 8) historial.shift();

    return respuesta;
  } catch (err) {
    console.error('❌ Error llamando a Groq:', err.message);
    return 'Se me fue la onda un segundo, carnal.';
  }
}

// ───────────────────────────────────────────────────────────────
// 6. SÍNTESIS DE VOZ DE JORGE (Edge-TTS)
// ───────────────────────────────────────────────────────────────
function generarAudioJorge(texto, outPath) {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32';
    const cmd = isWindows ? 'py' : 'python3';
    const args = isWindows
      ? ['-3.14', '-m', 'edge_tts', '--voice', 'es-MX-JorgeNeural', '--text', texto, '--write-media', outPath]
      : ['-m', 'edge_tts', '--voice', 'es-MX-JorgeNeural', '--text', texto, '--write-media', outPath];

    execFile(cmd, args, (err) => {
      if (err) {
        // Fallback a comando directo edge-tts
        execFile('edge-tts', ['--voice', 'es-MX-JorgeNeural', '--text', texto, '--write-media', outPath], (err2) => {
          if (err2) reject(err2);
          else resolve(outPath);
        });
      } else {
        resolve(outPath);
      }
    });
  });
}

// ───────────────────────────────────────────────────────────────
// 7. REPRODUCTOR Y CONTROL DE VOZ
// ───────────────────────────────────────────────────────────────
const player = createAudioPlayer({
  behaviors: { noSubscriber: NoSubscriberBehavior.Play }
});

player.on(AudioPlayerStatus.Idle, () => {
  botHablando = false;
});

player.on('error', (err) => {
  console.warn('⚠️ [AudioPlayer Error]:', err.message);
  botHablando = false;
});

async function reproducirEnCanal(texto) {
  if (!texto) return;
  botHablando = true;

  const audioFile = path.join(CACHE_DIR, `pepe_${Date.now()}.mp3`);
  try {
    await generarAudioJorge(texto, audioFile);
    const resource = createAudioResource(fs.createReadStream(audioFile), {
      inputType: StreamType.Arbitrary
    });
    player.play(resource);
    console.log(`🎙️ [Pepe hablando]: "${texto}"`);
  } catch (err) {
    console.error('❌ Error generando o reproduciendo voz de Jorge:', err.message);
    botHablando = false;
  } finally {
    // Borrar temporal en 15s
    setTimeout(() => {
      try { fs.unlinkSync(audioFile); } catch {}
    }, 15000);
  }
}

// ───────────────────────────────────────────────────────────────
// 8. ESCUCHA DE USUARIOS (Voz -> Texto -> IA -> Audio)
// ───────────────────────────────────────────────────────────────
function configurarEscucha(connection) {
  const receiver = connection.receiver;

  receiver.speaking.on('start', (userId) => {
    if (botHablando) return; // Anti-eco

    const user = client.users.cache.get(userId);
    const username = user?.displayName || user?.username || 'Compa';

    // Suscribirse a este hablante hasta 1 segundo de silencio
    const opusStream = receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: 1000
      }
    });

    const opusDecoder = new prism.opus.Decoder({
      rate: 48000,
      channels: 2,
      frameSize: 960
    });

    opusStream.on('error', (err) => {
      // Ignorar errores transitorios de red en el stream de voz
    });

    opusDecoder.on('error', (err) => {
      // Ignorar paquetes Opus con jitter o incompletos de Discord sin tumbar el bot
    });

    const pcmChunks = [];
    opusStream.pipe(opusDecoder);

    opusDecoder.on('data', (chunk) => {
      pcmChunks.push(chunk);
    });

    opusDecoder.on('end', async () => {
      if (botHablando) return;
      const totalPcm = Buffer.concat(pcmChunks);

      // Si el audio es menor a 0.5s de duración, ignorar
      if (totalPcm.length < 48000 * 2 * 2 * 0.5) return;

      const wavBuffer = createWavBuffer(totalPcm, 48000, 2);
      try {
        const texto = await transcribirConGroq(wavBuffer);
        if (!texto || texto.length < 3) return;

        console.log(`👂 [${username} dijo]: "${texto}"`);

        const esParaPepe = texto.toLowerCase().includes('pepe');

        // Responder si el modo continuo está activo O si dijeron "pepe"
        if (modoCharlaContinua || esParaPepe) {
          console.log(`🧠 [Pepe procesando respuesta para ${username}]...`);
          const respuesta = await responderConIA(texto, username);
          await reproducirEnCanal(respuesta);
        }
      } catch (err) {
        console.warn('⚠️ Error procesando voz recibida:', err.message);
      }
    });
  });
}

// ───────────────────────────────────────────────────────────────
// 9. CONEXIÓN DE VOZ INDESTRUCTIBLE 24/7
// ───────────────────────────────────────────────────────────────
let conexionActual = null;

async function conectarCanal(channel) {
  if (!channel || !channel.isVoiceBased()) return;
  const guild = channel.guild;

  try {
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false
    });

    conexionActual = connection;
    connection.subscribe(player);
    configurarEscucha(connection);

    connection.on(VoiceConnectionStatus.Ready, () => {
      console.log(`✅ [Voz Activa] Pepe Rey asegurado en "${channel.name}". Racha y oído activos.`);
    });

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      console.warn(`⚠️ [Voz Desconectada] Se perdió conexión en "${channel.name}". Reconectando...`);
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000)
        ]);
      } catch {
        try { connection.destroy(); } catch {}
        setTimeout(() => conectarCanal(channel), 3000);
      }
    });

    return connection;
  } catch (err) {
    console.error('❌ Error conectando a canal:', err.message);
    setTimeout(() => conectarCanal(channel), 5000);
  }
}

// ───────────────────────────────────────────────────────────────
// 10. CLIENTE DISCORD & COMANDOS
// ───────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const COMANDOS = [
  new SlashCommandBuilder()
    .setName('pepe')
    .setDescription('Activa o desactiva el modo de charla continua de Pepe Rey')
    .addStringOption(opt =>
      opt.setName('modo')
        .setDescription('Elige on para charla continua o off para solo mención')
        .setRequired(true)
        .addChoices(
          { name: '🟢 ON - Charla continua (escucha todo)', value: 'on' },
          { name: '🔴 OFF - Modo tranquilo (solo responde si dices Pepe)', value: 'off' }
        )
    ),
  new SlashCommandBuilder()
    .setName('decir')
    .setDescription('Escribe un mensaje para que Pepe lo responda por voz en el canal')
    .addStringOption(opt =>
      opt.setName('texto')
        .setDescription('¿Qué quieres decirle a Pepe?')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('quedarse')
    .setDescription('Fija a Pepe Rey 24/7 en tu canal de voz actual para proteger la racha'),
  new SlashCommandBuilder()
    .setName('estado')
    .setDescription('Muestra el estado, racha y modo de charla de Pepe Rey')
];

client.once('ready', async () => {
  console.log('======================================================');
  console.log(`👑 ¡Pepe Rey Del Noxz CONECTADO como ${client.user.tag}!`);
  console.log(`🎙️ Voz: Jorge (México) · IA: Groq Llama/GPT + Whisper`);
  console.log('======================================================');

  client.user.setPresence({
    activities: [{ name: 'Cuidando racha & cotorreando 👑', type: ActivityType.Custom }],
    status: 'online'
  });

  for (const [, guild] of client.guilds.cache) {
    try {
      await guild.commands.set(COMANDOS);
      console.log(`⚡ Comandos listos en: ${guild.name}`);

      const guardados = leerCanalesAFK();
      let targetId = guardados[guild.id] || (guild.id === PREF_GUILD ? PREF_CANAL : null);
      let target = targetId ? guild.channels.cache.get(targetId) : null;
      if (!target) target = guild.channels.cache.find(c => c.isVoiceBased());
      if (target) await conectarCanal(target);
    } catch (err) {
      console.warn(`Error en ${guild.name}:`, err.message);
    }
  }
});

client.on('voiceStateUpdate', (oldState, newState) => {
  if (oldState.member?.id !== client.user.id) return;
  const guild = oldState.guild;

  if (oldState.channelId && !newState.channelId) {
    console.log(`⚠️ Pepe fue desconectado. Reingresando en 3 segundos...`);
    const guardados = leerCanalesAFK();
    const canalId = guardados[guild.id] || PREF_CANAL;
    const canal = guild.channels.cache.get(canalId);
    if (canal) setTimeout(() => conectarCanal(canal), 3000);
  } else if (newState.channelId && newState.channelId !== oldState.channelId) {
    guardarCanalAFK(guild.id, newState.channelId);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'pepe') {
    const modo = interaction.options.getString('modo');
    modoCharlaContinua = (modo === 'on');

    const embed = new EmbedBuilder()
      .setColor(modoCharlaContinua ? 0x00FF88 : 0xFFAA00)
      .setTitle('👑 Pepe Rey Del Noxz · Modo de Charla')
      .setDescription(
        modoCharlaContinua
          ? '🟢 **Modo Charla Continua ACTIVADO**\nPepe ahora escucha todo lo que digan en el canal y se meterá a opinar y cotorrear con la banda.'
          : '🔴 **Modo Charla Continua DESACTIVADO**\nPepe ahora está en modo tranquilo. Solo responderá si dicen *"Pepe, ..."* o si usan `/decir`.'
      )
      .setFooter({ text: 'Voz: Jorge (México) · IA: Groq' });

    return interaction.reply({ embeds: [embed] });
  }

  if (interaction.commandName === 'decir') {
    const texto = interaction.options.getString('texto');
    await interaction.deferReply();

    const respuesta = await responderConIA(texto, interaction.user.displayName || interaction.user.username);
    await reproducirEnCanal(respuesta);

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setAuthor({ name: `${interaction.user.displayName}: ${texto}` })
      .setDescription(`🗣️ **Pepe dice:** "${respuesta}"`)
      .setFooter({ text: 'Pepe Rey Del Noxz' });

    return interaction.editReply({ embeds: [embed] });
  }

  if (interaction.commandName === 'quedarse') {
    const vc = interaction.member?.voice?.channel;
    if (!vc) {
      return interaction.reply({ content: '❌ Debes estar en un canal de voz.', ephemeral: true });
    }
    guardarCanalAFK(interaction.guildId, vc.id);
    await conectarCanal(vc);
    return interaction.reply({ content: `✅ Me he fijado en **${vc.name}**. Racha y oído protegidos 24/7.` });
  }

  if (interaction.commandName === 'estado') {
    const uptimeSec = Math.floor(process.uptime());
    const dias = Math.floor(uptimeSec / 86400);
    const horas = Math.floor((uptimeSec % 86400) / 3600);
    const mins = Math.floor((uptimeSec % 3600) / 60);
    const memMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const vc = interaction.guild.members.me?.voice?.channel;

    const embed = new EmbedBuilder()
      .setColor(0xFFAA00)
      .setTitle('📊 Estado de Pepe Rey')
      .addFields(
        { name: '⏱️ Tiempo Activo', value: `${dias}d ${horas}h ${mins}m`, inline: true },
        { name: '🎙️ Canal de Voz', value: vc ? `**${vc.name}**` : '❌ Desconectado', inline: true },
        { name: '🗣️ Modo Charla', value: modoCharlaContinua ? '🟢 Continua' : '🔴 Solo Mención ("Pepe")', inline: true },
        { name: '🇲🇽 Voz Activa', value: 'Jorge (México)', inline: true },
        { name: '🧠 Memoria RAM', value: `${memMb} MB`, inline: true },
        { name: '⚡ Ping', value: `${client.ws.ping} ms`, inline: true }
      )
      .setFooter({ text: 'Pepe Rey · Cuidando racha y platicando 24/7' });

    return interaction.reply({ embeds: [embed] });
  }
});

client.login(TOKEN);
