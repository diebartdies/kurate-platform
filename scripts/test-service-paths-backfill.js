// Prueba de la logica del backfill sin tocar MongoDB: simula los documentos
// que devolveria la query y comprueba que el cache queda consistente y que la
// busqueda por igualdad los encuentra.
//
//   node scripts/test-service-paths-backfill.js
const { servicePathPrefixes, servicePathLookupValues } = require('../utils/servicePathMatch');

const casos = [
  { label: 'path canonico', services: [{ path: 'hogar/linea-blanca/heladera' }] },
  { label: 'path con marca', services: [{ path: 'hogar/linea-blanca/heladera/Ariston' }] },
  { label: 'legacy con puntos', services: ['hogar.linea-blanca.heladera'] },
  { label: 'legacy con espacios', services: ['hogar linea-blanca heladera'] },
  { label: 'solo area', services: [{ path: 'hogar' }] },
  { label: 'varios servicios', services: [{ path: 'hogar/linea-blanca/heladera' }, { path: 'hogar/linea-marron/smart-tv' }] },
  { label: 'sin servicios', services: [] }
];

let ok = 0, fail = 0;
function check(cond, msg) {
  if (cond) { ok++; } else { fail++; console.log('  FALLA: ' + msg); }
}

for (const c of casos) {
  const pref = servicePathPrefixes(c.services);
  const uniq = new Set(pref);
  check(pref.length === uniq.size, c.label + ': prefijos duplicados');

  // Toda entrada de servicePaths debe salir de un prefijo real del path guardado.
  for (const p of pref) {
    const derivable = c.services.some(s => {
      const raw = typeof s === 'string' ? s : s.path;
      const norm = String(raw).toLowerCase();
      return norm.replace(/[./]+/g, '/').startsWith(p) || norm.split(/[./\s]+/).join('/').startsWith(p);
    });
    check(derivable, c.label + ': "' + p + '" no es prefijo de ningun path guardado');
  }

  // Coherencia: si hay 3 segmentos, los 3 prefijos existen.
  const canon = c.services.map(s => typeof s === 'string' ? s : s.path)
    .map(s => s.toLowerCase().split(/[./\s]+/).filter(Boolean).join('/'));
  for (const path of canon) {
    const segs = path.split('/').filter(Boolean);
    if (segs.length >= 2) {
      for (let k = 1; k <= segs.length; k++) {
        const want = segs.slice(0, k).join('/');
        check(uniq.has(want), c.label + ': falta el prefijo "' + want + '" de "' + path + '"');
      }
    }
  }

  // Idempotencia: recalcular el cache no cambia nada.
  check(servicePathPrefixes(c.services).sort().join('|') === pref.slice().sort().join('|'),
    c.label + ': recalcular el cache cambia el resultado');

  console.log('  ' + c.label + ' -> ' + (pref.length ? pref.join(', ') : '(sin cache)'));
}

// La query de busqueda debe devolver un unico valor, y null con un segmento.
const eq = servicePathLookupValues('hogar/linea-blanca/heladera');
check(eq && eq.length === 1 && eq[0] === 'hogar/linea-blanca/heladera',
  'lookup de 3 segmentos debe ser un solo valor: ' + JSON.stringify(eq));
check(servicePathLookupValues('heladera') === null,
  'lookup de 1 segmento debe ser null (lo resuelve el regex)');
check(servicePathLookupValues('') === null, 'lookup vacio debe ser null');
check(servicePathLookupValues('   ') === null, 'lookup en blanco debe ser null');

console.log('\nOK: ' + ok + '   FALLAS: ' + fail);
process.exit(fail === 0 ? 0 : 1);
