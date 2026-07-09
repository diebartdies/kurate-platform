#!/usr/bin/env node
/**
 * Enrich one or more public IPs and store in PublicIpIntel (MongoDB).
 *
 * Usage:
 *   node scripts/enrich-ip.js 8.8.8.8
 *   node scripts/enrich-ip.js --backfill          # all distinct IPs from ActivityLog
 *   node scripts/enrich-ip.js --backfill --force  # refresh even if cached
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/database');
const ActivityLog = require('../models/ActivityLog');
const { enrichAndStoreIp, formatIpIntelSummary } = require('../services/ipIntelService');

const args = process.argv.slice(2);
const backfill = args.includes('--backfill');
const force = args.includes('--force');
const ips = args.filter((a) => !a.startsWith('--'));

async function printIntel(row) {
  if (!row) {
    console.log('  (skipped — private or invalid IP)');
    return;
  }
  console.log(`  status: ${row.status}`);
  if (row.status === 'success') {
    console.log(`  summary: ${formatIpIntelSummary(row)}`);
    console.log(`  isp/org: ${row.isp || '—'} / ${row.org || '—'}`);
    console.log(`  asn: ${row.as || '—'} (${row.asname || '—'})`);
    console.log(`  coords: ${row.lat ?? '—'}, ${row.lon ?? '—'}`);
    console.log(`  flags: mobile=${row.mobile} proxy=${row.proxy} hosting=${row.hosting}`);
    console.log(`  reverse: ${row.reverse || '—'}`);
    console.log(`  timezone: ${row.timezone || '—'} (UTC${row.offset != null ? row.offset / 3600 : '?'})`);
    console.log(`  last lookup: ${row.lastLookupAt}`);
  } else {
    console.log(`  error: ${row.lookupError || 'unknown'}`);
  }
}

async function main() {
  await connectDB();

  let targets = ips;
  if (backfill) {
    targets = await ActivityLog.distinct('ipAddress', { ipAddress: { $exists: true, $nin: [null, ''] } });
    console.log(`Backfill: ${targets.length} distinct IPs from ActivityLog`);
  }

  if (!targets.length) {
    console.error('Usage: node scripts/enrich-ip.js <ip> [ip2...] | --backfill [--force]');
    process.exit(1);
  }

  for (const ip of targets) {
    console.log(`\n=== ${ip} ===`);
    const row = await enrichAndStoreIp(ip, { force });
    await printIntel(row);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
