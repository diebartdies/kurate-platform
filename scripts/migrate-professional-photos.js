// Migra a la DB las fotos de perfil que apuntan a archivos estáticos
// inexistentes (p. ej. /images/professionals/*.jpg) reemplazándolas por un
// avatar SVG base64 persistido en MongoDB. Idempotente.
//
//   MONGO_URI=... node scripts/migrate-professional-photos.js
//
// Nunca crea usuarios: solo actualiza los que ya tienen una foto estática.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

const PHOTO_COLORS = ['#1f6feb', '#2ea043', '#bf3989', '#d29922', '#8957e5', '#0a7ea4', '#cf222e', '#6e40c9', '#0969da', '#9a6700', '#8250df', '#116329', '#a40e26'];

function makeAvatar(alias, hex) {
  const initials = String(alias || '?')
    .replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase() || '?';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="${hex}"/><text x="50%" y="55%" font-family="Arial" font-size="140" font-weight="bold" fill="#ffffff" text-anchor="middle">${initials}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

const isBroken = (p) => typeof p === 'string' && /^\/images\//.test(p);

async function run() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/KuraTe';
  await mongoose.connect(uri);
  console.log('Conectado a MongoDB');

  const users = await User.find({ 'professionalProfile.photos': /^\/images\// });
  console.log('Usuarios con foto estática:', users.length);

  let migrated = 0;
  for (const u of users) {
    const pp = u.professionalProfile || {};
    const alias = pp.alias || u.email;
    const valid = (pp.photos || []).filter((p) => !isBroken(p));
    pp.photos = valid.length ? valid : [makeAvatar(alias, PHOTO_COLORS[migrated % PHOTO_COLORS.length])];
    u.professionalProfile = pp;
    u.markModified('professionalProfile');
    await u.save();
    console.log('  migrado:', alias);
    migrated++;
  }

  const remaining = await User.countDocuments({ 'professionalProfile.photos': /^\/images\// });
  console.log('Migrados:', migrated, '| restantes con foto estática:', remaining);
  await mongoose.disconnect();
}

run().catch((err) => { console.error(err); process.exit(1); });
