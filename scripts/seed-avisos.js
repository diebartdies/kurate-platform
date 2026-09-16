/**
 * Seed test avisos for all professionals with hogarProfile.area set.
 * Creates various statuses to test the full lifecycle:
 *   - pending_payment (no receipt yet)
 *   - pending_payment (receipt uploaded, awaiting admin)
 *   - active (paid, 20+ days remaining)
 *   - expiring (5 days or less remaining)
 *   - expired (past end date, 3-day grace period)
 *   - expired (past grace period — should be cleaned up)
 *
 * Usage:
 *   node scripts/seed-avisos.js [--clear]
 */
const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://kurateApp:Kurate2026Secure!@localhost:27018/KuraTe?authSource=admin';

const AVISO_PRICES = { hogar: 5000, oficina: 10000, pime: 10000, industria: 20000 };

const TEST_TEXTS = [
  'Ofrezco servicio técnico con más de 10 años de experiencia. Garantía en todas las reparaciones.',
  'Especialista en electrodomésticos. Presupuesto sin cargo. Disponibilidad inmediata.',
  'Técnico matriculado. Trabajo con todas las marcas. Atención profesional y responsable.',
  'Reparación e instalación de todo tipo de equipos. Consulte por descuentos.',
  'Servicio técnico oficial. Reparación rápida y económica. Solicite su turno.',
  'Especialista en climatización. Instalación y mantenimiento de aires acondicionados.',
  'Técnico certificado en gas y electrodomésticos. Trabajo garantizado.',
  'Más de 15 años de experiencia en reparación de heladeras y lavarropas.',
  'Servicio técnico 24 horas. Urgencias sin recargo adicional.',
  'Especialista en tecnología y computación. Reparación de PC y notebooks.'
];

function daysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function seed() {
  const clear = process.argv.includes('--clear');

  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const Aviso = require('../models/Aviso');
  const User = require('../models/User');

  if (clear) {
    const deleted = await Aviso.deleteMany({});
    console.log(`Cleared ${deleted.deletedCount} existing avisos`);
  }

  const professionals = await User.find({
    role: 'professional',
    'hogarProfile.area': { $exists: true, $ne: null }
  }).select('professionalProfile.alias professionalProfile.firstName professionalProfile.surname hogarProfile.area email').lean();

  console.log(`Found ${professionals.length} professionals with area`);

  // Distribution of statuses across professionals
  const statuses = [
    // 25%: pending_payment (no receipt)
    ...Array(25).fill('pending_payment_no_receipt'),
    // 15%: pending_payment (receipt uploaded)
    ...Array(15).fill('pending_payment_with_receipt'),
    // 25%: active (healthy, 20+ days)
    ...Array(25).fill('active'),
    // 15%: expiring (3-5 days left)
    ...Array(15).fill('expiring'),
    // 10%: expired (within 5-day grace)
    ...Array(10).fill('expired_grace'),
    // 10%: expired (past grace — should be cleaned)
    ...Array(10).fill('expired_old')
  ];

  // Shuffle
  for (let i = statuses.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [statuses[i], statuses[j]] = [statuses[j], statuses[i]];
  }

  const created = [];
  const environments = ['hogar', 'oficina', 'pime', 'industria'];

  for (let i = 0; i < professionals.length; i++) {
    const prof = professionals[i];
    const area = prof.hogarProfile?.area || 'hogar';
    const statusType = statuses[i % statuses.length];
    const text = randomItem(TEST_TEXTS);

    let startDate, endDate, status, paymentReceiptUrl, paymentReceiptType, expiryWarningSent;

    switch (statusType) {
      case 'pending_payment_no_receipt':
        startDate = daysFromNow(0);
        endDate = daysFromNow(30);
        status = 'pending_payment';
        break;

      case 'pending_payment_with_receipt':
        startDate = daysFromNow(0);
        endDate = daysFromNow(30);
        status = 'pending_payment';
        paymentReceiptUrl = '/uploads/photos/test-receipt.jpg';
        paymentReceiptType = 'image';
        break;

      case 'active':
        startDate = daysFromNow(-10);
        endDate = daysFromNow(20);
        status = 'active';
        break;

      case 'expiring':
        startDate = daysFromNow(-25);
        endDate = daysFromNow(Math.floor(Math.random() * 3) + 2); // 2-4 days
        status = 'expiring';
        expiryWarningSent = daysFromNow(-1);
        break;

      case 'expired_grace':
        startDate = daysFromNow(-35);
        endDate = daysFromNow(-1); // expired 1 day ago
        status = 'expired';
        break;

      case 'expired_old':
        startDate = daysFromNow(-40);
        endDate = daysFromNow(-6); // expired 6 days ago (past grace)
        status = 'expired';
        break;
    }

    const aviso = await Aviso.create({
      professional: prof._id,
      environment: area,
      text,
      startDate,
      endDate,
      status,
      price: AVISO_PRICES[area] || 5000,
      paymentReceiptUrl: paymentReceiptUrl || undefined,
      paymentReceiptType: paymentReceiptType || undefined,
      expiryWarningSent: expiryWarningSent || undefined,
      adminNotes: statusType.includes('receipt') ? 'Pago recibido, pendiente revisión' : ''
    });

    created.push({
      alias: prof.professionalProfile?.alias || prof.email,
      environment: area,
      status,
      endDate: endDate.toLocaleDateString('es-AR'),
      price: aviso.price,
      hasReceipt: !!paymentReceiptUrl
    });
  }

  console.log(`\nCreated ${created.length} test avisos:\n`);

  // Summary
  const summary = {};
  created.forEach(c => {
    const key = `${c.status}${c.hasReceipt ? ' (con recibo)' : ''}`;
    summary[key] = (summary[key] || 0) + 1;
  });
  Object.entries(summary).sort().forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  console.log('\nSample avisos:');
  created.slice(0, 10).forEach(c => {
    console.log(`  ${c.alias} | ${c.environment} | ${c.status} | expira: ${c.endDate} | $${c.price}${c.hasReceipt ? ' | ✓ recibo' : ''}`);
  });

  await mongoose.disconnect();
  console.log('\nDone.');
}

seed().catch(err => { console.error(err); process.exit(1); });
