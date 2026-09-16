const Aviso = require('../models/Aviso');
const User = require('../models/User');
const { getClientIp } = require('../utils/clientIp');
const sendEmail = require('../sendEmail');
const serviceTree = require('../data/serviceTree');

const AVISO_PRICES = {
  hogar: 5000,
  oficina: 10000,
  pime: 10000,
  industria: 20000
};

const AVISO_DURATION_DAYS = 30;
const MAX_ACTIVE_AVISOS = 5;
const EXPIRY_WARNING_DAYS = 5;

async function adminLogDetails(req) {
  try {
    const ActivityLog = require('../models/ActivityLog');
    const { resolveAdminIpLabel } = require('../utils/activityLogMeta');
    const ip = getClientIp(req);
    const label = await resolveAdminIpLabel(ip);
    return { ip, label };
  } catch { return { ip: '', label: null }; }
}

exports.createAviso = async (req, res) => {
  try {
    const { environment, serviceLine, text } = req.body;
    if (!environment || !AVISO_PRICES[environment]) {
      return res.status(400).json({ success: false, error: 'Invalid environment' });
    }
    if (!serviceLine) {
      return res.status(400).json({ success: false, error: 'Service line is required' });
    }

    const areaNode = serviceTree.find(a => a.id === environment);
    if (!areaNode) {
      return res.status(400).json({ success: false, error: 'Invalid area' });
    }
    const catNode = areaNode.categories.find(c => c.id === serviceLine);
    if (!catNode) {
      return res.status(400).json({ success: false, error: 'Invalid service line for this area' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const activeCount = await Aviso.countDocuments({
      professional: req.user.id,
      status: { $in: ['pending_payment', 'active', 'expiring'] }
    });
    if (activeCount >= MAX_ACTIVE_AVISOS) {
      return res.status(400).json({ success: false, error: `Maximum ${MAX_ACTIVE_AVISOS} active avisos allowed` });
    }

    const existing = await Aviso.findOne({
      professional: req.user.id,
      environment,
      serviceLine,
      status: { $in: ['pending_payment', 'active', 'expiring'] }
    });
    if (existing) {
      return res.status(400).json({ success: false, error: `Ya tenés un aviso activo para ${catNode.name} en ${environment}. Solo se permite un aviso por línea de servicio.` });
    }

    const hogar = user.hogarProfile || {};
    const declaredAreas = hogar.area ? [hogar.area] : [];
    if (!declaredAreas.includes(environment)) {
      return res.status(400).json({ success: false, error: `Environment "${environment}" is not declared in your profile` });
    }

    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + AVISO_DURATION_DAYS);

    const aviso = await Aviso.create({
      professional: req.user.id,
      environment,
      serviceLine,
      serviceLineName: catNode.name,
      text: text || '',
      startDate: now,
      endDate,
      price: AVISO_PRICES[environment],
      status: 'pending_payment'
    });

    res.status(201).json({ success: true, data: aviso });
  } catch (err) {
    console.error('createAviso error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getMyAvisos = async (req, res) => {
  try {
    const avisos = await Aviso.find({ professional: req.user.id })
      .sort({ createdAt: -1 });

    const user = await User.findById(req.user.id).select('professionalProfile.alias professionalProfile.firstName professionalProfile.surname professionalProfile.workingHours professionalProfile.workingDays hogarProfile').lean();

    const enriched = avisos.map(a => {
      const avisoObj = a.toObject();
      avisoObj._professionalData = extractProfessionalData(user);
      return avisoObj;
    });

    res.json({ success: true, data: enriched, count: enriched.length });
  } catch (err) {
    console.error('getMyAvisos error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getAviso = async (req, res) => {
  try {
    const aviso = await Aviso.findById(req.params.id);
    if (!aviso) {
      return res.status(404).json({ success: false, error: 'Aviso not found' });
    }

    const user = await User.findById(aviso.professional)
      .select('professionalProfile.alias professionalProfile.firstName professionalProfile.surname professionalProfile.workingHours professionalProfile.workingDays professionalProfile.photos professionalProfile.location professionalProfile.bio professionalProfile.commercialDescription professionalProfile.responseSpeed professionalProfile.budgetType professionalProfile.budgetAmount hogarProfile')
      .lean();

    const enriched = aviso.toObject();
    enriched._professionalData = extractProfessionalData(user);

    res.json({ success: true, data: enriched });
  } catch (err) {
    console.error('getAviso error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.updateAviso = async (req, res) => {
  try {
    const aviso = await Aviso.findById(req.params.id);
    if (!aviso) {
      return res.status(404).json({ success: false, error: 'Aviso not found' });
    }
    if (aviso.professional.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not your aviso' });
    }
    if (!['pending_payment'].includes(aviso.status)) {
      return res.status(400).json({ success: false, error: 'Can only edit avisos pending payment' });
    }

    const { text } = req.body;
    if (text !== undefined) aviso.text = text;
    await aviso.save();

    res.json({ success: true, data: aviso });
  } catch (err) {
    console.error('updateAviso error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.cancelAviso = async (req, res) => {
  try {
    const aviso = await Aviso.findById(req.params.id);
    if (!aviso) {
      return res.status(404).json({ success: false, error: 'Aviso not found' });
    }
    if (aviso.professional.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not your aviso' });
    }
    if (['expired', 'cancelled'].includes(aviso.status)) {
      return res.status(400).json({ success: false, error: 'Aviso already inactive' });
    }

    aviso.status = 'cancelled';
    await aviso.save();

    res.json({ success: true, data: aviso });
  } catch (err) {
    console.error('cancelAviso error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.uploadPaymentReceipt = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const aviso = await Aviso.findById(req.params.id);
    if (!aviso) {
      return res.status(404).json({ success: false, error: 'Aviso not found' });
    }
    if (aviso.professional.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not your aviso' });
    }

    const isImage = req.file.mimetype.startsWith('image/');
    const isPdf = req.file.mimetype === 'application/pdf';
    if (!isImage && !isPdf) {
      return res.status(400).json({ success: false, error: 'Only images (JPG/PNG) and PDF allowed' });
    }

    aviso.paymentReceiptUrl = `/uploads/photos/${req.file.filename}`;
    aviso.paymentReceiptType = isPdf ? 'pdf' : 'image';
    if (['mercadopago', 'transferencia'].includes(req.body.paymentMethod)) {
      aviso.paymentMethod = req.body.paymentMethod;
    }
    await aviso.save();

    res.json({ success: true, data: { paymentReceiptUrl: aviso.paymentReceiptUrl, paymentReceiptType: aviso.paymentReceiptType, paymentMethod: aviso.paymentMethod } });
  } catch (err) {
    console.error('uploadPaymentReceipt error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getPublicAvisos = async (req, res) => {
  try {
    const { environment, page = 1, limit = 20 } = req.query;

    if (!environment || !AVISO_PRICES[environment]) {
      return res.status(400).json({ success: false, error: 'Valid environment required' });
    }

    const query = {
      environment,
      status: { $in: ['active', 'expiring'] }
    };

    const skip = (Number(page) - 1) * Number(limit);
    const [avisos, total] = await Promise.all([
      Aviso.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      Aviso.countDocuments(query)
    ]);

    const professionalIds = [...new Set(avisos.map(a => a.professional))];
    const professionals = await User.find({ _id: { $in: professionalIds } })
      .select('professionalProfile.alias professionalProfile.firstName professionalProfile.surname professionalProfile.workingHours professionalProfile.workingDays professionalProfile.photos professionalProfile.location professionalProfile.bio professionalProfile.commercialDescription professionalProfile.responseSpeed professionalProfile.budgetType professionalProfile.budgetAmount hogarProfile')
      .lean();

    const profMap = {};
    professionals.forEach(p => { profMap[p._id.toString()] = p; });

    const enriched = avisos.map(a => {
      const obj = typeof a.toObject === 'function' ? a.toObject() : { ...a };
      obj._professionalData = extractProfessionalData(profMap[a.professional.toString()]);
      return obj;
    });

    res.json({
      success: true,
      data: enriched,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) }
    });
  } catch (err) {
    console.error('getPublicAvisos error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.adminGetAllAvisos = async (req, res) => {
  try {
    const { status, environment, page = 1, limit = 50 } = req.query;

    const query = {};
    if (status) query.status = status;
    if (environment) query.environment = environment;

    const skip = (Number(page) - 1) * Number(limit);
    const [avisos, total] = await Promise.all([
      Aviso.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      Aviso.countDocuments(query)
    ]);

    const professionalIds = [...new Set(avisos.map(a => a.professional.toString()))];
    const professionals = await User.find({ _id: { $in: professionalIds } })
      .select('professionalProfile.alias professionalProfile.firstName professionalProfile.surname email')
      .lean();

    const profMap = {};
    professionals.forEach(p => { profMap[p._id.toString()] = p; });

    const enriched = avisos.map(a => {
      const obj = { ...a };
      const prof = profMap[a.professional];
      obj._professionalName = prof ? `${prof.professionalProfile?.firstName || ''} ${prof.professionalProfile?.surname || ''}`.trim() : '';
      obj._professionalAlias = prof?.professionalProfile?.alias || '';
      obj._professionalEmail = prof?.email || '';
      return obj;
    });

    res.json({
      success: true,
      data: enriched,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) }
    });
  } catch (err) {
    console.error('adminGetAllAvisos error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.adminApproveAviso = async (req, res) => {
  try {
    const { adminNotes } = req.body;
    const aviso = await Aviso.findById(req.params.id);
    if (!aviso) {
      return res.status(404).json({ success: false, error: 'Aviso not found' });
    }
    if (!['pending_payment', 'expiring'].includes(aviso.status)) {
      return res.status(400).json({ success: false, error: 'Cannot approve aviso with this status' });
    }

    aviso.status = 'active';
    aviso.adminNotes = adminNotes || '';

    const now = new Date();
    aviso.endDate = new Date(now);
    aviso.endDate.setDate(aviso.endDate.getDate() + AVISO_DURATION_DAYS);
    aviso.startDate = now;
    aviso.expiryWarningSent = null;

    await aviso.save();

    try {
      const user = await User.findById(aviso.professional).select('email professionalProfile.alias');
      if (user) {
        await sendEmail({
          email: user.email,
          subject: 'KuraTe - Aviso aprobado',
          message: `Hola ${user.professionalProfile?.alias || 'Profesional'},\n\nTu aviso para el entorno "${aviso.environment}" ha sido aprobado y está activo hasta el ${aviso.endDate.toLocaleDateString('es-AR')}.\n\n¡Que tengas muchos contactos!`
        });
      }
    } catch (e) { console.error('Email send failed:', e.message); }

    const log = await adminLogDetails(req);
    try {
      const ActivityLog = require('../models/ActivityLog');
      await ActivityLog.create({
        action: 'aviso_approved',
        actorType: 'admin',
        adminIp: log.ip,
        adminIpLabel: log.label,
        details: { avisoId: aviso._id, environment: aviso.environment }
      });
    } catch {}

    res.json({ success: true, data: aviso });
  } catch (err) {
    console.error('adminApproveAviso error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.adminRejectAviso = async (req, res) => {
  try {
    const { rejectionReason, adminNotes } = req.body;
    if (!rejectionReason) {
      return res.status(400).json({ success: false, error: 'Rejection reason is required' });
    }

    const aviso = await Aviso.findById(req.params.id);
    if (!aviso) {
      return res.status(404).json({ success: false, error: 'Aviso not found' });
    }

    aviso.status = 'rejected';
    aviso.rejectionReason = rejectionReason;
    aviso.adminNotes = adminNotes || '';
    await aviso.save();

    try {
      const user = await User.findById(aviso.professional).select('email professionalProfile.alias');
      if (user) {
        await sendEmail({
          email: user.email,
          subject: 'KuraTe - Aviso rechazado',
          message: `Hola ${user.professionalProfile?.alias || 'Profesional'},\n\nTu aviso para el entorno "${aviso.environment}" ha sido rechazado.\n\nMotivo: ${rejectionReason}\n\nPor favor, revisa los detalles en tu perfil.`
        });
      }
    } catch (e) { console.error('Email send failed:', e.message); }

    const log = await adminLogDetails(req);
    try {
      const ActivityLog = require('../models/ActivityLog');
      await ActivityLog.create({
        action: 'aviso_rejected',
        actorType: 'admin',
        adminIp: log.ip,
        adminIpLabel: log.label,
        details: { avisoId: aviso._id, environment: aviso.environment, reason: rejectionReason }
      });
    } catch {}

    res.json({ success: true, data: aviso });
  } catch (err) {
    console.error('adminRejectAviso error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.adminRenewAviso = async (req, res) => {
  try {
    const { adminNotes } = req.body;
    const aviso = await Aviso.findById(req.params.id);
    if (!aviso) {
      return res.status(404).json({ success: false, error: 'Aviso not found' });
    }

    const now = new Date();
    aviso.status = 'active';
    aviso.startDate = now;
    aviso.endDate = new Date(now);
    aviso.endDate.setDate(aviso.endDate.getDate() + AVISO_DURATION_DAYS);
    aviso.expiryWarningSent = null;
    aviso.renewalCount += 1;
    aviso.adminNotes = adminNotes || '';
    aviso.paymentReceiptUrl = null;
    aviso.paymentReceiptType = null;
    await aviso.save();

    try {
      const user = await User.findById(aviso.professional).select('email professionalProfile.alias');
      if (user) {
        await sendEmail({
          email: user.email,
          subject: 'KuraTe - Aviso renovado',
          message: `Hola ${user.professionalProfile?.alias || 'Profesional'},\n\nTu aviso para el entorno "${aviso.environment}" ha sido renovado hasta el ${aviso.endDate.toLocaleDateString('es-AR')}.`
        });
      }
    } catch (e) { console.error('Email send failed:', e.message); }

    const log = await adminLogDetails(req);
    try {
      const ActivityLog = require('../models/ActivityLog');
      await ActivityLog.create({
        action: 'aviso_renewed',
        actorType: 'admin',
        adminIp: log.ip,
        adminIpLabel: log.label,
        details: { avisoId: aviso._id, environment: aviso.environment, renewal: aviso.renewalCount }
      });
    } catch {}

    res.json({ success: true, data: aviso });
  } catch (err) {
    console.error('adminRenewAviso error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.checkExpiry = async () => {
  try {
    const now = new Date();

    const expired = await Aviso.find({
      status: { $in: ['active', 'expiring', 'pending_payment'] },
      endDate: { $lte: now }
    });

    for (const aviso of expired) {
      const previousStatus = aviso.status;
      aviso.status = 'expired';
      await aviso.save();

      try {
        const user = await User.findById(aviso.professional).select('email professionalProfile.alias');
        if (user) {
          await sendEmail({
            email: user.email,
            subject: 'KuraTe - Aviso expirado',
            message: `Hola ${user.professionalProfile?.alias || 'Profesional'},\n\nTu aviso para el entorno "${aviso.environment}" ha expirado.\n\nTienes 5 días para subir tu comprobante de pago. Si no se recibe pago, el aviso será removido de la grilla.\n\nPuedes gestionar desde tu perfil.`
          });
        }
      } catch (e) { console.error('Expiry email failed:', e.message); }
    }

    const warningDate = new Date(now);
    warningDate.setDate(warningDate.getDate() + EXPIRY_WARNING_DAYS);

    const expiring = await Aviso.find({
      status: 'active',
      endDate: { $lte: warningDate, $gt: now },
      expiryWarningSent: { $exists: false }
    });

    for (const aviso of expiring) {
      aviso.status = 'expiring';
      aviso.expiryWarningSent = now;
      await aviso.save();

      try {
        const user = await User.findById(aviso.professional).select('email professionalProfile.alias');
        if (user) {
          const daysLeft = Math.ceil((aviso.endDate - now) / (1000 * 60 * 60 * 24));
          await sendEmail({
            email: user.email,
            subject: 'KuraTe - Tu aviso está por expirar',
            message: `Hola ${user.professionalProfile?.alias || 'Profesional'},\n\nTu aviso para el entorno "${aviso.environment}" expira en ${daysLeft} días (${aviso.endDate.toLocaleDateString('es-AR')}).\n\nPor favor, renueva tu pago para mantener el aviso activo.`
          });
        }
      } catch (e) { console.error('Warning email failed:', e.message); }
    }

    return { expired: expired.length, warningsSent: expiring.length };
  } catch (err) {
    console.error('checkExpiry error:', err);
    return { expired: 0, warningsSent: 0, error: err.message };
  }
};

exports.getExpiringAvisos = async (req, res) => {
  try {
    const avisos = await Aviso.find({
      professional: req.user.id,
      status: 'expiring'
    }).sort({ endDate: 1 });

    res.json({ success: true, data: avisos });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getAvailableServiceLines = async (req, res) => {
  try {
    const { environment } = req.query;
    if (!environment) {
      return res.status(400).json({ success: false, error: 'environment query param required' });
    }

    const areaNode = serviceTree.find(a => a.id === environment);
    if (!areaNode) {
      return res.status(400).json({ success: false, error: 'Invalid area' });
    }

    const allLines = (areaNode.categories || []).map(c => ({ id: c.id, name: c.name }));

    const usedLines = await Aviso.distinct('serviceLine', {
      professional: req.user.id,
      environment,
      status: { $in: ['pending_payment', 'active', 'expiring'] }
    });
    const usedSet = new Set(usedLines);

    const available = allLines.filter(l => !usedSet.has(l.id));

    res.json({ success: true, data: available, used: [...usedSet] });
  } catch (err) {
    console.error('getAvailableServiceLines error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

function extractProfessionalData(user) {
  if (!user) return null;
  const prof = user.professionalProfile || {};
  const hogar = user.hogarProfile || {};

  return {
    alias: prof.alias || '',
    firstName: prof.firstName || '',
    surname: prof.surname || '',
    workingHours: prof.workingHours || { start: '00:00', end: '23:59' },
    workingDays: prof.workingDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    photos: prof.photos || [],
    location: prof.location || {},
    bio: prof.bio || '',
    commercialDescription: prof.commercialDescription || '',
    responseSpeed: prof.responseSpeed || '',
    availability: hogar.availability || '',
    services: hogar.services || []
  };
}
