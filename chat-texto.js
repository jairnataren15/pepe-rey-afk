// ───────────────────────────────────────────────────────────────
// PEPE EN EL CHAT DE TEXTO (Gemini)
// ───────────────────────────────────────────────────────────────
// Si alguien etiqueta a Pepe (o le responde a un mensaje suyo), Pepe contesta
// en el chat: lee las imágenes que le pasen (problemas de mate, capturas del
// juego), busca en Google lo que haga falta, dibuja imágenes si se lo piden y
// busca fotos reales. La voz no se toca: sigue con Groq.
//
// Sin GEMINI_API_KEY contesta solo texto con la IA de siempre (Groq/OpenAI).
//
// Discord deja leer los mensajes que mencionan al bot sin el permiso especial
// de «Message Content». Con PEPE_LEE_CHAT=1 se pide ese permiso para entender
// también los mensajes de otros a los que responden (p. ej. «@Pepe resuelve
// esto» respondiendo a la foto de alguien), pero OJO: antes hay que activarlo
// en el portal de desarrolladores o Pepe no puede conectarse.

const API = 'https://generativelanguage.googleapis.com/v1beta';
const ESPERA_POR_PERSONA_MS = 8000;
const MAX_A_LA_VEZ = 3;
const MAX_IMAGENES = 4;
const MAX_BYTES_IMAGEN = 8 * 1024 * 1024;

const clave = () => process.env.GEMINI_API_KEY?.trim();

// ── Qué modelo usar: el Flash más nuevo que tenga la cuenta ─────
// Google cambia los nombres seguido; se pueden fijar con GEMINI_MODELO y
// GEMINI_MODELO_IMAGEN en Render.
let modelos = null;
function versionDe(nombre) {
  const m = nombre.match(/gemini-(\d+)(?:\.(\d+))?/);
  return m ? Number(m[1]) * 100 + Number(m[2] || 0) : 0;
}
function elegir(lista, patron) {
  const sirven = lista.filter((m) => patron.test(m.name) && (m.supportedGenerationMethods || []).includes('generateContent'));
  sirven.sort((a, b) => {
    const pa = /preview|exp/.test(a.name) ? 1 : 0;
    const pb = /preview|exp/.test(b.name) ? 1 : 0;
    return pa - pb || versionDe(b.name) - versionDe(a.name);
  });
  return sirven.map((m) => m.name.replace(/^models\//, ''));
}
async function dameModelos(log) {
  if (modelos) return modelos;
  const fijo = process.env.GEMINI_MODELO?.trim();
  let textos = fijo ? [fijo] : [];
  let imagen = process.env.GEMINI_MODELO_IMAGEN?.trim();
  if (!fijo || !imagen) {
    try {
      const r = await fetch(`${API}/models?pageSize=1000`, { headers: { 'x-goog-api-key': clave() }, signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        const lista = (await r.json()).models || [];
        // Si uno no tiene cupo se prueba el siguiente; los lite van al final.
        if (!fijo) textos = [...elegir(lista, /^models\/gemini-\d+(?:\.\d+)?-flash(?:-preview(?:-[\d-]+)?)?$/), ...elegir(lista, /^models\/gemini-\d+(?:\.\d+)?-flash-lite(?:-preview(?:-[\d-]+)?)?$/)].slice(0, 4);
        imagen ||= elegir(lista, /^models\/gemini-\d+(?:\.\d+)?-flash-image(?:-preview(?:-[\d-]+)?)?$/)[0];
      } else {
        log(`⚠️ [Chat] Gemini no dio la lista de modelos: ${r.status}`);
      }
    } catch (e) {
      log(`⚠️ [Chat] Gemini no dio la lista de modelos: ${e.message}`);
    }
  }
  modelos = { textos: textos.length ? textos : ['gemini-2.5-flash'], imagen: imagen || 'gemini-2.5-flash-image' };
  log(`🤖 [Chat] Modelos de Gemini: ${modelos.textos.join(', ')} · ${modelos.imagen}`);
  return modelos;
}

async function gemini(modelo, cuerpo, ms = 60000) {
  const r = await fetch(`${API}/models/${modelo}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': clave(), 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(ms),
  });
  if (!r.ok) {
    const crudo = await r.text();
    let motivo = crudo;
    try { motivo = JSON.parse(crudo).error?.message || crudo; } catch {}
    const e = new Error(`Gemini ${modelo} ${r.status}: ${motivo.replace(/\s+/g, ' ').slice(0, 400)}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

// ── Reglas del chat, encima de la personalidad de la voz ────────
const REGLAS_TEXTO = `

AHORA ESTÁS EN EL CHAT DE TEXTO DE DISCORD (no en voz). Te etiquetaron o te respondieron y tu respuesta se escribe en el chat.

CÓMO CONTESTAR EN EL CHAT:
1. Contesta a lo que te pidieron. Si es plática, 1 a 3 oraciones con tu estilo de siempre.
2. Si te piden ayuda de verdad (un problema de matemáticas, una tarea, un dato, una explicación, algo del juego), la respuesta tiene que ser CORRECTA y COMPLETA: resuélvelo paso a paso y deja el resultado claro al final. Tu carrilla va en una frase al principio o al final, nunca en lugar de la respuesta.
3. Puedes usar el formato de Discord (negritas, listas cortas, bloques de código). Las fórmulas escríbelas en texto normal (x², √, ½, ×, ÷), NUNCA en LaTeX con $ porque Discord no lo muestra.
4. No pases de unos 1,500 caracteres.
5. Si te mandan imágenes, míralas con atención: lee el texto o los números que traigan y contesta sobre eso. Si no se alcanza a leer algo, dilo en vez de inventarlo.
6. Tienes Google: si te preguntan algo actual (noticias, fechas, precios, parches, quién es alguien), búscalo y no inventes. Lo de tu lore no hace falta buscarlo.
7. No uses etiquetas de música ni [BUSCAR_WEB] ni [ENVIAR_FOTO] aquí; esas son de la voz.
8. NUNCA etiquetes a @everyone ni @here.
9. NUNCA empieces diciendo tu nombre.

IMÁGENES:
- Si te piden CREAR, DIBUJAR, GENERAR o HACER una imagen (no buscarla), escribe tu frase y al final, en su propia línea:
[DIBUJAR: descripción detallada de la imagen, en inglés]
- Si te piden una FOTO REAL de algo que existe (buscar o pasar una foto), escribe tu frase y al final, en su propia línea:
[FOTO: lo que hay que buscar]
- Nada sexual, nada de gente real en situaciones ofensivas. Si lo piden, niégate con carrilla.
- Si no te pidieron imagen, no uses ninguna de las dos.`;

function partir(texto, max = 1900) {
  const trozos = [];
  let resto = texto.trim();
  while (resto.length > max) {
    let corte = resto.lastIndexOf('\n', max);
    if (corte < max * 0.5) corte = resto.lastIndexOf(' ', max);
    if (corte < max * 0.5) corte = max;
    trozos.push(resto.slice(0, corte));
    resto = resto.slice(corte).trim();
  }
  if (resto) trozos.push(resto);
  return trozos;
}

// El texto del mensaje sin la mención de Pepe.
function limpiarMencion(contenido, botId) {
  return (contenido || '').replace(new RegExp(`<@!?${botId}>`, 'g'), '').trim();
}

async function imagenesDe(mensaje) {
  const partes = [];
  for (const a of mensaje.attachments.values()) {
    if (partes.length >= MAX_IMAGENES) break;
    const tipo = a.contentType || '';
    if (!/^image\/(png|jpe?g|webp|heic|heif)/i.test(tipo) || a.size > MAX_BYTES_IMAGEN) continue;
    try {
      const r = await fetch(a.url, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) continue;
      const datos = Buffer.from(await r.arrayBuffer()).toString('base64');
      partes.push({ inline_data: { mime_type: tipo.split(';')[0], data: datos } });
    } catch {}
  }
  return partes;
}

export function iniciarChatTexto(client, h) {
  // h = { personaje, quienHabla, leerContexto, bloqueMemoria, recordar, preguntarIA, buscarUrlsDeFoto, logEvent }
  const log = h.logEvent || console.log;
  const ultimaVez = new Map();
  let trabajando = 0;

  // Las últimas cosas que Pepe ve en el canal (las suyas y las que lo mencionan),
  // para que siga la plática.
  async function historialDelCanal(mensaje) {
    try {
      const previos = await mensaje.channel.messages.fetch({ limit: 12, before: mensaje.id });
      return [...previos.values()]
        .reverse()
        .filter((m) => Date.now() - m.createdTimestamp < 30 * 60 * 1000)
        .map((m) => ({ dePepe: m.author.id === client.user.id, nombre: m.member?.displayName || m.author.username, texto: limpiarMencion(m.content, client.user.id) }))
        .filter((m) => m.texto)
        .slice(-8);
    } catch {
      return [];
    }
  }

  async function dibujar(descripcion) {
    const { imagen } = await dameModelos(log);
    const d = await gemini(imagen, {
      contents: [{ role: 'user', parts: [{ text: descripcion }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    }, 90000);
    for (const p of d.candidates?.[0]?.content?.parts || []) {
      const datos = p.inlineData || p.inline_data;
      if (datos?.data) {
        const tipo = datos.mimeType || datos.mime_type || 'image/png';
        return { attachment: Buffer.from(datos.data, 'base64'), name: `pepe.${tipo.includes('jpeg') ? 'jpg' : 'png'}` };
      }
    }
    return null;
  }

  async function contestar(mensaje) {
    const pregunta = limpiarMencion(mensaje.content, client.user.id);
    const nombre = mensaje.member?.displayName || mensaje.author.username;
    const userId = mensaje.author.id;

    // Imágenes del mensaje y, si responde a otro, las de ese también.
    let citado = null;
    if (mensaje.reference?.messageId) citado = await mensaje.fetchReference().catch(() => null);
    const imagenes = [...await imagenesDe(mensaje), ...(citado ? await imagenesDe(citado) : [])].slice(0, MAX_IMAGENES);
    const textoCitado = citado ? limpiarMencion(citado.content, client.user.id) : '';

    if (!pregunta && !imagenes.length && !textoCitado) {
      await mensaje.reply({ content: '¿Qué onda, me etiquetaste nomás para saludar o qué ocupas, carnal?', allowedMentions: { parse: [], repliedUser: true } });
      return;
    }

    await mensaje.channel.sendTyping().catch(() => {});
    const typing = setInterval(() => mensaje.channel.sendTyping().catch(() => {}), 8000);
    try {
      const contexto = await h.leerContexto(userId).catch(() => ({}));
      const previos = await historialDelCanal(mensaje);
      const sistema = h.personaje + REGLAS_TEXTO + `\n\n${h.quienHabla(userId, nombre)} (Su ID de Discord es ${userId}.)` + h.bloqueMemoria(contexto, nombre, previos.length >= 4);

      let pedido = pregunta || '(no escribió nada, solo mandó esto)';
      if (textoCitado) pedido = `[Está respondiendo a este mensaje de ${citado.member?.displayName || citado.author.username}: "${textoCitado}"]\n${pedido}`;
      if (imagenes.length) pedido += `\n[Te mandó ${imagenes.length} imagen${imagenes.length > 1 ? 'es' : ''}]`;

      let texto = '';
      let fuentes = [];
      let proveedor = 'Gemini';
      const t0 = Date.now();

      if (clave()) {
        const contents = [];
        for (const p of previos) {
          const rol = p.dePepe ? 'model' : 'user';
          const parte = { text: p.dePepe ? p.texto : `${p.nombre}: ${p.texto}` };
          // Gemini quiere turnos alternados: se juntan los seguidos del mismo lado.
          if (contents.length && contents[contents.length - 1].role === rol) contents[contents.length - 1].parts.push(parte);
          else contents.push({ role: rol, parts: [parte] });
        }
        const actual = { text: `${nombre}: ${pedido}` };
        if (contents.length && contents[contents.length - 1].role === 'user') contents[contents.length - 1].parts.push(actual, ...imagenes);
        else contents.push({ role: 'user', parts: [actual, ...imagenes] });
        if (contents[0]?.role === 'model') contents.unshift({ role: 'user', parts: [{ text: '(plática anterior del canal)' }] });

        const { textos: candidatos } = await dameModelos(log);
        for (const modelo of candidatos) try {
          const d = await gemini(modelo, {
            system_instruction: { parts: [{ text: sistema }] },
            contents,
            tools: [{ google_search: {} }],
            generationConfig: { temperature: 0.8, maxOutputTokens: 8192 },
          });
          const cand = d.candidates?.[0];
          texto = (cand?.content?.parts || []).filter((p) => p.text && !p.thought).map((p) => p.text).join('').trim();
          fuentes = (cand?.groundingMetadata?.groundingChunks || []).map((c) => c.web).filter((w) => w?.uri).slice(0, 3);
          if (!texto && cand?.finishReason) log(`⚠️ [Chat] Gemini sin texto: ${cand.finishReason}`);
          proveedor = `Gemini ${modelo}`;
          break;
        } catch (e) {
          log(`⚠️ [Chat] ${e.message}`);
          if (e.status !== 429 && e.status !== 404 && e.status !== 503) break;
        }
      }

      // Sin Gemini (o si falló): la IA de la voz, solo texto.
      if (!texto) {
        proveedor = 'respaldo';
        const r = await h.preguntarIA([
          { role: 'system', content: sistema + (imagenes.length ? '\n(Te mandaron imágenes pero ahorita no las puedes ver; dilo con carrilla.)' : '') },
          ...previos.map((p) => ({ role: p.dePepe ? 'assistant' : 'user', content: p.dePepe ? p.texto : `${p.nombre}: ${p.texto}` })),
          { role: 'user', content: `${nombre}: ${pedido}` },
        ]);
        texto = r?.text || '';
      }
      if (!texto) texto = 'Ando saturado de mensajes, aguántame tantito y vuelve a etiquetarme.';

      // ¿Pidió imagen?
      const archivos = [];
      const mDibujo = texto.match(/\[DIBUJAR:\s*([\s\S]+?)\]/i);
      const mFoto = texto.match(/\[FOTO:\s*([\s\S]+?)\]/i);
      texto = texto.replace(/\[(?:DIBUJAR|FOTO):[\s\S]+?\]/gi, '').trim();
      let embedFoto = null;
      if (mDibujo && clave()) {
        try {
          const img = await dibujar(mDibujo[1].trim());
          if (img) archivos.push(img);
          else texto += '\n(No me salió el dibujo, pídemelo otra vez con otras palabras.)';
        } catch (e) {
          log(`⚠️ [Chat] Dibujo: ${e.message}`);
          texto += '\n(Se me rompió el lápiz, no pude hacer la imagen ahorita.)';
        }
      } else if (mFoto && h.buscarUrlsDeFoto) {
        const urls = await h.buscarUrlsDeFoto(mFoto[1].trim()).catch(() => []);
        if (urls[0]) embedFoto = { color: 0x9b59b6, image: { url: urls[0] }, footer: { text: `📸 ${mFoto[1].trim()}` } };
        else texto += '\n(No encontré foto de eso.)';
      }

      if (fuentes.length) texto += `\n-# Fuentes: ${fuentes.map((w) => `[${(w.title || 'link').replace(/[\[\]]/g, '')}](<${w.uri}>)`).join(' · ')}`;
      texto = texto.replace(/@(everyone|here)/g, '@​$1');

      const trozos = partir(texto || '👍');
      for (let i = 0; i < trozos.length; i++) {
        const ultimo = i === trozos.length - 1;
        const envio = { content: trozos[i], allowedMentions: { parse: [], repliedUser: true } };
        if (ultimo && archivos.length) envio.files = archivos;
        if (ultimo && embedFoto) envio.embeds = [embedFoto];
        if (i === 0) await mensaje.reply(envio);
        else await mensaje.channel.send({ ...envio, allowedMentions: { parse: [] } });
      }

      log(`💬 [Chat ${proveedor} ${Date.now() - t0} ms] ${nombre}: "${pregunta.slice(0, 80)}"${imagenes.length ? ` +${imagenes.length} img` : ''} → "${texto.slice(0, 100).replace(/\n/g, ' ')}"`);
      h.recordar?.({ usuarioId: userId, nombre, dijo: pregunta || '(mandó una imagen)', respuesta: texto.slice(0, 500), preguntarIA: h.preguntarIA });
    } finally {
      clearInterval(typing);
    }
  }

  client.on('messageCreate', async (mensaje) => {
    try {
      if (mensaje.author.bot || !mensaje.guild || !client.user) return;
      if (!mensaje.mentions.has(client.user, { ignoreEveryone: true, ignoreRoles: true })) return;

      const canales = (process.env.PEPE_CANALES_TEXTO || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (canales.length && !canales.includes(mensaje.channelId)) return;

      const ahora = Date.now();
      if (ahora - (ultimaVez.get(mensaje.author.id) || 0) < ESPERA_POR_PERSONA_MS) {
        await mensaje.react('⏳').catch(() => {});
        return;
      }
      if (trabajando >= MAX_A_LA_VEZ) {
        await mensaje.react('⏳').catch(() => {});
        return;
      }
      ultimaVez.set(mensaje.author.id, ahora);
      trabajando++;
      try {
        await contestar(mensaje);
      } finally {
        trabajando--;
      }
    } catch (e) {
      log(`❌ [Chat] ${e.message}`);
      mensaje.reply({ content: 'Se me fue la onda, intenta otra vez en un ratito.', allowedMentions: { parse: [], repliedUser: true } }).catch(() => {});
    }
  });

  log(`💬 [Chat] Pepe contesta en el chat cuando lo etiquetan (${clave() ? 'Gemini' : 'sin GEMINI_API_KEY: solo texto'}).`);
}
