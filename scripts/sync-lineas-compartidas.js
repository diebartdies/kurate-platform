/**
 * Sincroniza en la coleccion publica "services" los dispositivos de las
 * Lineas Blanca / Marron / Gris que Casa de Campo y Oficina toman de Hogar.
 * Los nombres y marcas salen siempre de data/serviceTree.js.
 *
 * Idempotente: no inserta si el area ya tiene un dispositivo cuyo nombre
 * cubre al de Hogar (ej. "Freezer Horizontal y Heladeras Duales/12V").
 */
const mongoose = require('mongoose');
const tree = require('../data/serviceTree');

const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const LINEAS = { 'linea-blanca': 'linea-blanca', 'linea-marron': 'linea-marron', 'linea-gris': 'linea-gris' };
const DESTINOS = [
  { area: 'casa-campo', cats: ['linea-blanca-campo', 'linea-marron-campo', 'linea-gris-campo'] },
  { area: 'oficina', cats: ['linea-blanca-oficina', 'linea-marron-oficina', 'linea-gris-oficina'] }
];

(async () => {
  await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const services = mongoose.connection.db.collection('services');

  const hogar = tree.find((a) => a.id === 'hogar');
  const origenPorCat = new Map(hogar.categories.filter((c) => LINEAS[c.id]).map((c) => [c.id, c]));
  const areaPublica = { 'casa-campo': 'Casa de Campo', 'oficina': 'Oficina' };

  let insertados = 0, actualizados = 0, omitidos = 0;

  for (const { area, cats } of DESTINOS) {
    const areaNode = tree.find((a) => a.id === area);
    for (const catId of cats) {
      const cat = areaNode.categories.find((c) => c.id === catId);
      const origenId = catId.replace(/-campo$|-oficina$/, '');
      const origen = origenPorCat.get(LINEAS[origenId]);
      if (!origen) { console.log(`SIN ORIGEN: ${catId}`); continue; }
      const idsOrigen = new Set(origen.devices.map((d) => d.id));
      // Solo los dispositivos propios del area sirven para decidir duplicados:
      // las copias de Hogar ya estan en el arbol, no pueden "cubrirse" a si mismas.
      const propios = cat.devices.filter((d) => !idsOrigen.has(d.id)).map((d) => norm(d.name));
      for (const dev of origen.devices) {
        const n = norm(dev.name);
        if (propios.some((ex) => ex === n || ex.includes(n) || n.includes(ex))) {
          omitidos++;
          console.log(`OMITE  ${area}/${catId}: "${dev.name}" ya cubierto`);
          continue;
        }
        const path = `${areaNode.id}/${catId}/${dev.id}`;
        const doc = { area: areaPublica[areaNode.id] || areaNode.name, category: cat.name, device: dev.name, brands: dev.brands, path };
        const res = await services.updateOne(
          { path },
          { $set: { area: doc.area, category: doc.category, device: doc.device, brands: doc.brands }, $setOnInsert: { path } },
          { upsert: true }
        );
        if (res.upsertedCount) { insertados++; console.log(`NUEVO  ${path} (${dev.name}, ${dev.brands.length} marcas)`); }
        else { actualizados++; console.log(`ACTUAL ${path}`); }
      }
    }
  }

  const total = await services.countDocuments();
  console.log(`\ninsertados=${insertados} actualizados=${actualizados} omitidos=${omitidos} Â· total servicios=${total}`);
  for (const a of ['Hogar', 'Casa de Campo', 'Office', 'Oficina']) {
    const n = await services.countDocuments({ area: a });
    if (n) console.log(`  ${a}: ${n}`);
  }
  const areas = await services.distinct('area');
  console.log('areas en la coleccion:', areas.join(' | '));

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
