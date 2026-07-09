const jwt = require('jsonwebtoken');
const config = require('../config/appConfig');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const { getClientIp } = require('../utils/clientIp');
const { isPrivateOrLocalIp } = require('../utils/adminKnownIps');

async function resolveOptionalUser(req) {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }
  if (!token || token === 'null' || token === 'undefined') return null;

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(decoded.id).select('role email');
    return user || null;
  } catch (_) {
    return null;
  }
}

function parseBool(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

// @desc    Track registration page visits and abandonments (non-admin only)
// @route   POST /api/v1/public/registration-track
// @access  Public
exports.trackRegistration = async (req, res) => {
  try {
    const user = await resolveOptionalUser(req);
    if (user?.role === 'admin') {
      return res.status(200).json({ success: true, skipped: true });
    }

    const { event, reason, hadFormData } = req.body || {};
    const clientIp = getClientIp(req);
    if (isPrivateOrLocalIp(clientIp) && event !== 'visit') {
      // Still allow local testing for visit events.
    }

    const formData = parseBool(hadFormData);
    const normalizedEvent = String(event || '').trim().toLowerCase();

    if (normalizedEvent === 'visit') {
      await ActivityLog.create({
        action: 'registration_visit',
        actorType: 'registration_visitor',
        isGuest: !user,
        professional: user?._id,
        highlight: false,
        ipAddress: clientIp,
        userAgent: req.headers['user-agent'] ? String(req.headers['user-agent']).slice(0, 500) : undefined,
        details: {
          event: 'visit',
          userId: user?._id,
          userEmail: user?.email
        }
      });
      return res.status(200).json({ success: true });
    }

    if (normalizedEvent === 'abandon') {
      await ActivityLog.create({
        action: 'registration_abandon',
        actorType: 'registration_visitor',
        isGuest: !user,
        professional: user?._id,
        highlight: false,
        ipAddress: clientIp,
        userAgent: req.headers['user-agent'] ? String(req.headers['user-agent']).slice(0, 500) : undefined,
        details: {
          event: 'abandon',
          reason: String(reason || 'unknown').slice(0, 80),
          hadFormData: formData,
          userId: user?._id,
          userEmail: user?.email
        }
      });
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ success: false, error: 'Invalid registration track event' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
