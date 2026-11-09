const fs = require('fs');
const path = require('path');
const config = require('../config/appConfig');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const AccessLog = require('../models/AccessLog');
const Statistic = require('../models/Statistic');
const Specialty = require('../models/Specialty');
const Review = require('../models/Review');
const Connection = require('../models/Connection');
const ConnectionRequest = require('../models/ConnectionRequest');
const Feedback = require('../models/Feedback');
const Aviso = require('../models/Aviso');
const ClickEvent = require('../models/ClickEvent');
const SupportMessage = require('../models/SupportMessage');
const TermsAcceptance = require('../models/TermsAcceptance');
const Professional = require('../models/Professional');
const PreRegistration = require('../models/PreRegistration');
const WhatsAppInboundMessage = require('../models/WhatsAppInboundMessage');
const WhatsAppOutboundMessage = require('../models/WhatsAppOutboundMessage');
const { isUploadPath } = require('./photoUtils');
const { userPhones, phoneVariants } = require('./userIdentity');

// ---------------------------------------------------------------------------
// Purga total de una cuenta.
//
// El borrado "normal" (professionalController.deleteMyProfile) es un soft
// delete: deja el documento con accountDeletedAt y conserva email/telefono, asi
// que la persona no puede volver a registrarse. Esto es lo contrario: se lleva
// TODO lo que cuelga del usuario, incluidos los drafts de pre-registro (que
// dejarian viva la sesion del wizard) y los archivos subidos, para que el email
// y el telefono queden libres y la persona pueda empezar de cero.
// ---------------------------------------------------------------------------

function tryDeleteUploadFile(storedPath) {
  if (!isUploadPath(storedPath)) return 0;
  const absolutePath = path.join(config.root, 'public', String(storedPath).replace(/^\//, ''));
  try {
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
      return 1;
    }
  } catch (err) {
    console.error('Failed to delete upload file:', err.message);
  }
  return 0;
}

function collectUploadFiles(user) {
  const files = [];
  const push = (value) => { if (value) files.push(value); };
  const professional = user.professionalProfile || {};
  const hogar = user.hogarProfile || {};

  (professional.photos || []).forEach(push);
  push(professional.paymentReceiptUrl);
  (professional.paymentHistory || []).forEach((entry) => push(entry && entry.receiptUrl));
  (hogar.photos || []).forEach(push);
  push(hogar.paymentReceiptUrl);

  return files;
}

async function purgeUserAccount(userId) {
  if (!userId) return null;

  const user = await User.findById(userId).select('+verificationDocuments');
  if (!user) return null;

  const id = user._id;
  const phones = phoneVariants(userPhones(user));

  // 1) Archivos subidos (fotos de galeria, comprobantes de pago).
  let filesDeleted = 0;
  collectUploadFiles(user).forEach((file) => { filesDeleted += tryDeleteUploadFile(file); });

  // 2) Todo lo que referencia al usuario por ObjectId.
  const results = await Promise.all([
    ActivityLog.deleteMany({ professional: id }),
    AccessLog.deleteMany({ user: id }),
    Statistic.deleteMany({ professionalId: id }),
    Specialty.deleteMany({ user: id }),
    Review.deleteMany({ $or: [{ professional: id }, { author: id }] }),
    Connection.deleteMany({ $or: [{ professional: id }, { requester: id }] }),
    ConnectionRequest.deleteMany({ $or: [{ professional: id }, { guestUser: id }] }),
    Feedback.deleteMany({ professional: id }),
    Aviso.deleteMany({ professional: id }),
    ClickEvent.deleteMany({ professional: id }),
    SupportMessage.deleteMany({ professional: id }),
    TermsAcceptance.deleteMany({ user: id }),
    Professional.deleteMany({ user: id }),
    // Otras cuentas pueden tenerlo como pareja: se limpia la referencia.
    User.updateMany({ duoPartner: id }, { $unset: { duoPartner: 1 } }),
    phones.length
      ? WhatsAppInboundMessage.deleteMany({ $or: [{ fromPhone: { $in: phones } }, { toPhone: { $in: phones } }] })
      : Promise.resolve({ deletedCount: 0 }),
    phones.length
      ? WhatsAppOutboundMessage.deleteMany({ toPhone: { $in: phones } })
      : Promise.resolve({ deletedCount: 0 })
  ]);

  const [
    activityLogs, accessLogs, statistics, specialties, reviews, connections,
    connectionRequests, feedbacks, avisos, clickEvents, supportMessages,
    termsAcceptances, legacyProfessionals, duoPartners, inboundMessages, outboundMessages
  ] = results.map((r) => (r && r.deletedCount) || 0);

  // 3) Drafts de pre-registro: liberan email/telefono y matan la sesion del
  // wizard (si quedara el draft, un complete viejo podria recrear la cuenta).
  const draftOr = [];
  if (user.registrationPreId) draftOr.push({ _id: user.registrationPreId });
  if (user.email) draftOr.push({ email: String(user.email).toLowerCase().trim() });
  if (phones.length) draftOr.push({ phone: { $in: phones } });
  const drafts = draftOr.length
    ? await PreRegistration.deleteMany({ $or: draftOr })
    : { deletedCount: 0 };

  // 4) La cuenta.
  await User.findByIdAndDelete(id);

  return {
    user: {
      _id: id,
      email: user.email,
      role: user.role,
      alias: (user.professionalProfile && user.professionalProfile.alias) || user.name || ''
    },
    removed: {
      users: 1,
      activityLogs,
      accessLogs,
      statistics,
      specialties,
      reviews,
      connections,
      connectionRequests,
      feedbacks,
      avisos,
      clickEvents,
      supportMessages,
      termsAcceptances,
      legacyProfessionals,
      duoPartnerRefs: duoPartners,
      whatsappInbound: inboundMessages,
      whatsappOutbound: outboundMessages,
      preRegistrations: drafts.deletedCount || 0,
      files: filesDeleted
    }
  };
}

module.exports = { purgeUserAccount };
