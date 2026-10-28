// ───────────────────────────────────────────────────────────────
// PEPE REY DEL NOXZ · Bot de Voz 24/7 AFK Permanente (Render.com)
// ───────────────────────────────────────────────────────────────
import http from 'node:http';
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
  NoSubscriberBehavior
} from '@discordjs/voice';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const AFK_STATE_PATH = path.join(__dirname, 'canal_afk.json');
const TOKEN = process.env.DISCORD_TOKEN?.trim();
const PREF_CANAL = process.env.CANAL_ID?.trim() || '1557238620857831474';
const PREF_GUILD = process.env.GUILD_ID?.trim() || '1310662226109272074';
const PORT = process.env.PORT || 3000;

if (!TOKEN) {
  console.error('❌ ERROR CRÍTICO: DISCORD_TOKEN no configurado en variables de entorno.');
  process.exit(1);
}

// ───────────────────────────────────────────────────────────────
// 1. MINI SERVIDOR WEB KEEP-ALIVE (Para UptimeRobot y Render)
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
    ping_discord: `${client.ws?.ping || 0} ms`,
    mensaje: '👑 Pepe Rey Del Noxz cuidando la racha 24/7 en Discord'
  }, null, 2));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Servidor Web de Render escuchando en el puerto ${PORT}`);
});

// ───────────────────────────────────────────────────────────────
// 2. GESTIÓN DEL CANAL GUARDADO
// ───────────────────────────────────────────────────────────────
function leerCanalesAFK() {
  try {
    if (fs.existsSync(AFK_STATE_PATH)) {
      return JSON.parse(fs.readFileSync(AFK_STATE_PATH, 'utf-8'));
    }
  } catch (err) {
    console.warn('⚠️ No se pudo leer canal_afk.json:', err.message);
  }
  return {};
}

function guardarCanalAFK(guildId, channelId) {
  try {
    const data = leerCanalesAFK();
    if (channelId) data[guildId] = channelId;
    else delete data[guildId];
    fs.writeFileSync(AFK_STATE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.warn('⚠️ No se pudo guardar canal_afk.json:', err.message);
  }
}

// ───────────────────────────────────────────────────────────────
// 3. STREAM DE SILENCIO (Mantiene el socket de voz vivo en Discord)
// ───────────────────────────────────────────────────────────────
class SilenceStream extends Readable {
  _read() {
    this.push(Buffer.from([0xf8, 0xff, 0xfe]));
  }
}

function crearReproductorSilencioso() {
  const player = createAudioPlayer({
    behaviors: {
      noSubscriber: NoSubscriberBehavior.Play
    }
  });

  function playSilence() {
    try {
      const silence = new SilenceStream();
      const resource = createAudioResource(silence, {
        inputType: StreamType.Opus
      });
      player.play(resource);
    } catch (err) {
      console.warn('⚠️ Error enviando pulso de silencio:', err.message);
    }
  }

  player.on(AudioPlayerStatus.Idle, () => {
    setTimeout(playSilence, 1000);
  });

  player.on('error', (err) => {
    console.warn('⚠️ Error en reproductor silencioso:', err.message);
    setTimeout(playSilence, 2000);
  });

  playSilence();
  return player;
}

// ───────────────────────────────────────────────────────────────
// 4. CONEXIÓN DE VOZ INDESTRUCTIBLE
// ───────────────────────────────────────────────────────────────
const conexiones = new Map();
const reintentos = new Map();

async function asegurarConexionVoz(channel) {
  if (!channel || !channel.isVoiceBased()) return;
  const guild = channel.guild;

  if (reintentos.has(guild.id)) {
    clearTimeout(reintentos.get(guild.id));
    reintentos.delete(guild.id);
  }

  const actual = conexiones.get(guild.id);
  if (
    actual &&
    actual.state.status !== VoiceConnectionStatus.Destroyed &&
    guild.members.me?.voice?.channelId === channel.id
  ) {
    return actual;
  }

  console.log(`📡 [Conexión 24/7] Conectando a "${channel.name}" en ${guild.name}...`);

  try {
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false
    });

    conexiones.set(guild.id, connection);

    const player = crearReproductorSilencioso();
    connection.subscribe(player);

    connection.on(VoiceConnectionStatus.Ready, () => {
      console.log(`✅ [Voz Activa] Pepe Rey está asegurado en "${channel.name}". Racha protegida 24/7.`);
    });

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      console.warn(`⚠️ [Voz Desconectada] Se perdió conexión en "${channel.name}". Reconectando...`);
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000)
        ]);
        console.log(`🔄 [Reconectado] Reconexión automática exitosa.`);
      } catch {
        console.log(`🚨 [Reconexión Forzada] Reiniciando conexión en 3 segundos...`);
        try { connection.destroy(); } catch {}
        conexiones.delete(guild.id);

        const timer = setTimeout(() => {
          asegurarConexionVoz(channel).catch(() => {});
        }, 3000);
        reintentos.set(guild.id, timer);
      }
    });

    connection.on(VoiceConnectionStatus.Destroyed, () => {
      conexiones.delete(guild.id);
    });

    return connection;
  } catch (err) {
    console.error(`❌ Error al conectar al canal de voz:`, err.message);
    const timer = setTimeout(() => {
      asegurarConexionVoz(channel).catch(() => {});
    }, 5000);
    reintentos.set(guild.id, timer);
  }
}

// ───────────────────────────────────────────────────────────────
// 5. CLIENTE DISCORD & EVENTOS
// ───────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

client.on('error', (err) => {
  console.warn('⚠️ [Discord Error]:', err.message);
});

async function verificarYConectarGuild(guild) {
  try {
    const guardados = leerCanalesAFK();
    let channelId = guardados[guild.id] || (guild.id === PREF_GUILD ? PREF_CANAL : null);

    let target = null;
    if (channelId) {
      target = guild.channels.cache.get(channelId);
    }

    if (!target) {
      target = guild.channels.cache.find(
        (c) => c.isVoiceBased() && c.members.some((m) => !m.user.bot)
      );
    }

    if (!target) {
      target = guild.channels.cache.find((c) => c.isVoiceBased());
    }

    if (target) {
      guardarCanalAFK(guild.id, target.id);
      await asegurarConexionVoz(target);
    }
  } catch (err) {
    console.error(`❌ Error en guild ${guild.name}:`, err.message);
  }
}

const COMANDOS = [
  new SlashCommandBuilder()
    .setName('quedarse')
    .setDescription('Fija a Pepe Rey 24/7 en tu canal de voz actual para proteger la racha'),
  new SlashCommandBuilder()
    .setName('estado')
    .setDescription('Muestra el tiempo activo y estado de conexión de Pepe Rey')
];

client.once('ready', async () => {
  console.log('======================================================');
  console.log(`👑 ¡Pepe Rey Del Noxz CONECTADO como ${client.user.tag}!`);
  console.log(`☁️ Servidor en la nube: Render.com (24/7 Permanente)`);
  console.log('======================================================');

  client.user.setPresence({
    activities: [{ name: 'Cuidando la racha 24/7 🛡️', type: ActivityType.Custom }],
    status: 'online'
  });

  for (const [, guild] of client.guilds.cache) {
    try {
      await guild.commands.set(COMANDOS);
      console.log(`⚡ Comandos listos en: ${guild.name}`);
      await verificarYConectarGuild(guild);
    } catch (err) {
      console.warn(`No se pudieron registrar comandos en ${guild.name}:`, err.message);
    }
  }
});

client.on('voiceStateUpdate', (oldState, newState) => {
  if (oldState.member?.id !== client.user.id) return;

  const guild = oldState.guild;
  const guardados = leerCanalesAFK();
  const canalObjetivoId = guardados[guild.id] || PREF_CANAL;

  if (oldState.channelId && !newState.channelId) {
    console.log(`⚠️ Pepe fue desconectado de voz. Reingresando en 3 segundos...`);
    const canal = guild.channels.cache.get(canalObjetivoId);
    if (canal) {
      setTimeout(() => asegurarConexionVoz(canal).catch(() => {}), 3000);
    }
  } else if (newState.channelId && newState.channelId !== oldState.channelId) {
    console.log(`📌 Pepe fue movido al canal "${newState.channel.name}". Guardando como nuevo canal fijo.`);
    guardarCanalAFK(guild.id, newState.channelId);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'quedarse') {
    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
      return interaction.reply({
        content: '❌ Debes estar conectado a un canal de voz para indicarme dónde quedarme.',
        ephemeral: true
      });
    }

    guardarCanalAFK(interaction.guildId, voiceChannel.id);
    await asegurarConexionVoz(voiceChannel);

    const embed = new EmbedBuilder()
      .setColor(0x00FF88)
      .setTitle('👑 Pepe Rey Del Noxz · Modo 24/7 Fijo')
      .setDescription(`Me he fijado permanentemente en el canal **${voiceChannel.name}**.\n\n🛡️ **Racha asegurada:** Aunque tu PC esté apagada o no haya nadie, seguiré aquí conectado 24/7 en Render.com.`)
      .setFooter({ text: 'Pepe Rey · Cuidando la racha del Noxz' });

    return interaction.reply({ embeds: [embed] });
  }

  if (interaction.commandName === 'estado') {
    const uptimeSec = Math.floor(process.uptime());
    const dias = Math.floor(uptimeSec / 86400);
    const horas = Math.floor((uptimeSec % 86400) / 3600);
    const mins = Math.floor((uptimeSec % 3600) / 60);
    const memMb = Math.round(process.memoryUsage().rss / 1024 / 1024);

    const voiceChannel = interaction.guild.members.me?.voice?.channel;

    const embed = new EmbedBuilder()
      .setColor(0xFFAA00)
      .setTitle('📊 Estado de Pepe Rey (Render.com 24/7)')
      .addFields(
        { name: '⏱️ Tiempo en Línea', value: `${dias}d ${horas}h ${mins}m`, inline: true },
        { name: '🧠 Memoria RAM', value: `${memMb} MB`, inline: true },
        { name: '🎙️ Canal de Voz', value: voiceChannel ? `**${voiceChannel.name}**` : '❌ Desconectado', inline: true },
        { name: '⚡ Ping Discord', value: `${client.ws.ping} ms`, inline: true }
      )
      .setFooter({ text: 'Alojado en Render.com Free Tier + UptimeRobot' });

    return interaction.reply({ embeds: [embed] });
  }
});

client.login(TOKEN);
