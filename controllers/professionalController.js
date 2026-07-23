const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const config = require('../config/appConfig');
const ActivityLog = require('../models/ActivityLog');
const sendEmail = require('../sendEmail');
const Specialty = require('../models/Specialty');
const Statistic = require('../models/Statistic');
const Review = require('../models/Review');
const Feedback = require('../models/Feedback');
const Connection = require('../models/Connection');
const ConnectionRequest = require('../models/ConnectionRequest');
const { isUploadPath, resolvePhotoForClient, resolvePhotosForClient, normalizePhotosForStorage, resolveFirstPhotoForClient } = require('../utils/photoUtils');
const { resolveWhatsappNumber, hasContactNumber } = require('../utils/contactNumber');
const { recordCategoryChange, normalizeQuality } = require('../utils/categoryBilling');
const smsNotifications = require('../services/smsNotifications');
const { getClientIp } = require('../utils/clientIp');
const { mergePublicListingFilter, isAccountDeleted } = require('../utils/professionalVisibility');
const { hasInappropriateWords, matchCategories, extractKeywords } = require('../utils/needMatching');
const { analyzeQuery, buildSearchPlan } = require('../utils/aiSearch');

const ALIAS_LOOKUP_FILTER = { role: 'professional', accountDeletedAt: null };
const DEFAULT_WORKING_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Simple in-memory cache setup
const cache = new Map();
const CACHE_TTL = 60 * 1000; // 1 minute TTL in milliseconds

function isOnVacation(profile) {
  if (!profile?.vacation?.startDate || !profile?.vacation?.endDate) return false;
  const now = new Date();
  const vStart = new Date(profile.vacation.startDate);
  const vEnd = new Date(profile.vacation.endDate);
  vStart.setHours(0, 0, 0, 0);
  vEnd.setHours(23, 59, 59, 999);
  return now >= vStart && now <= vEnd;
}

// Helper function to check if professional is active RIGHT NOW in Argentina timezone
function checkIsActive(profile) {
  if (!profile) return false;
  if (!profile.workingHours || !profile.workingHours.start || !profile.workingHours.end) return false;
  if (typeof profile.workingHours.start !== 'string' || typeof profile.workingHours.end !== 'string') return false;
  if (isOnVacation(profile)) return false;
  const workingDays = Array.isArray(profile.workingDays) && profile.workingDays.length > 0
    ? profile.workingDays
    : DEFAULT_WORKING_DAYS;

  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires', weekday: 'long', hour: 'numeric', minute: 'numeric', hour12: false
  });
  const parts = formatter.formatToParts(now);
  let currentDay = '', currentHour = 0, currentMinute = 0;
  for (let p of parts) {
    if (p.type === 'weekday') currentDay = p.value;
    if (p.type === 'hour') currentHour = parseInt(p.value, 10);
    if (p.type === 'minute') currentMinute = parseInt(p.value, 10);
  }
  if (currentHour === 24) currentHour = 0; // standard formatting safeguard

  const currentTotal = currentHour * 60 + currentMinute;
  const [startH, startM] = profile.workingHours.start.split(':').map(Number);
  const [endH, endM] = profile.workingHours.end.split(':').map(Number);
  const startTotal = startH * 60 + startM;
  const endTotal = endH * 60 + endM;

  if (startTotal <= endTotal) {
    // Standard shift (e.g., 09:00 to 18:00)
    if (!workingDays.includes(currentDay)) return false;
    return currentTotal >= startTotal && currentTotal <= endTotal;
  } else {
    // Overnight shift (e.g., 22:00 to 06:00) crosses midnight
    if (currentTotal <= endTotal) return workingDays.includes(new Date(now.getTime() - 86400000).toLocaleDateString('en-US', { timeZone: 'America/Argentina/Buenos_Aires', weekday: 'long' }));
    if (currentTotal >= startTotal) return workingDays.includes(currentDay);
    return false;
  }
}

// @desc    Discover all revealed Professionals (Public)
// @route   GET /api/v1/professionals
// @access  Public
exports.getProfessionals = async (req, res, next) => {
  try {
    let query = mergePublicListingFilter();

    // Filter by Quality (formerly Tier)
    if (req.query.quality && req.query.quality.trim()) {
      query['professionalProfile.quality'] = req.query.quality.trim();
    }

    // Filter by Alias (partial match)
    if (req.query.alias && req.query.alias.trim()) {
      query['professionalProfile.alias'] = { $regex: req.query.alias.trim(), $options: 'i' };
    }

    // Filter by Specialty (searches the services array)
    if (req.query.specialty && req.query.specialty.trim()) {
      const specialties = req.query.specialty.trim().split(',').map(s => s.trim()).filter(Boolean);
      if (specialties.length > 0) {
        // Case-insensitive match for each selected specialty
        query['professionalProfile.services'] = { $in: specialties.map(s => new RegExp('^' + s + '$', 'i')) };
      }
    }

    // Hierarchical Location Search
    if (req.query.province && req.query.province.trim()) {
      query['professionalProfile.location.province'] = { $regex: req.query.province.trim(), $options: 'i' };
    }
    if (req.query.city && req.query.city.trim()) {
      query['professionalProfile.location.city'] = { $regex: req.query.city.trim(), $options: 'i' };
    }
    if (req.query.neighborhood && req.query.neighborhood.trim()) {
      query['professionalProfile.location.neighborhood'] = { $regex: req.query.neighborhood.trim(), $options: 'i' };
    }

    const page = parseInt(req.query.page, 10) || 1;
    const parsedLimit = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : 12;
    const skip = limit > 0 ? (page - 1) * limit : 0;

    const total = await User.countDocuments(query);

    let selectQuery = {
      'professionalProfile.alias': 1,
      'professionalProfile.quality': 1,
      'professionalProfile.bio': 1,
      'professionalProfile.services': 1,
      'professionalProfile.location': 1,
      'professionalProfile.pricing': 1,
      'professionalProfile.measurements': 1,
      'professionalProfile.height': 1,
      'professionalProfile.eyeColor': 1,
      'professionalProfile.hasTattoos': 1,
      'professionalProfile.workingHours': 1,
      'professionalProfile.workingDays': 1,
      'professionalProfile.vacation': 1,
      'professionalProfile.photos': 1
    };

    if (req.query.minimal === 'true') {
      selectQuery = {
        'professionalProfile.quality': 1,
        'professionalProfile.services': 1,
        'professionalProfile.location': 1
      };
    }

    let professionalsQuery = User.find(query)
      .select(selectQuery)
      .skip(skip);
    if (limit > 0) {
      professionalsQuery = professionalsQuery.limit(limit);
    }
    const professionals = await professionalsQuery;

    const responsePayload = {
      success: true,
      message: config.experience ? config.experience.discoveryText : 'Discovery',
      count: professionals.length,
      pagination: {
        page,
        limit,
        total,
        hasMore: limit > 0 ? skip + professionals.length < total : false
      },
      data: professionals.map(p => {
        const profObj = p.toObject ? p.toObject() : (p._doc || p);
        // Grid thumbnail: first photo only, always as DB-stored data URI (not /uploads/ paths)
        if (profObj.professionalProfile && profObj.professionalProfile.photos) {
          const first = resolveFirstPhotoForClient(profObj.professionalProfile.photos);
          profObj.professionalProfile.photos = first ? [first] : [];
        }
        return {
          ...profObj,
          revelationStatus: config.experience ? config.experience.statusRevealed : 'REVEALED',
          isActiveNow: checkIsActive(profObj.professionalProfile)
        };
      })
    };

    res.status(200).json(responsePayload);
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Search professionals by need (acción + descripción + location + urgencia)
// @route   GET /api/v1/professionals/search
// @access  Public
exports.searchProfessionals = async (req, res, next) => {
  try {
    const { accion, descripcion, provincia, ciudad, urgencia, relaxBrand, relaxModel } = req.query;

    const badWord = hasInappropriateWords(descripcion);
    if (badWord) {
      return res.status(400).json([]);
    }

    const baseFilter = mergePublicListingFilter();
    baseFilter['professionalProfile.alias'] = { $exists: true, $ne: '' };

    const matchedCats = matchCategories(descripcion);
    const keywords = extractKeywords(descripcion);

    // AI layer: optional, 2s timeout, falls back to taxonomy
    const aiResult = await analyzeQuery(descripcion);
    const plan = buildSearchPlan(aiResult, { accion, provincia, ciudad, urgencia });

    if (provincia && provincia.trim()) {
      baseFilter['professionalProfile.location.province'] = { $regex: provincia.trim(), $options: 'i' };
    }
    if (ciudad && ciudad.trim()) {
      baseFilter['professionalProfile.location.city'] = { $regex: ciudad.trim(), $options: 'i' };
    }

    // Collect unique search terms: taxonomy + keywords + AI synonyms
    const searchTerms = new Set();
    for (const c of matchedCats) {
      if (c.service) searchTerms.add(c.service.toLowerCase());
      if (c.subcategory) searchTerms.add(c.subcategory.toLowerCase());
      if (c.category) searchTerms.add(c.category.toLowerCase());
    }
    for (const k of keywords) {
      if (k.length > 2) searchTerms.add(k);
    }
    // AI-enhanced terms
    if (plan.keywords.length) {
      for (const k of plan.keywords) searchTerms.add(k.toLowerCase());
    }
    if (plan.serviceCategory) {
      searchTerms.add(plan.serviceCategory.toLowerCase());
    }
    const patterns = [...searchTerms].map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

    // Fetch base results and score in JS for maintainability
    let professionals = await User.find(baseFilter)
      .select({
        'professionalProfile.alias': 1,
        'professionalProfile.bio': 1,
        'professionalProfile.location': 1,
        'professionalProfile.services': 1,
        'professionalProfile.photos': 1,
        'professionalProfile.whatsappNumber': 1,
        email: 1
      })
      .lean()
      .limit(200);

    // Attach average rating from feedback
    const profIds = professionals.map(p => p._id);
    const ratingAgg = await Feedback.aggregate([
      { $match: { professional: { $in: profIds }, status: 'completed' } },
      { $group: { _id: '$professional', avg: { $avg: '$rating' } } }
    ]);
    const ratingMap = {};
    for (const r of ratingAgg) ratingMap[r._id.toString()] = Math.round(r.avg * 10) / 10;
    for (const p of professionals) p._averageRating = ratingMap[p._id.toString()] || 0;

    // Score each professional — calculate match percentage (0-100)
    // Required: at least brand OR model must match (if user provided one)
    const scored = professionals.map(p => {
      const pp = p.professionalProfile || {};
      const svcs = Array.isArray(pp.services) ? pp.services.map(s => s.toLowerCase()) : [];
      const bio = (pp.bio || '').toLowerCase();
      let score = 0;
      let maxPossible = 0;

      // Weights for percentage calculation
      const W_ACTION = 5, W_URGENCY = 5, W_SERVICE = 30, W_BIO = 10, W_BRAND = 25, W_MODEL = 25, W_LOCATION = 15;
      maxPossible = W_ACTION + W_URGENCY + W_SERVICE + W_BIO + W_BRAND + W_MODEL + W_LOCATION;

      if (accion) score += W_ACTION;
      if (urgencia) score += W_URGENCY;

      // Service matches (each matching service = full service weight)
      let serviceMatched = false;
      for (const pat of patterns) {
        for (const s of svcs) {
          if (s.includes(pat) || pat.includes(s)) {
            if (!serviceMatched) { score += W_SERVICE; serviceMatched = true; }
          }
        }
      }

      // Bio keyword matches
      let bioMatchCount = 0;
      for (const pat of patterns) {
        if (bio.includes(pat)) bioMatchCount++;
      }
      if (bioMatchCount > 0) {
        score += Math.min(W_BIO, bioMatchCount * 5);
      }

      // Brand match (exact or fuzzy in bio/services) — skipped if relaxBrand
      const brandQuery = relaxBrand ? '' : (plan.brand || '').toLowerCase().trim();
      let brandMatched = false;
      if (brandQuery) {
        const inBio = bio.includes(brandQuery);
        const inServices = svcs.some(s => s.includes(brandQuery));
        if (inBio || inServices) { score += W_BRAND; brandMatched = true; }
      }

      // Model match (exact or fuzzy in bio/services) — skipped if relaxModel
      const modelQuery = relaxModel ? '' : (plan.model || '').toLowerCase().trim();
      let modelMatched = false;
      if (modelQuery) {
        const inBio = bio.includes(modelQuery);
        const inServices = svcs.some(s => s.includes(modelQuery));
        if (inBio || inServices) { score += W_MODEL; modelMatched = true; }
      }

      // Location boost
      if (provincia && pp.location?.province) {
        if (pp.location.province.toLowerCase().includes(provincia.toLowerCase())) score += W_LOCATION;
      }
      if (ciudad && pp.location?.city) {
        if (pp.location.city.toLowerCase().includes(ciudad.toLowerCase())) score += Math.floor(W_LOCATION / 2);
      }

      const avgRating = p._averageRating || 0;
      score += Math.round(avgRating * 2);

      // Calculate percentage
      const pct = Math.round((score / maxPossible) * 100);

      // If user provided brand or model (and not relaxed), at least one must match
      const hasBrandOrModelQuery = (brandQuery || modelQuery) && !relaxBrand && !relaxModel;
      const mustMatch = hasBrandOrModelQuery && !brandMatched && !modelMatched;

      return {
        id: p._id,
        score,
        pct,
        alias: pp.alias || 'Profesional',
        bio: pp.bio || '',
        location: [pp.location?.city, pp.location?.province].filter(Boolean).join(', '),
        services: svcs,
        photo: firstPhoto,
        phone: pp.whatsappNumber || null,
        email: p.email,
        averageRating: avgRating,
        brandMatched,
        modelMatched,
        mustMatch // flag: user asked for brand/model but this pro didn't match
      };
    });

    // Filter: remove zero-score, brand/model required match, and < 50% match
    const results = scored
      .filter(p => p.score > 0 && !p.mustMatch && p.pct >= 50)
      .sort((a, b) => b.pct - a.pct || b.score - a.score)
      .slice(0, 50);

    // Build relaxation suggestions when results are few
    const suggestions = [];
    if (results.length === 0 || results.length <= 3) {
      // Suggestion 1: expand location
      if (ciudad) {
        suggestions.push({
          type: 'location',
          label: 'Buscar en toda la provincia',
          params: { ciudad: '' }
        });
      }
      if (provincia) {
        suggestions.push({
          type: 'location',
          label: 'Buscar en todo el país',
          params: { provincia: '', ciudad: '' }
        });
      }
      // Suggestion 2: relax urgency
      if (urgencia && urgencia !== 'sin-apuro') {
        suggestions.push({
          type: 'urgency',
          label: 'Incluir todos los plazos',
          params: { urgencia: '' }
        });
      }
      // Suggestion 3: broader service match (lower threshold)
      if (patterns.length > 0) {
        suggestions.push({
          type: 'service',
          label: 'Buscar servicios similares',
          params: { descripcion: '' }
        });
      }
      // Suggestion 4: relax model (search by brand only)
      if (modelQuery && brandQuery) {
        suggestions.push({
          type: 'model',
          label: 'Buscar solo por marca (' + brandQuery + ')',
          params: { relaxModel: '1' }
        });
      }
      // Suggestion 5: relax brand+model (search by service only)
      if (brandQuery || modelQuery) {
        suggestions.push({
          type: 'brand',
          label: 'Buscar sin marca/modelo',
          params: { relaxBrand: '1', relaxModel: '1' }
        });
      }
    }

    res.status(200).json({ results, suggestions });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Get single professional by alias (Public)
// @route   GET /api/v1/professionals/:alias
// @access  Public
exports.getProfessionalByAlias = async (req, res, next) => {
  try {
    // Failsafe: Prevent 'me' from being treated as an alias if route auth falls through
    if (req.params.alias.toLowerCase() === 'me') {
      return res.status(403).json({ success: false, error: 'Access denied. You must be logged in as a professional to view the dashboard.' });
    }

    const aliasRegex = new RegExp(`^${req.params.alias}$`, 'i');
    const professional = await User.findOne({ 
      'professionalProfile.alias': aliasRegex,
      ...ALIAS_LOOKUP_FILTER
    }).select('accountDeletedAt professionalProfile.alias professionalProfile.quality professionalProfile.bio professionalProfile.services professionalProfile.location professionalProfile.pricing professionalProfile.measurements professionalProfile.height professionalProfile.eyeColor professionalProfile.hasTattoos professionalProfile.whatsappNumber professionalProfile.mobilePhone professionalProfile.photos professionalProfile.workingHours professionalProfile.workingDays professionalProfile.vacation');

    if (!professional || isAccountDeleted(professional)) {
      return res.status(404).json({
        success: false,
        error: 'Professional not found'
      });
    }
    const profObj = professional.toObject();
    const hasWhatsapp = hasContactNumber(profObj.professionalProfile);
    delete profObj.professionalProfile.whatsappNumber;
    delete profObj.professionalProfile.mobilePhone;
    profObj.professionalProfile.hasWhatsapp = hasWhatsapp;
    profObj.isActiveNow = checkIsActive(profObj.professionalProfile);
    if (profObj.professionalProfile && profObj.professionalProfile.photos) {
      profObj.professionalProfile.photos = resolvePhotosForClient(profObj.professionalProfile.photos);
    }

    // Track the Profile View Activity
    try {
      const clientIp = req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : (req.socket ? req.socket.remoteAddress : req.ip);
      await ActivityLog.create({
        professional: professional._id,
        action: 'profile_view',
        ipAddress: clientIp,
        userAgent: req.headers['user-agent'],
        isGuest: false
      });

    } catch(err) { console.error('Activity log error:', err.message); }

    // Fetch dynamic pricing
    const adminUser = await User.findOne({ role: 'admin' });
    const globalPricing = adminUser?.adminSettings?.pricing || {
        verificados: 50000, Premium: 40000, Gold: 30000, Silver: 20000, Standard: 15000
    };

    res.status(200).json({
      success: true,
      data: profObj
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Track dashboard photo click (categories grid thumbnail)
// @route   POST /api/v1/professionals/:alias/track-photo-click
// @access  Public
exports.trackDashboardPhotoClick = async (req, res, next) => {
  try {
    const aliasRegex = new RegExp(`^${req.params.alias}$`, 'i');
    const professional = await User.findOne({
      'professionalProfile.alias': aliasRegex,
      ...ALIAS_LOOKUP_FILTER
    }).select('_id');

    if (!professional) {
      return res.status(404).json({ success: false, error: 'Professional not found' });
    }

    const today = new Date().toISOString().split('T')[0];
    await Statistic.findOneAndUpdate(
      { professionalId: professional._id, date: today },
      { $inc: { photoCount: 1 }, $set: { time: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Redirect to Professional's WhatsApp (Anti-Scraping Protection)
// @route   GET /api/v1/professionals/:alias/whatsapp
// @access  Public
exports.contactWhatsApp = async (req, res, next) => {
  try {
    const aliasRegex = new RegExp(`^${req.params.alias}$`, 'i');
    const professional = await User.findOne({ 
      'professionalProfile.alias': aliasRegex,
      ...ALIAS_LOOKUP_FILTER
    }).select('professionalProfile.whatsappNumber professionalProfile.mobilePhone professionalProfile.alias');

    const contactNumber = professional ? resolveWhatsappNumber(professional.professionalProfile) : '';
    if (!professional || !contactNumber) {
      return res.status(404).send('WhatsApp contact not available for this professional.');
    }

    const cleanNumber = contactNumber.replace(/\D/g, '');
    const message = `Hello ${professional.professionalProfile.alias}, I saw your profile on KuraTe and I'm interested in your services.`;
    const waUrl = `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`;

    // Track the WhatsApp Click Activity
    try {
      const clientIp = req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : (req.socket ? req.socket.remoteAddress : req.ip);
      await ActivityLog.create({
        professional: professional._id,
        action: 'whatsapp_click',
        ipAddress: clientIp,
        userAgent: req.headers['user-agent'],
        isGuest: false
      });

      const today = new Date().toISOString().split('T')[0];
      await Statistic.findOneAndUpdate(
        { professionalId: professional._id, date: today },
        { $inc: { whatsappcCount: 1 }, $set: { time: new Date() } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch(err) { console.error('Activity log error:', err.message); }

    res.redirect(waUrl);
  } catch (error) {
    res.status(400).send('Unable to redirect to WhatsApp.');
  }
};

// @desc    Get all unique specialties (from services)
// @route   GET /api/v1/professionals/specialties
// @access  Public
exports.getSpecialties = async (req, res, next) => {
  try {
    const query = mergePublicListingFilter();

    // If a quality filter is applied, only show specialties from that quality tier
    if (req.query.quality && req.query.quality.trim()) {
      query['professionalProfile.quality'] = req.query.quality.trim();
    }

    // Dynamically get all unique services from active professionals in the database.
    // This is more reliable than a static config list.
    const services = await User.distinct('professionalProfile.services', query);
    
    const responsePayload = {
      success: true,
      count: services.length,
      data: services.sort()
    };
    
    res.status(200).json(responsePayload);
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Get current logged in professional's profile (Private)
// @route   GET /api/v1/professionals/me
// @access  Private/Professional
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found in dashboard'
      });
    }

    // Check transaction readiness
    let isReadyForTransactions = false;
    
    if (user.role === 'professional' && user.professionalProfile) {
      isReadyForTransactions = user.professionalProfile.rateChangeAcknowledged || false;
      // If it's a duo, the partner must also have acknowledged
      if (user.professionalProfile.isDuo && user.professionalProfile.duoPartner) {
        const partner = await User.findById(user.professionalProfile.duoPartner);
        if (partner && !partner.professionalProfile.rateChangeAcknowledged) {
          isReadyForTransactions = false;
        }
      }
    } else if (user.role === 'admin') {
      isReadyForTransactions = true;
    }

    // Fetch performance metrics to show on the dashboard
    let photoCount = 0;
    let whatsappcCount = 0;
    let callCount = 0;
    try {
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
    } catch (err) { console.error('Failed to load stats:', err.message); }

    // Fetch dynamic pricing
    const adminUser = await User.findOne({ role: 'admin' });
    const globalPricing = adminUser?.adminSettings?.pricing || {
        verificados: 50000, Premium: 40000, Gold: 30000, Silver: 20000, Standard: 15000
    };

    res.status(200).json({
      success: true,
      isReadyForTransactions,
      stats: { photoCount, whatsappcCount, callCount },
      globalPricing,
      paymentInstructions: user.role === 'professional' ? {
        intro: 'Transferí tu pago mensual por Mercado Pago o por transferencia bancaria a las siguientes cuentas:',
        billingNote: 'La facturación mensual se calcula según la categoría seleccionada en tu perfil. Si cambiás de categoría durante el mes, el importe se prorratea por los días en cada tarifa (guardamos la fecha del cambio en tu perfil).',
        currentQuality: user.professionalProfile?.quality || 'Standard',
        currentCategoryPrice: globalPricing[user.professionalProfile?.quality || 'Standard'] || globalPricing.Standard,
        mercadoPago: { alias: config.payment.mercadoPago.alias, cvu: config.payment.mercadoPago.cvu },
        bankTransfer: {
          bankName: config.payment.bankTransfer.bankName || 'BBVA',
          alias: config.payment.bankTransfer.alias,
          cbu: config.payment.bankTransfer.cbu
        }
      } : undefined,
      data: user
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Acknowledge price rate change (Private)
// @route   PUT /api/v1/professionals/acknowledge-rate
// @access  Private/Professional
exports.acknowledgeRateChange = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (user.role !== 'professional') {
      return res.status(403).json({ success: false, error: 'Only professionals can acknowledge rates' });
    }

    user.professionalProfile.rateChangeAcknowledged = true;
    await user.save();

    const clientIp = req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : (req.socket ? req.socket.remoteAddress : req.ip);
    await ActivityLog.create({
      professional: user._id,
      action: 'acknowledge_rate_change',
      ipAddress: clientIp,
      userAgent: req.headers['user-agent'],
      isGuest: false
    });

    res.status(200).json({
      success: true,
      message: 'Rate change acknowledged successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Admin: Notify all professionals of rate change (Private/Admin)
// @route   POST /api/v1/professionals/notify-rate-change
// @access  Private/Admin
exports.notifyRateChange = async (req, res, next) => {
  try {
    // Reset acknowledgment for all professionals
    await User.updateMany(
      { role: 'professional' },
      { 'professionalProfile.rateChangeAcknowledged': false }
    );

    const professionals = await User.find({ role: 'professional' });

    // Send emails in background (could use a queue in a real app)
    const emailPromises = professionals.map(p => 
      sendEmail({
        email: p.email,
        subject: 'KuraTe Platform - Price Rate Change',
        message: `Hello ${p.professionalProfile.alias || 'Professional'},\n\nThere has been a change in monthly category pricing on KuraTe. Starting next month, your invoice will reflect the updated rate for your category (${p.professionalProfile.quality || 'Standard'}).\n\nPlease log in to your dashboard and acknowledge the new pricing before continuing with transactions.\n\nThank you!`
      }).catch(err => console.error(`Failed to send email to ${p.email}:`, err))
    );

    // Mirror the broadcast over SMS (best-effort; gated by SMS_NOTIFY_TARIFF).
    professionals.forEach(p =>
      smsNotifications.notifyTariffChange(
        p,
        `la tarifa mensual de tu categoria (${p.professionalProfile?.quality || 'Standard'}) fue actualizada`
      ).catch(() => {})
    );

    res.status(200).json({
      success: true,
      message: `Rate change notification triggered for ${professionals.length} professionals`
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Acknowledge first login after admin approval (clears the redirect flag)
// @route   POST /api/v1/professionals/acknowledge-first-login
// @access  Private/Professional
exports.acknowledgeFirstLogin = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'professional') {
      return res.status(404).json({ success: false, error: 'Professional not found' });
    }
    user.firstApprovedLogin = false;
    await user.save();
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Send phone verification code via SMS
// @route   POST /api/v1/professionals/send-phone-code
// @access  Private/Professional
exports.sendPhoneCode = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'professional') {
      return res.status(404).json({ success: false, error: 'Professional not found' });
    }
    const phone = user.professionalProfile?.mobilePhone;
    if (!phone) {
      return res.status(400).json({ success: false, error: 'No mobile phone number on profile' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + config.verificationCodeExpireMinutes * 60 * 1000);

    const { sendSms } = require('../services/smsService');
    const result = await sendSms({
      to: phone,
      body: `KuraTe: tu código de verificación es ${code}. Válido por ${config.verificationCodeExpireMinutes} minutos.`
    });

    if (!result.ok) {
      return res.status(500).json({ success: false, error: result.reason || result.error || 'Failed to send SMS' });
    }

    user.phoneVerificationCode = code;
    user.phoneVerificationCodeExpire = expiresAt;
    user.phoneVerificationSid = result.sid || '';
    await user.save();

    // Log the activity (without the code for security)
    const clientIp = req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : (req.socket ? req.socket.remoteAddress : req.ip);
    await ActivityLog.create({
      professional: user._id,
      action: 'send_phone_code',
      ipAddress: clientIp,
      userAgent: req.headers['user-agent'],
      isGuest: false
    }).catch(() => {});

    res.status(200).json({
      success: true,
      message: 'Verification code sent.',
      sid: result.sid,
      expiresAt
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Verify phone code and mark phone as verified
// @route   POST /api/v1/professionals/verify-phone-code
// @access  Private/Professional
exports.verifyPhoneCode = async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ success: false, error: 'Enter a valid 6-digit code' });
    }

    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'professional') {
      return res.status(404).json({ success: false, error: 'Professional not found' });
    }

    if (!user.phoneVerificationCode || !user.phoneVerificationCodeExpire) {
      return res.status(400).json({ success: false, error: 'No verification code was sent. Request a new code.' });
    }

    if (user.phoneVerified) {
      return res.status(400).json({ success: false, error: 'Phone number is already verified.' });
    }

    if (Date.now() > new Date(user.phoneVerificationCodeExpire).getTime()) {
      user.phoneVerificationCode = undefined;
      user.phoneVerificationCodeExpire = undefined;
      user.phoneVerificationSid = undefined;
      await user.save();
      return res.status(400).json({ success: false, error: 'Code expired. Request a new code.' });
    }

    if (user.phoneVerificationCode !== code) {
      return res.status(400).json({ success: false, error: 'Invalid code. Try again.' });
    }

    user.phoneVerified = true;
    user.phoneVerificationCode = undefined;
    user.phoneVerificationCodeExpire = undefined;
    user.phoneVerificationSid = undefined;
    await user.save();

    const clientIp = req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : (req.socket ? req.socket.remoteAddress : req.ip);
    await ActivityLog.create({
      professional: user._id,
      action: 'verify_phone',
      ipAddress: clientIp,
      userAgent: req.headers['user-agent'],
      isGuest: false
    }).catch(() => {});

    res.status(200).json({ success: true, message: 'Phone number verified.' });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Check Twilio delivery status of the last phone verification SMS
// @route   GET /api/v1/professionals/phone-code-status
// @access  Private/Professional
exports.getPhoneCodeStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'professional') {
      return res.status(404).json({ success: false, error: 'Professional not found' });
    }

    if (!user.phoneVerificationSid) {
      return res.status(200).json({ success: true, status: 'none', message: 'No phone code has been sent yet.' });
    }

    const { getClient } = require('../services/smsService');
    const client = getClient();
    if (!client) {
      return res.status(200).json({ success: true, status: 'unknown', message: 'SMS client not available.' });
    }

    const message = await client.messages(user.phoneVerificationSid).fetch();
    res.status(200).json({
      success: true,
      status: message.status,
      errorCode: message.errorCode,
      errorMessage: message.errorMessage,
      dateSent: message.dateSent,
      to: message.to
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Update professional profile (Private)
// @route   PUT /api/v1/professionals/updateprofile
// @access  Private/Professional
exports.updateProfile = async (req, res, next) => {
  try {
    const currentUser = await User.findById(req.user.id);
    
    // Admin Pricing Override
    if (currentUser.role === 'admin' && req.body.adminPricing) {
        const pricing = JSON.parse(req.body.adminPricing);
        currentUser.adminSettings = currentUser.adminSettings || {};
        currentUser.adminSettings.pricing = pricing;
        await currentUser.save();
        return res.status(200).json({ success: true, data: currentUser });
    }

    const oldProf = currentUser.professionalProfile || {};

    // Get existing photos from the form (sent as a JSON string)
    let existingPhotos;
    if (req.body.existingPhotos === '__preserve__') {
      existingPhotos = oldProf.photos || [];
    } else {
      existingPhotos = req.body.existingPhotos ? JSON.parse(req.body.existingPhotos) : [];
    }

    // Check metadata for new photos to validate they are recent (within 1 year)
    let lastPhotoUpdate = undefined;
    const newPhotoUrls = [];
    const fs = require('fs');
    
    if (req.files && req.files.length > 0) {
      const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
      let invalidFound = false;
      
      for (const file of req.files) {
        const stats = fs.statSync(file.path);
        // Using file stats as a proxy for EXIF metadata check (enforcing new uploads)
        if (stats.mtimeMs < oneYearAgo) invalidFound = true;
      }
      
      if (invalidFound) {
        req.files.forEach(file => { if (fs.existsSync(file.path)) fs.unlinkSync(file.path); });
        return res.status(400).json({ success: false, error: 'One or more uploaded photos are older than a year according to metadata. Please upload recent photos.' });
      }
      lastPhotoUpdate = Date.now();

      // Convert files to Base64 strings to store in the database
      for (const file of req.files) {
        const base64Data = fs.readFileSync(file.path, 'base64');
        newPhotoUrls.push(`data:${file.mimetype};base64,${base64Data}`);
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path); // Remove external file
      }
    }

    // Store photos in MongoDB as base64 data URIs (not file paths)
    const allPhotos = normalizePhotosForStorage(
      [...existingPhotos, ...newPhotoUrls],
      oldProf.photos || []
    );

    const rawDays = req.body.workingDays;
    const parsedDays = rawDays ? rawDays.split(',').map(s => s.trim()).filter(s => s) : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    const isApproved = currentUser.verificationStatus === 'approved';

    let identityFields = {};
    if (!isApproved) {
      if (req.body.firstName !== undefined) identityFields.firstName = req.body.firstName;
      if (req.body.surname !== undefined) identityFields.surname = req.body.surname;
      if (req.body.middleName !== undefined) identityFields.middleName = req.body.middleName;
      if (req.body.idNumber !== undefined) {
        identityFields.idNumber = req.body.idNumber;
      }
      if (req.body.birthDate) {
        identityFields.birthDate = new Date(req.body.birthDate);
        identityFields.age = Math.abs(new Date(Date.now() - identityFields.birthDate.getTime()).getUTCFullYear() - 1970);
      }
    }

    // Build the professionalProfile object from the form fields
    const mobilePhone = req.body.mobilePhone !== undefined ? req.body.mobilePhone : oldProf.mobilePhone;
    const whatsappRaw = req.body.whatsappNumber !== undefined ? req.body.whatsappNumber : oldProf.whatsappNumber;
    const whatsappNumber = (whatsappRaw && String(whatsappRaw).trim()) || (mobilePhone && String(mobilePhone).trim()) || '';

    const professionalProfile = {
      alias: req.body.alias,
      ...identityFields,
      mobilePhone,
      instagram: req.body.instagram !== undefined ? req.body.instagram : oldProf.instagram,
      facebook: req.body.facebook !== undefined ? req.body.facebook : oldProf.facebook,
      bio: req.body.bio,
      services: req.body.services ? req.body.services.split(',').map(s => s.trim()).filter(s => s) : [],
      measurements: req.body.measurements,
      height: req.body.height,
      photos: allPhotos,
      whatsappNumber,
      hasOwnApartment: req.body.hasOwnApartment === 'true',
      hasFantasyWardrobe: req.body.hasFantasyWardrobe === 'true',
      workingHours: {
        start: req.body.workingHoursStart || '00:00',
        end: req.body.workingHoursEnd || '23:59'
      },
      workingDays: parsedDays
    };
    
    if (req.body.isExposed !== undefined) {
      professionalProfile.isExposed = req.body.isExposed === 'true';
    }
    if (req.body.paysMonthlyCharges !== undefined) {
      professionalProfile.paysMonthlyCharges = req.body.paysMonthlyCharges === 'true';
    }

    if (lastPhotoUpdate) professionalProfile.lastPhotoUpdate = lastPhotoUpdate;

    // Safely update the nested location object if location data is provided
    if (req.body.province || req.body.city || req.body.neighborhood || req.body.street !== undefined || req.body.number !== undefined || req.body.floor !== undefined || req.body.apartment !== undefined || req.body.postalCode !== undefined) {
      professionalProfile.location = {
        province: req.body.province || oldProf.location?.province,
        city: req.body.city !== undefined ? req.body.city : oldProf.location?.city,
        neighborhood: req.body.neighborhood !== undefined ? req.body.neighborhood : oldProf.location?.neighborhood,
        street: req.body.street !== undefined ? req.body.street : oldProf.location?.street,
        number: req.body.number !== undefined ? req.body.number : oldProf.location?.number,
        floor: req.body.floor !== undefined ? req.body.floor : oldProf.location?.floor,
        apartment: req.body.apartment !== undefined ? req.body.apartment : oldProf.location?.apartment,
        postalCode: req.body.postalCode !== undefined ? req.body.postalCode : oldProf.location?.postalCode
      };
    }

    if (req.body.quality) {
        const requestedQuality = normalizeQuality(req.body.quality);
        professionalProfile.categoryChangeLog = [...(oldProf.categoryChangeLog || [])];
        if (oldProf.isEvaluationPeriod) {
          professionalProfile.desiredQuality = requestedQuality;
          professionalProfile.quality = oldProf.quality || 'Standard';
        } else {
          const previousQuality = normalizeQuality(oldProf.quality);
          if (requestedQuality !== previousQuality) {
            recordCategoryChange(professionalProfile, previousQuality, requestedQuality);
          }
          professionalProfile.quality = requestedQuality;
        }
    } else {
        professionalProfile.quality = oldProf.quality || 'Standard';
    }
    if (oldProf.desiredQuality && oldProf.isEvaluationPeriod) {
      professionalProfile.desiredQuality = professionalProfile.desiredQuality || oldProf.desiredQuality;
    }

    // Check if sensitive contact/location details were changed
    let sensitiveChanged = false;
    if (req.body.mobilePhone !== undefined && req.body.mobilePhone !== (oldProf.mobilePhone || '')) sensitiveChanged = true;
    if (req.body.street !== undefined && req.body.street !== (oldProf.location?.street || '')) sensitiveChanged = true;
    if (req.body.number !== undefined && req.body.number !== (oldProf.location?.number || '')) sensitiveChanged = true;
    if (req.body.floor !== undefined && req.body.floor !== (oldProf.location?.floor || '')) sensitiveChanged = true;
    if (req.body.apartment !== undefined && req.body.apartment !== (oldProf.location?.apartment || '')) sensitiveChanged = true;

    // Use dot notation to avoid overwriting the entire subdocument
    const fieldsToUpdate = {};
    Object.keys(professionalProfile).forEach(key => {
      fieldsToUpdate[`professionalProfile.${key}`] = professionalProfile[key];
    });
    
    if (req.body.vacationStart && req.body.vacationEnd) {
      const vStart = new Date(req.body.vacationStart);
      const vEnd = new Date(req.body.vacationEnd);
      const diffDays = Math.ceil((vEnd - vStart) / (1000 * 60 * 60 * 24));
      
      let finalEnd = vEnd;
      if (diffDays > 20) {
        finalEnd = new Date(vStart.getTime() + 20 * 24 * 60 * 60 * 1000);
      }
      
      const currentYear = new Date().getFullYear();
      const lastRequestYear = oldProf.vacation?.requestedAt ? oldProf.vacation.requestedAt.getFullYear() : 0;
      
      if (lastRequestYear !== currentYear || !oldProf.vacation?.requestedAt) {
        fieldsToUpdate['professionalProfile.vacation'] = {
          startDate: vStart,
          endDate: finalEnd,
          requestedAt: new Date()
        };
      }
    }

    if (sensitiveChanged && isApproved) {
        fieldsToUpdate.verificationStatus = 'pending';
        fieldsToUpdate.isVerified = false;
        try {
          const adminEmail = config.payment && config.payment.adminEmail ? config.payment.adminEmail : 'admin@drsrv.net.ar';
          sendEmail({ email: adminEmail, subject: 'KuraTe - Re-Verification Required', message: `Professional "${oldProf.alias}" modified their sensitive contact/address details and has been moved back to pending verification.` });
        } catch(e) {}
    }

    const user = await User.findByIdAndUpdate(req.user.id, { $set: fieldsToUpdate }, {
      new: true,
      runValidators: true
    });

    // SMS visibility notice on real transitions (self-service edit). Best-effort:
    // gated by SMS_NOTIFY_VISIBILITY and never blocks the response.
    const exposedChanged = req.body.isExposed !== undefined
      && (req.body.isExposed === 'true') !== Boolean(oldProf.isExposed);
    const vacationJustSet = Boolean(fieldsToUpdate['professionalProfile.vacation']);
    if (exposedChanged) {
      await smsNotifications.notifyVisibilityChange(
        user,
        req.body.isExposed === 'true' ? 'visible' : 'oculto'
      ).catch(() => {});
    } else if (vacationJustSet) {
      await smsNotifications.notifyVisibilityChange(user, 'en vacaciones (inactivo)').catch(() => {});
    }

    // Sync the many-to-many Specialties table
    if (req.body.services !== undefined) {
      await Specialty.deleteMany({ user: user._id });
      if (professionalProfile.services.length > 0) {
        const specialtyDocs = professionalProfile.services.map(s => ({
          user: user._id,
          specialty: s
        }));
        await Specialty.insertMany(specialtyDocs).catch(err => console.error('Failed to sync specialties table:', err.message));
      }
    }

    const clientIp = req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : (req.socket ? req.socket.remoteAddress : req.ip);
    await ActivityLog.create({
      professional: user._id,
      action: 'update_profile',
      ipAddress: clientIp,
      userAgent: req.headers['user-agent'],
      isGuest: false
    });

    // Notify admin of profile update
    try {
      const adminEmail = config.payment && config.payment.adminEmail ? config.payment.adminEmail : 'admin@drsrv.net.ar';
      await sendEmail({
        email: adminEmail,
        subject: 'KuraTe - Professional Profile Updated',
        message: `The professional "${professionalProfile.alias}" (${user.email}) has updated their profile.`
      });
    } catch (err) { console.error('Failed to notify admin:', err.message); }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Resubmit verification documents after admin rejection (photos_unclear / photo_info_mismatch)
// @route   POST /api/v1/professionals/resubmit-verification
// @access  Private/Professional
exports.resubmitVerification = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'professional') {
      return res.status(404).json({ success: false, error: 'Professional not found' });
    }
    if (!user.allowResubmission) {
      return res.status(400).json({ success: false, error: 'Resubmission is not allowed for your account.' });
    }
    if (!req.files || req.files.length < 3) {
      return res.status(400).json({ success: false, error: 'All three verification photos are required (ID front, ID back, selfie).' });
    }

    const fs = require('fs');
    const verificationDocuments = [];
    for (const file of req.files) {
      const base64Data = fs.readFileSync(file.path, 'base64');
      verificationDocuments.push(`data:${file.mimetype};base64,${base64Data}`);
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    }

    user.verificationDocuments = verificationDocuments;
    user.verificationStatus = 'pending';
    user.allowResubmission = false;
    user.isVerified = false;
    await user.save();

    try {
      const adminEmail = config.payment && config.payment.adminEmail ? config.payment.adminEmail : 'admin@drsrv.net.ar';
      await sendEmail({
        email: adminEmail,
        subject: 'KuraTe - Verification Documents Resubmitted',
        message: `Professional "${user.professionalProfile?.alias || user.email}" has resubmitted verification documents after rejection (${user.rejectionReason || 'n/a'}).\n\nPlease review in Pending Approvals.`
      });
    } catch (err) {
      console.error('Failed to notify admin of resubmission:', err.message);
    }

    const clientIp = req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : (req.socket ? req.socket.remoteAddress : req.ip);
    await ActivityLog.create({
      professional: user._id,
      action: 'resubmit_verification',
      ipAddress: clientIp,
      userAgent: req.headers['user-agent'],
      isGuest: false
    });

    res.status(200).json({
      success: true,
      message: 'Verification documents submitted. Our team will review them shortly.',
      data: {
        verificationStatus: user.verificationStatus,
        allowResubmission: user.allowResubmission
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Redirect to Professional's Phone (Anti-Scraping Protection)
// @route   GET /api/v1/professionals/:alias/phone
// @access  Public
exports.contactPhone = async (req, res, next) => {
  try {
    const aliasRegex = new RegExp(`^${req.params.alias}$`, 'i');
    const professional = await User.findOne({ 
      'professionalProfile.alias': aliasRegex,
      ...ALIAS_LOOKUP_FILTER
    }).select('professionalProfile.whatsappNumber professionalProfile.mobilePhone professionalProfile.alias');

    const contactNumber = professional ? resolveWhatsappNumber(professional.professionalProfile) : '';
    if (!professional || !contactNumber) {
      return res.status(404).send('Phone contact not available for this professional.');
    }

    const cleanNumber = contactNumber.replace(/\D/g, '');
    const phoneUrl = `tel:+${cleanNumber}`;

    // Track the Phone Click Activity
    try {
      const clientIp = req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : (req.socket ? req.socket.remoteAddress : req.ip);
      await ActivityLog.create({
        professional: professional._id,
        action: 'phone_click',
        ipAddress: clientIp,
        userAgent: req.headers['user-agent'],
        isGuest: false
      });

      const today = new Date().toISOString().split('T')[0];
      await Statistic.findOneAndUpdate(
        { professionalId: professional._id, date: today },
        { $inc: { callCount: 1 }, $set: { time: new Date() } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch(err) { console.error('Activity log error:', err.message); }

    res.redirect(phoneUrl);
  } catch (error) {
    res.status(400).send('Unable to redirect to phone.');
  }
};

function tryDeleteUploadFile(storedPath) {
  if (!isUploadPath(storedPath)) return;
  const absolutePath = path.join(config.root, 'public', storedPath.replace(/^\//, ''));
  try {
    if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
  } catch (err) {
    console.error('Failed to delete upload file:', err.message);
  }
}

// @desc    User-initiated profile deletion — hidden from public; data retained server-side
// @route   DELETE /api/v1/professionals/me
// @access  Private (Professional)
exports.deleteMyProfile = async (req, res, next) => {
  try {
    const { password } = req.body || {};
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ success: false, error: 'Please provide your password to confirm account deletion' });
    }

    const userId = req.user.id || req.user._id;
    const user = await User.findById(userId).select('+password');
    if (!user || user.role !== 'professional') {
      return res.status(404).json({ success: false, error: 'Professional account not found' });
    }

    if (user.accountDeletedAt) {
      return res.status(200).json({
        success: true,
        message: 'Your profile has been permanently deleted.'
      });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Incorrect password. Please try again.' });
    }

    user.accountDeletedAt = new Date();
    if (user.professionalProfile) {
      user.professionalProfile.isExposed = false;
      user.professionalProfile.subscriptionStatus = 'suspended';
    }
    await user.save();

    try {
      await ActivityLog.create({
        professional: user._id,
        action: 'account_soft_deleted',
        actorType: 'professional',
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] ? String(req.headers['user-agent']).slice(0, 500) : undefined,
        details: { alias: user.professionalProfile?.alias || null }
      });
    } catch (err) {
      console.error('Failed to log account soft delete:', err.message);
    }

    res.status(200).json({
      success: true,
      message: 'Your profile has been permanently deleted.'
    });
  } catch (error) {
    next(error);
  }
};


exports.getServiceTree = async (req, res) => {
  try {
    const serviceTree = require('../data/serviceTree');
    res.json({ success: true, data: serviceTree });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Save hogar professional services
// @route   PUT /api/v1/professionals/hogar/services
// @access  Private/Professional
exports.updateHogarServices = async (req, res) => {
  try {
    const {
      services, scope, experience, certifications, photos,
      firstName, lastName, companyName, taxId,
      birthDate, activityStartDate,
      address,
      contact,
      category, action, actionDetails, area, specialty, availability, description
    } = req.body;
    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'professional' || user.professionalType !== 'hogar') {
      return res.status(400).json({ success: false, error: 'Hogar professional not found' });
    }

    const hp = user.hogarProfile || {};

    if (firstName !== undefined) hp.firstName = firstName;
    if (lastName !== undefined) hp.lastName = lastName;
    if (companyName !== undefined) hp.companyName = companyName;
    if (taxId !== undefined) hp.taxId = taxId;
    if (birthDate !== undefined && birthDate) hp.birthDate = new Date(birthDate);
    if (activityStartDate !== undefined && activityStartDate) hp.activityStartDate = new Date(activityStartDate);
    if (address !== undefined) {
      hp.address = {
        street: address.street,
        number: address.number,
        floor: address.floor,
        apartment: address.apartment,
        neighborhood: address.neighborhood,
        city: address.city,
        province: address.province,
        postalCode: address.postalCode,
        country: address.country
      };
    }
    if (contact !== undefined) {
      hp.contact = {
        email: contact.email,
        mobilePhone: contact.mobilePhone,
        whatsapp: Boolean(contact.whatsapp),
        telegram: Boolean(contact.telegram)
      };
    }
    if (category !== undefined) hp.category = category;
    if (action !== undefined) hp.action = action;
    if (actionDetails !== undefined) hp.actionDetails = actionDetails;
    if (area !== undefined) hp.area = area;
    if (specialty !== undefined) hp.specialty = specialty;
    if (availability !== undefined) hp.availability = availability;
    if (description !== undefined) hp.description = description;

    if (services !== undefined) hp.services = services || [];
    if (photos !== undefined) hp.photos = photos || [];
    if (scope) hp.scope = scope;
    if (experience !== undefined) hp.experience = experience;
    if (certifications) hp.certifications = certifications;

    user.hogarProfile = hp;
    await user.save();
    res.json({ success: true, data: user.hogarProfile });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

function tryDeleteUploadFile(storedPath) {
  if (!isUploadPath(storedPath)) return;
  const absolutePath = path.join(config.root, 'public', storedPath.replace(/^\//, ''));
  try {
    if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
  } catch (err) {
    console.error('Failed to delete upload file:', err.message);
  }
}

// @desc    User-initiated profile deletion — hidden from public; data retained server-side
// @route   DELETE /api/v1/professionals/me
// @access  Private (Professional)
exports.deleteMyProfile = async (req, res, next) => {
  try {
    const { password } = req.body || {};
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ success: false, error: 'Please provide your password to confirm account deletion' });
    }

    const userId = req.user.id || req.user._id;
    const user = await User.findById(userId).select('+password');
    if (!user || user.role !== 'professional') {
      return res.status(404).json({ success: false, error: 'Professional account not found' });
    }

    if (user.accountDeletedAt) {
      return res.status(200).json({
        success: true,
        message: 'Your profile has been permanently deleted.'
      });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Incorrect password. Please try again.' });
    }

    user.accountDeletedAt = new Date();
    if (user.professionalProfile) {
      user.professionalProfile.isExposed = false;
      user.professionalProfile.subscriptionStatus = 'suspended';
    }
    await user.save();

    try {
      await ActivityLog.create({
        professional: user._id,
        action: 'account_soft_deleted',
        actorType: 'professional',
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] ? String(req.headers['user-agent']).slice(0, 500) : undefined,
        details: { alias: user.professionalProfile?.alias || null }
      });
    } catch (err) {
      console.error('Failed to log account soft delete:', err.message);
    }

    res.status(200).json({
      success: true,
      message: 'Your profile has been permanently deleted.'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Public directory of Hogar/Oficina technicians (search/filter engine)
// @route   GET /api/v1/hogar/professionals
// @access  Public
exports.getHogarProfessionals = async (req, res, next) => {
  try {
    const b64 = (v) => (v ? Buffer.from(String(v)).toString('base64') : '');
    const query = {
      role: 'professional',
      professionalType: 'hogar',
      accountDeletedAt: null,
      isVerified: true,
      verificationStatus: 'approved'
    };

    if (req.query.area && req.query.area.trim()) {
      query['hogarProfile.area'] = req.query.area.trim();
    }
    if (req.query.action && req.query.action.trim()) {
      query['hogarProfile.action'] = req.query.action.trim();
    }
    if (req.query.category && req.query.category.trim()) {
      query['hogarProfile.category'] = req.query.category.trim();
    }
    if (req.query.availability && req.query.availability.trim()) {
      query['hogarProfile.availability'] = req.query.availability.trim();
    }
    if (req.query.province && req.query.province.trim()) {
      query['hogarProfile.address.province'] = { $regex: req.query.province.trim(), $options: 'i' };
    }
    if (req.query.city && req.query.city.trim()) {
      query['hogarProfile.address.city'] = { $regex: req.query.city.trim(), $options: 'i' };
    }
    if (req.query.neighborhood && req.query.neighborhood.trim()) {
      query['hogarProfile.address.neighborhood'] = { $regex: req.query.neighborhood.trim(), $options: 'i' };
    }
    // service filter: matches any selected service node path (prefix match)
    if (req.query.service && req.query.service.trim()) {
      const svc = req.query.service.trim();
      query['hogarProfile.services.path'] = { $regex: `^${svc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` };
    }
    // brand filter: matches any service's brands array
    if (req.query.brand && req.query.brand.trim()) {
      query['hogarProfile.services.brands'] = { $regex: req.query.brand.trim(), $options: 'i' };
    }

    const page = parseInt(req.query.page, 10) || 1;
    const parsedLimit = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 12;
    const skip = (page - 1) * limit;

    const users = await User.find(query).select(
      'name email hogarProfile.firstName hogarProfile.lastName hogarProfile.companyName ' +
      'hogarProfile.action hogarProfile.area hogarProfile.category hogarProfile.specialty ' +
      'hogarProfile.services hogarProfile.photos hogarProfile.availability hogarProfile.address ' +
      'hogarProfile.contact'
    ).skip(skip).limit(limit).lean();

    const total = await User.countDocuments(query);
    const hasMore = skip + users.length < total;

    const data = users.map(u => {
      const hp = u.hogarProfile || {};
      const services = hp.services || [];
      const primary = services[0] || {};
      const photo = (hp.photos && hp.photos[0]) ? hp.photos[0] : null;
      const loc = hp.address || {};
      const locationLine = (loc.province || '').toLowerCase() === 'caba'
        ? [loc.neighborhood, 'CABA'].filter(Boolean).join(', ')
        : [loc.neighborhood, loc.city].filter(Boolean).join(', ');
      const rawContact = hp.contact || {};
      const contact = {
        whatsapp: Boolean(rawContact.whatsapp),
        telegram: Boolean(rawContact.telegram),
        mobilePhone: b64(rawContact.mobilePhone),
        email: b64(rawContact.email),
        telegramId: b64(rawContact.telegram)
      };
      return {
        _id: u._id,
        name: hp.firstName ? `${hp.firstName} ${hp.lastName || ''}`.trim() : (u.name || 'Técnico'),
        action: hp.action || '',
        actionDetails: hp.actionDetails || '',
        area: hp.area || '',
        category: hp.category || '',
        specialty: hp.specialty || '',
        availability: hp.availability || '',
        serviceName: primary.name || '',
        brands: primary.brands || [],
        photo,
        photoUrl: photo,
        location: locationLine,
        whatsapp: Boolean(hp.contact && hp.contact.whatsapp),
        telegram: Boolean(hp.contact && hp.contact.telegram),
        contact,
        services
      };
    });

    res.status(200).json({
      success: true,
      count: data.length,
      pagination: { total, page, limit, hasMore },
      data
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get a single hogar professional by id (public)
// @route   GET /api/v1/hogar/professionals/:id
exports.getHogarProfessionalById = async (req, res, next) => {
  try {
    const b64 = (v) => (v ? Buffer.from(String(v)).toString('base64') : '');
    const user = await User.findOne({
      _id: req.params.id,
      role: 'professional',
      professionalType: 'hogar',
      accountDeletedAt: null,
      isVerified: true,
      verificationStatus: 'approved'
    }).select('name email hogarProfile').lean();

    if (!user) {
      return res.status(404).json({ success: false, error: 'Técnico no encontrado' });
    }

    const hp = user.hogarProfile || {};
    const rawContact = hp.contact || {};
    const contact = {
      whatsapp: Boolean(rawContact.whatsapp),
      telegram: Boolean(rawContact.telegram),
      mobilePhone: b64(rawContact.mobilePhone),
      email: b64(rawContact.email),
      telegramId: b64(rawContact.telegram)
    };
    const photos = (hp.photos && hp.photos.length) ? hp.photos : [];

    try {
      const clientIp = req.headers['x-forwarded-for']
        ? req.headers['x-forwarded-for'].split(',')[0].trim()
        : (req.socket ? req.socket.remoteAddress : req.ip);
      await ActivityLog.create({
        professional: user._id,
        action: 'profile_view',
        ipAddress: clientIp,
        userAgent: req.headers['user-agent'],
        isGuest: true
      });
    } catch (err) { console.error('Activity log error:', err.message); }

    const { contact: _omit, ...hpClean } = hp;
    res.status(200).json({
      success: true,
      data: {
        _id: user._id,
        name: hp.firstName ? `${hp.firstName} ${hp.lastName || ''}`.trim() : (user.name || 'Técnico'),
        email: b64(user.email),
        contact,
        hogarProfile: { ...hpClean, photos }
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

