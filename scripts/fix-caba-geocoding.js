/**
 * Fix geocoding for all CABA professionals.
 * Uses neighborhood or city from professionalProfile.location to assign correct lat/lng.
 */
const mongoose = require('mongoose');
const { assignGpsToLocation } = require('../utils/cityCoordinates');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://kurateApp:Kurate2026Secure!@localhost:27018/KuraTe?authSource=admin';

// CABA bounding box: roughly lat -34.53 to -34.70, lng -58.27 to -58.53
const CABA_MIN_LAT = -34.70;
const CABA_MAX_LAT = -34.53;
const CABA_MIN_LNG = -58.53;
const CABA_MAX_LNG = -58.27;

function isInCaba(lat, lng) {
  return lat >= CABA_MIN_LAT && lat <= CABA_MAX_LAT && lng >= CABA_MIN_LNG && lng <= CABA_MAX_LNG;
}

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const users = await mongoose.connection.db.collection('users').find({
    role: 'professional',
    'professionalProfile.location.province': 'CABA'
  }).toArray();

  let fixed = 0;
  let alreadyOk = 0;
  let noLookup = 0;

  for (const u of users) {
    const loc = u.professionalProfile?.location || {};
    const lat = loc.lat;
    const lng = loc.lng;
    const lookup = loc.city || loc.neighborhood || '';

    if (lat && lng && isInCaba(lat, lng)) {
      alreadyOk++;
      continue;
    }

    if (!lookup) {
      console.log(`  SKIP ${u.professionalProfile?.alias || u.email}: no city/neighborhood`);
      noLookup++;
      continue;
    }

    // Build a temp location object to geocode
    const tempLoc = { city: loc.city, neighborhood: loc.neighborhood, province: loc.province };
    assignGpsToLocation(tempLoc);

    if (tempLoc.lat && tempLoc.lng) {
      await mongoose.connection.db.collection('users').updateOne(
        { _id: u._id },
        { $set: { 'professionalProfile.location.lat': tempLoc.lat, 'professionalProfile.location.lng': tempLoc.lng } }
      );
      console.log(`  FIXED ${u.professionalProfile?.alias || u.email}: ${lookup} -> ${tempLoc.lat.toFixed(4)}, ${tempLoc.lng.toFixed(4)}`);
      fixed++;
    } else {
      console.log(`  NO_COORDS ${u.professionalProfile?.alias || u.email}: ${lookup}`);
      noLookup++;
    }
  }

  console.log(`\nDone: ${fixed} fixed, ${alreadyOk} already OK, ${noLookup} no lookup`);
  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
