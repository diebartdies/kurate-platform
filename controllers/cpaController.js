/**
 * Proxy to Correo Argentino's public CPA web service so the app can auto-fill
 * Código Postal (CPA) from an address without shipping the (huge) national
 * street dictionary. If Correo is unreachable the lookup simply fails and the
 * field stays editable.
 *
 * Reference: https://www.correoargentino.com.ar/formularios/cpa
 */

const CORREO_API = 'https://www.correoargentino.com.ar/sites/all/modules/custom/ca_forms/api/wsFacade.php';
const CABA_LOCALIDAD_ID = 5001; // "Ciudad Autonoma Buenos Aires"
const LIST_TTL_MS = 6 * 60 * 60 * 1000; // keep province localidad lists 6 hours

// Normalized province name -> Correo Argentino province letter (cpa.js select).
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

const localidadesCache = new Map(); // province letter -> { fetchedAt, list }

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

// Correo's own guidance: enter the street without its type ("Av.", "Calle",
// "Diagonal", ...) so e.g. "Diagonal 74" must be sent as "74".
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
  // Fallback: the typed city contains the canonical localidad name (longest first).
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

exports.lookup = async (req, res) => {
  try {
    const { province, city, street, number } = req.body || {};
    const letter = PROVINCE_TO_LETTER[normalize(province)];
    if (!letter) {
      return res.status(400).json({ success: false, error: 'Provincia no reconocida' });
    }
    const calle = stripStreetType(street);
    const altura = String(number || '').trim();
    if (!calle) return res.status(400).json({ success: false, error: 'Falta la calle' });
    if (!/^[0-9]{1,10}$/.test(altura)) {
      return res.status(400).json({ success: false, error: 'La altura debe ser numérica' });
    }

    let localidadId = CABA_LOCALIDAD_ID;
    if (letter !== 'C') {
      const list = await fetchLocalidades(letter);
      const localidad = matchLocalidad(list, city);
      if (!localidad) {
        return res.status(200).json({ success: false, error: 'Localidad no encontrada', source: 'correo' });
      }
      localidadId = localidad.id;
    }

    const cpa = await queryCpa(letter, localidadId, calle, altura);
    if (!cpa) {
      return res.status(200).json({ success: false, error: 'No se encontró el CPA para esa dirección', source: 'correo' });
    }
    res.json({ success: true, cpa, source: 'correo' });
  } catch (err) {
    res.status(502).json({ success: false, error: 'Servicio de CPA no disponible' });
  }
};