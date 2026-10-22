/**
 * Tests de las páginas de SEO de servicio (/servicios/<accion>-<dispositivo>).
 *
 * Corre sin dependencias ni base de datos:
 *   node scripts/test-seo-service-pages.js
 *
 * Lo que se verifica acá es lo que rompería el posicionamiento en Google:
 * que exista una URL por cada palabra que la gente busca, que haya páginas para
 * todos los dispositivos del árbol y no solo una lista a mano, y que cada
 * página tenga los metadatos que Google necesita para indexarla.
 */

const assert = require('assert');
const {
  ACTION_ALIASES,
  LOCATIONS,
  buildServiceLandingPage,
  buildServiceLocationLandingPage,
  getAllServiceUrls,
  getDevices,
  parseServiceSlug
} = require('../utils/seoServicePages');
const { buildRobotsTxt } = require('../utils/seoSitemap');

let pass = 0;
const fails = [];

function check(name, fn) {
  try {
    fn();
    pass++;
  } catch (err) {
    fails.push(`${name}: ${err.message}`);
  }
}

function ok(cond, msg) {
  assert.ok(cond, msg);
}

const devices = getDevices();
const urls = getAllServiceUrls();

// --- cobertura de dispositivos --------------------------------------------------

check('los dispositivos salen del arbol, no de una lista a mano', () => {
  // Antes el módulo tenía 18 dispositivos escritos a mano sobre 159 del árbol.
  ok(devices.size >= 150, `solo ${devices.size} dispositivos`);
});

check('cada dispositivo del arbol tiene al menos una página de reparación', () => {
  const faltantes = [...devices.keys()].filter(
    d => !urls.some(u => u.loc === `/servicios/reparar-${d}`)
  );
  ok(faltantes.length === 0, `sin página: ${faltantes.slice(0, 5).join(', ')}`);
});

check('dispositivos que antes no tenían página ahora existen', () => {
  for (const d of ['duchas-termostaticos', 'routers-wifi', 'obras-y-reformas']) {
    ok(devices.has(d), `${d} no está en el árbol`);
    ok(urls.some(u => u.loc === `/servicios/reparar-${d}`), `falta /servicios/reparar-${d}`);
  }
});

// --- las palabras que la gente busca --------------------------------------------

check('las cinco palabras de reparación tienen URL para heladera', () => {
  for (const accion of ['arreglar', 'reparar', 'reparo', 'service', 'reparacion']) {
    const loc = `/servicios/${accion}-heladera`;
    ok(urls.some(u => u.loc === loc), `falta ${loc}`);
  }
});

check('"reparo" es una acción propia y no solo un sinónimo', () => {
  ok(ACTION_ALIASES.reparo, 'no existe la acción reparo');
  ok(
    ACTION_ALIASES.reparo.synonyms.includes('reparar'),
    'reparo no lista "reparar" entre sus sinónimos'
  );
});

check('las acciones de reparación se menjorean entre sí', () => {
  const reparar = ACTION_ALIASES.reparar.synonyms.map(s => s.toLowerCase());
  for (const palabra of ['arreglar', 'reparo', 'service']) {
    ok(reparar.includes(palabra), `"reparar" no cubre "${palabra}"`);
  }
});

check('las cinco páginas de heladera responden contenido real', () => {
  for (const accion of ['arreglar', 'reparar', 'reparo', 'service', 'reparacion']) {
    const page = buildServiceLandingPage(accion, 'heladera');
    ok(page, `/servicios/${accion}-heladera no se puede construir`);
    ok(page.html.length > 1500, `${accion}: html muy corto (${page.html.length})`);
  }
});

// --- metadatos que Google necesita ----------------------------------------------

check('cada página tiene title, description y canonical propios', () => {
  for (const accion of ['reparar', 'arreglar', 'reparo', 'service']) {
    const page = buildServiceLandingPage(accion, 'heladera');
    ok(page.title.includes('KuraTe'), `${accion}: title sin marca`);
    ok(page.canonical.endsWith(`/servicios/${accion}-heladera`), `${accion}: canonical mal`);
    ok(page.description.length > 80, `${accion}: description corta`);
    ok(page.html.includes('<link rel="canonical"'), `${accion}: sin link canonical en el html`);
    ok(/name="robots" content="index, follow/.test(page.html), `${accion}: no indexable`);
  }
});

check('cada página tiene JSON-LD de Service válido', () => {
  const page = buildServiceLandingPage('reparar', 'heladera');
  const m = page.html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
  ok(m, 'no hay JSON-LD');
  const data = JSON.parse(m[1]);
  ok(data['@type'] === 'Service', '@type incorrecto');
  ok(data.provider && data.provider.name === 'KuraTe', 'provider incorrecto');
  ok(data.areaServed && data.areaServed.name === 'Argentina', 'areaServed incorrecto');
});

check('el título de cada acción usa su propia etiqueta', () => {
  ok(buildServiceLandingPage('reparar', 'heladera').title.startsWith('Reparar'), 'reparar');
  ok(buildServiceLandingPage('arreglar', 'heladera').title.startsWith('Arreglar'), 'arreglar');
  ok(buildServiceLandingPage('reparo', 'heladera').title.startsWith('Reparo'), 'reparo');
  ok(buildServiceLandingPage('service', 'heladera').title.startsWith('Service'), 'service');
});

check('no se escapan caracteres que rompen el HTML', () => {
  const page = buildServiceLandingPage('reparar', 'heladera');
  // Las comillas del JSON-LD van escapadas, si no romperían el script.
  const m = page.html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
  ok(m, 'no se pudo extraer el JSON-LD');
  JSON.parse(m[1]);
});

// --- el slug se parsea bien ------------------------------------------------------

check('el parser resuelve acción y dispositivo', () => {
  const casos = [
    ['reparar-heladera', 'reparar', 'heladera'],
    ['reparo-heladera', 'reparo', 'heladera'],
    ['arreglar-aire-acondicionado', 'arreglar', 'aire-acondicionado'],
    ['reparar-duchas-termostaticos', 'reparar', 'duchas-termostaticos'],
    ['instalar-smart-tv', 'instalar', 'smart-tv']
  ];
  for (const [slug, accion, dev] of casos) {
    const r = parseServiceSlug(slug);
    ok(r.actionSlug === accion, `${slug}: acción ${r.actionSlug} != ${accion}`);
    ok(r.deviceSlug === dev, `${slug}: dispositivo ${r.deviceSlug} != ${dev}`);
  }
});

check('el parser no confunde un dispositivo compuesto con la acción', () => {
  // "termostaticos" es parte del dispositivo, no una acción.
  const r = parseServiceSlug('reparar-duchas-termostaticos');
  ok(r.deviceSlug === 'duchas-termostaticos', `se partió mal: ${r.deviceSlug}`);
});

check('un slug inválido devuelve null y no explota', () => {
  for (const bad of ['no-existe-esta-cosa', 'reparar', 'heladera', 'zzz-zzz']) {
    const r = parseServiceSlug(bad);
    ok(!r.actionSlug || !r.deviceSlug, `${bad} debería no resolver`);
  }
});

check('acción o dispositivo inexistente no construye página', () => {
  ok(buildServiceLandingPage('inventada', 'heladera') === null, 'acción inválida');
  ok(buildServiceLandingPage('reparar', 'dispositivo-fantasma') === null, 'dispositivo inválido');
});

// --- sitemap --------------------------------------------------------------------

check('el sitemap de servicios tiene más de mil URLs', () => {
  ok(urls.length > 1000, `solo ${urls.length}`);
});

check('cada URL del sitemap es una página que existe', () => {
  const invalidas = [];
  for (const u of urls) {
    const rest = u.loc.replace('/servicios/', '');
    const parts = rest.split('/');
    const locationSlug = parts.length > 1 ? parts[1] : null;
    const { actionSlug, deviceSlug } = parseServiceSlug(parts[0]);
    const page = locationSlug
      ? buildServiceLocationLandingPage(actionSlug, deviceSlug, locationSlug)
      : buildServiceLandingPage(actionSlug, deviceSlug);
    if (!actionSlug || !deviceSlug || !page) {
      invalidas.push(u.loc);
    }
  }
  ok(invalidas.length === 0, `${invalidas.length} URLs rotas, ej: ${invalidas.slice(0, 3).join(', ')}`);
});

check('las acciones de reparación tienen prioridad más alta', () => {
  const reparar = urls.find(u => u.loc === '/servicios/reparar-heladera');
  const instalar = urls.find(u => u.loc === '/servicios/instalar-heladera');
  ok(reparar.priority > instalar.priority, 'reparar debería pesar más que instalar');
});

check('no se anuncian las páginas comerciales', () => {
  ok(!urls.some(u => u.loc.includes('vender-')), 'hay URLs de vender');
  ok(!urls.some(u => u.loc.includes('comprar-')), 'hay URLs de comprar');
});

// --- SEO local (CABA / Provincia de Buenos Aires) ------------------------------

check('el sitemap incluye las URLs locales de CABA y Buenos Aires', () => {
  for (const loc of Object.keys(LOCATIONS)) {
    ok(urls.some(u => u.loc === `/servicios/reparar-heladera/${loc}`), `falta /servicios/reparar-heladera/${loc}`);
  }
  const locales = urls.filter(u => Object.keys(LOCATIONS).some(l => u.loc.endsWith(`/${l}`)));
  const nacionales = urls.length - locales.length;
  ok(locales.length === nacionales * 2, `esperaba ${nacionales * 2} URLs locales, hay ${locales.length}`);
});

check('la landing local construye página con el canonical correcto', () => {
  const page = buildServiceLocationLandingPage('reparar', 'heladera', 'caba');
  assert.ok(page, 'no se puede construir la página local de CABA');
  ok(page.canonical === 'https://kurate.drsrv.net.ar/servicios/reparar-heladera/caba', `canonical mal: ${page.canonical}`);
  ok(page.html.includes('CABA'), 'no menciona CABA en el cuerpo');
  ok(page.html.includes('Ciudad Autónoma de Buenos Aires'), 'no usa el nombre completo de la localidad');
});

check('la landing local usa areaServed propio y no el de la nacional', () => {
  const local = buildServiceLocationLandingPage('reparar', 'heladera', 'buenos-aires');
  const nacional = buildServiceLandingPage('reparar', 'heladera');
  assert.ok(local && nacional);
  ok(local.canonical !== nacional.canonical, 'el canonical local coincide con el nacional');
  ok(local.html.includes('Provincia de Buenos Aires'), 'falta areaServed de provincia');
  ok(local.html.includes('/servicios/reparar-heladera/buenos-aires'), 'falta el canonical interno');
});

check('localidad o acción inválida no construye página', () => {
  ok(buildServiceLocationLandingPage('reparar', 'heladera', 'cordoba') === null, 'localidad inválida');
  ok(buildServiceLocationLandingPage('inventada', 'heladera', 'caba') === null, 'acción inválida');
  ok(buildServiceLocationLandingPage('reparar', 'fantasma', 'caba') === null, 'dispositivo inválido');
});

// --- robots.txt -----------------------------------------------------------------

check('robots.txt permite /servicios/', () => {
  const txt = buildRobotsTxt('https://kurate.drsrv.net.ar');
  ok(txt.includes('Allow: /servicios/'), 'falta Allow: /servicios/');
});

check('robots.txt declara el sitemap principal', () => {
  const txt = buildRobotsTxt('https://kurate.drsrv.net.ar');
  ok(txt.includes('Sitemap: https://kurate.drsrv.net.ar/sitemap.xml'), 'falta el sitemap');
});

check('robots.txt no declara el sitemap de plantillas', () => {
  // Se sacaron las 728 landings por área del índice: son duplicados.
  const txt = buildRobotsTxt('https://kurate.drsrv.net.ar');
  ok(!txt.includes('sitemap-services.xml'), 'todavía declara el sitemap viejo');
});

// --- resumen --------------------------------------------------------------------

console.log('\n=== Páginas de SEO de servicio ===\n');
console.log(`  dispositivos: ${devices.size} | acciones: ${Object.keys(ACTION_ALIASES).length} | URLs: ${urls.length}`);
if (fails.length) {
  console.log(`\n  FALLARON ${fails.length}:`);
  for (const f of fails) console.log(`    x ${f}`);
  process.exit(1);
}
console.log(`\n  OK: ${pass} checks pasaron.`);
