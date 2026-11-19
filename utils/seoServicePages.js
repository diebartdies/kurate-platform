/**
 * Páginas de SEO por servicio: /servicios/<accion>-<dispositivo>
 *
 * Estas páginas son las que compiten por búsquedas del tipo "arreglar
 * heladera", "reparo heladera", "service heladera". La idea es que para cada
 * una de las palabras que la gente usa y para cada dispositivo del árbol
 * exista una URL propia, con su título y su descripción.
 *
 * Los dispositivos salen de data/serviceTree.js, que es la misma fuente de
 * verdad que usa la app. Antes había una lista de 18 dispositivos escrita a
 * mano en este archivo, así que 141 de los 159 dispositivos del árbol no
 * tenían página: buscar "arreglar cortina" o "reparar generador" no encontraba
 * nada. Ahora se generan todas, y si mañana se agrega un dispositivo al árbol
 * la página aparece sola.
 *
 * Nota: 13 ids se repiten en varias áreas (heladera está en hogar y oficina,
 * por ejemplo). Se generan una sola vez con slug plano, y las páginas por área
 * las cubre el otro sistema de landings (/hogar/linea-blanca/...).
 */

const KURATE_BASE = 'https://kurate.drsrv.net.ar';
const serviceTree = require('../data/serviceTree');

/**
 * Localidades objetivo para SEO local. Solo CABA y Provincia de Buenos Aires
 * para evitar explosión de URLs (159 dispositivos × 9 acciones × 2 = ~2860 URLs
 * adicionales, manejable). Cada localidad tiene slug, nombre y variantes de búsqueda.
 */
const LOCATIONS = {
  caba: {
    slug: 'caba',
    name: 'CABA',
    fullName: 'Ciudad Autónoma de Buenos Aires',
    searchVariants: ['caba', 'capital federal', 'ciudad de buenos aires', 'buenos aires capital'],
    provinces: ['CABA']
  },
  'buenos-aires': {
    slug: 'buenos-aires',
    name: 'Provincia de Buenos Aires',
    fullName: 'Provincia de Buenos Aires',
    searchVariants: ['provincia de buenos aires', 'buenos aires', 'gran buenos aires', 'gba', 'zona norte', 'zona sur', 'zona oeste'],
    provinces: ['Buenos Aires']
  }
};

/**
 * Sinónimos por acción. Son las palabras que la gente realmente escribe en el
 * buscador. "reparo" y "técnico" se agregaron porque faltaban y son de las
 * búsquedas más comunes en Argentina.
 *
 * Cada clave es una forma CANÓNICA: una sola URL por intención y dispositivo.
 * Antes "reparar", "arreglar", "reparo", "service" y "reparacion" eran claves
 * separadas y cada una generaba su propia página con el mismo contenido (solo
 * cambiaba el título). Eso publicaba 4 duplicados por dispositivo en el
 * sitemap y Google los reportaba como error de indexación. Ahora las cinco
 * formas son sinónimos de la misma acción canónica y las URLs viejas
 * responden 301 hacia la canónica.
 */
const ACTION_ALIASES = {
  reparar: {
    label: 'Reparar',
    noun: 'Reparación',
    synonyms: ['reparar', 'repara', 'arreglar', 'arreglo', 'arregla', 'componer', 'reparo', 'reparación', 'service', 'servicio técnico', 'técnico', 'reparador', 'sacar', 'desinstalar']
  },
  instalar: {
    label: 'Instalar',
    noun: 'Instalación',
    synonyms: ['instalar', 'instalo', 'instala', 'colocar', 'montar', 'instalación', 'instalador']
  },
  mantener: {
    label: 'Mantener',
    noun: 'Mantenimiento',
    synonyms: ['mantener', 'mantenimiento']
  },
  revisar: {
    label: 'Revisar',
    noun: 'Revisión',
    synonyms: ['revisar', 'revisión', 'chequear', 'verificar', 'inspeccionar']
  },
  certificar: {
    label: 'Certificar',
    noun: 'Certificación',
    synonyms: ['certificar', 'certificado', 'habilitar']
  },
  comprar: {
    label: 'Comprar',
    noun: 'Compra',
    synonyms: ['comprar', 'compra', 'vender', 'venta']
  }
};

/** Acciones que tienen sentido técnico sobre un dispositivo concreto. */
const REPAIR_ACTIONS = new Set(['reparar']);
/** Acciones de servicio sobre instalaciones (no son "reparar una heladera"). */
const SERVICE_ACTIONS = new Set(['instalar', 'mantener', 'revisar', 'certificar']);
/** Acciones comerciales: no aplica a todo dispositivo, se reservan. */
const COMMERCIAL_ACTIONS = new Set(['comprar']);

/**
 * Acciones que tienen sentido para cada categoría del árbol.
 *
 * El árbol de servicios incluye cosas que no son dispositivos: "demoliciones",
 * "obras y reformas", "fumigación". Generar la matriz completa de acciones
 * sobre ellos producía URLs sin sentido ("instalar demoliciones", "mantener
 * fumigación doméstica") que Google lee como doorway pages. Cada categoría
 * declara acá las acciones que un cliente realmente buscaría.
 *
 * Las categorías que no figuran usan DEFAULT_ACTIONS.
 */
const CATEGORY_ACTIONS = {
  // Estructura y obra: se instala, se mantiene y se repara; no se "revisa".
  'obra-construccion': ['reparar', 'instalar', 'mantener'],
  'durlock-cielorrasos': ['instalar', 'reparar', 'mantener'],
  'pintura-revestimientos': ['instalar', 'reparar', 'mantener'],
  'carpinteria': ['reparar', 'instalar', 'mantener'],
  'herreria': ['reparar', 'instalar', 'mantener'],
  'vidrieria': ['reparar', 'instalar', 'mantener'],
  'tapiceria': ['reparar', 'instalar', 'mantener'],
  'cubiertas-toldos': ['reparar', 'instalar', 'mantener'],
  'plomeria': ['reparar', 'instalar', 'mantener'],
  'gas-cocinas': ['reparar', 'instalar', 'mantener', 'certificar'],
  // Sanitarios: se instalan y se mantienen; "reparar un inodoro" se dice, pero
  // la búsqueda real es "destapar / arreglar". Se deja reparar solo en hogar.
  'bano-sanitarios': ['reparar', 'instalar', 'mantener'],
  'bano-sanidad-oficina': ['instalar', 'mantener'],
  'bano-sanidad-campo': ['instalar', 'mantener'],
  'sanidad-planta': ['instalar', 'mantener', 'certificar'],
  'jardin-piscinas-campo': ['reparar', 'instalar', 'mantener'],
  'cerrajeria': ['reparar', 'instalar', 'revisar'],
  'fumigacion-saneamiento': ['mantener', 'revisar'],
  // Instalaciones que se certifican / habilitan.
  'instalaciones-electricas-oficina': ['reparar', 'instalar', 'mantener', 'certificar', 'revisar'],
  'instalaciones-electricas-industrial': ['reparar', 'instalar', 'mantener', 'certificar', 'revisar'],
  'calentamiento-agua': ['reparar', 'instalar', 'mantener', 'certificar', 'revisar'],
  'calentamiento-agua-oficina': ['reparar', 'instalar', 'mantener', 'certificar', 'revisar'],
  'calentamiento-agua-campo': ['reparar', 'instalar', 'mantener', 'certificar', 'revisar'],
  'vapor-industrial': ['instalar', 'mantener', 'certificar', 'revisar'],
  'generadores': ['reparar', 'instalar', 'mantener', 'certificar', 'revisar'],
  'climatizacion': ['reparar', 'instalar', 'mantener', 'certificar', 'revisar'],
  'climatizacion-oficina': ['reparar', 'instalar', 'mantener', 'certificar', 'revisar'],
  'climatizacion-campo': ['reparar', 'instalar', 'mantener', 'certificar', 'revisar'],
  'climatizacion-industrial': ['reparar', 'instalar', 'mantener', 'certificar', 'revisar']
};

const DEFAULT_ACTIONS = ['reparar', 'instalar', 'mantener', 'revisar'];

/**
 * De las categorías del árbol (/data/serviceTree.js) a las landings de
 * categoría que existen de verdad (/categorias/<slug>, las 9 de
 * utils/seoLandingPages.js). Antes se linkeaba /categorias/<id-del-árbol>, y
 * para 20 de las 40 categorías esa URL devuelve 301: un link muerto en cada
 * página. Solo se enlaza lo que existe.
 */
const CATEGORY_LANDING_MAP = {
  'linea-blanca': 'linea-blanca',
  'linea-blanca-oficina': 'linea-blanca',
  'linea-blanca-campo': 'linea-blanca',
  'linea-blanca-industrial': 'linea-blanca',
  'refrigeracion-comercial-oficina': 'linea-blanca',
  'climatizacion': 'clima',
  'climatizacion-oficina': 'clima',
  'climatizacion-campo': 'clima',
  'climatizacion-industrial': 'clima',
  'instalaciones-electricas-oficina': 'electricidad',
  'instalaciones-electricas-industrial': 'electricidad',
  'vapor-industrial': 'electricidad',
  'gas-cocinas': 'gas',
  'calentamiento-agua': 'gas',
  'calentamiento-agua-oficina': 'gas',
  'calentamiento-agua-campo': 'gas',
  'linea-gris': 'informatica',
  'linea-gris-oficina': 'informatica',
  'linea-gris-campo': 'informatica',
  'linea-gris-industrial': 'informatica',
  'redes-pime-telefonia': 'informatica',
  'redes-industriales': 'informatica',
  'maquinaria-oficina': 'informatica',
  'maquinaria-industrial': 'informatica',
  'cameras-seguridad': 'seguridad',
  'cerrajeria': 'seguridad',
  'plomeria': 'plomeria',
  'bano-sanitarios': 'plomeria',
  'bano-sanidad-oficina': 'plomeria',
  'bano-sanidad-campo': 'plomeria',
  'herreria': 'soldadura'
};

const CATEGORY_LABELS = {
  'linea-blanca': 'Línea blanca',
  'clima': 'Climatización',
  'electricidad': 'Electricidad',
  'gas': 'Gas',
  'informatica': 'Informática',
  'seguridad': 'Seguridad',
  'automatizacion': 'Automatización',
  'plomeria': 'Plomería',
  'soldadura': 'Soldadura'
};

/** Landings de categoría que corresponden a un dispositivo (sin repetir). */
function landingCategoriesFor(device) {
  if (!device) return [];
  const out = [];
  for (const catId of device.categoryIds) {
    const slug = CATEGORY_LANDING_MAP[catId];
    if (slug && !out.includes(slug)) out.push(slug);
  }
  return out;
}

/**
 * Áreas que no son servicio técnico: son clases particulares. "Reparar
 * geografía" o "certificar formación ética" no existen; esas páginas entraban
 * al sitemap y son el ejemplo más claro de contenido sin valor.
 */
const NON_SERVICE_AREAS = new Set(['educacion']);

/** Dispositivos que no son un bien reparable/instalable (son la obra en sí). */
const EXCLUDED_DEVICE_IDS = new Set(['demoliciones', 'obras-y-reformas']);

/**
 * Dispositivos con demanda local suficiente para justificar las variantes
 * /servicios/<accion>-<dispositivo>/caba y /buenos-aires. Sin esta lista se
 * publicaban 2 variantes locales por cada combinación nacional (incluida
 * "revisar balanzas en CABA"), que no aportan nada y multiplican el índice.
 */
const LOCAL_DEVICE_IDS = new Set([
  'heladera', 'freezer', 'lavarropas', 'secarropa', 'microondas', 'cocina-horno',
  'aire-acondicionado', 'calefactores-estufas', 'termotanque-calefon',
  'smart-tv', 'pcs-notebooks', 'impresoras-domesticas', 'routers-wifi',
  'inodoros-bidets', 'duchas-termostaticos', 'extractores-bano',
  'detapaciones', 'instalacion-tuberias', 'llaves-griferas', 'cambio-tanques',
  'apertura-cerraduras', 'cambio-cerraduras', 'puertas-blindadas',
  'pintura-interior', 'pintura-exterior',
  'muebles-a-medida', 'placards-closets', 'tabiqueria', 'cielorrasos',
  'toldos-retráctiles', 'mosquiteros',
  'camaras-ip', 'control-acceso', 'portones-rejas',
  'vidrios-templados', 'espejos',
  'fumigacion-domestica', 'control-plagas',
  'generadores', 'motores-electricos'
]);

/**
 * Dispositivos del árbol, aplanados y deduplicados por id.
 * @returns {Map<string, {id:string,name:string,plural:string,categories:string[],categoryIds:string[],areas:string[],brands:string[]}>}
 */
function collectDevices() {
  const byId = new Map();
  for (const area of serviceTree) {
    for (const cat of area.categories || []) {
      for (const device of cat.devices || []) {
        if (!device || !device.id) continue;
        if (!byId.has(device.id)) {
          byId.set(device.id, {
            id: device.id,
            name: device.name,
            // Plural: si ya viene en plural el nombre (ej. "Lavarropas") se
            // usa tal cual; si no, se agrega la s.
            plural: /s$/i.test(device.name) ? device.name : `${device.name}s`,
            categories: [],
            categoryIds: [],
            areas: [],
            brands: []
          });
        }
        const entry = byId.get(device.id);
        if (!entry.categories.includes(cat.name)) entry.categories.push(cat.name);
        if (!entry.categoryIds.includes(cat.id)) entry.categoryIds.push(cat.id);
        if (!entry.areas.includes(area.id)) entry.areas.push(area.id);
        for (const b of device.brands || []) {
          if (!entry.brands.includes(b)) entry.brands.push(b);
        }
      }
    }
  }
  return byId;
}

/** Cache porque se consulta en cada request y en el sitemap. */
let devicesCache = null;
function getDevices() {
  if (!devicesCache) devicesCache = collectDevices();
  return devicesCache;
}

/**
 * Acciones que tienen sentido sobre un dispositivo concreto, según las
 * categorías del árbol en las que aparece. Un mismo dispositivo puede estar en
 * varias categorías (heladera está en hogar y oficina): se unen las acciones.
 */
function actionsFor(device) {
  if (!device) return [];
  const allowed = new Set();
  for (const catId of device.categoryIds) {
    for (const action of (CATEGORY_ACTIONS[catId] || DEFAULT_ACTIONS)) allowed.add(action);
  }
  return [...allowed];
}

/**
 * ¿Esta combinación acción+dispositivo merece estar en el índice de Google?
 * Las que no, se siguen sirviendo por URL directa pero con noindex,follow.
 */
function isIndexableServicePage(actionSlug, deviceId) {
  const device = getDevices().get(deviceId);
  if (!device) return false;
  if (EXCLUDED_DEVICE_IDS.has(device.id)) return false;
  if (device.areas.some(areaId => NON_SERVICE_AREAS.has(areaId))) return false;
  if (COMMERCIAL_ACTIONS.has(actionSlug)) return false;
  return actionsFor(device).includes(actionSlug);
}

/** ¿Tiene sentido la variante local (/caba, /buenos-aires) de esta página? */
function hasLocationPage(actionSlug, deviceId) {
  return LOCAL_DEVICE_IDS.has(deviceId) && isIndexableServicePage(actionSlug, deviceId);
}

/** Slug de URL de un dispositivo: sin acentos (toldos-retráctiles → toldos-retractiles). */
function deviceUrlSlug(device) {
  return slugify(device.id);
}

/** slug de URL: sin acentos, con guiones. */
function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Acciones que aplican a un dispositivo. "Vender"/"comprar" no se generan en
 * masa: no tiene sentido abrir 150 páginas de "vender heladera" dentro de un
 * directorio de servicio técnico.
 */
function actionsForDevice(device) {
  return Object.keys(ACTION_ALIASES).filter(slug => !COMMERCIAL_ACTIONS.has(slug));
}

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Construye la página de /servicios/<accion>-<dispositivo>.
 * @returns {{title,description,canonical,html}|null}
 */
function buildServiceLandingPage(actionSlug, deviceSlug) {
  const action = ACTION_ALIASES[actionSlug];
  const device = getDevices().get(deviceSlug);
  if (!action || !device) return null;

  const indexable = isIndexableServicePage(actionSlug, device.id);
  const robots = indexable ? 'index, follow, max-image-preview:large' : 'noindex, follow';
  const urlDevice = deviceUrlSlug(device);
  const title = `${action.label} ${device.name} en Argentina | KuraTe`;
  const description = `${action.label} ${device.plural.toLowerCase()} en Argentina con técnicos verificados en KuraTe. Presupuesto sin cargo y atención en todo el país.`;
  const canonical = `${KURATE_BASE}/servicios/${actionSlug}-${urlDevice}`;
  const ogImage = `${KURATE_BASE}/images/reparacion.png`;
  const searchUrl = `${KURATE_BASE}/hogar.html`;

  // Enlazado interno: antes cada landing tenía un único link (el CTA) y quedaba
  // huérfana salvo por el sitemap. Google necesita un camino de links real para
  // asignarles autoridad, así que cada página enlaza sus acciones hermanas, las
  // variantes locales y las categorías relacionadas.
  const siblingActions = actionsFor(device)
    .filter(a => a !== actionSlug && ACTION_ALIASES[a])
    .map(a => ({ slug: a, label: ACTION_ALIASES[a].label }));
  const siblingLinks = siblingActions
    .map(a => `<li><a href="/servicios/${a.slug}-${urlDevice}">${esc(a.label)} ${esc(device.name.toLowerCase())}</a></li>`)
    .join('');
  const locationLinks = Object.values(LOCATIONS)
    .filter(loc => hasLocationPage(actionSlug, device.id))
    .map(loc => `<li><a href="/servicios/${actionSlug}-${urlDevice}/${loc.slug}">${esc(action.label)} ${esc(device.name.toLowerCase())} en ${esc(loc.name)}</a></li>`)
    .join('');
  const categoryLinks = landingCategoriesFor(device)
    .map(slug => `<li><a href="/categorias/${slug}">${esc(CATEGORY_LABELS[slug])}</a></li>`)
    .join('');

  // Frases largas con sinónimos: es lo que hace que la página responda a
  // "reparo heladera" y no solo a "reparar heladera".
  const frases = action.synonyms
    .map(s => `${s.charAt(0).toUpperCase() + s.slice(1)} ${device.name.toLowerCase()}`)
    .join(' · ');
  const categorias = device.categories.join(', ');
  const marcas = device.brands.slice(0, 12);

  return {
    title,
    description,
    canonical,
    html: `<!DOCTYPE html>
<html lang="es-AR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" href="/favicon.svg" type="image+xml">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="keywords" content="${esc(action.synonyms.join(', ') + ', ' + device.name + ', ' + device.plural + ', técnico, servicio técnico, Argentina')}">
  <meta name="robots" content="${robots}">
  <link rel="canonical" href="${esc(canonical)}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="es_AR">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(canonical)}">
  <meta property="og:site_name" content="KuraTe">
  <meta property="og:image" content="${esc(ogImage)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${esc(ogImage)}">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Service",
    "name": ${JSON.stringify(`${action.label} ${device.name}`)},
    "description": ${JSON.stringify(description)},
    "url": ${JSON.stringify(canonical)},
    "serviceType": ${JSON.stringify(`${action.label} ${device.name}`)},
    "category": ${JSON.stringify(categorias || 'Servicio Técnico')},
    "provider": {
      "@type": "Organization",
      "name": "KuraTe",
      "url": ${JSON.stringify(KURATE_BASE)},
      "logo": ${JSON.stringify(`${KURATE_BASE}/KuraTe_logo_black.png`)}
    },
    "areaServed": {
      "@type": "Country",
      "name": "Argentina"
    }
  }
  </script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f0f1a; color: #e0e0e0; margin: 0; line-height: 1.6; }
    .container { max-width: 900px; margin: 0 auto; padding: 40px 20px; }
    h1 { color: #B8922E; font-size: 1.9rem; margin-bottom: 20px; }
    h2 { color: #D9BC6A; font-size: 1.2rem; margin-top: 32px; }
    p { color: #ccc; margin: 14px 0; }
    .cta { display: inline-block; padding: 14px 32px; background: #B8922E; color: #0f0f1a; text-decoration: none; border-radius: 8px; font-weight: 700; margin-top: 24px; }
    .cta:hover { background: #D9BC6A; }
    .frases { color: #B8922E; font-size: 0.95rem; }
    .meta { color: #888; font-size: 0.88rem; margin-top: 32px; padding-top: 20px; border-top: 1px solid #2a2a3a; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
    .chip { background: #1c1c2e; color: #aaa; padding: 5px 12px; border-radius: 20px; font-size: 0.82rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${esc(action.label)} ${esc(device.name)} en Argentina</h1>

    <p>Si buscás ${esc(action.label.toLowerCase())} ${esc(device.name.toLowerCase())}, en KuraTe encontrás técnicos verificados en toda Argentina. Pedís el presupuesto sin cargo y coordinás el turno directamente con el profesional.</p>

    <p>Nuestros técnicos cubren CABA, Gran Buenos Aires, Córdoba, Santa Fe, Mendoza y el resto del país. Todos los profesionales están verificados y ofrecen garantía sobre el trabajo.</p>

    <p class="frases">${esc(frases)}</p>

    <h2>${esc(action.label)} de ${esc(device.plural.toLowerCase())}: qué incluye</h2>
    <p>El servicio de ${esc(action.label.toLowerCase())} de ${esc(device.name.toLowerCase())} incluye diagnóstico, presupuesto previo, repuestos originales o equivalentes, garantía sobre el trabajo y atención post-servicio.</p>

    <h2>Marcas más habituales</h2>
    <div class="chips">${marcas.map(b => `<span class="chip">${esc(b)}</span>`).join('')}</div>

    <a href="${esc(searchUrl)}" class="cta">Encontrar técnico ahora</a>

    ${siblingLinks || locationLinks || categoryLinks ? `<h2>Seguir buscando</h2>
    <div class="nav-lists">
      ${siblingLinks ? `<ul>${siblingLinks}</ul>` : ''}
      ${locationLinks ? `<ul>${locationLinks}</ul>` : ''}
      ${categoryLinks ? `<ul>${categoryLinks}</ul>` : ''}
    </div>` : ''}

    <div class="meta">
      <p>También buscado como: ${esc(action.synonyms.map(s => `${s} ${device.name.toLowerCase()}`).join(', '))}.</p>
      <p>Categoría: ${esc(categorias)}.</p>
    </div>
  </div>
</body>
</html>`
  };
}

/**
 * Construye la página de /servicios/<accion>-<dispositivo>/<localidad>
 * para SEO local (ej: /servicios/reparar-heladera/caba).
 * @returns {{title,description,canonical,html}|null}
 */
function buildServiceLocationLandingPage(actionSlug, deviceSlug, locationSlug) {
  const action = ACTION_ALIASES[actionSlug];
  const device = getDevices().get(deviceSlug);
  const location = LOCATIONS[locationSlug];
  if (!action || !device || !location) return null;

  const indexable = hasLocationPage(actionSlug, device.id);
  const robots = indexable ? 'index, follow, max-image-preview:large' : 'noindex, follow';
  const urlDevice = deviceUrlSlug(device);
  const title = `${action.label} ${device.name} en ${location.name} | KuraTe`;
  const description = `${action.label} ${device.plural.toLowerCase()} en ${location.name} con técnicos verificados en KuraTe. Presupuesto sin cargo, atención en ${location.name} y alrededores.`;
  const canonical = `${KURATE_BASE}/servicios/${actionSlug}-${urlDevice}/${locationSlug}`;
  const ogImage = `${KURATE_BASE}/images/reparacion.png`;
  const searchUrl = `${KURATE_BASE}/hogar.html?province=${encodeURIComponent(location.provinces.join(','))}`;

  // Frases con sinónimos + localidad
  const frases = action.synonyms
    .map(s => `${s.charAt(0).toUpperCase() + s.slice(1)} ${device.name.toLowerCase()} en ${location.name.toLowerCase()}`)
    .join(' · ');
  const categorias = device.categories.join(', ');
  const marcas = device.brands.slice(0, 12);

  // JSON-LD con areaServed específico
  const areaServed = {
    '@type': 'State',
    name: location.fullName,
    containedInPlace: { '@type': 'Country', name: 'Argentina' }
  };

  return {
    title,
    description,
    canonical,
    html: `<!DOCTYPE html>
<html lang="es-AR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" href="/favicon.svg" type="image+xml">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="keywords" content="${esc(action.synonyms.join(', ') + ', ' + device.name + ', ' + device.plural + ', ' + location.name + ', técnico, servicio técnico, Argentina')}">
  <meta name="robots" content="${robots}">
  <link rel="canonical" href="${esc(canonical)}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="es_AR">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(canonical)}">
  <meta property="og:site_name" content="KuraTe">
  <meta property="og:image" content="${esc(ogImage)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${esc(ogImage)}">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Service",
    "name": ${JSON.stringify(`${action.label} ${device.name} en ${location.name}`)},
    "description": ${JSON.stringify(description)},
    "url": ${JSON.stringify(canonical)},
    "serviceType": ${JSON.stringify(`${action.label} ${device.name}`)},
    "category": ${JSON.stringify(categorias || 'Servicio Técnico')},
    "provider": {
      "@type": "Organization",
      "name": "KuraTe",
      "url": ${JSON.stringify(KURATE_BASE)},
      "logo": ${JSON.stringify(`${KURATE_BASE}/KuraTe_logo_black.png`)}
    },
    "areaServed": ${JSON.stringify(areaServed)}
  }
  </script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f0f1a; color: #e0e0e0; margin: 0; line-height: 1.6; }
    .container { max-width: 900px; margin: 0 auto; padding: 40px 20px; }
    h1 { color: #B8922E; font-size: 1.9rem; margin-bottom: 20px; }
    h2 { color: #D9BC6A; font-size: 1.2rem; margin-top: 32px; }
    p { color: #ccc; margin: 14px 0; }
    .cta { display: inline-block; padding: 14px 32px; background: #B8922E; color: #0f0f1a; text-decoration: none; border-radius: 8px; font-weight: 700; margin-top: 24px; }
    .cta:hover { background: #D9BC6A; }
    .frases { color: #B8922E; font-size: 0.95rem; }
    .meta { color: #888; font-size: 0.88rem; margin-top: 32px; padding-top: 20px; border-top: 1px solid #2a2a3a; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
    .chip { background: #1c1c2e; color: #aaa; padding: 5px 12px; border-radius: 20px; font-size: 0.82rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${esc(action.label)} ${esc(device.name)} en ${esc(location.name)}</h1>

    <p>Si buscás ${esc(action.label.toLowerCase())} ${esc(device.name.toLowerCase())} en ${esc(location.name.toLowerCase())}, en KuraTe encontrás técnicos verificados en ${esc(location.name)} y alrededores. Pedís el presupuesto sin cargo y coordinás el turno directamente con el profesional.</p>

    <p>Nuestros técnicos cubren ${esc(location.name)}, Gran Buenos Aires y alrededores. Todos los profesionales están verificados y ofrecen garantía sobre el trabajo.</p>

    <p class="frases">${esc(frases)}</p>

    <h2>${esc(action.label)} de ${esc(device.plural.toLowerCase())}: qué incluye</h2>
    <p>El servicio de ${esc(action.label.toLowerCase())} de ${esc(device.name.toLowerCase())} incluye diagnóstico, presupuesto previo, repuestos originales o equivalentes, garantía sobre el trabajo y atención post-servicio.</p>

    <h2>Marcas más habituales</h2>
    <div class="chips">${marcas.map(b => `<span class="chip">${esc(b)}</span>`).join('')}</div>

    <a href="${esc(searchUrl)}" class="cta">Encontrar técnico en ${esc(location.name)}</a>

    <h2>Seguir buscando</h2>
    <div class="nav-lists">
      <ul><li><a href="/servicios/${actionSlug}-${urlDevice}">${esc(action.label)} ${esc(device.name.toLowerCase())} en toda Argentina</a></li></ul>
      <ul>${Object.values(LOCATIONS).filter(l => l.slug !== location.slug).map(l => `<li><a href="/servicios/${actionSlug}-${urlDevice}/${l.slug}">${esc(action.label)} ${esc(device.name.toLowerCase())} en ${esc(l.name)}</a></li>`).join('')}</ul>
    </div>

    <div class="meta">
      <p>También buscado como: ${esc(action.synonyms.map(s => `${s} ${device.name.toLowerCase()} en ${location.name.toLowerCase()}`).join(', '))}.</p>
      <p>Zona: ${esc(location.fullName)}.</p>
    </div>
  </div>
</body>
</html>`
  };
}

/**
 * Todas las URLs de /servicios/ que van al sitemap.
 *
 * Solo se anuncian las combinaciones que un cliente buscaría de verdad:
 * - las áreas de educación (clases) no generan páginas de servicio técnico;
 * - cada categoría del árbol limita las acciones que tienen sentido;
 * - las variantes locales (/caba, /buenos-aires) solo para los dispositivos
 *   con demanda local real (LOCAL_DEVICE_IDS).
 *
 * El resto de las combinaciones se sigue sirviendo por URL directa, pero con
 * noindex,follow: 2610 páginas plantilla con 370 palabras casi idénticas es
 * exactamente el patrón que Google castiga como doorway / scaled content.
 *
 * @returns {{loc:string, priority:number, changefreq:string}[]}
 */
function getAllServiceUrls() {
  const urls = [];
  const devices = getDevices();
  const actionSlugs = Object.keys(ACTION_ALIASES).filter(slug => !COMMERCIAL_ACTIONS.has(slug));
  const locationSlugs = Object.keys(LOCATIONS);

  for (const actionSlug of actionSlugs) {
    // Las acciones de reparación son las que más se buscan, van arriba.
    const priority = REPAIR_ACTIONS.has(actionSlug) ? 0.8 : 0.6;
    for (const device of devices.values()) {
      if (!isIndexableServicePage(actionSlug, device.id)) continue;
      urls.push({
        loc: `/servicios/${actionSlug}-${deviceUrlSlug(device)}`,
        priority,
        changefreq: 'monthly',
        lastmod: null
      });
      if (!hasLocationPage(actionSlug, device.id)) continue;
      for (const locationSlug of locationSlugs) {
        urls.push({
          loc: `/servicios/${actionSlug}-${deviceUrlSlug(device)}/${locationSlug}`,
          priority: Math.round((priority - 0.1) * 100) / 100,
          changefreq: 'monthly',
          lastmod: null
        });
      }
    }
  }
  return urls;
}

/** Resuelve "action-device" o "action-device-location" a sus partes. */
function parseServiceSlug(slug) {
  // Se normaliza a slug ASCII: el id del árbol "toldos-retráctiles" se publica
  // como "toldos-retractiles" (una URL con acento se percent-encodea y rompe
  // el canonical). Así las dos formas resuelven al mismo dispositivo.
  const slugStr = slugify(slug);
  const locationSlugs = Object.keys(LOCATIONS);
  const deviceEntries = [...getDevices().entries()]
    .map(([deviceId, device]) => ({ deviceId, urlSlug: deviceUrlSlug(device) }))
    .sort((a, b) => b.urlSlug.length - a.urlSlug.length);

  // Primero intentar matchear con location al final
  for (const locSlug of locationSlugs) {
    const suffix = `-${locSlug}`;
    if (slugStr.endsWith(suffix)) {
      const withoutLoc = slugStr.slice(0, slugStr.length - suffix.length);
      for (const { deviceId, urlSlug } of deviceEntries) {
        const deviceSuffix = `-${urlSlug}`;
        if (withoutLoc.endsWith(deviceSuffix)) {
          return {
            actionSlug: withoutLoc.slice(0, withoutLoc.length - deviceSuffix.length),
            deviceSlug: deviceId,
            locationSlug: locSlug
          };
        }
      }
    }
  }

  // Sin location: parseo original action-device
  for (const { deviceId, urlSlug } of deviceEntries) {
    const suffix = `-${urlSlug}`;
    if (slugStr.endsWith(suffix)) {
      return {
        actionSlug: slugStr.slice(0, slugStr.length - suffix.length),
        deviceSlug: deviceId,
        locationSlug: null
      };
    }
  }
  return { actionSlug: null, deviceSlug: null, locationSlug: null };
}

module.exports = {
  KURATE_BASE,
  ACTION_ALIASES,
  LOCATIONS,
  buildServiceLandingPage,
  buildServiceLocationLandingPage,
  getAllServiceUrls,
  getDevices,
  parseServiceSlug,
  slugify,
  deviceUrlSlug,
  isIndexableServicePage,
  hasLocationPage,
  actionsFor
};
