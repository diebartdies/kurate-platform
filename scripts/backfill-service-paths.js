// Backfill de hogarProfile.servicePaths / professionalProfile.servicePaths.
//
// servicePaths es un cache derivado de services[].path con todos sus prefijos.
// Sin el, el filtro jerarquico de /professionals/search tiene que caer a regex
// anclado parcial, que MongoDB no puede acotar -> collscan sobre `users`.
//
// Este script NO inventa paths: solo calcula prefijos de lo que ya esta
// guardado. Es idempotente (correrlo dos veces no cambia nada).
//
//   node scripts/backfill-service-paths.js              # dry-run, no escribe
//   node scripts/backfill-service-paths.js --apply      # escribe
//   node scripts/backfill-service-paths.js --apply --limit 50
//
// Importa la MISMA funcion que usa el controller, asi que no puede divergir.
require('dotenv').config();

const mongoose = require('mongoose');
const User = require('../models/User');
const { servicePathPrefixes, servicePathLookupValues, servicePrefixRegex } = require('../utils/servicePathMatch');
const config = require('../config/appConfig');

const APPLY = process.argv.includes('--apply');
const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg !== -1 ? parseInt(process.argv[limitArg + 1], 10) : 0;

const HOME = ['hogarProfile.services', 'hogarProfile.servicePaths'];
const PROF = ['professionalProfile.services', 'professionalProfile.servicePaths'];

async function main() {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
  console.log('conectado a ' + mongoose.connection.host + '/' + mongoose.connection.name);

  // Traer solo lo necesario: los arrays de servicios, y el estado de borrado.
  const query = {
    $or: [
      { 'hogarProfile.services.0': { $exists: true } },
      { 'professionalProfile.services.0': { $exists: true } }
    ]
  };
  if (LIMIT) console.log('modo limit: solo se procesaran ' + LIMIT + ' perfiles (para pruebas).');

  let cursor = User.find(query).select(
    'hogarProfile.services hogarProfile.servicePaths professionalProfile.services professionalProfile.servicePaths accountDeletedAt'
  ).lean();
  if (LIMIT) cursor = cursor.limit(LIMIT);

  const users = await cursor;

  console.log('perfiles con servicios: ' + users.length);
  if (!users.length) { await mongoose.disconnect(); return; }

  const ops = [];
  const stats = {
    homeCache: 0, profCache: 0,
    legacyDots: 0, legacySpaces: 0, withBrand: 0,
    homeOnly: 0, profOnly: 0, both: 0
  };
  const ejemplosLegacy = new Map();

  for (const u of users) {
    const homeSvcs = u.hogarProfile && Array.isArray(u.hogarProfile.services) ? u.hogarProfile.services : [];
    const profSvcs = u.professionalProfile && Array.isArray(u.professionalProfile.services) ? u.professionalProfile.services : [];
    if (!homeSvcs.length && !profSvcs.length) continue;

    if (homeSvcs.length && profSvcs.length) stats.both++;
    else if (homeSvcs.length) stats.homeOnly++;
    else stats.profOnly++;

    // Contar que tan legacy es lo guardado, para dimensionar el riesgo.
    for (const s of [...homeSvcs, ...profSvcs]) {
      const p = typeof s === 'string' ? s : (s && s.path) || '';
      if (p.includes('.')) stats.legacyDots++;
      if (p.includes(' ')) stats.legacySpaces++;
      if (p.split(/[./\s]+/).length >= 4) stats.withBrand++;
      if (p.includes('.') || p.includes(' ')) {
        const key = p;
        ejemplosLegacy.set(key, (ejemplosLegacy.get(key) || 0) + 1);
      }
    }

    const set = {};
    if (homeSvcs.length) {
      const pref = servicePathPrefixes(homeSvcs);
      const actual = (u.hogarProfile.servicePaths || []).join('|');
      if (pref.join('|') !== actual) { set['hogarProfile.servicePaths'] = pref; stats.homeCache++; }
    }
    if (profSvcs.length) {
      const pref = servicePathPrefixes(profSvcs);
      const actual = (u.professionalProfile.servicePaths || []).join('|');
      if (pref.join('|') !== actual) { set['professionalProfile.servicePaths'] = pref; stats.profCache++; }
    }
    if (Object.keys(set).length) {
      ops.push({ updateOne: { filter: { _id: u._id }, update: { $set: set } } });
    }
  }

  console.log('\n--- composicion de los datos guardados ---');
  console.log('  solo hogarProfile:      ' + stats.homeOnly);
  console.log('  solo professionalProfile:' + stats.profOnly);
  console.log('  ambos perfiles:          ' + stats.both);
  console.log('  paths con separador ".":  ' + stats.legacyDots);
  console.log('  paths con espacio:        ' + stats.legacySpaces);
  console.log('  paths con marca (4+ seg): ' + stats.withBrand);

  if (ejemplosLegacy.size) {
    console.log('\n--- paths legacy distintos (' + ejemplosLegacy.size + ') ---');
    [...ejemplosLegacy.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
      .forEach(([p, n]) => console.log('  ' + String(n).padStart(3) + 'x  ' + p));
  }

  console.log('\n--- cache a escribir ---');
  console.log('  hogarProfile.servicePaths:      ' + stats.homeCache);
  console.log('  professionalProfile.servicePaths:' + stats.profCache);
  console.log('  perfiles a actualizar:           ' + ops.length);

  if (!APPLY) {
    console.log('\nDRY-RUN: no se escribio nada. Agregar --apply para escribir.');
    await mongoose.disconnect();
    return;
  }

  if (!ops.length) {
    console.log('\nnada que escribir: el cache ya estaba al dia.');
    await mongoose.disconnect();
    return;
  }

  const res = await User.bulkWrite(ops, { ordered: false });
  console.log('\nescrito: ' + (res.modifiedCount || 0) + ' perfiles modificados de ' + ops.length + '.');

  // Verificacion post-escritura: releer y confirmar que el cache coincide.
  const after = await User.find({
    _id: { $in: ops.slice(0, 500).map(o => o.updateOne.filter._id) }
  }).select('hogarProfile.services hogarProfile.servicePaths professionalProfile.services professionalProfile.servicePaths').lean();

  let mismatch = 0;
  for (const u of after) {
    const homeSvcs = u.hogarProfile && Array.isArray(u.hogarProfile.services) ? u.hogarProfile.services : [];
    const profSvcs = u.professionalProfile && Array.isArray(u.professionalProfile.services) ? u.professionalProfile.services : [];
    if (homeSvcs.length) {
      const a = servicePathPrefixes(homeSvcs).sort().join('|');
      const b = [...new Set(u.hogarProfile.servicePaths || [])].sort().join('|');
      if (a !== b) mismatch++;
    }
    if (profSvcs.length) {
      const a = servicePathPrefixes(profSvcs).sort().join('|');
      const b = [...new Set(u.professionalProfile.servicePaths || [])].sort().join('|');
      if (a !== b) mismatch++;
    }
  }
  console.log('verificacion post-escritura: ' + (mismatch ? mismatch + ' con cache inconsistente' : 'cache consistente'));

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
