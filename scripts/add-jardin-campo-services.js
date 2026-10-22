/**
 * Agrega la categoria "Jardin y Piscinas de Campo" con sus dispositivos al
 * arbol publico de la coleccion Service (el que muestran hogar.html y el
 * directorio). Idempotente: usa upsert por 'path', asi que reejecutarlo no
 * duplica ni pisa lo que ya existe.
 *
 * Los ids salen de data/serviceTree.js: si el arbol cambia, este script
 * sigue escribiendo los paths canonicos sin hardcodear slugs viejos.
 */
const mongoose = require('mongoose');
const tree = require('../data/serviceTree');

const AREA_ID = 'casa-campo';
const area = tree.find((a) => a.id === AREA_ID) || tree.find((a) => /casa|campo/i.test(a.name));
if (!area) {
  console.error('el arbol canonico no tiene el area de casa de campo');
  process.exit(1);
}
const CATEGORY = 'Casa de Campo';
const categoria = area.categories.find((c) => /jardin|piscin/i.test(c.name));
if (!categoria) {
  console.error('el arbol canonico no tiene la categoria de jardin/piscinas en ' + AREA_ID);
  process.exit(1);
}

const marcasDe = (d) => d.brands || [];

(async () => {
  await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const services = mongoose.connection.db.collection('services');

  for (const d of categoria.devices) {
    const path = `${area.id}/${categoria.id}/${d.id}`;
    const doc = { area: CATEGORY, category: categoria.name, device: d.name, brands: marcasDe(d), path };
    const res = await services.updateOne({ path }, { $setOnInsert: doc }, { upsert: true });
    console.log(`${res.upsertedCount ? 'INSERTADO' : 'ya existia'}: ${path} (${d.name}, ${doc.brands.length} marcas)`);
  }

  // Deteccion de residuos: documentos publicos cuyo path no existe en el arbol.
  const canonicos = new Set();
  for (const a of tree) for (const c of a.categories) for (const d of c.devices) canonicos.add(`${a.id}/${c.id}/${d.id}`);
  const fuera = await services.find({ path: { $nin: [...canonicos] } }).project({ path: 1, device: 1 }).sort({ path: 1 }).toArray();
  console.log(`\npublicos: ${await services.countDocuments()} documentos, ${canonicos.size} paths canonicos`);
  console.log(`fuera del arbol: ${fuera.length}`);
  fuera.forEach((s) => console.log('  ' + s.path + '  (' + s.device + ')'));

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
