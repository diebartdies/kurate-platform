// Asigna a cada profesional "de test" una foto REAL y distinta por oficio,
// tomada de public/images y persistida como data-URI base64 EN MONGODB
// (nunca como archivo). Reduce con sharp a 400x500 jpeg q80.
//
//   node scripts/set-test-professional-photos.js
//
// Idempotente: solo actualiza la foto; no crea usuarios.
const path = require('path');
const fs = require('fs');

const IMAGES_DIR = path.join(__dirname, '..', 'public', 'images');

// email -> archivo en public/images (foto distinta por oficio)
const PHOTO_BY_EMAIL = {
  'mariano.ramirez@test.com': 'Gas y Calefaccion.jpg',
  'carlos.mendez@test.com': 'electricidad.jpeg',
  'laura.fernandez@test.com': 'climatizacion.jpg',
  'diego.lopez@test.com': 'plomeria y desagotes.jpeg',
  'sofia.garcia@test.com': 'linea blanca 1.jpeg',
  'martin.rodriguez@test.com': 'Carpinteria.jpg',
  'ana.martinez@test.com': 'Pintura y revestimientos.jpg',
  'jorge.sanchez@test.com': 'cerrajeria y Seguridad.jpg',
  'patricia.diaz@test.com': 'linea Marron.jpg',
  'roberto.gomez@test.com': 'Baños sanitarios cuidado personal.jpg',
  'prof.matematicas@test.com': 'Educar.jpg',
  'prof.ingles@test.com': 'Nivel Secundario.png',
  'prof.fisica@test.com': 'Nivel Universitario.jpg'
};

async function buildPhoto(fileName) {
  const sharp = require('sharp');
  const src = path.join(IMAGES_DIR, fileName);
  if (!fs.existsSync(src)) return null;
  const buffer = await sharp(src)
    .resize(400, 500, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: 80 })
    .toBuffer();
  return `data:image/jpeg;base64,${buffer.toString('base64')}`;
}

async function buildAll() {
  const out = {};
  for (const [email, file] of Object.entries(PHOTO_BY_EMAIL)) {
    const dataUri = await buildPhoto(file);
    if (dataUri) out[email] = dataUri;
  }
  return out;
}

module.exports = { PHOTO_BY_EMAIL, buildPhoto, buildAll, IMAGES_DIR };

if (require.main === module) {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  const mongoose = require('mongoose');
  const User = require('../models/User');

  (async () => {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/KuraTe');
    console.log('Conectado a MongoDB');

    let updated = 0;
    for (const [email, file] of Object.entries(PHOTO_BY_EMAIL)) {
      const dataUri = await buildPhoto(file);
      if (!dataUri) { console.warn('  FALTA archivo:', file); continue; }
      const user = await User.findOne({ email });
      if (!user) { console.log('  sin usuario:', email); continue; }
      user.professionalProfile = user.professionalProfile || {};
      user.professionalProfile.photos = [dataUri];
      user.markModified('professionalProfile');
      await user.save();
      console.log(`  foto aplicada: ${email} <- ${file}`);
      updated++;
    }

    console.log('Actualizados:', updated);
    await mongoose.disconnect();
  })().catch((err) => { console.error(err); process.exit(1); });
}
