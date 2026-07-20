const { isTrustedAdminIp } = require('./clientIp');
const { resolveAdminIpLabel } = require('./adminKnownIps');

const ACTOR_TYPES = ['admin', 'admin_ho', 'professional', 'guest', 'registration_visitor', 'unknown'];

function resolveActorType(log, trustedIps = []) {
  if (log.actorType && ACTOR_TYPES.includes(log.actorType)) {
    return log.actorType;
  }

  const action = log.action || '';
  const details = log.details || {};

  if (action.startsWith('registration_')) return 'registration_visitor';
  if (details.adminIpLabel === 'ho' || log.adminIpLabel === 'ho' || log.isAdminHomeIp) return 'admin_ho';
  if (action.startsWith('admin_') || log.professional?.role === 'admin') return 'admin';
  if (log.isGuest) {
    if (isTrustedAdminIp(log.ipAddress, trustedIps)) {
      return details.adminIpLabel === 'ho' ? 'admin_ho' : 'admin';
    }
    return 'guest';
  }
  if (log.professional?.role === 'professional' || ['login', 'register', 'phone_click', 'profile_view'].includes(action)) {
    return 'professional';
  }
  if (log.professional) return 'professional';
  return 'unknown';
}

function buildActorTypeQuery(actorType) {
  if (!actorType) return null;

  switch (actorType) {
    case 'admin_ho':
      return {
        $or: [
          { actorType: 'admin_ho' },
          { 'details.adminIpLabel': 'ho' },
          { action: 'admin_browsing', 'details.adminIpLabel': 'ho' }
        ]
      };
    case 'admin':
      return {
        $or: [
          { actorType: 'admin' },
          { action: { $regex: '^admin_', $options: 'i' } }
        ]
      };
    case 'professional':
      return {
        $or: [
          { actorType: 'professional' },
          { action: { $in: ['login', 'register', 'phone_click'] } },
          {
            isGuest: { $ne: true },
            professional: { $exists: true, $ne: null },
            action: { $not: { $regex: '^(admin_|registration_)', $options: 'i' } }
          }
        ]
      };
    case 'guest':
      return {
        isGuest: true,
        actorType: { $nin: ['admin', 'admin_ho', 'registration_visitor'] },
        action: { $not: { $regex: '^registration_', $options: 'i' } }
      };
    case 'registration_visitor':
      return {
        $or: [
          { actorType: 'registration_visitor' },
          { action: { $regex: '^registration_', $options: 'i' } }
        ]
      };
    case 'unknown':
      return { actorType: 'unknown' };
    default:
      return null;
  }
}

async function enrichActorType(log, trustedIps) {
  const ipLabel = log.details?.adminIpLabel || log.adminIpLabel || await resolveAdminIpLabel(log.ipAddress);
  const merged = { ...log, adminIpLabel: ipLabel || log.adminIpLabel };
  return resolveActorType(merged, trustedIps);
}

module.exports = {
  ACTOR_TYPES,
  resolveActorType,
  buildActorTypeQuery,
  enrichActorType
};
