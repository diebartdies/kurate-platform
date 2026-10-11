const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { PHOTO_BY_EMAIL, buildPhoto } = require('./set-test-professional-photos');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27018/KuraTe';

// Las fotos se guardan como data-URI base64 EN LA DB (nunca como archivos en
// /images o /uploads). Se toma una foto real distinta por oficio desde
// public/images (ver set-test-professional-photos.js). Si no hay archivo, se
// cae a un avatar SVG con las iniciales.
const PHOTO_COLORS = ['#1f6feb', '#2ea043', '#bf3989', '#d29922', '#8957e5', '#0a7ea4', '#cf222e', '#6e40c9', '#0969da', '#9a6700', '#8250df', '#116329', '#a40e26'];
function makeAvatar(alias, hex) {
  const initials = String(alias || '?')
    .replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase() || '?';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="${hex}"/><text x="50%" y="55%" font-family="Arial" font-size="140" font-weight="bold" fill="#ffffff" text-anchor="middle">${initials}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

const TEST_PROFESSIONALS = [
  {
    email: 'mariano.ramirez@test.com',
    password: 'Test1234',
    role: 'professional',
    professionalProfile: {
      alias: 'Mariano Ramírez',
      bio: 'Gasista matriculado con 15 años de experiencia en instalaciones de gas, calefones y cocinas. Trabajo en CABA y GBA.',
      location: { city: 'CABA', province: 'CABA', lat: -34.6037, lng: -58.3816 },
      services: [
        'hogar/gas/instalacion-gas',
        'hogar/gas/reparacion-gas',
        'hogar/gas/termotanque'
      ],
      professions: [
        { slug: 'gasista', name: 'Gasista', matriculado: true, matriculaVerificada: true },
        { slug: 'plomero', name: 'Plomero', matriculado: false }
      ],
      photos: ['/images/professionals/gasista1.jpg'],
      workingHours: { start: '08:00', end: '18:00' },
      workingDays: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
      whatsappNumber: '+5491133445566',
      responseSpeed: 'inmediata',
      averageRating: 4.8,
      reviewCount: 127,
      distance: 2.1
    },
    hogarProfile: { services: [] },
    verificationStatus: 'approved'
  },
  {
    email: 'carlos.mendez@test.com',
    password: 'Test1234',
    role: 'professional',
    professionalProfile: {
      alias: 'Carlos Méndez',
      bio: 'Electricista matriculado especialista en tableros, cableado y certificaciones. Atiendo urgencias 24hs.',
      location: { city: 'Palermo', province: 'CABA', lat: -34.5761, lng: -58.4289 },
      services: [
        'hogar/electricidad/instalaciones-electricas',
        'hogar/electricidad/tableros-electricos',
        'hogar/electricidad/certificacion'
      ],
      professions: [
        { slug: 'electricista', name: 'Electricista', matriculado: true, matriculaVerificada: true }
      ],
      photos: ['/images/professionals/electricista1.jpg'],
      workingHours: { start: '07:00', end: '22:00' },
      workingDays: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
      whatsappNumber: '+5491122334455',
      responseSpeed: 'inmediata',
      averageRating: 4.9,
      reviewCount: 89,
      distance: 3.2
    },
    hogarProfile: { services: [] },
    verificationStatus: 'approved'
  },
  {
    email: 'laura.fernandez@test.com',
    password: 'Test1234',
    role: 'professional',
    professionalProfile: {
      alias: 'Laura Fernández',
      bio: 'Técnica en climatización y refrigeración. Instalación y mantenimiento de aires split, centrales y VRF.',
      location: { city: 'Belgrano', province: 'CABA', lat: -34.5601, lng: -58.4554 },
      services: [
        'hogar/clima/aire-acondicionado',
        'hogar/clima/mantenimiento'
      ],
      professions: [
        { slug: 'instalador-aire-acondicionado', name: 'Instalador de aire acondicionado', matriculado: false }
      ],
      photos: ['/images/professionals/clima1.jpg'],
      workingHours: { start: '08:30', end: '19:00' },
      workingDays: ['Monday','Tuesday','Wednesday','Thursday','Friday'],
      whatsappNumber: '+5491155667788',
      responseSpeed: '24hs',
      averageRating: 4.6,
      reviewCount: 54,
      distance: 4.5
    },
    hogarProfile: { services: [] },
    verificationStatus: 'approved'
  },
  {
    email: 'diego.lopez@test.com',
    password: 'Test1234',
    role: 'professional',
    professionalProfile: {
      alias: 'Diego López',
      bio: 'Plomero y gasista con 20 años de experiencia. Desagües, cañerías, termotanques y instalaciones de gas.',
      location: { city: 'Villa Urquiza', province: 'CABA', lat: -34.5533, lng: -58.4822 },
      services: [
        'hogar/plomeria/reparacion-canerias',
        'hogar/gas/termotanque',
        'hogar/gas/instalacion-gas'
      ],
      professions: [
        { slug: 'plomero', name: 'Plomero', matriculado: true, matriculaVerificada: true },
        { slug: 'gasista', name: 'Gasista', matriculado: true, matriculaVerificada: false }
      ],
      photos: ['/images/professionals/plomero1.jpg'],
      workingHours: { start: '08:00', end: '20:00' },
      workingDays: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
      whatsappNumber: '+5491144556677',
      responseSpeed: 'inmediata',
      averageRating: 4.7,
      reviewCount: 76,
      distance: 5.8
    },
    hogarProfile: { services: [] },
    verificationStatus: 'approved'
  },
  {
    email: 'sofia.garcia@test.com',
    password: 'Test1234',
    role: 'professional',
    professionalProfile: {
      alias: 'Sofía García',
      bio: 'Técnica en línea blanca. Reparación de heladeras, lavarropas, lavavajillas y microondas. Repuestos originales.',
      location: { city: 'Caballito', province: 'CABA', lat: -34.6167, lng: -58.4333 },
      services: [
        'hogar/linea-blanca/heladera',
        'hogar/linea-blanca/lavarropas',
        'hogar/linea-blanca/microondas'
      ],
      professions: [
        { slug: 'tecnico-heladeras', name: 'Técnico en heladeras y lavarropas', matriculado: false }
      ],
      photos: ['/images/professionals/lineablanca1.jpg'],
      workingHours: { start: '09:00', end: '18:00' },
      workingDays: ['Monday','Tuesday','Wednesday','Thursday','Friday'],
      whatsappNumber: '+5491166778899',
      responseSpeed: '24hs',
      averageRating: 4.5,
      reviewCount: 43,
      distance: 6.3
    },
    hogarProfile: { services: [] },
    verificationStatus: 'approved'
  },
  {
    email: 'martin.rodriguez@test.com',
    password: 'Test1234',
    role: 'professional',
    professionalProfile: {
      alias: 'Martín Rodríguez',
      bio: 'Carpintero y ebanista. Muebles a medida, placares, cocinas y restauración. Trabajo en madera maciza y melamina.',
      location: { city: 'Flores', province: 'CABA', lat: -34.6292, lng: -58.4583 },
      services: [
        'hogar/carpinteria/muebles-a-medida',
        'hogar/carpinteria/placares',
        'hogar/carpinteria/restauracion'
      ],
      professions: [
        { slug: 'carpintero', name: 'Carpintero', matriculado: false }
      ],
      photos: ['/images/professionals/carpintero1.jpg'],
      workingHours: { start: '08:00', end: '17:00' },
      workingDays: ['Monday','Tuesday','Wednesday','Thursday','Friday'],
      whatsappNumber: '+5491177889900',
      responseSpeed: '24hs',
      averageRating: 4.8,
      reviewCount: 62,
      distance: 7.1
    },
    hogarProfile: { services: [] },
    verificationStatus: 'approved'
  },
  {
    email: 'ana.martinez@test.com',
    password: 'Test1234',
    role: 'professional',
    professionalProfile: {
      alias: 'Ana Martínez',
      bio: 'Pintora y decoradora. Pintura interior/exterior, texturas, lacados y papeles pintados. Materiales premium.',
      location: { city: 'Villa Crespo', province: 'CABA', lat: -34.6000, lng: -58.4444 },
      services: [
        'hogar/pintura/pintura-interior',
        'hogar/pintura/pintura-exterior',
        'hogar/pintura/lacados'
      ],
      professions: [
        { slug: 'pintor', name: 'Pintor', matriculado: false }
      ],
      photos: ['/images/professionals/pintor1.jpg'],
      workingHours: { start: '08:00', end: '17:00' },
      workingDays: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
      whatsappNumber: '+5491188990011',
      responseSpeed: 'inmediata',
      averageRating: 4.7,
      reviewCount: 38,
      distance: 3.8
    },
    hogarProfile: { services: [] },
    verificationStatus: 'approved'
  },
  {
    email: 'jorge.sanchez@test.com',
    password: 'Test1234',
    role: 'professional',
    professionalProfile: {
      alias: 'Jorge Sánchez',
      bio: 'Cerrajero 24hs. Apertura de puertas, cambio de cerraduras, llaves codificadas, cajas fuertes. Llego en 30 min.',
      location: { city: 'San Telmo', province: 'CABA', lat: -34.6222, lng: -58.3731 },
      services: [
        'hogar/cerrajeria/apertura-puertas',
        'hogar/cerrajeria/cambio-cerraduras',
        'hogar/cerrajeria/llaves-codificadas'
      ],
      professions: [
        { slug: 'cerrajero', name: 'Cerrajero', matriculado: false }
      ],
      photos: ['/images/professionals/cerrajero1.jpg'],
      workingHours: { start: '00:00', end: '23:59' },
      workingDays: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
      whatsappNumber: '+5491199001122',
      responseSpeed: 'inmediata',
      averageRating: 4.9,
      reviewCount: 112,
      distance: 1.5
    },
    hogarProfile: { services: [] },
    verificationStatus: 'approved'
  },
  {
    email: 'patricia.diaz@test.com',
    password: 'Test1234',
    role: 'professional',
    professionalProfile: {
      alias: 'Patricia Díaz',
      bio: 'Técnica en electrodomésticos de cocina. Hornos, cocinas, anafes, campanas. Marcas premium y estándar.',
      location: { city: 'Recoleta', province: 'CABA', lat: -34.5881, lng: -58.3956 },
      services: [
        'hogar/linea-blanca/cocina-horno',
        'hogar/linea-blanca/campana'
      ],
      professions: [
        { slug: 'tecnico-generadores', name: 'Técnico de generadores', matriculado: false }
      ],
      photos: ['/images/professionals/cocina1.jpg'],
      workingHours: { start: '09:00', end: '18:00' },
      workingDays: ['Monday','Tuesday','Wednesday','Thursday','Friday'],
      whatsappNumber: '+5491133445567',
      responseSpeed: '24hs',
      averageRating: 4.4,
      reviewCount: 29,
      distance: 2.8
    },
    hogarProfile: { services: [] },
    verificationStatus: 'approved'
  },
  {
    email: 'roberto.gomez@test.com',
    password: 'Test1234',
    role: 'professional',
    professionalProfile: {
      alias: 'Roberto Gómez',
      bio: 'Albañil y colocador de cerámicos. Baños, cocinas, pisos, revestimientos. Obra limpia y en término.',
      location: { city: 'Parque Patricios', province: 'CABA', lat: -34.6450, lng: -58.4000 },
      services: [
        'hogar/albanileria/banos',
        'hogar/albanileria/cocinas',
        'hogar/cerramista/colocacion-ceramicos'
      ],
      professions: [
        { slug: 'albanil', name: 'Albañil', matriculado: false },
        { slug: 'colocador-ceramicos', name: 'Colocador de cerámicos', matriculado: false }
      ],
      photos: ['/images/professionals/albanil1.jpg'],
      workingHours: { start: '07:30', end: '17:30' },
      workingDays: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
      whatsappNumber: '+5491122334456',
      responseSpeed: '24hs',
      averageRating: 4.6,
      reviewCount: 51,
      distance: 8.2
    },
    hogarProfile: { services: [] },
    verificationStatus: 'approved'
  },
  // Profesionales de enseñanza (educar)
  {
    email: 'prof.matematicas@test.com',
    password: 'Test1234',
    role: 'professional',
    professionalProfile: {
      alias: 'Prof. Matemáticas - Primaria/Secundaria',
      bio: 'Profesor de Matemáticas con 10 años de experiencia. Clases de apoyo para primaria y secundario. Álgebra, geometría, trigonometría. Presencial y virtual.',
      location: { city: 'CABA', province: 'CABA', lat: -34.6037, lng: -58.3816 },
      services: [],
      professions: [
        { slug: 'profesor-matematicas', name: 'Profesor de Matemáticas', matriculado: false },
        { slug: 'docente-primaria', name: 'Docente de Primaria', matriculado: false },
        { slug: 'docente-secundaria', name: 'Docente de Secundaria', matriculado: false }
      ],
      photos: ['/images/professionals/prof_matematicas.jpg'],
      workingHours: { start: '14:00', end: '21:00' },
      workingDays: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
      whatsappNumber: '+5491111223344',
      responseSpeed: '24hs',
      averageRating: 4.9,
      reviewCount: 34,
      distance: 0
    },
    hogarProfile: { services: [] },
    verificationStatus: 'approved'
  },
  {
    email: 'prof.ingles@test.com',
    password: 'Test1234',
    role: 'professional',
    professionalProfile: {
      alias: 'Prof. Inglés - Todos los niveles',
      bio: 'Profesora de Inglés certificada. Clases para primaria, secundario, universitario y adultos. Preparación exámenes internacionales. Presencial y online.',
      location: { city: 'Palermo', province: 'CABA', lat: -34.5761, lng: -58.4289 },
      services: [],
      professions: [
        { slug: 'profesor-ingles', name: 'Profesor de Inglés', matriculado: false },
        { slug: 'docente-primaria', name: 'Docente de Primaria', matriculado: false },
        { slug: 'docente-secundaria', name: 'Docente de Secundaria', matriculado: false },
        { slug: 'docente-universitario', name: 'Docente Universitario', matriculado: false }
      ],
      photos: ['/images/professionals/prof_ingles.jpg'],
      workingHours: { start: '10:00', end: '20:00' },
      workingDays: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
      whatsappNumber: '+5491122334456',
      responseSpeed: 'inmediata',
      averageRating: 4.8,
      reviewCount: 28,
      distance: 0
    },
    hogarProfile: { services: [] },
    verificationStatus: 'approved'
  },
  {
    email: 'prof.fisica@test.com',
    password: 'Test1234',
    role: 'professional',
    professionalProfile: {
      alias: 'Prof. Física y Química - Universitario',
      bio: 'Profesor de Física y Química para nivel secundario y universitario. Física general, mecánica, electromagnetismo, termodinámica. Química general, orgánica. Clases de apoyo y preparación de exámenes.',
      location: { city: 'Belgrano', province: 'CABA', lat: -34.5601, lng: -58.4554 },
      services: [],
      professions: [
        { slug: 'profesor-fisica-quimica', name: 'Profesor de Física y Química', matriculado: false },
        { slug: 'docente-secundaria', name: 'Docente de Secundaria', matriculado: false },
        { slug: 'docente-universitario', name: 'Docente Universitario', matriculado: false }
      ],
      photos: ['/images/professionals/prof_fisica.jpg'],
      workingHours: { start: '16:00', end: '22:00' },
      workingDays: ['Monday','Tuesday','Wednesday','Thursday','Friday'],
      whatsappNumber: '+5491133445567',
      responseSpeed: '24hs',
      averageRating: 4.7,
      reviewCount: 19,
      distance: 0
    },
    hogarProfile: { services: [] },
    verificationStatus: 'approved'
  }
];

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('Conectado a MongoDB');

  const hash = await bcrypt.hash('Test1234', 10);
  const isBrokenPhoto = (p) => typeof p === 'string' && p.startsWith('/images/professionals/');

  for (const [i, tp] of TEST_PROFESSIONALS.entries()) {
    const pp = tp.professionalProfile || {};
    // Foto real distinta por oficio, desde public/images → base64 en la DB.
    // Si no hay archivo, cae a un avatar SVG con las iniciales.
    const realPhoto = PHOTO_BY_EMAIL[tp.email] ? await buildPhoto(PHOTO_BY_EMAIL[tp.email]) : null;
    if (realPhoto) {
      pp.photos = [realPhoto];
    } else if (!Array.isArray(pp.photos) || pp.photos.some(isBrokenPhoto)) {
      pp.photos = [makeAvatar(pp.alias, PHOTO_COLORS[i % PHOTO_COLORS.length])];
    }

    const existing = await User.findOne({ email: tp.email });
    if (existing) {
      const ep = existing.professionalProfile || {};
      if (!Array.isArray(ep.photos) || !ep.photos.length || ep.photos.some(isBrokenPhoto)) {
        ep.photos = pp.photos;
        existing.professionalProfile = ep;
        existing.markModified('professionalProfile');
        await existing.save();
        console.log(`  Foto migrada a base64 en DB: ${tp.email}`);
      } else {
        console.log(`  Ya existe: ${tp.email}`);
      }
      continue;
    }

    const user = new User({
      email: tp.email,
      password: hash,
      role: tp.role,
      professionalProfile: tp.professionalProfile,
      hogarProfile: tp.hogarProfile,
      verificationStatus: tp.verificationStatus,
      accountDeletedAt: null
    });

    await user.save();
    console.log(`  Creado: ${tp.professionalProfile.alias} (${tp.email})`);
  }

  console.log('Seed completado');
  await mongoose.disconnect();
}

seed().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});