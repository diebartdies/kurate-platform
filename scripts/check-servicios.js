const mongoose = require('mongoose');
(async () => {
  await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const s = mongoose.connection.db.collection('services');
  const sinDevice = await s.countDocuments({ $or: [{ device: { $exists: false } }, { device: null }, { device: '' }] });
  const dup = await s.aggregate([{ $group: { _id: '$path', n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }]).toArray();
  const sinMarcas = await s.countDocuments({ $or: [{ brands: { $exists: false } }, { brands: { $size: 0 } }] });
  const total = await s.countDocuments();
  console.log(`servicios=${total} | device vacio=${sinDevice} | sin marcas=${sinMarcas} | paths duplicados=${dup.length}`);
  if (dup.length) dup.forEach((d) => console.log('  DUP ' + d._id + ' x' + d.n));
  for (const area of ['Casa de Campo', 'Oficina']) {
    const docs = await s.find({ area }).project({ path: 1, device: 1, category: 1 }).sort({ path: 1 }).toArray();
    console.log(`\n${area}: ${docs.length}`);
    docs.forEach((d) => console.log(`  ${d.path}  ->  ${d.device}`));
  }
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
