const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const User = require('../models/User');
const Feedback = require('../models/Feedback');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/KuraTe';

const professionals = [
  {
    full_name: 'Martín Quiroga',
    headline: 'Técnico en refrigeración y línea blanca',
    bio: '20 años reparando heladeras y freezers. Service oficial Samsung y LG. Atiendo domicilios en CABA y zona norte con garantía escrita de 6 meses.',
    phone: '5491144556677',
    province: 'Ciudad Autónoma de Buenos Aires',
    city: 'Palermo',
    areas: ['hogar'],
    devices: ['heladera', 'freezer', 'lavarropas', 'aire-split'],
    brands: ['Samsung', 'LG', 'Whirlpool', 'Drean', 'Surrey'],
    years_experience: 20,
    verified: true,
    available_now: true,
    rating_avg: 4.8,
    rating_count: 34
  },
  {
    full_name: 'Laura Benítez',
    headline: 'Electrodomésticos y cocinas',
    bio: 'Especialista en cocinas, hornos y microondas. Trabajo con repuestos originales y presupuesto sin cargo.',
    phone: '5491133445566',
    province: 'Ciudad Autónoma de Buenos Aires',
    city: 'Caballito',
    areas: ['hogar'],
    devices: ['cocina', 'horno', 'microondas', 'campana'],
    brands: ['Whirlpool', 'Electrolux', 'Philco', 'Bosch'],
    years_experience: 12,
    verified: true,
    available_now: true,
    rating_avg: 4.6,
    rating_count: 21
  },
  {
    full_name: 'Sergio Maldonado',
    headline: 'Climatización y termotanques',
    bio: 'Instalación y service de aire acondicionado split. Matriculado en gas. Heladeras de todas las marcas.',
    phone: '5492214455667',
    province: 'Buenos Aires',
    city: 'La Plata',
    areas: ['hogar', 'oficina'],
    devices: ['aire-split', 'termotanque', 'heladera', 'aire-central'],
    brands: ['BGH', 'Carrier', 'Midea', 'Samsung'],
    years_experience: 15,
    verified: true,
    available_now: true,
    rating_avg: 4.4,
    rating_count: 18
  },
  {
    full_name: 'Redes Litoral',
    headline: 'Conectividad y seguridad para oficinas',
    bio: 'Cableado estructurado, redes Ubiquiti y Mikrotik, CCTV Hikvision. Contratos de mantenimiento mensual.',
    phone: '5493414455667',
    province: 'Santa Fe',
    city: 'Rosario',
    areas: ['oficina'],
    devices: ['router', 'switch', 'cableado', 'camaras', 'ups'],
    brands: ['Ubiquiti', 'Mikrotik', 'Hikvision', 'TP-Link', 'APC'],
    years_experience: 9,
    verified: true,
    available_now: true,
    rating_avg: 4.9,
    rating_count: 27
  },
  {
    full_name: 'Hugo Ferreyra',
    headline: 'Automatización industrial',
    bio: 'Programación de PLC Siemens y variadores. Tableros de potencia y puesta en marcha de líneas productivas.',
    phone: '5493514455667',
    province: 'Córdoba',
    city: 'Córdoba',
    areas: ['industria'],
    devices: ['plc', 'variador', 'tablero-ind', 'motor'],
    brands: ['Siemens', 'Schneider', 'ABB', 'WEG', 'Danfoss'],
    years_experience: 18,
    verified: true,
    available_now: true,
    rating_avg: 4.7,
    rating_count: 15
  },
  {
    full_name: 'Frío Sur SRL',
    headline: 'Frío industrial y cámaras',
    bio: 'Cámaras de frío, chillers y compresores para frigoríficos y supermercados. Guardia 24 horas.',
    phone: '5492994455667',
    province: 'Neuquén',
    city: 'Neuquén',
    areas: ['industria', 'oficina'],
    devices: ['camara-frio', 'chiller', 'compresor', 'frigobar'],
    brands: ['Danfoss', 'Carrier', 'Hitachi', 'Atlas Copco'],
    years_experience: 11,
    verified: false,
    available_now: true,
    rating_avg: 4.2,
    rating_count: 9
  },
  {
    full_name: 'Ramiro Ledesma',
    headline: 'Riego, bombeo y energía solar rural',
    bio: 'Instalación y reparación de pivotes, bombas sumergibles y sistemas solares off-grid para establecimientos rurales.',
    phone: '5493514455888',
    province: 'Córdoba',
    city: 'Río Cuarto',
    areas: ['campo'],
    devices: ['pivote', 'bomba-sumergible', 'panel-solar', 'inversor', 'grupo-electrogeno'],
    brands: ['Grundfos', 'Pedrollo', 'Victron', 'Enertik', 'John Deere'],
    years_experience: 14,
    verified: true,
    available_now: true,
    rating_avg: 4.5,
    rating_count: 12
  },
  {
    full_name: 'Diego Sosa',
    headline: 'Lavarropas y secarropas',
    bio: 'Reparación de lavarropas automáticos Drean, Samsung y LG. Cambio de rulemanes, placas y programadores.',
    phone: '5492614455667',
    province: 'Mendoza',
    city: 'Mendoza',
    areas: ['hogar'],
    devices: ['lavarropas', 'secarropas', 'lavavajillas'],
    brands: ['Drean', 'Samsung', 'LG', 'Gafa'],
    years_experience: 8,
    verified: false,
    available_now: true,
    rating_avg: 4.1,
    rating_count: 7
  },
  {
    full_name: 'Taller Pampa',
    headline: 'Maquinaria agrícola y ganadería',
    bio: 'Service de tractores, cosechadoras y ordeñadoras. Atendemos partidos del centro de Buenos Aires.',
    phone: '5492494455667',
    province: 'Buenos Aires',
    city: 'Tandil',
    areas: ['campo'],
    devices: ['tractor', 'cosechadora', 'ordeñadora', 'bebedero', 'boyero'],
    brands: ['John Deere', 'Czerweny', 'Motorarg', 'Rotoplas'],
    years_experience: 22,
    verified: true,
    available_now: true,
    rating_avg: 4.6,
    rating_count: 19
  },
  {
    full_name: 'Nadia Cabrera',
    headline: 'Electricidad domiciliaria',
    bio: 'Tableros, instalaciones nuevas y certificación eléctrica. Urgencias en el día en zona sur de CABA.',
    phone: '5491199887766',
    province: 'Ciudad Autónoma de Buenos Aires',
    city: 'Barracas',
    areas: ['hogar'],
    devices: ['tablero', 'instalacion', 'calefactor'],
    brands: ['Siemens', 'Schneider', 'ABB'],
    years_experience: 6,
    verified: true,
    available_now: true,
    rating_avg: 4.3,
    rating_count: 11
  }
];

function buildServicePath(area, device, brand) {
  const areaMap = { hogar: 'hogar', oficina: 'oficina', industria: 'industria', campo: 'campo' };
  const a = areaMap[area] || area;
  return `${a}/linea-blanca/${device.toLowerCase().replace(/\s+/g, '-')}/${brand.toLowerCase().replace(/\s+/g, '-')}`;
}

function buildDevicePath(area, device) {
  const areaMap = { hogar: 'hogar', oficina: 'oficina', industria: 'industria', campo: 'campo' };
  const a = areaMap[area] || area;
  return `${a}/linea-blanca/${device.toLowerCase().replace(/\s+/g, '-')}`;
}

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  let created = 0;
  let updated = 0;

  for (const pro of professionals) {
    const [firstName, ...lastParts] = pro.full_name.split(' ');
    const lastName = lastParts.join(' ') || '';
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/\s+/g, '')}@kurate-demo.com`;
    const alias = pro.full_name;

    // Check if user exists by phone or email
    let user = await User.findOne({ phone: pro.phone });
    if (!user) {
      user = await User.findOne({ email });
    }

    // Build services array — professionalProfile uses [String], hogarProfile uses [{path,name,brands}]
    const svcPaths = [];
    const hogarSvcObjs = [];
    for (const area of pro.areas) {
      for (const device of pro.devices) {
        for (const brand of pro.brands) {
          const path = buildServicePath(area, device, brand);
          svcPaths.push(path);
          hogarSvcObjs.push({ path, name: `${device} ${brand}`, brands: [brand] });
        }
      }
    }

    const profileData = {
      alias,
      bio: pro.bio,
      services: svcPaths,
      photos: pro.photo_url ? [pro.photo_url] : [],
      whatsappNumber: pro.phone,
      location: {
        province: pro.province,
        city: pro.city
      },
      workingHours: { start: '08:00', end: '18:00' },
      workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      isExposed: true,
      verificationStatus: pro.verified ? 'approved' : 'pending',
      quality: 'Standard'
    };

    if (user) {
      // Update existing user
      const isHogar = pro.areas.includes('hogar');
      if (isHogar) {
        user.hogarProfile = user.hogarProfile || {};
        user.hogarProfile.firstName = firstName;
        user.hogarProfile.lastName = lastName;
        user.hogarProfile.bio = pro.bio;
        user.hogarProfile.services = hogarSvcObjs;
        user.hogarProfile.photos = pro.photo_url ? [pro.photo_url] : [];
        user.hogarProfile.availability = 'rapida';
        user.hogarProfile.area = pro.areas[0];
        user.hogarProfile.action = 'reparacion';
        user.hogarProfile.address = { province: pro.province, city: pro.city };
        user.hogarProfile.contact = { phone: pro.phone };
      }
      user.professionalProfile.alias = alias;
      user.professionalProfile.bio = pro.bio;
      user.professionalProfile.services = svcPaths;
      user.professionalProfile.photos = pro.photo_url ? [pro.photo_url] : [];
      user.professionalProfile.whatsappNumber = pro.phone;
      user.professionalProfile.location = { province: pro.province, city: pro.city };
      user.professionalProfile.workingHours = { start: '08:00', end: '18:00' };
      user.professionalProfile.workingDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      user.professionalProfile.isExposed = true;
      user.professionalProfile.verificationStatus = pro.verified ? 'approved' : 'pending';
      user.professionalProfile.quality = 'Standard';
      user.role = 'professional';
      user.accountDeletedAt = null;
      await user.save();
      updated++;
      console.log(`Updated: ${pro.full_name}`);
    } else {
      // Create new user
      user = await User.create({
        email,
        password: 'kurate-demo-2026',
        name: pro.full_name,
        phone: pro.phone,
        role: 'professional',
        professionalProfile: profileData,
        hogarProfile: pro.areas.includes('hogar') ? {
          firstName,
          lastName,
          bio: pro.bio,
          services: hogarSvcObjs,
          photos: pro.photo_url ? [pro.photo_url] : [],
          availability: 'rapida',
          area: pro.areas[0],
          action: 'reparacion',
          address: { province: pro.province, city: pro.city },
          contact: { phone: pro.phone }
        } : undefined,
        emailVerified: true,
        accountDeletedAt: null
      });
      created++;
      console.log(`Created: ${pro.full_name}`);
    }

    // Create feedback entries for ratings
    if (pro.rating_count > 0) {
      // Delete existing feedback for this professional
      await Feedback.deleteMany({ professional: user._id });

      // Create synthetic feedback entries
      const feedbackDocs = [];
      const ratingDistribution = {};
      const fullStars = Math.floor(pro.rating_avg);
      const halfStar = pro.rating_avg % 1 >= 0.5;

      for (let i = 0; i < pro.rating_count; i++) {
        let rating;
        if (i < Math.floor(pro.rating_count * 0.7)) {
          rating = fullStars;
        } else if (halfStar && i === Math.floor(pro.rating_count * 0.7)) {
          rating = fullStars + 1;
        } else {
          rating = Math.max(1, fullStars - 1);
        }
        rating = Math.min(5, Math.max(1, rating));
        ratingDistribution[rating] = (ratingDistribution[rating] || 0) + 1;

        feedbackDocs.push({
          professional: user._id,
          author: new mongoose.Types.ObjectId(),
          customerEmail: `client${i + 1}@demo.com`,
          rating,
          comment: `Demo feedback ${i + 1}`,
          status: 'completed',
          createdAt: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000)
        });
      }

      await Feedback.insertMany(feedbackDocs);
    }
  }

  console.log(`\nDone: ${created} created, ${updated} updated`);
  console.log(`Total professionals: ${await User.countDocuments({ role: 'professional', accountDeletedAt: null })}`);

  await mongoose.disconnect();
  console.log('Disconnected');
}

seed().catch(err => { console.error(err); process.exit(1); });
