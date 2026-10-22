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
 * Dispositivos del árbol, aplanados y deduplicados por id.
 * @returns {Map<string, {id:string,name:string,plural:string,categories:string[],areas:string[],brands:string[]}>}
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
            areas: [],
            brands: []
          });
        }
        const entry = byId.get(device.id);
        if (!entry.categories.includes(cat.name)) entry.categories.push(cat.name);
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

  const title = `${action.label} ${device.name} en Argentina | KuraTe`;
  const description = `${action.label} ${device.plural.toLowerCase()} en Argentina con técnicos verificados en KuraTe. Presupuesto sin cargo y atención en todo el país.`;
  const canonical = `${KURATE_BASE}/servicios/${actionSlug}-${deviceSlug}`;
  const ogImage = `${KURATE_BASE}/images/reparacion.png`;
  const searchUrl = `${KURATE_BASE}/hogar.html`;

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
  <meta name="robots" content="index, follow, max-image-preview:large">
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

  const title = `${action.label} ${device.name} en ${location.name} | KuraTe`;
  const description = `${action.label} ${device.plural.toLowerCase()} en ${location.name} con técnicos verificados en KuraTe. Presupuesto sin cargo, atención en ${location.name} y alrededores.`;
  const canonical = `${KURATE_BASE}/servicios/${actionSlug}-${device.id}/${locationSlug}`;
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
  <meta name="robots" content="index, follow, max-image-preview:large">
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
 * Todas las URLs de /servicios/ para el sitemap (nacionales + locales CABA + Bs.As.).
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
      urls.push({
        loc: `/servicios/${actionSlug}-${device.id}`,
        priority,
        changefreq: 'monthly',
        lastmod: null
      });
      for (const locationSlug of locationSlugs) {
        urls.push({
          loc: `/servicios/${actionSlug}-${device.id}/${locationSlug}`,
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
  const devices = getDevices();
  const locationSlugs = Object.keys(LOCATIONS);
  const slugStr = String(slug);

  // Primero intentar matchear con location al final
  for (const locSlug of locationSlugs) {
    const suffix = `-${locSlug}`;
    if (slugStr.endsWith(suffix)) {
      const withoutLoc = slugStr.slice(0, slugStr.length - suffix.length);
      // Ahora parsear action-device del resto
      const ids = [...getDevices().keys()].sort((a, b) => b.length - a.length);
      for (const deviceId of ids) {
        const suffix = `-${deviceId}`;
        if (withoutLoc.endsWith(suffix)) {
          return {
            actionSlug: withoutLoc.slice(0, withoutLoc.length - suffix.length),
            deviceSlug: deviceId,
            locationSlug: locSlug
          };
        }
      }
    }
  }

  // Sin location: parseo original action-device
  const ids = [...getDevices().keys()].sort((a, b) => b.length - a.length);
  for (const deviceId of ids) {
    const suffix = `-${deviceId}`;
    if (String(slug).endsWith(suffix)) {
      return {
        actionSlug: String(slug).slice(0, String(slug).length - suffix.length),
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
  slugify
};
