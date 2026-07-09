function normalizeIp(ip) {
  if (!ip || typeof ip !== 'string') return '';
  let value = ip.trim();
  if (value.startsWith('::ffff:')) value = value.slice(7);
  if (value === '::1') return '127.0.0.1';
  return value;
}

function getClientIp(req) {
  if (!req) return '';
  const forwarded = req.headers && req.headers['x-forwarded-for'];
  if (forwarded) {
    return normalizeIp(String(forwarded).split(',')[0]);
  }
  const socketIp = req.socket && req.socket.remoteAddress;
  return normalizeIp(socketIp || req.ip || '');
}

function isTrustedAdminIp(ip, trustedIps = []) {
  const normalized = normalizeIp(ip);
  if (!normalized || !Array.isArray(trustedIps) || trustedIps.length === 0) return false;
  return trustedIps.some((entry) => normalizeIp(entry) === normalized);
}

module.exports = {
  normalizeIp,
  getClientIp,
  isTrustedAdminIp
};
