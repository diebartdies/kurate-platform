/**
 * EasyDNS Dynamic DNS updater for kurate.drsrv.net.ar (and any host in .env).
 *
 * Reads EASYDNS_USERNAME / EASYDNS_TOKEN from .env.
 *
 * Usage:
 *   node scripts/update-dyndns.js                       # detecta la IP publica
 *   node scripts/update-dyndns.js 181.11.221.35         # IP ya obtenida (cron + get-public-ip.sh)
 *   node scripts/update-dyndns.js --host=foo.drsrv.net.ar [--ip=1.2.3.4]
 *   EASYDNS_HOSTNAME=otro.drsrv.net.ar node scripts/update-dyndns.js
 *
 * Caches last IP in scripts/.dyndns-lastip.json so we only hit EasyDNS when the IP changed.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const https = require('https');
const fs = require('fs');
const path = require('path');

const USERNAME = process.env.EASYDNS_USERNAME;
// EasyDNS generic DDNS requires the per-domain DYN token as the password,
// NOT the account login password. Use EASYDNS_TOKEN (falls back to EASYDNS_PASSWORD).
const TOKEN = process.env.EASYDNS_TOKEN || process.env.EASYDNS_PASSWORD;

const CACHE_FILE = path.join(__dirname, '.dyndns-lastip.json');
const PUBLIC_IP_URLS = [
  'https://api.ipify.org',
  'https://ifconfig.me/ip',
  'https://icanhazip.com'
];
const IP_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

function isIp(value) {
  return typeof value === 'string' && IP_RE.test(value.trim());
}

/** Parsea argv: acepta IP suelta, hostname suelto, o flags --ip= / --host=. */
function parseArgs(argv) {
  const out = { host: process.env.EASYDNS_HOSTNAME || 'kurate.drsrv.net.ar', ip: null };
  const positional = [];
  for (const raw of argv) {
    if (raw.startsWith('--ip=')) out.ip = raw.slice(5);
    else if (raw.startsWith('--host=')) out.host = raw.slice(7);
    else positional.push(raw);
  }
  for (const value of positional) {
    // Compat: un argumento que sea IP es la IP; si no, es el hostname.
    if (isIp(value)) out.ip = value;
    else if (value) out.host = value;
  }
  return out;
}

function getPublicIp() {
  return new Promise((resolve, reject) => {
    let i = 0;
    const tryNext = () => {
      if (i >= PUBLIC_IP_URLS.length) return reject(new Error('All public-IP providers failed'));
      const url = PUBLIC_IP_URLS[i++];
      https.get(url, { timeout: 8000 }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          const ip = data.trim().replace(/\n/g, '');
          if (isIp(ip)) resolve(ip);
          else tryNext();
        });
      }).on('error', tryNext).on('timeout', function () { this.destroy(); tryNext(); });
    };
    tryNext();
  });
}

function readCache() {
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); }
  catch { return {}; }
}

function writeCache(obj) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2));
}

function updateEasyDns(host, ip) {
  return new Promise((resolve, reject) => {
    const q = `hostname=${encodeURIComponent(host)}&myip=${encodeURIComponent(ip)}`;
    // EasyDNS api.cp.easydns.com requires credentials via HTTP Basic Auth
    // (URL userinfo), with the DYN token as the password.
    const auth = Buffer.from(`${USERNAME}:${TOKEN}`).toString('base64');
    const url = `https://api.cp.easydns.com/dyn/generic.php?${q}`;
    const opts = {
      timeout: 15000,
      headers: {
        'Authorization': `Basic ${auth}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) EasyDNS-Updater/1.0',
        'Accept': '*/*'
      }
    };
    https.get(url, opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data.trim() }));
    }).on('error', reject).on('timeout', function () {
      this.destroy(new Error('EasyDNS request timed out'));
    });
  });
}

async function main() {
  if (!USERNAME || !TOKEN) {
    console.error('Missing EASYDNS_USERNAME / EASYDNS_TOKEN in .env');
    process.exit(1);
  }

  const { host, ip: ipArg } = parseArgs(process.argv.slice(2));

  // La IP puede venir del cron (get-public-ip.sh) para no depender de la
  // deteccion externa; si no viene, se detecta aca.
  const publicIp = isIp(ipArg) ? ipArg.trim() : await getPublicIp();
  if (!isIp(publicIp)) {
    console.error(`Invalid public IP: ${JSON.stringify(publicIp)}`);
    process.exit(1);
  }

  const cache = readCache();
  const previous = cache[host];

  if (previous === publicIp) {
    console.log(`[${new Date().toISOString()}] ${host} already -> ${publicIp} (no change)`);
    return;
  }

  console.log(`[${new Date().toISOString()}] ${host}: ${previous || 'unknown'} -> ${publicIp}`);
  const result = await updateEasyDns(host, publicIp);
  console.log(`EasyDNS responded: HTTP ${result.status} | ${result.body}`);

  // EasyDNS returns "NOERROR" / "OK" on success; "NOACCESS" / "BADPARAM" on failure.
  if (/NOERROR|OK|good|updated/i.test(result.body)) {
    cache[host] = publicIp;
    writeCache(cache);
    console.log('Updated.');
    return;
  }

  // TOO_FREQ: EasyDNS exige >= 600s entre updates del mismo hostname. No es un
  // fallo real (el registro suele estar ya con la IP correcta); el proximo run
  // del cron (cada 15 min) reintenta. No se cachea para no saltear el update.
  if (/TOO_FREQ/i.test(result.body)) {
    console.warn(`Deferred: EasyDNS rate limit (600s). Will retry on next run.`);
    return;
  }

  console.error('Update not confirmed by EasyDNS.');
  process.exit(2);
}

main().catch((e) => { console.error('Error:', e.message); process.exit(1); });
