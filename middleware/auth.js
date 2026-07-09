const jwt = require('jsonwebtoken');
const User = require('../models/User');
const config = require('../config/appConfig');

function readBearerToken(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer')) return null;
  const token = header.split(' ')[1];
  if (!token || token === 'null' || token === 'undefined') return null;
  return token;
}

async function authenticateToken(token) {
  const decoded = jwt.verify(token, config.jwtSecret);
  const user = await User.findById(decoded.id);
  if (!user) return null;
  return user;
}

// Protect routes — try Bearer first, then httpOnly cookie if Bearer is missing or invalid.
exports.protect = async (req, res, next) => {
  const candidates = [];
  const bearer = readBearerToken(req);
  const cookieToken = req.cookies.token;

  if (bearer) candidates.push(bearer);
  if (cookieToken && cookieToken !== bearer) candidates.push(cookieToken);

  if (!candidates.length) {
    return res.status(401).json({
      success: false,
      error: 'Not authorized to access this route'
    });
  }

  for (const token of candidates) {
    try {
      const user = await authenticateToken(token);
      if (user) {
        if (user.accountDeletedAt && user.role !== 'admin') {
          return res.status(401).json({
            success: false,
            error: 'This account has been deleted.'
          });
        }
        req.user = user;
        return next();
      }
    } catch {
      // Try the next credential source (e.g. expired localStorage JWT + valid cookie).
    }
  }

  return res.status(401).json({
    success: false,
    error: 'Not authorized to access this route'
  });
};

// Grant access to specific roles
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Not authorized to access this route'
      });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `User role ${req.user.role} is not authorized to access this route`
      });
    }
    next();
  };
};
