const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const config = require('../config/appConfig');
const ActivityLog = require('../models/ActivityLog');
const sendEmail = require('../sendEmail');
const Specialty = require('../models/Specialty');
const Profession = require('../models/Profession');
const Statistic = require('../models/Statistic');
const Review = require('../models/Review');
const { assignGpsToLocation } = require('../utils/cityCoordinates');
const { servicePrefixRegex, servicePathMatches, servicePathDepth, normalizeServicePath, servicePathPrefixes, servicePathLookupValues, escapeRegex } = require('../utils/servicePathMatch');
const { sanitizeServices, brandDisplayName } = require('../utils/otraBrand');
const { esCaba, entesEsperados, padronParaVerificar, validarVerificacion, aplicarEstadoVerificacion, ENTES } = require('../utils/matriculaRules');
const { flexibleTextRegex } = require('../utils/flexibleText');
function normalizeAlias(s){ if(!s) return s; return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim(); }
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
const Aviso = require('../models/Aviso');

const ALIAS_LOOKUP_FILTER = { role: 'professional', accountDeletedAt: null };
const DEFAULT_WORKING_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// El enum legacy de hogarProfile.area usa 'pime'; el arbol canonico lo llamo
// 'casa-campo'. Aceptamos ambos en la URL para no romper links ya indexados.
const AREA_ALIAS_PIME = new Set(['pime', 'casa-de-campo', 'campo']);

// La matricula habilitante es un documento PRIVADO: el numero y el archivo
// nunca salen en listados publicos. Solo viaja si el propio profesional la
// pidio, y el listado muestra el estado de verificacion como insignia.
function sanitizePublicProfessions(prof) {
  if (!prof || typeof prof !== 'object') return prof;
  const clone = { ...prof };
  ['hogarProfile', 'professionalProfile'].forEach((k) => {
    const p = clone[k];
    if (!p || !Array.isArray(p.professions)) return;
    p.professions = p.professions.map(({ slug, name, matriculado, matriculaVerificada, matriculaRechazada }) => ({
      slug, name,
      matriculado: !!matriculado,
      matriculaVerificada: !!matriculaVerificada,
      matriculaRechazada: !!matriculaRechazada
    }));
  });
  if (Array.isArray(clone.professions)) {
    clone.professions = clone.professions.map(({ slug, name, matriculado, matriculaVerificada, matriculaRechazada }) => ({
      slug, name,
      matriculado: !!matriculado,
      matriculaVerificada: !!matriculaVerificada,
      matriculaRechazada: !!matriculaRechazada
    }));
  }
  return clone;
}

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
    let query = {
      role: 'professional',
      accountDeletedAt: null,
      $or: [
        { verificationStatus: 'approved' },
        { verificationStatus: { $exists: false } },
        { verificationStatus: null }
      ]
    };

    // Only professionals with an active/expiring aviso
    const activeAvisoProfessionals = await Aviso.distinct('professional', { status: { $in: ['active', 'expiring'] } });
    if (activeAvisoProfessionals.length === 0) {
      return res.status(200).json({ success: true, count: 0, pagination: { page: 1, limit: 0, total: 0, hasMore: false }, data: [] });
    }
    query._id = { $in: activeAvisoProfessionals };

    // Filter by Quality (formerly Tier)
    if (req.query.quality && req.query.quality.trim()) {
      query['professionalProfile.quality'] = req.query.quality.trim();
    }

    // Filter by Alias (partial match)
    if (req.query.alias && req.query.alias.trim()) {
      query['professionalProfile.alias'] = { $regex: escapeRegex(req.query.alias.trim()), $options: 'i' };
    }

    // Filter by Specialty (searches both professionalProfile.services and hogarProfile.services)
    if (req.query.specialty && req.query.specialty.trim()) {
      const specialties = req.query.specialty.trim().split(',').map(s => s.trim()).filter(Boolean);
      if (specialties.length > 0) {
        // Use flexible matching: treat . and / as interchangeable path separators
        const specialtyRegexes = specialties.map(s => {
          const flexible = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            .replace(/\\\./g, '[./]')
            .replace(/\\\//g, '[./]');
          return new RegExp('^' + flexible, 'i');
        });
        query.$and = query.$and || [];
        query.$and.push({ $or: [
          { 'professionalProfile.services': { $in: specialtyRegexes } },
          { 'hogarProfile.services.path': { $in: specialtyRegexes } }
        ]});
      }
    }

    // Hierarchical Location Search (checks both professionalProfile.location and hogarProfile.address)
    if (req.query.province && req.query.province.trim()) {
      const provRegex = { $regex: escapeRegex(req.query.province.trim()), $options: 'i' };
      query.$and = query.$and || [];
      query.$and.push({ $or: [
        { 'professionalProfile.location.province': provRegex },
        { 'hogarProfile.address.province': provRegex }
      ]});
    }
    if (req.query.city && req.query.city.trim()) {
      const cityRegex = { $regex: escapeRegex(req.query.city.trim()), $options: 'i' };
      query.$and = query.$and || [];
      query.$and.push({ $or: [
        { 'professionalProfile.location.city': cityRegex },
        { 'hogarProfile.address.city': cityRegex }
      ]});
    }
    if (req.query.neighborhood && req.query.neighborhood.trim()) {
      const hoodRegex = { $regex: escapeRegex(req.query.neighborhood.trim()), $options: 'i' };
      query.$and = query.$and || [];
      query.$and.push({ $or: [
        { 'professionalProfile.location.neighborhood': hoodRegex },
        { 'hogarProfile.address.neighborhood': hoodRegex }
      ]});
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
      'professionalProfile.photos': 1,
      'professionalProfile.budgetType': 1,
      'professionalProfile.budgetAmount': 1,
      'professionalProfile.responseSpeed': 1,
      'hogarProfile.firstName': 1,
      'hogarProfile.lastName': 1,
      'hogarProfile.companyName': 1,
      'hogarProfile.services': 1,
      'hogarProfile.action': 1,
      'hogarProfile.area': 1,
      'hogarProfile.availability': 1,
      'hogarProfile.photos': 1,
      'hogarProfile.professions': 1,
      'hogarProfile.address': 1,
      'hogarProfile.contact': 1,
      'name': 1,
      'professionalType': 1
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
    const { accion, descripcion, service, model, brand, provincia, ciudad, urgencia, relaxBrand, relaxModel, userLat, userLng } = req.query;
    const uLat = parseFloat(userLat) || null;
    const uLng = parseFloat(userLng) || null;

    const baseFilter = {
      role: 'professional',
      accountDeletedAt: null,
      $or: [
        { verificationStatus: 'approved' },
        { verificationStatus: { $exists: false } },
        { verificationStatus: null }
      ]
    };
    // Only professionals with an active/expiring aviso
    const activeAvisoProfessionals = await Aviso.distinct('professional', { status: { $in: ['active', 'expiring'] } });
    if (activeAvisoProfessionals.length === 0) {
      return res.status(200).json({ results: [], suggestions: [] });
    }
    baseFilter._id = { $in: activeAvisoProfessionals };
    baseFilter.$and = baseFilter.$and || [];
    baseFilter.$and.push({
      $or: [
        { 'professionalProfile.alias': { $exists: true, $ne: '' }, 'professionalProfile.services': { $exists: true, $not: { $size: 0 } } },
        { 'hogarProfile.firstName': { $exists: true, $ne: '' }, 'hogarProfile.services': { $exists: true, $not: { $size: 0 } } }
      ]
    });

    if (provincia && provincia.trim()) {
      const provRaw = provincia.trim();
      const provLower = provRaw.toLowerCase();
      // Texto de usuario dentro de $regex: hay que escapar.
      const provRe = escapeRegex(provRaw);
      const provRegexes = [{ $regex: provRe, $options: 'i' }];
      if (provLower === 'caba') provRegexes.push({ $regex: 'Ciudad Autónoma de Buenos Aires', $options: 'i' });
      if (provLower.includes('ciudad autonoma') || provLower.includes('ciudad aut_noma')) provRegexes.push({ $regex: '^CABA$', $options: 'i' });
      const provOr = [];
      for (const pr of provRegexes) {
        provOr.push({ 'professionalProfile.location.province': pr });
        provOr.push({ 'hogarProfile.address.province': pr });
      }
      baseFilter.$and = baseFilter.$and || [];
      baseFilter.$and.push({ $or: provOr });
    }
    if (ciudad && ciudad.trim()) {
      baseFilter.$and = baseFilter.$and || [];
      baseFilter.$and.push({
        $or: [
          { 'professionalProfile.location.city': { $regex: ciudad.trim(), $options: 'i' } },
          { 'hogarProfile.address.city': { $regex: ciudad.trim(), $options: 'i' } }
        ]
      });
    }
    const quiereMatriculado = req.query.matriculado === '1' || req.query.matriculado === 'true';
    if (req.query.profession && req.query.profession.trim()) {
      const profRaw = String(req.query.profession).trim();
      const profSlug = profRaw.toLowerCase().replace(/\s+/g, '-');
      // Texto de usuario dentro de $regex: hay que escapar (ver searchProfessionals).
      const profRe = escapeRegex(profRaw);
      const orProf = quiereMatriculado ? [
        { 'professionalProfile.professions': { $elemMatch: { slug: profSlug, matriculado: true } } },
        { 'hogarProfile.professions': { $elemMatch: { slug: profSlug, matriculado: true } } }
      ] : [
        { 'professionalProfile.professions.slug': profSlug },
        { 'hogarProfile.professions.slug': profSlug },
        { 'professionalProfile.professions.name': { $regex: profRe, $options: 'i' } },
        { 'hogarProfile.professions.name': { $regex: profRe, $options: 'i' } }
      ];
      baseFilter.$and = baseFilter.$and || [];
      baseFilter.$and.push({ $or: orProf });
    } else if (quiereMatriculado) {
      baseFilter.$and = baseFilter.$and || [];
      baseFilter.$and.push({ $or: [
        { 'professionalProfile.professions': { $elemMatch: { matriculado: true } } },
        { 'hogarProfile.professions': { $elemMatch: { matriculado: true } } }
      ]});
    }
    const isCabaBarrio = ciudad && ciudad.trim() && provincia && provincia.trim().toLowerCase() === 'caba';

    // New: structured service search from dropdowns
    const searchTerms = new Set();
    let patterns = [];
    let plan = { brand: '', model: '', keywords: [], serviceCategory: '' };

    if (service && service.trim()) {
      const parts = service.split('/');
      parts.forEach(p => { if (p) searchTerms.add(p.replace(/-/g, ' ')); });
      patterns = [...searchTerms].map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

        // Matching jerarquico: buscar un area/categoria/dispositivo devuelve
        // tambien quien guardo cualquier descendiente. Sin que 'heladera'
        // matchee 'heladeras-industriales' (era substring match).
        //
        // servicePaths es un array con todos los prefijos del path guardado, asi
        // que un $in de UN solo valor (el path buscado completo) matchea a la vez
        // el path exacto, cualquier descendiente y el mismo dispositivo con la
        // marca. Es igualdad pura: MongoDB acota el indice en vez de collscannear.
        const lookupValues = servicePathLookupValues(service);
        if (lookupValues) {
          baseFilter.$and = baseFilter.$and || [];
          baseFilter.$and.push({
            $or: [
              // professionalProfile.services guarda strings con '.' y marca
              { 'professionalProfile.servicePaths': { $in: lookupValues } },
              // hogarProfile.services guarda objetos; path con '/' o '.'
              { 'hogarProfile.servicePaths': { $in: lookupValues } }
            ]
          });
        } else {
          // Solo un segmento (landings SEO mandan service=heladera sin area):
          // hay que buscarlo en cualquier posicion de la ruta, lo resuelve el
          // regex. Es el camino frio, no merece la desnormalizacion.
          const svcRegex = servicePrefixRegex(service);
          if (svcRegex) {
            baseFilter.$and = baseFilter.$and || [];
            baseFilter.$and.push({
              $or: [
                // professionalProfile.services guarda strings con '.' y marca
                { 'professionalProfile.services': { $regex: svcRegex, $options: 'i' } },
                // hogarProfile.services guarda objetos; path con '/' o '.'
                { 'hogarProfile.services.path': { $regex: svcRegex, $options: 'i' } }
              ]
            });
          }
        }
    }

    // Legacy: still support descripcion if provided
    if (descripcion && descripcion.trim() && !service) {
      const badWord = hasInappropriateWords(descripcion);
      if (badWord) return res.status(400).json([]);

      const matchedCats = matchCategories(descripcion);
      const keywords = extractKeywords(descripcion);
      const aiResult = await analyzeQuery(descripcion);
      plan = buildSearchPlan(aiResult, { accion, provincia, ciudad, urgencia });

      for (const c of matchedCats) {
        if (c.service) searchTerms.add(c.service.toLowerCase());
        if (c.subcategory) searchTerms.add(c.subcategory.toLowerCase());
        if (c.category) searchTerms.add(c.category.toLowerCase());
      }
      for (const k of keywords) { if (k.length > 2) searchTerms.add(k); }
      if (plan.keywords.length) { for (const k of plan.keywords) searchTerms.add(k.toLowerCase()); }
      if (plan.serviceCategory) searchTerms.add(plan.serviceCategory.toLowerCase());
      patterns = [...searchTerms].map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    }

    // Fetch base results and score in JS for maintainability
    let professionals = await User.find(baseFilter)
      .select({
        'professionalProfile.alias': 1,
        'professionalProfile.bio': 1,
        'professionalProfile.location': 1,
        'professionalProfile.services': 1,
        'professionalProfile.professions': 1,
        'professionalProfile.photos': 1,
        'professionalProfile.whatsappNumber': 1,
        'professionalProfile.mobilePhone': 1,
        'professionalProfile.usesWhatsApp': 1,
        'hogarProfile.firstName': 1,
        'hogarProfile.lastName': 1,
        'hogarProfile.bio': 1,
        'hogarProfile.area': 1,
        'hogarProfile.action': 1,
        'hogarProfile.services': 1,
        'hogarProfile.professions': 1,
        'hogarProfile.photos': 1,
        'hogarProfile.availability': 1,
        'hogarProfile.address': 1,
        'hogarProfile.contact': 1,
        name: 1,
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

    // Global brand/model queries (used in scoring + suggestions)
    const brandQuery = (relaxBrand ? '' : (brand || plan.brand || '')).toLowerCase().trim();
    const modelQuery = (relaxModel ? '' : (model || plan.model || '')).toLowerCase().trim();

    // Global weights for percentage calculation
    const W_ACTION = 5, W_URGENCY = 5, W_SERVICE = 30, W_BIO = 10, W_BRAND = 25, W_MODEL = 25, W_LOCATION = 15;
    const usedBrand = !!brandQuery;
    const usedModel = !!modelQuery;

    // Score each professional — calculate match percentage (0-100)
    const scored = professionals.map(p => {
      // Support both professionalProfile and hogarProfile — prefer one with services
      let pp = p.professionalProfile || p.hogarProfile || {};
      const ppHasServices = Array.isArray(pp.services) && pp.services.length > 0;
      if (!ppHasServices && p.hogarProfile && Array.isArray(p.hogarProfile.services) && p.hogarProfile.services.length > 0) {
        pp = p.hogarProfile;
      }
      // Conservar path y name por separado. Antes se usaba (s.name || s.path),
      // pero hogarProfile.services[].name es required, asi que el path NUNCA se
      // comparaba y el matching jerarquico era imposible en el scoring.
      const svcEntries = Array.isArray(pp.services) ? pp.services.map(s => {
        if (typeof s === 'string') {
          const p = normalizeServicePath(s);
          return { path: p, name: s.toLowerCase() };
        }
        return { path: normalizeServicePath(s.path || ''), name: String(s.name || '').toLowerCase() };
      }).filter(e => e.path || e.name) : [];
      const svcs = svcEntries.map(e => e.name || e.path);
      const bio = (pp.bio || '').toLowerCase();
      const photos = Array.isArray(pp.photos) ? pp.photos : [];
      const firstPhoto = photos.length ? photos[0] : null;
      const avgRating = p._averageRating || 0;
      let score = 0;
      let maxPossible = 0;

      // Weights for percentage calculation — only count relevant weights
      maxPossible = W_ACTION + W_URGENCY + W_SERVICE + W_BIO + W_LOCATION + (usedBrand ? W_BRAND : 0) + (usedModel ? W_MODEL : 0);

      if (accion) score += W_ACTION;
      if (urgencia) score += W_URGENCY;

      // Service match. Primero matching jerarquico sobre el path: buscar un
      // area/categoria encuentra a quien guardo cualquier descendiente.
      let serviceMatched = false;
      if (service) {
        const wanted = normalizeServicePath(service);
        for (const e of svcEntries) {
          if (e.path && servicePathMatches(e.path, wanted)) { serviceMatched = true; break; }
        }
      }
      // Fallback texto: cubre la rama legada de 'descripcion' y los nombres
      // legibles. Se evita el 'includes' bidireccional (causaba falsos positivos).
      if (!serviceMatched) {
        for (const pat of patterns) {
          for (const e of svcEntries) {
            if ((e.name && e.name.includes(pat)) || (e.path && e.path.includes(pat))) { serviceMatched = true; break; }
          }
          if (serviceMatched) break;
        }
      }
      if (serviceMatched) score += W_SERVICE;

      // Bio keyword matches
      let bioMatchCount = 0;
      for (const pat of patterns) {
        if (bio.includes(pat)) bioMatchCount++;
      }
      if (bioMatchCount > 0) {
        score += Math.min(W_BIO, bioMatchCount * 5);
      }

      // Brand match: exact brand match gets full score, generic equipment match gets partial
      let brandMatched = false;
      let brandGeneric = false;
      if (brandQuery) {
        const inBio = bio.includes(brandQuery);
        const inServices = svcs.some(s => s.includes(brandQuery));
        if (inBio || inServices) {
          score += W_BRAND;
          brandMatched = true;
        } else if (service) {
          // Check if pro repairs the same equipment generically (without the specific brand)
          const deviceName = service.split('/').filter(Boolean).slice(-1)[0] || '';
          const hasGenericEquipment = svcs.some(s => {
            const sParts = s.split('/').filter(Boolean);
            return sParts.length >= 3 && sParts[sParts.length - 1] === deviceName;
          });
          if (hasGenericEquipment) {
            score += Math.round(W_BRAND / 2);
            brandGeneric = true;
          }
        }
      }

      // Model match: exact model match gets full score, generic equipment match gets partial
      let modelMatched = false;
      let modelGeneric = false;
      if (modelQuery) {
        const inBio = bio.includes(modelQuery);
        const inServices = svcs.some(s => s.includes(modelQuery));
        if (inBio || inServices) {
          score += W_MODEL;
          modelMatched = true;
        } else if (service) {
          const deviceName = normalizeServicePath(service).split('/').filter(Boolean).slice(-1)[0] || '';
          // Comparar el ULTIMO segmento del path guardado contra el dispositivo
          // buscado. Se usa e.path (normalizado) y no svcs: antes se partia con
          // '/' un valor que venia en formato 'a.b.c' o que era el name legible,
          // por lo que sParts nunca tenia 3 elementos y esto siempre daba false.
          const hasGenericEquipment = !!deviceName && svcEntries.some(e => {
            const sParts = e.path.split('/').filter(Boolean);
            return sParts.length >= 3 && sParts[sParts.length - 1] === deviceName;
          });
          if (hasGenericEquipment) {
            score += Math.round(W_MODEL / 2);
            modelGeneric = true;
          }
        }
      }

      // Location boost — scaled by distance
      let distCalc = null;
      if (uLat && uLng && pp.location?.lat && pp.location?.lng) {
        const R = 6371;
        const dLat = (pp.location.lat - uLat) * Math.PI / 180;
        const dLng = (pp.location.lng - uLng) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 + Math.cos(uLat*Math.PI/180)*Math.cos(pp.location.lat*Math.PI/180)*Math.sin(dLng/2)**2;
        distCalc = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
      }
      // Province match — full weight if <=6km, half if <=15km, zero if >15km
      if (provincia && pp.location?.province) {
        if (pp.location.province.toLowerCase() === provincia.toLowerCase()) {
          if (distCalc == null || distCalc <= 6) score += W_LOCATION;
          else if (distCalc <= 15) score += Math.floor(W_LOCATION / 2);
        }
      }
      // City/barrio match — bonus if close
      if (ciudad && pp.location?.city) {
        if (pp.location.city.toLowerCase() === ciudad.toLowerCase()) {
          if (distCalc == null || distCalc <= 6) score += Math.floor(W_LOCATION / 2);
          else if (distCalc <= 15) score += Math.floor(W_LOCATION / 4);
        }
      }

      // Rating boost — reduced for distant professionals
      const ratingBoost = Math.round(avgRating * 2);
      if (distCalc != null && distCalc > 15) score += Math.floor(ratingBoost / 3);
      else if (distCalc != null && distCalc > 6) score += Math.floor(ratingBoost / 2);
      else score += ratingBoost;

      // Calculate percentage
      const pct = Math.round((score / maxPossible) * 100);

      // If user provided brand or model (and not relaxed), at least one must match
      // "match" means either exact brand/model OR generic equipment match
      const hasBrandOrModelQuery = (brandQuery || modelQuery) && !relaxBrand && !relaxModel;
      const mustMatch = hasBrandOrModelQuery && !brandMatched && !brandGeneric && !modelMatched && !modelGeneric;

      // Distance from user (if GPS provided)
      let distance = null;
      const pLat = pp.location?.lat;
      const pLng = pp.location?.lng;
      if (uLat && uLng && pLat && pLng) {
        const R = 6371;
        const dLat = (pLat - uLat) * Math.PI / 180;
        const dLng = (pLng - uLng) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(uLat*Math.PI/180) * Math.cos(pLat*Math.PI/180) * Math.sin(dLng/2) * Math.sin(dLng/2);
        distance = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
      }

      return {
        id: p._id,
        score,
        pct,
        alias: pp.alias || [pp.firstName, pp.lastName].filter(Boolean).join(' ') || 'Profesional',
        bio: pp.bio || '',
        location: [pp.location?.city || pp.address?.city, pp.location?.province || pp.address?.province].filter(Boolean).join(', '),
        lat: pLat || null,
        lng: pLng || null,
        distance,
        services: svcs,
        professions: pp.professions && pp.professions.length ? pp.professions : (p.hogarProfile && p.hogarProfile.professions) || [],
        photo: firstPhoto,
        email: p.email,
        // Contact flags: the cards render WhatsApp/Telegram badges from these.
        // Uses the same resolution as getHogarProfessionals so both lists agree.
        whatsapp: (() => {
          const hc = (p.hogarProfile && p.hogarProfile.contact) || {};
          if (hc.whatsapp) return true;
          const profProfile = p.professionalProfile || {};
          if (profProfile.usesWhatsApp === false) return false;
          return Boolean(profProfile.whatsappNumber || profProfile.mobilePhone || hc.mobilePhone);
        })(),
        phone: (p.professionalProfile && (p.professionalProfile.whatsappNumber || p.professionalProfile.mobilePhone)) || ((p.hogarProfile && p.hogarProfile.contact && p.hogarProfile.contact.mobilePhone) || ''),
        telegram: !!(p.hogarProfile && p.hogarProfile.contact && p.hogarProfile.contact.telegram),
        onCall: !!(p.hogarProfile && p.hogarProfile.onCall),
        averageRating: avgRating,
        brandMatched,
        brandGeneric,
        modelMatched,
        modelGeneric,
        mustMatch
      };
    });

    // Filter: remove zero-score, brand/model required match, and low match
    // When no service/brand/model queried, lower threshold since location-only matches are valid
    const hasServiceQuery = !!(service || brand || model || descripcion);
    const minPct = hasServiceQuery ? 30 : 0;
    const results = scored
      .filter(p => p.score > 0 && !p.mustMatch && p.pct >= minPct)
      .sort((a, b) => {
        // Primary: by pct (descending)
        const pctDiff = b.pct - a.pct;
        // If pcts are basically tied (within 0.5%), use distance as tiebreaker (closer wins)
        if (Math.abs(pctDiff) < 0.5 && uLat && uLng) {
          if (a.distance != null && b.distance != null) return a.distance - b.distance;
          if (a.distance != null) return -1;
          if (b.distance != null) return 1;
        }
        if (pctDiff !== 0) return pctDiff;
        return b.score - a.score;
      })
      .slice(0, hasServiceQuery ? 50 : 200);

    // If CABA barrio search and few results, expand to all CABA with distance scoring
    let expandedResults = [];
    if (isCabaBarrio && results.length < 5) {
      const expandFilter = JSON.parse(JSON.stringify(baseFilter));
      // Remove the ciudad $and clause
      if (expandFilter.$and) {
        expandFilter.$and = expandFilter.$and.filter(clause => {
          if (clause.$or && clause.$or.some(c => c['professionalProfile.location.city'] || c['hogarProfile.address.city'])) return false;
          return true;
        });
      }
      const expandProfessionals = await User.find(expandFilter)
        .select({
          'professionalProfile.alias': 1, 'professionalProfile.bio': 1, 'professionalProfile.location': 1,
          'professionalProfile.services': 1, 'professionalProfile.photos': 1, 'professionalProfile.whatsappNumber': 1,
          'professionalProfile.mobilePhone': 1, 'professionalProfile.usesWhatsApp': 1,
          'hogarProfile.firstName': 1, 'hogarProfile.lastName': 1, 'hogarProfile.bio': 1, 'hogarProfile.area': 1,
          'hogarProfile.action': 1, 'hogarProfile.services': 1, 'hogarProfile.photos': 1,
          'hogarProfile.availability': 1, 'hogarProfile.address': 1, 'hogarProfile.contact': 1,
          name: 1, email: 1
        }).lean().limit(200);

      const expandIds = new Set(results.map(r => r.id.toString()));
      const expandRatingAgg = await Feedback.aggregate([
        { $match: { professional: { $in: expandProfessionals.map(p => p._id) }, status: 'completed' } },
        { $group: { _id: '$professional', avg: { $avg: '$rating' } } }
      ]);
      const expandRatingMap = {};
      for (const r of expandRatingAgg) expandRatingMap[r._id.toString()] = Math.round(r.avg * 10) / 10;

      expandedResults = expandProfessionals
        .filter(p => !expandIds.has(p._id.toString()))
        .map(p => {
          let pp = p.professionalProfile || p.hogarProfile || {};
          const ppHasServices = Array.isArray(pp.services) && pp.services.length > 0;
          if (!ppHasServices && p.hogarProfile && Array.isArray(p.hogarProfile.services) && p.hogarProfile.services.length > 0) pp = p.hogarProfile;
      // Conservar path y name por separado. Antes se usaba (s.name || s.path),
      // pero hogarProfile.services[].name es required, asi que el path NUNCA se
      // comparaba y el matching jerarquico era imposible en el scoring.
      const svcEntries = Array.isArray(pp.services) ? pp.services.map(s => {
        if (typeof s === 'string') {
          const p = normalizeServicePath(s);
          return { path: p, name: s.toLowerCase() };
        }
        return { path: normalizeServicePath(s.path || ''), name: String(s.name || '').toLowerCase() };
      }).filter(e => e.path || e.name) : [];
      const svcs = svcEntries.map(e => e.name || e.path);
          const bio = (pp.bio || '').toLowerCase();
          const avgRating = expandRatingMap[p._id.toString()] || 0;
          let score = 0;
          let maxPossible = W_ACTION + W_URGENCY + W_SERVICE + W_BIO + W_LOCATION + (usedBrand ? W_BRAND : 0) + (usedModel ? W_MODEL : 0);
          if (accion) score += W_ACTION;
          if (urgencia) score += W_URGENCY;
          // mismo criterio que el bloque principal: jerarquico primero
          let serviceMatched = false;
          if (service) {
            const wantedCaba = normalizeServicePath(service);
            for (const e of svcEntries) {
              if (e.path && servicePathMatches(e.path, wantedCaba)) { serviceMatched = true; break; }
            }
          }
          if (!serviceMatched) {
            for (const pat of patterns) {
              for (const e of svcEntries) {
                if ((e.name && e.name.includes(pat)) || (e.path && e.path.includes(pat))) { serviceMatched = true; break; }
              }
              if (serviceMatched) break;
            }
          }
          if (serviceMatched) score += W_SERVICE;
          let bioMatchCount = 0;
          for (const pat of patterns) { if (bio.includes(pat)) bioMatchCount++; }
          if (bioMatchCount > 0) score += Math.min(W_BIO, bioMatchCount * 5);
          if (brandQuery) {
            const inBio = bio.includes(brandQuery);
            const inServices = svcs.some(s => s.includes(brandQuery));
            if (inBio || inServices) { score += W_BRAND; brandMatched = true; }
          }
          if (modelQuery) {
            const inBio = bio.includes(modelQuery);
            const inServices = svcs.some(s => s.includes(modelQuery));
            if (inBio || inServices) { score += W_MODEL; modelMatched = true; }
          }
          let dist = null;
          if (pp.location) {
            const pLat = pp.location.lat;
            const pLng = pp.location.lng;
            if (uLat && uLng && pLat && pLng) {
              const R = 6371;
              const dLat = (pLat - uLat) * Math.PI / 180;
              const dLng = (pLng - uLng) * Math.PI / 180;
              const a = Math.sin(dLat/2)**2 + Math.cos(uLat*Math.PI/180)*Math.cos(pLat*Math.PI/180)*Math.sin(dLng/2)**2;
              dist = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
            }
          }
          // Province match — scaled by distance
          if (pp.location && pp.location.province && provincia) {
            if (pp.location.province.toLowerCase() === provincia.toLowerCase()) {
              if (dist == null || dist <= 6) score += W_LOCATION;
              else if (dist <= 15) score += Math.floor(W_LOCATION / 2);
            }
          }
      // Rating boost — reduced for distant professionals
      const ratingBoost = Math.round(avgRating * 2);
      if (dist != null && dist > 15) score += Math.floor(ratingBoost / 3);
      else if (dist != null && dist > 6) score += Math.floor(ratingBoost / 2);
      else score += ratingBoost;
          const pct = Math.round((score / maxPossible) * 100);
          const photos = Array.isArray(pp.photos) ? pp.photos : [];
          return {
            id: p._id, score, pct, nearBarrio: true,
            alias: pp.alias || [pp.firstName, pp.lastName].filter(Boolean).join(' ') || 'Profesional',
            bio: pp.bio || '',
            location: [pp.location?.city || pp.address?.city, pp.location?.province || pp.address?.province].filter(Boolean).join(', '),
            lat: pp.location?.lat || null, lng: pp.location?.lng || null, distance: dist || null,
            services: svcs, photo: photos[0] || null,
            email: p.email,
            whatsapp: (() => {
              const hc = (p.hogarProfile && p.hogarProfile.contact) || {};
              if (hc.whatsapp) return true;
              const profProfile = p.professionalProfile || {};
              if (profProfile.usesWhatsApp === false) return false;
              return Boolean(profProfile.whatsappNumber || profProfile.mobilePhone || hc.mobilePhone);
            })(),
            phone: (p.professionalProfile && (p.professionalProfile.whatsappNumber || p.professionalProfile.mobilePhone)) || ((p.hogarProfile && p.hogarProfile.contact && p.hogarProfile.contact.mobilePhone) || ''),
            telegram: !!(p.hogarProfile && p.hogarProfile.contact && p.hogarProfile.contact.telegram),
            onCall: !!(p.hogarProfile && p.hogarProfile.onCall),
            averageRating: avgRating, brandMatched: false, brandGeneric: false,
            modelMatched: false, modelGeneric: false, mustMatch: false
          };
        })
        .filter(p => p.score > 0 && p.pct >= minPct)
        .sort((a, b) => {
          const pctDiff = b.pct - a.pct;
          if (Math.abs(pctDiff) < 0.5) {
            if (a.distance != null && b.distance != null) return a.distance - b.distance;
            if (a.distance != null) return -1;
            if (b.distance != null) return 1;
          }
          if (pctDiff !== 0) return pctDiff;
          return b.score - a.score;
        })
        .slice(0, 200 - results.length);
    }

    const allResults = [...results, ...expandedResults];

    // Build relaxation suggestions when results are few
    const CABA_BARRIOS = [
      'palermo', 'belgrano', 'nunez', 'villa urquiza', 'villa crespo', 'chacarita',
      'paternal', 'agronomia', 'caballito', 'flores', 'floresta', 'boedo',
      'almagro', 'balvanera', 'san cristobal', 'congreso', 'monserrat',
      'retiro', 'san telmo', 'la boca', 'barracas', 'parque patricios',
      'puerto madero', 'san nicolas', 'constitucion', 'mataderos', 'liniers',
      'parque avellaneda', 'versalles', 'villa luro', 'lugano', 'savoia',
      'villa soldati', 'villa riachuelo', 'bajo flores', 'monte chingolo'
    ];

    // Neighboring provinces for Argentina
    const NEIGHBORS = {
      'buenos aires': ['ciudad autónoma de buenos aires', 'entre ríos', 'santa fe', 'córdoba', 'la pampa', 'río negro'],
      'ciudad autónoma de buenos aires': ['buenos aires'],
      'caba': ['buenos aires'],
      'córdoba': ['catamarca', 'santiago del estero', 'santa fe', 'buenos aires', 'la pampa', 'san luis', 'la rioja'],
      'santa fe': ['chaco', 'corrientes', 'entre ríos', 'buenos aires', 'santiago del estero'],
      'entre ríos': ['corrientes', 'santa fe', 'buenos aires'],
      'corrientes': ['misiones', 'formosa', 'chaco', 'santa fe', 'entre ríos'],
      'misiones': ['corrientes'],
      'jujuy': ['salta'],
      'salta': ['jujuy', 'formosa', 'chaco', 'santiago del estero', 'tucumán', 'catamarca'],
      'formosa': ['salta', 'chaco', 'corrientes'],
      'chaco': ['formosa', 'salta', 'santiago del estero', 'santa fe', 'corrientes'],
      'tucumán': ['salta', 'santiago del estero', 'catamarca'],
      'santiago del estero': ['salta', 'formosa', 'chaco', 'santa fe', 'córdoba', 'catamarca', 'tucumán'],
      'catamarca': ['salta', 'tucumán', 'santiago del estero', 'córdoba', 'la rioja'],
      'la rioja': ['catamarca', 'córdoba', 'san luis', 'san juan'],
      'san juan': ['la rioja', 'san luis', 'mendoza'],
      'san luis': ['la rioja', 'córdoba', 'la pampa', 'mendoza', 'san juan'],
      'mendoza': ['san juan', 'san luis', 'la pampa', 'neuquén'],
      'la pampa': ['córdoba', 'santa fe', 'buenos aires', 'río negro', 'neuquén', 'mendoza', 'san luis'],
      'neuquén': ['mendoza', 'río negro'],
      'río negro': ['neuquén', 'la pampa', 'buenos aires', 'chubut'],
      'chubut': ['río negro', 'santa cruz'],
      'santa cruz': ['chubut']
    };

    // Gran Buenos Aires: partidos limítrofes a CABA
    const GBA_LIMITROFES = [
      'vicente lópez', 'general san martín',
      'la matanza', 'lomas de zamora', 'lanús', 'avellaneda'
    ];

    const provLower = (provincia || '').toLowerCase().trim();
    const neighbors = NEIGHBORS[provLower] || [];

    const suggestions = [];
    if (results.length === 0 || results.length <= 3) {
      // Suggestion 1: expand location
      if (ciudad) {
        if (isCabaBarrio) {
          suggestions.push({
            type: 'location',
            label: 'Buscar en CABA (todos los barrios)',
            params: { ciudad: '', provincia: 'CABA' }
          });
          suggestions.push({
            type: 'location',
            label: 'Buscar en CABA + Gran Buenos Aires',
            params: { ciudad: '', provincia: '' }
          });
        }
        suggestions.push({
          type: 'location',
          label: 'Buscar en toda la provincia',
          params: { ciudad: '' }
        });
      }
      // Suggestion 2: neighboring provinces (only for services, not for remote locations)
      if (provLower && neighbors.length > 0) {
        const neighborLabels = neighbors.slice(0, 3).map(n => n.charAt(0).toUpperCase() + n.slice(1));
        suggestions.push({
          type: 'location',
          label: 'Buscar en provincias vecinas (' + neighborLabels.join(', ') + (neighbors.length > 3 ? '...' : '') + ')',
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

    res.status(200).json({ results: allResults.map(sanitizePublicProfessions), suggestions });
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
    if (normalizeAlias(req.params.alias).toLowerCase() === 'me') {
      return res.status(403).json({ success: false, error: 'Access denied. You must be logged in as a professional to view the dashboard.' });
    }

    const aliasNorm = normalizeAlias(req.params.alias);
    const aliasRegex = new RegExp(`^${aliasNorm}$`, 'i');
    let professional = await User.findOne({ 
      'professionalProfile.alias': aliasRegex,
      ...ALIAS_LOOKUP_FILTER
    }).select('accountDeletedAt professionalProfile.alias professionalProfile.quality professionalProfile.bio professionalProfile.services professionalProfile.location professionalProfile.pricing professionalProfile.measurements professionalProfile.height professionalProfile.eyeColor professionalProfile.hasTattoos professionalProfile.whatsappNumber professionalProfile.mobilePhone professionalProfile.photos professionalProfile.workingHours professionalProfile.workingDays professionalProfile.vacation professionalProfile.budgetType professionalProfile.budgetAmount professionalProfile.responseSpeed');
    // fallback original accent if DB not yet migrated
    if (!professional) {
      const origRegex = new RegExp(`^${req.params.alias}$`, 'i');
      professional = await User.findOne({ 'professionalProfile.alias': origRegex, ...ALIAS_LOOKUP_FILTER }).select('accountDeletedAt professionalProfile.alias professionalProfile.quality professionalProfile.bio professionalProfile.services professionalProfile.location professionalProfile.pricing professionalProfile.measurements professionalProfile.height professionalProfile.eyeColor professionalProfile.hasTattoos professionalProfile.whatsappNumber professionalProfile.mobilePhone professionalProfile.photos professionalProfile.workingHours professionalProfile.workingDays professionalProfile.vacation professionalProfile.budgetType professionalProfile.budgetAmount professionalProfile.responseSpeed');
    }

    if (!professional || isAccountDeleted(professional)) {
      return res.status(404).json({
        success: false,
        error: 'Professional not found'
      });
    }

    // Only expose the profile publicly once the professional has an active/expiring aviso
    const hasActiveAviso = await Aviso.exists({
      professional: professional._id,
      status: { $in: ['active', 'expiring'] }
    });
    if (!hasActiveAviso) {
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

      // KPI tracking - profile card click
      const ClickEvent = require('../models/ClickEvent');
      const clickMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
      await ClickEvent.create({
        professional: professional._id,
        type: 'profile_card',
        visitorIp: clientIp,
        userAgent: (req.headers['user-agent'] || '').substring(0, 300),
        month: clickMonth
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
    const aliasRegex = new RegExp(`^${normalizeAlias(req.params.alias)}$`, 'i');
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
    const aliasRegex = new RegExp(`^${normalizeAlias(req.params.alias)}$`, 'i');
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

      // KPI tracking
      const ClickEvent = require('../models/ClickEvent');
      const clickMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
      await ClickEvent.create({
        professional: professional._id,
        type: 'whatsapp',
        visitorIp: clientIp,
        userAgent: (req.headers['user-agent'] || '').substring(0, 300),
        month: clickMonth
      });
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

    // Only professionals with an active/expiring aviso
    const activeAvisoProfessionals = await Aviso.distinct('professional', { status: { $in: ['active', 'expiring'] } });
    query._id = { $in: activeAvisoProfessionals };

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
      alias: normalizeAlias(req.body.alias),
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
      budgetType: ['sin_cargo','con_cargo'].includes(req.body.budgetType) ? req.body.budgetType : (oldProf.budgetType || 'sin_cargo'),
      budgetAmount: req.body.budgetAmount !== undefined && req.body.budgetAmount !== '' ? Number(req.body.budgetAmount) : (oldProf.budgetAmount || undefined),
      responseSpeed: ['inmediata','24hs','48hs','72hs'].includes(req.body.responseSpeed) ? req.body.responseSpeed : (oldProf.responseSpeed || '24hs'),
      workingHours: {
        start: req.body.workingHoursStart || '00:00',
        end: req.body.workingHoursEnd || '23:59'
      },
      workingDays: parsedDays
    };
    if (professionalProfile.budgetType === 'sin_cargo') professionalProfile.budgetAmount = undefined;
    
    if (req.body.isExposed !== undefined) {
      professionalProfile.isExposed = req.body.isExposed === 'true';
    }
    if (req.body.paysMonthlyCharges !== undefined) {
      professionalProfile.paysMonthlyCharges = req.body.paysMonthlyCharges === 'true';
    }

    if (lastPhotoUpdate) professionalProfile.lastPhotoUpdate = lastPhotoUpdate;

    // Safely update the nested location object if location data is provided
    if (req.body.province || req.body.city || req.body.neighborhood || req.body.street !== undefined || req.body.number !== undefined || req.body.floor !== undefined || req.body.apartment !== undefined || req.body.postalCode !== undefined) {
      const newLoc = {
        province: req.body.province || oldProf.location?.province,
        city: req.body.city !== undefined ? req.body.city : oldProf.location?.city,
        neighborhood: req.body.neighborhood !== undefined ? req.body.neighborhood : oldProf.location?.neighborhood,
        street: req.body.street !== undefined ? req.body.street : oldProf.location?.street,
        number: req.body.number !== undefined ? req.body.number : oldProf.location?.number,
        floor: req.body.floor !== undefined ? req.body.floor : oldProf.location?.floor,
        apartment: req.body.apartment !== undefined ? req.body.apartment : oldProf.location?.apartment,
        postalCode: req.body.postalCode !== undefined ? req.body.postalCode : oldProf.location?.postalCode
      };
      if (!newLoc.lat && !newLoc.lng) assignGpsToLocation(newLoc);
      professionalProfile.location = newLoc;
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
    // Cache de prefijos: sin esto professionalProfile se buscaria por regex y
    // la query jerarquica no podria acotar el indice.
    fieldsToUpdate['professionalProfile.servicePaths'] = servicePathPrefixes(professionalProfile.services);
    
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

// @desc    Submit initial DNI verification (PC->phone handoff)
// @route   POST /api/v1/professionals/verification-documents
// @access  Private/Professional
exports.submitInitialVerification = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'professional') {
      return res.status(404).json({ success: false, error: 'Professional not found' });
    }
    if (user.verificationStatus === 'approved') {
      return res.status(400).json({ success: false, error: 'Already verified' });
    }
    if (!req.files || req.files.length < 1) {
      return res.status(400).json({ success: false, error: 'Se requiere al menos frente del DNI.' });
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
    if (user.professionalProfile) {
      user.professionalProfile.lastPhotoUpdate = Date.now();
    }
    await user.save();
    try {
      const adminEmail = require('../config/appConfig').payment?.adminEmail || 'admin@drsrv.net.ar';
      const { sendEmail } = require('../services/emailService');
      await sendEmail({
        email: adminEmail,
        subject: 'KuraTe - DNI recibido (PC->móvil)',
        message: `Profesional "${user.professionalProfile?.alias || user.email}" completó DNI desde móvil (${req.headers['user-agent'] || 'móvil'}).\nRevisar en Panel Admin.`
      });
    } catch (e) { console.error('notify admin DNI', e.message); }
    res.status(200).json({ success: true, message: 'DNI recibido. Te avisaremos cuando sea aprobado.', data: { verificationStatus: user.verificationStatus } });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Redirect to Professional's Phone (Anti-Scraping Protection)
// @route   GET /api/v1/professionals/:alias/phone
// @access  Public
exports.contactPhone = async (req, res, next) => {
  try {
    const aliasRegex = new RegExp(`^${normalizeAlias(req.params.alias)}$`, 'i');
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

      // KPI tracking
      const ClickEvent = require('../models/ClickEvent');
      const clickMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
      await ClickEvent.create({
        professional: professional._id,
        type: 'phone',
        visitorIp: clientIp,
        userAgent: (req.headers['user-agent'] || '').substring(0, 300),
        month: clickMonth
      });
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
    const { DEFAULT_ACTIONS } = require('../data/serviceTree');
    res.json({ success: true, data: serviceTree, actions: DEFAULT_ACTIONS });
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
      action, actionDetails, area, specialty, availability, description
    } = req.body;
    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'professional' || !user.hogarProfile) {
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
    if (action !== undefined) hp.action = action;
    if (actionDetails !== undefined) hp.actionDetails = actionDetails;
    if (area !== undefined) hp.area = area;
    if (specialty !== undefined) hp.specialty = specialty;
    if (availability !== undefined) hp.availability = availability;
    if (description !== undefined) hp.description = description;

    if (services !== undefined) {
      // Sanitiza antes de guardar: la entrada "otra" de cada dispositivo llega
      // como texto crudo y se normaliza a "__otra__:Nombre Propio". Tambien
      // descarta servicios sin path o sin marcas.
      hp.services = sanitizeServices(services);
      // Cache de prefijos para que la busqueda sea por igualdad (indexada).
      hp.servicePaths = servicePathPrefixes(hp.services);
    }
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

// @desc    Public list of professions (trades taxonomy)
// @route   GET /api/v1/professions
// @access  Public
exports.getProfessions = async (req, res, next) => {
  try {
    const professions = await Profession.find({ active: true })
      .select('slug name image description regulated')
      .sort({ name: 1 })
      .lean();
    res.json({ success: true, count: professions.length, data: professions });
  } catch (error) {
    next(error);
  }
};

// @desc    Save which trade(s) the professional exercises on their profile.
//          Accepts [{ slug }] or [{ slug, name }]. Stores { slug, name } on both
//          professionalProfile and hogarProfile so searches find it either way.
// @route   PUT /api/v1/professionals/professions
// @access  Private/Professional
exports.updateMyProfessions = async (req, res, next) => {
  try {
    const raw = req.body.professions;
    if (!Array.isArray(raw)) {
      return res.status(400).json({ success: false, error: 'professions must be an array' });
    }

    const slugs = raw.map(p => (typeof p === 'string' ? p : p.slug)).filter(Boolean).map(s => String(s).trim().toLowerCase());
    const uniqueSlugs = [...new Set(slugs)];

    const valid = await Profession.find({ active: true, slug: { $in: uniqueSlugs } }).select('slug name regulated').lean();
    if (valid.length !== uniqueSlugs.length) {
      const found = new Set(valid.map(p => p.slug));
      const rejected = uniqueSlugs.filter(s => !found.has(s));
      return res.status(400).json({ success: false, error: 'unknown or inactive profession(s)', rejected });
    }

    // Los oficios regulados (gasista, electricista) exigen matricula: si el
    // profesional la declara, se guardan numero y/o foto del titulo. El estado
    // de verificacion no lo puede setear el profesional, solo el admin.
    const previas = new Map();
    const userPrevio = await User.findById(req.user.id).select('hogarProfile.professions professionalProfile.professions').lean();
    for (const p of [...(userPrevio?.hogarProfile?.professions || []), ...(userPrevio?.professionalProfile?.professions || [])]) {
      previas.set(p.slug, p);
    }

    const chosen = valid.map((p) => {
      const entrada = raw.find((r) => typeof r === 'object' && r && String(r.slug || '').trim().toLowerCase() === p.slug) || {};
      const previa = previas.get(p.slug) || {};
      const item = { slug: p.slug, name: p.name, matriculado: false };
      if (p.regulated) {
        // 'matriculado' ausente = el cliente no lo manage (ej. edicion desde
        // admin): se conserva lo que habia. Solo un false explicito desmatricula.
        const mandaronElCampo = Object.prototype.hasOwnProperty.call(entrada, 'matriculado');
        const matriculado = mandaronElCampo
          ? (entrada.matriculado === true || entrada.matriculado === 'true')
          : !!previa.matriculado;
        item.matriculado = matriculado;
        if (matriculado) {
          const numero = String(entrada.matriculaNumero || previa.matriculaNumero || '').trim().slice(0, 40);
          const fotoNueva = typeof entrada.matriculaFoto === 'string' ? entrada.matriculaFoto.trim() : '';
          const foto = (fotoNueva || previa.matriculaFoto || '').slice(0, 500);
          // Exigir al menos una acreditacion para evitar guardar matriculado=true vacio
          if (!numero && !foto) {
            return res.status(400).json({
              success: false,
              error: 'Cargá el número de matrícula o una foto del título para acreditar la matriculación.'
            });
          }
          item.matriculaNumero = numero;
          item.matriculaFoto = foto;
        }
        // si dejo de estar matriculado, se cae el documento adjunto
        if (!matriculado) { item.matriculaNumero = ''; item.matriculaFoto = ''; }
      }
      // conservar el estado de verificacion del admin
      if (previa.matriculaVerificada) { item.matriculaVerificada = true; item.matriculaVerificadaAt = previa.matriculaVerificadaAt; }
      if (previa.matriculaRechazada) {
        item.matriculaRechazada = true;
        // Sin esto el motivo se pierde en cada guardado: el item se reconstruye
        // desde cero y el admin tendria que volver a escribirlo.
        if (previa.matriculaRechazadaMotivo) item.matriculaRechazadaMotivo = previa.matriculaRechazadaMotivo;
      }
      return item;
    });

    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'professional') {
      return res.status(404).json({ success: false, error: 'Professional not found' });
    }

    if (user.professionalProfile) user.professionalProfile.professions = chosen;
    if (user.hogarProfile) user.hogarProfile.professions = chosen;
    await user.save();

    res.json({ success: true, data: chosen });
  } catch (error) {
    next(error);
  }
};

// Sanea la entrada de matriculacion de un oficio regulado.
// Devuelve {ok, valor, error} para no repetir la validacion en cada endpoint.
function buildMatricula(p, entrada, previa = {}) {
  const matriculado = entrada.matriculado === true || entrada.matriculado === 'true';
  if (!matriculado) {
    return { ok: true, valor: { matriculado: false, matriculaNumero: '', matriculaFoto: '' } };
  }  const numero = String(entrada.matriculaNumero || previa.matriculaNumero || '').trim().slice(0, 40);
  const fotoPrevia = String(previa.matriculaFoto || '');
  const foto = String(entrada.matriculaFoto || fotoPrevia).trim().slice(0, 500);
  // La matricula habilitante se acredita con numero O foto: exigir al menos
  // una de las dos evita un "matriculado" sin ningun respaldo verificable.
  if (!numero && !foto) {
    return { ok: false, error: 'Cargá el número de matrícula o una foto del título para acreditar la matriculación.' };
  }
  return { ok: true, valor: { matriculado: true, matriculaNumero: numero, matriculaFoto: foto } };
}

// Las matriculas NO van a /public (que se sirve estaticamente) ni al
// uploadsDir compartido: viven en un directorio privado, accesible solo por
// el dueno del perfil y por un admin a traves del endpoint de descarga.
const MATRICULA_DIR = path.join(__dirname, '..', 'private', 'matriculas');

function getMatriculaFilePath(fileName) {
  // Solo se aceptan nombres generados por multer (sin separadores de ruta).
  if (!fileName || /[\\/]|\.\./.test(fileName)) return null;
  const resolved = path.resolve(path.join(MATRICULA_DIR, fileName));
  if (path.dirname(resolved) !== path.resolve(MATRICULA_DIR)) return null;
  return resolved;
}

// @desc    Adjunta la foto de la matricula habilitante de un oficio regulado.
//          El archivo vive FUERA de /public: no se sirve estaticamente.
// @route   POST /api/v1/professionals/matricula
// @access  Private/Professional
exports.uploadMatricula = async (req, res, next) => {
  try {
    const slug = String(req.body.slug || '').trim().toLowerCase();
    if (!slug) return res.status(400).json({ success: false, error: 'slug is required' });

    const prof = await Profession.findOne({ slug, active: true }).select('slug name regulated').lean();
    if (!prof) return res.status(404).json({ success: false, error: 'unknown profession' });
    if (!prof.regulated) {
      return res.status(400).json({ success: false, error: `"${prof.name}" no requiere matriculación.` });
    }

    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'professional') return res.status(404).json({ success: false, error: 'Professional not found' });

    const listas = [user.hogarProfile?.professions, user.professionalProfile?.professions].filter(Array.isArray);
    let encontrada = null;
    for (const lista of listas) {
      const hit = lista.find(p => p.slug === slug);
      if (hit) encontrada = hit;
    }
    if (!encontrada || !encontrada.matriculado) {
      return res.status(400).json({ success: false, error: 'Marcá la matrícula como activa antes de adjuntar el título.' });
    }

    const anterior = encontrada.matriculaFoto || '';
    if (req.file) {
      encontrada.matriculaFoto = req.file.filename;
      // al cambiar el documento, la verificacion anterior deja de ser valida
      encontrada.matriculaVerificada = false;
      encontrada.matriculaVerificadaAt = null;
      encontrada.matriculaRechazada = false;
    }

    const check = buildMatricula({ regulated: true }, { matriculado: true, matriculaNumero: encontrada.matriculaNumero, matriculaFoto: encontrada.matriculaFoto }, encontrada);
    if (!check.ok) return res.status(400).json({ success: false, error: check.error });

    for (const lista of listas) {
      const hit = lista.find(p => p.slug === slug);
      if (hit) {
        hit.matriculado = true;
        hit.matriculaNumero = encontrada.matriculaNumero;
        hit.matriculaFoto = encontrada.matriculaFoto;
        hit.matriculaVerificada = !!encontrada.matriculaVerificada;
        hit.matriculaVerificadaAt = encontrada.matriculaVerificadaAt || null;
        hit.matriculaRechazada = !!encontrada.matriculaRechazada;
      }
    }
    await user.save();

    // el archivo viejo se bor recien despues de guardar bien el nuevo
    if (req.file && anterior) {
      const viejo = getMatriculaFilePath(anterior);
      if (viejo && fs.existsSync(viejo)) { try { fs.unlinkSync(viejo); } catch (e) { /* no bloquea el flujo */ } }
    }

    res.json({
      success: true,
      data: {
        slug, name: prof.name, matriculado: true,
        matriculaNumero: encontrada.matriculaNumero,
        tieneFoto: !!encontrada.matriculaFoto,
        matriculaVerificada: !!encontrada.matriculaVerificada
      }
    });
  } catch (error) {
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    }
    next(error);
  }
};

// @desc    Descarga la matricula. Solo la ve el dueno del perfil o un admin.
// @route   GET /api/v1/professionals/matricula/:slug
// @access  Private
exports.getMatricula = async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, error: 'not found' });

    let lista = [];
    if (user.role === 'professional') {
      lista = [...(user.hogarProfile?.professions || []), ...(user.professionalProfile?.professions || [])];
    }
    if (user.role !== 'admin' && !lista.some(p => p.slug === slug)) {
      return res.status(403).json({ success: false, error: 'forbidden' });
    }

    // El admin puede auditar cualquier matricula; el profesional solo la propia.
    let fileName = lista.find(p => p.slug === slug)?.matriculaFoto;
    if (!fileName && user.role === 'admin' && req.query.userId) {
      const dueno = await User.findById(String(req.query.userId)).select('hogarProfile.professions professionalProfile.professions').lean();
      const propias = [...(dueno?.hogarProfile?.professions || []), ...(dueno?.professionalProfile?.professions || [])];
      fileName = propias.find(p => p.slug === slug)?.matriculaFoto;
    }

    const filePath = getMatriculaFilePath(fileName);
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'no hay archivo de matrícula' });
    }
    res.sendFile(filePath);
  } catch (error) {
    next(error);
  }
};

// @desc    Que padron tiene que consultar el admin para verificar una matricula.
//          Devuelve el ente emisor esperado segun oficio y provincia, con la
//          URL del padron oficial.
// @route   GET /api/v1/professionals/matricula/:slug/padron?userId=...
// @access  Private/Admin
exports.getMatriculaPadron = async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const userId = String(req.query.userId || '').trim();
    if (!userId) return res.status(400).json({ success: false, error: 'userId is required' });

    const user = await User.findById(userId)
      .select('hogarProfile.professions hogarProfile.address.province professionalProfile.professions professionalProfile.location.province')
      .lean();
    if (!user) return res.status(404).json({ success: false, error: 'user not found' });

    const provincia = (user.hogarProfile && user.hogarProfile.address && user.hogarProfile.address.province)
      || (user.professionalProfile && user.professionalProfile.location && user.professionalProfile.location.province)
      || '';

    const padron = padronParaVerificar(slug, provincia);
    if (!padron.ok) return res.status(400).json({ success: false, error: padron.error });

    const listas = [user.hogarProfile?.professions, user.professionalProfile?.professions].filter(Array.isArray);
    let encontrada = null;
    for (const lista of listas) {
      const hit = lista.find(p => p.slug === slug);
      if (hit) encontrada = hit;
    }

    res.json({
      success: true,
      data: {
        slug,
        provincia,
        esCaba: esCaba(provincia),
        ente: padron.ente,
        enteLabel: padron.enteLabel,
        padron: padron.padron,
        nota: padron.nota || '',
        alternativas: padron.alternativas || [],
        matricula: encontrada ? {
          matriculaNumero: encontrada.matriculaNumero || '',
          matriculaTitular: encontrada.matriculaTitular || '',
          matriculaEnteEmisor: encontrada.matriculaEnteEmisor || '',
          matriculaEstado: encontrada.matriculaEstado || 'sin_verificar',
          matriculaVerificada: !!encontrada.matriculaVerificada,
          matriculaRechazada: !!encontrada.matriculaRechazada,
          matriculaRechazadaMotivo: encontrada.matriculaRechazadaMotivo || '',
          matriculaVerificadaAt: encontrada.matriculaVerificadaAt || null,
          matriculaVerificadoEn: encontrada.matriculaVerificadoEn || null,
          matriculaFuenteConsulta: encontrada.matriculaFuenteConsulta || ''
        } : null
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Registra el resultado de verificar una matricula contra el padron
//          oficial (solo admin). Guarda titular y ente emisor, y SOLO habilita
//          la insignia de verificado si el padron la da como activa.
// @route   PUT /api/v1/professionals/matricula/:slug/verificar
// @access  Private/Admin
exports.reviewMatricula = async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const userId = String(req.body.userId || '').trim();
    if (!userId) return res.status(400).json({ success: false, error: 'userId is required' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, error: 'user not found' });

    // La provincia decide que ente emisor es valido: gasista en CABA no es lo
    // mismo que gasista en el interior.
    const provincia = (user.hogarProfile && user.hogarProfile.address && user.hogarProfile.address.province)
      || (user.professionalProfile && user.professionalProfile.location && user.professionalProfile.location.province)
      || '';

    const oficial = await Profession.findOne({ slug, active: true }).select('name regulated').lean();
    const nombreOficio = (oficial && oficial.name) || slug;

    const chk = validarVerificacion({
      slug,
      provincia,
      titular: req.body.titular,
      enteEmisor: req.body.enteEmisor,
      estado: req.body.estado,
      matriculaNumero: req.body.matriculaNumero
    });
    if (!chk.ok) {
      return res.status(400).json({
        success: false,
        error: chk.error,
        esperado: entesEsperados(slug, provincia).map(k => ({ ente: k, label: ENTES[k].label, padron: ENTES[k].padron }))
      });
    }

    const efecto = aplicarEstadoVerificacion(chk.valor.estado, req.body.matriculaNumero, nombreOficio);
    const ahora = new Date();
    const revisor = (req.user && (req.user.email || req.user.name)) || '';
    const fuente = String(req.body.fuenteConsulta || '').trim().slice(0, 300);

    const listas = [user.hogarProfile?.professions, user.professionalProfile?.professions].filter(Array.isArray);
    let tocadas = 0;
    for (const lista of listas) {
      for (const p of lista) {
        if (p.slug !== slug) continue;
        tocadas++;

        p.matriculaTitular = chk.valor.titular;
        p.matriculaEnteEmisor = chk.valor.enteEmisor;
        p.matriculaEstado = chk.valor.estado;
        p.matriculaFuenteConsulta = fuente;

        p.matriculaVerificada = efecto.matriculaVerificada;
        p.matriculaVerificadaAt = efecto.matriculaVerificada ? ahora : null;
        p.matriculaVerificadoEn = ahora;
        p.matriculaVerificadoPor = revisor;
        p.matriculaRechazada = efecto.matriculaRechazada;
        p.matriculaRechazadaMotivo = efecto.matriculaRechazadaMotivo;

        // Si el padron la da de baja y el profesional habia declarado la
        // matricula activa, se le desdeclara para que no se muestre.
        if (!efecto.matriculaVerificada && p.matriculado && chk.valor.estado !== 'activa') {
          p.matriculado = false;
        }
      }
    }
    if (!tocadas) return res.status(404).json({ success: false, error: 'ese profesional no tiene esa profesión' });

    await user.save();
    res.json({
      success: true,
      data: {
        slug,
        matriculaVerificada: efecto.matriculaVerificada,
        matriculaRechazada: efecto.matriculaRechazada,
        matriculaEstado: chk.valor.estado,
        matriculaEnteEmisor: chk.valor.enteEmisor,
        matriculaTitular: chk.valor.titular,
        motivo: efecto.matriculaRechazadaMotivo || ''
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Save hogar payment data (CBU/CVU)
// @route   PUT /api/v1/hogar/payment
// @access  Private/Professional
exports.updateHogarPayment = async (req, res) => {
  try {
    const { wantsAppPayment, cbu, cvu, alias, accountNumber, bankName } = req.body;
    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'professional' || !user.hogarProfile) {
      return res.status(400).json({ success: false, error: 'Hogar professional not found' });
    }
    const hp = user.hogarProfile || {};
    hp.payment = hp.payment || {};
    if (wantsAppPayment !== undefined) hp.payment.wantsAppPayment = Boolean(wantsAppPayment);
    if (cbu !== undefined) hp.payment.cbu = String(cbu).replace(/\D/g, '').slice(0, 22);
    if (cvu !== undefined) hp.payment.cvu = String(cvu).replace(/\D/g, '').slice(0, 22);
    if (alias !== undefined) hp.payment.alias = String(alias).trim().slice(0, 30);
    if (accountNumber !== undefined) hp.payment.accountNumber = String(accountNumber).trim().slice(0, 40);
    if (bankName !== undefined) hp.payment.bankName = String(bankName).trim().slice(0, 40);
    user.hogarProfile = hp;
    await user.save();
    res.json({ success: true, data: hp.payment });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Public directory of Hogar/Oficina technicians (search/filter engine)
// @route   GET /api/v1/hogar/professionals
// @access  Public
exports.getHogarProfessionals = async (req, res, next) => {
  try {
    const b64 = (v) => (v ? Buffer.from(String(v)).toString('base64') : '');
    let query = {
      role: 'professional',
      accountDeletedAt: null,
      isVerified: true,
      $or: [
        { verificationStatus: 'approved' },
        { verificationStatus: { $exists: false } },
        { verificationStatus: null }
      ]
    };
    // version de la busqueda sin palabras vacias, usada solo si la estricta
    // no encuentra a nadie (ver bloque de texto libre)
    let relaxedQuery = null;

    // Only professionals with an active/expiring aviso
    const activeAvisoProfessionals = await Aviso.distinct('professional', { status: { $in: ['active', 'expiring'] } });
    query._id = { $in: activeAvisoProfessionals };

    // Filtro de entorno. La fuente de verdad es el arbol canonico
    // (hogarProfile.services[].path), NO el campo legacy hogarProfile.area:
    // ese campo quedo desalineado (pime vs casa-campo, 25 pros sin servicios).
    // 'pime' se acepta como alias de 'casa-campo' por URLs ya indexadas.
    if (req.query.area && req.query.area.trim()) {
      const rawArea = req.query.area.trim().toLowerCase();
      const areaId = AREA_ALIAS_PIME.has(rawArea) ? 'casa-campo' : rawArea;
      const areaRegex = { $regex: '^' + areaId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/', $options: 'i' };
      query.$and = query.$and || [];
      query.$and.push({ $or: [
        { 'hogarProfile.services.path': areaRegex },
        { 'hogarProfile.firstName': { $exists: false } }
      ]});
    }
    if (req.query.action && req.query.action.trim()) {
      const actRaw = req.query.action.trim();
      const actLower = actRaw.toLowerCase();
      const actMap = { 'reparar':'Reparo','repara':'Reparo','repare':'Reparo','reparo':'Reparo','reparacion':'Reparo','arreglar':'Reparo','arregla':'Reparo','arreglo':'Reparo','componer':'Reparo','service':'Reparo','servicio':'Reparo','servicio tecnico':'Reparo','tecnico':'Reparo','reparo de bomba':'Reparo','instalar':'Instalo','instalo':'Instalo','montar':'Instalo','mantenimiento':'Hago mantenimiento','mantener':'Hago mantenimiento','hago mantenimiento':'Hago mantenimiento','podar':'Hago mantenimiento','poda':'Hago mantenimiento','cortar':'Hago mantenimiento','corte':'Hago mantenimiento','cesped':'Hago mantenimiento','fumigar':'Hago mantenimiento','desherbar':'Hago mantenimiento','pileta':'Hago mantenimiento','piletas':'Hago mantenimiento','piscina':'Hago mantenimiento','piscinas':'Hago mantenimiento','bomba':'Hago mantenimiento','bombas':'Hago mantenimiento','vendo repuestos':'Vendo repuestos','vender':'Vendo repuestos','asesoro':'Asesoro','aprender':'Asesoro','mejorar':'Reparo','disenar':'Asesoro','diseñar':'Asesoro','descartar':'Vendo repuestos','busco':'Instalo','comprar':'Vendo repuestos','donar':'Vendo repuestos','recibir-donaciones':'Vendo repuestos' };
      const actNorm = actMap[actLower] || actRaw;
      const actRegex = { $regex: '^' + actNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', $options: 'i' };
      query.$and = query.$and || [];
      query.$and.push({ $or: [
        { 'hogarProfile.action': actRegex },
        { 'hogarProfile.firstName': { $exists: false } }
      ]});
    }
    if (req.query.category && req.query.category.trim()) {
      query.professionalType = { $regex: '^' + req.query.category.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', $options: 'i' };
    }
    if (req.query.availability && req.query.availability.trim()) {
      const availRegex = { $regex: '^' + req.query.availability.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', $options: 'i' };
      query.$and = query.$and || [];
      query.$and.push({ $or: [
        { 'hogarProfile.availability': availRegex },
        { 'hogarProfile.firstName': { $exists: false } }
      ]});
    }
    if (req.query.province && req.query.province.trim()) {
      const provRaw = req.query.province.trim();
      const provLower = provRaw.toLowerCase();
      const provRe = escapeRegex(provRaw);
      const provRegexes = [{ $regex: provRe, $options: 'i' }];
      if (provLower === 'caba') provRegexes.push({ $regex: 'Ciudad Autónoma de Buenos Aires', $options: 'i' });
      if (provLower.includes('ciudad autonoma') || provLower.includes('ciudad aut_noma')) provRegexes.push({ $regex: '^CABA$', $options: 'i' });
      const provOr = [];
      for (const pr of provRegexes) {
        provOr.push({ 'hogarProfile.address.province': pr });
        provOr.push({ 'professionalProfile.location.province': pr });
        provOr.push({ 'province': pr });
      }
      query.$and = query.$and || [];
      query.$and.push({ $or: provOr });
    }
    if (req.query.city && req.query.city.trim()) {
      const cityRegex = { $regex: escapeRegex(req.query.city.trim()), $options: 'i' };
      query.$and = query.$and || [];
      query.$and.push({ $or: [
        { 'hogarProfile.address.city': cityRegex },
        { 'professionalProfile.location.city': cityRegex },
        { 'city': cityRegex }
      ]});
    }
    if (req.query.neighborhood && req.query.neighborhood.trim()) {
      const hoodRegex = { $regex: escapeRegex(req.query.neighborhood.trim()), $options: 'i' };
      query.$and = query.$and || [];
      query.$and.push({ $or: [
        { 'hogarProfile.address.neighborhood': hoodRegex },
        { 'hogarProfile.firstName': { $exists: false } }
      ]});
    }
    // Matriculacion: es un requisito de la busqueda, no un dato del aviso.
    // Si se pide matriculado, solo pueden aparecer profesionales matriculados:
    //   ?matriculado=1                    -> matriculado en alguna profesion
    //   ?matriculado=1&profession=gasista -> matriculado EN ESA profesion
    const quiereMatriculado = req.query.matriculado === '1' || req.query.matriculado === 'true';
    if (req.query.profession && req.query.profession.trim()) {
      const profRaw = String(req.query.profession).trim();
      const profSlug = profRaw.toLowerCase().replace(/\s+/g, '-');
      // El texto del usuario va a Mongo como regex: sin escapar, un input como
      // '.*' matchearia todo y un patron catastrófico tipo '(a+)+' puede colgar
      // la consulta. Los slugs ya son literales y no necesitan escape.
      const profRe = escapeRegex(profRaw);
      query.$and = query.$and || [];
      if (quiereMatriculado) {
        query.$and.push({ $or: [
          { 'hogarProfile.professions': { $elemMatch: { slug: profSlug, matriculado: true } } },
          { 'professionalProfile.professions': { $elemMatch: { slug: profSlug, matriculado: true } } }
        ]});
      } else {
        query.$and.push({ $or: [
          { 'hogarProfile.professions.slug': profSlug },
          { 'hogarProfile.professions.name': { $regex: profRe, $options: 'i' } },
          { 'professionalProfile.professions.slug': profSlug },
          { 'professionalProfile.professions.name': { $regex: profRe, $options: 'i' } },
          { 'hogarProfile.services.name': { $regex: profRe, $options: 'i' } },
          { 'professionalProfile.services': { $regex: profRe, $options: 'i' } }
        ]});
      }
    } else if (quiereMatriculado) {
      query.$and = query.$and || [];
      query.$and.push({ $or: [
        { 'hogarProfile.professions': { $elemMatch: { matriculado: true } } },
        { 'professionalProfile.professions': { $elemMatch: { matriculado: true } } }
      ]});
    }
    // service filter: matching jerarquico anclado. Buscar un area/categoria
    // devuelve tambien quien guardo cualquier descendiente, y el anclaje con
    // ^ evita que 'heladera' matchee 'heladeras-industriales'.
    if (req.query.service && req.query.service.trim()) {
      const svcRegex = servicePrefixRegex(req.query.service);
      if (svcRegex) query['hogarProfile.services.path'] = { $regex: svcRegex, $options: 'i' };
    }
    // free-text search (q): matches service name, path, action, area, bio — each word independently
    // Verb synonyms map so "reparar", "arreglar" etc. match action "Reparo"
    const VERB_MAP = {
      reparar: ['Reparo', 'reparar'],
      repara: ['Reparo', 'reparar'],
      repare: ['Reparo', 'reparar'],
      reparo: ['Reparo', 'reparar'],
      reparemos: ['Reparo', 'reparar'],
      reparacion: ['Reparo', 'reparación', 'reparacion', 'service'],
      arreglar: ['Reparo', 'arreglar'],
      arregla: ['Reparo', 'arreglar'],
      arreglo: ['Reparo', 'arreglar', 'arreglo'],
      compongo: ['Reparo', 'componer'],
      componer: ['Reparo', 'componer'],
      service: ['Reparo', 'service', 'servicio técnico', 'servicio'],
      'servicio técnico': ['Reparo', 'service', 'servicio técnico', 'servicio'],
      'servicio tecnico': ['Reparo', 'service', 'servicio técnico', 'servicio'],
      servicio: ['Reparo', 'service', 'servicio técnico', 'servicio'],
      técnico: ['Reparo', 'técnico', 'tecnico'],
      tecnico: ['Reparo', 'técnico', 'tecnico'],
      instalar: ['Instalo', 'instalar'],
      colocar: ['Instalo', 'colocar'],
      montar: ['Instalo', 'montar'],
      mantener: ['Hago mantenimiento', 'mantener'],
      mantenimiento: ['Hago mantenimiento', 'mantenimiento'],
      revisar: ['Hago mantenimiento', 'revisar'],
      chequear: ['Hago mantenimiento', 'chequear'],
      verificar: ['verificar', 'Verificar'],
      inspeccionar: ['verificar', 'inspeccionar'],
      certificar: ['verificar', 'certificar'],
      desinstalar: ['desinstalar', 'Desinstalar'],
      quitar: ['desinstalar', 'quitar'],
      retirar: ['desinstalar', 'retirar'],
      vender: ['Vendo repuestos', 'vender'],
      asesorar: ['Asesoro', 'asesorar']
    };
    if (req.query.q && req.query.q.trim()) {
      const words = req.query.q.trim().split(/\s+/).filter(Boolean);
      if (words.length > 0) {
        const pushWordFilter = (target, w) => {
          const lower = w.toLowerCase();
          const orConditions = [];
          // always match raw word (tolerante a tildes, ñ y guion/espacio)
          const rawRe = flexibleTextRegex(w);
          orConditions.push({ 'hogarProfile.services.path': rawRe });
          orConditions.push({ 'hogarProfile.services.name': rawRe });
          orConditions.push({ 'hogarProfile.services.brands': rawRe });
          orConditions.push({ 'hogarProfile.professions.name': rawRe });
          orConditions.push({ 'professionalProfile.professions.name': rawRe });
          orConditions.push({ 'professionalProfile.services': rawRe });
          orConditions.push({ 'hogarProfile.action': rawRe });
          orConditions.push({ professionalType: rawRe });
          orConditions.push({ 'professionalProfile.bio': rawRe });
          orConditions.push({ 'professionalProfile.alias': rawRe });
          orConditions.push({ 'hogarProfile.specialty': rawRe });
          orConditions.push({ name: rawRe });
          // if verb maps to action values, also match those
          if (VERB_MAP[lower]) {
            VERB_MAP[lower].forEach(actionVal => {
              const actRe = flexibleTextRegex(actionVal);
              orConditions.push({ 'hogarProfile.action': actRe });
              // la accion del dispositivo guardado tambien tiene que responder
              orConditions.push({ 'hogarProfile.services.actions': actRe });
            });
          }
          target.$and.push({ $or: orConditions });
        };
        query.$and = query.$and || [];
        const firstWordClause = query.$and.length;
        words.forEach(w => pushWordFilter(query, w));

        // El usuario escribe frases ("necesito un reparo de heladera", "casa de
        // campo"). Cada palabra se exige con AND, asi que un conector o un
        // verbo de intencion que no esta en ningun campo deja la busqueda en
        // cero. Se prepara una version sin esas palabras, pero SOLO se usa si
        // la version estricta no encontro a nadie: nunca se relajan criterios
        // que ya devuelven resultados.
        const STOP_WORDS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'e', 'o', 'u', 'en', 'para', 'con', 'sin', 'sobre', 'a', 'al', 'lo', 'me', 'mi', 'se', 'que', 'necesito', 'necesita', 'quiero', 'busco', 'buscar', 'hago', 'hacen', 'tengo', 'tiene', 'tienen', 'hay', 'falta', 'faltan', 'urgente', 'urgencia']);
        const core = words.filter(w => !STOP_WORDS.has(w.toLowerCase()));
        if (core.length > 0 && core.length < words.length) {
          relaxedQuery = Object.assign({}, query, { $and: query.$and.slice(0, firstWordClause) });
          core.forEach(w => pushWordFilter(relaxedQuery, w));
        }
      }
    }
    // brand filter: matches any service's brands array
    if (req.query.brand && req.query.brand.trim()) {
      query['hogarProfile.services.brands'] = { $regex: escapeRegex(req.query.brand.trim()), $options: 'i' };
    }
    // action filter: matches any service's actions array (device-level)
    if (req.query.action && req.query.action.trim()) {
      query['hogarProfile.services.actions'] = { $regex: escapeRegex(req.query.action.trim()), $options: 'i' };
    }
    // geolocation: sort by distance when lat/lng provided
    const userLat = parseFloat(req.query.lat) || null;
    const userLng = parseFloat(req.query.lng) || null;

    const page = parseInt(req.query.page, 10) || 1;
    const parsedLimit = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 12;
    const skip = (page - 1) * limit;

    const haversine = (lat1, lon1, lat2, lon2) => {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2) * Math.sin(dLon/2);
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    };

    const needsDistance = userLat != null && userLng != null;

    // Si la busqueda estricta por texto libre no trae resultados, se reintenta
    // sin conectores ("necesito un reparo de heladera" -> reparo + heladera).
    if (relaxedQuery && !(await User.exists(query))) {
      query = relaxedQuery;
    }

    let users;
    let total;
    if (needsDistance) {
      // Fetch all, sort by distance in-memory
      const all = await User.find(query).select(
        'name email professionalType professionalProfile.location.lat professionalProfile.location.lng professionalProfile.alias professionalProfile.photos professionalProfile.professions professionalProfile.usesWhatsApp professionalProfile.whatsappNumber professionalProfile.mobilePhone ' +
        'hogarProfile.firstName hogarProfile.lastName hogarProfile.companyName ' +
        'hogarProfile.action hogarProfile.area hogarProfile.specialty ' +
        'hogarProfile.services hogarProfile.professions hogarProfile.photos hogarProfile.availability hogarProfile.address ' +
        'hogarProfile.contact'
      ).lean();
      all.forEach(u => {
        const pp = u.professionalProfile || {};
        const loc = (pp.location && pp.location.lat && pp.location.lng) ? pp.location : (u.hogarProfile && u.hogarProfile.address);
        if (loc && loc.lat && loc.lng) {
          u._distance = Math.round(haversine(userLat, userLng, loc.lat, loc.lng) * 10) / 10;
        } else {
          u._distance = 99999;
        }
      });
      all.sort((a, b) => a._distance - b._distance);
      total = all.length;
      users = all.slice(skip, skip + limit);
    } else {
      users = await User.find(query).select(
        'name email professionalType professionalProfile.location.lat professionalProfile.location.lng professionalProfile.alias professionalProfile.photos professionalProfile.professions professionalProfile.usesWhatsApp professionalProfile.whatsappNumber professionalProfile.mobilePhone ' +
        'hogarProfile.firstName hogarProfile.lastName hogarProfile.companyName ' +
        'hogarProfile.action hogarProfile.area hogarProfile.specialty ' +
        'hogarProfile.services hogarProfile.professions hogarProfile.photos hogarProfile.availability hogarProfile.address ' +
        'hogarProfile.contact'
      ).skip(skip).limit(limit).lean();
      total = await User.countDocuments(query);
    }

    const hasMore = skip + users.length < total;

    const data = users.map(u => {
      const hp = u.hogarProfile || {};
      const pp = u.professionalProfile || {};
      // Vista publica: la entrada "otra" se muestra por su nombre, sin el
      // prefijo interno "__otra__:". El prefijo solo existe en el dato guardado.
      const services = (hp.services || []).map(s => ({
        ...s,
        brands: (s.brands || []).map(brandDisplayName).filter(Boolean)
      }));
      const primary = services[0] || {};
      const photo = (hp.photos && hp.photos[0]) ? hp.photos[0] : ((pp.photos && pp.photos[0]) || null);
      const loc = hp.address || {};
      const locationLine = (loc.province || '').toLowerCase() === 'caba'
        ? [loc.neighborhood, 'CABA'].filter(Boolean).join(', ')
        : [loc.neighborhood, loc.city].filter(Boolean).join(', ');
      const rawContact = hp.contact || {};
      const waPhone = pp.whatsappNumber || pp.mobilePhone || rawContact.mobilePhone || '';
      const contact = {
        whatsapp: Boolean(rawContact.whatsapp || pp.usesWhatsApp !== false),
        telegram: Boolean(rawContact.telegram),
        mobilePhone: b64(rawContact.mobilePhone || pp.mobilePhone || ''),
        email: b64(rawContact.email),
        telegramId: b64(rawContact.telegram),
        whatsappNumber: b64(waPhone)
      };
      return {
        _id: u._id,
        alias: pp.alias || '',
        name: hp.firstName ? `${hp.firstName} ${hp.lastName || ''}`.trim() : (u.name || 'Técnico'),
        action: hp.action || '',
        actionDetails: hp.actionDetails || '',
        area: hp.area || '',
        category: u.professionalType || '',
        specialty: hp.specialty || '',
        availability: hp.availability || '',
        serviceName: primary.name || '',
        brands: primary.brands || [],
        actions: primary.actions || [],
        professions: hp.professions && hp.professions.length ? hp.professions : (pp.professions || []),
        photo,
        photoUrl: photo,
        location: locationLine,
        distance: u._distance != null && u._distance < 99999 ? u._distance : null,
        whatsapp: Boolean(rawContact.whatsapp || pp.usesWhatsApp !== false),
        telegram: Boolean(rawContact.telegram),
        contact,
        services
      };
    });

    res.status(200).json({
      success: true,
      count: data.length,
      pagination: { total, page, limit, hasMore },
      data: data.map(sanitizePublicProfessions)
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
      accountDeletedAt: null,
      $or: [
        { verificationStatus: 'approved' },
        { verificationStatus: { $exists: false } },
        { verificationStatus: null }
      ]
    }).select('name email hogarProfile professionalProfile professionalType').lean();
    if (user && !user.hogarProfile?.firstName && !user.hogarProfile?.services?.length) {
      // No hogar data, try to ensure at least some profile exists
    }

    if (!user) {
      return res.status(404).json({ success: false, error: 'Técnico no encontrado' });
    }

    const hp = user.hogarProfile || {};
    const pp = user.professionalProfile || {};
    const rawContact = hp.contact || {};
    const waPhone = pp.whatsappNumber || pp.mobilePhone || rawContact.mobilePhone || '';
    const contact = {
      whatsapp: Boolean(rawContact.whatsapp || pp.usesWhatsApp !== false),
      telegram: Boolean(rawContact.telegram),
      mobilePhone: b64(rawContact.mobilePhone || pp.mobilePhone || ''),
      email: b64(rawContact.email),
      telegramId: b64(rawContact.telegram),
      whatsappNumber: b64(waPhone)
    };
    const photos = (hp.photos && hp.photos.length) ? hp.photos : (user.professionalProfile && user.professionalProfile.photos && user.professionalProfile.photos.length) ? user.professionalProfile.photos : [];

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
    // Ficha publica: la entrada "otra" se muestra por su nombre, sin el
    // prefijo interno "__otra__:" que solo sirve para el round-trip del perfil.
    const hpPublic = {
      ...hpClean,
      services: (hpClean.services || []).map(s => ({
        ...s,
        brands: (s.brands || []).map(brandDisplayName).filter(Boolean)
      })),
      photos
    };
    // Ficha publica: el numero y el archivo de la matricula son datos
    // privados, solo viaja el estado de declaracion/verificacion.
    const publico = sanitizePublicProfessions({ hogarProfile: hpPublic, professionalProfile: user.professionalProfile || undefined });
    res.status(200).json({
      success: true,
      data: {
        _id: user._id,
        name: hp.firstName ? `${hp.firstName} ${hp.lastName || ''}`.trim() : (user.name || 'Técnico'),
        email: b64(user.email),
        contact,
        hogarProfile: publico.hogarProfile,
        professionalProfile: publico.professionalProfile
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

