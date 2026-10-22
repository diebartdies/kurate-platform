// Equivalencia entre la busqueda por regex (servicePrefixRegex) y la nueva por
// igualdad (servicePathLookupValues), sobre TODOS los paths del arbol canonico.
//
//   node scripts/test-service-path-equivalence.js
const { servicePrefixRegex, servicePathLookupValues, servicePathPrefixes } = require('../utils/servicePathMatch');
const tree = require('../data/serviceTree');

const AREA_LABEL = { Home: 'hogar', Office: 'oficina', 'Casa de Campo': 'casa-campo', Industria: 'industria' };

// Corpus de paths "guardados": los canonicos del arbol (4 segmentos, con
// marca) + variantes legacy que la base todavia tiene (con '.' y con ' ').
const stored = new Set();
for (const area of tree) {
  const areaId = AREA_LABEL[area.name];
  if (!areaId) { console.log('AREA SIN MAPEAR: ' + area.name); continue; }
  for (const cat of area.categories || []) {
    for (const dev of cat.devices || []) {
      const base = areaId + '/' + cat.id + '/' + dev.id;
      stored.add(base);
      stored.add(base + '/' + (dev.brands?.[0] || 'generico'));   // con marca
      stored.add(base.split('/').join('.'));                       // legacy con '.'
      stored.add(base.split('/').join(' '));                       // legacy con ' '
    }
  }
}

const queries = [];
for (const area of tree) {
  const areaId = AREA_LABEL[area.name];
  if (!areaId) continue;
  queries.push(areaId);                                            // profundidad 1
  for (const cat of area.categories || []) {
    queries.push(areaId + '/' + cat.id);                            // profundidad 2
    for (const dev of cat.devices || []) {
      queries.push(areaId + '/' + cat.id + '/' + dev.id);           // profundidad 3
      queries.push(areaId + '/' + cat.id + '/' + dev.id + '/ariston'); // 4 (marca)
      queries.push(dev.id);                                         // SEO: sin area
    }
  }
}

function viaRegex(q) {
  const r = servicePrefixRegex(q);
  if (!r) return null;
  const re = new RegExp(r, 'i');
  const hits = new Set();
  for (const s of stored) if (re.test(s)) hits.add(s);
  return hits;
}

function viaLookup(q, corpus) {
  const values = servicePathLookupValues(q);
  if (!values) return null;
  const set = new Set(values);
  const hits = new Set();
  for (const s of corpus) {
    // el corpus indexable tiene los prefijos de cada path guardado
    for (const p of servicePathPrefixes(s)) {
      if (set.has(p)) { hits.add(s); break; }
    }
  }
  return hits;
}

let ok = 0, fail = 0, soloRegex = 0;
const ejemplos = [];

for (const q of queries) {
  const a = viaRegex(q);
  const b = viaLookup(q, stored);

  // Profundidad 1 (SEO sin area): la igualdad no aplica a proposito, sigue el
  // regex. No es un fallo, es el contrato de servicePathLookupValues().
  if (b === null) {
    if (a && a.size > 0) soloRegex++;
    continue;
  }
  if (a === null) { fail++; continue; }

  const soloPatron = [...a].filter(x => !b.has(x));
  const soloLookup = [...b].filter(x => !a.has(x));

  if (soloPatron.length === 0 && soloLookup.length === 0) { ok++; continue; }

  // Un lookup mas amplio es aceptable SOLO si el doc sigue siendo un match
  // legitimo (ya esta, el corpus es el mismo). Reportamos para revisar.
  fail++;
  if (ejemplos.length < 8) {
    ejemplos.push({ q, soloRegex: soloPatron.slice(0, 3), soloLookup: soloLookup.slice(0, 3) });
  }
}

console.log('paths guardados en el corpus: ' + stored.size);
console.log('queries probadas: ' + queries.length);
console.log('identicas (profundidad >= 2): ' + ok + '  con diferencia: ' + fail);
console.log('resueltas solo por regex (profundidad 1, por diseno): ' + soloRegex);

if (ejemplos.length) {
  console.log('\nEjemplos de diferencia:');
  ejemplos.forEach(e => console.log('  ' + JSON.stringify(e)));
}

console.log('\n' + (fail === 0
  ? 'OK: por igualdad devuelve exactamente el mismo conjunto que el regex.'
  : 'REVISAR: hay diferencias (ver arriba).'));
process.exit(fail === 0 ? 0 : 1);
