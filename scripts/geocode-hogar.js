#!/usr/bin/env node
// Geocode hogar professionals by neighborhood/province
// Adds lat/lng to hogarProfile.address and professionalProfile.location

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const User = require('../models/User');

// Approximate coordinates for Argentine locations
const GEO = {
  'CABA': { lat: -34.6037, lng: -58.3816 },
  'Villa Urquiza': { lat: -34.5553, lng: -58.4928 },
  'Belgrano': { lat: -34.5614, lng: -58.4567 },
  'Palermo': { lat: -34.5789, lng: -58.4267 },
  'San Telmo': { lat: -34.6250, lng: -58.3717 },
  'Puerto Madero': { lat: -34.6175, lng: -58.3628 },
  'Retiro': { lat: -34.5917, lng: -58.3747 },
  'Villa Crespo': { lat: -34.5981, lng: -58.4381 },
  'Almagro': { lat: -34.6031, lng: -58.4217 },
  'Boedo': { lat: -34.6103, lng: -58.4167 },
  'Caballito': { lat: -34.6181, lng: -58.4431 },
  'Flores': { lat: -34.6339, lng: -58.4614 },
  'Floresta': { lat: -34.6253, lng: -58.4753 },
  'Vélez Sársfield': { lat: -34.6181, lng: -58.4753 },
  'Villa Luro': { lat: -34.6289, lng: -58.4964 },
  'Liniers': { lat: -34.6397, lng: -58.5233 },
  'Mataderos': { lat: -34.6447, lng: -58.5036 },
  'Parque Chas': { lat: -34.6000, lng: -58.4636 },
  'Núñez': { lat: -34.5367, lng: -58.4600 },
  'Saavedra': { lat: -34.5439, lng: -58.4753 },
  'Coghlan': { lat: -34.5483, lng: -58.4767 },
  'Villa Pueyrredón': { lat: -34.5553, lng: -58.4853 },
  'Chacarita': { lat: -34.5867, lng: -58.4528 },
  'Paternal': { lat: -34.5931, lng: -58.4478 },
  'Villa General Mitre': { lat: -34.5953, lng: -58.4617 },
  'Monte Castro': { lat: -34.6103, lng: -58.4931 },
  'Villa Santa Rita': { lat: -34.6031, lng: -58.4781 },
  'San Cristóbal': { lat: -34.6150, lng: -58.3850 },
  'Barracas': { lat: -34.6339, lng: -58.3875 },
  'La Boca': { lat: -34.6339, lng: -58.3617 },
  'Parque Patricios': { lat: -34.6253, lng: -58.3981 },
  'Nueva Pompeya': { lat: -34.6389, lng: -58.3931 },
  'Versalles': { lat: -34.5453, lng: -58.5053 },
  'Villa Devoto': { lat: -34.5553, lng: -58.5153 },
  'Villa del Parque': { lat: -34.5581, lng: -58.5081 },
  'Villa Luro': { lat: -34.6289, lng: -58.4964 },
  'Villa Soldati': { lat: -34.6553, lng: -58.4167 },
  'Villa Riachuelo': { lat: -34.6639, lng: -58.3981 },
  'Villa Lugano': { lat: -34.6553, lng: -58.4081 },
  'Villa Estación': { lat: -34.6000, lng: -58.4900 },
  'Buenos Aires': { lat: -34.6037, lng: -58.3816 },
  'Córdoba': { lat: -31.4201, lng: -64.1888 },
  'Santa Fe': { lat: -31.6488, lng: -60.7087 },
  'Rosario': { lat: -32.9468, lng: -60.6393 },
  'Mendoza': { lat: -32.8895, lng: -68.8458 },
  'Tucumán': { lat: -26.8241, lng: -65.2226 },
  'Salta': { lat: -24.7829, lng: -65.4232 },
  'Mar del Plata': { lat: -38.0055, lng: -57.5426 },
  'La Plata': { lat: -34.9214, lng: -57.9544 },
  'San Miguel de Tucumán': { lat: -26.8241, lng: -65.2226 },
  'Neuquén': { lat: -38.9516, lng: -68.0591 },
  'Resistencia': { lat: -27.4678, lng: -59.0039 },
  'Corrientes': { lat: -27.4692, lng: -58.8106 },
  'Paraná': { lat: -31.7316, lng: -59.1424 },
  'Formosa': { lat: -26.1775, lng: -58.1781 },
  'San Salvador de Jujuy': { lat: -24.1858, lng: -65.2995 },
  'Santa Rosa': { lat: -36.6228, lng: -64.2867 },
  'San Juan': { lat: -31.5375, lng: -68.5364 },
  'San Luis': { lat: -33.2950, lng: -66.3356 },
  'Río Gallegos': { lat: -51.6226, lng: -69.2181 },
  'Ushuaia': { lat: -54.8019, lng: -68.3030 },
  'Santiago del Estero': { lat: -27.7951, lng: -64.2615 },
  'Catamarca': { lat: -28.4696, lng: -65.7852 },
  'La Rioja': { lat: -29.4714, lng: -66.8502 },
  'Rawson': { lat: -43.3002, lng: -65.1023 },
  'Viedma': { lat: -40.8135, lng: -62.9966 },
  'Posadas': { lat: -27.3668, lng: -55.8965 },
  'San Carlos de Bariloche': { lat: -41.1335, lng: -71.3103 },
  'General Pico': { lat: -35.6567, lng: -63.7568 },
  'Venado Tuerto': { lat: -33.7456, lng: -61.9688 },
  'Río Cuarto': { lat: -33.1301, lng: -64.3497 },
  'Concepción': { lat: -27.5803, lng: -65.5992 },
  'Godoy Cruz': { lat: -32.9289, lng: -68.8406 },
  'Caseros': { lat: -34.6122, lng: -58.5614 },
  'Lomas de Zamora': { lat: -34.7667, lng: -58.4000 },
  'Avellaneda': { lat: -34.6639, lng: -58.3617 },
  'Quilmes': { lat: -34.7167, lng: -58.2667 },
  'Lanús': { lat: -34.6986, lng: -58.3922 },
  'Almirante Brown': { lat: -34.7833, lng: -58.3833 },
  'Morón': { lat: -34.6533, lng: -58.6197 },
  'La Matanza': { lat: -34.6714, lng: -58.5614 },
  'Tres de Febrero': { lat: -34.6000, lng: -58.5667 },
  'San Martín': { lat: -34.5739, lng: -58.5364 },
  'Vicente López': { lat: -34.5253, lng: -58.4767 },
  'San Isidro': { lat: -34.4714, lng: -58.5117 },
  'San Fernando': { lat: -34.4417, lng: -58.5614 },
  'Tigre': { lat: -34.4267, lng: -58.5797 },
  'Escobar': { lat: -34.3500, lng: -58.7833 },
  'Pilar': { lat: -34.4583, lng: -58.9133 },
  'Merlo': { lat: -34.6667, lng: -58.7333 },
  'Moreno': { lat: -34.6500, lng: -58.7833 },
  'Ituzaingó': { lat: -34.6617, lng: -58.6681 },
  'Hurlingham': { lat: -34.6333, lng: -58.6333 },
  'Malvinas Argentinas': { lat: -34.6000, lng: -58.6500 },
  'San Miguel': { lat: -34.5439, lng: -58.7117 },
  'Cafayate': { lat: -26.0933, lng: -65.9767 },
  'Cosquín': { lat: -31.2453, lng: -64.4667 },
  'La Quiaca': { lat: -22.1022, lng: -65.5942 }
};

function resolveLatlng(province, city, neighborhood, street, number) {
  // Try neighborhood first, then city, then province
  const loc = GEO[neighborhood] || GEO[city] || GEO[province];
  if (!loc) return null;
  // Add small random offset based on street number for uniqueness
  const offsetLat = (Math.random() - 0.5) * 0.01;
  const offsetLng = (Math.random() - 0.5) * 0.01;
  return { lat: Math.round((loc.lat + offsetLat) * 10000) / 10000, lng: Math.round((loc.lng + offsetLng) * 10000) / 10000 };
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    authSource: 'admin'
  });
  console.log('Connected to MongoDB');

  const users = await User.find({
    role: 'professional',
    professionalType: 'hogar'
  }).lean();

  console.log(`Found ${users.length} hogar professionals`);

  let fixed = 0;
  for (const u of users) {
    const hp = u.hogarProfile || {};
    const loc = hp.address || {};
    const ppLoc = (u.professionalProfile && u.professionalProfile.location) || {};

    // Use hogarProfile.address or professionalProfile.location
    const province = loc.province || ppLoc.province || '';
    const city = loc.city || ppLoc.city || '';
    const neighborhood = loc.neighborhood || ppLoc.neighborhood || '';
    const street = loc.street || ppLoc.street || '';
    const number = loc.number || ppLoc.number || '';

    const coords = resolveLatlng(province, city, neighborhood, street, number);
    if (!coords) continue;

    const updates = {};
    // Add lat/lng to hogarProfile.address
    updates['hogarProfile.address.lat'] = coords.lat;
    updates['hogarProfile.address.lng'] = coords.lng;
    // Also to professionalProfile.location
    updates['professionalProfile.location.lat'] = coords.lat;
    updates['professionalProfile.location.lng'] = coords.lng;

    await User.updateOne({ _id: u._id }, { $set: updates });
    fixed++;
    console.log(`Geocoded: ${u.name} (${neighborhood || city || province}) -> ${coords.lat}, ${coords.lng}`);
  }

  console.log(`\nDone. Geocoded ${fixed} of ${users.length} professionals.`);
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
