require('dotenv').config();
const connectDB = require('../config/database');
const User = require('./models/User');
const fs = require('fs');
const path = require('path');

(async () => {
  await connectDB();
  const uploadDir = path.join(__dirname, 'public/uploads/photos');
  const filesOnDisk = fs.existsSync(uploadDir) ? fs.readdirSync(uploadDir).length : 0;
  console.log('Files on disk:', filesOnDisk);

  const pros = await User.find({ role: 'professional' }).select('email professionalProfile.alias professionalProfile.photos');
  let dataUri = 0, uploadPath = 0, httpUrl = 0, empty = 0, broken = 0;

  for (const p of pros) {
    const photos = p.professionalProfile?.photos || [];
    if (photos.length === 0) empty++;
    for (const ph of photos) {
      if (!ph) continue;
      if (ph.startsWith('data:image/')) dataUri++;
      else if (ph.startsWith('/uploads/')) {
        uploadPath++;
        const abs = path.join(__dirname, 'public', ph.replace(/^\//, ''));
        if (!fs.existsSync(abs)) broken++;
      } else if (/^https?:\/\//i.test(ph)) httpUrl++;
    }
  }

  console.log('Professionals:', pros.length, '| no photos:', empty);
  console.log('Photo entries — base64:', dataUri, '| /uploads paths:', uploadPath, '| broken files:', broken, '| http urls:', httpUrl);

  const withBase64 = await User.findOne({ 'professionalProfile.photos.0': /^data:image\// });
  if (withBase64) {
    console.log('Sample base64 user:', withBase64.professionalProfile.alias, 'photos:', withBase64.professionalProfile.photos.length);
  }

  process.exit(0);
})();
