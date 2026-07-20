/**
 * EasyDNS Dynamic DNS updater for kurate.drsrv.net.ar (and any host in .env).
 *
 * Reads EASYDNS_USERNAME / EASYDNS_TOKEN from .env.
 * Hostname defaults to kurate.drsrv.net.ar, override with EASYDNS_HOSTNAME or argv.
 *
 * Usage:
 *   node scripts/update-dyndns.js                 # uses EASYDNS_HOSTNAME or kurate.drsrv.net.ar
 *   node scripts/update-dyndns.js miotro.drsrv.net.ar
 *
 * Caches last IP in scripts/.lastip.json so we only hit EasyDNS when the IP changed.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const https = require('https');
const fs = require('fs');
const path = require('path');

const USERNAME = process.env.EASYDNS_USERNAME;
// EasyDNS generic DDNS requires the per-domain DYN token as the password,
// NOT the account login password. Use EASYDNS_TOKEN (falls back to EASYDNS_PASSWORD).
const TOKEN = process.env.EASYDNS_TOKEN || process.env.EASYDNS_PASSWORD;
const HOSTNAME = process.argv[2] || process.env.EASYDNS_HOSTNAME || 'kurate.drsrv.net.ar';
const CACHE_FILE = path.join(__dirname, '.dyndns-lastip.json');
const PUBLIC_IP_URLS = [
  'https://api.ipify.org',
  'https://ifconfig.me/ip',
  'https://icanhazip.com'
];

function getPublicIp() {
  return new Promise((resolve, reject) => {
    let i = 0;
    const tryNext = () => {
      if (i >= PUBLIC_IP_URLS.length) return reject(new Error('All public-IP providers failed'));
      const url = PUBLIC_IP_URLS[i++];
      https.get(url, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          const ip = data.trim().replace(/\n/g, '');
          if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) resolve(ip);
          else tryNext();
        });
      }).on('error', tryNext);
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
    }).on('error', reject);
  });
}

async function main() {
  if (!USERNAME || !TOKEN) {
    console.error('Missing EASYDNS_USERNAME / EASYDNS_TOKEN in .env');
    process.exit(1);
  }

  const cache = readCache();
  let publicIp;
  try {
    publicIp = await getPublicIp();
  } catch (e) {
    console.error('Failed to determine public IP:', e.message);
    process.exit(1);
  }

  if (cache[HOSTNAME] === publicIp) {
    console.log(`[${new Date().toISOString()}] ${HOSTNAME} already -> ${publicIp} (no change)`);
    return;
  }

  console.log(`[${new Date().toISOString()}] ${HOSTNAME}: ${cache[HOSTNAME] || 'unknown'} -> ${publicIp}`);
  const result = await updateEasyDns(HOSTNAME, publicIp);
  console.log(`EasyDNS responded: HTTP ${result.status} | ${result.body}`);

  // EasyDNS returns "NOERROR" / "OK" on success; "NOACCESS" / "BADPARAM" on failure.
  if (/NOERROR|OK|good|updated/i.test(result.body)) {
    cache[HOSTNAME] = publicIp;
    writeCache(cache);
    console.log('Updated.');
  } else {
    console.error('Update not confirmed by EasyDNS.');
    process.exit(2);
  }
}

main().catch((e) => { console.error('Error:', e.message); process.exit(1); });
