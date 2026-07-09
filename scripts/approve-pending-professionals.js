require('dotenv').config();
const connectDB = require('../config/database');
const User = require('../models/User');

async function approveAllPending() {
  await connectDB();

  console.log('Finding and approving all pending professionals...');
  const result = await User.updateMany(
    { role: 'professional', verificationStatus: 'pending' },
    { $set: { isVerified: true, verificationStatus: 'approved' } }
  );

  if (result.modifiedCount > 0) {
    console.log(`✅ Successfully approved ${result.modifiedCount} pending professionals.`);
  } else {
    console.log('No pending professionals were found to approve.');
  }

  process.exit(0);
}

approveAllPending().catch((err) => {
  console.error('Error approving professionals:', err);
  process.exit(1);
});
