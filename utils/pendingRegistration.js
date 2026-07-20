const User = require('../models/User');

async function rollbackPendingUser(userId) {
  if (!userId) return;
  await User.findByIdAndDelete(userId);
}

async function purgeExpiredUnverifiedUsers(email) {
  const filter = {
    isEmailVerified: false,
    emailVerificationCodeExpire: { $lt: new Date() }
  };
  if (email) filter.email = email;
  const stale = await User.find(filter).select('_id email');
  for (const row of stale) {
    await rollbackPendingUser(row._id);
  }
  return stale.length;
}

async function isEmailFullyRegistered(email) {
  if (!email) return false;
  await purgeExpiredUnverifiedUsers(email);
  return Boolean(await User.exists({
    email,
    isEmailVerified: true,
    role: { $in: ['professional', 'admin'] }
  }));
}

async function hasVerifiedGuestAccount(email) {
  if (!email) return false;
  await purgeExpiredUnverifiedUsers(email);
  return Boolean(await User.exists({
    email,
    isEmailVerified: true,
    role: 'user'
  }));
}

module.exports = {
  rollbackPendingUser,
  purgeExpiredUnverifiedUsers,
  isEmailFullyRegistered,
  hasVerifiedGuestAccount
};
