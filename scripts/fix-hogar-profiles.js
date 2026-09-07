#!/usr/bin/env node
// Fix all hogar professionals missing essential fields
// - area: default "hogar"
// - action: default "Reparo"
// - firstName/lastName: derived from name
// - address: derived from professionalProfile.location
// Usage: node scripts/fix-hogar-profiles.js

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const User = require('../models/User');

async function run() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  await mongoose.connect(uri, {
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
    const updates = {};

    // firstName / lastName from name
    if (!hp.firstName && u.name) {
      const parts = u.name.trim().split(/\s+/);
      updates['hogarProfile.firstName'] = parts[0] || '';
      updates['hogarProfile.lastName'] = parts.slice(1).join(' ') || '';
    }

    // area default
    if (!hp.area || hp.area === '[unknown type]') {
      updates['hogarProfile.area'] = 'hogar';
    }

    // action default
    if (!hp.action || hp.action === '[unknown type]') {
      updates['hogarProfile.action'] = 'Reparo';
    }

    // address from professionalProfile.location
    if (!hp.address || typeof hp.address === 'string') {
      const loc = (u.professionalProfile && u.professionalProfile.location) || {};
      if (loc.province || loc.city || loc.neighborhood) {
        updates['hogarProfile.address'] = {
          province: loc.province || '',
          city: loc.city || '',
          neighborhood: loc.neighborhood || '',
          street: loc.street || '',
          number: loc.number || '',
          postalCode: loc.postalCode || ''
        };
      }
    }

    // availability default
    if (!hp.availability) {
      updates['hogarProfile.availability'] = 'rapida';
    }

    // scope default
    if (!hp.scope) {
      updates['hogarProfile.scope'] = 'domicilio';
    }

    if (Object.keys(updates).length > 0) {
      await User.updateOne({ _id: u._id }, { $set: updates });
      fixed++;
      console.log(`Fixed: ${u.name} (${u.email}) - ${Object.keys(updates).join(', ')}`);
    }
  }

  console.log(`\nDone. Fixed ${fixed} of ${users.length} professionals.`);
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
