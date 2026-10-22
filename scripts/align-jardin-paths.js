/**
 * Alinea SOLO los 3 dispositivos de Jardin y Piscinas de Campo al path
 * canonico de data/serviceTree.js, que es el formato que guarda el
 * profesional al registrarse. Sin esto, elegir el dispositivo en el buscador
 * del landing (que manda el path publico) no encuentra a quien lo cargo en el
 * dashboard (que guarda el id canonico).
 */
const mongoose = require('mongoose');
const tree = require('/app/data/serviceTree');

const TARGETS = [
  'Podar Árboles',
  'Podar o Cortar Césped',
  'Mantenimiento de Bombas y Piletas de Natación'
];

const canon = new Map();
for (const area of tree) {
  for (const cat of area.categories || []) {
    for (const dev of cat.devices || []) canon.set(dev.name, `${area.id}/${cat.id}/${dev.id}`);
  }
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const services = mongoose.connection.db.collection('services');
  for (const name of TARGETS) {
    const nuevo = canon.get(name);
    if (!nuevo) { console.log('sin nodo canonico:', name); continue; }
    const res = await services.findOneAndUpdate(
      { device: name },
      { $set: { path: nuevo } },
      { returnDocument: 'after' }
    );
    console.log(`${name}\n   path canonico: ${nuevo}\n   documento: ${res.value ? res.value.path : 'NO ENCONTRADO'}`);
  }
  const check = await services.find({ area: 'Casa de Campo' }).project({ path: 1, device: 1 }).sort({ path: 1 }).toArray();
  console.log(`\nCasa de Campo (${check.length} dispositivos):`);
  check.forEach((d) => console.log('  ' + d.path));
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });