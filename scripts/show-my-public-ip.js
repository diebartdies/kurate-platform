#!/usr/bin/env node
/**
 * Prints this machine's public IP (as seen from the internet).
 * Production (91.208.206.35) already defaults ADMIN_TRUSTED_IPS in appConfig when NODE_ENV=production.
 * Use this script for local dev or to add a second IP to ADMIN_TRUSTED_IPS.
 */
const https = require('https');

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve(body.trim()));
      })
      .on('error', reject);
  });
}

(async () => {
  try {
    const ip = await fetchText('https://api.ipify.org');
    console.log('Your public IP:', ip);
    console.log('');
    console.log('Add to .env on the server (and redeploy/restart app):');
    console.log(`ADMIN_TRUSTED_IPS=${ip}`);
  } catch (err) {
    console.error('Could not detect public IP:', err.message);
    console.error('Try manually: curl -s https://api.ipify.org');
    process.exit(1);
  }
})();
