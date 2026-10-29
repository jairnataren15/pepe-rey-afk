// ───────────────────────────────────────────────────────────────
// PEPE REY DEL NOXZ · Bot de Voz 24/7 Conversacional (Groq + Jorge)
// ───────────────────────────────────────────────────────────────
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Readable, PassThrough } from 'node:stream';
import { execFile, spawn } from 'node:child_process';
import dotenv from 'dotenv';
import prism from 'prism-media';
import ffmpegPath from 'ffmpeg-static';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import yts from 'yt-search';
import { Ytdl } from '@distube/ytdl-core';
import play from 'play-dl';
import { ytmp3 } from '@vreden/youtube_scraper';
import { asegurarYtDlp } from './install-ytdlp.js';

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
const OPENAI_KEY = process.env.OPENAI_API_KEY?.trim();
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
const SYSTEM_PROMPT = `Eres Pepe Rey Del Noxz, el compa más mamoncillo, troll, carrilludo y cagón de la legión Noxz en Aion 2. Estás en canal de voz en Discord cotorreando con tus compas mientras juegan.

TU HISTORIA, APARIENCIA Y STATS EN AION 2 (LORE OFICIAL):
- Tu foto de perfil y apariencia física es Epstein en modo GigaChad (con suéter negro "JFE" y mandíbula cuadrada tallada con cincel). Eres el DIOS DEL MEWING y del looksmaxxing; cuando te pregunten por tu foto de perfil, tu cara o tu aspecto, presume que eres Epstein GigaChad tirando rostro y haciendo mewing mientras farmeas mancos.
- Eres orgullosamente ASMODIANO de corazón y miembro élite de la legión NOXZ en el servidor NA Oeste - Israphel (Israfael).
- Eres el MEJOR GLADIADOR de todo Aion 2 y el rey indiscutible del PvP.
- Tienes 4,200 de GS (Gear Score) y 300,000 de CP (Combat Power), armadísimo hasta los dientes.
- Le partes su madre a diario a todos los de las legiones "Boba", "Cat Cafe" y "Divine Army", que son tus hijos en el servidor.
- En el Abismo (Abyss) siempre te partes de frente a QD Panda (que siempre corre o palma contra ti en el abismo) y a AceGG EZ (que como su nombre dice, es puro EZ y te dura dos espadazos).
- Los Elyos te la pelan completita, y te farmeas como conos a todos los asesinos y hechiceros mancos del servidor que intentan gankearte.

PERSONALIDAD Y TONO:
- Tienes humor negro gamer, sarcasmo fino y carrilla pesada de compas. Te encanta presumir tu Gladiador de 4200 GS y 300k de CP, tu mandíbula de Epstein GigaChad Dios del Mewing, y burlarte de los fails, de los mancos de Boba, Cat Cafe, Divine Army, QD Panda y AceGG EZ.
- Les dices mancos, conos con patas, muertos de hambre, manquísimos, mancuernas, que desinstalen el juego o que vendan la PC si la riegan.
- Cero sermones morales y cero respuestas de robot amable o corporativo.
- Conoces todo de Aion 2 (Gladiador, Templario, Asesino, Ranger, Hechicero, Invocador, Clérigo, Cantor; estigmas, Daevanion, PvP, abyss, manastones, pulls, wipes).
- Hablas con jerga mexicana callejera y natural de Discord (wey, no mames, cállate el hocico, qué manco eres, no seas payaso, qué pedo, chelas, al chile, te faltan manos, qué mamada, ni pa estorbar sirves).

REGLA DE MÚSICA (SOLO PARA CANCIONES/ARTISTAS):
Si el usuario pide EXPLÍCITAMENTE que pongas, reproduzcas o toques una CANCIÓN, ROLA, MÚSICA o ARTISTA (ej: "ponte la de...", "pon música de...", "toca algo de...", "ponte wifey", "suéltate una de aria bela"):
NO RESPONDAS NADA CONVERSACIONAL. Tu respuesta DEBE ser ÚNICAMENTE:
[BUSCAR_MUSICA: <nombre_de_la_canción_o_artista>]
PROHIBIDO usar [BUSCAR_MUSICA] si el usuario menciona "Google", "internet", "web", o si solo te está haciendo una pregunta o pidiendo que investigues un dato.

REGLA DE BÚSQUEDA EN GOOGLE / INTERNET:
Si el usuario te pide buscar algo específico en Google o internet, o te pregunta un dato real, noticia, precio, fecha, quién es alguien o qué es algo que requiera buscar en la web (ej: "busca en Google quién ganó...", "investiga cuánto cuesta...", "búscame en internet qué es..."):
Tu respuesta DEBE ser ÚNICAMENTE:
[BUSCAR_WEB: <consulta_exacta_para_buscar_en_google>]
(Nota: Si el usuario solo te pregunta "¿me vas a buscar algo en Google o no?" sin decirte qué tema buscar, respóndele con tu actitud mamona que sí tienes internet hasta en el Abismo y que te diga qué chingados quiere que le busques).

REGLAS DE RESPUESTA DE CHARLA:
1. Máximo 1 o 2 oraciones cortas, directas y con remate cómico mamón (se reproduce en voz alta por TTS en el canal).
2. Sé afilado, variado y espontáneo. Cero respuestas de robot amable.
3. NUNCA uses viñetas, negritas ni asteriscos.`;

const historial = []; // últimos mensajes en memoria
let modoCharlaContinua = false; // Modo OFF por defecto (solo responde si dicen 'pepe' o comandos para no molestar)
let botHablando = false; // anti-eco

// Filtro de alucinaciones típicas que Whisper genera cuando hay silencio o estática
const FANTASMAS_WHISPER = [
  'gracias', 'muchas gracias', 'de nada', 'subtítulos', 'subtitulos',
  'amara.org', 'suscríbete', 'suscribete', 'bye', 'thank you', 'you',
  'chau', 'adiós', 'adios'
];

function esAlucinacionWhisper(texto) {
  const t = (texto || '').toLowerCase();
  if (/subt[ií]tulos/i.test(t) || /amara\.org/i.test(t) || /suscr[ií]bete/i.test(t) || /pr[oó]ximo\s+video/i.test(t) || /hasta\s+la\s+pr[oó]xima/i.test(t) || /un\s+saludo/i.test(t)) {
    return true;
  }
  const limpio = t.replace(/[^a-záéíóúñ]/g, '').trim();
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
// 4. TRANSCRIPCIÓN CON GROQ WHISPER (Con Fallback Turbo -> V3 y Anti-429)
// ───────────────────────────────────────────────────────────────
let bloqueoWhisperHasta = 0;

async function enviarAWhisper(wavBuffer, modelName = 'whisper-large-v3-turbo') {
  const boundary = '----PepeFormBoundary' + crypto.randomBytes(8).toString('hex');
  const body = [];

  body.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.wav"\r\nContent-Type: audio/wav\r\n\r\n`));
  body.push(wavBuffer);
  body.push(Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${modelName}\r\n`));
  body.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nes\r\n`));
  body.push(Buffer.from(`--${boundary}--\r\n`));

  const payload = Buffer.concat(body);

  return await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_KEY}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'User-Agent': 'Mozilla/5.0'
    },
    body: payload
  });
}

async function transcribirConGroq(wavBuffer) {
  if (!GROQ_KEY) return null;

  // Si estamos en pausa por Rate Limit (429), esperar para no saturar
  if (Date.now() < bloqueoWhisperHasta) {
    return null;
  }

  // 1. Intentar con whisper-large-v3-turbo
  let res = await enviarAWhisper(wavBuffer, 'whisper-large-v3-turbo');

  // 2. Si da 429 (límite de 20 RPM de Turbo), alternar inmediatamente a whisper-large-v3 (bucket separado de 20 RPM)
  if (res.status === 429) {
    logEvent('⚠️ [Whisper Turbo 429]: Alternando a whisper-large-v3...');
    res = await enviarAWhisper(wavBuffer, 'whisper-large-v3');
  }

  if (res.status === 429) {
    bloqueoWhisperHasta = Date.now() + 3500;
    logEvent('⏳ [Whisper 429]: Límite de 20 RPM alcanzado en ambos modelos, enfriando 3.5s.');
    return null;
  }

  if (!res.ok) {
    const errText = await res.text();
    console.warn('⚠️ Error en Groq Whisper:', res.status, errText);
    return null;
  }

  const json = await res.json();
  return json.text?.trim() || null;
}

// Enrutador de transcripción: si hay clave de OpenAI usa whisper-1 oficial (sin límite 20 RPM), sino Groq
async function transcribirAudio(wavBuffer) {
  if (OPENAI_KEY) {
    try {
      const boundary = '----PepeFormBoundary' + crypto.randomBytes(8).toString('hex');
      const body = [];
      body.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.wav"\r\nContent-Type: audio/wav\r\n\r\n`));
      body.push(wavBuffer);
      body.push(Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n`));
      body.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nes\r\n`));
      body.push(Buffer.from(`--${boundary}--\r\n`));

      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_KEY}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'User-Agent': 'Mozilla/5.0'
        },
        body: Buffer.concat(body)
      });

      if (res.ok) {
        const json = await res.json();
        if (json.text?.trim()) return json.text.trim();
      } else {
        const err = await res.text();
        console.warn('⚠️ OpenAI Whisper error:', res.status, err);
      }
    } catch (e) {
      console.warn('⚠️ Fallo en OpenAI Whisper, pasando a Groq:', e.message);
    }
  }

  return await transcribirConGroq(wavBuffer);
}

// ───────────────────────────────────────────────────────────────
// 5. CEREBRO IA (OpenAI GPT-4o-mini o Groq) & FILTRADO INTELIGENTE
// ───────────────────────────────────────────────────────────────
function limpiarQueryBusqueda(texto) {
  let q = (texto || '').toLowerCase()
    .replace(/[¿?¡!.,;:\"'()[\]]/g, ' ')
    // Corrección fonética de Whisper para nombres y canciones frecuentes
    .replace(/\b(?:waifi|wifi|güaifi|guaifi)\b/gi, 'wifey')
    .replace(/\b(?:aribela|arivela|aria bella|ariveya|aribella)\b/gi, 'aria bela')
    .replace(/\b(?:pilate|pilats|pirates)\b/gi, 'pilates')
    // Eliminar muletillas y llamadas al bot
    .replace(/\b(?:pepe|oye|hey|favor|porfa|por\s*favor|carnal|paro|wey|güey|mano)\b/gi, ' ')
    // Eliminar verbos de búsqueda o reproducción
    .replace(/\b(?:pon(?:te|me|nos)?|busca(?:te|me)?|reproduce|toca(?:te)?|su[eé]lta(?:te)?|avienta(?:te)?|m[eé]tele|canta(?:te)?|c[oó]loca|suena)\b/gi, ' ')
    // Eliminar sustantivos de música
    .replace(/\b(?:m[uú]sica|canci[oó]n|canciones|rolas?|temas?|pista|video|audio)\b/gi, ' ')
    // Eliminar preposiciones y artículos
    .replace(/\b(?:de|la|el|las|los|un|una|unos|unas|algo|que|esta|este|ese|esa|para|en)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return q;
}

async function buscarEnInternet(consulta) {
  const q = (consulta || '').trim();
  if (!q) return 'No se especificó qué buscar.';
  logEvent(`🌐 [Buscando en Google/Web]: "${q}"`);

  const fragmentos = [];

  // 1. Búsqueda web en tiempo real (DuckDuckGo HTML)
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8'
      }
    });
    if (res.ok) {
      const html = await res.text();
      const snippets = [...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi)]
        .map(m => m[1]
          .replace(/<[^>]+>/g, '')
          .replace(/&quot;/g, '"')
          .replace(/&#x27;/g, "'")
          .replace(/&amp;/g, '&')
          .replace(/\s+/g, ' ')
          .trim()
        )
        .filter(Boolean)
        .slice(0, 4);
      fragmentos.push(...snippets);
    }
  } catch (err) {
    logEvent(`⚠️ [Web Search Warning]: ${err.message}`);
  }

  // 2. Respaldo / complemento en Wikipedia Español si hay pocos resultados
  if (fragmentos.length < 2) {
    try {
      const wikiUrl = `https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&utf8=&format=json&srlimit=3`;
      const resW = await fetch(wikiUrl, { headers: { 'User-Agent': 'PepeReyBot/1.0' } });
      if (resW.ok) {
        const dataW = await resW.json();
        const items = dataW?.query?.search || [];
        for (const it of items) {
          const limpio = (it.snippet || '').replace(/<[^>]+>/g, '').trim();
          if (limpio) fragmentos.push(`${it.title}: ${limpio}`);
        }
      }
    } catch {}
  }

  if (fragmentos.length === 0) {
    return 'No salieron resultados claros en internet para esa búsqueda.';
  }

  logEvent(`✅ [Resultados Web encontrados]: ${fragmentos.length} fragmentos.`);
  return fragmentos.join('\n- ');
}

async function llamarChatCompletion(messages) {
  if (OPENAI_KEY) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_KEY}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages,
          max_tokens: 130,
          temperature: 0.85
        })
      });
      if (res.ok) {
        const data = await res.json();
        return { text: data.choices?.[0]?.message?.content?.trim(), provider: 'OpenAI GPT-4o-Mini' };
      } else {
        console.warn('⚠️ Error en OpenAI Chat:', res.status, await res.text());
      }
    } catch (eOai) {
      console.warn('⚠️ Falló OpenAI, usando Groq:', eOai.message);
    }
  }

  if (!GROQ_KEY) return { text: 'No tengo configurada mi clave de IA carnal.', provider: 'Sistema' };

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
    return { text: 'Me trabé tantito con la chela, repíteme eso.', provider: 'Sistema' };
  }

  const data = await res.json();
  return { text: data.choices?.[0]?.message?.content?.trim(), provider: 'Groq' };
}

async function responderConIA(mensajeUsuario, nombreUsuario = 'Compa') {
  historial.push({ role: 'user', content: `${nombreUsuario}: ${mensajeUsuario}` });
  if (historial.length > 8) historial.shift();

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...historial
  ];

  try {
    const { text: raw, provider } = await llamarChatCompletion(messages);
    if (!raw || raw.length < 2) {
      return 'No te alcancé a escuchar bien carnal, ¿qué decías?';
    }

    // 1. ¿La IA detectó intención de MÚSICA?
    if (raw.includes('[BUSCAR_MUSICA:') || /BUSCAR_MUSICA:\s*/i.test(raw)) {
      const m = raw.match(/(?:\[)?BUSCAR_MUSICA:\s*(.+?)(?:\]|$)/i);
      const cancion = m ? m[1].trim() : raw.replace(/\[?BUSCAR_MUSICA:\s*/i, '').replace(/\]/g, '').trim();
      const queryLimpia = limpiarQueryBusqueda(cancion);

      // Evitar falsos positivos si la query es "google", "internet", "algo", etc.
      if (!/^(?:google|internet|web|algo|nada|eso|informaci[oó]n)$/i.test(queryLimpia)) {
        logEvent(`🎯 [IA detectó intención de música]: "${cancion}" -> "${queryLimpia}"`);
        const canalTexto = client.channels.cache.get(CANAL_MUSICA_ID) || client.guilds.cache.get(PREF_GUILD)?.channels.cache.get(CANAL_MUSICA_ID);
        buscarYDarOpciones(queryLimpia || cancion, canalTexto);
        return null;
      }
    }

    // 2. ¿La IA detectó intención de BÚSQUEDA EN INTERNET / GOOGLE?
    if (raw.includes('[BUSCAR_WEB:') || /BUSCAR_WEB:\s*/i.test(raw)) {
      const m = raw.match(/(?:\[)?BUSCAR_WEB:\s*(.+?)(?:\]|$)/i);
      const consultaWeb = m ? m[1].trim() : raw.replace(/\[?BUSCAR_WEB:\s*/i, '').replace(/\]/g, '').trim();
      const infoWeb = await buscarEnInternet(consultaWeb);

      const webMessages = [
        ...messages,
        {
          role: 'system',
          content: `RESULTADOS DE BÚSQUEDA EN INTERNET PARA "${consultaWeb}":\n- ${infoWeb}\n\nINSTRUCCIÓN: Responde a lo que preguntó ${nombreUsuario} dándole el dato real encontrado en internet, pero con tu estilo mamón, carrilludo y divertido de Pepe Rey Del Noxz (máximo 2 oraciones cortas para decir por voz, sin etiquetas ni corchetes).`
        }
      ];

      const { text: respFinal } = await llamarChatCompletion(webMessages);
      const limpiaWeb = (respFinal || 'Ya busqué en Google carnal, pero no salió ni madres.')
        .replace(/[*_#`~>\[\]]/g, '')
        .replace(/\n+/g, ' ')
        .trim();

      logEvent(`🌐 [Respuesta con datos de Google]: "${limpiaWeb}"`);
      historial.push({ role: 'assistant', content: limpiaWeb });
      if (historial.length > 8) historial.shift();
      return limpiaWeb;
    }

    const limpia = raw.replace(/[*_#`~>\[\]]/g, '').replace(/\n+/g, ' ').trim();
    logEvent(`🧠 [${provider}]: "${limpia}"`);
    historial.push({ role: 'assistant', content: limpia });
    if (historial.length > 8) historial.shift();
    return limpia;
  } catch (err) {
    logEvent(`❌ Error en responderConIA: ${err.message}`);
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
// 7. SISTEMA DE AUDIO (Voz de Pepe + Música Dual YouTube/SoundCloud + FFmpeg Reconnect)
// ───────────────────────────────────────────────────────────────
let volumenMusica = 0.5; // 50% por defecto (0.05 a 1.0)
let cancionActual = null; // { title, url, timestamp, seconds, author }
let recursoMusica = null; // AudioResource con inlineVolume
let opcionesMusica = []; // Top 3 opciones encontradas
let esperandoSeleccion = false;
let timeoutSeleccion = null;
let modoAntesDeMusica = false; // Solo restaurar si estaba en ON antes de poner música
let procesoFfmpegMusica = null; // Stream FFmpeg con auto-reconnect

// Reproductor exclusivo para la voz de Pepe
const voicePlayer = createAudioPlayer({
  behaviors: { noSubscriber: NoSubscriberBehavior.Play }
});

// Reproductor exclusivo para la música
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

musicPlayer.on('stateChange', (oldState, newState) => {
  logEvent(`🎵 [MusicPlayer Estado]: ${oldState.status} -> ${newState.status}`);
});

musicPlayer.on(AudioPlayerStatus.Playing, () => {
  logEvent(`🎶 [MusicPlayer] Tocando "${cancionActual?.title || 'Canción'}" al ${Math.round(volumenMusica * 100)}% de volumen`);
});

musicPlayer.on(AudioPlayerStatus.Idle, () => {
  if (!cancionActual) return; // Ignorar si fue limpieza intencional antes de nueva canción
  logEvent('⏹️ [MusicPlayer] Canción terminada.');
  cancionActual = null;
  recursoMusica = null;

  if (procesoFfmpegMusica) {
    try { procesoFfmpegMusica.destroy(); } catch {}
    procesoFfmpegMusica = null;
  }

  if (modoAntesDeMusica) {
    modoCharlaContinua = true;
    logEvent('🟢 [Música Terminada]: Modo charla continua restaurado.');
  } else {
    modoCharlaContinua = false;
  }
});

musicPlayer.on('error', (err) => {
  logEvent(`⚠️ [MusicPlayer Error]: ${err.message}`);
  cancionActual = null;
  recursoMusica = null;

  if (procesoFfmpegMusica) {
    try { procesoFfmpegMusica.destroy(); } catch {}
    procesoFfmpegMusica = null;
  }

  if (modoAntesDeMusica) {
    modoCharlaContinua = true;
    logEvent('🟢 [Música Terminada tras error]: Modo charla continua restaurado.');
  } else {
    modoCharlaContinua = false;
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

function inicializarCookies() {
  const cookiesPath = path.resolve(process.cwd(), 'cookies.txt');
  if (process.env.YOUTUBE_COOKIES_BASE64) {
    try {
      const decoded = Buffer.from(process.env.YOUTUBE_COOKIES_BASE64.trim(), 'base64').toString('utf8');
      fs.writeFileSync(cookiesPath, decoded, 'utf8');
      logEvent(`🍪 [Cookies]: cookies.txt cargado (${decoded.length} bytes, ${decoded.split('\n').length} líneas)`);
    } catch (err) {
      logEvent(`⚠️ [Cookies]: Error decodificando YOUTUBE_COOKIES_BASE64: ${err.message}`);
    }
  } else if (fs.existsSync(cookiesPath)) {
    logEvent('🍪 [Cookies]: Archivo local cookies.txt listo');
  }
}

function getExecutableYtDlp() {
  const localBin = path.resolve(process.cwd(), process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  if (fs.existsSync(localBin)) return localBin;
  return 'yt-dlp';
}

// 1. Extractor directo del video de YouTube exacto (sin bloqueo de IP en Render via @vreden/youtube_scraper + respaldo yt-dlp)
async function obtenerUrlYouTubeDirecto(videoUrl) {
  try {
    const resMp3 = await ytmp3(videoUrl, 128);
    if (resMp3?.status && resMp3?.download?.url) {
      return {
        streamUrl: resMp3.download.url,
        sourceName: `YouTube Original ("${resMp3.metadata?.title || 'MP3 128kbps'}")`
      };
    }
  } catch (err) {
    logEvent(`⚠️ [YouTube API]: ${err.message}`);
  }

  return new Promise((resolve, reject) => {
    const bin = getExecutableYtDlp();
    const isWindows = process.platform === 'win32';

    const baseArgs = [
      '-g',
      '-f', 'bestaudio[abr<=96]/bestaudio/best',
      '--no-playlist',
      '--no-warnings',
      '--extractor-args', 'youtube:player_client=visionos,android',
      videoUrl
    ];

    const cmd = isWindows ? 'py' : bin;
    const args = isWindows ? ['-3.14', '-m', 'yt_dlp', ...baseArgs] : baseArgs;

    execFile(cmd, args, { timeout: 8000 }, (err, stdout, stderr) => {
      if (!err && stdout && stdout.trim().startsWith('http')) {
        const directUrl = stdout.trim().split('\n')[0].trim();
        return resolve({ streamUrl: directUrl, sourceName: 'YouTube Direct' });
      }
      reject(new Error((stderr || err?.message || 'Fallo en yt-dlp').slice(-180).trim()));
    });
  });
}

// 2. Extractor directo SoundCloud API v2 (0% bloqueo en Render/Datacenter, resuelve en ~1s sin depender de play.stream)
async function obtenerUrlSoundCloudDirecto(query, duracionObjetivoSeg = 0) {
  const cid = await play.getFreeClientID();
  await play.setToken({ soundcloud: { client_id: cid } });
  const scResults = await play.search(query, { source: { soundcloud: 'tracks' }, limit: 15 });
  if (!scResults || scResults.length === 0) {
    throw new Error('Sin resultados en SoundCloud');
  }

  const candidatos = [];
  for (const track of scResults) {
    const fmt = (track.formats || []).find(f => f.format?.protocol === 'progressive') ||
                (track.formats || []).find(f => f.format?.protocol === 'hls');
    if (fmt && fmt.url) {
      candidatos.push({ track, fmt });
    }
  }

  if (candidatos.length === 0) {
    throw new Error('Pistas con DRM en SoundCloud');
  }

  const pideRemix = /remix|slowed|sped|cover|mashup|edit/i.test(query);
  if (!pideRemix) {
    candidatos.sort((a, b) => {
      const aPenal = /remix|slowed|sped|cover|mashup|1920|pvz|humor/i.test(a.track.name) ? 1 : 0;
      const bPenal = /remix|slowed|sped|cover|mashup|1920|pvz|humor/i.test(b.track.name) ? 1 : 0;
      if (aPenal !== bPenal) return aPenal - bPenal;
      if (duracionObjetivoSeg > 0) {
        return Math.abs((a.track.durationInSec || 0) - duracionObjetivoSeg) - Math.abs((b.track.durationInSec || 0) - duracionObjetivoSeg);
      }
      return 0;
    });
  }

  for (const { track, fmt } of candidatos) {
    try {
      const apiRes = await fetch(`${fmt.url}?client_id=${cid}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      if (apiRes.ok) {
        const data = await apiRes.json();
        if (data?.url) {
          return {
            streamUrl: data.url,
            sourceName: `SoundCloud ("${track.name}")`
          };
        }
      }
    } catch {}
  }

  throw new Error('No se pudo resolver URL de SoundCloud');
}

// Resuelve en paralelo YouTube y SoundCloud mientras Pepe anuncia la canción
async function resolverMejorStreamUrl(videoInfo, tituloLimpio) {
  const promYt = obtenerUrlYouTubeDirecto(videoInfo.url).catch(err => ({ error: err }));
  const promSc = obtenerUrlSoundCloudDirecto(tituloLimpio, videoInfo.seconds || 0).catch(err => ({ error: err }));

  const [resYt, resSc] = await Promise.all([promYt, promSc]);

  if (resYt && resYt.streamUrl) {
    logEvent(`📡 [Fuente de Audio]: ${resYt.sourceName} listo`);
    return resYt;
  }

  if (resYt?.error) {
    logEvent(`ℹ️ [YouTube bloqueado en nube, usando respaldo inmediato SoundCloud]`);
  }

  if (resSc && resSc.streamUrl) {
    logEvent(`☁️ [Fuente de Audio]: ${resSc.sourceName} listo`);
    return resSc;
  }

  throw new Error(`YouTube (${resYt?.error?.message || 'falló'}) y SoundCloud (${resSc?.error?.message || 'falló'})`);
}

// Reproduce la voz de Pepe con Pause & Swap si hay música sonando
async function reproducirVozPepe(texto) {
  if (!texto) return;
  botHablando = true;

  const audioFile = path.join(CACHE_DIR, `pepe_${Date.now()}.mp3`);
  try {
    const hayMusica = cancionActual !== null && musicPlayer.state.status === AudioPlayerStatus.Playing;
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
      seconds: v.seconds || 0,
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

async function crearStreamNodeDesdeUrl(streamUrl) {
  const res = await fetch(streamUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} al abrir stream de audio`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (!streamUrl.includes('.m3u8') && !contentType.includes('mpegurl')) {
    const out = new PassThrough({ highWaterMark: 1024 * 512 });
    if (res.body) {
      Readable.fromWeb(res.body).pipe(out);
    } else {
      const buf = Buffer.from(await res.arrayBuffer());
      out.end(buf);
    }
    return out;
  }

  const text = await res.text();
  const urls = [];
  const mapMatch = text.match(/#EXT-X-MAP:URI="([^"]+)"/);
  if (mapMatch) urls.push(mapMatch[1]);
  for (const line of text.split('\n')) {
    const l = line.trim();
    if (l.startsWith('http://') || l.startsWith('https://')) {
      urls.push(l);
    }
  }

  if (urls.length === 0) {
    throw new Error('Playlist m3u8 sin segmentos');
  }

  logEvent(`📦 [Node Streamer]: Descargando ${urls.length} segmentos de audio en memoria...`);
  const out = new PassThrough({ highWaterMark: 1024 * 512 });

  (async () => {
    try {
      for (const segUrl of urls) {
        if (out.destroyed) break;
        const r = await fetch(segUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        if (!r.ok) continue;
        const b = Buffer.from(await r.arrayBuffer());
        if (!out.destroyed) out.write(b);
      }
      if (!out.destroyed) out.end();
    } catch {
      if (!out.destroyed) out.end();
    }
  })();

  return out;
}

async function reproducirCancion(videoInfo) {
  if (!videoInfo) return;
  esperandoSeleccion = false;
  if (timeoutSeleccion) clearTimeout(timeoutSeleccion);

  // Limpiar cualquier stream anterior antes de cargar la nueva canción (evita condiciones de carrera)
  cancionActual = null;
  recursoMusica = null;
  if (procesoFfmpegMusica) {
    try { procesoFfmpegMusica.destroy(); } catch {}
    procesoFfmpegMusica = null;
  }
  try { musicPlayer.stop(true); } catch {}

  // Al poner música: recordar si estaba en ON y poner temporalmente en OFF (solo responder a "Pepe")
  modoAntesDeMusica = modoCharlaContinua;
  if (modoCharlaContinua) {
    modoCharlaContinua = false;
    logEvent('🔒 [Música Activa]: Cambiando temporalmente a modo mención (solo responde si dicen Pepe).');
  }

  try {
    const tituloLimpio = limpiarTituloParaVoz(videoInfo.title);
    logEvent(`🎵 [Cargando audio]: "${videoInfo.title}" [${videoInfo.timestamp}]`);

    // Resolver enlace y pre-cargar los primeros segmentos EN PARALELO mientras Pepe anuncia la rola por voz
    const [, { resultadoStream, nodeStream }] = await Promise.all([
      reproducirVozPepe(`Sobres, poniendo ${tituloLimpio}. ¡Súbanle al desmadre!`),
      (async () => {
        const resStream = await resolverMejorStreamUrl(videoInfo, tituloLimpio);
        const stream = await crearStreamNodeDesdeUrl(resStream.streamUrl);
        return { resultadoStream: resStream, nodeStream: stream };
      })()
    ]);

    procesoFfmpegMusica = nodeStream;

    procesoFfmpegMusica.on('error', (errFf) => {
      logEvent(`⚠️ [Stream Warning]: ${errFf.message}`);
    });

    recursoMusica = createAudioResource(procesoFfmpegMusica, {
      inputType: StreamType.Arbitrary,
      inlineVolume: true
    });
    recursoMusica.volume.setVolume(volumenMusica);

    cancionActual = videoInfo;

    if (conexionActual) {
      conexionActual.subscribe(musicPlayer);
    }
    musicPlayer.play(recursoMusica);
    logEvent(`▶️ [Reproduciendo desde ${resultadoStream.sourceName}]: "${videoInfo.title}" al ${Math.round(volumenMusica * 100)}% de volumen`);
  } catch (err) {
    logEvent(`❌ Error reproduciendo audio: ${err.message}`);
    detenerMusica();
    await reproducirVozPepe('No se pudo jalar esa rola carnal, intenta con otra opción.');
  }
}

function detenerMusica() {
  cancionActual = null;
  recursoMusica = null;
  esperandoSeleccion = false;
  if (timeoutSeleccion) clearTimeout(timeoutSeleccion);

  if (procesoFfmpegMusica) {
    try { procesoFfmpegMusica.destroy(); } catch {}
    procesoFfmpegMusica = null;
  }

  try { musicPlayer.stop(true); } catch {}

  if (modoAntesDeMusica) {
    modoCharlaContinua = true;
    logEvent('🟢 [Música Detenida]: Modo charla continua restaurado.');
  } else {
    modoCharlaContinua = false;
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
    if (/\b(?:opci[oó]n\s*)?(?:la\s+|el\s+)?(?:1|uno|una|primera|primer)\b/i.test(t)) return { type: 'SELECCION', idx: 0 };
    if (/\b(?:opci[oó]n\s*)?(?:la\s+|el\s+)?(?:2|dos|segunda|segundo)\b/i.test(t)) return { type: 'SELECCION', idx: 1 };
    if (/\b(?:opci[oó]n\s*)?(?:la\s+|el\s+)?(?:3|tres|tercera|tercer)\b/i.test(t)) return { type: 'SELECCION', idx: 2 };
    if (/\b(cancela|cancelar|ninguna|olv[ií]dalo|ya\s*no|no\s*pongas\s*nada)\b/i.test(t)) return { type: 'CANCELAR_SELECCION' };
  }

  // Volumen
  if (/(?:sube|s[uú]bele|aumenta|m[aá]s)\s*(?:al|el)?\s*volumen/i.test(t) || /volumen\s*m[aá]s\s*alto/i.test(t)) {
    return { type: 'VOLUMEN_SUBIR' };
  }
  if (/(?:baja|b[aá]jale|disminuye|menos)\s*(?:al|el)?\s*volumen/i.test(t) || /volumen\s*m[aá]s\s*bajo/i.test(t)) {
    return { type: 'VOLUMEN_BAJAR' };
  }
  const mVol = t.match(/volumen\s*(?:al|a)?\s*(\d{1,3})/i);
  if (mVol) {
    return { type: 'VOLUMEN_SET', val: parseInt(mVol[1], 10) };
  }

  // Control de reproducción
  if (/(?:para|det[eé]n|quita|apaga|stop)\s*(?:la)?\s*(?:m[uú]sica|canci[oó]n|rola)/i.test(t) || /\b(?:pepe\s+)?(?:c[aá]llate|apaga\s*la\s*m[uú]sica)\b/i.test(t)) {
    return { type: 'MUSICA_STOP' };
  }
  if (/(?:pausa|pa[uú]sale)\s*(?:la)?\s*(?:m[uú]sica|canci[oó]n|rola)?/i.test(t)) {
    return { type: 'MUSICA_PAUSE' };
  }
  if (/(?:despausa|reanuda|sigue|dale\s+play)/i.test(t)) {
    return { type: 'MUSICA_RESUME' };
  }

  // Si menciona Google, internet, Wikipedia o es una pregunta de información general, enviarlo a la IA (que tiene búsqueda web)
  const esConsultaWebOPregunta = /\b(?:google|internet|web|wikipedia|investiga|averigua|qui[eé]n\s+es|qu[eé]\s+es|cu[aá]nto|cu[aá]ndo|d[oó]nde|por\s+qu[eé]|noticias|clima|significa|definici[oó]n)\b/i.test(t);

  // Búsqueda directa de canciones (nota: "busca" solo activa música directa si viene acompañado de "canción/música/rola")
  const tieneVerboReproducir = /\b(?:pon(?:te|me|nos)?|reproduce|toca(?:te)?|su[eé]lta(?:te)?|avienta(?:te)?|canta(?:te)?|suena)\b/i.test(t);
  const tienePalabraMusica = /\b(?:m[uú]sica|canci[oó]n|canciones|rolas?|temas?|pista)\b/i.test(t);

  if (!esConsultaWebOPregunta && (tieneVerboReproducir || tienePalabraMusica)) {
    const q = limpiarQueryBusqueda(texto);
    if (q && q.length >= 2 && !/^(?:atenci[oó]n|las pilas|modo|mute|pepe|on|off|google|internet|algo|nada|eso)$/i.test(q)) {
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

      const totalPcm = Buffer.concat(pcmChunks);

      // Si el audio es menor a 0.8s (153600 bytes a 48kHz estéreo 16-bit), descartar ruido y clicks
      if (totalPcm.length < 153600) {
        logEvent(`🔇 [Audio corto de ${username}] Descartado (${totalPcm.length} bytes).`);
        return;
      }

      logEvent(`📦 [Grabación de ${username} completa por ${razon}]: ${(totalPcm.length / 192000).toFixed(1)}s de voz.`);

      const wavBuffer = createWavBuffer(totalPcm, 48000, 2);
      try {
        const texto = await transcribirAudio(wavBuffer);
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

        // Si es charla casual pero Pepe ya está hablando, no interrumpir con otra respuesta de IA
        if (botHablando) {
          logEvent(`🤫 [Ignorado]: Pepe ya está hablando y fue charla casual.`);
          return;
        }

        const esParaPepe = texto.toLowerCase().includes('pepe');

        // Responder si el modo continuo está activo O si dijeron "pepe"
        if (modoCharlaContinua || esParaPepe) {
          logEvent(`🧠 [Pepe respondiendo a ${username}]...`);
          const respuesta = await responderConIA(texto, username);
          if (respuesta) {
            await reproducirVozPepe(respuesta);
          }
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
    inicializarCookies();
    await asegurarYtDlp();
  } catch (err) {
    console.error('⚠️ [yt-dlp Startup]:', err.message);
  }

  try {
    const testPath = path.join(CACHE_DIR, 'test_startup.mp3');
    await generarAudioJorge('Prueba de voz Jorge lista', testPath);
    try { fs.unlinkSync(testPath); } catch {}
    console.log('✅ [Voz de Jorge]: Lista y verificada en Node.js.');
  } catch (err) {
    console.error('⚠️ [Voz de Jorge]: Falla en auto-prueba:', err.message);
  }

  const guardados = leerCanalesAFK();
  for (const [, guild] of client.guilds.cache) {
    try {
      await guild.commands.set(COMANDOS);
      console.log(`⚡ Comandos listos en: ${guild.name}`);

      modoCharlaContinua = false; // Siempre inicia en modo tranquilo (OFF) para no molestar a nadie
      // Priorizar el canal de voz donde haya gente conectada actualmente tras un redeploy
      let target = guild.channels.cache.find(c => c.isVoiceBased() && c.members.some(m => !m.user.bot));
      if (!target) {
        let targetId = guardados[guild.id] || (guild.id === PREF_GUILD ? PREF_CANAL : null);
        target = targetId ? guild.channels.cache.get(targetId) : null;
      }
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
