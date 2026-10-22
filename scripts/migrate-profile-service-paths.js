/**
 * Audita los paths de servicio que guardan los profesionales y los avisos
 * (hogarProfile.services[].path) y los migra a los canonicos de
 * data/serviceTree.js cuando el nombre del dispositivo se puede resolver.
 *
 *   node scripts/migrate-profile-service-paths.js           (dry-run)
 *   node scripts/migrate-profile-service-paths.js --apply
 */
const mongoose = require('mongoose');
const tree = require('../data/serviceTree');

const APPLY = process.argv.includes('--apply');
const AREA_PUBLICA = { hogar: 'Hogar', oficina: 'Oficina', 'casa-campo': 'Casa de Campo', industria: 'Industria' };
const AREA_POR_NOMBRE = {};

function norm(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/flux/g, 'fluj')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

for (const a of tree) {
  AREA_POR_NOMBRE[norm(a.name)] = a.id;
  AREA_POR_NOMBRE[norm(AREA_PUBLICA[a.id] || '')] = a.id;
  AREA_POR_NOMBRE[norm(a.id)] = a.id;
}

const CANONICOS = [];
for (const a of tree) for (const c of a.categories) for (const d of c.devices) CANONICOS.push({ areaId: a.id, cat: c, dev: d, path: `${a.id}/${c.id}/${d.id}` });
const canonSet = new Set(CANONICOS.map((c) => c.path));
const byNormName = new Map();
for (const c of CANONICOS) {
  const k = norm(c.dev.name);
  if (!byNormName.has(k)) byNormName.set(k, []);
  byNormName.get(k).push(c);
}

function normalizarPath(p) {
  const raw = String(p || '').trim();
  // Paths viejos guardados con puntos: "hogar.linea-blanca.heladera"
  if (raw && raw.indexOf('/') === -1 && raw.indexOf('.') !== -1) return raw.split('.').join('/');
  return raw;
}

function resolver(svc) {
  const original = String(svc.path || '');
  const raw = normalizarPath(original);
  if (canonSet.has(raw)) return { can: CANONICOS.find((c) => c.path === raw), original, motivo: 'canonico' };
  const n = norm(svc.device || raw.split('/').pop() || '');
  if (!n) return { can: null, original, motivo: 'sin nombre' };
  const areaId = AREA_POR_NOMBRE[norm(raw.split('/')[0])] || AREA_POR_NOMBRE[norm(svc.area || '')] || null;
  const candidatos = byNormName.get(n) || [];
  const enArea = candidatos.filter((c) => c.areaId === areaId);
  let elegido = null;
  let motivo = '';
  if (enArea.length === 1) { elegido = enArea[0]; motivo = 'nombre+area'; }
  else if (candidatos.length === 1) { elegido = candidatos[0]; motivo = 'nombre'; }
  else {
    const parciales = CANONICOS.filter((c) => {
      const cn = norm(c.dev.name);
      return cn.includes(n) || n.includes(cn);
    });
    const parArea = areaId ? parciales.filter((c) => c.areaId === areaId) : [];
    if (parArea.length === 1) { elegido = parArea[0]; motivo = 'parcial+area'; }
    else if (parciales.length === 1) { elegido = parciales[0]; motivo = 'parcial'; }
    else return { can: null, original, motivo: parArea.length > 1 || parciales.length > 1 ? 'ambiguo' : 'sin match' };
  }
  // Nunca cambiar de area: un servicio de oficina no puede pasar a Hogar.
  if (areaId && elegido.areaId !== areaId) {
    return { can: null, original, motivo: `cambia de area (${areaId} -> ${elegido.areaId})` };
  }
  return { can: elegido, original, motivo };
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const db = mongoose.connection.db;
  const users = db.collection('users');
  const avisos = db.collection('avisos');

  const docs = await users.find({ 'hogarProfile.services.path': { $exists: true } }).toArray();
  const conServicios = docs.filter((u) => Array.isArray(u.hogarProfile?.services) && u.hogarProfile.services.length);

  const resumen = { canonicos: 0, aMigrar: 0, sinMatch: 0, sinPath: 0 };
  const migraciones = new Map();
  const sinMatch = new Map();
  const muestra = [];

  for (const u of conServicios) {
    for (const svc of u.hogarProfile.services) {
      if (!svc.path) { resumen.sinPath++; continue; }
      const r = resolver(svc);
      if (r.can && r.can.path === svc.path) { resumen.canonicos++; continue; }
      if (r.can) {
        resumen.aMigrar++;
        const k = `${svc.path} -> ${r.can.path}`;
        migraciones.set(k, (migraciones.get(k) || 0) + 1);
        if (muestra.length < 6) muestra.push({ email: u.email, de: svc.path, a: r.can.path, motivo: r.motivo, device: svc.device });
      } else {
        resumen.sinMatch++;
        const k = `${svc.path}  (${r.motivo})`;
        sinMatch.set(k, (sinMatch.get(k) || 0) + 1);
      }
    }
  }

  // avisos: los avisos guardan area/category/device
  const avisosConPath = await avisos.countDocuments({ 'hogarProfile.services.path': { $exists: true } });
  const avisosMuestra = await avisos.find({ 'hogarProfile.services.path': { $exists: true } }).limit(1).project({ 'hogarProfile.services': 1 }).toArray();

  console.log(`profesionales con servicios: ${conServicios.length} / ${docs.length} con el campo`);
  console.log(`  entradas canonicas : ${resumen.canonicos}`);
  console.log(`  a migrar           : ${resumen.aMigrar}`);
  console.log(`  sin match          : ${resumen.sinMatch}`);
  console.log(`  sin path           : ${resumen.sinPath}`);
  console.log(`\navisos con hogarProfile.services.path: ${avisosConPath}`);
  if (avisosMuestra.length) console.log('  ejemplo aviso: ' + JSON.stringify(avisosMuestra[0].hogarProfile.services).slice(0, 300));

  console.log(`\n--- paths a migrar (${migraciones.size} distintos) ---`);
  [...migraciones.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  x${String(n).padStart(3)}  ${k}`));
  console.log(`\n--- sin match (${sinMatch.size} distintos) ---`);
  [...sinMatch.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  x${String(n).padStart(3)}  ${k}`));
  console.log('\nmuestra de resoluciones:');
  muestra.forEach((m) => console.log(`  ${m.email}: ${m.de} -> ${m.a}  (${m.motivo})`));

  if (!APPLY) {
    console.log('\nDRY-RUN: no se escribio nada. Usa --apply para aplicar.');
    await mongoose.disconnect();
    return;
  }

  let cambiados = 0, serviciosTocados = 0;
  for (const u of conServicios) {
    let modificados = 0;
    const nuevos = u.hogarProfile.services.map((svc) => {
      const r = resolver(svc);
      if (r.can && r.can.path !== svc.path) {
        modificados++;
        cambiados++;
        return { ...svc, path: r.can.path, device: r.can.dev.name };
      }
      return svc;
    });
    if (modificados) {
      await users.updateOne({ _id: u._id }, { $set: { 'hogarProfile.services': nuevos } });
      serviciosTocados++;
    }
  }
  console.log(`\nAPLICADO: profesionales=${serviciosTocados} servicios=${cambiados}`);

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
