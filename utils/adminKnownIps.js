const User = require('../models/User');
const config = require('../config/appConfig');
const { normalizeIp, isTrustedAdminIp } = require('./clientIp');

const CACHE_MS = 60 * 1000;
const MAX_IPS_PER_ADMIN = 10;
const HOME_LABEL = 'ho';

let cachedTrustedIps = null;
let cachedIpLabelMap = null;
let cacheExpiresAt = 0;

function isPrivateOrLocalIp(ip) {
  const value = normalizeIp(ip);
  if (!value) return true;
  if (value === '127.0.0.1' || value === 'localhost') return true;
  if (value.startsWith('10.') || value.startsWith('192.168.') || value.startsWith('169.254.')) return true;
  const parts = value.split('.').map(Number);
  if (parts.length === 4 && parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  return false;
}

function invalidateAdminIpCache() {
  cachedTrustedIps = null;
  cachedIpLabelMap = null;
  cacheExpiresAt = 0;
}

async function refreshAdminIpCache() {
  const admins = await User.find({ role: 'admin' }).select('adminSettings.knownIps');
  const ipLabelMap = new Map();
  const fromDb = [];

  admins.forEach((admin) => {
    (admin.adminSettings?.knownIps || []).forEach((entry) => {
      const ip = normalizeIp(entry?.ip);
      if (!ip) return;
      fromDb.push(ip);
      ipLabelMap.set(ip, entry.label || HOME_LABEL);
    });
  });

  cachedTrustedIps = [...new Set([...config.adminTrustedIps, ...fromDb])];
  cachedIpLabelMap = ipLabelMap;
  cacheExpiresAt = Date.now() + CACHE_MS;

  return { trustedIps: cachedTrustedIps, ipLabelMap: cachedIpLabelMap };
}

async function ensureAdminIpCache() {
  if (cachedTrustedIps && cachedIpLabelMap && Date.now() < cacheExpiresAt) {
    return { trustedIps: cachedTrustedIps, ipLabelMap: cachedIpLabelMap };
  }
  return refreshAdminIpCache();
}

async function loadKnownAdminIps() {
  const { trustedIps } = await ensureAdminIpCache();
  return trustedIps;
}

async function resolveAdminIpLabel(ip) {
  const normalized = normalizeIp(ip);
  if (!normalized) return null;
  const { ipLabelMap } = await ensureAdminIpCache();
  return ipLabelMap.get(normalized) || null;
}

async function isKnownAdminIp(ip) {
  const trustedIps = await loadKnownAdminIps();
  return isTrustedAdminIp(ip, trustedIps);
}

/**
 * Remember the admin's public IP on each login (label "ho" → Admin-ho in activity logs).
 */
async function recordAdminLoginIp(adminUser, clientIp) {
  const ip = normalizeIp(clientIp);
  if (!ip || isPrivateOrLocalIp(ip)) return null;

  const userId = adminUser._id || adminUser.id;
  const user = await User.findById(userId);
  if (!user || user.role !== 'admin') return null;

  user.adminSettings = user.adminSettings || {};
  let known = Array.isArray(user.adminSettings.knownIps) ? [...user.adminSettings.knownIps] : [];

  const existingIndex = known.findIndex((entry) => normalizeIp(entry?.ip) === ip);
  const record = { ip, label: HOME_LABEL, lastSeenAt: new Date() };

  if (existingIndex >= 0) {
    known[existingIndex] = { ...known[existingIndex], ...record };
  } else {
    known.unshift(record);
    known = known.slice(0, MAX_IPS_PER_ADMIN);
  }

  user.adminSettings.knownIps = known;
  user.markModified('adminSettings');
  await user.save();

  invalidateAdminIpCache();
  await refreshAdminIpCache();

  return ip;
}

module.exports = {
  HOME_LABEL,
  invalidateAdminIpCache,
  loadKnownAdminIps,
  resolveAdminIpLabel,
  isKnownAdminIp,
  recordAdminLoginIp,
  isPrivateOrLocalIp
};
