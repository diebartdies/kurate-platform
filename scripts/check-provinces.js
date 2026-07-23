#!/usr/bin/env node
const mongoose = require('mongoose');
const Province = require('../models/Province');
const City = require('../models/City');

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27018/kurate');
  const provinces = await Province.find({});
  console.log('Provinces:', provinces.length);
  for (const p of provinces) {
    const cityCount = await City.countDocuments({ province: p._id });
    console.log(' -', p.name, '(' + cityCount + ' cities)');
  }
  const totalCities = await City.countDocuments();
  console.log('Total cities:', totalCities);
  await mongoose.disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
