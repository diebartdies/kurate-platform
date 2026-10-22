/**
 * Alinea los paths del arbol publico (coleccion Service) con los ids
 * canonicos de data/serviceTree.js, que es el formato que el profesional
 * guarda en hogarProfile.services[].path.
 *
 * Motivo: conviven dos convenciones y el filtro del directorio manda el path
 * publico. Con slugs distintos, elegir un dispositivo en el buscador devolvia
 * 0 resultados aunque el profesional lo tuviera cargado (65 de 73 casos).
 *
 * Las URLs SEO se generan desde data/serviceTree.js, NO desde esta coleccion,
 * asi que migrar los paths no cambia ninguna URL indexada.
 *
 * Uso:  node align-service-paths.js plan | apply
 */
const mongoose = require('mongoose');
const tree = require('/app/data/serviceTree');

const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const index = new Map();      // "area | device" -> nodo canonico
const byDevice = new Map();  // "device" -> [nodos]
for (const area of tree) {
  for (const cat of area.categories || []) {
    for (const dev of cat.devices || []) {
      const node = { path: `${area.id}/${cat.id}/${dev.id}`, area: area.name, cat: cat.name, dev: dev.name, brands: dev.brands || [] };
      index.set(`${norm(area.name)}|${norm(dev.name)}`, node);
      if (!byDevice.has(norm(dev.name))) byDevice.set(norm(dev.name), []);
      byDevice.get(norm(dev.name)).push(node);
    }
  }
}

function resolve(areaName, deviceName) {
  const direct = index.get(`${norm(areaName)}|${norm(deviceName)}`);
  if (direct) return direct;
  const cands = byDevice.get(norm(deviceName)) || [];
  return cands.length === 1 ? cands[0] : null;
}

(async () => {
  const mode = process.argv[2] || 'plan';
  await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const services = mongoose.connection.db.collection('services');
  const users = mongoose.connection.db.collection('users');
  const docs = await services.find({}).project({ area: 1, category: 1, device: 1, path: 1, brands: 1 }).toArray();

  const changes = [];
  const sinNodo = [];
  for (const d of docs) {
    const node = resolve(d.area, d.device);
    if (!node) { sinNodo.push(d); continue; }
    if (d.path !== node.path) changes.push({ doc: d, node });
  }

  console.log(`modo: ${mode}`);
  console.log(`dispositivos publicos: ${docs.length}`);
  console.log(`  a migrar: ${changes.length}`);
  console.log(`  ya alineados: ${docs.length - changes.length - sinNodo.length}`);
  console.log(`  sin nodo canonico: ${sinNodo.length}`);
  sinNodo.forEach((d) => console.log(`    - ${d.path}  (${d.area} / ${d.device})`));

  // paths que usan los profesionales y ya no existen en el arbol canonico
  const canonDevices = new Set([...index.values()].map((n) => n.path));
  const canonSegs = new Set();
  for (const p of canonDevices) p.split('/').forEach((s) => canonSegs.add(s));
  const storedPaths = await users.distinct('hogarProfile.services.path');
  const huerfanos = storedPaths.filter((p) => {
    const segs = String(p).toLowerCase().split(/[./]+/).filter(Boolean);
    if (!segs.length) return false;
    const dev = segs[segs.length - 1];
    return !canonSegs.has(dev);
  });
  console.log(`\npaths guardados por profesionales: ${storedPaths.length}`);
  console.log(`  con dispositivo desconocido en el arbol: ${huerfanos.length}`);
  huerfanos.forEach((p) => console.log(`    - ${p}`));

  if (mode !== 'apply') {
    console.log('\n--- ejemplo de migracion (10) ---');
    changes.slice(0, 10).forEach(({ doc, node }) => console.log(`  ${doc.path}\n     -> ${node.path}`));
    await mongoose.disconnect();
    return;
  }

  // fase 1: liberar los paths viejos sin chocar con el indice unico
  for (const { doc } of changes) {
    await services.updateOne({ path: doc.path }, { $set: { path: `${doc.path}__tmp` } });
  }
  // fase 2: escribir el path canonico
  for (const { doc, node } of changes) {
    await services.updateOne({ path: `${doc.path}__tmp` }, { $set: { path: node.path } });
  }
  // fase 3: reconstruir area/category con los nombres canonicos
  for (const { doc, node } of changes) {
    await services.updateOne({ path: node.path, device: doc.device }, { $set: { area: node.area, category: node.cat } });
  }

  const restantes = await services.countDocuments({ path: /__tmp$/ });
  const finales = await services.find({}).project({ path: 1 }).toArray();
  const fueraDeArbol = finales.filter((d) => !index.has(`${norm(d.path.split('/')[0] === 'hogar' ? 'Hogar' : d.path.split('/')[0] === 'oficina' ? 'Oficina' : d.path.split('/')[0] === 'casa-campo' ? 'Casa de Campo' : 'Industria')}|${norm('')}`));
  console.log(`\nmigrados: ${changes.length}`);
  console.log(`paths temporales remanentes: ${restantes}`);
  const porArea = {};
  for (const d of finales) {
    const a = d.path.split('/')[0];
    porArea[a] = (porArea[a] || 0) + 1;
  }
  console.log('dispositivos por area:', JSON.stringify(porArea));
  console.log('ejemplo:', finales.slice(0, 3).map((d) => d.path).join(' | '));
  void fueraDeArbol;
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });