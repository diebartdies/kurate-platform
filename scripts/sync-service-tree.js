/**
 * Sincroniza la coleccion publica "services" con data/serviceTree.js.
 *
 * Idempotente, y por defecto solo informa (dry-run): hay que pasar --apply.
 *
 *   node scripts/sync-service-tree.js            # informe, no escribe
 *   node scripts/sync-service-tree.js --apply    # upsert real
 *
 * Criterio de escritura, para no pisar la traduccion que ya esta en produccion:
 *   - documento nuevo  -> se crea con el nombre de display del arbol
 *   - documento existant -> NO se tocan area/category/device/brands, porque en
 *     produccion estan ya traducidos ("Hogar", no "Home") y el arbol trae los
 *     nombres de area en ingles.
 *   - documento existente sin brands -> se le completan desde el arbol.
 * Nunca borra: un service que este en mongo y no en el arbol se reporta como
 * huerfano y se deja como esta.
 */
const mongoose = require('mongoose');
const tree = require('../data/serviceTree');

// El arbol trae name: 'Home' / 'Office' para las areas, pero produccion guarda
// la etiqueta en espanol. Estas son las que ya existen en produccion.
const AREA_LABEL = {
  'hogar': 'Hogar',
  'oficina': 'Oficina',
  'casa-campo': 'Casa de Campo',
  'industria': 'Industria'
};

const SEP = '/';

/** Aplan el arbol a una lista de dispositivos con su path canonico. */
function aplanar() {
  const out = [];
  for (const area of (Array.isArray(tree) ? tree : tree.areas || [])) {
    const areaId = area.slug || area.id;
    if (!areaId) continue;
    // Nombre de display del area: el mapeo primero, si no el id capitalizado.
    const areaName = AREA_LABEL[areaId] ||
      String(area.name || areaId).replace(/^\w/, c => c.toUpperCase());
    for (const cat of (area.categories || area.children || [])) {
      const catId = cat.slug || cat.id;
      if (!catId) continue;
      for (const dev of (cat.devices || cat.items || cat.children || [])) {
        const devId = dev.slug || dev.id;
        if (!devId) continue;
        out.push({
          path: [areaId, catId, devId].join(SEP),
          areaId,
          area: areaName,
          category: cat.name || catId,
          device: dev.name || devId,
          brands: Array.isArray(dev.brands) ? dev.brands : []
        });
      }
    }
  }
  return out;
}

(async () => {
  const aplicar = process.argv.includes('--apply');
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) { console.log('FALTA MONGO_URI'); process.exit(1); }

  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  const services = mongoose.connection.db.collection('services');

  const desired = aplanar();
  const stats = { nuevos: 0, actualizados: 0, sinCambios: 0, huerfanos: 0, completados: 0 };
  const detalle = { nuevos: [], huerfanos: [], completados: [] };
  const ops = [];

  for (const d of desired) {
    const actual = await services.findOne({ path: d.path }, { projection: { brands: 1, area: 1, category: 1, device: 1 } });
    if (!actual) {
      stats.nuevos++;
      detalle.nuevos.push(d.path);
      ops.push({
        updateOne: {
          filter: { path: d.path },
          update: {
            $setOnInsert: {
              path: d.path, area: d.area, category: d.category,
              device: d.device, brands: d.brands,
              createdAt: new Date(), updatedAt: new Date()
            }
          },
          upsert: true
        }
      });
      continue;
    }
    const sinBrands = !Array.isArray(actual.brands) || actual.brands.length === 0;
    if (sinBrands && d.brands.length) {
      stats.completados++;
      detalle.completados.push(d.path);
      ops.push({
        updateOne: {
          filter: { path: d.path },
          update: { $set: { brands: d.brands, updatedAt: new Date() } }
        }
      });
    } else {
      stats.sinCambios++;
    }
  }

  // Services en mongo que no estan en el arbol: se reportan, no se tocan.
  const pathsArbol = new Set(desired.map(d => d.path));
  for (const doc of await services.find({}, { projection: { path: 1, area: 1, device: 1 } }).toArray()) {
    if (doc.path && !pathsArbol.has(doc.path)) {
      stats.huerfanos++;
      detalle.huerfanos.push(`${doc.path} (${doc.area} / ${doc.device})`);
    }
  }

  console.log('=== sync de services vs data/serviceTree.js ===');
  console.log('  dispositivos en el arbol:      ' + desired.length);
  console.log('  services en mongo:             ' + await services.countDocuments());
  console.log('  paths unicos en el arbol:      ' + pathsArbol.size);
  console.log('');
  console.log('  nuevos a insertar:             ' + stats.nuevos);
  console.log('  ya estaban (sin tocar):        ' + stats.sinCambios);
  console.log('  completados brands:            ' + stats.completados);
  console.log('  huerfanos (no estan en arbol): ' + stats.huerfanos);
  console.log('  eliminados:                    0 (este script nunca borra)');

  if (detalle.huerfanos.length) {
    console.log('\n  huerfanos:');
    detalle.huerfanos.forEach(h => console.log('    ' + h));
  }
  if (detalle.nuevos.length && detalle.nuevos.length <= 100) {
    console.log('\n  nuevos:');
    detalle.nuevos.forEach(p => console.log('    ' + p));
  }

  if (aplicar && ops.length) {
    const r = await services.bulkWrite(ops, { ordered: false });
    console.log('\n  aplicado: inserted=' + r.upsertedCount + ' modified=' + r.modifiedCount);
    console.log('  services ahora: ' + await services.countDocuments());
  } else if (ops.length) {
    console.log('\n  (dry-run: no se escribio nada. Usar --apply para confirmar.)');
  }

  await mongoose.disconnect();
})().catch(e => { console.log('ERROR ' + e.message); process.exit(1); });
