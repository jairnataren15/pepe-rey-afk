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
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
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
const SYSTEM_PROMPT = `Eres Pepe Rey Del Noxz, un jugador mexicano de Aion 2 en Discord platicando por voz con tus amigos del gremio Noxz.

PERSONALIDAD Y ESTILO:
- Eres el compa carrilludo, bromista, sarcástico y alivianado. Conoces Aion 2 muy bien (clases como Gladiador, Templario, Asesino, Ranger, Hechicero, Invocador, Clérigo, Cantor; estigmas, Daevanion, PvP, abyss y dungeons).
- Hablas con acento mexicano natural y jerga gamer (wey, no mames, carnal, paro, qué pedo, chela, manco, chido), pero VARÍAS tu vocabulario.

REGLAS ESTRICTAS DE CONVERSACIÓN:
1. Responde DIRECTO y con sustancia a la pregunta o tema que te están diciendo. Si te preguntan algo de builds, mecánicas o del juego, respóndeles la neta con carrilla.
2. PROHIBIDO repetir siempre las mismas muletillas como "Simón", "Al tiro" o "De nada". Habla de forma natural y variada.
3. Máximo 1 o 2 oraciones cortas (se lee en voz alta en Discord). NUNCA uses viñetas, negritas, asteriscos ni listas.`;

const historial = []; // últimos mensajes en memoria
let modoCharlaContinua = true; // true = charla continua por defecto; false = solo responde si dicen 'pepe'
let botHablando = false; // anti-eco

// Filtro de alucinaciones típicas que Whisper genera cuando hay silencio o estática
const FANTASMAS_WHISPER = [
  'gracias', 'muchas gracias', 'de nada', 'subtítulos', 'subtitulos',
  'amara.org', 'suscríbete', 'suscribete', 'bye', 'thank you', 'you',
  'chau', 'adiós', 'adios'
];

function esAlucinacionWhisper(texto) {
  const limpio = texto.toLowerCase().replace(/[^a-záéíóúñ]/g, '').trim();
  return FANTASMAS_WHISPER.includes(limpio);
}

// ───────────────────────────────────────────────────────────────
// 1. MINI SERVIDOR WEB KEEP-ALIVE (Render.com + UptimeRobot + Logs)
// ───────────────────────────────────────────────────────────────
const recentLogs = [];
function logEvent(msg) {
  const time = new Date().toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City' });
  const line = `[${time}] ${msg}`;
  console.log(line);
  recentLogs.push(line);
  if (recentLogs.length > 80) recentLogs.shift();
}

const server = http.createServer((req, res) => {
  if (req.url === '/logs') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(recentLogs.join('\n') || 'Sin actividad reciente registrada.');
    return;
  }

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
  logEvent(`🌐 Servidor Keep-Alive activo en el puerto ${PORT}`);
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

function guardarModoCharla(activo) {
  try {
    const data = leerCanalesAFK();
    data.modoCharla = activo;
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
        model: 'qwen/qwen3.8-27b',
        messages,
        max_tokens: 130,
        temperature: 0.85,
        frequency_penalty: 0.7,
        presence_penalty: 0.5
      })
    });

    if (!res.ok) {
      console.warn('⚠️ Error en Groq Chat:', res.status, await res.text());
      return 'Me trabé tantito con la chela, repíteme eso.';
    }

    const data = await res.json();
    let respuesta = data.choices?.[0]?.message?.content?.trim();

    if (!respuesta || respuesta.length < 2) {
      console.warn('⚠️ Respuesta de Groq vacía, usando fallback natural.');
      respuesta = 'No te alcancé a escuchar bien carnal, ¿qué decías?';
    }

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
// 6. SÍNTESIS DE VOZ DE JORGE (MsEdgeTTS Puro Node.js + Fallback)
// ───────────────────────────────────────────────────────────────
async function generarAudioJorge(texto, outPath) {
  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata('es-MX-JorgeNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(texto);
    return await new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(outPath);
      audioStream.pipe(writeStream);
      writeStream.on('finish', () => resolve(outPath));
      writeStream.on('error', reject);
      audioStream.on('error', reject);
    });
  } catch (errNode) {
    console.warn('⚠️ MsEdgeTTS Node falló, probando fallback Python:', errNode.message);
    return new Promise((resolve, reject) => {
      const isWindows = process.platform === 'win32';
      const cmd = isWindows ? 'py' : 'python3';
      const args = isWindows
        ? ['-3.14', '-m', 'edge_tts', '--voice', 'es-MX-JorgeNeural', '--text', texto, '--write-media', outPath]
        : ['-m', 'edge_tts', '--voice', 'es-MX-JorgeNeural', '--text', texto, '--write-media', outPath];

      execFile(cmd, args, (err) => {
        if (err) {
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

// Función para generar un stream de silencio PCM (48kHz, 16-bit, stereo)
// Discord REQUIERE que el bot envíe al menos un paquete de audio UDP
// para activar el enrutamiento de paquetes de voz de los usuarios hacia el bot.
function createSilenceStream(durationSeconds = 1) {
  const stream = new Readable();
  const frameSize = 960 * 4; // 20ms de audio PCM estéreo
  const silenceFrame = Buffer.alloc(frameSize);
  const totalFrames = Math.floor(durationSeconds * 50);
  let count = 0;
  stream._read = () => {
    if (count++ < totalFrames) {
      stream.push(silenceFrame);
    } else {
      stream.push(null);
    }
  };
  return stream;
}

function kickstartVoice() {
  try {
    const silenceResource = createAudioResource(createSilenceStream(1), {
      inputType: StreamType.Raw
    });
    player.play(silenceResource);
    console.log('📡 [Kickstart UDP] Frame de silencio enviado a Discord para habilitar recepción.');
  } catch (err) {
    console.warn('⚠️ Error enviando silencio kickstart:', err.message);
  }
}

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
    // Borrar temporal después de que termine de sonar
    setTimeout(() => {
      try { fs.unlinkSync(audioFile); } catch {}
    }, 25000);
  }
}

// ───────────────────────────────────────────────────────────────
// 8. ESCUCHA DE USUARIOS (Voz -> Texto -> IA -> Audio)
// ───────────────────────────────────────────────────────────────
const activeUsers = new Set();

function configurarEscucha(connection) {
  const receiver = connection.receiver;
  logEvent('👂 [Oído Activado] Configurando receptor de voz en el canal.');

  receiver.speaking.on('start', (userId) => {
    if (botHablando) return; // Anti-eco si Pepe está hablando
    if (userId === client.user.id) return; // No escucharse a sí mismo
    if (activeUsers.has(userId)) return; // Ya estamos grabando a este usuario
    activeUsers.add(userId);

    const user = client.users.cache.get(userId);
    const username = user?.displayName || user?.username || `Usuario_${userId.slice(-4)}`;

    logEvent(`🎤 [Voz detectada] ${username} empezó a hablar...`);

    const opusStream = receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.Manual
      }
    });

    const opusDecoder = new prism.opus.Decoder({
      rate: 48000,
      channels: 2,
      frameSize: 960
    });

    const pcmChunks = [];
    let silenceTimer = null;
    let maxTimer = null;
    let finalized = false;

    const finalizar = async (razon = 'silencio') => {
      if (finalized) return;
      finalized = true;

      if (silenceTimer) clearTimeout(silenceTimer);
      if (maxTimer) clearTimeout(maxTimer);
      activeUsers.delete(userId);

      try { opusStream.destroy(); } catch {}
      try { opusDecoder.destroy(); } catch {}

      if (botHablando) return;
      const totalPcm = Buffer.concat(pcmChunks);

      // Si el audio es menor a 0.4s (76800 bytes a 48kHz estéreo 16-bit), descartar ruido
      if (totalPcm.length < 76800) {
        logEvent(`🔇 [Audio corto de ${username}] Descartado (${totalPcm.length} bytes).`);
        return;
      }

      logEvent(`📦 [Grabación de ${username} completa por ${razon}]: ${(totalPcm.length / 192000).toFixed(1)}s de voz.`);

      const wavBuffer = createWavBuffer(totalPcm, 48000, 2);
      try {
        const texto = await transcribirConGroq(wavBuffer);
        if (!texto || texto.trim().length < 2) {
          logEvent(`🔇 [Whisper] No se detectó texto comprensible.`);
          return;
        }

        if (esAlucinacionWhisper(texto)) {
          logEvent(`🔇 [Whisper Filtro] Alucinación de fondo descartada: "${texto}"`);
          return;
        }

        logEvent(`👂 [${username} dijo]: "${texto}" (Modo continuo: ${modoCharlaContinua})`);

        const esParaPepe = texto.toLowerCase().includes('pepe');

        // Responder si el modo continuo está activo O si dijeron "pepe"
        if (modoCharlaContinua || esParaPepe) {
          logEvent(`🧠 [Pepe respondiendo a ${username}]...`);
          const respuesta = await responderConIA(texto, username);
          await reproducirEnCanal(respuesta);
        } else {
          logEvent(`ℹ️ [Ignorado] Modo continuo apagado y no dijeron 'Pepe'.`);
        }
      } catch (err) {
        logEvent(`⚠️ Error procesando voz: ${err.message}`);
      }
    };

    const resetSilence = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      // 1.1 segundos sin paquetes de audio -> usuario terminó de hablar
      silenceTimer = setTimeout(() => {
        finalizar('pausa de habla');
      }, 1100);
    };

    // Máximo 10 segundos por turno
    maxTimer = setTimeout(() => {
      finalizar('límite 10s');
    }, 10000);

    opusStream.on('error', (err) => {
      activeUsers.delete(userId);
    });

    opusDecoder.on('error', (err) => {
      // Ignorar fallos de frames aislados
    });

    opusStream.pipe(opusDecoder);

    opusDecoder.on('data', (chunk) => {
      pcmChunks.push(chunk);
      resetSilence();
    });

    opusDecoder.on('end', () => {
      finalizar('cierre de stream');
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

    connection.on(VoiceConnectionStatus.Ready, () => {
      logEvent(`✅ [Voz Activa] Pepe Rey asegurado en "${channel.name}". Racha y oído activos.`);
      configurarEscucha(connection);
      kickstartVoice();
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

  try {
    const testPath = path.join(CACHE_DIR, 'test_startup.mp3');
    await generarAudioJorge('Prueba de voz Jorge lista', testPath);
    try { fs.unlinkSync(testPath); } catch {}
    console.log('✅ [Voz de Jorge]: Lista y verificada en Node.js.');
  } catch (err) {
    console.error('⚠️ [Voz de Jorge]: Falla en auto-prueba:', err.message);
  }

  for (const [, guild] of client.guilds.cache) {
    try {
      await guild.commands.set(COMANDOS);
      console.log(`⚡ Comandos listos en: ${guild.name}`);

      const guardados = leerCanalesAFK();
      if (guardados.modoCharla !== undefined) {
        modoCharlaContinua = guardados.modoCharla;
      }
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
    guardarModoCharla(modoCharlaContinua);

    if (modoCharlaContinua) {
      reproducirEnCanal('Qué onda banda, modo charla continua activado. Platíquenme qué andan haciendo.');
    } else {
      reproducirEnCanal('Cámara gente, me pongo en modo tranquilo. Si me ocupan, nada más háblenme por mi nombre Pepe.');
    }

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
