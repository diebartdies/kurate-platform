const tree = require('../data/serviceTree');
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const paths = new Map();
let total = 0;
let errors = 0;
let sinMarcas = 0;
for (const a of tree) {
  let catN = 0, devN = 0;
  for (const c of a.categories) {
    catN++;
    const ids = new Set();
    for (const d of c.devices) {
      devN++; total++;
      if (ids.has(d.id)) { console.log(`DUPLICADO id en ${a.id}/${c.id}: ${d.id}`); errors++; }
      ids.add(d.id);
      if (!d.brands || !d.brands.length) {
        // Los oficios de mano (obra, tapiceria, fumigacion) no tienen marcas:
        // van marcados con noBrands para que quede explicito y no sea un error.
        if (d.noBrands) { sinMarcas++; }
        else { console.log(`SIN marcas: ${a.id}/${c.id}/${d.id}`); errors++; }
      }
      const p = `${a.id}/${c.id}/${d.id}`;
      if (paths.has(p)) { console.log(`PATH duplicado: ${p}`); errors++; }
      paths.set(p, 1);
    }
  }
  console.log(`${a.name.padEnd(16)} ${a.categories.length} categorías · ${devN} dispositivos`);
}
console.log(`\nTOTAL: ${tree.length} áreas · ${total} dispositivos · ${paths.size} paths únicos · ${errors} errores · ${sinMarcas} oficios sin marcas (noBrands)`);
