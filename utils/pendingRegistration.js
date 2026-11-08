const User = require('../models/User');

async function rollbackPendingUser(userId) {
  if (!userId) return;
  await User.findByIdAndDelete(userId);
}

/**
 * Rollback exacto de un registro transaccional: borra la cuenta creada por un
 * pre-registro puntual. Es idempotente (si no existe, no hace nada) y sirve
 * tanto para el fallo sincronico como para el caso "el insert se aplico
 * despues del timeout".
 */
async function rollbackUserByRegistrationPreId(preId) {
  if (!preId) return 0;
  const result = await User.deleteOne({ registrationPreId: preId });
  return result.deletedCount || 0;
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
  rollbackUserByRegistrationPreId,
  purgeExpiredUnverifiedUsers,
  isEmailFullyRegistered,
  hasVerifiedGuestAccount
};
