/**
 * Tests de las páginas de SEO de servicio (/servicios/<accion>-<dispositivo>).
 *
 * Corre sin dependencias ni base de datos:
 *   node scripts/test-seo-service-pages.js
 *
 * Lo que se verifica acá es lo que rompería el posicionamiento en Google:
 * - que exista una URL por cada combinación acción+dispositivo que tenga sentido;
 * - que las combinaciones sin sentido NO se anuncien en el sitemap (doorway);
 * - que cada página indexable tenga los metadatos que Google necesita;
 * - que cada página enlace a otras (antes eran huérfanas con un solo link).
 */

const assert = require('assert');
const {
  ACTION_ALIASES,
  LOCATIONS,
  buildServiceLandingPage,
  buildServiceLocationLandingPage,
  getAllServiceUrls,
  getDevices,
  parseServiceSlug,
  isIndexableServicePage,
  hasLocationPage,
  deviceUrlSlug
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
  ok(devices.size >= 150, `solo ${devices.size} dispositivos`);
});

check('los dispositivos técnicos tienen página de reparación', () => {
  const tecnicos = ['heladera', 'lavarropas', 'aire-acondicionado', 'termotanque-calefon',
    'pcs-notebooks', 'routers-wifi', 'duchas-termostaticos', 'generadores', 'portones-rejas'];
  const faltantes = tecnicos.filter(d => !urls.some(u => u.loc === `/servicios/reparar-${d}`));
  ok(faltantes.length === 0, `sin página: ${faltantes.join(', ')}`);
});

check('las acciones inválidas no generan URL', () => {
  // "reparar geografía" era el caso más obvio de contenido sin valor.
  ok(!urls.some(u => u.loc.includes('geografia')), 'hay una URL de geografía');
  ok(!urls.some(u => u.loc.includes('formacion-etica')), 'hay una URL de formación ética');
  ok(!urls.some(u => u.loc.includes('demoliciones')), 'hay una URL de demoliciones');
  ok(!urls.some(u => u.loc.includes('obras-y-reformas')), 'hay una URL de obras y reformas');
});

check('las acciones sin sentido no se generan para cada categoría', () => {
  // "instalar demoliciones" / "certificar inodoros" no son servicios reales.
  ok(!isIndexableServicePage('instalar', 'demoliciones'), 'instalar demoliciones');
  ok(!isIndexableServicePage('certificar', 'inodoros-bidets'), 'certificar inodoros');
  ok(!isIndexableServicePage('reparar', 'fumigacion-domestica'), 'reparar fumigación');
  ok(isIndexableServicePage('certificar', 'termotanque-calefon'), 'certificar termotanque debería valer');
  ok(isIndexableServicePage('reparar', 'heladera'), 'reparar heladera debería valer');
});

check('las páginas descartadas se siguen sirviendo, pero con noindex', () => {
  // No se rompen los links viejos, pero no compiten en el índice.
  const page = buildServiceLandingPage('reparar', 'geografia');
  ok(page, 'la página no se sirve');
  ok(/name="robots" content="noindex, follow"/.test(page.html), 'debería ser noindex');
});

// --- metadatos que Google necesita ----------------------------------------------

check('cada página indexable tiene title, description y canonical propios', () => {
  const page = buildServiceLandingPage('reparar', 'heladera');
  ok(page.title.includes('KuraTe'), 'title sin marca');
  ok(page.canonical === 'https://kurate.drsrv.net.ar/servicios/reparar-heladera', `canonical mal: ${page.canonical}`);
  ok(page.description.length > 80, 'description corta');
  ok(page.html.includes('<link rel="canonical"'), 'sin link canonical en el html');
  ok(/name="robots" content="index, follow/.test(page.html), 'no indexable');
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

check('cada página enlaza a otras páginas (no es huérfana)', () => {
  const page = buildServiceLandingPage('reparar', 'heladera');
  const links = (page.html.match(/href="\//g) || []).length;
  ok(links >= 4, `solo ${links} links internos`);
  ok(page.html.includes('/servicios/instalar-heladera'), 'no enlaza la acción hermana');
  ok(page.html.includes('/servicios/reparar-heladera/caba'), 'no enlaza la variante local');
});

check('los enlaces a categorías apuntan a categorías que existen', () => {
  // /categorias/<id-del-árbol> devuelve 301 para 20 de las 40 categorías.
  const validas = new Set(['linea-blanca', 'clima', 'electricidad', 'gas', 'informatica',
    'seguridad', 'automatizacion', 'plomeria', 'soldadura']);
  const page = buildServiceLandingPage('reparar', 'heladera');
  const links = [...page.html.matchAll(/href="\/categorias\/([^"]+)"/g)].map(m => m[1]);
  const invalidas = links.filter(l => !validas.has(l));
  ok(invalidas.length === 0, `categorías inexistentes: ${invalidas.join(', ')}`);
});

check('no se escapan caracteres que rompen el HTML', () => {
  const page = buildServiceLandingPage('reparar', 'heladera');
  const m = page.html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
  ok(m, 'no se pudo extraer el JSON-LD');
  JSON.parse(m[1]);
});

// --- el slug se parsea bien ------------------------------------------------------

check('el parser resuelve acción y dispositivo', () => {
  const casos = [
    ['reparar-heladera', 'reparar', 'heladera'],
    ['instalar-aire-acondicionado', 'instalar', 'aire-acondicionado'],
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
  const r = parseServiceSlug('reparar-duchas-termostaticos');
  ok(r.deviceSlug === 'duchas-termostaticos', `se partió mal: ${r.deviceSlug}`);
});

check('el parser acepta el id con acento y el slug limpio', () => {
  // toldos-retráctiles se publica como toldos-retractiles: una URL con acento
  // se percent-encodea y rompe el canonical.
  const limpio = parseServiceSlug('instalar-toldos-retractiles');
  const acento = parseServiceSlug('instalar-toldos-retráctiles');
  ok(limpio.deviceSlug === 'toldos-retráctiles', `limpio: ${limpio.deviceSlug}`);
  ok(acento.deviceSlug === 'toldos-retráctiles', `acento: ${acento.deviceSlug}`);
  ok(deviceUrlSlug(devices.get('toldos-retráctiles')) === 'toldos-retractiles', 'slug con acento');
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

check('el sitemap no publica una explosión de páginas plantilla', () => {
  // 2610 páginas casi idénticas es el patrón de doorway que Google penaliza.
  ok(urls.length > 300, `muy pocas URLs: ${urls.length}`);
  ok(urls.length <= 1200, `demasiadas URLs: ${urls.length}`);
});

check('cada URL del sitemap es una página indexable que existe', () => {
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
    } else if (/content="noindex/.test(page.html)) {
      invalidas.push(`${u.loc} (noindex)`);
    }
  }
  ok(invalidas.length === 0, `${invalidas.length} URLs inválidas, ej: ${invalidas.slice(0, 3).join(', ')}`);
});

check('las acciones de reparación tienen prioridad más alta', () => {
  const reparar = urls.find(u => u.loc === '/servicios/reparar-heladera');
  const instalar = urls.find(u => u.loc === '/servicios/instalar-heladera');
  ok(reparar && instalar, 'faltan las URLs base');
  ok(reparar.priority > instalar.priority, 'reparar debería pesar más que instalar');
});

check('no se anuncian las páginas comerciales', () => {
  ok(!urls.some(u => u.loc.includes('vender-')), 'hay URLs de vender');
  ok(!urls.some(u => u.loc.includes('comprar-')), 'hay URLs de comprar');
});

// --- SEO local (CABA / Provincia de Buenos Aires) ------------------------------

check('el sitemap incluye las variantes locales de los dispositivos con demanda local', () => {
  for (const loc of Object.keys(LOCATIONS)) {
    ok(urls.some(u => u.loc === `/servicios/reparar-heladera/${loc}`), `falta /servicios/reparar-heladera/${loc}`);
  }
});

check('las variantes locales solo existen para dispositivos con demanda local', () => {
  ok(hasLocationPage('reparar', 'heladera'), 'heladera debería tener variante local');
  ok(!hasLocationPage('revisar', 'balanzas'), 'balanzas no debería tener variante local');
  ok(!urls.some(u => u.loc.endsWith('/caba') && u.loc.includes('balanzas')), 'hay local de balanzas');
});

check('la landing local construye página con el canonical correcto', () => {
  const page = buildServiceLocationLandingPage('reparar', 'heladera', 'caba');
  assert.ok(page, 'no se puede construir la página local de CABA');
  ok(page.canonical === 'https://kurate.drsrv.net.ar/servicios/reparar-heladera/caba', `canonical mal: ${page.canonical}`);
  ok(page.html.includes('CABA'), 'no menciona CABA en el cuerpo');
  ok(page.html.includes('Ciudad Autónoma de Buenos Aires'), 'no usa el nombre completo de la localidad');
  ok(page.html.includes('/servicios/reparar-heladera'), 'no enlaza la página nacional');
});

check('la landing local usa areaServed propio y no el de la nacional', () => {
  const local = buildServiceLocationLandingPage('reparar', 'heladera', 'buenos-aires');
  const nacional = buildServiceLandingPage('reparar', 'heladera');
  assert.ok(local && nacional);
  ok(local.canonical !== nacional.canonical, 'el canonical local coincide con el nacional');
  ok(local.html.includes('Provincia de Buenos Aires'), 'falta areaServed de provincia');
});

check('localidad o acción inválida no construye página', () => {
  ok(buildServiceLocationLandingPage('reparar', 'heladera', 'cordoba') === null, 'localidad inválida');
  ok(buildServiceLocationLandingPage('inventada', 'heladera', 'caba') === null, 'acción inválida');
  ok(buildServiceLocationLandingPage('reparar', 'fantasma', 'caba') === null, 'dispositivo inválido');
});

// --- robots.txt -----------------------------------------------------------------

check('robots.txt permite /servicios/ y /perfil/', () => {
  const txt = buildRobotsTxt('https://kurate.drsrv.net.ar');
  ok(txt.includes('Allow: /servicios/'), 'falta Allow: /servicios/');
  ok(txt.includes('Allow: /perfil/'), 'falta Allow: /perfil/');
});

check('robots.txt declara los dos sitemaps', () => {
  const txt = buildRobotsTxt('https://kurate.drsrv.net.ar');
  ok(txt.includes('Sitemap: https://kurate.drsrv.net.ar/sitemap.xml'), 'falta el sitemap general');
  ok(txt.includes('Sitemap: https://kurate.drsrv.net.ar/sitemap-services.xml'), 'falta el sitemap de servicios');
});

check('robots.txt no anuncia URLs que redirigen', () => {
  const txt = buildRobotsTxt('https://kurate.drsrv.net.ar');
  ok(!txt.includes('Allow: /home.html'), 'anuncia /home.html (301 a /hogar.html)');
  ok(!txt.includes('Allow: /precios-aire-acondicionado'), 'anuncia la URL que redirige');
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
