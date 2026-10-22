/**
 * Busca el Codigo Postal Argentino (CPA) de una direccion.
 *
 * Se extrajo de controllers/cpaController.js para poder reutilizarlo desde el
 * servidor (completado automatico del CP al lanzar un aviso) sin tener que
 * llamar al endpoint HTTP por loopback. Ahora el endpoint y la regla de
 * publicacion usan el MISMO codigo, asi no pueden desincronicarse.
 */

const CORREO_API = 'https://www.correoargentino.com.ar/sites/all/modules/custom/ca_forms/api/wsFacade.php';
const CABA_LOCALIDAD_ID = 5001; // "Ciudad Autonoma Buenos Aires"
const LIST_TTL_MS = 6 * 60 * 60 * 1000; // cache de listas de localidades 6 horas

// Provincia normalizada -> letra de provincia de Correo Argentino.
const PROVINCE_TO_LETTER = {
  'CABA': 'C',
  'CIUDAD AUTONOMA DE BUENOS AIRES': 'C',
  'CIUDAD AUTONOMA BUENOS AIRES': 'C',
  'CAPITAL FEDERAL': 'C',
  'BUENOS AIRES': 'B',
  'CATAMARCA': 'K',
  'CHACO': 'H',
  'CHUBUT': 'U',
  'CORDOBA': 'X',
  'CORRIENTES': 'W',
  'ENTRE RIOS': 'E',
  'FORMOSA': 'P',
  'JUJUY': 'Y',
  'LA PAMPA': 'L',
  'LA RIOJA': 'F',
  'MENDOZA': 'M',
  'MISIONES': 'N',
  'NEUQUEN': 'Q',
  'RIO NEGRO': 'R',
  'SALTA': 'A',
  'SAN JUAN': 'J',
  'SAN LUIS': 'D',
  'SANTA CRUZ': 'Z',
  'SANTA FE': 'S',
  'SANTIAGO DEL ESTERO': 'G',
  'TIERRA DEL FUEGO': 'V',
  'TUCUMAN': 'T'
};

const localidadesCache = new Map(); // letra -> { fetchedAt, list }

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/'/g, ' ')
    .replace(/[.:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Correo Argentino pide la calle SIN su tipo ("Av.", "Calle", "Diagonal", ...).
const STREET_TYPE_RE = /^(AVENIDA|AV|CALLE|CA|PASAJE|PAS|PJE|DIAGONAL|DIAG|BOULEVARD|BV|BD|RUTA|R|CAMINO|CAM|ACCESO|AUTOPISTA)\s+/i;

function stripStreetType(street) {
  return normalize(street).replace(STREET_TYPE_RE, '');
}

async function postToCorreo(params) {
  const res = await fetch(CORREO_API, {
    method: 'POST',
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(12000),
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      'Referer': 'https://www.correoargentino.com.ar/formularios/cpa'
    }
  });
  return res.text();
}

async function fetchLocalidades(provinceLetter) {
  const cached = localidadesCache.get(provinceLetter);
  if (cached && Date.now() - cached.fetchedAt < LIST_TTL_MS) return cached.list;
  const raw = await postToCorreo({ action: 'localidades', localidad: 'none', calle: '', altura: '', provincia: provinceLetter });
  let list;
  try {
    list = JSON.parse(raw.replace(/^\uFEFF/, '').trim().replace(/^[?]/, ''));
  } catch (err) {
    throw new Error('La base de localidades no está disponible');
  }
  if (!Array.isArray(list)) throw new Error('La base de localidades no está disponible');
  localidadesCache.set(provinceLetter, { fetchedAt: Date.now(), list });
  return list;
}

function matchLocalidad(list, cityName) {
  const city = normalize(cityName);
  if (!city) return null;
  const normal = (name) => normalize(name);
  const exact = list.filter((l) => normal(l.nombre) === city);
  if (exact.length === 1) return exact[0];
  // Fallback: la ciudad tipeada contiene el nombre canonico mas largo.
  const contained = list
    .filter((l) => {
      const name = normal(l.nombre);
      return name && city.includes(name);
    })
    .sort((a, b) => normal(b.nombre).length - normal(a.nombre).length);
  return contained[0] || null;
}

async function queryCpa(provinceLetter, localidadId, calle, altura) {
  const html = await postToCorreo({
    action: 'cpa',
    localidad: String(localidadId),
    calle,
    altura,
    provincia: provinceLetter,
    departamento: ''
  });
  const match = html.match(/<span id="ncpa"[^>]*>\s*([A-Z0-9\-]+)\s*<\/span>/i);
  return match ? match[1] : null;
}

/**
 * Devuelve el CPA de una direccion, o null si no se puede determinar.
 * NUNCA tira: un fallo de Correo Argentino no debe romper la publicacion, solo
 * deja el campo CP sin completar y el requisito sigue pendiente.
 *
 * @param {{province?:string, city?:string, street?:string, number?:string}} direccion
 * @returns {Promise<string|null>}
 */
async function lookupCpa({ province, city, street, number } = {}) {
  try {
    const letter = PROVINCE_TO_LETTER[normalize(province)];
    if (!letter) return null;
    const calle = stripStreetType(street);
    const altura = String(number || '').trim();
    if (!calle) return null;
    if (!/^[0-9]{1,10}$/.test(altura)) return null;

    let localidadId = CABA_LOCALIDAD_ID;
    if (letter !== 'C') {
      const list = await fetchLocalidades(letter);
      const localidad = matchLocalidad(list, city);
      if (!localidad) return null;
      localidadId = localidad.id;
    }
    return await queryCpa(letter, localidadId, calle, altura);
  } catch (err) {
    return null;
  }
}

module.exports = {
  lookupCpa,
  normalize,
  stripStreetType,
  PROVINCE_TO_LETTER
};
