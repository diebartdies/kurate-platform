/**
 * Compara el arbol publico (coleccion Service, el que usa el directorio) con
 * data/serviceTree.js (el que guarda el profesional) para detectar paths que
 * NO coinciden: un dispositivo guardado 'casa-campo/jardin-piscinas-campo/
 * podar-arboles' no responde al filtro del directorio
 * 'casa-de-campo/jardin-y-piscinas-de-campo/podar-arboles'.
 */
const mongoose = require('mongoose');
const tree = require('/app/data/serviceTree');
const { normalizeServicePath } = require('/app/utils/servicePathMatch');

const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// indice del arbol del dashboard: nombre de dispositivo normalizado -> path
const index = new Map();
for (const area of tree) {
  for (const cat of area.categories || []) {
    for (const dev of cat.devices || []) {
      index.set(norm(dev.name), { path: `${area.id}/${cat.id}/${dev.id}`, area: area.name, cat: cat.name, dev: dev.name });
    }
  }
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const services = mongoose.connection.db.collection('services');
  const docs = await services.find({}).project({ area: 1, category: 1, device: 1, path: 1 }).toArray();

  let ok = 0;
  const faltan = [];
  const difieren = [];
  for (const d of docs) {
    const hit = index.get(norm(d.device));
    if (!hit) { faltan.push(d); continue; }
    if (normalizeServicePath(hit.path) === normalizeServicePath(d.path)) ok++;
    else difieren.push({ doc: d, tree: hit });
  }

  console.log(`total dispositivos publicos: ${docs.length}`);
  console.log(`  path IDENTICO al del dashboard: ${ok}`);
  console.log(`  path DIFERENTE: ${difieren.length}`);
  console.log(`  sin equivalente en el dashboard: ${faltan.length}`);

  console.log('\n--- paths que NO matchean ---');
  difieren.forEach(({ doc, tree: t }) => {
    console.log(`  area "${doc.area}" / cat "${doc.category}" / dev "${doc.device}"`);
    console.log(`     publico:   ${doc.path}`);
    console.log(`     dashboard: ${t.path}`);
  });
  if (faltan.length) {
    console.log('\n--- dispositivos publicos sin equivalente ---');
    faltan.forEach((d) => console.log(`  ${d.path}  (${d.device})`));
  }
  console.log('\n--- areas del dashboard ---');
  tree.forEach((a) => console.log(`  ${a.id}: ${a.categories.length} categorias, ${(a.categories || []).reduce((n, c) => n + (c.devices || []).length, 0)} dispositivos`));

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });