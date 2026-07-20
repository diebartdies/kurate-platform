require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const TEST_PASSWORD = 'test1234';

function makePhoto(label, hex) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500">
    <rect width="400" height="500" fill="${hex}"/>
    <text x="50%" y="52%" font-family="Arial" font-size="48" fill="#ffffff" text-anchor="middle">${label}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

const PHOTO_COLORS = ['#1f6feb', '#2ea043', '#bf3989', '#d29922', '#8957e5', '#0a7ea4', '#cf222e', '#6e40c9'];

const TECHS = [
  {
    email: 'tec.lavarrropas@gmail.com', firstName: 'Mariano', lastName: 'López',
    companyName: 'López Reparaciones', taxId: '20123456789',
    category: 'tecnico_matriculado', area: 'hogar',
    action: 'Reparo', actionDetails: 'Reparación de lavarropas y heladeras a domicilio.',
    services: [
      { path: 'hogar.cocina.lavarropas', name: 'Lavarropas', brands: ['WHIRLPOOL', 'SAMSUNG', 'LG', 'Drean', 'BGH'] },
      { path: 'hogar.cocina.heladeras', name: 'Heladeras', brands: ['Samsung', 'LG', 'Whirlpool', 'Drean'] }
    ],
    specialty: 'Electrodomésticos de línea blanca', availability: 'inmediata',
    contact: { email: 'tec.lavarrropas@gmail.com', mobilePhone: '11 6001-1122', whatsapp: true, telegram: false },
    address: { street: 'Av. Rivadavia', number: '4500', city: 'Caballito', neighborhood: 'Caballito', province: 'CABA', postalCode: 'C1424' }
  },
  {
    email: 'tec.gas@gmail.com', firstName: 'Jorge', lastName: 'Pérez',
    companyName: '', taxId: '20334567890',
    category: 'profesional_matriculado', area: 'hogar',
    action: 'Instalo', actionDetails: 'Instalación y conversión de calefones y termotanques a gas.',
    services: [
      { path: 'hogar.cocina.calefones.calefones-gas', name: 'Calefones a gas', brands: ['Orbis', 'Volcan', 'Longvie', 'Rheem'] },
      { path: 'hogar.cocina.termotanques.termotanques-gas', name: 'Termotanques a gas', brands: ['ESKABE', 'ORBIS', 'Rheem', 'VOLCAN'] }
    ],
    specialty: 'Gasista matriculado', availability: 'rapida',
    contact: { email: 'tec.gas@gmail.com', mobilePhone: '11 6002-2233', whatsapp: true, telegram: true },
    address: { street: 'Calle Caseros', number: '1200', city: 'San Telmo', neighborhood: 'San Telmo', province: 'CABA', postalCode: 'C1107' }
  },
  {
    email: 'tec.cocina@gmail.com', firstName: 'Ana', lastName: 'Gómez',
    companyName: 'Ana Cocinas', taxId: '27145678901',
    category: 'tecnico_no_matriculado', area: 'hogar',
    action: 'Hago mantenimiento', actionDetails: 'Mantenimiento de cocinas y microondas.',
    services: [
      { path: 'hogar.cocina.cocinas.cocinas-gas', name: 'Cocinas a gas', brands: ['Longvie', 'Domec', 'Florencia', 'Orbis'] },
      { path: 'hogar.cocina.microondas', name: 'Microondas', brands: ['BGH', 'Samsung', 'Whirlpool', 'Midea'] }
    ],
    specialty: 'Cocinas y microondas', availability: 'puedo_esperar',
    contact: { email: 'tec.cocina@gmail.com', mobilePhone: '11 6003-3344', whatsapp: false, telegram: false },
    address: { street: 'Av. Santa Fe', number: '3200', city: 'Palermo', neighborhood: 'Palermo', province: 'CABA', postalCode: 'C1425' }
  },
  {
    email: 'tec.aire@gmail.com', firstName: 'Carlos', lastName: 'Ramírez',
    companyName: 'Frio Total', taxId: '30987654321',
    category: 'tecnico_matriculado', area: 'hogar',
    action: 'Reparo', actionDetails: 'Reparación de aires acondicionados split y de ventana.',
    services: [
      { path: 'hogar.cocina.aires-acondicionados', name: 'Aires acondicionados', brands: ['Samsung', 'LG', 'BGH', 'Midea', 'Whirlpool'] }
    ],
    specialty: 'Climatización', availability: 'rapida',
    contact: { email: 'tec.aire@gmail.com', mobilePhone: '11 6004-4455', whatsapp: true, telegram: false },
    address: { street: 'Calle 7', number: '550', city: 'La Plata', neighborhood: '', province: 'Buenos Aires', postalCode: '1900' }
  },
  {
    email: 'tec.bano@gmail.com', firstName: 'Diego', lastName: 'Fernández',
    companyName: '', taxId: '20234567890',
    category: 'idoneo', area: 'hogar',
    action: 'Reparo', actionDetails: 'Reparación de inodoros, grifería y pérdidas de agua.',
    services: [
      { path: 'hogar.bano.inodoros', name: 'Inodoros', brands: ['Roca', 'Ferrum', 'Duravit'] },
      { path: 'hogar.bano.grifería', name: 'Grifería', brands: ['Otra/s'] }
    ],
    specialty: 'Plomería doméstica', availability: 'inmediata',
    contact: { email: 'tec.bano@gmail.com', mobilePhone: '11 6005-5566', whatsapp: false, telegram: true },
    address: { street: 'Av. Cabildo', number: '2300', city: 'Belgrano', neighborhood: 'Belgrano', province: 'CABA', postalCode: 'C1428' }
  },
  {
    email: 'tec.impresoras@gmail.com', firstName: 'Lucía', lastName: 'Martínez',
    companyName: 'Office Tech', taxId: '27456789012',
    category: 'tecnico_matriculado', area: 'oficina',
    action: 'Reparo', actionDetails: 'Reparación de impresoras y fotocopiadoras de oficina.',
    services: [
      { path: 'oficina.impresoras', name: 'Impresoras', brands: ['HP', 'Epson', 'Canon', 'Brother'] },
      { path: 'oficina.fotocopiadoras', name: 'Fotocopiadoras', brands: ['Ricoh', 'Canon', 'Sharp', 'Kyocera'] }
    ],
    specialty: 'Equipos de oficina', availability: 'rapida',
    contact: { email: 'tec.impresoras@gmail.com', mobilePhone: '11 6006-6677', whatsapp: true, telegram: false },
    address: { street: 'Reconquista', number: '500', city: 'San Nicolás', neighborhood: 'San Nicolás', province: 'CABA', postalCode: 'C1003' }
  },
  {
    email: 'tec.pc@gmail.com', firstName: 'Federico', lastName: 'Sánchez',
    companyName: 'PC Help', taxId: '20345678901',
    category: 'tecnico_no_matriculado', area: 'oficina',
    action: 'Instalo', actionDetails: 'Armado, instalación y mantenimiento de PCs y redes.',
    services: [
      { path: 'oficina.pcs', name: 'PC / Computadoras', brands: ['Dell', 'HP', 'Lenovo', 'Asus'] },
      { path: 'oficina.redes', name: 'Red / Networking', brands: [] },
      { path: 'oficina.monitores', name: 'Monitores', brands: ['Samsung', 'LG', 'Dell', 'AOC'] }
    ],
    specialty: 'IT de oficina', availability: 'puedo_esperar',
    contact: { email: 'tec.pc@gmail.com', mobilePhone: '11 6007-7788', whatsapp: true, telegram: true },
    address: { street: 'Calle Florida', number: '800', city: 'Retiro', neighborhood: 'Retiro', province: 'CABA', postalCode: 'C1005' }
  },
  {
    email: 'tec.aireoficina@gmail.com', firstName: 'Pablo', lastName: 'Romero',
    companyName: 'Clima Office', taxId: '30987651234',
    category: 'profesional_matriculado', area: 'oficina',
    action: 'Hago mantenimiento', actionDetails: 'Mantenimiento de aire acondicionado de oficinas.',
    services: [
      { path: 'oficina.aire-acondicionado-oficina', name: 'Aire Acondicionado', brands: ['Samsung', 'LG', 'BGH', 'Midea'] }
    ],
    specialty: 'Climatización comercial', availability: 'sin_apuro',
    contact: { email: 'tec.aireoficina@gmail.com', mobilePhone: '11 6008-8899', whatsapp: false, telegram: false },
    address: { street: 'Av. Corrientes', number: '1500', city: 'Almagro', neighborhood: 'Almagro', province: 'CABA', postalCode: 'C1042' }
  },
  {
    email: 'tec.pime@gmail.com', firstName: 'Sofía', lastName: 'Acuña',
    companyName: 'PIME Soluciones', taxId: '27456789321',
    category: 'tecnico_matriculado', area: 'pime',
    action: 'Instalo', actionDetails: 'Instalación de redes y telefonía IP para PIME.',
    services: [
      { path: 'oficina.redes', name: 'Red / Networking', brands: [] },
      { path: 'oficina.telefonia-ip', name: 'Telefonía IP', brands: ['Yealink', 'Grandstream'] }
    ],
    specialty: 'Redes y voz para Pymes', availability: 'rapida',
    contact: { email: 'tec.pime@gmail.com', mobilePhone: '11 6009-9900', whatsapp: true, telegram: false },
    address: { street: 'Calle Mitre', number: '400', city: 'Quilmes', neighborhood: '', province: 'Buenos Aires', postalCode: '1878' }
  },
  {
    email: 'tec.industria@gmail.com', firstName: 'Ricardo', lastName: 'Bustos',
    companyName: 'InduMant', taxId: '30987659999',
    category: 'profesional_matriculado', area: 'industria',
    action: 'Hago mantenimiento', actionDetails: 'Mantenimiento industrial de monitores y redes.',
    services: [
      { path: 'oficina.monitores', name: 'Monitores', brands: ['Samsung', 'LG', 'Dell', 'AOC'] },
      { path: 'oficina.redes', name: 'Red / Networking', brands: [] }
    ],
    specialty: 'Mantenimiento industrial', availability: 'puedo_esperar',
    contact: { email: 'tec.industria@gmail.com', mobilePhone: '11 6010-1010', whatsapp: false, telegram: true },
    address: { street: 'Ruta 9', number: 'Klm 30', city: 'Luján', neighborhood: '', province: 'Buenos Aires', postalCode: '6700' }
  }
];

async function main() {
  const uri = (process.env.MONGO_URI || '').replace(/\/fullminent$/, '/KuraTe');
  await mongoose.connect(uri);
  console.log(`MongoDB Connected: ${mongoose.connection.host} db=${mongoose.connection.db.databaseName}`);
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(TEST_PASSWORD, salt);
  let created = 0, skipped = 0;
  TECHS.forEach((t, i) => { t.photo = makePhoto(`${t.firstName[0]}${t.lastName[0]}`, PHOTO_COLORS[i % PHOTO_COLORS.length]); });
  for (const t of TECHS) {
    const exists = await User.findOne({ email: t.email });
    if (exists) { skipped++; continue; }
    await User.create({
      name: `${t.firstName} ${t.lastName}`,
      email: t.email,
      password: hash,
      role: 'professional',
      professionalType: 'hogar',
      isEmailVerified: true,
      isVerified: true,
      verificationStatus: 'approved',
      hogarProfile: {
        firstName: t.firstName, lastName: t.lastName, companyName: t.companyName, taxId: t.taxId,
        category: t.category, area: t.area, action: t.action, actionDetails: t.actionDetails,
        services: t.services, specialty: t.specialty, availability: t.availability,
        contact: t.contact, address: t.address,
        photos: [t.photo]
      }
    });
    created++;
  }
  console.log(`Done. Created: ${created}, Skipped (already exist): ${skipped}`);
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
