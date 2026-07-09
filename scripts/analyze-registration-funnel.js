#!/usr/bin/env node
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/database');
const ActivityLog = require('../models/ActivityLog');
const User = require('../models/User');
const { isPrivateOrLocalIp, loadKnownAdminIps } = require('../utils/adminKnownIps');
const { normalizeIp } = require('../utils/clientIp');
const config = require('../config/appConfig');

const DAYS = Math.max(1, parseInt(process.argv[2] || '14', 10));
const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);

/** IPs to drop from funnel stats (admin home, server, etc.) */
const EXTRA_EXCLUDED = (process.env.FUNNEL_EXCLUDE_IPS || '181.14.38.249')
  .split(',')
  .map((entry) => normalizeIp(entry.trim()))
  .filter(Boolean);

function dayKey(d) {
  return d.toISOString().slice(0, 10);
}

function isPublicIp(ip) {
  return ip && !isPrivateOrLocalIp(ip);
}

function buildExcludeSet(trustedAdminIps) {
  return new Set([
    ...trustedAdminIps.map(normalizeIp).filter(Boolean),
    normalizeIp(config.productionServerIp),
    ...EXTRA_EXCLUDED
  ]);
}

function isExcludedIp(ip, excludeSet) {
  const normalized = normalizeIp(ip);
  return normalized && excludeSet.has(normalized);
}

async function main() {
  await connectDB();

  const trustedAdminIps = await loadKnownAdminIps();
  const excludeIps = buildExcludeSet(trustedAdminIps);

  const regActionsRaw = await ActivityLog.find({
    action: { $regex: '^registration_', $options: 'i' },
    createdAt: { $gte: since }
  })
    .sort({ createdAt: -1 })
    .select('action ipAddress highlight details createdAt userAgent')
    .lean();

  let excludedEvents = 0;
  const regActions = regActionsRaw.filter((log) => {
    if (isExcludedIp(log.ipAddress, excludeIps)) {
      excludedEvents += 1;
      return false;
    }
    return true;
  });

  const byAction = {};
  const byDay = {};
  const publicVisitIps = new Set();
  const allVisitIps = new Set();
  const abandonReasons = {};
  let termsAcceptedCount = 0;
  let abandonWithTerms = 0;

  for (const log of regActions) {
    byAction[log.action] = (byAction[log.action] || 0) + 1;
    const dk = dayKey(new Date(log.createdAt));
    if (!byDay[dk]) byDay[dk] = { visit: 0, abandon: 0, terms: 0, other: 0 };
    if (log.action === 'registration_visit') {
      byDay[dk].visit += 1;
      if (log.ipAddress) {
        allVisitIps.add(log.ipAddress);
        if (isPublicIp(log.ipAddress)) publicVisitIps.add(log.ipAddress);
      }
    } else if (log.action === 'registration_abandon') {
      byDay[dk].abandon += 1;
      const reason = log.details?.reason || 'unknown';
      abandonReasons[reason] = (abandonReasons[reason] || 0) + 1;
      if (log.details?.termsAccepted || log.highlight) {
        abandonWithTerms += 1;
      }
    } else if (log.action === 'registration_terms_accepted') {
      byDay[dk].terms += 1;
      termsAcceptedCount += 1;
    } else {
      byDay[dk].other += 1;
    }
  }

  const newPros = await User.find({
    role: 'professional',
    createdAt: { $gte: since }
  })
    .sort({ createdAt: -1 })
    .select('email registrationMode isVerified verificationStatus createdAt professionalProfile.mobilePhone')
    .lean();

  const expressRegs = newPros.filter((u) => u.registrationMode === 'express');
  const verifiedRegs = newPros.filter((u) => u.isVerified);

  console.log(`=== REGISTRATION FUNNEL (last ${DAYS} days, since ${since.toISOString().slice(0, 10)}) ===`);
  console.log(`Excluded admin/test IPs: ${[...excludeIps].join(', ')}`);
  console.log(`Dropped ${excludedEvents} events from excluded IPs\n`);

  console.log('--- Event counts ---');
  Object.entries(byAction)
    .sort((a, b) => b[1] - a[1])
    .forEach(([action, count]) => console.log(`${action}: ${count}`));

  const visits = byAction.registration_visit || 0;
  const abandons = byAction.registration_abandon || 0;
  const terms = byAction.registration_terms_accepted || 0;

  console.log('\n--- Funnel summary ---');
  console.log(`registration_visit (page opens): ${visits}`);
  console.log(`unique IPs (all visits): ${allVisitIps.size}`);
  console.log(`unique PUBLIC IPs (visits): ${publicVisitIps.size}`);
  console.log(`registration_abandon: ${abandons}`);
  console.log(`  └ with terms checked: ${abandonWithTerms}`);
  console.log(`registration_terms_accepted: ${terms}`);
  console.log(`new professional accounts: ${newPros.length}`);
  console.log(`  └ express mode: ${expressRegs.length}`);
  console.log(`  └ email verified: ${verifiedRegs.length}`);

  if (visits > 0) {
    console.log(`visit → abandon rate: ${((abandons / visits) * 100).toFixed(1)}% (abandons/visits, can exceed 100% if same user revisits)`);
  }
  if (visits > 0 && expressRegs.length >= 0) {
    console.log(`visit → express signup rate: ${((expressRegs.length / visits) * 100).toFixed(2)}%`);
  }

  console.log('\n--- By day (visits / abandons / terms) ---');
  Object.keys(byDay).sort().forEach((dk) => {
    const row = byDay[dk];
    console.log(`${dk}  visit:${row.visit}  abandon:${row.abandon}  terms:${row.terms}`);
  });

  if (Object.keys(abandonReasons).length) {
    console.log('\n--- Abandon reasons ---');
    Object.entries(abandonReasons)
      .sort((a, b) => b[1] - a[1])
      .forEach(([reason, count]) => console.log(`${reason}: ${count}`));
  }

  console.log('\n--- Recent registration_visit (last 15, public IP only) ---');
  regActions
    .filter((l) => l.action === 'registration_visit' && isPublicIp(l.ipAddress))
    .slice(0, 15)
    .forEach((l, i) => {
      const ua = (l.userAgent || '').slice(0, 60);
      console.log(`${i + 1}|${l.createdAt.toISOString()}|${l.ipAddress}|${ua}`);
    });

  console.log('\n--- Recent express signups ---');
  expressRegs.slice(0, 10).forEach((u, i) => {
    const phone = u.professionalProfile?.mobilePhone || '—';
    console.log(`${i + 1}|${u.createdAt.toISOString()}|${u.email}|verified:${u.isVerified}|${phone}`);
  });

  if (expressRegs.length === 0 && visits > 0) {
    console.log('\n(none in period)');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
