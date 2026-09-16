/**
 * Migration: Convert hogarProfile.services to device-level actions format
 * 
 * Old format:  brands: [{ name: "Samsung", actions: ["instalar"] }]
 * New format:  actions: ["instalar"], brands: ["Samsung"]
 * 
 * Usage: node scripts/migrate-actions.js
 */

const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://kurateApp:Kurate2026Secure!@localhost:27018/KuraTe?authSource=admin';

async function migrate() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false, collection: 'users' }));

    const users = await User.find({
      'hogarProfile.services': { $exists: true, $ne: [] }
    }).lean();

    let migrated = 0;
    let skipped = 0;

    for (const user of users) {
      const hp = user.hogarProfile || {};
      const services = hp.services || [];
      let dirty = false;

      for (const svc of services) {
        if (!Array.isArray(svc.brands)) continue;

        // Check if already migrated (first element is a string)
        if (svc.brands.length > 0 && typeof svc.brands[0] === 'string') {
          skipped++;
          continue;
        }

        // Convert [{name, actions}] → brands: [String] + actions: [String]
        const allActions = new Set();
        const brandNames = svc.brands.map(b => {
            if (b && typeof b === 'object') {
                if (Array.isArray(b.actions)) b.actions.forEach(a => allActions.add(a));
                return b.name || String(b);
            }
            return String(b);
        });
        svc.brands = brandNames;
        svc.actions = Array.from(allActions);
        dirty = true;
      }

      if (dirty) {
        await User.updateOne(
          { _id: user._id },
          { $set: { 'hogarProfile.services': services } }
        );
        migrated++;
        console.log(`Migrated: ${user._id} (${user.name || user.email})`);
      }
    }

    console.log(`\nMigration complete: ${migrated} users migrated, ${skipped} already migrated`);
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
