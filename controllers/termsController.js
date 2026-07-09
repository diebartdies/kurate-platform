const jwt = require('jsonwebtoken');
const config = require('../config/appConfig');
const User = require('../models/User');
const TermsAcceptance = require('../models/TermsAcceptance');
const ActivityLog = require('../models/ActivityLog');
const { getClientIp } = require('../utils/clientIp');

// Best-effort, NON-blocking auth: returns the User id when a valid token is
// present (Bearer header or cookie), otherwise null. Unlike the `protect`
// middleware this never rejects the request, because the age-gate acceptance
// must also work for anonymous visitors.
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
    return decoded.id || null;
  } catch (_) {
    return null;
  }
}

function clientIpOf(req) {
  return req.headers['x-forwarded-for']
    ? req.headers['x-forwarded-for'].split(',')[0].trim()
    : (req.socket?.remoteAddress || req.ip);
}

// @desc    Record acceptance of the age-verification + Terms & Conditions.
//          Public: works for anonymous visitors (logged by clientId) and, when
//          a valid token is supplied, also stamps the User account so the gate
//          is shown only once per user for the current TERMS_VERSION.
// @route   POST /api/v1/terms/accept
// @access  Public (optional auth)
exports.acceptTerms = async (req, res) => {
  try {
    const { clientId, source } = req.body || {};
    // Always record the server's canonical version, never trust the client's.
    const termsVersion = config.terms.version;
    const acceptedSource = source === 'registration' ? 'registration' : 'age-gate';

    const userId = await resolveOptionalUser(req);

    await TermsAcceptance.create({
      clientId: clientId ? String(clientId).slice(0, 100) : undefined,
      user: userId || null,
      termsVersion,
      source: acceptedSource,
      ip: clientIpOf(req),
      userAgent: req.headers['user-agent'] ? String(req.headers['user-agent']).slice(0, 500) : undefined
    });

    if (acceptedSource === 'registration') {
      const user = userId ? await User.findById(userId).select('role email') : null;
      if (user?.role !== 'admin') {
        await ActivityLog.create({
          action: 'registration_terms_accepted',
          actorType: 'registration_visitor',
          isGuest: !userId,
          professional: userId || undefined,
          highlight: false,
          ipAddress: getClientIp(req),
          userAgent: req.headers['user-agent'] ? String(req.headers['user-agent']).slice(0, 500) : undefined,
          details: {
            source: acceptedSource,
            clientId: clientId ? String(clientId).slice(0, 100) : undefined,
            termsVersion
          }
        }).catch((err) => console.error('Failed to log registration terms acceptance:', err.message));
      }
    }

    // Stamp the account itself when authenticated so future visits can skip the
    // gate for this version without relying on the browser's localStorage.
    if (userId) {
      await User.findByIdAndUpdate(userId, {
        termsAcceptedAt: new Date(),
        termsVersion
      }).catch((err) => console.error('Failed to stamp terms on user:', err.message));
    }

    res.status(200).json({ success: true, data: { termsVersion } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
