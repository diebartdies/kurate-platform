/**
 * All-in-one user cleanup.
 *
 * Deletes every NON-admin User plus all user-dependent collections, while
 * keeping every `role: 'admin'` account untouched. Before deleting it:
 *   1. Verifies at least one admin exists (aborts otherwise — never lock out).
 *   2. Writes a JSON backup of everything it is about to delete.
 *   3. Prints the counts so you can review them.
 *
 * Usage:
 *   node scripts/clean-users.js                 # dry-run (default, deletes nothing)
 *   node scripts/clean-users.js --confirm       # perform the cleanup (+ backup)
 *   node scripts/clean-users.js --confirm --no-backup
 *   node scripts/clean-users.js --confirm --backup-dir=./my-backups
 *
 * Production: works against any MONGO_URI. When NODE_ENV=production it requires
 * BOTH --confirm and --prod so it cannot run by accident.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const connectDB = require('../config/database');

const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const Connection = require('../models/Connection');
const ConnectionRequest = require('../models/ConnectionRequest');
const Review = require('../models/Review');
const Statistic = require('../models/Statistic');
const Specialty = require('../models/Specialty');
const Professional = require('../models/Professional');

const USER_DEPENDENT_COLLECTIONS = [
  { name: 'ActivityLog', model: ActivityLog },
  { name: 'Connection', model: Connection },
  { name: 'ConnectionRequest', model: ConnectionRequest },
  { name: 'Review', model: Review },
  { name: 'Statistic', model: Statistic },
  { name: 'Specialty', model: Specialty },
  { name: 'Professional (legacy)', model: Professional }
];

const NON_ADMIN_USER_FILTER = { role: { $ne: 'admin' } };

const args = process.argv.slice(2);
const confirmed = args.includes('--confirm');
const dryRun = !confirmed;
const noBackup = args.includes('--no-backup');
const prodAck = args.includes('--prod');
const backupDirArg = (args.find((a) => a.startsWith('--backup-dir=')) || '').split('=')[1];

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function countAll() {
  const counts = {};
  for (const { name, model } of USER_DEPENDENT_COLLECTIONS) {
    counts[name] = await model.countDocuments();
  }
  counts['User (non-admin)'] = await User.countDocuments(NON_ADMIN_USER_FILTER);
  counts['User (admin, kept)'] = await User.countDocuments({ role: 'admin' });
  return counts;
}

async function writeBackup() {
  const baseDir = backupDirArg
    ? path.resolve(backupDirArg)
    : path.resolve(__dirname, '..', 'backups');
  const dir = path.join(baseDir, `users-cleanup-${timestamp()}`);
  fs.mkdirSync(dir, { recursive: true });

  const manifest = { createdAt: new Date().toISOString(), files: {} };

  // Back up every dependent collection (we delete all of them)...
  for (const { name, model } of USER_DEPENDENT_COLLECTIONS) {
    const docs = await model.find({}).lean();
    const file = `${name.replace(/[^a-z0-9]+/gi, '_')}.json`;
    fs.writeFileSync(path.join(dir, file), JSON.stringify(docs, null, 2));
    manifest.files[name] = { file, count: docs.length };
  }

  // ...and the non-admin users that will be removed.
  const nonAdmin = await User.find(NON_ADMIN_USER_FILTER).lean();
  fs.writeFileSync(path.join(dir, 'User_non_admin.json'), JSON.stringify(nonAdmin, null, 2));
  manifest.files['User (non-admin)'] = { file: 'User_non_admin.json', count: nonAdmin.length };

  // Also keep a copy of admins for total peace of mind (not deleted).
  const admins = await User.find({ role: 'admin' }).lean();
  fs.writeFileSync(path.join(dir, 'User_admin.json'), JSON.stringify(admins, null, 2));
  manifest.files['User (admin, kept)'] = { file: 'User_admin.json', count: admins.length };

  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return dir;
}

// Returns a process exit code. Connection cleanup is handled by the caller.
async function run() {
  if (process.env.NODE_ENV === 'production' && confirmed && !prodAck) {
    console.error('NODE_ENV=production: add --prod to confirm you really want to run this on production.');
    console.error('Example: node scripts/clean-users.js --confirm --prod');
    return 1;
  }

  await connectDB();

  const before = await countAll();
  const totalDependent = USER_DEPENDENT_COLLECTIONS.reduce((sum, { name }) => sum + before[name], 0);
  const nonAdminUsers = before['User (non-admin)'];
  const adminUsers = before['User (admin, kept)'];

  console.log('--- User cleanup (admin accounts preserved) ---');
  console.log(`Environment: NODE_ENV=${process.env.NODE_ENV || '(unset)'}`);
  console.log('Documents to remove:');
  for (const { name } of USER_DEPENDENT_COLLECTIONS) {
    console.log(`  ${name}: ${before[name]}`);
  }
  console.log(`  User (non-admin): ${nonAdminUsers}`);
  console.log(`  User (admin, kept): ${adminUsers}`);

  // Safety: never proceed if there is no admin to keep.
  if (adminUsers === 0) {
    console.error('\nAborting: no admin user found. Create/restore an admin before cleaning,');
    console.error('otherwise you would delete every account and lock yourself out.');
    return 1;
  }

  if (nonAdminUsers === 0 && totalDependent === 0) {
    console.log(`\nNothing to clean. Admin account(s) unchanged (${adminUsers}).`);
    return 0;
  }

  if (dryRun) {
    console.log('\nDry run only — nothing was deleted (and no backup was written).');
    console.log('Run again with --confirm to back up and delete.');
    return 0;
  }

  if (!noBackup) {
    console.log('\nWriting backup before deleting...');
    const dir = await writeBackup();
    console.log(`Backup saved to: ${dir}`);
  } else {
    console.log('\n--no-backup set: skipping backup.');
  }

  for (const { name, model } of USER_DEPENDENT_COLLECTIONS) {
    const result = await model.deleteMany({});
    console.log(`Deleted ${result.deletedCount} from ${name}`);
  }

  const userResult = await User.deleteMany(NON_ADMIN_USER_FILTER);
  console.log(`Deleted ${userResult.deletedCount} non-admin User document(s)`);

  const adminCount = await User.countDocuments({ role: 'admin' });
  console.log(`\n✅ Cleanup complete. ${adminCount} admin account(s) preserved.`);
  return 0;
}

run()
  .then((code) => { process.exitCode = code; })
  .catch((err) => {
    console.error('User cleanup failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await mongoose.disconnect(); } catch { /* ignore */ }
  });
