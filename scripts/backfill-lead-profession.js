// Backfill de `profession` en los leads del padron de gasistas.
// El campo se agrego al schema despues de la importacion inicial, asi que los
// 1665 documentos ya guardados lo tienen undefined.
//
// Idempotente: solo escribe los que faltan. No toca ningun otro campo.
const path = require('path');
const mongoose = require('mongoose');

const DB = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/kurate';
const FUENTE = 'padron_medenor';
const PROFESION = process.env.PROFESION || 'gasista';
const APPLY = process.argv.includes('--apply');

async function main() {
  await mongoose.connect(DB);
  const col = mongoose.connection.db.collection('potential_professionals');

  const faltan = await col.countDocuments({ fuente: FUENTE, $or: [{ profession: { $exists: false } }, { profession: null }, { profession: '' }] });
  const conOficio = await col.countDocuments({ fuente: FUENTE, profession: { $exists: true, $ne: '' } });
  const totalFuente = await col.countDocuments({ fuente: FUENTE });

  console.log('fuente            : ' + FUENTE);
  console.log('total en la fuente: ' + totalFuente);
  console.log('ya con profession : ' + conOficio);
  console.log('sin profession    : ' + faltan);
  console.log('profesion a poner : ' + PROFESION);

  if (!faltan) {
    console.log('\nnada que hacer.');
    await mongoose.disconnect();
    return;
  }

  if (!APPLY) {
    console.log('\nDRY-RUN: no se escribio nada. Agregar --apply para escribir.');
    await mongoose.disconnect();
    return;
  }

  const res = await col.updateMany(
    { fuente: FUENTE, $or: [{ profession: { $exists: false } }, { profession: null }, { profession: '' }] },
    { $set: { profession: PROFESION } }
  );
  console.log('\nactualizados: ' + res.modifiedCount);

  const quedan = await col.countDocuments({ fuente: FUENTE, $or: [{ profession: { $exists: false } }, { profession: null }, { profession: '' }] });
  console.log('sin profession ahora: ' + quedan);

  await mongoose.disconnect();
}

main().catch((e) => { console.error('ERROR: ' + e.message); process.exit(1); });