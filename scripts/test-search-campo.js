/**
 * Prueba end-to-end del buscador con los servicios nuevos de Casa de Campo.
 * Asigna los 3 dispositivos a un profesional de prueba, permite que se
 * consulte la API publica, y RESTAURA el array original exactamente igual.
 */
const mongoose = require('mongoose');
const fs = require('fs');

const PRO_EMAIL = 'techhogar.1@kurate.seed';
const BACKUP = '/app/data/_backup-servicios.json';

const NEW_SERVICES = [
  { path: 'casa-campo/jardin-piscinas-campo/podar-arboles', name: 'Podar Árboles', brands: ['Stihl', 'Husqvarna'], actions: ['Hago mantenimiento', 'Reparo'] },
  { path: 'casa-campo/jardin-piscinas-campo/podar-cortar-cesped', name: 'Podar o Cortar Césped', brands: ['Honda', 'Kärcher'], actions: ['Hago mantenimiento'] },
  { path: 'casa-campo/jardin-piscinas-campo/mantenimiento-bombas-piletas', name: 'Mantenimiento de Bombas y Piletas de Natación', brands: ['Hayward', 'Grundfos'], actions: ['Hago mantenimiento', 'Reparo'] }
];

const mode = process.argv[2];
const BASE = process.argv[3] || 'https://kurate.drsrv.net.ar';

async function api(qs) {
  const r = await fetch(`${BASE}/api/v1/hogar/professionals?${qs}`);
  const j = await r.json();
  return (j.data || []).map((d) => `${d.name} [${d.serviceName}]`);
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const U = mongoose.connection.db.collection('users');

  if (mode === 'apply') {
    const pro = await U.findOne({ email: PRO_EMAIL });
    if (!pro) throw new Error('pro de prueba no encontrado');
    fs.writeFileSync(BACKUP, JSON.stringify(pro.hogarProfile.services || []));
    const servicios = (pro.hogarProfile.services || []).concat(NEW_SERVICES);
    await U.updateOne({ email: PRO_EMAIL }, { $set: { 'hogarProfile.services': servicios, 'hogarProfile.area': 'casa-campo', 'hogarProfile.action': 'Hago mantenimiento' } });
    console.log('aplicado a ' + PRO_EMAIL + ': ' + servicios.length + ' servicios, area=casa-campo');
  } else if (mode === 'restore') {
    const raw = fs.readFileSync(BACKUP, 'utf8');
    const original = JSON.parse(raw);
    await U.updateOne({ email: PRO_EMAIL }, { $set: { 'hogarProfile.services': original } });
    const pro = await U.findOne({ email: PRO_EMAIL });
    const iguales = JSON.stringify(pro.hogarProfile.services) === JSON.stringify(original);
    console.log('restaurado: ' + original.length + ' servicios | identico al original: ' + iguales);
    console.log('servicios actuales: ' + (pro.hogarProfile.services || []).map((s) => s.name).join(' | '));
    fs.unlinkSync(BACKUP);
  } else if (mode === 'test') {
    const qs = [
      'podar', 'podar arboles', 'podar árboles', 'cortar cesped', 'cortar césped',
      'arboles', 'cesped', 'jardin', 'pileta', 'piletas de natacion', 'piscina',
      'bomba', 'mantenimiento bombas y piletas', 'natacion', 'kärcher', 'stihl',
      'reparo', 'reparar', 'repara', 'repare', 'arreglar', 'arreglo', 'service',
      'casa de campo reparo', 'casa de campo podar arboles'
    ];
    for (const q of qs) {
      const r = await api('q=' + encodeURIComponent(q));
      console.log(`  q="${q}" -> ${r.length} :: ${r.join(' , ') || '(sin resultados)'}`);
    }
    console.log('\n  filtro service= (ruta jerarquica):');
    for (const p of [
      'casa-de-campo/jardin-y-piscinas-de-campo/podar-arboles',
      'casa-de-campo/jardin-y-piscinas-de-campo',
      'casa-de-campo/jardin-y-piscinas-de-campo/mantenimiento-bombas-y-piletas-natacion'
    ]) {
      const r = await api('service=' + encodeURIComponent(p));
      console.log(`  service=${p} -> ${r.length} :: ${r.join(' , ')}`);
    }
    console.log('\n  filtro service= con path del dashboard (formato serviceTree):');
    for (const p of [
      'casa-campo/jardin-piscinas-campo/podar-arboles',
      'casa-campo/jardin-piscinas-campo',
      'casa-campo/jardin-piscinas-campo/mantenimiento-bombas-piletas'
    ]) {
      const r = await api('service=' + encodeURIComponent(p));
      console.log(`  service=${p} -> ${r.length} :: ${r.join(' , ')}`);
    }
  }
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });