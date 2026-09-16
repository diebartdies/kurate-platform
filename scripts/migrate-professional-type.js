const mongoose = require('mongoose');
const User = require('../models/User');

async function migrate() {
  await mongoose.connect('mongodb://kurateApp:Kurate2026Secure!@127.0.0.1:27018/KuraTe?authSource=admin');
  
  // Find users with hogarProfile.category
  const users = await User.find({
    'hogarProfile.category': { $exists: true, $ne: null, $ne: '' }
  }).lean();
  
  console.log(`Found ${users.length} users with hogarProfile.category`);
  
  let updated = 0;
  for (const u of users) {
    const cat = u.hogarProfile.category;
    if (cat && cat !== u.professionalType) {
      await User.updateOne({ _id: u._id }, { $set: { professionalType: cat } });
      updated++;
      console.log(`Updated: ${u.email} → ${cat}`);
    }
  }
  
  console.log(`Migration complete: ${updated} users updated`);
  await mongoose.disconnect();
}

migrate().catch(e => { console.error(e); process.exit(1); });
