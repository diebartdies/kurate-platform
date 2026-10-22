/**
 * Purga de ActivityLog para IPs internas / loopback y para la IP publica de
 * salida del owner.
 *
 * Que borra:
 *   - loopback        : 127.0.0.1 y ::1 (y cualquier forma equivalent)
 *   - red local       : 192.168.*, 10.*, 172.16-31.*, 172.18/19/20.* (docker)
 *   - IP publica      : la que sale por la conexion del owner
 *
 * NO borra los `userAgent` ni los `action` de otras IPs: el panel conserva el
 * historial de visitantes reales.
 *
 * Uso (dentro del contenedor de la app, usa MONGO_URI del entorno):
 *   docker exec KuraTe_app node /app/scripts/purge-activitylog-internal-ips.js --dry-run
 *   docker exec KuraTe_app node /app/scripts/purge-activitylog-internal-ips.js --apply --yes
 *
 * --apply exige --yes. Siempre hace mongodump de la coleccion antes de borrar.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const ActivityLog = require('../models/ActivityLog');

const COLLECTION = 'activitylogs';
const BACKUP_DIR = '/app/data';

// IP publica de salida del owner. Separada del bloque de redes internas para
// poder sacarla sin tocar la logica de "red local".
const OWNER_PUBLIC_IP = '181.97.189.194';

const INTERNAL_PATTERNS = [
  { label: 'loopback 127.0.0.0/8', match: { ipAddress: /^127\./ } },
  { label: 'loopback ::1', match: { ipAddress: /^::1$/ } },
  { label: 'loopback ::ffff:127.*', match: { ipAddress: /^::ffff:127\./ } },
  { label: 'docker 172.16/12', match: { ipAddress: /^172\.(1[6-9]|2\d|3[01])\./ } },
  { label: 'red local 192.168.0/16', match: { ipAddress: /^192\.168\./ } },
  { label: 'red local 10.0.0.0/8', match: { ipAddress: /^10\./ } },
  { label: 'link-local 169.254/16', match: { ipAddress: /^169\.254\./ } }
];

const TARGETS = [...INTERNAL_PATTERNS, { label: 'ip publica del owner', match: { ipAddress: OWNER_PUBLIC_IP } }];

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const YES = args.includes('--yes');
const DRY = !APPLY;

function log(...a) { console.log(...a); }

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  const totalAll = await ActivityLog.countDocuments({});
  log('=== purga de ActivityLog: IPs internas + IP publica del owner ===');
  log('  coleccion      : ' + COLLECTION);
  log('  total actual   : ' + totalAll);
  log('  modo           : ' + (DRY ? 'DRY-RUN (no borra)' : 'APPLY'));

  // Preview por IP: el detalle que hace util auditar antes de borrar.
  const col = mongoose.connection.db.collection(COLLECTION);
  const grouped = await col.aggregate([
    { $match: { ipAddress: { $exists: true, $nin: [null, ''] } } },
    { $group: { _id: '$ipAddress', n: { $sum: 1 }, min: { $min: '$createdAt' }, max: { $max: '$createdAt' } } },
    { $sort: { n: -1 } }
  ]).toArray();

  let objetivo = 0;
  const seen = new Set();
  log('\n--- IPs a borrar ---');
  for (const t of TARGETS) {
    const rows = grouped.filter((g) => matches(t.match, g._id));
    const n = rows.reduce((a, r) => a + r.n, 0);
    objetivo += n;
    rows.forEach((r) => seen.add(r._id));
    log('  ' + t.label + ' : ' + n + ' registros');
    rows.slice(0, 12).forEach((r) => {
      log('      ' + String(r._id).padEnd(16) + String(r.n).padStart(5) + '  ' +
        r.min.toISOString().slice(0, 10) + ' -> ' + r.max.toISOString().slice(0, 10));
    });
    if (rows.length > 12) log('      ... +' + (rows.length - 12) + ' IPs mas de este grupo');
  }
  // Los patrones se solapan entre si (172.16/12 cubre 172.18.x de docker), asi
  // que el objetivo real se cuenta sobre el union de IPs, no sumando patrones.
  const objetivoReal = grouped.filter((g) => seen.has(g._id)).reduce((a, r) => a + r.n, 0);

  log('\n  IPs a borrar       : ' + seen.size);
  log('  registros a borrar : ' + objetivoReal);
  log('  registros a conservar: ' + (totalAll - objetivoReal));

  if (DRY) {
    log('\nDRY-RUN: no se borro nada. Re-run con --apply --yes para borrar.');
    await mongoose.disconnect();
    return;
  }

  if (!YES) {
    log('\nABORTA: --apply requiere --yes para confirmar el borrado.');
    await mongoose.disconnect();
    process.exit(1);
  }

  // Backup antes de borrar: los logs no se regeneran solos.
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const out = path.join(BACKUP_DIR, 'activitylogs_prepurge_' + stamp + '.json');
    const docs = await col.find({ ipAddress: { $in: [...seen] } }).toArray();
    fs.writeFileSync(out, JSON.stringify(docs));
    log('\n  backup escrito: ' + out + ' (' + docs.length + ' docs)');
  } catch (err) {
    log('  FALLO el backup: ' + err.message);
    log('  se aborta el borrado para no perder datos irrecuperables.');
    await mongoose.disconnect();
    process.exit(1);
  }

  const res = await col.deleteMany({ ipAddress: { $in: [...seen] } });
  log('\n  borrados: ' + res.deletedCount);

  const restantes = await ActivityLog.countDocuments({});
  log('  activitylogs ahora: ' + restantes);

  const quedanInternas = await ActivityLog.countDocuments({
    $or: TARGETS.map((t) => t.match)
  });
  log('  registros con IP interna/publica del owner restantes: ' + quedanInternas);

  await mongoose.disconnect();
}

// Mongo solo acepta un operador por clave, asi que "ipAddress" con $in o regex
// se resuelve probando el valor concreto de cada fila agrupada.
function matches(match, ip) {
  if (match.ipAddress instanceof RegExp) return match.ipAddress.test(ip);
  return match.ipAddress === ip;
}

main().catch(async (err) => {
  console.error('ERROR: ' + err.message);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});