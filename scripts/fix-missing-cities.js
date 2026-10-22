const mongoose = require('mongoose');

const CITIES = {
  'Entre Ríos': ['Paraná', 'Concordia', 'Gualeguaychú', 'Villaguay', 'Federal', 'Basavilbaso', 'Diamante', 'Victoria']
};

(async () => {
  await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const db = mongoose.connection.db;
  const P = db.collection('provinces');
  const C = db.collection('cities');
  for (const [provName, cities] of Object.entries(CITIES)) {
    const prov = await P.findOne({ name: { $regex: `^${provName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
    if (!prov) { console.log('provincia no encontrada:', provName); continue; }
    const existing = new Set((await C.find({ province: prov._id }).toArray()).map((c) => c.name));
    const missing = cities.filter((n) => !existing.has(n));
    if (missing.length) {
      await C.insertMany(missing.map((name) => ({ name, province: prov._id })));
    }
    const total = await C.countDocuments({ province: prov._id });
    console.log(`${prov.name}: +${missing.length} insertadas, ${total} en total (${missing.join(', ') || 'sin faltantes'})`);
  }
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });