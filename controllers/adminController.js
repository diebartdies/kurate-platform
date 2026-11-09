const User = require('../models/User');
const config = require('../config/appConfig');
const { recordCategoryChange, normalizeQuality } = require('../utils/categoryBilling');
const ActivityLog = require('../models/ActivityLog');
const sendEmail = require('../sendEmail');
const { isValidRejectionReason, buildRejectionEmail } = require('../utils/rejectionMessages');
const { resolvePhotoForClient, resolvePhotosForClient, resolveFirstPhotoForClient, normalizePhotosForStorage } = require('../utils/photoUtils');
const { purgeUserAccount } = require('../utils/userPurge');
const { findUserByPhone, userPhones } = require('../utils/userIdentity');
const { resolveWhatsappNumber } = require('../utils/contactNumber');
const smsNotifications = require('../services/smsNotifications');
const { getClientIp, isTrustedAdminIp } = require('../utils/clientIp');
const { loadKnownAdminIps, resolveAdminIpLabel } = require('../utils/adminKnownIps');
const { ACTOR_TYPES, resolveActorType, buildActorTypeQuery } = require('../utils/activityLogMeta');
const { attachIpIntelBatch } = require('../services/ipIntelService');

function adminLogDetails(req, extra = {}) {
  return {
    adminId: req.user.id,
    adminEmail: req.user.email,
    ...extra
  };
}

// El modal de edicion del admin manda solo {slug, name}. Reemplazar la lista a
// ciegas borraria la matricula habilitante (numero, foto y estado de
// verificacion) de los oficios regulados, asi que esos campos se heredan del
// valor guardado salvo que el payload los mande explicito.
function mergeProfessionsPreservingMatricula(current, incoming) {
  const lista = Array.isArray(incoming) ? incoming : [];
  const previos = new Map();
  (Array.isArray(current) ? current : []).forEach((p) => {
    if (p && p.slug) previos.set(String(p.slug).toLowerCase(), p);
  });
  return lista.map((p) => {
    if (!p || !p.slug) return p;
    const previo = previos.get(String(p.slug).toLowerCase());
    if (!previo) return p;
    const out = { ...p };
    if (out.matriculado === undefined) out.matriculado = !!previo.matriculado;
    if (out.matriculado) {
      if (out.matriculaNumero === undefined) out.matriculaNumero = previo.matriculaNumero || '';
      if (out.matriculaFoto === undefined) out.matriculaFoto = previo.matriculaFoto || '';
      if (out.matriculaVerificada === undefined) out.matriculaVerificada = !!previo.matriculaVerificada;
      if (out.matriculaVerificadaAt === undefined) out.matriculaVerificadaAt = previo.matriculaVerificadaAt || null;
      if (out.matriculaRechazada === undefined) out.matriculaRechazada = !!previo.matriculaRechazada;
    } else {
      out.matriculaNumero = '';
      out.matriculaFoto = '';
      out.matriculaVerificada = false;
      out.matriculaVerificadaAt = null;
      out.matriculaRechazada = false;
    }
    return out;
  });
}

async function enrichActivityLogs(logs) {
  const adminIds = [
    ...new Set(
      logs
        .map((log) => log.details && log.details.adminId)
        .filter(Boolean)
        .map((id) => String(id))
    )
  ];

  const admins = adminIds.length
    ? await User.find({ _id: { $in: adminIds } }).select('email name role')
    : [];
  const adminMap = new Map(admins.map((admin) => [admin._id.toString(), admin.toObject()]));
  const trustedIps = await loadKnownAdminIps();

  const enriched = await Promise.all(logs.map(async (log) => {
    const obj = log.toObject ? log.toObject() : { ...log };
    const adminId = obj.details && obj.details.adminId ? String(obj.details.adminId) : '';
    if (adminId && adminMap.has(adminId)) {
      obj.adminUser = adminMap.get(adminId);
    }
    const ipLabel = obj.details?.adminIpLabel || await resolveAdminIpLabel(obj.ipAddress);
    obj.adminIpLabel = ipLabel || null;
    obj.isAdminHomeIp = ipLabel === 'ho';
    obj.isTrustedAdminIp = isTrustedAdminIp(obj.ipAddress, trustedIps);
    obj.actorType = resolveActorType(obj, trustedIps);
    return obj;
  }));

  return attachIpIntelBatch(enriched);
}

// Best-effort removal of an uploaded asset that lives under /public.
// @desc    Get all professionals
// @route   GET /api/v1/admin/professionals
// @access  Private/Admin
exports.getAllProfessionals = async (req, res, next) => {
  try {
    const { alias, page = 1, limit: limitParam = 0 } = req.query;
    const query = { role: 'professional' };
    
    if (alias) {
      query['professionalProfile.alias'] = { $regex: alias, $options: 'i' };
    }

    const parsedLimit = parseInt(limitParam, 10);
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : 0;
    const skip = limit > 0 ? (page - 1) * limit : 0;

    let professionalsQuery = User.find(query)
      .sort({ createdAt: -1 })
      .skip(skip);
    if (limit > 0) {
      professionalsQuery = professionalsQuery.limit(limit);
    }
    const professionals = await professionalsQuery;

    const total = await User.countDocuments(query);

    const professionalsData = professionals.map(p => {
        const obj = p.toObject();
        if (obj.professionalProfile && obj.professionalProfile.photos) {
            const first = resolveFirstPhotoForClient(obj.professionalProfile.photos);
            obj.professionalProfile.photos = first ? [first] : [];
        }
        return obj;
    });

    res.status(200).json({
      success: true,
      count: professionals.length,
      pagination: { page: parseInt(page, 10), limit: parseInt(limit, 10), total },
      data: professionalsData
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Get a single professional with ALL photos resolved for the client.
//          The list endpoint (getAllProfessionals) truncates photos to the
//          cover only, so the admin edit form fetches the full record here to
//          manage the complete photo gallery.
// @route   GET /api/v1/admin/professionals/:id
// @access  Private/Admin
exports.getProfessionalById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user || user.role !== 'professional') {
      return res.status(404).json({ success: false, error: 'Professional not found' });
    }

    const obj = user.toObject();
    if (obj.professionalProfile && obj.professionalProfile.photos) {
      obj.professionalProfile.photos = resolvePhotosForClient(obj.professionalProfile.photos);
    }

    res.status(200).json({ success: true, data: obj });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Get all pending professional verifications
// @route   GET /api/v1/admin/verifications/pending
// @access  Private/Admin
exports.getPendingVerifications = async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;

    const query = { role: 'professional', verificationStatus: 'pending' };

    const pending = await User.find(query)
      .select('+verificationDocuments')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10));

    const total = await User.countDocuments(query);

    const pendingData = pending.map(p => {
        const obj = p.toObject();
        if (obj.professionalProfile && obj.professionalProfile.photos) {
            obj.professionalProfile.photos = resolvePhotosForClient(obj.professionalProfile.photos);
        }
        return obj;
    });

    res.status(200).json({
      success: true,
      count: pending.length,
      pagination: { page: parseInt(page, 10), limit: parseInt(limit, 10), total },
      data: pendingData
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Send broadcast email to professionals
// @route   POST /api/v1/admin/notifications/mail/broadcast
// @access  Private/Admin
exports.sendBroadcastEmail = async (req, res, next) => {
  try {
    const { subject, message, audience } = req.body;
    
    if (!subject || !message) {
      return res.status(400).json({ success: false, error: 'Subject and message are required' });
    }

    const query = { role: 'professional' };
    if (audience === 'approved') {
      query.verificationStatus = 'approved';
    }

    const professionals = await User.find(query);

    // Send emails in background
    professionals.forEach(p => {
      sendEmail({
        email: p.email,
        subject: subject,
        message: `Hello ${p.professionalProfile?.alias || 'Professional'},\n\n${message}`
      }).catch(err => console.error(`Failed to send email to ${p.email}:`, err));
    });

    const clientIp = getClientIp(req);
    await ActivityLog.create({
      professional: req.user.id,
      action: 'admin_broadcast_email',
      actorType: 'admin',
      ipAddress: clientIp,
      userAgent: req.headers['user-agent'],
      isGuest: false,
      details: adminLogDetails(req, { count: professionals.length, subject, audience })
    });

    res.status(200).json({
      success: true,
      message: `Broadcast email triggered for ${professionals.length} professionals`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Send email to selected professionals only
// @route   POST /api/v1/admin/notifications/mail/targeted
// @access  Private/Admin
exports.sendTargetedEmail = async (req, res, next) => {
  try {
    const { subject, message, recipientIds } = req.body;

    if (!subject || !message) {
      return res.status(400).json({ success: false, error: 'Subject and message are required' });
    }
    if (!Array.isArray(recipientIds) || recipientIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Select at least one recipient' });
    }

    const professionals = await User.find({
      _id: { $in: recipientIds },
      role: 'professional'
    });

    if (professionals.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid professional recipients found' });
    }

    professionals.forEach(p => {
      sendEmail({
        email: p.email,
        subject,
        message: `Hello ${p.professionalProfile?.alias || 'Professional'},\n\n${message}`
      }).catch(err => console.error(`Failed to send email to ${p.email}:`, err));
    });

    const clientIp = getClientIp(req);
    await ActivityLog.create({
      professional: req.user.id,
      action: 'admin_targeted_email',
      actorType: 'admin',
      ipAddress: clientIp,
      userAgent: req.headers['user-agent'],
      isGuest: false,
      details: adminLogDetails(req, {
        count: professionals.length,
        subject,
        recipientIds: professionals.map(p => p._id)
      })
    });

    res.status(200).json({
      success: true,
      message: `Email triggered for ${professionals.length} selected professional(s)`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Distinct filter values for activity logs UI
// @route   GET /api/v1/admin/logs/filters
// @access  Private/Admin
exports.getActivityLogFilters = async (req, res, next) => {
  try {
    const [actions, ips, userAgents, highlightCount, registrationCount] = await Promise.all([
      ActivityLog.distinct('action'),
      ActivityLog.distinct('ipAddress', { ipAddress: { $exists: true, $nin: [null, ''] } }),
      ActivityLog.distinct('userAgent', { userAgent: { $exists: true, $nin: [null, ''] } }),
      ActivityLog.countDocuments({ highlight: true }),
      ActivityLog.countDocuments({ action: { $regex: '^registration_', $options: 'i' } })
    ]);

    res.status(200).json({
      success: true,
      data: {
        actions: actions.filter(Boolean).sort(),
        actorTypes: ACTOR_TYPES,
        ips: ips.filter(Boolean).sort().slice(0, 100),
        userAgents: userAgents.filter(Boolean).sort((a, b) => a.localeCompare(b)).slice(0, 40),
        stats: {
          highlighted: highlightCount,
          registrationEvents: registrationCount
        }
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Get all activity logs
// @route   GET /api/v1/admin/logs
// @access  Private/Admin
exports.getActivityLogs = async (req, res, next) => {
  try {
    const {
      action,
      ipAddress,
      userAgent,
      isGuest,
      actorType,
      highlight,
      page = 1,
      limit = 50
    } = req.query;

    const query = {};
    if (action) query.action = action;
    if (ipAddress) query.ipAddress = ipAddress;
    if (userAgent) query.userAgent = userAgent;
    if (isGuest !== undefined) {
      query.isGuest = isGuest === 'true' ? true : { $ne: true };
    }
    if (highlight === 'true') query.highlight = true;
    if (highlight === 'false') query.highlight = { $ne: true };

    const actorQuery = buildActorTypeQuery(actorType);
    if (actorQuery) {
      query.$and = query.$and || [];
      query.$and.push(actorQuery);
    }

    const skip = (page - 1) * limit;

    const logs = await ActivityLog.find(query)
      .populate('professional', 'email role professionalProfile.alias')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10));

    const total = await ActivityLog.countDocuments(query);
    const enrichedLogs = await enrichActivityLogs(logs);

    res.status(200).json({
      success: true,
      count: enrichedLogs.length,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total
      },
      data: enrichedLogs
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Verify a professional
// @route   PUT /api/v1/admin/verifications/:id
// @access  Private/Admin
exports.verifyProfessional = async (req, res, next) => {
  try {
    const { status, rejectionReason, rejectionDetails } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a valid status (approved or rejected)'
      });
    }

    if (status === 'rejected') {
      if (!isValidRejectionReason(rejectionReason)) {
        return res.status(400).json({
          success: false,
          error: 'Please select a valid rejection reason.'
        });
      }
      if (!rejectionDetails || !String(rejectionDetails).trim()) {
        return res.status(400).json({
          success: false,
          error: 'Please provide rejection details in the text field.'
        });
      }
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    user.verificationStatus = status;
    user.isVerified = status === 'approved';

    if (status === 'approved') {
      user.rejectionReason = null;
      user.rejectionDetails = null;
      user.allowResubmission = false;
    } else {
      const details = String(rejectionDetails).trim();
      user.rejectionReason = rejectionReason;
      user.rejectionDetails = details;
      user.allowResubmission = rejectionReason === 'photos_unclear' || rejectionReason === 'photo_info_mismatch';
    }

    await user.save();

    if (status === 'approved') {
      sendEmail({
        email: user.email,
        subject: 'KuraTe - Your Profile Has Been Approved!',
        message: `Hello ${user.professionalProfile?.alias || 'Professional'},\n\nGreat news! Your KuraTe profile has been approved by our team.\n\nYou can now edit your profile, upload gallery photos, and appear in the public directory.\n\nPlease log in to your Professional Dashboard to complete your profile.\n\nWelcome to `
      }).catch(err => console.error(`Failed to send approval email to ${user.email}:`, err.message));
    } else {
      const emailMessage = buildRejectionEmail({
        alias: user.professionalProfile?.alias,
        reason: rejectionReason,
        details: String(rejectionDetails).trim()
      });
      sendEmail({
        email: user.email,
        subject: 'KuraTe - Profile Verification Update',
        message: emailMessage
      }).catch(err => console.error(`Failed to send rejection email to ${user.email}:`, err.message));
    }

    // SMS visibility notice (best-effort; never blocks the verification flow).
    await smsNotifications.notifyVisibilityChange(
      user,
      status === 'approved' ? 'aprobado y visible' : 'no aprobado'
    ).catch(() => {});

    const clientIp = getClientIp(req);
    await ActivityLog.create({
      professional: user._id,
      action: status === 'approved' ? 'admin_approve_verification' : 'admin_reject_verification',
      actorType: 'admin',
      ipAddress: clientIp,
      userAgent: req.headers['user-agent'],
      isGuest: false,
      details: adminLogDetails(req, {
        rejectionReason: status === 'rejected' ? rejectionReason : undefined,
        rejectionDetails: status === 'rejected' ? String(rejectionDetails).trim() : undefined
      })
    });

    res.status(200).json({
      success: true,
      data: {
        id: user._id,
        email: user.email,
        verificationStatus: user.verificationStatus,
        isVerified: user.isVerified,
        allowResubmission: user.allowResubmission
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Get pending payments
// @route   GET /api/v1/admin/payments/pending
// @access  Private/Admin
exports.getPendingPayments = async (req, res, next) => {
  try {
    const Aviso = require('../models/Aviso');

    // 1. Old system: professionals with subscription payment receipts pending
    const pendingSubs = await User.find({
      role: 'professional',
      'professionalProfile.paymentReceiptUrl': { $exists: true, $ne: null },
      'professionalProfile.paymentProcessed': { $ne: true }
    }).select('email professionalProfile.alias professionalProfile.firstName professionalProfile.lastName professionalProfile.photo professionalProfile.paymentReceiptUrl createdAt');

    const subsPayments = pendingSubs.map(u => ({
      _id: u._id,
      type: 'subscription',
      firstName: u.professionalProfile?.firstName || '',
      lastName: u.professionalProfile?.lastName || '',
      alias: u.professionalProfile?.alias || '',
      photo: u.professionalProfile?.photo || '',
      receiptUrl: u.professionalProfile.paymentReceiptUrl,
      receiptType: u.professionalProfile.paymentReceiptUrl?.endsWith('.pdf') ? 'pdf' : 'image',
      createdAt: u.createdAt,
      price: null
    }));

    // 2. Aviso system: avisos with pending_payment that have a receipt uploaded
    const pendingAvisos = await Aviso.find({
      status: 'pending_payment',
      paymentReceiptUrl: { $exists: true, $ne: null }
    }).populate('professional', 'email professionalProfile.alias professionalProfile.firstName professionalProfile.lastName professionalProfile.photo');

    const avisoPayments = pendingAvisos.map(a => ({
      _id: a._id,
      type: 'aviso',
      firstName: a.professional?.professionalProfile?.firstName || '',
      lastName: a.professional?.professionalProfile?.lastName || '',
      alias: a.professional?.professionalProfile?.alias || '',
      photo: a.professional?.professionalProfile?.photo || '',
      receiptUrl: a.paymentReceiptUrl,
      receiptType: a.paymentReceiptType || (a.paymentReceiptUrl?.endsWith('.pdf') ? 'pdf' : 'image'),
      createdAt: a.createdAt,
      price: a.price,
      environment: a.environment,
      text: a.text,
      endDate: a.endDate
    }));

    const all = [...subsPayments, ...avisoPayments].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.status(200).json({
      success: true,
      count: all.length,
      data: all
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Acknowledge payment
// @route   PUT /api/v1/admin/payments/:id/acknowledge
// @access  Private/Admin
exports.acknowledgePayment = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user || user.role !== 'professional') {
      return res.status(404).json({ success: false, error: 'Professional not found' });
    }

    user.professionalProfile.paymentProcessed = true;
    user.professionalProfile.subscriptionStatus = 'active';

    let tariffChangedTo = null;
    if (user.professionalProfile.desiredQuality) {
      const previousQuality = normalizeQuality(user.professionalProfile.quality);
      const nextQuality = normalizeQuality(user.professionalProfile.desiredQuality);
      if (previousQuality !== nextQuality) {
        user.professionalProfile.categoryChangeLog = [...(user.professionalProfile.categoryChangeLog || [])];
        recordCategoryChange(user.professionalProfile, previousQuality, nextQuality);
        tariffChangedTo = nextQuality;
      }
      user.professionalProfile.quality = nextQuality;
    }
    user.professionalProfile.isEvaluationPeriod = false;

    if (user.professionalProfile.invoices) {
      user.professionalProfile.invoices.forEach(inv => {
        if (inv.status === 'pending') inv.status = 'paid';
      });
    }

    await user.save();

    if (tariffChangedTo) {
      await smsNotifications.notifyTariffChange(
        user,
        `tu categoria vigente cambio a ${tariffChangedTo}`
      ).catch(() => {});
    }

    res.status(200).json({ success: true, data: user });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Update a professional profile by admin
// @route   PUT /api/v1/admin/professionals/:id
// @access  Private/Admin
exports.updateProfessionalProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user || user.role !== 'professional') {
      return res.status(404).json({
        success: false,
        error: 'Professional not found'
      });
    }

    // Capture pre-update state so we only fire SMS notices on real transitions.
    const prevVerificationStatus = user.verificationStatus;
    const prevIsExposed = user.professionalProfile?.isExposed;
    const prevQualityForSms = normalizeQuality(user.professionalProfile?.quality);

    // Allow admin to update email, verification status, or nested profile data
    if (req.body.email) user.email = req.body.email;
    if (req.body.verificationStatus) {
      user.verificationStatus = req.body.verificationStatus;
      user.isVerified = req.body.verificationStatus === 'approved';
      if (req.body.verificationStatus === 'approved') {
        user.firstApprovedLogin = true;
      }
    }

    if (req.body.professionalProfile) {
      if (req.body.professionalProfile.photos) {
          // The admin photo carousel sends the full, ORDERED gallery: existing
          // photos are re-sent as their stored value (base64 data URI / URL) and
          // newly uploaded photos arrive as fresh base64 data URIs. Persisting the
          // array verbatim (after normalization) supports add, delete, reorder and
          // set-first/cover (index 0 is the public thumbnail) in one pass.
          const incomingPhotos = Array.isArray(req.body.professionalProfile.photos)
            ? req.body.professionalProfile.photos
            : [];
          user.professionalProfile.photos = normalizePhotosForStorage(
            incomingPhotos,
            user.professionalProfile.photos || []
          );
          delete req.body.professionalProfile.photos;
      }

      const previousQuality = normalizeQuality(user.professionalProfile.quality);
      const existingCategoryLog = [...(user.professionalProfile.categoryChangeLog || [])];
      const incomingQuality = req.body.professionalProfile.quality !== undefined
        ? normalizeQuality(req.body.professionalProfile.quality)
        : null;

      user.professionalProfile = {
        ...user.professionalProfile.toObject(),
        ...req.body.professionalProfile
      };
      if (req.body.professionalProfile.professions !== undefined) {
        user.professionalProfile.professions = mergeProfessionsPreservingMatricula(
          user.professionalProfile.professions,
          req.body.professionalProfile.professions
        );
      }
      user.professionalProfile.whatsappNumber = resolveWhatsappNumber(user.professionalProfile);

      if (!req.body.professionalProfile.categoryChangeLog) {
        user.professionalProfile.categoryChangeLog = existingCategoryLog;
      }

      if (
        incomingQuality &&
        incomingQuality !== previousQuality &&
        !user.professionalProfile.isEvaluationPeriod
      ) {
        user.professionalProfile.categoryChangeLog = [...(user.professionalProfile.categoryChangeLog || [])];
        recordCategoryChange(user.professionalProfile, previousQuality, incomingQuality);
      }
    }

    // Hogar professional services (structured: [{ path, name, actions, brands }])
    // — the admin edit modal persists these here since it targets the edited user,
    // not the admin's own account (the pro dashboard uses /professionals/hogar/services).
    if (req.body.hogarProfile && user.hogarProfile) {
      const hp = user.hogarProfile;
      if (req.body.hogarProfile.companyName !== undefined) hp.companyName = req.body.hogarProfile.companyName;
      if (req.body.hogarProfile.taxId !== undefined) hp.taxId = req.body.hogarProfile.taxId;
      if (req.body.hogarProfile.services !== undefined) {
        const { sanitizeServices } = require('../utils/otraBrand');
        hp.services = sanitizeServices(req.body.hogarProfile.services);
      }
      if (req.body.hogarProfile.professions !== undefined) hp.professions = mergeProfessionsPreservingMatricula(hp.professions, req.body.hogarProfile.professions);
      user.hogarProfile = hp;
    }

    await user.save();

    // Best-effort SMS notices for admin-driven transitions (never block the save).
    if (req.body.verificationStatus && req.body.verificationStatus !== prevVerificationStatus) {
      await smsNotifications.notifyVisibilityChange(
        user,
        req.body.verificationStatus === 'approved' ? 'aprobado y visible' : 'no visible'
      ).catch(() => {});
    } else {
      const newExposed = user.professionalProfile?.isExposed;
      if (prevIsExposed !== undefined && newExposed !== undefined && newExposed !== prevIsExposed) {
        await smsNotifications.notifyVisibilityChange(
          user,
          newExposed ? 'visible' : 'oculto'
        ).catch(() => {});
      }
    }

    const newQualityForSms = normalizeQuality(user.professionalProfile?.quality);
    if (newQualityForSms !== prevQualityForSms) {
      await smsNotifications.notifyTariffChange(
        user,
        `tu categoria vigente cambio a ${newQualityForSms}`
      ).catch(() => {});
    }

    const clientIp = getClientIp(req);
    await ActivityLog.create({
      professional: user._id,
      action: 'admin_edit_profile',
      actorType: 'admin',
      ipAddress: clientIp,
      userAgent: req.headers['user-agent'],
      isGuest: false,
      details: adminLogDetails(req)
    });

    const responseUser = user.toObject();
    if (responseUser.professionalProfile && responseUser.professionalProfile.photos) {
        responseUser.professionalProfile.photos = resolvePhotosForClient(responseUser.professionalProfile.photos);
    }

    res.status(200).json({
      success: true,
      data: responseUser
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Issue a temporary password for any user (admin support action)
// @route   PUT /api/v1/admin/users/:id/password
// @access  Private/Admin
// Sets mustChangePassword so the temp password is single-use, and bumps tokenVersion
// so every already-issued JWT for that account stops authenticating immediately.
exports.setUserPassword = async (req, res, next) => {
  try {
    const { password, confirmPassword } = req.body || {};
    if (!password || String(password).length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters.' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, error: 'Passwords do not match.' });
    }

    const user = await User.findById(req.params.id).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    if (user.accountDeletedAt) {
      return res.status(400).json({ success: false, error: 'Cannot reset the password of a deleted account.' });
    }

    // Hashed by the User pre-save hook.
    user.password = password;
    user.mustChangePassword = true;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    const isSelf = String(user._id) === String(req.user.id);
    const clientIp = getClientIp(req);
    // Never log the password itself — only that an admin issued one.
    await ActivityLog.create({
      professional: user._id,
      action: 'admin_set_password',
      actorType: 'admin',
      ipAddress: clientIp,
      userAgent: req.headers['user-agent'],
      isGuest: false,
      details: adminLogDetails(req, {
        targetId: user._id,
        targetEmail: user.email,
        self: isSelf
      })
    });

    const emailDelivered = await sendEmail({
      email: user.email,
      subject: 'KuraTe - Tu contraseña temporal',
      message: `Hola ${user.professionalProfile?.alias || user.hogarProfile?.firstName || ''},\n\nUn administrador de KuraTe generó una contraseña temporal para tu cuenta.\n\nContraseña temporal: ${password}\n\nPor seguridad, todas tus sesiones abiertas se cerraron. La próxima vez que ingreses vas a tener que definir una contraseña nueva.\n\nSi no esperabas este cambio, respondé este correo de inmediato.`
    }).then(() => true).catch((err) => {
      console.error(`Failed to send temp password email to ${user.email}:`, err.message);
      return false;
    });

    res.status(200).json({
      success: true,
      message: 'Password set. The user must change it on next login.',
      data: {
        emailDelivered,
        self: isSelf
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Permanently delete a professional account (admin)
// @route   DELETE /api/v1/admin/professionals/:id
// @access  Private/Admin
exports.deleteProfessional = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('role');

    if (!user || user.role !== 'professional') {
      return res.status(404).json({
        success: false,
        error: 'Professional not found'
      });
    }

    // Purga total (utils/userPurge.js): cuenta, contenido, logs, drafts de
    // pre-registro y archivos. Libera el email y el telefono para que la persona
    // pueda volver a registrarse, a diferencia del soft delete del usuario.
    const result = await purgeUserAccount(user._id);

    try {
      await ActivityLog.create({
        professional: req.user.id,
        action: 'admin_purged_user',
        actorType: 'admin',
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'],
        isGuest: false,
        details: adminLogDetails(req, {
          targetId: String(user._id),
          targetEmail: result && result.user ? result.user.email : null,
          targetRole: 'professional',
          removed: result ? result.removed : null
        })
      });
    } catch (logErr) {
      console.error('Failed to log admin purge:', logErr.message);
    }

    res.status(200).json({
      success: true,
      message: 'Professional account and all its data have been permanently deleted.',
      data: result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Purga total de una cuenta (cualquier rol): borra el usuario y todo lo
//          que cuelga de el, incluidos los drafts de pre-registro, para que el
//          email y el telefono queden libres y la persona pueda registrarse otra vez.
// @route   DELETE /api/v1/admin/users/:id
// @access  Private/Admin
exports.purgeUser = async (req, res) => {
  try {
    const target = await User.findById(req.params.id).select('email role');

    if (!target) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    if (target.role === 'admin') {
      return res.status(400).json({ success: false, error: 'An admin account cannot be purged.' });
    }
    if (String(target._id) === String(req.user.id)) {
      return res.status(400).json({ success: false, error: 'You cannot purge your own account.' });
    }

    const result = await purgeUserAccount(target._id);
    if (!result) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    try {
      await ActivityLog.create({
        professional: req.user.id,
        action: 'admin_purged_user',
        actorType: 'admin',
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'],
        isGuest: false,
        details: adminLogDetails(req, {
          targetId: String(target._id),
          targetEmail: result.user.email,
          targetRole: result.user.role,
          removed: result.removed
        })
      });
    } catch (logErr) {
      console.error('Failed to log admin purge:', logErr.message);
    }

    res.status(200).json({
      success: true,
      message: 'Account and all its data were permanently deleted. The email and phone are free to register again.',
      data: result
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Buscar cuentas por email o telefono (para liberarlas antes de un alta)
// @route   GET /api/v1/admin/users/lookup?q=...
// @access  Private/Admin
exports.lookupUsers = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 3) {
      return res.status(400).json({ success: false, error: 'Type at least 3 characters.' });
    }

    const found = new Map();
    const addUser = (user) => {
      if (!user) return;
      const id = String(user._id);
      if (found.has(id)) return;
      found.set(id, {
        _id: user._id,
        email: user.email,
        role: user.role,
        alias: (user.professionalProfile && user.professionalProfile.alias) || user.name || '',
        phones: userPhones(user),
        accountDeletedAt: user.accountDeletedAt || null,
        createdAt: user.createdAt || null
      });
    };

    const SELECT = '_id email role name accountDeletedAt createdAt professionalProfile.alias professionalProfile.mobilePhone professionalProfile.whatsappNumber hogarProfile.contact.mobilePhone';

    if (q.includes('@')) {
      const escaped = q.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const byEmail = await User.find({ email: { $regex: escaped, $options: 'i' } })
        .select(SELECT)
        .limit(20)
        .lean();
      byEmail.forEach(addUser);
    } else if (/\d{6,}/.test(q.replace(/\D/g, ''))) {
      const byPhone = await findUserByPhone(q);
      if (byPhone) {
        const full = await User.findById(byPhone._id).select(SELECT).lean();
        addUser(full);
      }
    }

    res.status(200).json({ success: true, count: found.size, data: Array.from(found.values()) });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};
