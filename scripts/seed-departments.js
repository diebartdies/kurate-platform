const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/KuraTe';

// Nombre de provincia en el CSV -> nombre en la coleccion Province
const PROVINCE_ALIAS = {
  'Ciudad Autónoma de Buenos Aires': 'CABA',
  'Ciudad Autonoma de Buenos Aires': 'CABA',
  'Tierra del Fuego, Antártida e Islas del Atlántico Sur': 'Tierra del Fuego',
  'Tierra del Fuego, Antartida e Islas del Atlantico Sur': 'Tierra del Fuego',
  'Buenos Aires': 'Buenos Aires'
};

// Leer CSV relativo a este archivo (BOM UTF-8 opcional)
const fs = require('fs');
const CSV_PATH = path.join(__dirname, 'provincias_y_departamentos_argentina.csv');
const csvText = fs.readFileSync(CSV_PATH, 'utf8').replace(/^\uFEFF/, '');

function parseLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const Province = mongoose.model('Province', new mongoose.Schema({
    name: { type: String, required: true, unique: true, trim: true },
    countryCode: { type: String, default: '054', required: true }
  }));

  const Department = mongoose.model('Department', new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    province: { type: mongoose.Schema.Types.ObjectId, ref: 'Province', required: true }
  }));

  // Index de unicidad (provincia, nombre) para que el seed sea idempotente
  await Department.collection.createIndex({ province: 1, name: 1 }, { unique: true });

  // Parsear CSV -> { provinciaCsv: [deptos] }
  const byProv = {};
  for (const line of csvText.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [prov, dept] = parseLine(line).map(s => (s || '').trim());
    if (!prov || !dept) continue;
    if (!byProv[prov]) byProv[prov] = [];
    byProv[prov].push(dept);
  }

  const provinceNames = Object.keys(byProv);
  console.log('Provincias en CSV:', provinceNames.length);
  console.log('Departamentos en CSV:', Object.values(byProv).reduce((s, a) => s + a.length, 0));

  // Resolver ObjectIds de cada provincia
  const provinceMap = {};
  for (const prov of provinceNames) {
    const dbName = PROVINCE_ALIAS[prov] || prov;
    const doc = await Province.findOne({ name: dbName });
    if (!doc) {
      console.error('  OJO: no existe la provincia', JSON.stringify(dbName), 'en la coleccion provinces. Se saltea.');
      continue;
    }
    provinceMap[prov] = doc._id;
  }
  console.log('Provincias mapeadas a ObjectId:', Object.keys(provinceMap).length);

  // Upsert idempotente por (provincia, nombre)
  let inserted = 0, skipped = 0;
  for (const prov of provinceNames) {
    const provId = provinceMap[prov];
    if (!provId) continue;
    for (const name of byProv[prov]) {
      const res = await Department.updateOne(
        { province: provId, name },
        { $setOnInsert: { province: provId, name } },
        { upsert: true }
      );
      if (res.upsertedCount > 0) inserted++;
      else skipped++;
    }
  }

  console.log('Insertados:', inserted, '| ya existentes:', skipped);
  const total = await Department.countDocuments();
  console.log('Total en coleccion departments:', total);
  console.log('Done');
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });