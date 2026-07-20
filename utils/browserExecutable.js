const path = require('path');

function resolveBrowserExecutable() {
  const envPath = process.env.CHROMIUM_PATH;
  if (envPath) return envPath;
  // Docker image: chromium installed via apt
  const candidates = ['/usr/bin/chromium', '/usr/bin/chromium-browser'];
  for (const c of candidates) {
    try { if (require('fs').existsSync(c)) return c; } catch (_) {}
  }
  return undefined;
}

module.exports = {
  resolveBrowserExecutable
};
