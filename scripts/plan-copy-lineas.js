/**
 * Genera las lineas de codigo para copiar los dispositivos de Hogar
 * (Linea Blanca / Marron / Gris) hacia Casa de Campo y Oficina, conservando
 * los que cada area ya tiene.
 *
 * Regla anti-duplicado: no se copia un dispositivo si el area ya tiene uno
 * cuyo nombre contiene el nombre del origen o viceversa ('Smart TV' ya esta
 * como 'Smart TV y Receptores Satelitales' en Campo).
 */
const tree = require('../data/serviceTree');

const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const LINEAS = [
  { origen: 'linea-blanca', nombre: 'Línea Blanca' },
  { origen: 'linea-marron', nombre: 'Línea Marrón' },
  { origen: 'linea-gris', nombre: 'Línea Gris' }
];

const DESTINOS = [
  { area: 'casa-campo', cats: ['linea-blanca-campo', 'linea-marron-campo', 'linea-gris-campo'] },
  { area: 'oficina', cats: ['linea-blanca-oficina', 'linea-marron-oficina', 'linea-gris-oficina'] }
];

const hogar = tree.find((a) => a.id === 'hogar');
const origenPorCat = new Map(hogar.categories.map((c) => [c.id, c]));

const normCats = { 'linea-blanca-campo': 'linea-blanca', 'linea-marron-campo': 'linea-marron', 'linea-gris-campo': 'linea-gris', 'linea-blanca-oficina': 'linea-blanca', 'linea-marron-oficina': 'linea-marron', 'linea-gris-oficina': 'linea-gris' };

for (const { area, cats } of DESTINOS) {
  const areaNode = tree.find((a) => a.id === area);
  console.log(`\n${'='.repeat(70)}\n${areaNode.name}  [${area}]\n${'='.repeat(70)}`);
  for (const catId of cats) {
    const cat = areaNode.categories.find((c) => c.id === catId);
    const origen = origenPorCat.get(normCats[catId]);
    const yaHay = cat.devices.map((d) => norm(d.name));
    const aCopiar = origen.devices.filter((d) => {
      const n = norm(d.name);
      return !yaHay.some((ex) => ex === n || ex.includes(n) || n.includes(ex));
    });
    const omitidos = origen.devices.filter((d) => !aCopiar.includes(d));
    console.log(`\n  ${cat.name}  [${catId}]  ahora ${cat.devices.length} -> ${cat.devices.length + aCopiar.length}`);
    omitidos.forEach((d) => console.log(`    (se omite: "${d.name}" ya esta cubierto)`));
    aCopiar.forEach((d) => {
      console.log(`    { id: '${d.id}', name: '${d.name.replace(/'/g, "\\'")}', brands: [${d.brands.map((b) => `'${b.replace(/'/g, "\\'")}'`).join(', ')}] },`);
    });
  }
}

console.log(`\n${'='.repeat(70)}\nTOTAL dispositivos actuales: ${tree.reduce((n, a) => n + a.categories.reduce((m, c) => m + c.devices.length, 0), 0)}`);
