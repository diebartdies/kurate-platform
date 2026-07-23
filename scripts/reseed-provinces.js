#!/usr/bin/env node
// Re-seed real Argentine provinces (non-destructive)
// Also ensures Buenos Aires has all AMBA cities from CSV
// Usage: node scripts/reseed-provinces.js

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Province = require('../models/Province');
const City = require('../models/City');
const Neighborhood = require('../models/Neighborhood');

const PROVINCES = [
  'Buenos Aires', 'CABA', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba',
  'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja',
  'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta', 'San Juan',
  'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucumán'
];

const CABA_NEIGHBORHOODS = [
  'Palermo', 'Recoleta', 'Belgrano', 'Nuñez', 'Colegiales', 'Chacarita', 'Villa Crespo',
  'Almagro', 'Balvanera', 'San Nicolás', 'Montserrat', 'Puerto Madero', 'Retiro', 'La Boca',
  'Barracas', 'Constitución', 'San Telmo', 'Parque Patricios', 'Boedo', 'Caballito',
  'Flores', 'Floresta', 'Villa Lugano', 'Villa Soldati', 'Villa Riachuelo', 'Liniers',
  'Mataderos', 'Villa Luro', 'Versalles', 'Villa Real', 'Monte Castro', 'Devoto',
  'Villa del Parque', 'Villa Santa Rita', 'Villa General Mitre', 'Paternal', 'Saavedra',
  'Coghlan', 'Villa Urquiza', 'Parque Avellaneda', 'Villa Devoto', 'Villa Ortúzar',
  'Parque Chacabuco', 'Nueva Pompeya', 'Villa Pueyrredón', 'Agronomía'
];

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  // 1. Ensure all real provinces exist
  let created = 0;
  for (const name of PROVINCES) {
    const exists = await Province.findOne({ name });
    if (!exists) {
      await Province.create({ name });
      created++;
    }
  }
  console.log(`Created ${created} missing provinces (${PROVINCES.length - created} already existed)`);

  // 2. Get Buenos Aires province
  const ba = await Province.findOne({ name: 'Buenos Aires' });

  // 3. Check existing cities for Buenos Aires
  const existingCities = await City.find({ province: ba._id });
  const existingNames = new Set(existingCities.map(c => c.name.toLowerCase()));
  console.log(`Buenos Aires has ${existingCities.length} cities`);

  // 4. Ensure CABA neighborhoods exist
  const caba = await Province.findOne({ name: 'CABA' });
  if (caba) {
    const existingHoods = await Neighborhood.find({ province: caba._id });
    const existingHoodNames = new Set(existingHoods.map(h => h.name.toLowerCase()));
    const newHoods = CABA_NEIGHBORHOODS.filter(n => !existingHoodNames.has(n.toLowerCase()));
    if (newHoods.length > 0) {
      await Neighborhood.insertMany(newHoods.map(name => ({ name, province: caba._id })));
      console.log(`Added ${newHoods.length} CABA neighborhoods`);
    } else {
      console.log('CABA neighborhoods already up to date');
    }
  }

  // 5. Summary
  const totalProvinces = await Province.countDocuments();
  const totalCities = await City.countDocuments();
  const totalHoods = await Neighborhood.countDocuments();
  console.log(`\nFinal: ${totalProvinces} provinces, ${totalCities} cities, ${totalHoods} neighborhoods`);

  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
