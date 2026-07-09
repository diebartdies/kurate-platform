const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const config = require('../config/appConfig');
const { recordCategoryChange, normalizeQuality } = require('../utils/categoryBilling');
const ActivityLog = require('../models/ActivityLog');
const Statistic = require('../models/Statistic');
const Specialty = require('../models/Specialty');
const Review = require('../models/Review');
const Connection = require('../models/Connection');
const ConnectionRequest = require('../models/ConnectionRequest');
const sendEmail = require('../sendEmail');
const { isValidRejectionReason, buildRejectionEmail } = require('../utils/rejectionMessages');
const { isUploadPath, resolvePhotoForClient, resolvePhotosForClient, resolveFirstPhotoForClient, normalizePhotosForStorage } = require('../utils/photoUtils');
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
// Mirrors the cleanup helper used by professionalController.deleteMyProfile.
function tryDeleteUploadFile(storedPath) {
  if (!isUploadPath(storedPath)) return;
  const absolutePath = path.join(config.root, 'public', storedPath.replace(/^\//, ''));
  try {
    if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
  } catch (err) {
    console.error('Failed to delete upload file:', err.message);
  }
}

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
        subject: 'FullMinent - Your Profile Has Been Approved!',
        message: `Hello ${user.professionalProfile?.alias || 'Professional'},\n\nGreat news! Your FullMinent profile has been approved by our team.\n\nYou can now edit your profile, upload gallery photos, and appear in the public directory.\n\nPlease log in to your Professional Dashboard to complete your profile.\n\nWelcome to `
      }).catch(err => console.error(`Failed to send approval email to ${user.email}:`, err.message));
    } else {
      const emailMessage = buildRejectionEmail({
        alias: user.professionalProfile?.alias,
        reason: rejectionReason,
        details: String(rejectionDetails).trim()
      });
      sendEmail({
        email: user.email,
        subject: 'FullMinent - Profile Verification Update',
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
    const pending = await User.find({
      role: 'professional',
      'professionalProfile.paymentReceiptUrl': { $exists: true, $ne: null },
      'professionalProfile.paymentProcessed': { $ne: true }
    }).select('email professionalProfile.alias professionalProfile.firstName professionalProfile.lastName professionalProfile.paymentReceiptUrl createdAt');

    res.status(200).json({
      success: true,
      count: pending.length,
      data: pending
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

// @desc    Permanently delete a professional account (admin)
// @route   DELETE /api/v1/admin/professionals/:id
// @access  Private/Admin
exports.deleteProfessional = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('+verificationDocuments');

    if (!user || user.role !== 'professional') {
      return res.status(404).json({
        success: false,
        error: 'Professional not found'
      });
    }

    const prof = user.professionalProfile || {};

    // Clean up uploaded assets that live under /public.
    (prof.photos || []).forEach(tryDeleteUploadFile);
    tryDeleteUploadFile(prof.paymentReceiptUrl);
    (prof.paymentHistory || []).forEach((entry) => tryDeleteUploadFile(entry.receiptUrl));

    // Mirror deleteMyProfile cleanup of related collections.
    await Promise.all([
      ActivityLog.deleteMany({ professional: user._id }),
      Statistic.deleteMany({ professionalId: user._id }),
      Specialty.deleteMany({ user: user._id }),
      Review.deleteMany({ $or: [{ professional: user._id }, { author: user._id }] }),
      Connection.deleteMany({ $or: [{ professional: user._id }, { requester: user._id }] }),
      ConnectionRequest.deleteMany({ $or: [{ professional: user._id }, { guestUser: user._id }] })
    ]);

    await User.findByIdAndDelete(user._id);

    res.status(200).json({
      success: true,
      message: 'Professional account has been permanently deleted.'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};
