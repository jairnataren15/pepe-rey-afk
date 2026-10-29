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
import ffmpegPath from 'ffmpeg-static';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import yts from 'yt-search';
import { Ytdl } from '@distube/ytdl-core';

if (ffmpegPath) {
  process.env.FFMPEG_PATH = ffmpegPath;
}

import {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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
const CANAL_MUSICA_ID = process.env.CANAL_MUSICA_ID?.trim() || '1310712749709459516';
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

    logEvent(`💬 [IA generó respuesta]: "${respuesta}"`);

    historial.push({ role: 'assistant', content: respuesta });
    if (historial.length > 8) historial.shift();

    return respuesta;
  } catch (err) {
    logEvent(`❌ Error llamando a Groq: ${err.message}`);
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
// 7. SISTEMA DE AUDIO (Voz de Pepe + Música de YouTube + Volumen)
// ───────────────────────────────────────────────────────────────
const ytdl = new Ytdl();
let volumenMusica = 0.5; // 50% por defecto (0.05 a 1.0)
let cancionActual = null; // { title, url, timestamp, author }
let recursoMusica = null; // AudioResource con inlineVolume
let opcionesMusica = []; // Top 3 opciones encontradas
let esperandoSeleccion = false;
let timeoutSeleccion = null;
let modoAntesDeMusica = true; // Para restaurar modo charla continua al terminar la canción

// Reproductor exclusivo para la voz de Pepe
const voicePlayer = createAudioPlayer({
  behaviors: { noSubscriber: NoSubscriberBehavior.Play }
});

// Reproductor exclusivo para la música de YouTube
const musicPlayer = createAudioPlayer({
  behaviors: { noSubscriber: NoSubscriberBehavior.Play }
});

voicePlayer.on(AudioPlayerStatus.Idle, () => {
  botHablando = false;
});
voicePlayer.on('error', (err) => {
  logEvent(`⚠️ [VoicePlayer Error]: ${err.message}`);
  botHablando = false;
});

musicPlayer.on(AudioPlayerStatus.Playing, () => {
  logEvent(`🎶 [MusicPlayer] Tocando "${cancionActual?.title || 'Canción'}" al ${Math.round(volumenMusica * 100)}% de volumen`);
});

musicPlayer.on(AudioPlayerStatus.Idle, () => {
  logEvent('⏹️ [MusicPlayer] Canción terminada.');
  cancionActual = null;
  recursoMusica = null;

  // Restaurar automáticamente el modo charla continua cuando termine la música
  if (modoAntesDeMusica) {
    modoCharlaContinua = true;
    logEvent('🟢 [Música Terminada]: Modo charla continua restaurado automáticamente.');
  }
});

musicPlayer.on('error', (err) => {
  logEvent(`⚠️ [MusicPlayer Error]: ${err.message}`);
  cancionActual = null;
  recursoMusica = null;

  if (modoAntesDeMusica) {
    modoCharlaContinua = true;
    logEvent('🟢 [Música Terminada tras error]: Modo charla continua restaurado.');
  }
});

function limpiarTituloParaVoz(titulo) {
  return (titulo || '')
    .replace(/\s*[\(\[][^\)\]]*(official|video|audio|letra|lyrics|4k|hd|remix|ft\.|feat\.|records)[^\)\]]*[\)\]]/gi, '')
    .replace(/[|#_]/g, '')
    .replace(/\s*-\s*-/g, ' -')
    .replace(/\s*-\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function ajustarVolumen(nuevoNivel) {
  volumenMusica = Math.max(0.05, Math.min(1.0, nuevoNivel));
  if (recursoMusica?.volume) {
    recursoMusica.volume.setVolume(volumenMusica);
  }
  const pct = Math.round(volumenMusica * 100);
  logEvent(`🔊 [Volumen ajustado a]: ${pct}%`);
  return pct;
}

// Extrae el enlace HTTPS directo de audio con yt-dlp
function obtenerUrlConYtDlp(videoUrl) {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32';
    const cmd = isWindows ? 'py' : 'python3';
    const args = isWindows
      ? ['-3.14', '-m', 'yt_dlp', '-g', '-f', 'bestaudio', videoUrl]
      : ['-m', 'yt_dlp', '-g', '-f', 'bestaudio', videoUrl];

    execFile(cmd, args, { timeout: 15000 }, (err, stdout) => {
      if (err) {
        execFile('yt-dlp', ['-g', '-f', 'bestaudio', videoUrl], { timeout: 15000 }, (err2, stdout2) => {
          if (err2) reject(err2);
          else resolve(stdout2.trim());
        });
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

// Reproduce la voz de Pepe con Pause & Swap si hay música sonando
async function reproducirVozPepe(texto) {
  if (!texto) return;
  botHablando = true;

  const audioFile = path.join(CACHE_DIR, `pepe_${Date.now()}.mp3`);
  try {
    const hayMusica = musicPlayer.state.status === AudioPlayerStatus.Playing;
    if (hayMusica) {
      musicPlayer.pause();
    }

    logEvent(`⏳ [TTS] Sintetizando voz de Jorge: "${texto}"`);
    await generarAudioJorge(texto, audioFile);
    const resource = createAudioResource(fs.createReadStream(audioFile), {
      inputType: StreamType.Arbitrary
    });

    if (conexionActual) {
      conexionActual.subscribe(voicePlayer);
    }
    voicePlayer.play(resource);
    logEvent(`🎙️ [Pepe hablando]: "${texto}"`);

    // Esperar a que Pepe termine su intervención
    await new Promise((resolve) => {
      const finish = () => {
        voicePlayer.off(AudioPlayerStatus.Idle, finish);
        voicePlayer.off('error', finish);
        resolve();
      };
      voicePlayer.on(AudioPlayerStatus.Idle, finish);
      voicePlayer.on('error', finish);
    });

    // Si había música sonando previamente, restaurar suscripción y despausar
    if (hayMusica && conexionActual && cancionActual) {
      conexionActual.subscribe(musicPlayer);
      musicPlayer.unpause();
      logEvent('▶️ [Música reanudada tras voz de Pepe]');
    }
  } catch (err) {
    logEvent(`❌ Error en voz de Pepe: ${err.message}`);
  } finally {
    botHablando = false;
    setTimeout(() => {
      try { fs.unlinkSync(audioFile); } catch {}
    }, 25000);
  }
}

const reproducirEnCanal = reproducirVozPepe;

async function buscarYDarOpciones(query, canalTexto = null) {
  try {
    logEvent(`🔍 [Buscando en YouTube]: "${query}"`);
    const r = await yts(query);
    const videos = (r.videos || []).slice(0, 3);

    if (videos.length === 0) {
      await reproducirVozPepe(`No encontré ninguna rola de ${query} en YouTube carnal.`);
      return;
    }

    opcionesMusica = videos.map(v => ({
      title: v.title,
      url: v.url,
      timestamp: v.timestamp,
      author: v.author?.name || 'YouTube'
    }));
    esperandoSeleccion = true;

    // Timeout de 60 segundos para responder
    if (timeoutSeleccion) clearTimeout(timeoutSeleccion);
    timeoutSeleccion = setTimeout(() => {
      if (esperandoSeleccion) {
        esperandoSeleccion = false;
        opcionesMusica = [];
        logEvent('⏱️ [Tiempo agotado para selección de música]');
      }
    }, 60000);

    const t1 = limpiarTituloParaVoz(opcionesMusica[0].title);
    const t2 = opcionesMusica[1] ? limpiarTituloParaVoz(opcionesMusica[1].title) : null;
    const t3 = opcionesMusica[2] ? limpiarTituloParaVoz(opcionesMusica[2].title) : null;

    let mensajeVoz = `Encontré estas rolas carnal: la 1 es ${t1}`;
    if (t2) mensajeVoz += `, la 2 es ${t2}`;
    if (t3) mensajeVoz += `, y la 3 es ${t3}`;
    mensajeVoz += '. ¿Cuál ponemos? Dime la 1, la 2 o la 3.';

    // Enviar tarjeta interactiva siempre al canal de música designado (1310712749709459516)
    const targetCanal = client.channels.cache.get(CANAL_MUSICA_ID) || canalTexto;
    if (targetCanal && targetCanal.isTextBased()) {
      try {
        const embed = new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle(`🎵 Resultados de búsqueda: "${query}"`)
          .setDescription(
            opcionesMusica.map((v, i) => `**${i + 1}.** [${v.title}](${v.url}) \`[${v.timestamp}]\``).join('\n\n') +
            '\n\n🗣️ *Dí por voz **"Pepe, pon la 1"**, **"la 2"**, **"la 3"** o pulsa un botón:*'
          )
          .setFooter({ text: 'Pepe Rey Del Noxz · YouTube DJ' });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('musica_sel_0').setLabel('1️⃣ Opción 1').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('musica_sel_1').setLabel('2️⃣ Opción 2').setStyle(ButtonStyle.Primary).setDisabled(!opcionesMusica[1]),
          new ButtonBuilder().setCustomId('musica_sel_2').setLabel('3️⃣ Opción 3').setStyle(ButtonStyle.Primary).setDisabled(!opcionesMusica[2]),
          new ButtonBuilder().setCustomId('musica_cancel').setLabel('❌ Cancelar').setStyle(ButtonStyle.Secondary)
        );

        await targetCanal.send({ embeds: [embed], components: [row] });
      } catch (err) {
        logEvent(`⚠️ Error enviando embed al canal ${CANAL_MUSICA_ID}: ${err.message}`);
      }
    }

    await reproducirVozPepe(mensajeVoz);
  } catch (err) {
    logEvent(`❌ Error buscando música: ${err.message}`);
    await reproducirVozPepe('Se me trabó el YouTube compa, repíteme qué rola querías.');
  }
}

async function reproducirCancion(videoInfo) {
  if (!videoInfo) return;
  esperandoSeleccion = false;
  if (timeoutSeleccion) clearTimeout(timeoutSeleccion);

  // Al poner música: pausar modo escucha libre y cambiar a solo mención de "Pepe"
  if (modoCharlaContinua) {
    modoAntesDeMusica = true;
    modoCharlaContinua = false;
    logEvent('🔒 [Música Activa]: Cambiando automáticamente a modo mención (solo responde si dicen Pepe).');
  }

  try {
    cancionActual = videoInfo;
    const tituloLimpio = limpiarTituloParaVoz(videoInfo.title);
    logEvent(`🎵 [Cargando audio]: "${videoInfo.title}" [${videoInfo.timestamp}]`);

    await reproducirVozPepe(`Sobres, poniendo ${tituloLimpio}. ¡Súbanle al desmadre!`);

    let streamOrUrl = null;
    try {
      streamOrUrl = await obtenerUrlConYtDlp(videoInfo.url);
      logEvent('📡 [Audio YouTube]: Enlace directo obtenido exitosamente con yt-dlp');
    } catch (eYt) {
      logEvent(`⚠️ yt-dlp falló, probando ytdl interno: ${eYt.message}`);
      streamOrUrl = ytdl.download(videoInfo.url, {
        filter: { hasAudio: true, hasVideo: false },
        quality: 'highestaudio'
      });
    }

    recursoMusica = createAudioResource(streamOrUrl, {
      inputType: StreamType.Arbitrary,
      inlineVolume: true
    });
    recursoMusica.volume.setVolume(volumenMusica);

    if (conexionActual) {
      conexionActual.subscribe(musicPlayer);
    }
    musicPlayer.play(recursoMusica);
    logEvent(`▶️ [Reproduciendo]: "${videoInfo.title}" al ${Math.round(volumenMusica * 100)}% de volumen`);
  } catch (err) {
    logEvent(`❌ Error reproduciendo audio de YouTube: ${err.message}`);
    await reproducirVozPepe('No se pudo jalar esa rola carnal, YouTube no quiso soltar el audio.');
  }
}

function detenerMusica() {
  cancionActual = null;
  recursoMusica = null;
  esperandoSeleccion = false;
  if (timeoutSeleccion) clearTimeout(timeoutSeleccion);
  musicPlayer.stop();

  if (modoAntesDeMusica) {
    modoCharlaContinua = true;
    logEvent('🟢 [Música Detenida]: Modo charla continua restaurado.');
  }
}

function createSilenceStream(durationSeconds = 1) {
  const stream = new Readable();
  const frameSize = 960 * 4;
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
    voicePlayer.play(silenceResource);
    logEvent('📡 [Kickstart UDP] Frame de silencio enviado a Discord para habilitar recepción.');
  } catch (err) {
    console.warn('⚠️ Error enviando silencio kickstart:', err.message);
  }
}

function parseComandoVoz(texto) {
  const t = (texto || '').toLowerCase().replace(/[¿?¡!.,;:\"']/g, '').trim();

  // Si estábamos esperando selección de canción
  if (esperandoSeleccion) {
    if (/\b(1|uno|primera|primer|opci[oó]n 1)\b/i.test(t)) return { type: 'SELECCION', idx: 0 };
    if (/\b(2|dos|segunda|segundo|opci[oó]n 2)\b/i.test(t)) return { type: 'SELECCION', idx: 1 };
    if (/\b(3|tres|tercera|tercer|opci[oó]n 3)\b/i.test(t)) return { type: 'SELECCION', idx: 2 };
    if (/\b(cancela|cancelar|ninguna|olv[ií]dalo|no|ya no)\b/i.test(t)) return { type: 'CANCELAR_SELECCION' };
  }

  // Volumen
  if (/(sube|s[uú]bele|aumenta|m[aá]s)\s*(al|el)?\s*volumen/i.test(t) || /volumen\s*m[aá]s\s*alto/i.test(t)) {
    return { type: 'VOLUMEN_SUBIR' };
  }
  if (/(baja|b[aá]jale|disminuye|menos)\s*(al|el)?\s*volumen/i.test(t) || /volumen\s*m[aá]s\s*bajo/i.test(t)) {
    return { type: 'VOLUMEN_BAJAR' };
  }
  const mVol = t.match(/volumen\s*(?:al|a)?\s*(\d{1,3})/i);
  if (mVol) {
    return { type: 'VOLUMEN_SET', val: parseInt(mVol[1], 10) };
  }

  // Control de reproducción
  if (/(para|det[eé]n|quita|apaga|stop)\s*(?:la)?\s*(?:m[uú]sica|canci[oó]n|rola)/i.test(t)) {
    return { type: 'MUSICA_STOP' };
  }
  if (/(pausa|pa[uú]sale)\s*(?:la)?\s*(?:m[uú]sica|canci[oó]n|rola)?/i.test(t)) {
    return { type: 'MUSICA_PAUSE' };
  }
  if (/(despausa|reanuda|sigue|dale\s+play)/i.test(t)) {
    return { type: 'MUSICA_RESUME' };
  }

  // Búsqueda de canciones
  const mSearch = t.match(/(?:pepe\s+)?(?:pon|busca|reproduce|toca|c[oó]loca)\s+(?:esta\s+m[uú]sica\s+|esta\s+canci[oó]n\s+|esta\s+rola\s+|una\s+canci[oó]n\s+|una\s+rola\s+|una\s+m[uú]sica\s+|la\s+canci[oó]n\s+|la\s+rola\s+|la\s+m[uú]sica\s+|m[uú]sica\s+|canci[oó]n\s+|rola\s+)?(?:de\s+)?(.+)/i);
  if (mSearch) {
    const q = mSearch[1].replace(/^(?:de|la|el|una|un)\s+/i, '').trim();
    if (q.length > 1 && !/^(?:atenci[oó]n|las pilas|modo|mute|pepe|on|off)$/i.test(q)) {
      return { type: 'BUSCAR_MUSICA', query: q };
    }
  }

  return { type: 'CHARLA' };
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

        const cmd = parseComandoVoz(texto);
        if (cmd.type !== 'CHARLA') {
          logEvent(`🎯 [Comando de Música/Volumen]: Tipo = ${cmd.type}`);
        }

        if (cmd.type === 'SELECCION') {
          const video = opcionesMusica[cmd.idx];
          if (video) {
            await reproducirCancion(video);
          } else {
            await reproducirVozPepe(`No hay opción ${cmd.idx + 1} carnal, elige entre las opciones que te di.`);
          }
          return;
        }

        if (cmd.type === 'CANCELAR_SELECCION') {
          esperandoSeleccion = false;
          opcionesMusica = [];
          await reproducirVozPepe('Sobres compa, búsqueda cancelada.');
          return;
        }

        if (cmd.type === 'VOLUMEN_SUBIR') {
          const pct = ajustarVolumen(volumenMusica + 0.2);
          await reproducirVozPepe(`Sobres, le subí al volumen a ${pct}%.`);
          return;
        }

        if (cmd.type === 'VOLUMEN_BAJAR') {
          const pct = ajustarVolumen(volumenMusica - 0.2);
          await reproducirVozPepe(`Ya le bajé al volumen a ${pct}%.`);
          return;
        }

        if (cmd.type === 'VOLUMEN_SET') {
          const pct = ajustarVolumen(cmd.val / 100);
          await reproducirVozPepe(`Cámara, volumen al ${pct}%.`);
          return;
        }

        if (cmd.type === 'MUSICA_STOP') {
          detenerMusica();
          await reproducirVozPepe('Ya quité la música compas.');
          return;
        }

        if (cmd.type === 'MUSICA_PAUSE') {
          musicPlayer.pause();
          await reproducirVozPepe('Música pausada, carnal.');
          return;
        }

        if (cmd.type === 'MUSICA_RESUME') {
          if (cancionActual) {
            if (conexionActual) conexionActual.subscribe(musicPlayer);
            musicPlayer.unpause();
            await reproducirVozPepe('Seguimos con el cotorreo.');
          } else {
            await reproducirVozPepe('No hay ninguna rola pausada carnal, dime cuál ponemos.');
          }
          return;
        }

        if (cmd.type === 'BUSCAR_MUSICA') {
          const canalTexto = client.channels.cache.get(CANAL_MUSICA_ID) || client.guilds.cache.get(PREF_GUILD)?.channels.cache.get(CANAL_MUSICA_ID);
          await buscarYDarOpciones(cmd.query, canalTexto);
          return;
        }

        const esParaPepe = texto.toLowerCase().includes('pepe');

        // Responder si el modo continuo está activo O si dijeron "pepe"
        if (modoCharlaContinua || esParaPepe) {
          logEvent(`🧠 [Pepe respondiendo a ${username}]...`);
          const respuesta = await responderConIA(texto, username);
          await reproducirVozPepe(respuesta);
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
    connection.subscribe(voicePlayer);

    connection.on(VoiceConnectionStatus.Ready, () => {
      logEvent(`✅ [Voz Activa] Pepe Rey asegurado en "${channel.name}". Racha y oído activos.`);
      connection.subscribe(voicePlayer);
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
    .setName('musica')
    .setDescription('Controla la música de YouTube de Pepe Rey')
    .addSubcommand(sub =>
      sub.setName('buscar')
        .setDescription('Busca canciones en YouTube y da 3 opciones')
        .addStringOption(opt => opt.setName('cancion').setDescription('Nombre de la canción o artista').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('volumen')
        .setDescription('Ajusta el volumen de la música (1 a 100%)')
        .addIntegerOption(opt => opt.setName('nivel').setDescription('Nivel de 1 a 100').setRequired(true).setMinValue(1).setMaxValue(100))
    )
    .addSubcommand(sub =>
      sub.setName('parar')
        .setDescription('Detiene la música por completo')
    )
    .addSubcommand(sub =>
      sub.setName('pausar')
        .setDescription('Pausa la música actual')
    )
    .addSubcommand(sub =>
      sub.setName('reanudar')
        .setDescription('Reanuda la música pausada')
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
  // Manejo de botones de selección de música
  if (interaction.isButton()) {
    if (interaction.customId.startsWith('musica_sel_')) {
      const idx = parseInt(interaction.customId.replace('musica_sel_', ''), 10);
      const video = opcionesMusica[idx];
      if (video) {
        await interaction.reply({ content: `🎶 Seleccionaste la opción ${idx + 1}: **${video.title}**`, ephemeral: true });
        await reproducirCancion(video);
      } else {
        await interaction.reply({ content: '❌ Esa opción ya expiró o no está disponible.', ephemeral: true });
      }
      return;
    }
    if (interaction.customId === 'musica_cancel') {
      esperandoSeleccion = false;
      opcionesMusica = [];
      await interaction.reply({ content: '❌ Búsqueda de música cancelada.', ephemeral: true });
      return;
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'pepe') {
    const modo = interaction.options.getString('modo');
    modoCharlaContinua = (modo === 'on');
    guardarModoCharla(modoCharlaContinua);

    if (modoCharlaContinua) {
      reproducirVozPepe('Qué onda banda, modo charla continua activado. Platíquenme qué andan haciendo.');
    } else {
      reproducirVozPepe('Cámara gente, me pongo en modo tranquilo. Si me ocupan, nada más háblenme por mi nombre Pepe.');
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

  if (interaction.commandName === 'musica') {
    const sub = interaction.options.getSubcommand();

    if (sub === 'buscar') {
      const q = interaction.options.getString('cancion');
      await interaction.reply({ content: `🔍 Buscando **"${q}"** en YouTube...`, ephemeral: true });
      const targetCanal = client.channels.cache.get(CANAL_MUSICA_ID) || interaction.channel;
      await buscarYDarOpciones(q, targetCanal);
      return;
    }

    if (sub === 'volumen') {
      const nivel = interaction.options.getInteger('nivel');
      const pct = ajustarVolumen(nivel / 100);
      await reproducirVozPepe(`Cámara, volumen al ${pct}%.`);
      return interaction.reply({ content: `🔊 Volumen ajustado a **${pct}%**.`, ephemeral: true });
    }

    if (sub === 'parar') {
      detenerMusica();
      await reproducirVozPepe('Ya quité la música compas.');
      return interaction.reply({ content: '⏹️ Música detenida.', ephemeral: true });
    }

    if (sub === 'pausar') {
      musicPlayer.pause();
      await reproducirVozPepe('Música pausada, carnal.');
      return interaction.reply({ content: '⏸️ Música pausada.', ephemeral: true });
    }

    if (sub === 'reanudar') {
      if (cancionActual) {
        if (conexionActual) conexionActual.subscribe(musicPlayer);
        musicPlayer.unpause();
        await reproducirVozPepe('Seguimos con el cotorreo.');
        return interaction.reply({ content: `▶️ Reanudando: **${cancionActual.title}**`, ephemeral: true });
      } else {
        return interaction.reply({ content: '❌ No hay ninguna canción en pausa.', ephemeral: true });
      }
    }
  }

  if (interaction.commandName === 'decir') {
    const texto = interaction.options.getString('texto');
    await interaction.deferReply();

    const respuesta = await responderConIA(texto, interaction.user.displayName || interaction.user.username);
    await reproducirVozPepe(respuesta);

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
        { name: '🎵 Canción Actual', value: cancionActual ? `[${cancionActual.title}](${cancionActual.url}) \`[${cancionActual.timestamp}]\`` : 'Ninguna', inline: false },
        { name: '🔊 Volumen Música', value: `${Math.round(volumenMusica * 100)}%`, inline: true },
        { name: '🧠 Memoria RAM', value: `${memMb} MB`, inline: true },
        { name: '⚡ Ping', value: `${client.ws.ping} ms`, inline: true }
      )
      .setFooter({ text: 'Pepe Rey · Cuidando racha, DJ y platicando 24/7' });

    return interaction.reply({ embeds: [embed] });
  }
});

client.login(TOKEN);
