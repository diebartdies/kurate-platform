/**
 * Delete one or more user accounts (and related rows) by email, alias, or name fragment.
 *
 * Usage:
 *   node scripts/delete-account.js pame.landy100@gmail.com     # best: full email
 *   node scripts/delete-account.js pame.landy100               # also matches *@gmail.com etc.
 *   node scripts/delete-account.js pame.landy100 --confirm     # delete
 *
 * Search: without "@" we match local-part@any-domain plus common domains (gmail.com, hotmail.com, …).
 */

require('dotenv').config();
const connectDB = require('../config/database');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const Connection = require('../models/Connection');
const ConnectionRequest = require('../models/ConnectionRequest');
const Review = require('../models/Review');
const Statistic = require('../models/Statistic');
const Specialty = require('../models/Specialty');
const Professional = require('../models/Professional');
const TermsAcceptance = require('../models/TermsAcceptance');
const SupportMessage = require('../models/SupportMessage');
const { buildUserSearchFilter, COMMON_EMAIL_DOMAINS } = require('./lib/accountSearch');

const needle = String(process.argv[2] || '').trim();
const confirm = process.argv.includes('--confirm');

if (!needle) {
  console.error('Usage: node scripts/delete-account.js <email-or-alias-fragment> [--confirm]');
  console.error('Tip: use full email when known, e.g. user@gmail.com');
  process.exit(1);
}

const userFilter = buildUserSearchFilter(needle);

async function deleteForUser(userId) {
  const id = userId;
  const results = {};
  results.ActivityLog = (await ActivityLog.deleteMany({ professional: id })).deletedCount;
  results.Connection = (await Connection.deleteMany({ $or: [{ user: id }, { professional: id }] })).deletedCount;
  results.ConnectionRequest = (await ConnectionRequest.deleteMany({ $or: [{ from: id }, { to: id }] })).deletedCount;
  results.Review = (await Review.deleteMany({ $or: [{ author: id }, { professional: id }] })).deletedCount;
  results.Statistic = (await Statistic.deleteMany({ professional: id })).deletedCount;
  results.Specialty = (await Specialty.deleteMany({ user: id })).deletedCount;
  results.Professional = (await Professional.deleteMany({ user: id })).deletedCount;
  results.TermsAcceptance = (await TermsAcceptance.deleteMany({ user: id })).deletedCount;
  results.SupportMessage = (await SupportMessage.deleteMany({ user: id })).deletedCount;
  results.User = (await User.findByIdAndDelete(id)) ? 1 : 0;
  return results;
}

async function main() {
  await connectDB();

  if (!needle.includes('@')) {
    console.log(`Search mode: local-part "${needle}" (+ ${COMMON_EMAIL_DOMAINS.slice(0, 3).join(', ')}, …)`);
    console.log('Tip: for one exact account, pass full email: user@gmail.com\n');
  }

  const users = await User.find(userFilter).select('email name role isEmailVerified professionalProfile.alias createdAt emailVerificationCodeExpire');

  if (!users.length) {
    console.log(`No users matched "${needle}".`);
    process.exit(0);
  }

  console.log(`Matched ${users.length} user(s):`);
  for (const u of users) {
    const expired = !u.emailVerificationCodeExpire || u.emailVerificationCodeExpire.getTime() <= Date.now();
    const pending = !u.isEmailVerified ? (expired ? 'unverified-expired' : 'unverified-active') : 'verified';
    console.log(`  - ${u.email} | role=${u.role} | alias=${u.professionalProfile?.alias || '—'} | ${pending}`);
  }

  if (!confirm) {
    console.log('\nDry-run only. Re-run with --confirm to delete.');
    process.exit(0);
  }

  for (const u of users) {
    const counts = await deleteForUser(u._id);
    console.log(`Deleted ${u.email}:`, counts);
  }

  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
