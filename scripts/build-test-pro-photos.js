// Genera un JSON { email: dataUri } con la foto de cada profesional de test,
// usando las imágenes locales de public/images (reduce con sharp).
//   node scripts/build-test-pro-photos.js [salida.json]
const fs = require('fs');
const path = require('path');
const { buildAll } = require('./set-test-professional-photos');

const out = process.argv[2] || path.join(__dirname, '..', 'tmp-test-pro-photos.json');

buildAll()
  .then((all) => {
    fs.writeFileSync(out, JSON.stringify(all));
    console.log('escrito', out, '| emails:', Object.keys(all).length);
  })
  .catch((err) => { console.error(err); process.exit(1); });
