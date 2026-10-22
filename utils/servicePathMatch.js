/**
 * Utilidades de matching jerarquico de servicios (arbol de dispositivos).
 *
 * Contexto: conviven dos formatos de path en el MISMO campo
 * (hogarProfile.services[].path):
 *   - '/'  generado por el landing desde la coleccion Service  ("hogar/linea-blanca/heladera")
 *   - '.'  generado por el dashboard desde data/serviceTree.js ("hogar.linea-blanca.heladera")
 *
 * Por eso todo el matching historico usaba regex con separadores
 * intercambiables ([./] y [- ]). Eso resolvia la normalizacion pero perdia
 * el anclaje: los regex quedaban SIN '^', asi que "heladera" matcheaba
 * "heladeras-industriales". Aqui se centraliza el matching con jerarquia real.
 *
 * DIRECCION DE LA JERARQUIA (requisito del usuario):
 *   - El profesional registro un ANCESTRO y se busca un DESCENDIENTE
 *     -> MATCH.  guardo 'hogar/linea-blanca', se busca '.../heladera'.
 *   - El profesional registro un DESCENDIENTE y se busca el ANCESTRO
 *     -> NO MATCH.  guardo '.../heladera', se busca 'hogar/linea-blanca'
 *     NO lo hace aparecer en toda la categoria.
 *   - El guardado lleva MARCA (4o segmento) y se busca el dispositivo
 *     -> MATCH. '.../heladera/Ariston' responde a la busqueda de '.../heladera'.
 */

// Separador canonico interno. Unico punto de verdad.
const SEP = '/';

// data/serviceTree.js: Entorno > Categoria > Dispositivo > Marca.
// Un path de mas de 3 segmentos solo existe si el ultimo es una MARCA, que es
// un refinamiento del MISMO dispositivo y por lo tanto debe seguir matcheando.
const DEVICE_DEPTH = 3;

/**
 * Normaliza cualquier path a forma canonica con '/'.
 * 'hogar.linea-blanca.heladera' -> 'hogar/linea-blanca/heladera'
 * 'hogar/linea-blanca/heladera' -> 'hogar/linea-blanca/heladera'
 * Acepta espacios, %, y separadores mixtos.
 */
function normalizeServicePath(input) {
  if (!input) return '';
  let s = String(input).trim();
  if (!s) return '';

  // El landing manda el path url-encoded dentro del query string.
  try { s = decodeURIComponent(s); } catch (e) { /* si no es valido, se usa tal cual */ }

  s = s.toLowerCase();

  // Los guiones son separadores de PALABRA dentro de un segmento
  // ('linea-blanca'), no separadores de ruta: nunca se tocan.
  // Los espacios tampoco: el path de la coleccion Service llega url-encoded
  // y un espacio forma parte del nombre del segmento.
  const segs = s.split(/[./]+/)
    .map(seg => seg.trim())
    .filter(Boolean);

  return segs.join(SEP);
}

/** Escapa caracteres con significado especial en regex. */
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Convierte un segmento en un patron que acepta guion o espacio interno. */
function segPattern(seg) {
  return escapeRegex(seg).replace(/-/g, '[- ]');
}

/** Clase de separadores de RUTA: '/', '.' o espacios. */
const SEP_CLASS = '[-/.\\s]+';

/**
 * Construye un regex ANCLADO que matchea los paths ALMACENADOS validos para la
 * busqueda `servicePath`, respetando la direccion de jerarquia documentada.
 *
 * @param {string} servicePath path buscado (cualquier formato)
 * @returns {string|null} fuente de regex, o null si el path es invalido
 */
function servicePrefixRegex(servicePath) {
  const norm = normalizeServicePath(servicePath);
  if (!norm) return null;

  const segs = norm.split(SEP).filter(Boolean);
  if (!segs.length) return null;

  // Un solo segmento: no se puede anclar al inicio ---
  // Las landings SEO (/entornos/<slug>, /categorias/<slug>) mandan
  // service=heladera sin area, y la base guarda la marca al final
  // ('hogar.linea-blanca.heladera.Ariston'). El segmento buscado debe
  // aparecer en cualquier posicion, pero SIEMPRE como segmento completo.
  if (segs.length === 1) {
    // 'heladera' NO matchea 'heladeras-industriales' ni 'superheladera',
    // pero SI 'hogar/linea-blanca/heladera'.
    return '(?:^|[/.])' + segPattern(segs[0]) + '(?:$|[/.])';
  }

  const exact = segs.map(segPattern).join(SEP_CLASS);

  // --- Dos segmentos: CATEGORIA. Aqui SI se agregan los descendientes ---
  // El usuario eligio el modelo hibrido: al buscar un area o una categoria
  // deben aparecer los profesionales de todo lo que hay debajo, porque nadie
  // guarda el area ni la categoria 'peladas' en las areas que tienen
  // dispositivos (p.ej. nadie tiene 'hogar/linea-blanca', solo
  // 'hogar/linea-blanca/heladera/Ariston'). Sin esto, buscar la categoria
  // devolveria 0 resultados. Sigue ANCLADO, asi que una rama hermana
  // ('hogar/cocina/horno') no matchea 'hogar/linea-blanca'.
  if (segs.length === 2) {
    return '^' + exact + '(?:[/.][\\s\\S]*)?$';
  }

  // --- Tres o mas segmentos: DISPOSITIVO. Estricto ---
  // Solo matchea el path exacto (con o sin marca) o un ANCESTRO guardado
  // (quien registro 'Linea Blanca' responde a la busqueda de 'Heladera').
  // Un dispositivo hermano NO matchea: elegir un dispositivo no te hace
  // aparecer en el resto de dispositivos de la misma categoria.
  const prefixes = [];
  for (let k = 1; k <= segs.length; k++) {
    prefixes.push('^' + segs.slice(0, k).map(segPattern).join(SEP_CLASS) + '$');
  }
  // El path guardado puede llevar la MARCA como 4to segmento: es un
  // refinamiento del MISMO dispositivo, asi que responde a la busqueda.
  prefixes.push('^' + exact + '[/.][\\s\\S]*$');

  return '(?:' + prefixes.join('|') + ')';
}

/**
 * Indica si un path almacenado responde a la busqueda `wantedPath`.
 * Equivalente en JS de servicePrefixRegex (no se puede usar regex de Mongo aqui).
 *
 * @param {string} storedPath path del profesional
 * @param {string} wantedPath path buscado
 * @returns {boolean}
 */
function servicePathMatches(storedPath, wantedPath) {
  const a = normalizeServicePath(storedPath);
  const b = normalizeServicePath(wantedPath);
  if (!a || !b) return false;
  if (a === b) return true;

  const aSegs = a.split(SEP).filter(Boolean);
  const bSegs = b.split(SEP).filter(Boolean);

  // Mismo caso especial que servicePrefixRegex: busqueda de un solo segmento
  // (landings SEO ?service=heladera). El segmento debe aparecer en el path
  // guardado como segmento COMPLETO, en cualquier posicion.
  if (bSegs.length === 1) {
    return aSegs.indexOf(bSegs[0]) !== -1;
  }

  // Busqueda de AREA o CATEGORIA: se agregan los descendientes (modelo
  // hibrido elegido por el usuario). Sigue siendo coherente con el regex:
  // 'hogar/linea-blanca' trae 'hogar/linea-blanca/heladera/Ariston' pero no
  // 'hogar/cocina/horno', porque la comparacion es por segmentos, no por
  // prefijo de texto.
  if (bSegs.length < DEVICE_DEPTH) {
    if (aSegs.length < bSegs.length) return false;
    for (let i = 0; i < bSegs.length; i++) {
      if (aSegs[i] !== bSegs[i]) return false;
    }
    return true;
  }

  // Busqueda de DISPOSITIVO: estricta.
  // Ancestro: guardo 'hogar/linea-blanca', se busca '.../heladera' -> match.
  if (b.startsWith(a + SEP)) return true;

  // Refinamiento por marca: guardado '.../heladera/Ariston', buscado
  // '.../heladera' (nivel dispositivo) -> match. Un path mas largo que NO
  // sea nivel dispositivo es un dispositivo hermano, y no matchea.
  if (bSegs.length >= DEVICE_DEPTH && a.startsWith(b + SEP)) return true;

  return false;
}

/**
 * Devuelve la especificidad (numero de segmentos) del path normalizado.
 * Se usa para puntuar: un match exacto vale mas que un match por ancestro.
 */
function servicePathDepth(servicePath) {
  const n = normalizeServicePath(servicePath);
  return n ? n.split(SEP).filter(Boolean).length : 0;
}

/**
 * Prefijos canonicos de un path, para buscar por igualdad en vez de por regex.
 *
 * Guardar 'hogar/linea-blanca/heladera/Ariston' implica que el profesional
 * tambien tiene que aparecer si buscan 'hogar', 'hogar/linea-blanca' o
 * 'hogar/linea-blanca/heladera'. servicePrefixRegex() expresa eso con una
 * alternancia de ramas ancladas, pero como la regex completa NO arranca con
 * '^', MongoDB no puede acotar el indice y termina en collscan. Guardando los
 * prefijos en un array la query es igualdad pura y si usa indice.
 *
 * Se generan las dos variantes de split porque el regex acepta tres
 * separadores (SEP_CLASS = '[-/.\s]+') y la base todavia tiene paths legacy
 * con puntos y con espacios. 'hogar.linea-blanca.heladera' y
 * 'hogar linea-blanca heladera' tienen que ser localizables igual que
 * 'hogar/linea-blanca/heladera'.
 *
 * @param {string|string[]} paths  uno o varios paths guardados
 * @returns {string[]} prefijos unicos, en forma canonica
 */
function servicePathPrefixes(paths) {
  const lista = Array.isArray(paths) ? paths : [paths];
  const out = new Set();
  for (const raw of lista) {
    // Acepta tanto strings sueltos como los objetos { path, name, ... } que
    // guarda hogarProfile.services.
    const valor = raw && typeof raw === 'object' ? raw.path : raw;
    if (!valor) continue;
    let s = String(valor).trim();
    if (!s) continue;
    try { s = decodeURIComponent(s); } catch (e) { /* si no es valido, se usa tal cual */ }
    s = s.toLowerCase();
    // split por [./]+ conserva los espacios DENTRO de un segmento;
    // split por [./\s]+ los trata como separadores (paths legacy).
    for (const re of [/[./]+/, /[./\s]+/]) {
      const segs = s.split(re).map(seg => seg.trim()).filter(Boolean);
      for (let k = 1; k <= segs.length; k++) out.add(segs.slice(0, k).join(SEP));
    }
  }
  return [...out];
}

/**
 * Valor para consultar con $in sobre hogarProfile.servicePaths.
 *
 * Devuelve UN solo elemento: el path buscado completo. El array del documento
 * ya contiene todos sus ancestros, asi que un unico $in matchea a la vez:
 *   - el doc que guardo exactamente ese path,
 *   - cualquier descendiente (buscar la categoria trae sus dispositivos),
 *   - el mismo dispositivo con la MARCA como 4to segmento.
 *
 * Ojo: NO se deben agregar los prefijos del query. 'hogar/linea-blanca' con
 * $in ['hogar','hogar/linea-blanca'] matchearia tambien 'hogar/linea-marron/...'
 * porque 'hogar' esta en el array de todos los docs del area.
 *
 * Para un solo segmento (landings SEO que mandan service=heladera sin area) no
 * sirve la igualdad: hay que buscar el segmento en cualquier posicion. Ahi el
 * caller tiene que seguir usando servicePrefixRegex().
 *
 * @param {string} servicePath
 * @returns {string[]|null} [path canonico] o null si hay que usar regex
 */
function servicePathLookupValues(servicePath) {
  const norm = normalizeServicePath(servicePath);
  if (!norm) return null;
  const segs = norm.split(SEP).filter(Boolean);
  // Un solo segmento: lo resuelve el regex, no la igualdad.
  if (segs.length < 2) return null;
  return [norm];
}

module.exports = {
  SEP,
  DEVICE_DEPTH,
  normalizeServicePath,
  escapeRegex,
  servicePrefixRegex,
  servicePathMatches,
  servicePathDepth,
  servicePathPrefixes,
  servicePathLookupValues
};
