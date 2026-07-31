const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const src = path.join(__dirname, '..', 'public', 'images', 'apk_white1.png');
const resDir = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

const sizes = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

async function run() {
  console.log('Source:', src);

  // Generate launcher icons for each density
  for (const [folder, size] of Object.entries(sizes)) {
    const dir = path.join(resDir, folder);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    await sharp(src)
      .resize(size, size, { fit: 'cover' })
      .png()
      .toFile(path.join(dir, 'ic_launcher.png'));

    await sharp(src)
      .resize(size, size, { fit: 'cover' })
      .png()
      .toFile(path.join(dir, 'ic_launcher_round.png'));

    console.log(`  ${folder}: ${size}x${size} OK`);
  }

  // Adaptive icon foreground (108dp at xxxhdpi = 432px, but 108px base is fine)
  const fgDir = path.join(resDir, 'mipmap-xxxhdpi');
  await sharp(src)
    .resize(432, 432, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(fgDir, 'ic_launcher_foreground.png'));
  console.log('  foreground (432x432) OK');

  // Also copy foreground to drawable folders for adaptive icon
  const drawableFolders = fs.readdirSync(resDir).filter(d => d.startsWith('drawable'));
  for (const d of drawableFolders) {
    const dd = path.join(resDir, d);
    const files = fs.readdirSync(dd).filter(f => f.startsWith('ic_launcher'));
    for (const f of files) {
      fs.copyFileSync(path.join(dd, f), path.join(dd, f));
    }
  }

  console.log('Done');
}

run().catch(err => { console.error(err); process.exit(1); });
