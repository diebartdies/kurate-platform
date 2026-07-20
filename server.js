const express = require('express');
const dotenv = require('dotenv');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const config = require('./config/appConfig');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const os = require('os');
const connectDB = require('./config/database');
const User = require('./models/User');
const { calculateMonthlyInvoiceAmount } = require('./utils/categoryBilling');
const ActivityLog = require('./models/ActivityLog');
const { getClientIp } = require('./utils/clientIp');
const { isKnownAdminIp, resolveAdminIpLabel } = require('./utils/adminKnownIps');
const sendEmail = require('./sendEmail');
const { resolveWhatsappNumber } = require('./utils/contactNumber');
const smsNotifications = require('./services/smsNotifications');

// Connect to database
connectDB();

const { refreshLocationRegistry } = require('./utils/seoLocations');

function scheduleSeoLocationRefresh() {
  const run = () => {
    refreshLocationRegistry()
      .then((registry) => {
        console.log(`[SEO] Location registry refreshed: ${registry.totalPages} pages`);
      })
      .catch((error) => {
        console.error('[SEO] Location registry refresh failed:', error.message);
      });
  };

  setTimeout(run, 10 * 1000);
  setInterval(run, 24 * 60 * 60 * 1000);
}

scheduleSeoLocationRefresh();

const app = express();

// Trust proxy for Nginx
app.set('trust proxy', 1);

// Body parser
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Cookie parser
app.use(cookieParser());

// Set security headers
app.use(helmet({
  // Disable CSP for the prototype so external Unsplash images 
  // and inline frontend scripts/styles are allowed to load
  contentSecurityPolicy: false,
  // Avoid console noise on HTTP / non-localhost dev origins
  crossOriginOpenerPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
  originAgentCluster: false
}));

// Strip COOP on plain HTTP (non-localhost) — browser ignores it and logs a warning
app.use((req, res, next) => {
  if (req.secure || req.hostname === 'localhost') return next();
  const setHeader = res.setHeader.bind(res);
  res.setHeader = (name, value) => {
    if (String(name).toLowerCase() === 'cross-origin-opener-policy') return;
    return setHeader(name, value);
  };
  next();
});

// Enable CORS
app.use(cors({
  origin: [
    'http://localhost:5000',
    'http://127.0.0.1:5000',
    'http://192.168.1.8:5000' // Allow access from local network IP for testing
  ],
  credentials: true
}));

// Rate limiting — segmented so heavy public browsing of the vault never trips
// the strict cap that protects auth/mutations/admin.
// Strict limiter: auth (login/register/verify/recover), all mutations and admin.
const strictLimiter = rateLimit({
  windowMs: config.rateLimitWindow,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    res.status(options.statusCode).json({
      success: false,
      error: 'Too many requests — wait a moment and try again.'
    });
  }
});
// Admin limiter: panel polls outreach/WhatsApp status every few seconds.
const adminLimiter = rateLimit({
  windowMs: config.adminRateLimitWindow,
  max: config.adminRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    res.status(options.statusCode).json({
      success: false,
      error: 'Too many admin requests — wait a moment and try again.'
    });
  }
});
// Generous limiter: high-volume public discovery/vault reads.
const readLimiter = rateLimit({
  windowMs: config.readRateLimitWindow,
  max: config.readRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false
});

// True for the high-volume public discovery traffic that the vault grid fans
// out (listing, profile detail, reviews, specialties, locations, public status)
// plus the silent photo-click tracking. Everything else on /api stays strict.
function isHighVolumePublicRead(req) {
  const p = req.path;
  if (req.method === 'GET') {
    return (
      p.startsWith('/api/v1/professionals') ||
      p.startsWith('/api/v1/specialties') ||
      p.startsWith('/api/v1/locations') ||
      p.startsWith('/api/v1/public')
    );
  }
  if (req.method === 'POST' && /^\/api\/v1\/professionals\/[^/]+\/track-photo-click\/?$/.test(p)) {
    return true;
  }
  return false;
}

function isTwilioWebhook(req) {
  return req.method === 'POST' && req.path === '/api/v1/webhooks/twilio/whatsapp';
}

function isHealthCheck(req) {
  return req.method === 'GET' && req.path === '/api/v1/health';
}

function isAdminApi(req) {
  return req.path.startsWith('/api/v1/admin');
}

app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) return next();
  if (isTwilioWebhook(req) || isHealthCheck(req)) return next();
  if (isAdminApi(req)) return adminLimiter(req, res, next);
  return isHighVolumePublicRead(req)
    ? readLimiter(req, res, next)
    : strictLimiter(req, res, next);
});

// SEO routes (must be registered before static files)
const seoController = require('./controllers/seoController');
app.get('/robots.txt', seoController.robotsTxt);
app.get('/sitemap.xml', seoController.sitemapXml);
app.get('/sitemap-KuraTe.xml', seoController.sitemapKuraTeXml);
app.get('/sitemap-KuraTe.xml', seoController.sitemapKuraTeXml);
app.get('/acompanantes/:provinceSlug/:areaSlug', seoController.renderLocationPage);
app.get('/acompanantes/:provinceSlug', seoController.renderLocationPage);
app.get('/perfil/:alias', seoController.renderProfilePage);

// Favicon (browsers request /favicon.ico by default)
app.get('/favicon.ico', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=2592000');
  res.type('image/svg+xml');
  res.sendFile(path.join(__dirname, 'public', 'favicon.svg'));
});

// Set static folder
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.match(/\.(jpg|jpeg|png|gif|webp|svg|css)$/i)) {
      res.setHeader('Cache-Control', 'public, max-age=2592000'); // Cache images & CSS for 30 days
    } else {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    }
  }
}));

// --- Multer File Upload Configuration ---
const uploadsDir = path.join(__dirname, 'public', 'uploads', 'photos');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fieldSize: 100 * 1024 * 1024 } // 100MB limit to safely accept large Base64 arrays in req.body
});


// --- Global Guest Activity Tracker ---
// This logs every search and profile view made by non-logged-in users so you can data-mine their preferences
app.use((req, res, next) => {
  if (!(req.path.startsWith('/api/v1/') && req.method === 'GET')) {
    return next();
  }
  if (req.headers.authorization || req.cookies.token) {
    return next();
  }

  (async () => {
    try {
      const clientIp = getClientIp(req);
      const trustedAdmin = await isKnownAdminIp(clientIp);
      const adminIpLabel = trustedAdmin ? await resolveAdminIpLabel(clientIp) : null;
      const actorType = adminIpLabel === 'ho' ? 'admin_ho' : (trustedAdmin ? 'admin' : 'guest');

      ActivityLog.create({
        action: trustedAdmin ? 'admin_browsing' : 'guest_browsing',
        actorType,
        isGuest: !trustedAdmin,
        details: {
          path: req.path,
          query: req.query,
          adminIpLabel: adminIpLabel || undefined,
          trustedAdminIp: trustedAdmin || undefined
        },
        ipAddress: clientIp,
        userAgent: req.headers['user-agent']
      }).catch(err => console.error('Failed to log guest activity:', err.message));
    } catch (err) {
      console.error('Failed to evaluate admin IP for activity log:', err.message);
    }
    next();
  })();
});

// Mount routers
const authController = require('./controllers/authController');
const adminController = require('./controllers/adminController');
const professionalController = require('./controllers/professionalController');
const feedbackController = require('./controllers/feedbackController');
const locationController = require('./controllers/locationController');
const transactionController = require('./controllers/transactionController');
const potentialProfessionalController = require('./controllers/potentialProfessionalController');
const outreachController = require('./controllers/outreachController');
const paymentController = require('./controllers/paymentController');
const specialtyController = require('./controllers/specialtyController');
const { protect, authorize } = require('./middleware/auth');

app.post('/api/v1/auth/register', upload.array('verificationDocuments', 3), authController.register);
app.post('/api/v1/auth/verify-email', authController.verifyEmail);
app.post('/api/v1/auth/resend-verification', authController.resendVerificationCode);
app.post('/api/v1/auth/login', authController.login);
app.post('/api/v1/auth/google', authController.googleAuth);
app.post('/api/v1/auth/google/complete-profile', protect, authController.completeGoogleProfile);
app.get('/api/v1/auth/check-email', authController.checkEmailRegistered);
app.post('/api/v1/auth/logout', authController.logout);
app.post('/api/v1/auth/guest-login', authController.guestLogin);
app.post('/api/v1/auth/forgotpassword', authController.forgotPassword);
app.put('/api/v1/auth/resetpassword', authController.resetPassword);

// Feedback Routes
app.post('/api/v1/feedback/request', feedbackController.requestFeedback);
app.post('/api/v1/feedback/submit', feedbackController.submitFeedback);
app.get('/api/v1/feedback/rating/:professionalId', feedbackController.getProfessionalRating);

// Location Routes (Public)
app.get('/api/v1/locations/provinces', locationController.getProvinces);
app.get('/api/v1/locations/provinces/name/:provinceName/cities', locationController.getCitiesByProvinceName);
app.get('/api/v1/locations/provinces/:provinceId/sublocations', locationController.getSublocations);

app.get('/api/v1/public/category-pricing', async (req, res) => {
  try {
    const adminUser = await User.findOne({ role: 'admin' });
    const pricing = adminUser?.adminSettings?.pricing || {
      verificados: 50000, Premium: 40000, Gold: 30000, Silver: 20000, Standard: 15000
    };
    res.status(200).json({ success: true, data: pricing });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/v1/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'UP',
    env: config.env,
    time: new Date().toISOString()
  });
});

// Professional Dashboard Routes (Private) - Must be declared before /:alias
app.get('/api/v1/professionals/me', protect, authorize('professional', 'admin'), async (req, res, next) => {
    try {
        const userId = req.user.id || req.user._id;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, error: 'Professional not found' });

        const { resolvePhotosForClient } = require('./utils/photoUtils');
        const userObj = user.toObject();
        if (userObj.professionalProfile && userObj.professionalProfile.photos) {
            userObj.professionalProfile.photos = resolvePhotosForClient(userObj.professionalProfile.photos);
        }
        
        const adminUser = await User.findOne({ role: 'admin' });
        const globalPricing = adminUser?.adminSettings?.pricing || { verificados: 50000, Premium: 40000, Gold: 30000, Silver: 20000, Standard: 15000 };
        const isReadyForTransactions = user.professionalProfile?.rateChangeAcknowledged !== false;

        let photoCount = 0;
        let whatsappcCount = 0;
        let callCount = 0;
        try {
            const Statistic = require('./models/Statistic');
            const statsAgg = await Statistic.aggregate([
                { $match: { professionalId: user._id } },
                { $group: {
                    _id: null,
                    photoCount: { $sum: "$photoCount" },
                    whatsappcCount: { $sum: "$whatsappcCount" },
                    callCount: { $sum: "$callCount" }
                }}
            ]);
            if (statsAgg.length > 0) {
                photoCount = statsAgg[0].photoCount || 0;
                whatsappcCount = statsAgg[0].whatsappcCount || 0;
                callCount = statsAgg[0].callCount || 0;
            }
        } catch (e) { console.error(e); }

        res.status(200).json({
            success: true,
            data: userObj,
            stats: { photoCount, whatsappcCount, callCount },
            globalPricing,
            isReadyForTransactions
        });
    } catch (err) { next(err); }
});
app.put('/api/v1/professionals/updateprofile', protect, authorize('professional'), upload.array('photos', 10), professionalController.updateProfile);
// Service Tree Routes (Hogar)
app.get('/api/v1/service-tree', professionalController.getServiceTree);
app.put('/api/v1/professionals/hogar/services', protect, authorize('professional'), professionalController.updateHogarServices);
app.get('/api/v1/hogar/professionals', professionalController.getHogarProfessionals);
app.get('/api/v1/hogar/professionals/:id', professionalController.getHogarProfessionalById);
app.delete('/api/v1/professionals/me', protect, authorize('professional'), professionalController.deleteMyProfile);
app.post('/api/v1/professionals/resubmit-verification', protect, authorize('professional'), upload.array('verificationDocuments', 3), professionalController.resubmitVerification);
app.put('/api/v1/professionals/acknowledge-rate', protect, authorize('professional'), professionalController.acknowledgeRateChange);
app.post('/api/v1/professionals/acknowledge-first-login', protect, authorize('professional'), professionalController.acknowledgeFirstLogin);
app.post('/api/v1/professionals/upload-receipt', protect, authorize('professional'), upload.single('receipt'), paymentController.uploadReceipt);
app.post('/api/v1/professionals/send-phone-code', protect, authorize('professional'), professionalController.sendPhoneCode);
app.post('/api/v1/professionals/verify-phone-code', protect, authorize('professional'), professionalController.verifyPhoneCode);
app.get('/api/v1/professionals/phone-code-status', protect, authorize('professional'), professionalController.getPhoneCodeStatus);

// Professional Public Routes
app.get('/api/v1/professionals', professionalController.getProfessionals);
app.get('/api/v1/professionals/search', professionalController.searchProfessionals);
app.get('/api/v1/professionals/specialties', professionalController.getSpecialties);
app.get('/api/v1/professionals/:alias', professionalController.getProfessionalByAlias);
app.get('/api/v1/specialties/users', specialtyController.getUsersBySpecialty);
app.post('/api/v1/professionals/:alias/track-photo-click', professionalController.trackDashboardPhotoClick);
app.get('/api/v1/professionals/:alias/whatsapp', professionalController.contactWhatsApp);
app.get('/api/v1/professionals/:alias/phone', professionalController.contactPhone);

// Review Routes
const reviewsController = require('./controllers/reviewsController');
app.get('/api/v1/professionals/:professionalId/reviews', reviewsController.getReviews);
app.post('/api/v1/professionals/:professionalId/reviews', protect, reviewsController.addReview);

// Admin routes
app.get('/api/v1/admin/verifications/pending', protect, authorize('admin'), adminController.getPendingVerifications);
app.put('/api/v1/admin/verifications/:id', protect, authorize('admin'), adminController.verifyProfessional);
app.get('/api/v1/admin/payments/pending', protect, authorize('admin'), adminController.getPendingPayments);
app.put('/api/v1/admin/payments/:id/acknowledge', protect, authorize('admin'), adminController.acknowledgePayment);
app.post('/api/v1/admin/notify-rate-change', protect, authorize('admin'), professionalController.notifyRateChange);
app.get('/api/v1/admin/logs/filters', protect, authorize('admin'), adminController.getActivityLogFilters);
app.get('/api/v1/admin/logs', protect, authorize('admin'), adminController.getActivityLogs);
app.put('/api/v1/admin/professionals/:id', protect, authorize('admin'), adminController.updateProfessionalProfile);
app.delete('/api/v1/admin/professionals/:id', protect, authorize('admin'), adminController.deleteProfessional);
app.get('/api/v1/admin/professionals', protect, authorize('admin'), adminController.getAllProfessionals);
app.get('/api/v1/admin/professionals/:id', protect, authorize('admin'), adminController.getProfessionalById);
app.get('/api/v1/admin/outreach/invite-message', protect, authorize('admin'), potentialProfessionalController.getInviteMessage);
app.post('/api/v1/admin/outreach/bulk-whatsapp', protect, authorize('admin'), outreachController.startBulkWhatsApp);
app.post('/api/v1/admin/outreach/whatsapp/targeted', protect, authorize('admin'), outreachController.startTargetedWhatsApp);
app.get('/api/v1/admin/outreach/bulk-whatsapp/status', protect, authorize('admin'), outreachController.getBulkWhatsAppStatus);
app.post('/api/v1/admin/outreach/bulk-sms', protect, authorize('admin'), outreachController.startBulkSms);
app.post('/api/v1/admin/outreach/sms/targeted', protect, authorize('admin'), outreachController.startTargetedSms);
app.get('/api/v1/admin/outreach/bulk-sms/status', protect, authorize('admin'), outreachController.getBulkSmsStatus);
app.get('/api/v1/admin/potential-professionals', protect, authorize('admin'), potentialProfessionalController.getPotentialProfessionals);
app.put('/api/v1/admin/potential-professionals/:id', protect, authorize('admin'), potentialProfessionalController.updatePotentialProfessional);
app.post('/api/v1/admin/potential-professionals/block-phone', protect, authorize('admin'), potentialProfessionalController.blockPhone);
app.post('/api/v1/admin/notifications/mail/broadcast', protect, authorize('admin'), adminController.sendBroadcastEmail);
app.post('/api/v1/admin/notifications/mail/targeted', protect, authorize('admin'), adminController.sendTargetedEmail);

const whatsappController = require('./controllers/whatsappController');
const twilioWebhookController = require('./controllers/twilioWebhookController');
const launchCurtainController = require('./controllers/launchCurtainController');
const supportController = require('./controllers/supportController');
const preRegistrationController = require('./controllers/preRegistrationController');
const interestNoteController = require('./controllers/interestNoteController');

app.get('/api/v1/public/launch-curtain', launchCurtainController.getPublicLaunchCurtainStatus);
app.get('/api/v1/public/interest-note-headlines', interestNoteController.listPublicHeadlines);

app.get('/api/v1/public/client-config', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      googleClientId: config.google?.clientId || process.env.GOOGLE_CLIENT_ID || ''
    }
  });
});

// Terms acceptance deferred — re-enable POST /api/v1/terms/accept when legal flow ships
// const termsController = require('./controllers/termsController');
// app.post('/api/v1/terms/accept', termsController.acceptTerms);
const registrationTrackController = require('./controllers/registrationTrackController');
app.post('/api/v1/public/registration-track', registrationTrackController.trackRegistration);

// Support message queue
app.post('/api/v1/support', protect, authorize('professional'), supportController.createSupportMessage);
app.get('/api/v1/admin/support', protect, authorize('admin'), supportController.getSupportMessages);
app.put('/api/v1/admin/support/:id', protect, authorize('admin'), supportController.updateSupportMessage);

// Pre-registration flow (public ad posting)
app.post('/api/v1/public/pre-register', preRegistrationController.startPreRegistration);
app.post('/api/v1/public/pre-register/verify-phone', preRegistrationController.verifyPhone);
app.post('/api/v1/public/pre-register/verify-email', preRegistrationController.verifyEmail);
app.post('/api/v1/public/pre-register/verify-email-google', preRegistrationController.verifyEmailViaGoogle);
app.post('/api/v1/public/pre-register/resend-code', preRegistrationController.resendCode);
app.post('/api/v1/public/pre-register/validate-dni', preRegistrationController.validateDniPhoto);
app.get('/api/v1/public/pre-register/status/:id', preRegistrationController.getStatus);

app.get('/api/v1/interest-notes', protect, authorize('professional', 'admin'), interestNoteController.listInterestNotes);
app.get('/api/v1/interest-notes/:id', protect, authorize('professional', 'admin'), interestNoteController.getInterestNote);
app.post('/api/v1/admin/interest-notes', protect, authorize('admin'), interestNoteController.createInterestNote);
app.put('/api/v1/admin/interest-notes/:id', protect, authorize('admin'), interestNoteController.updateInterestNote);
app.delete('/api/v1/admin/interest-notes/:id', protect, authorize('admin'), interestNoteController.deleteInterestNote);
app.get('/api/v1/admin/whatsapp/config', protect, authorize('admin'), whatsappController.getWhatsAppConfig);
app.put('/api/v1/admin/whatsapp/config', protect, authorize('admin'), whatsappController.updateWhatsAppPhone);
app.post('/api/v1/admin/whatsapp/register', protect, authorize('admin'), whatsappController.startWhatsAppRegistration);
app.get('/api/v1/admin/whatsapp/register/status', protect, authorize('admin'), whatsappController.getWhatsAppRegistrationStatus);
app.post('/api/v1/admin/whatsapp/drip/start', protect, authorize('admin'), whatsappController.startWhatsAppDrip);
app.post('/api/v1/admin/whatsapp/drip/stop', protect, authorize('admin'), whatsappController.stopWhatsAppDrip);
app.get('/api/v1/admin/whatsapp/drip/status', protect, authorize('admin'), whatsappController.getWhatsAppDripStatus);
app.get('/api/v1/admin/whatsapp/inbound', protect, authorize('admin'), whatsappController.listWhatsAppInbound);
app.post('/api/v1/admin/whatsapp/reply', protect, authorize('admin'), whatsappController.sendWhatsAppReply);

// Twilio WhatsApp inbound — configure this URL on the Twilio WhatsApp sender.
app.post('/api/v1/webhooks/twilio/whatsapp', twilioWebhookController.handleWhatsAppInbound);
app.get('/api/v1/admin/launch-curtain', protect, authorize('admin'), launchCurtainController.getAdminLaunchCurtainConfig);
app.put('/api/v1/admin/launch-curtain', protect, authorize('admin'), launchCurtainController.updateLaunchCurtainConfig);

if (process.env.NODE_ENV !== 'production') {
  const testingController = require('./controllers/testingController');
  app.post('/api/v1/testing/verify-user', testingController.forceVerifyUser);
}

app.get('/', (req, res) => {
  res.redirect('/index.html');
});

// Always return JSON for API errors (prevents admin UI "Network Error" on HTML 502 pages).
app.use('/api', (err, req, res, next) => {
  console.error('[API Error]', err.message || err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Server error'
  });
});

const PORT = config.port;

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\nServer running in ${config.env} mode on port ${PORT}`);
  console.log(`Access the application at http://localhost:${PORT}\n`);
  if (!process.env.GOOGLE_CLIENT_ID && !config.google?.clientId) {
    console.warn('[Auth] GOOGLE_CLIENT_ID is not set — Google sign-in buttons will stay hidden on login/register.');
  }

  // Auto-reconnect the platform WhatsApp (Tulio) client from its saved session so
  // a restart/rebuild restores sending without a manual re-registration.
  try {
    const whatsappPlatformService = require('./services/whatsappPlatformService');
    if (whatsappPlatformService.isTwilioApiMode()) {
      console.log('[WhatsApp] Twilio WhatsApp API mode — no QR session required.');
    } else if (whatsappPlatformService.autoReconnectIfSessionSaved()) {
      console.log('[WhatsApp] Saved platform session found — reconnecting Tulio client in background...');
    } else {
      console.log('[WhatsApp] No saved platform session — register via the admin panel to link a number.');
    }
  } catch (err) {
    console.error('[WhatsApp] Auto-reconnect on startup failed:', err.message);
  }
});

// Log unhandled rejections without killing the process (admin/WhatsApp background tasks
// must not take down the whole API and cause nginx 502 for every route).
process.on('unhandledRejection', (err) => {
  console.error('[Unhandled Rejection]', err && err.message ? err.message : err);
});

// Background Task: Clean up expired guest accounts every hour
setInterval(async () => {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await User.deleteMany({
      isAnonymous: true,
      createdAt: { $lt: twentyFourHoursAgo }
    });
    if (result.deletedCount > 0) {
      console.log(`[Cleanup] Purged ${result.deletedCount} expired guest sessions.`);
    }
  } catch (err) {
    console.error('[Cleanup Error]', err.message);
  }
}, 60 * 60 * 1000);

// Background Task: Send Trial Expiration Reminders (Runs every 24 hours)
setInterval(async () => {
  try {
    // Find professionals whose trial ends between 3 and 4 days from now
    const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const fourDaysFromNow = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000);
    
    const expiringUsers = await User.find({
      role: 'professional',
      trialEndsAt: { $gte: threeDaysFromNow, $lt: fourDaysFromNow }
    });

    for (const user of expiringUsers) {
      await sendEmail({
        email: user.email,
        subject: 'KuraTe Platform - Your Free Trial is Expiring Soon',
        message: `Hello ${user.professionalProfile?.alias || 'Professional'},\n\nWe hope you are enjoying your welcome period on the KuraTe Platform!\n\nThis is a reminder that your 2-month free trial will expire in 3 days. To maintain your "Revealed" status and keep your profile visible to clients, please ensure your subscription payment is completed.\n\nThank you for being a Professional!`
      });
      console.log(`[Reminder] Sent trial expiration email to ${user.email}`);
    }
  } catch (err) {
    console.error('[Trial Reminder Error]', err.message);
  }
}, 24 * 60 * 60 * 1000);

// Mock WhatsApp notification sender
async function sendWhatsappNotification(phone, message) {
  console.log(`[WhatsApp Notification queued for ${phone}]:\n${message}`);
  // In a real environment, this would push to a queue consumed by whatsapp_outreach.js
}

// Helper to calculate active business days in current month, excluding vacation
function getActiveBusinessDaysCount(date, vacation) {
  let count = 0;
  const curDate = new Date(date.getFullYear(), date.getMonth(), 1);
  while (curDate <= date) {
    const dayOfWeek = curDate.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    let isVacation = false;
    if (vacation && vacation.startDate && vacation.endDate) {
      const vStart = new Date(vacation.startDate); vStart.setHours(0,0,0,0);
      const vEnd = new Date(vacation.endDate); vEnd.setHours(23,59,59,999);
      if (curDate >= vStart && curDate <= vEnd) isVacation = true;
    }

    if (!isWeekend && !isVacation) count++;
    curDate.setDate(curDate.getDate() + 1);
  }
  return count;
}

// Background Task: Billing, Invoices, and Suspensions Engine (Runs every 24 hours)
setInterval(async () => {
  try {
    const today = new Date();
    today.setHours(0,0,0,0);

    const adminUser = await User.findOne({ role: 'admin' });
    const globalPricing = adminUser?.adminSettings?.pricing || { verificados: 50000, Premium: 40000, Gold: 30000, Silver: 20000, Standard: 15000 };

    // Retrieve all active professionals subject to monthly charges
    const activeUsers = await User.find({
      role: 'professional',
      'professionalProfile.subscriptionStatus': 'active',
      'professionalProfile.paysMonthlyCharges': { $ne: false } // Only process those that pay
    });

    for (const user of activeUsers) {
      if (user.professionalProfile?.isEvaluationPeriod && user.professionalProfile.trialEndDate) {
        const trialEnd = new Date(user.professionalProfile.trialEndDate);
        if (today > trialEnd) {
          user.professionalProfile.isEvaluationPeriod = false;
          await user.save();
        }
      }

      const userActiveDays = getActiveBusinessDaysCount(today, user.professionalProfile.vacation);
      
      // Check if vacation JUST ended to send resumption notification
      if (user.professionalProfile.vacation && user.professionalProfile.vacation.endDate) {
        const vEnd = new Date(user.professionalProfile.vacation.endDate);
        vEnd.setHours(0,0,0,0);
        const dayAfterVacation = new Date(vEnd);
        dayAfterVacation.setDate(dayAfterVacation.getDate() + 1);
        
        if (today.getTime() === dayAfterVacation.getTime()) {
          await sendEmail({
            email: user.email,
            subject: 'KuraTe Platform - Vacation Period Ended',
            message: `Hello ${user.professionalProfile?.alias || 'Professional'},\n\nYour vacation period has concluded. Welcome back! All your profile counters and activities have resumed.`
          });
          const notifyNumber = resolveWhatsappNumber(user.professionalProfile);
          if (notifyNumber) {
            sendWhatsappNotification(notifyNumber, `Hello ${user.professionalProfile?.alias || 'Professional'}! 💎\n\nYour vacation period has concluded. Welcome back! All your profile counters and activities have resumed.`);
          }
        }
      }

      // 1. Invoice Generation (Runs safely on the LAST DAY of the month)
      const isLastDay = today.getDate() === new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      const yyyyMm = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}`;
      const hasCurrentInvoice = user.professionalProfile.invoices?.some(inv => inv.billingMonth === yyyyMm);
      
      if (isLastDay && !hasCurrentInvoice) {
        const daysInMonth = today.getDate();
        let billableDays = daysInMonth;

        if (user.professionalProfile.subscriptionStatus === 'trial') {
          const trialEnd = new Date(user.professionalProfile.trialEndDate);
          const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
          const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

          if (trialEnd >= monthStart && trialEnd <= monthEnd) billableDays = monthEnd.getDate() - trialEnd.getDate();
          else if (trialEnd > monthEnd) billableDays = 0;
        }

        let vacationDaysInMonth = 0;
        if (user.professionalProfile.vacation && user.professionalProfile.vacation.startDate && user.professionalProfile.vacation.endDate) {
          const vStart = new Date(user.professionalProfile.vacation.startDate);
          const vEnd = new Date(user.professionalProfile.vacation.endDate);
          const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
          const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
          
          const overlapStart = new Date(Math.max(vStart, monthStart));
          const overlapEnd = new Date(Math.min(vEnd, monthEnd));
          if (overlapStart <= overlapEnd) vacationDaysInMonth = Math.ceil((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1;
        }
        vacationDaysInMonth = Math.min(vacationDaysInMonth, 15);

        billableDays -= vacationDaysInMonth;
        if (billableDays < 0) billableDays = 0;

        const amountToBill = calculateMonthlyInvoiceAmount(
          user.professionalProfile,
          globalPricing,
          today.getFullYear(),
          today.getMonth(),
          billableDays
        );

        if (amountToBill > 0) {
          user.professionalProfile.paymentReceiptUrl = undefined;
          user.professionalProfile.paymentProcessed = false;
          
          user.professionalProfile.invoices.push({ billingMonth: yyyyMm, amount: amountToBill, dueDate: new Date(today.getFullYear(), today.getMonth() + 1, 7), status: 'pending', lateFeeApplied: false });
          await user.save();
          
          await sendEmail({ email: user.email, subject: `KuraTe Platform - Invoice for ${yyyyMm}`, message: `Hello ${user.professionalProfile?.alias || 'Professional'},\n\nYour subscription fee for ${yyyyMm} is $${amountToBill} ARS.\n\nPlease upload your receipt within the first 5 business days of next month to avoid a late fee and suspension.\n\nThank you!` });
          const notifyNumber = resolveWhatsappNumber(user.professionalProfile);
          if (notifyNumber) sendWhatsappNotification(notifyNumber, `Hello ${user.professionalProfile?.alias || 'Professional'}! 💎\n\nYour invoice for ${yyyyMm} is ready. The amount due is $${amountToBill} ARS. Please upload your receipt in the dashboard within the first 5 business days to keep your profile active.\n\nThank you!`);
          const dueDate7 = new Date(today.getFullYear(), today.getMonth() + 1, 7);
          await smsNotifications.notifyDueDate(
            user,
            `$${amountToBill} ARS vence el ${String(dueDate7.getDate()).padStart(2, '0')}/${String(dueDate7.getMonth() + 1).padStart(2, '0')}`
          ).catch(() => {});
          console.log(`[Billing Engine] Generated invoice for ${user.email} - $${amountToBill}`);
        } else {
          user.professionalProfile.paymentProcessed = true;
          await user.save();
        }
      }

      // 2. Late Fee & Suspension Enforcement (After 5th Business Day, looking at PREVIOUS month's invoice)
      const prevMonthDate = new Date(today.getFullYear(), today.getMonth(), 0);
      const prevYyyyMm = `${prevMonthDate.getFullYear()}-${(prevMonthDate.getMonth() + 1).toString().padStart(2, '0')}`;

      if (userActiveDays > 5) {
        const hasReceipt = user.professionalProfile.paymentReceiptUrl && user.professionalProfile.paymentReceiptUrl.trim() !== '';
        const prevInvoice = user.professionalProfile.invoices.find(inv => inv.billingMonth === prevYyyyMm && inv.status === 'pending');
        
        if (!hasReceipt && prevInvoice && !prevInvoice.lateFeeApplied) {
          user.professionalProfile.subscriptionStatus = 'suspended';
          prevInvoice.amount = Math.round(prevInvoice.amount * 1.02); // Add 2% late interest
          prevInvoice.lateFeeApplied = true;
          
          await user.save();
          
          await sendEmail({
            email: user.email,
            subject: 'KuraTe Platform - Account Suspended (Late Payment)',
            message: `Hello ${user.professionalProfile?.alias || 'Professional'},\n\nYour profile has been temporarily removed from the public directory because we have not received your payment receipt within the first 5 active business days.\n\nA 2% late fee has been applied. Your new total balance for ${prevYyyyMm} is $${prevInvoice.amount} ARS.\n\nPlease upload your payment receipt to be reactivated.\n\nThank you.`
          });
          await smsNotifications.notifyDueDate(
            user,
            `tu cuenta fue suspendida por pago vencido (${prevYyyyMm}), saldo $${prevInvoice.amount} ARS con recargo`
          ).catch(() => {});
          console.log(`[Suspension Engine] Suspended ${user.email} and applied 2% late fee.`);
        }
      }
    }
  } catch (err) {
    console.error('[Billing Engine Error]', err.message);
  }
}, 24 * 60 * 60 * 1000);

// Background Task: Enforce Yearly Photo Upgrades (Runs every 24 hours)
setInterval(async () => {
  try {
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const inactiveUsers = await User.find({
      role: 'professional',
      'professionalProfile.lastPhotoUpdate': { $lt: oneYearAgo },
      verificationStatus: 'approved'
    });

    for (const user of inactiveUsers) {
      user.verificationStatus = 'pending';
      user.isVerified = false;
      await user.save();
      await sendEmail({
        email: user.email,
        subject: 'KuraTe Platform - Yearly Photo Update Required',
        message: `Hello ${user.professionalProfile?.alias || 'Professional'},\n\nIt has been over a year since you updated your photos on the platform. To maintain our standard of quality and ensure profiles are accurate, we require all professionals to update their pictures annually.\n\nYour profile has been temporarily hidden. Please log in to your dashboard and upload new photos to reactivate your profile.\n\nThank you for understanding!`
      });
      console.log(`[Yearly Photo Update] Suspended ${user.email} due to outdated photos.`);
    }
  } catch (err) {
    console.error('[Yearly Photo Update Error]', err.message);
  }
}, 24 * 60 * 60 * 1000);

// Background Task: Send feedback poll emails 7 days after contact
setInterval(async () => {
  try {
    const count = await feedbackController.processPendingFeedback();
    if (count > 0) console.log(`[Feedback] Sent ${count} poll email(s).`);
  } catch (err) {
    console.error('[Feedback Error]', err.message);
  }
}, 60 * 60 * 1000);
