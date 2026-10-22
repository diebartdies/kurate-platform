/**
 * Tests de la entrada "otra" (marca escrita a mano) en el arbol de servicios.
 *
 * Corre sin dependencias:  node scripts/test-otra-brand.js
 * No necesita Mongo ni la app levantada.
 */
const assert = require('assert');
const tree = require('../data/serviceTree');
const {
  OTRA_PREFIX, formatBrandName, isOtherBrand, brandDisplayName,
  extractOtherBrand, buildOtherBrand, sanitizeBrands, sanitizeServices
} = require('../utils/otraBrand');

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

function eq(actual, expected, msg) {
  assert.deepStrictEqual(actual, expected, `${msg || ''} (obtenido: ${JSON.stringify(actual)})`);
}

// --- formato del nombre --------------------------------------------------------
check('formatea LAVAVAJILLAS como Lavavajillas', () => {
  eq(formatBrandName('LAVAVAJILLAS'), 'Lavavajillas');
});

check('capitaliza la inicial de cada palabra', () => {
  eq(formatBrandName('estufa de patio'), 'Estufa De Patio');
  eq(formatBrandName('heladera'), 'Heladera');
  eq(formatBrandName('AIRE ACONDICIONADO'), 'Aire Acondicionado');
});

check('guion pegado dentro de una palabra se conserva', () => {
  eq(formatBrandName('smart-tv'), 'Smart-TV');
  eq(formatBrandName('aire-split'), 'Aire-Split');
});

check('el espacio siempre separa palabras', () => {
  eq(formatBrandName('lavarropas / secadora'), 'Lavarropas Secadora');
  eq(formatBrandName('estufa   de   patio'), 'Estufa De Patio');
});

check('siglas tecnicas van en mayusculas', () => {
  eq(formatBrandName('smart tv'), 'Smart TV');
  eq(formatBrandName('led'), 'LED');
  eq(formatBrandName('equipo led'), 'Equipo LED');
});

check('letra suelta siempre en mayuscula', () => {
  eq(formatBrandName('a'), 'A');
  eq(formatBrandName('y'), 'Y');
});

check('colapsa espacios y recorta', () => {
  eq(formatBrandName('  aires    split   '), 'Aires Split');
  eq(formatBrandName('heladera   blanca'), 'Heladera Blanca');
});

check('texto vacio o null devuelve cadena vacia', () => {
  eq(formatBrandName(''), '');
  eq(formatBrandName('   '), '');
  eq(formatBrandName(null), '');
  eq(formatBrandName(undefined), '');
});

check('no rompe con caracteres especiales ni numeros', () => {
  eq(formatBrandName('modelo 3000-xl'), 'Modelo 3000-XL');
  eq(formatBrandName('peugeot 208'), 'Peugeot 208');
  eq(formatBrandName('aire-split 2000'), 'Aire-Split 2000');
});

check('acentos se conservan', () => {
  eq(formatBrandName('ventilador de PÉRTIGA'), 'Ventilador De Pértiga');
});

// --- prefijo y extraccion ------------------------------------------------------
check('buildOtherBrand arma el valor persistido', () => {
  eq(buildOtherBrand('lavavajillas'), `${OTRA_PREFIX}Lavavajillas`);
  eq(buildOtherBrand('  '), '');
});

check('isOtherBrand distingue la entrada otra', () => {
  assert.ok(isOtherBrand(`${OTRA_PREFIX}Samsung`));
  assert.ok(!isOtherBrand('Samsung'));
  assert.ok(!isOtherBrand(null));
  assert.ok(!isOtherBrand(''));
});

check('brandDisplayName saca el prefijo', () => {
  eq(brandDisplayName(`${OTRA_PREFIX}Bosch`), 'Bosch');
  eq(brandDisplayName('Bosch'), 'Bosch');
  eq(brandDisplayName(undefined), '');
});

check('extractOtherBrand lee el nombre del array', () => {
  eq(extractOtherBrand(['Samsung', `${OTRA_PREFIX}Aire Split`]), 'Aire Split');
  eq(extractOtherBrand(['Samsung']), '');
  eq(extractOtherBrand([]), '');
  eq(extractOtherBrand(null), '');
});

// --- sanitizado ----------------------------------------------------------------
check('sanitizeBrands formatea la entrada otra y deja el resto', () => {
  eq(
    sanitizeBrands(['Samsung', `${OTRA_PREFIX}lavavajillas _intensa`, 'Electrolux']),
    ['Samsung', `${OTRA_PREFIX}Lavavajillas Intensa`, 'Electrolux']
  );
});

check('sanitizeBrands descarta vacios y no-string', () => {
  eq(sanitizeBrands(['Samsung', '', '   ', null, 42, undefined, `${OTRA_PREFIX}`]),
    ['Samsung']);
});

check('sanitizeBrands deduplica ignorando mayusculas', () => {
  eq(sanitizeBrands(['Samsung', 'samsung', 'SAMSUNG']), ['Samsung']);
  eq(sanitizeBrands([`${OTRA_PREFIX}Bosch`, `${OTRA_PREFIX}bosch`]), [`${OTRA_PREFIX}Bosch`]);
});

check('sanitizeBrands sobre input no-array devuelve vacio', () => {
  eq(sanitizeBrands(null), []);
  eq(sanitizeBrands('Samsung'), []);
});

check('sanitizeServices conserva estructura y agrega name faltante', () => {
  const out = sanitizeServices([
    { path: 'hogar.linea-blanca.heladera', actions: ['reparar'], brands: ['Samsung'] }
  ]);
  eq(out.length, 1);
  eq(out[0].name, 'heladera');
  eq(out[0].actions, ['reparar']);
  eq(out[0].brands, ['Samsung']);
});

check('sanitizeServices descarta servicios sin path o sin marcas', () => {
  const out = sanitizeServices([
    { path: 'hogar.a.b', brands: [] },
    { path: '', brands: ['Samsung'] },
    { brands: ['Samsung'] },
    null,
    { path: 'hogar.a.c', brands: ['Samsung'] }
  ]);
  eq(out.length, 1);
  eq(out[0].path, 'hogar.a.c');
});

check('sanitizeServices aplica el formato a la entrada otra', () => {
  const out = sanitizeServices([
    { path: 'hogar.carpinteria.muebles-a-medida', actions: ['instalar'], brands: [`${OTRA_PREFIX}muebles de madera`] }
  ]);
  eq(out[0].brands, [`${OTRA_PREFIX}Muebles De Madera`]);
});

check('round-trip: guardar y reabrir conserva la entrada otra', () => {
  const escrito = 'AIRE split';
  const guardado = sanitizeServices([
    { path: 'hogar.pileta.climatizacion', actions: ['reparar'], brands: [buildOtherBrand(escrito)] }
  ]);
  const reabierto = guardado[0].brands;
  eq(extractOtherBrand(reabierto), 'Aire Split');
  // Y el input del formulario se vuelve a llenar con ese mismo nombre.
  eq(formatBrandName(extractOtherBrand(reabierto)), 'Aire Split');
});

// --- cobertura sobre el arbol real --------------------------------------------
const areas = Array.isArray(tree) ? tree : (tree.serviceTree || tree.default || []);
let devices = 0;
areas.forEach(a => (a.categories || []).forEach(c => (c.devices || []).forEach(d => {
  devices++;
})));

check('el arbol tiene dispositivos (contexto de la feature)', () => {
  assert.ok(devices > 100, `solo ${devices} dispositivos`);
});

console.log('=== test-otra-brand ===');
console.log(`  dispositivos en el arbol: ${devices}`);
console.log(`  checks: ${pass + fails.length} | OK: ${pass} | fallos: ${fails.length}`);
if (fails.length) {
  fails.forEach(f => console.log(`  FALLA  ${f}`));
  process.exit(1);
}
console.log('  TODO OK');
