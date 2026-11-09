// Decide qué canción pidieron y comprueba que el audio encontrado sea esa misma.
// Sin Discord ni estado, para poder probarlo aparte.

const VERSION_DISTINTA = /\b(remix|rmx|mix|slowed|sped|nightcore|cover|mashup|edit|karaoke|instrumental|tribute|tributo|live|en vivo|ac[uú]stic[oa]?|acoustic|8d|bass boost(?:ed)?|reverb|tutorial|reacci[oó]n|reaction|lullaby|pvz|humor|1920)\b/i;
const VIDEO_QUE_NO_SIRVE = /\b(dance video|coreograf[ií]a|choreography|behind the scenes|detr[aá]s de c[aá]maras)\b/i;
const ARTISTA_DE_RELLENO = /lullab|karaoke|tribute|workout|cover band|music experience/i;

export function normalizar(texto) {
  return (texto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const palabras = (texto) => normalizar(texto).split(' ').filter(Boolean);

function distanciaUnaONinguna(a, b) {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

// Whisper cambia alguna letra: una de diferencia cuenta en palabras de 5 letras o más
const esta = (palabra, lista) => lista.some((otra) => distanciaUnaONinguna(palabra, otra));

// Quita solo el pedido («Pepe pon la de…»): lo demás puede ser parte del título
export function quitarPedido(texto) {
  let q = (texto || '').toLowerCase()
    .replace(/[¿?¡!.,;:"'()[\]]/g, ' ')
    .replace(/\b(?:waifi|wifi|wi[\s-]fi|güaifi|guaifi)\b/g, 'wifey')
    .replace(/\b(?:aribela|arivela|aria bella|ariveya|aribella|ariabela|ariabella)\b/g, 'aria bela')
    .replace(/\b(?:pilate|pilats|pirates)\b/g, 'pilates')
    .replace(/\s+/g, ' ')
    .trim();
  const inicio = /^(?:pepe|oye|hey|porfa|por favor|carnal|wey|güey|compa|pon(?:te|me|nos|le)?|busca(?:te|me)?|reproduce|toca(?:te)?|su[eé]lta(?:te)?|avi[eé]nta(?:te)?|m[eé]tele|c[aá]nta(?:te)?|c[oó]loca|suena|(?:una|la|el|esa|esta|un|unas)?\s*(?:canci[oó]n|canciones|rolas?|temas?|m[uú]sica|pista|video|audio)(?:\s+(?:que se llama|llamada|de))?|(?:la|el|una|unas|algo|esa)\s+de|que se llama|de)\s+/;
  // Muletillas al final («…de Aria Bela, mijo»): sin quitarlas, Deezer no la reconoce
  const fin = /\s+(?:porfa|plis|please|por favor|carnal|wey|güey|we|compa|compadre|pepe|mijo|mija|mi rey|bro|hermano|vato|pues|ya|ahorita|(?:en|de) (?:youtube|spotify|deezer|soundcloud))$/;
  for (let antes = ''; antes !== q;) {
    antes = q;
    q = q.replace(inicio, '').replace(fin, '').trim();
  }
  return q;
}

// Solo una respuesta clara elige opción: «la 2», «opción dos», «Pepe, pon la primera»
export function leerSeleccion(textoMinusculas) {
  const t = normalizar(textoMinusculas).replace(/\b(?:pepe|porfa|por favor|carnal|wey|guey|compa)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const m = t.match(/^(?:(?:pon|ponme|ponle|dale|quiero|elijo|mejor)\s+)*(?:(?:la|el)\s+)?(?:opcion\s+|numero\s+)?(1|uno|primera?|2|dos|segund[ao]|3|tres|tercera?)(?:\s+opcion)?$/);
  if (!m) return -1;
  if (/^(1|uno|prim)/.test(m[1])) return 0;
  if (/^(2|dos|seg)/.test(m[1])) return 1;
  return 2;
}

export function pidenCallar(textoMinusculas) {
  const t = normalizar(textoMinusculas);
  if (/\bno te calles\b/.test(t)) return false;
  return /\b(callate|callese|callense|te calles|silencio|deja de hablar|ya no hables|ya estuvo|shh+)\b/.test(t);
}

// Lo que Pepe lee del menú: lo justo para distinguir las opciones
export function tituloParaMenu(cancion) {
  if (cancion.catalogo) return `${cancion.catalogo.titulo} de ${cancion.catalogo.artista}`;
  const limpio = (cancion.title || '')
    .replace(/[([{~][^)\]}~]*[)\]}~]/g, ' ')
    .replace(/[|#_~\-–—]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return limpio.split(' ').slice(0, 6).join(' ');
}

export function leerCancelacion(textoMinusculas) {
  const t = normalizar(textoMinusculas);
  const sinPepe = t.replace(/\bpepe\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^(?:cancela|cancelar|ninguna|olvidalo|ya no|no pongas nada)$/.test(sinPepe)) return true;
  return /\bpepe\b/.test(t) && /\b(?:cancela|cancelar|ninguna|olvidalo|no pongas nada)\b/.test(t);
}

function formatoDuracion(seg) {
  return `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;
}

function tituloSinInvitados(titulo) {
  return (titulo || '').replace(/\s*[([][^)\]]*\b(?:feat|ft|with|con)\b[^)\]]*[)\]]/gi, '').trim();
}

export function pistaDeDeezer(t) {
  const titulo = tituloSinInvitados(t.title_short || t.title);
  const artista = t.artist?.name || '';
  return { titulo, artista, version: `${t.title || ''} ${t.title_version || ''}`, duracion: t.duration || 0, rank: t.rank || 0, enlace: t.link, isrc: t.isrc };
}

export async function buscarEnDeezer(query) {
  // «numb de linkin park»: también sin el «de», que despista a su buscador
  const consultas = new Set([query, query.replace(/\s+de\s+(?!.*\s+de\s+)/, ' ')]);
  const listas = await Promise.all([...consultas].map(async (q) => {
    const r = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=25`, { signal: AbortSignal.timeout(3000) });
    const d = await r.json();
    if (!r.ok || d.error) throw new Error(`Deezer ${r.status} ${d.error?.message || ''}`.trim());
    return d.data || [];
  }));
  const unicas = new Map();
  for (const t of listas.flat()) unicas.set(t.id, t);
  return [...unicas.values()].map(pistaDeDeezer);
}

// Devuelve { directa } si no hay duda, { opciones } si hay varias posibles, o null si no es del catálogo
export function decidirCancion(query, pistas) {
  const pideVersion = VERSION_DISTINTA.test(query);
  const pedido = palabras(query);
  if (!pedido.length) return null;

  const mejores = new Map();
  const soloOtraVersion = [];
  for (const p of pistas) {
    if (ARTISTA_DE_RELLENO.test(p.artista)) continue;
    if (!pideVersion && VERSION_DISTINTA.test(p.version)) {
      soloOtraVersion.push(p);
      continue;
    }
    const clave = `${normalizar(p.titulo)}|${normalizar(p.artista)}`;
    if (!mejores.has(clave) || mejores.get(clave).rank < p.rank) mejores.set(clave, p);
  }

  const analizar = (p) => {
    const titulo = palabras(p.titulo);
    const artista = palabras(p.artista);
    const tituloCompleto = titulo.length > 0 && titulo.every((x) => esta(x, pedido));
    const resto = pedido.filter((x) => !esta(x, titulo) && !['de', 'del', 'por', 'y', 'ft', 'feat', 'con'].includes(x));
    const delArtista = resto.filter((x) => esta(x, artista));
    const cobertura = pedido.filter((x) => esta(x, titulo) || esta(x, artista)).length / pedido.length;
    return { pista: p, tituloCompleto, resto, delArtista, cobertura };
  };
  const nombraAlArtista = (a) => a.tituloCompleto && a.resto.length > 0 && a.delArtista.length / a.resto.length >= 0.5;
  const analizadas = [...mejores.values()].map(analizar).sort((a, b) => b.pista.rank - a.pista.rank);

  const conArtista = analizadas.filter(nombraAlArtista);
  if (conArtista.length) return { directa: conArtista[0].pista };

  // A Deezer le falta la de estudio («Numb» solo la tiene en vivo): sirve para saber
  // canción y artista, pero sin su duración porque el video será otra grabación.
  const enOtraVersion = soloOtraVersion.map(analizar).find(nombraAlArtista);
  if (enOtraVersion) {
    const { pista } = enOtraVersion;
    return { directa: { ...pista, titulo: pista.titulo.replace(/\s*[([].*$/, '').trim(), version: '', duracion: 0 } };
  }

  const exactas = analizadas.filter((a) => a.tituloCompleto && a.resto.length === 0);
  if (exactas.length === 1 || (exactas.length > 1 && exactas[0].pista.rank >= exactas[1].pista.rank * 1.8)) {
    return { directa: exactas[0].pista };
  }
  if (exactas.length > 1) return { opciones: exactas.slice(0, 3).map((a) => a.pista) };

  const parciales = analizadas.filter((a) => a.cobertura >= 0.6);
  if (parciales.length) return { opciones: parciales.slice(0, 3).map((a) => a.pista) };
  return null;
}

export function pistaComoCancion(p) {
  return { title: `${p.titulo} - ${p.artista}`, url: null, enlace: p.enlace, timestamp: p.duracion ? formatoDuracion(p.duracion) : '?:??', seconds: p.duracion, author: p.artista, catalogo: p };
}

function titulosCoinciden(pista, texto, dueno) {
  const enTexto = palabras(`${texto} ${dueno}`);
  const titulo = palabras(pista.titulo);
  const artista = palabras(pista.artista);
  if (!titulo.every((x) => esta(x, palabras(texto)))) return false;
  return artista.some((x) => x.length > 2 && esta(x, enTexto));
}

const RELLENO_DE_VIDEO = ['official', 'oficial', 'music', 'video', 'audio', 'letra', 'lyrics', 'lyric', 'hd', 'hq', '4k', 'upgrade', 'remastered', 'visualizer', 'topic', 'ft', 'feat', 'con', 'y', 'de'];

function esVersionQueNoEs(pista, texto) {
  return VERSION_DISTINTA.test(texto) && !VERSION_DISTINTA.test(pista.version);
}

// El video de YouTube que sí es esa canción, o null
export function elegirVideo(pista, videos) {
  let elegido = null;
  let puntos = -1;
  for (const v of videos) {
    const dueno = v.author?.name || v.author || '';
    if (!titulosCoinciden(pista, v.title, dueno) || esVersionQueNoEs(pista, v.title) || VIDEO_QUE_NO_SIRVE.test(v.title)) continue;
    const dif = Math.abs((v.seconds || 0) - pista.duracion);
    if (pista.duracion && dif > 45) continue;
    let p = !pista.duracion ? 1 : dif <= 5 ? 4 : dif <= 15 ? 3 : 1;
    if (palabras(pista.artista).some((x) => x.length > 2 && esta(x, palabras(dueno)))) p += 2;
    if (/\b(audio|topic)\b/i.test(`${v.title} ${dueno}`)) p += 1;
    // Palabras de más delatan otra canción («Numb / Encore»): pesan más si no hay duración para comparar
    const propias = [...palabras(pista.titulo), ...palabras(pista.artista), ...palabras(dueno)];
    const deMas = palabras(v.title).filter((x) => !esta(x, propias) && !RELLENO_DE_VIDEO.includes(x)).length;
    p -= deMas * (pista.duracion ? 0.25 : 1);
    if (p > puntos) { puntos = p; elegido = v; }
  }
  return elegido;
}

// ¿Esta pista de SoundCloud es la canción pedida?
export function coincideSoundCloud(info, nombre, usuario, duracion) {
  if (info.catalogo) {
    return titulosCoinciden(info.catalogo, nombre, usuario)
      && !esVersionQueNoEs(info.catalogo, nombre)
      && (!info.catalogo.duracion || !duracion || Math.abs(duracion - info.catalogo.duracion) <= 20);
  }
  // Sin catálogo (un video cualquiera de YouTube): casi todas las palabras de su título
  const titulo = palabras(info.title.replace(/[([][^)\]]*[)\]]/g, ' ').replace(/\b(video|oficial|official|audio|letra|lyrics)\b/gi, ' '))
    .filter((x) => !['la', 'el', 'de', 'los', 'las', 'y', 'the', 'a', 'en', 'un', 'una'].includes(x));
  if (!titulo.length) return false;
  const texto = palabras(`${nombre} ${usuario}`);
  const parecido = titulo.filter((x) => esta(x, texto)).length / titulo.length;
  return parecido >= 0.75
    && !(VERSION_DISTINTA.test(nombre) && !VERSION_DISTINTA.test(info.title))
    && (!info.seconds || !duracion || Math.abs(duracion - info.seconds) <= 15);
}
