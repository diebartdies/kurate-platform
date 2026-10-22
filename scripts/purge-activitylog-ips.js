/**
 * Reporta (y opcionalmente borra) los registros de ActivityLog que provienen
 * de IPs internas de desarrollo/red local.
 *
 * Uso dentro del contenedor de la app (usa MONGO_URI del entorno):
 *   docker exec KuraTe_app node /app/scripts/purge-activitylog-ips.js --dry-run
 *   docker exec KuraTe_app node /app/scripts/purge-activitylog-ips.js --apply
 *
 * --apply pide --yes para no borrar sin confirmacion explicita.
 * Siempre hace un dump de la coleccion antes de borrar.
 */
const mongoose = require('mongoose');

const ActivityLog = require('../models/ActivityLog');

const TARGET_IPS = ['192.168.1.8', '192.168.1.67'];
const COLLECTION = 'activitylogs';
const BACKUP_DIR = '/app/data';

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);

function log(...a) { console.log(...a); }

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  const totalAll = await ActivityLog.countDocuments({});
  log('=== purga de ActivityLog por IP ===');
  log('  coleccion: ' + COLLECTION);
  log('  total actual: ' + totalAll);

  let objetivo = 0;
  for (const ip of TARGET_IPS) {
    const n = await ActivityLog.countDocuments({ ipAddress: ip });
    objetivo += n;
    log('');
    log('  ' + ip + ': ' + n + ' registros');
    if (!n) continue;
    // aggregate() en mongoose 4 devuelve una query que necesita exec(), y su
    // wrapper de coleccion no expone aggregate. Se usa la coleccion NATIVA
    // del driver (db.collection) que si acepta el pipeline directamente.
    const col = mongoose.connection.db.collection(COLLECTION);
    const porAccion = await col.aggregate([
      { $match: { ipAddress: ip } },
      { $group: { _id: '$action', n: { $sum: 1 } } },
      { $sort: { n: -1 } }
    ]).toArray();
    porAccion.forEach(r => log('      ' + r._id + ': ' + r.n));
    const rango = await col.aggregate([
      { $match: { ipAddress: ip } },
      { $group: { _id: null, min: { $min: '$createdAt' }, max: { $max: '$createdAt' } } }
    ]).toArray();
    if (rango.length) {
      log('      rango: ' + rango[0].min.toISOString() + ' -> ' + rango[0].max.toISOString());
    }
    const actorTypes = await ActivityLog.distinct('actorType', { ipAddress: ip });
    log('      actorType: ' + JSON.stringify(actorTypes));
    const profs = await ActivityLog.distinct('professional', { ipAddress: ip });
    log('      profesionales distintos: ' + profs.length);
  }

  log('');
  log('  a borrar: ' + objetivo + ' de ' + totalAll + ' (' +
      (totalAll ? Math.round((objetivo / totalAll) * 100) : 0) + '%)');

  if (!objetivo) {
    log('  no hay nada que borrar.');
    await mongoose.disconnect();
    return;
  }

  if (has('--apply')) {
    if (!has('--yes')) {
      log('');
      log('  FALTA --yes. No se borro nada.');
      await mongoose.disconnect();
      process.exit(1);
    }

    // Respaldo antes de borrar. Si el dump falla, no se toca la coleccion.
    // Se hace con la API de mongoose en vez de shelling out a docker: la
    // imagen de la app no tiene bash, y ademas el driver ya esta conectado.
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const out = BACKUP_DIR + '/activitylogs-prepurge-' + stamp + '.json';
    log('');
    log('  respaldo -> ' + out);
    try {
      const docs = await ActivityLog.find({ ipAddress: { $in: TARGET_IPS } }).lean().exec();
      require('fs').writeFileSync(out, JSON.stringify(docs, null, 2));
      log('  respaldo OK (' + docs.length + ' documentos, ' +
          Math.round(require('fs').statSync(out).size / 1024) + ' KB)');
    } catch (err) {
      log('  FALLO el respaldo, no se borra nada: ' + err.message);
      await mongoose.disconnect();
      process.exit(1);
    }

    const res = await ActivityLog.deleteMany({ ipAddress: { $in: TARGET_IPS } });
    log('  borrados: ' + res.deletedCount);
    const restante = await ActivityLog.countDocuments({});
    log('  total restante: ' + restante);
    log('  quedan de esas IPs: ' + await ActivityLog.countDocuments({ ipAddress: { $in: TARGET_IPS } }));
  } else {
    log('');
    log('  dry-run: nada se borro. Usar --apply --yes para confirmar.');
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('purge-activitylog-ips error:', err.message);
  process.exit(1);
});
