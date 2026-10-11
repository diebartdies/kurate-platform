// Aplica a la DB el JSON { email: dataUri } generado por
// build-test-pro-photos.js. Guarda la foto como base64 en MongoDB. Idempotente.
//   node scripts/apply-test-pro-photos.js [fotos.json]
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const User = require('../models/User');

const file = process.argv[2] || path.join(__dirname, '..', 'tmp-test-pro-photos.json');

(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/KuraTe');
  console.log('Conectado a MongoDB');
  const map = JSON.parse(fs.readFileSync(file, 'utf8'));

  let updated = 0;
  for (const [email, dataUri] of Object.entries(map)) {
    const user = await User.findOne({ email });
    if (!user) { console.log('  sin usuario:', email); continue; }
    user.professionalProfile = user.professionalProfile || {};
    user.professionalProfile.photos = [dataUri];
    user.markModified('professionalProfile');
    await user.save();
    console.log(`  foto aplicada (${Math.round(dataUri.length / 1024)} KB): ${email}`);
    updated++;
  }

  console.log('Actualizados:', updated);
  await mongoose.disconnect();
})().catch((err) => { console.error(err); process.exit(1); });
