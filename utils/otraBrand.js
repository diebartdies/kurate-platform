/**
 * Marca escrita a mano por el profesional ("Otra") en el arbol de servicios.
 *
 * Cuando un dispositivo no tiene una marca en el serviceTree (o el
 * profesional trabaja con una marca que no esta cargada), puede escribirla a
 * mano. Ese texto viaja en el MISMO array `hogarProfile.services[].brands` que
 * las marcas del arbol, con el prefijo OTRA_PREFIX para poder distinguirlo.
 *
 * Decisiones de diseno:
 *  - Prefijo en vez de un campo aparte: los filtros de busqueda, la vista
 *    publica y la creacion de avisos ya leen `brands`. Un campo nuevo habria
 *   obligado a tocar todos esos caminos y a los indices existentes.
 *  - El nombre visible es el que va despues del prefijo, y se formatea como
 *    nombre propio: inicial de cada palabra en mayuscula, resto en minuscula.
 *    El usuario lo definio asi porque las marcas son nombres propios.
 *  - Se mantiene el prefijo en el dato guardado para que el round-trip
 *    (guardar -> reabrir el perfil) sea inequivoco. El texto sin prefijo nunca
 *    se persiste, asi que no puede colisionar con una marca real del arbol.
 */

const OTRA_PREFIX = '__otra__:';

// Siglas tecnicas que van en mayusculas enteras. Solo abreviaturas reales:
// sin esta lista "smart tv" se formatearia "Smart Tv" y "led" -> "Led".
// No se incluyen palabras comunes que solo parecen siglas ("split", "box").
const ACRONYMS = new Set([
  'tv', 'led', 'lcd', 'oled', 'dvd', 'cd', 'usb', 'ac', 'dc', 'ups',
  'pvc', 'wifi', 'app', 'gps', 'dvr', 'dsl', 'hd', 'sd', 'amp', 'plc',
  'dab', 'ev', 'rlv', 'xl', 'xs', 'xxl'
]);

/** Trim + colapsa espacios internos. */
function normalizeSpaces(raw) {
  return String(raw === null || raw === undefined ? '' : raw)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Capitaliza una parte de palabra respetando siglas. */
function capitalizePart(part) {
  if (!part) return '';
  if (ACRONYMS.has(part.toLowerCase())) return part.toUpperCase();
  // Una sola letra siempre en mayuscula: "a", "y", "x".
  if (part.length === 1) return part.toUpperCase();
  return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
}

/**
 * Formatea un nombre de marca: inicial de cada palabra en mayuscula, resto en
 * minuscula. Los separadores internos (guion, barra) se conservan y cada parte
 * se capitaliza, para que "aire-split" -> "Aire-Split".
 *
 *   "LAVAVAJILLAS"        -> "Lavavajillas"
 *   "estufa de patio"     -> "Estufa De Patio"
 *   "smart-tv"            -> "Smart-TV"
 *   "aires _split  "      -> "Aires Split"
 *
 * Regla de separadores: el ESPACIO siempre es frontera de palabra (se
 * conserva como espacio) y cualquier otra puntuacion pegada dentro de una
 * palabra se vuelve un guion. Asi "aire-split" -> "Aire-Split" pero
 * "lavarropas / secadora" -> "Lavarropas Secadora".
 */
function formatBrandName(raw) {
  const cleaned = normalizeSpaces(raw);
  if (!cleaned) return '';
  return cleaned
    .split(' ')
    .map((word) => {
      // Cada tanda de separadores pasa a un unico guion y se recortan los
      // guiones de los extremos, para que "aires _split" -> "Aires-Split" y
      // no "Aires -SPLIT".
      const parts = word
        .replace(/[^A-Za-z0-9À-ÿ]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .split('-')
        .filter(Boolean);
      return parts.map(capitalizePart).join('-');
    })
    .filter(Boolean)
    .join(' ');
}

/** true si la marca guardada es una entrada "otra". */
function isOtherBrand(brand) {
  return typeof brand === 'string' && brand.startsWith(OTRA_PREFIX);
}

/** Nombre visible de una marca, sin el prefijo "otra". */
function brandDisplayName(brand) {
  if (typeof brand !== 'string') return '';
  return isOtherBrand(brand) ? brand.slice(OTRA_PREFIX.length) : brand;
}

/** Devuelve el nombre limpio de la entrada "otra" de un array, o '' si no hay. */
function extractOtherBrand(brands) {
  if (!Array.isArray(brands)) return '';
  const found = brands.find(isOtherBrand);
  return found ? found.slice(OTRA_PREFIX.length).trim() : '';
}

/** Construye el valor a persistir a partir de un texto crudo del input. */
function buildOtherBrand(raw) {
  const name = formatBrandName(raw);
  return name ? OTRA_PREFIX + name : '';
}

/**
 * Sanitiza un array de marcas antes de guardarlo: aplica el mismo formato a la
 * entrada "otra", descarta entradas vacias y evita duplicados. Las marcas que
 * vienen del arbol no se tocan (ya estan formateadas y son la fuente de verdad).
 */
function sanitizeBrands(brands) {
  if (!Array.isArray(brands)) return [];
  const out = [];
  const seen = new Set();
  brands.forEach((b) => {
    if (typeof b !== 'string') return;
    const trimmed = b.trim();
    if (!trimmed) return;
    const value = isOtherBrand(trimmed) ? buildOtherBrand(trimmed.slice(OTRA_PREFIX.length)) : trimmed;
    if (!value) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(value);
  });
  return out;
}

/**
 * Sanitiza un array de servicios del perfil. Aplica sanitizeBrands a cada
 * entrada y descarta servicios que quedan sin marcas (no se puede anunciarse
 * algo sin marca) o sin path.
 */
function sanitizeServices(services) {
  if (!Array.isArray(services)) return [];
  return services
    .map((s) => {
      if (!s || typeof s !== 'object') return null;
      const path = typeof s.path === 'string' ? s.path.trim() : '';
      if (!path) return null;
      const brands = sanitizeBrands(s.brands);
      if (!brands.length) return null;
      return {
        ...s,
        path,
        name: typeof s.name === 'string' ? s.name : path.split(/[./]/).pop(),
        actions: Array.isArray(s.actions) ? s.actions.filter(a => typeof a === 'string' && a) : [],
        brands
      };
    })
    .filter(Boolean);
}

module.exports = {
  OTRA_PREFIX,
  formatBrandName,
  isOtherBrand,
  brandDisplayName,
  extractOtherBrand,
  buildOtherBrand,
  sanitizeBrands,
  sanitizeServices
};
