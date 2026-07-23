#!/usr/bin/env node
// Import AMBA cities from CSV into MongoDB
// Usage: node scripts/import-amba-cities.js

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Province = require('../models/Province');
const City = require('../models/City');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27018/kurate';
const CSV_PATH = path.join(__dirname, '..', 'public', 'docs', 'ciudades amba.csv');

function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(';');
    if (parts.length < 2) continue;
    const city = parts[0].replace(/\[\d+\]/g, '').trim();
    const partido = parts[1].trim();
    if (city && partido) {
      results.push({ city, partido });
    }
  }
  return results;
}

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const csv = fs.readFileSync(CSV_PATH, 'latin1');
  const entries = parseCSV(csv);
  console.log(`Found ${entries.length} cities in CSV`);

  // Group by partido (used as province name)
  const byProvincia = {};
  for (const e of entries) {
    if (!byProvincia[e.partido]) byProvincia[e.partido] = [];
    byProvincia[e.partido].push(e.city);
  }

  let createdProvinces = 0;
  let createdCities = 0;
  let skippedCities = 0;

  for (const [provName, cities] of Object.entries(byProvincia)) {
    // Find or create province
    let province = await Province.findOne({ name: provName });
    if (!province) {
      province = await Province.create({ name: provName });
      createdProvinces++;
      console.log(`  Created province: ${provName}`);
    }

    for (const cityName of cities) {
      const exists = await City.findOne({ name: cityName, province: province._id });
      if (exists) {
        skippedCities++;
        continue;
      }
      await City.create({ name: cityName, province: province._id });
      createdCities++;
    }
  }

  console.log(`\nDone!`);
  console.log(`  Provinces created: ${createdProvinces}`);
  console.log(`  Cities created: ${createdCities}`);
  console.log(`  Cities skipped (already exist): ${skippedCities}`);

  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
