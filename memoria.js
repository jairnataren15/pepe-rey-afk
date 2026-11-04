// ───────────────────────────────────────────────────────────────
// MEMORIA DE PEPE: worker noxz-pepe-memoria (Cloudflare D1, gratis)
// ───────────────────────────────────────────────────────────────
// Si no hay clave o el worker falla, Pepe sigue hablando sin memoria: nada de
// esto puede trabarlo. Solo se guarda lo que le hablan a él, no la charla del
// canal; las conversaciones duran 7 días y los datos aprendidos 30.

const URL_BASE = () => (process.env.MEMORIA_URL?.trim() || 'https://noxz-pepe-memoria.noxz-guild.workers.dev').replace(/\/$/, '');
const CLAVE = () => process.env.MEMORIA_CLAVE?.trim();
const CONTEXTO_VACIO = { recientes: [], delUsuario: [], hechos: [], frases: [] };

async function pedir(ruta, opciones = {}, ms = 3000) {
  const r = await fetch(`${URL_BASE()}${ruta}`, {
    ...opciones,
    headers: { Authorization: `Bearer ${CLAVE()}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(ms),
  });
  if (!r.ok) throw new Error(`memoria ${r.status}`);
  return r.json();
}

// El contexto se guarda aquí y se refresca aparte, para no retrasar la respuesta
const cache = new Map();
async function refrescar(usuarioId) {
  const c = await pedir(`/contexto?usuarioId=${encodeURIComponent(usuarioId)}`);
  cache.set(usuarioId, c);
  return c;
}

export async function leerContexto(usuarioId) {
  if (!CLAVE()) return CONTEXTO_VACIO;
  const guardado = cache.get(usuarioId);
  if (guardado) {
    refrescar(usuarioId).catch(() => {});
    return guardado;
  }
  // Primera vez: se espera un poco, pero no más de lo que tarda en contestar la IA
  return Promise.race([
    refrescar(usuarioId).catch(() => CONTEXTO_VACIO),
    new Promise((ok) => setTimeout(() => ok(CONTEXTO_VACIO), 500)),
  ]);
}

function hace(ts) {
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`;
}

// El bloque que se añade al prompt de Pepe
export function bloqueMemoria(c, nombre, yaEnConversacion) {
  const partes = [];
  if (c.hechos?.length) partes.push(`LO QUE RECUERDAS DE ${nombre}:\n- ${c.hechos.join('\n- ')}`);
  if (!yaEnConversacion && c.recientes?.length) {
    partes.push(`LO ÚLTIMO QUE PLATICARON (por si viene al caso):\n${c.recientes.map((m) => `(${hace(m.ts)}) ${m.rol === 'assistant' ? 'Tú' : m.nombre}: ${m.texto}`).join('\n')}`);
  }
  if (c.frases?.length) partes.push(`TUS ÚLTIMAS FRASES. NO repitas estas ideas, remates ni insultos; di algo distinto:\n- ${c.frases.join('\n- ')}`);
  return partes.length ? `\n\nMEMORIA (úsala solo si viene al caso, sin recitarla ni decir que tienes memoria):\n${partes.join('\n\n')}` : '';
}

const pendientes = new Map();

export function recordar({ usuarioId, nombre, dijo, respuesta, preguntarIA }) {
  if (!CLAVE()) return;
  (async () => {
    await pedir('/mensaje', { method: 'POST', body: JSON.stringify({ usuarioId, nombre, rol: 'user', texto: dijo }) });
    if (respuesta) await pedir('/mensaje', { method: 'POST', body: JSON.stringify({ usuarioId, nombre, rol: 'assistant', texto: respuesta }) });
    await refrescar(usuarioId);

    // Cada 5 cosas que le dicen, saca qué vale la pena recordar de esa persona
    const lista = pendientes.get(usuarioId) || [];
    lista.push(dijo);
    if (lista.length < 5) { pendientes.set(usuarioId, lista); return; }
    pendientes.delete(usuarioId);
    const hechos = await extraerHechos(nombre, lista, preguntarIA);
    if (hechos.length) await pedir('/hechos', { method: 'POST', body: JSON.stringify({ usuarioId, nombre, hechos }) });
  })().catch((e) => console.warn('⚠️ [Memoria]:', e.message));
}

async function extraerHechos(nombre, frases, preguntarIA) {
  const { text } = await preguntarIA([
    {
      role: 'system',
      content: `Sacas datos para que un bot de Discord de un gremio de Aion 2 recuerde a sus compas. Te paso lo que dijo ${nombre}. Devuelve SOLO un arreglo JSON con 0 a 3 frases cortas sobre esa persona que sirvan para platicar después: su clase o personaje, gustos, juegos, rivales, bromas recurrentes, qué le pasó en el juego.
No guardes datos privados: nombre real, dirección, trabajo, escuela, salud, familia, dinero, teléfono, correos ni contraseñas. No inventes nada. Si no hay nada que valga la pena, devuelve [].`,
    },
    { role: 'user', content: frases.join('\n') },
  ]);
  const m = (text || '').match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const l = JSON.parse(m[0]);
    return Array.isArray(l) ? l.filter((h) => typeof h === 'string') : [];
  } catch {
    return [];
  }
}
