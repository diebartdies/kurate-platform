#!/usr/bin/env node
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/database');
const ActivityLog = require('../models/ActivityLog');

async function main() {
  await connectDB();
  const total = await ActivityLog.countDocuments({ action: /^registration_/ });
  const byAction = await ActivityLog.aggregate([
    { $match: { action: /^registration_/ } },
    { $group: { _id: '$action', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);
  const byIp = await ActivityLog.aggregate([
    { $match: { action: /^registration_/ } },
    { $group: { _id: '$ipAddress', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 20 }
  ]);
  const recent = await ActivityLog.find({ action: /^registration_/ })
    .sort({ createdAt: -1 })
    .limit(30)
    .select('action ipAddress createdAt details')
    .lean();

  console.log('total_registration_logs:', total);
  console.log('\nby_action:');
  byAction.forEach((r) => console.log(`  ${r._id}: ${r.count}`));
  console.log('\nby_ip:');
  byIp.forEach((r) => console.log(`  ${r._id || '(none)'}: ${r.count}`));
  console.log('\nrecent:');
  recent.forEach((l, i) => {
    console.log(`${i + 1}|${l.action}|${l.ipAddress || '—'}|${l.createdAt.toISOString()}`);
  });
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
