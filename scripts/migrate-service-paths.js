/**
 * Migra la coleccion publica "services" a los paths/nombres canonicos de
 * data/serviceTree.js y agrega al arbol publico los dispositivos que faltan.
 *
 *   node scripts/migrate-service-paths.js            (dry-run: solo informa)
 *   node scripts/migrate-service-paths.js --apply    (escribe, con backup previo)
 *
 * Que hace:
 *  1. backup de todos los documentos en data/_backup-services-<ts>.json
 *  2. por cada doc: busca el dispositivo canonico por nombre (exacto, luego
 *     unico parcial, primero en el mismo area y despues en todas)
 *  3. borra los docs duplicados cuando el path canonico ya esta ocupado
 *  4. actualiza area / category / device / path con los valores canonicos
 *  5. inserta los dispositivos del arbol que no existen en la coleccion
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const tree = require('../data/serviceTree');

const APPLY = process.argv.includes('--apply');
const BACKUP_DIR = path.join(__dirname, '..', 'data');

// Nombres publicos de area (los que espera el frontend en /api/v1/services)
const AREA_PUBLICA = { hogar: 'Hogar', oficina: 'Oficina', 'casa-campo': 'Casa de Campo', industria: 'Industria' };
const AREA_POR_NOMBRE = {};
for (const a of tree) {
  AREA_POR_NOMBRE[norm(a.name)] = a.id;
  AREA_POR_NOMBRE[norm(AREA_PUBLICA[a.id] || '')] = a.id;
  AREA_POR_NOMBRE[norm(a.id)] = a.id;
}

function norm(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/flux/g, 'fluj') // "Fluxometros" (typo heredado) = "Flujometros"
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// indice canonico: areaId -> lista de { area, cat, dev, path, name, brands }
const CANONICOS = [];
for (const a of tree) {
  for (const c of a.categories) {
    for (const d of c.devices) {
      CANONICOS.push({ areaId: a.id, area: AREA_PUBLICA[a.id] || a.name, cat: c, dev: d, path: `${a.id}/${c.id}/${d.id}` });
    }
  }
}
const byPath = new Map(CANONICOS.map((c) => [c.path, c]));

function areaDelDoc(doc) {
  const seg = String(doc.path || '').split('/')[0];
  return AREA_POR_NOMBRE[norm(seg)] || AREA_POR_NOMBRE[norm(doc.area)] || null;
}

function resolver(doc) {
  const n = norm(doc.device);
  if (!n) return { can: null, motivo: 'sin device' };
  const areaId = areaDelDoc(doc);
  const enArea = CANONICOS.filter((c) => c.areaId === areaId);

  const exacto = enArea.find((c) => norm(c.dev.name) === n);
  if (exacto) return { can: exacto, motivo: 'exacto' };

  const exactoGlobal = CANONICOS.find((c) => norm(c.dev.name) === n);
  if (exactoGlobal) return { can: exactoGlobal, motivo: 'exacto (otra area)' };

  const parciales = enArea.filter((c) => {
    const cn = norm(c.dev.name);
    return cn.includes(n) || n.includes(cn);
  });
  if (parciales.length === 1) return { can: parciales[0], motivo: 'parcial' };
  if (parciales.length > 1) return { can: null, motivo: `ambiguo (${parciales.map((p) => p.dev.name).join(' | ')})` };

  const parcialesGlobal = CANONICOS.filter((c) => {
    const cn = norm(c.dev.name);
    return cn.includes(n) || n.includes(cn);
  });
  if (parcialesGlobal.length === 1) return { can: parcialesGlobal[0], motivo: 'parcial (otra area)' };
  if (parcialesGlobal.length > 1) return { can: null, motivo: `ambiguo global (${parcialesGlobal.map((p) => p.dev.name).join(' | ')})` };

  return { can: null, motivo: 'sin match' };
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const services = mongoose.connection.db.collection('services');
  const docs = await services.find({}).toArray();

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupFile = path.join(BACKUP_DIR, `_backup-services-${ts}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(docs, null, 2));
  console.log(`backup: ${backupFile} (${docs.length} docs)\n`);

  const porPath = new Map();
  for (const d of docs) porPath.set(d.path, (porPath.get(d.path) || []).concat([d]));

  const cambios = [];
  const borrrar = [];
  const sinMatch = [];
  const destinoOcupado = new Set();

  for (const doc of docs) {
    const { can, motivo } = resolver(doc);
    if (!can) { sinMatch.push({ path: doc.path, device: doc.device, motivo }); continue; }
    if (can.path === doc.path && can.dev.name === doc.device && doc.category === can.cat.name && doc.area === can.area) {
      cambios.push({ tipo: 'igual', doc, can });
      continue;
    }
    if (destinoOcupado.has(can.path)) {
      borrrar.push({ doc, can, motivo: 'destino ya asignado en este lote' });
      continue;
    }
    destinoOcupado.add(can.path);
    cambios.push({ tipo: 'actualizar', doc, can, motivo });
  }

  // los paths canonicos ya presentes en la coleccion que NO fueron migrados
  // (docs nuevos) ocupan destino: si un legacy cae ahi, se borra el legacy
  const canonicosYaPresentes = new Set();
  for (const d of docs) if (byPath.has(d.path)) canonicosYaPresentes.add(d.path);
  for (const c of cambios) {
    if (c.tipo !== 'actualizar') continue;
    if (canonicosYaPresentes.has(c.can.path) && c.can.path !== c.doc.path) {
      const mismoNombre = norm(c.doc.device) === norm(c.can.dev.name);
      if (mismoNombre) {
        borrrar.push({ doc: c.doc, can: c.can, motivo: 'duplicado: el canonico ya existe con el mismo nombre' });
        c.tipo = 'borrar';
      } else {
        c.tipo = 'rechazado';
        c.motivo = `el path canonico ya lo ocupa "${c.can.dev.name}" (nombre distinto)`;
      }
    }
  }

  const faltan = CANONICOS.filter((c) => !porPath.has(c.path) && !cambios.some((x) => x.can && x.can.path === c.path));

  console.log(`TOTAL docs=${docs.length}  canonicos=${CANONICOS.length}`);
  console.log(`  a actualizar : ${cambios.filter((c) => c.tipo === 'actualizar').length}`);
  console.log(`  a borrar     : ${borrrar.length}`);
  console.log(`  ya correctos : ${cambios.filter((c) => c.tipo === 'igual').length}`);
  console.log(`  a insertar   : ${faltan.length}`);
  console.log(`  sin match    : ${sinMatch.length}`);
  console.log(`  rechazados   : ${cambios.filter((c) => c.tipo === 'rechazado').length}\n`);

  if (process.env.VERBOSE || sinMatch.length) {
    console.log('--- sin match ---');
    sinMatch.forEach((s) => console.log(`  ${s.path}\n      device="${s.device}"  -> ${s.motivo}`));
  }
  const rech = cambios.filter((c) => c.tipo === 'rechazado');
  if (rech.length) {
    console.log('--- rechazados (revisar a mano) ---');
    rech.forEach((c) => console.log(`  ${c.doc.path}  ->  ${c.can.path}  (${c.motivo})`));
  }
  if (borrrar.length) {
    console.log('--- a borrar (duplicados) ---');
    borrrar.forEach((b) => console.log(`  ${b.doc.path} (${b.doc.device})  ->  ${b.can.path}  [${b.motivo}]`));
  }
  if (faltan.length) {
    console.log('--- a insertar (estan en el arbol, no en la coleccion) ---');
    faltan.forEach((f) => console.log(`  ${f.path}  (${f.dev.name}, ${f.dev.brands.length} marcas)`));
  }

  if (!APPLY) {
    console.log('\nDRY-RUN: no se escribio nada. Usa --apply para aplicar.');
    await mongoose.disconnect();
    return;
  }

  let upd = 0, del = 0, ins = 0;
  for (const c of cambios) {
    if (c.tipo !== 'actualizar') continue;
    await services.updateOne({ _id: c.doc._id }, { $set: { area: c.can.area, category: c.can.cat.name, device: c.can.dev.name, path: c.can.path, brands: c.can.dev.brands } });
    upd++;
  }
  for (const b of borrrar) {
    await services.deleteOne({ _id: b.doc._id });
    del++;
  }
  for (const f of faltan) {
    await services.updateOne(
      { path: f.path },
      { $set: { area: f.area, category: f.cat.name, device: f.dev.name, brands: f.dev.brands }, $setOnInsert: { path: f.path } },
      { upsert: true }
    );
    ins++;
  }

  const total = await services.countDocuments();
  const sinDevice = await services.countDocuments({ $or: [{ device: { $exists: false } }, { device: null }, { device: '' }] });
  const dup = await services.aggregate([{ $group: { _id: '$path', n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }]).toArray();
  const fuera = await services.countDocuments({ path: { $nin: CANONICOS.map((c) => c.path) } });
  console.log(`\nAPLICADO: actualizados=${upd} borrados=${del} insertados=${ins}`);
  console.log(`verificacion: servicios=${total} device_vacio=${sinDevice} paths_duplicados=${dup.length} fuera_del_arbol=${fuera}`);

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
