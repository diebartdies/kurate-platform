#!/usr/bin/env node
// Fix: move all AMBA cities to "Buenos Aires" province, delete fake partido-provinces
// Usage: node scripts/fix-amba-provinces.js

const mongoose = require('mongoose');
const Province = require('../models/Province');
const City = require('../models/City');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27018/kurate';

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // Find or create the real "Buenos Aires" province
  let buenosAires = await Province.findOne({ name: 'Buenos Aires' });
  if (!buenosAires) {
    buenosAires = await Province.create({ name: 'Buenos Aires' });
    console.log('Created "Buenos Aires" province');
  } else {
    console.log('Found "Buenos Aires" province:', buenosAires._id);
  }

  // Count fake provinces (partidos that are NOT real provinces)
  const REAL_PROVINCES = new Set([
    'buenos aires', 'ciudad autónoma de buenos aires', 'caba',
    'catamarca', 'chaco', 'chubut', 'córdoba', 'corrientes',
    'entreríos', 'formosa', 'jujuy', 'la pampa', 'la rioja',
    'mendoza', 'misiones', 'neuquén', 'río negro', 'salta',
    'san juan', 'san luis', 'santa cruz', 'santa fe',
    'santiago del estero', 'tucumán', 'tierra del fuego'
  ]);

  const allProvinces = await Province.find({});
  const fakeProvinces = allProvinces.filter(p => !REAL_PROVINCES.has(p.name.toLowerCase().trim()));
  console.log(`Found ${fakeProvinces.length} fake province entries to remove`);

  // Move cities from fake provinces to Buenos Aires
  let moved = 0;
  for (const fp of fakeProvinces) {
    const result = await City.updateMany(
      { province: fp._id },
      { $set: { province: buenosAires._id } }
    );
    moved += result.modifiedCount;
  }
  console.log(`Moved ${moved} cities to "Buenos Aires" province`);

  // Delete fake provinces
  const fakeIds = fakeProvinces.map(p => p._id);
  const deleted = await Province.deleteMany({ _id: { $in: fakeIds } });
  console.log(`Deleted ${deleted.deletedCount} fake province entries`);

  // Summary
  const totalProvinces = await Province.countDocuments();
  const totalCities = await City.countDocuments();
  console.log(`\nFinal: ${totalProvinces} provinces, ${totalCities} cities`);

  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
