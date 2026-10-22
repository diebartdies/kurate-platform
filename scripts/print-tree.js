const mongoose = require('mongoose');
const tree = require('/app/data/serviceTree');

function printTree(title, areas) {
  console.log('\n' + '='.repeat(78));
  console.log(title);
  console.log('='.repeat(78));
  for (const a of areas) {
    const cats = a.categories || [];
    const total = cats.reduce((n, c) => n + (c.devices || []).length, 0);
    console.log(`\n■ ${a.name || a.area}  [${a.id || ''}]  ${cats.length} categorías · ${total} dispositivos`);
    for (const c of cats) {
      const devs = c.devices || [];
      console.log(`  ├─ ${c.name || c.category}  (${devs.length})`);
      devs.forEach((d, i) => {
        const last = i === devs.length - 1 ? '└─' : '│  ├─';
        const brands = (d.brands || []).length ? ` · ${d.brands.length} marcas` : '';
        console.log(`  │  ${last} ${d.device || d.name}${brands}`);
      });
    }
  }
}

(async () => {
  printTree('ARBOL CANONICO  data/serviceTree.js  (lo que elige el profesional)', tree);

  await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const services = mongoose.connection.db.collection('services');
  const docs = await services.find({}).project({ area: 1, category: 1, device: 1, brands: 1, path: 1 }).toArray();
  const areas = [];
  for (const d of docs) {
    let area = areas.find((x) => x.area === d.area);
    if (!area) { area = { area: d.area, id: d.path.split('/')[0], categories: [] }; areas.push(area); }
    let cat = area.categories.find((c) => c.category === d.category);
    if (!cat) { cat = { category: d.category, id: d.path.split('/')[1], devices: [] }; area.categories.push(cat); }
    cat.devices.push({ name: d.device, brands: d.brands, path: d.path });
  }
  for (const a of areas) {
    a.categories.sort((x, y) => x.category.localeCompare(y.category));
    for (const c of a.categories) c.devices.sort((x, y) => x.name.localeCompare(y.name));
  }
  printTree('ARBOL PUBLICO  coleccion "services"  (lo que muestra el directorio)', areas);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });