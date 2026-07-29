const fs = require('fs');
const mongoose = require('mongoose');
const Service = require('./models/Service');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongo:27017/KuraTe';

function normalize(str) {
  return str.toLowerCase().trim().replace(/\s+/g, ' ');
}

function buildPath(area, category, device) {
  const a = normalize(area).replace(/[^a-záéíóúñü0-9\s]/g, '').replace(/\s+/g, '-');
  const c = normalize(category).replace(/[^a-záéíóúñü0-9\s]/g, '').replace(/\s+/g, '-');
  const d = normalize(device).replace(/[^a-záéíóúñü0-9\s]/g, '').replace(/\s+/g, '-');
  return `${a}/${c}/${d}`;
}

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const raw = fs.readFileSync('/app/Arbol.txt', 'utf8');
  const blocks = raw.split(/\n(?=\{)/).filter(b => b.trim());
  const allDocs = [];

  for (const block of blocks) {
    let obj;
    try { obj = JSON.parse(block.trim()); } catch (e) { continue; }
    const rootKey = Object.keys(obj)[0];
    const data = obj[rootKey];
    const area = data.entorno;
    for (const cat of data.categorias) {
      for (const dev of cat.dispositivos) {
        allDocs.push({
          area,
          category: cat.nombre,
          device: dev.nombre,
          brands: dev.marcas || [],
          path: buildPath(area, cat.nombre, dev.nombre)
        });
      }
    }
  }

  console.log(`Parsed ${allDocs.length} devices`);
  await Service.deleteMany({});
  const result = await Service.insertMany(allDocs);
  console.log(`Inserted ${result.length} services`);

  const areas = await Service.distinct('area');
  for (const a of areas) {
    const count = await Service.countDocuments({ area: a });
    const cats = await Service.distinct('category', { area: a });
    console.log(`  ${a}: ${count} devices, ${cats.length} categories`);
  }

  await mongoose.disconnect();
  console.log('Done');
}

seed().catch(err => { console.error(err); process.exit(1); });
