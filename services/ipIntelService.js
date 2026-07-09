const http = require('http');
const PublicIpIntel = require('../models/PublicIpIntel');
const { normalizeIp } = require('../utils/clientIp');

const PROVIDER = 'ip-api.com';
const REFRESH_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_INTERVAL_MS = 1400;

const API_FIELDS = [
  'status', 'message', 'continent', 'continentCode', 'country', 'countryCode',
  'region', 'regionName', 'city', 'district', 'zip', 'lat', 'lon', 'timezone',
  'offset', 'currency', 'isp', 'org', 'as', 'asname', 'reverse', 'mobile',
  'proxy', 'hosting', 'query'
].join(',');

const pending = new Set();
let processing = false;
let lastRequestAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPublicEnrichableIp(ip) {
  const value = normalizeIp(ip);
  if (!value) return false;
  if (value.includes(':')) {
    if (value === '::1' || value.startsWith('fe80:') || value.startsWith('fc') || value.startsWith('fd')) {
      return false;
    }
    return true;
  }
  const parts = value.split('.').map((n) => parseInt(n, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
  if (parts[0] === 10) return false;
  if (parts[0] === 127) return false;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
  if (parts[0] === 192 && parts[1] === 168) return false;
  if (parts[0] === 169 && parts[1] === 254) return false;
  return true;
}

function fetchIpApiJson(ip) {
  const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=${API_FIELDS}`;

  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 12000 }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (res.statusCode !== 200) {
            reject(new Error(body.message || `HTTP ${res.statusCode}`));
            return;
          }
          resolve(body);
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('ip-api lookup timed out'));
    });
    req.on('error', reject);
  });
}

function mapApiToDoc(ip, payload) {
  const base = {
    ip,
    status: payload.status || 'fail',
    lookupError: payload.status === 'success' ? undefined : (payload.message || 'lookup failed'),
    continent: payload.continent,
    continentCode: payload.continentCode,
    country: payload.country,
    countryCode: payload.countryCode,
    region: payload.region,
    regionName: payload.regionName,
    city: payload.city,
    district: payload.district,
    zip: payload.zip,
    lat: typeof payload.lat === 'number' ? payload.lat : undefined,
    lon: typeof payload.lon === 'number' ? payload.lon : undefined,
    timezone: payload.timezone,
    offset: typeof payload.offset === 'number' ? payload.offset : undefined,
    currency: payload.currency,
    isp: payload.isp,
    org: payload.org,
    as: payload.as,
    asname: payload.asname,
    reverse: payload.reverse,
    mobile: payload.mobile === true,
    proxy: payload.proxy === true,
    hosting: payload.hosting === true,
    provider: PROVIDER,
    raw: payload,
    lastLookupAt: new Date()
  };
  return base;
}

async function enrichAndStoreIp(ip, { force = false } = {}) {
  const normalized = normalizeIp(ip);
  if (!isPublicEnrichableIp(normalized)) {
    return null;
  }

  const existing = await PublicIpIntel.findOne({ ip: normalized }).lean();
  if (existing && !force) {
    const age = Date.now() - new Date(existing.lastLookupAt).getTime();
    if (age < REFRESH_MS && existing.status === 'success') {
      return existing;
    }
  }

  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < MIN_INTERVAL_MS) {
    await sleep(MIN_INTERVAL_MS - elapsed);
  }
  lastRequestAt = Date.now();

  let payload;
  try {
    payload = await fetchIpApiJson(normalized);
  } catch (err) {
    const failDoc = {
      ip: normalized,
      status: 'fail',
      lookupError: err.message,
      provider: PROVIDER,
      lastLookupAt: new Date(),
      lookupCount: (existing?.lookupCount || 0) + 1
    };
    await PublicIpIntel.findOneAndUpdate(
      { ip: normalized },
      { $set: failDoc, $setOnInsert: { firstSeenAt: new Date() } },
      { upsert: true, new: true }
    );
    return failDoc;
  }

  const doc = mapApiToDoc(normalized, payload);
  doc.lookupCount = (existing?.lookupCount || 0) + 1;

  const saved = await PublicIpIntel.findOneAndUpdate(
    { ip: normalized },
    {
      $set: doc,
      $setOnInsert: { firstSeenAt: new Date() }
    },
    { upsert: true, new: true }
  ).lean();

  return saved;
}

function scheduleIpEnrichment(ip) {
  const normalized = normalizeIp(ip);
  if (!isPublicEnrichableIp(normalized)) return;
  pending.add(normalized);
  setImmediate(() => drainQueue().catch((err) => {
    console.error('[ipIntel] queue error:', err.message);
  }));
}

async function drainQueue() {
  if (processing) return;
  processing = true;
  try {
    while (pending.size > 0) {
      const ip = pending.values().next().value;
      pending.delete(ip);
      try {
        await enrichAndStoreIp(ip);
      } catch (err) {
        console.error('[ipIntel] enrich failed for', ip, err.message);
      }
    }
  } finally {
    processing = false;
    if (pending.size > 0) {
      setImmediate(() => drainQueue().catch(() => {}));
    }
  }
}

async function getIpIntelMap(ips) {
  const unique = [...new Set(ips.map(normalizeIp).filter(isPublicEnrichableIp))];
  if (!unique.length) return new Map();

  const rows = await PublicIpIntel.find({ ip: { $in: unique } }).lean();
  const map = new Map(rows.map((row) => [row.ip, row]));

  for (const ip of unique) {
    const row = map.get(ip);
    const stale = !row || (Date.now() - new Date(row.lastLookupAt).getTime() >= REFRESH_MS);
    if (!row || stale) {
      scheduleIpEnrichment(ip);
    }
  }

  return map;
}

async function attachIpIntelBatch(logs) {
  const ips = logs.map((log) => log.ipAddress).filter(Boolean);
  const intelMap = await getIpIntelMap(ips);

  return logs.map((log) => {
    const ip = normalizeIp(log.ipAddress);
    const ipIntel = intelMap.get(ip);
    if (!ipIntel) return log;
    return { ...log, ipIntel };
  });
}

function formatIpIntelSummary(intel) {
  if (!intel) return '';
  if (intel.status !== 'success') {
    return intel.lookupError || 'Lookup failed';
  }
  const parts = [
    [intel.city, intel.regionName, intel.country].filter(Boolean).join(', '),
    intel.isp || intel.org,
    intel.asname || intel.as,
    (intel.lat != null && intel.lon != null) ? `${intel.lat}, ${intel.lon}` : ''
  ].filter(Boolean);
  return parts.join(' · ');
}

module.exports = {
  isPublicEnrichableIp,
  enrichAndStoreIp,
  scheduleIpEnrichment,
  getIpIntelMap,
  attachIpIntelBatch,
  formatIpIntelSummary,
  REFRESH_MS
};
