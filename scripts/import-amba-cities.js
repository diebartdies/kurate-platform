#!/usr/bin/env node
// Import AMBA cities from CSV into MongoDB (FIXED: uses Buenos Aires province)
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

  // All AMBA cities belong to Buenos Aires province
  let province = await Province.findOne({ name: 'Buenos Aires' });
  if (!province) {
    province = await Province.create({ name: 'Buenos Aires' });
    console.log('Created "Buenos Aires" province');
  } else {
    console.log('Using existing "Buenos Aires" province');
  }

  let created = 0;
  let skipped = 0;

  for (const entry of entries) {
    const exists = await City.findOne({ name: entry.city, province: province._id });
    if (exists) {
      skipped++;
      continue;
    }
    await City.create({ name: entry.city, province: province._id });
    created++;
  }

  console.log(`\nDone!`);
  console.log(`  Cities created: ${created}`);
  console.log(`  Cities skipped (already exist): ${skipped}`);

  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
