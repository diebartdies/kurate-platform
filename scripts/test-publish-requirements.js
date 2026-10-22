/**
 * Tests de los requisitos para lanzar un aviso: telefono y email verificados +
 * direccion completa, con autocompletado del codigo postal (CP).
 *
 * Corre sin dependencias:  node scripts/test-publish-requirements.js
 * No necesita Mongo ni la app levantada, y no llama a Correo Argentino: el
 * lookup va inyectado.
 */

const assert = require('assert');
const {
  evaluatePublishRequirements,
  buildPublishBlockedMessage,
  buildPublishBlockedText
} = require('../utils/publishRequirements');
const { normalize, stripStreetType } = require('../utils/cpaLookup');

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

/** Usuario base: todo verificado y con direccion completa. */
function usuarioOk(over) {
  return Object.assign({
    email: 'pro@example.com',
    phoneVerified: true,
    isEmailVerified: true,
    hogarProfile: {
      address: {
        street: 'Av. Corrientes',
        number: '1234',
        city: 'Buenos Aires',
        province: 'CABA',
        postalCode: 'C1043'
      }
    }
  }, over || {});
}

// --- caso feliz -----------------------------------------------------------------

check('usuario completo puede publicar', () => {
  const r = evaluatePublishRequirements(usuarioOk());
  eq(r.canPublish, true, 'canPublish');
  eq(r.faltantes, [], 'faltantes');
  eq(r.necesitaCP, false, 'necesitaCP');
  eq(r.direccion.postalCode, 'C1043', 'CP leido');
});

check('usuario completo y valido no genera mensaje de bloqueo', () => {
  eq(buildPublishBlockedMessage(evaluatePublishRequirements(usuarioOk())), '', 'mensaje');
});

// --- verificaciones -------------------------------------------------------------

check('sin telefono verificado bloquea', () => {
  const r = evaluatePublishRequirements(usuarioOk({ phoneVerified: false }));
  eq(r.canPublish, false, 'canPublish');
  assert.ok(r.faltantes.some(f => f.campo === 'phoneVerified'), 'faltante phoneVerified');
});

check('sin email verificado bloquea', () => {
  const r = evaluatePublishRequirements(usuarioOk({ isEmailVerified: false }));
  eq(r.canPublish, false, 'canPublish');
  assert.ok(r.faltantes.some(f => f.campo === 'isEmailVerified'), 'faltante isEmailVerified');
});

check('sin ninguna verificacion reporta las dos', () => {
  const r = evaluatePublishRequirements(usuarioOk({ phoneVerified: false, isEmailVerified: false }));
  const campos = r.faltantes.map(f => f.campo);
  assert.ok(campos.includes('phoneVerified') && campos.includes('isEmailVerified'), 'ambas');
});

// --- direccion incompleta --------------------------------------------------------

check('direccion vacia reporta calle, numero, ciudad y provincia', () => {
  const r = evaluatePublishRequirements(usuarioOk({ hogarProfile: { address: {} } }));
  eq(r.canPublish, false, 'canPublish');
  eq(r.direccionCompleta, false, 'direccionCompleta');
  const campos = r.faltantes.filter(f => f.tipo === 'direccion').map(f => f.campo);
  eq(campos.sort(), ['city', 'number', 'province', 'street'], 'campos de direccion');
});

check('un solo campo de direccion vacio bloquea', () => {
  const u = usuarioOk();
  u.hogarProfile.address.city = '   ';
  const r = evaluatePublishRequirements(u);
  eq(r.canPublish, false, 'canPublish');
  assert.ok(r.faltantes.some(f => f.campo === 'city'), 'faltante city');
});

check('leer la direccion de professionalProfile.location como respaldo', () => {
  const u = usuarioOk({ hogarProfile: {} });
  u.professionalProfile = {
    location: {
      street: 'San Martin',
      number: '500',
      city: 'Rosario',
      province: 'Santa Fe',
      postalCode: 'S2000'
    }
  };
  const r = evaluatePublishRequirements(u);
  eq(r.canPublish, true, 'canPublish');
  eq(r.direccion.city, 'Rosario', 'ciudad');
});

// --- codigo postal ---------------------------------------------------------------

check('direccion completa sin CP pide autocompletado', () => {
  const u = usuarioOk();
  delete u.hogarProfile.address.postalCode;
  const r = evaluatePublishRequirements(u);
  eq(r.direccionCompleta, true, 'direccionCompleta');
  eq(r.necesitaCP, true, 'necesitaCP');
  eq(r.canPublish, false, 'canPublish todavia bloquea hasta resolver el CP');
});

check('el CP a completar no aparece como accion del usuario', () => {
  const u = usuarioOk();
  delete u.hogarProfile.address.postalCode;
  const msg = buildPublishBlockedMessage(evaluatePublishRequirements(u));
  assert.ok(!/•/.test(msg), 'no lista bullets para un unico faltante automatico');
  assert.ok(/prob|busc|segundos/i.test(msg), `mensaje de espera: ${msg}`);
});

check('con direccion incompleta no intenta buscar CP', () => {
  const u = usuarioOk();
  delete u.hogarProfile.address.postalCode;
  u.hogarProfile.address.city = '';
  const r = evaluatePublishRequirements(u);
  eq(r.necesitaCP, false, 'no se busca CP sin direccion completa');
});

check('CP en blanco cuenta como ausente', () => {
  const u = usuarioOk();
  u.hogarProfile.address.postalCode = '   ';
  eq(evaluatePublishRequirements(u).necesitaCP, true, 'necesitaCP');
});

// --- mensajes --------------------------------------------------------------------

check('un unico faltante devuelve la frase directa', () => {
  const msg = buildPublishBlockedMessage(evaluatePublishRequirements(usuarioOk({ phoneVerified: false })));
  eq(msg, 'Tenés que verificar tu teléfono antes de lanzar un aviso.', 'mensaje');
});

check('varios faltantes se listan en un solo mensaje', () => {
  const u = usuarioOk({ phoneVerified: false, isEmailVerified: false });
  const msg = buildPublishBlockedMessage(evaluatePublishRequirements(u));
  assert.ok(msg.includes('•'), 'usa bullets');
  assert.ok(msg.includes('teléfono') && msg.includes('email'), 'menciona ambos');
});

check('mensaje en una sola linea para el servidor', () => {
  const u = usuarioOk({ phoneVerified: false, isEmailVerified: false });
  const text = buildPublishBlockedText(evaluatePublishRequirements(u));
  assert.ok(!text.includes('\n'), 'sin saltos de linea');
  assert.ok(text.includes('•'), 'conserva los bullets');
});

check('mensaje vacio cuando no falta nada', () => {
  eq(buildPublishBlockedText(evaluatePublishRequirements(usuarioOk())), '', 'vacio');
});

check('usuario inexistente no rompe la evaluacion', () => {
  const r = evaluatePublishRequirements(null);
  eq(r.canPublish, false, 'canPublish');
  assert.ok(r.faltantes.length > 0, 'reporta faltantes');
});

// --- normalizacion de direccion para CPA -------------------------------------------

check('normalize saca acentos y pasa a mayusculas', () => {
  eq(normalize('  Córdoba '), 'CORDOBA', 'normalize');
  eq(normalize('C.A.B.A'), 'C A B A', 'puntos a espacios');
});

check('stripStreetType quita el tipo de calle', () => {
  eq(stripStreetType('Av. Corrientes'), 'CORRIENTES', 'avenida');
  eq(stripStreetType('calle corrientes 1234'), 'CORRIENTES 1234', 'calle');
  eq(stripStreetType('Diagonal Norte'), 'NORTE', 'diagonal');
  eq(stripStreetType('Corrientes'), 'CORRIENTES', 'sin tipo se deja igual');
});

// --- resumen --------------------------------------------------------------------

console.log('\n=== Requisitos de publicacion de avisos ===\n');
if (fails.length) {
  console.log(`FALLARON ${fails.length}:`);
  for (const f of fails) console.log(`  x ${f}`);
  process.exit(1);
}
console.log(`OK: ${pass} checks pasaron.`);
