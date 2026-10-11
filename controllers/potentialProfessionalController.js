const mongoose = require('mongoose');
const PotentialProfessional = require('../models/PotentialProfessional');
const emailOutreachService = require('../services/emailOutreachService');
const { getClientIp } = require('../utils/clientIp');
const ActivityLog = require('../models/ActivityLog');
const {
  buildColdOutreachStep1Message,
  buildOutreachRegisterUrl,
  getOutreachBrandImageUrl,
  buildWhatsAppUrl
} = require('../utils/professionalInviteMessage');

// @desc    Preview outreach invite message (cold WhatsApp step 1 — same as drip/template)
// @route   GET /api/v1/admin/outreach/invite-message
// @access  Private/Admin
exports.getInviteMessage = async (req, res, next) => {
  try {
    const alias = (req.query.alias && String(req.query.alias).trim()) || 'María';
    res.status(200).json({
      success: true,
      data: {
        message: buildColdOutreachStep1Message(alias),
        registerUrl: buildOutreachRegisterUrl(),
        brandImageUrl: getOutreachBrandImageUrl(),
        alias,
        channel: 'whatsapp-cold'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Get all potential professionals
// @route   GET /api/v1/admin/potential-professionals
// @access  Private/Admin
exports.getPotentialProfessionals = async (req, res, next) => {
  try {
    const { status, sourceUrl, fuente, importBatch, q, page = 1, limit = 50 } = req.query;
    const query = {};

    // Allow filtering by status or the source website
    if (status) query.status = status;
    if (sourceUrl) query.sourceUrl = sourceUrl;
    if (fuente) query.fuente = fuente;
    if (importBatch) query.importBatch = importBatch;

    // Filtro por bloqueo de contacto ademas del status. El padron se importa
    // todo con doNotContact y sin esto el admin no puede listar los bloqueados
    // para desbloquearlos en lote desde la UI.
    if (req.query.blocked === 'true') query.doNotContact = true;
    else if (req.query.blocked === 'false') query.doNotContact = { $ne: true };

    // Busqueda por nombre / matricula / email / localidad. El padron de
    // matriculados tiene ~1700 filas: sin esto el admin solo puede paginar
    // a ciegas. Se escapan los caracteres de regex para que un "?" en el
    // input no rompa la query.
    const term = (q && String(q).trim()) || '';
    if (term) {
      const safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(safe, 'i');
      query.$or = [{ name: rx }, { matricula: rx }, { email: rx }, { locality: rx }, { alias: rx }, { phone: rx }];
    }

    const startIndex = (page - 1) * limit;

    const potentials = await PotentialProfessional.find(query)
      // Solo los campos que pinta la tabla: traer los docs completos (phones,
      // phoneRaw, etc.) agranda el sort en memoria y la respuesta sin aportar.
      .select('name alias email phone matricula locality status smsStatus emailStatus doNotContact doNotContactReason doNotContactAt createdAt sourceUrl fuente importBatch')
      // Orden estable: `createdAt` solo no alcanza cuando un lote entra con
      // el mismo timestamp, y eso hace que paginar repita o salte filas.
      .sort({ createdAt: -1, matricula: 1, _id: 1 })
      .skip(startIndex)
      .limit(Math.min(parseInt(limit, 10) || 50, 200));

    const total = await PotentialProfessional.countDocuments(query);

    res.status(200).json({
      success: true,
      count: potentials.length,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total
      },
      data: potentials.map((lead) => {
        const obj = lead.toObject ? lead.toObject() : lead;
        return {
          ...obj,
          whatsappLink: buildWhatsAppUrl(obj.phone, obj.alias)
        };
      })
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Update potential professional status
// @route   PUT /api/v1/admin/potential-professionals/:id
// @access  Private/Admin
exports.updatePotentialProfessional = async (req, res, next) => {
  try {
    const { status, doNotContact, doNotContactReason } = req.body;

    const updates = {};
    if (status !== undefined) {
      if (!['pending', 'contacted', 'joined', 'rejected', 'failed'].includes(status)) {
        return res.status(400).json({ success: false, error: 'Invalid status' });
      }
      updates.status = status;
    }
    if (doNotContact !== undefined) {
      updates.doNotContact = Boolean(doNotContact);
      if (updates.doNotContact) {
        updates.doNotContactAt = new Date();
        updates.doNotContactReason = String(doNotContactReason || 'Blocked in admin').trim().slice(0, 500);
        if (!updates.status) updates.status = 'rejected';
      } else {
        updates.doNotContactReason = '';
        updates.doNotContactAt = null;
      }
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }

    const potential = await PotentialProfessional.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );

    if (!potential) {
      return res.status(404).json({ success: false, error: 'Potential professional not found' });
    }

    res.status(200).json({
      success: true,
      data: potential
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Block outreach to all leads matching a phone (any alias / duplicate import)
// @route   POST /api/v1/admin/potential-professionals/block-phone
// @access  Private/Admin
exports.blockPhone = async (req, res, next) => {
  try {
    const { phone, reason } = req.body || {};
    if (!phone) {
      return res.status(400).json({ success: false, error: 'phone is required' });
    }

    const { buildPhoneInQuery, expandPhoneVariants } = require('../utils/outreachPhone');
    const query = buildPhoneInQuery(phone);
    if (!query) {
      return res.status(400).json({ success: false, error: 'Invalid phone number' });
    }

    const note = String(reason || 'Blocked in admin').trim().slice(0, 500);
    const now = new Date();
    const result = await PotentialProfessional.updateMany(query, {
      $set: {
        doNotContact: true,
        doNotContactReason: note,
        doNotContactAt: now
      }
    });

    let created = null;
    if (result.matchedCount === 0) {
      const variants = expandPhoneVariants(phone);
      created = await PotentialProfessional.create({
        phone: variants[0],
        status: 'rejected',
        doNotContact: true,
        doNotContactReason: note,
        doNotContactAt: now,
        sourceUrl: 'manual:admin-block-phone'
      });
    }

    const matches = await PotentialProfessional.find(query);

    res.status(200).json({
      success: true,
      data: {
        variants: expandPhoneVariants(phone),
        matched: result.matchedCount,
        modified: result.modifiedCount,
        createdId: created?._id || null,
        leads: matches
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Default email for outreach to a selected batch of potential professionals
// @route   GET /api/v1/admin/potential-professionals/invite-email
// @access  Private/Admin
exports.getInviteEmail = async (req, res, next) => {
  try {
    const alias = (req.query.alias && String(req.query.alias).trim()) || '';
    const profession = (req.query.profession && String(req.query.profession).trim()) || '';
    res.status(200).json({
      success: true,
      data: {
        subject: alias ? `KuraTe para ${alias}` : 'KuraTe - te invitamos a sumarte',
        body: buildColdOutreachEmailBody(alias, profession),
        registerUrl: buildOutreachRegisterUrl()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Cuerpo en texto plano del correo de invitacion. Sin HTML a proposito: el
// SMTP configurado no garantiza entrega de HTML y a una lista fria el texto
// plano rinde mejor.
function buildColdOutreachEmailBody(alias, profession) {
  const rawName = (alias && String(alias).trim()) || '';
  const cleanName = rawName.replace(/[:;,.\s]+$/, '').trim();
  const greeting = cleanName ? `Hola ${cleanName},` : 'Hola,';
  const registerUrl = buildOutreachRegisterUrl();
  const link = registerUrl || '(se está configurando)';

  // "gasista" a secas si no sabemos el oficio del lead; si viene informado,
  // el mail nombra al profession para que no se sienta copy-pasteado.
  const oficios = { gasista: 'gasista', gasistas: 'gasista', electricista: 'electricista', electricistas: 'electricista' };
  const oficio = oficios[String(profession || '').trim().toLowerCase()] || '';
  const enPadron = oficio
    ? `Te escribimos desde KuraTe porque figurás en el padrón de ${oficio}s matriculados.`
    : 'Te escribimos desde KuraTe porque figurás en un padrón oficial de profesionales matriculados.';
  const red = oficio
    ? `Estamos armando la red de profesionales de KuraTe: ${oficio}s con matrícula que aparecen en las búsquedas de tu zona cuando alguien necesita un ${oficio}.`
    : 'Estamos armando la red de profesionales de KuraTe: los matriculados de los padrones oficiales aparecen en las búsquedas de su zona cuando alguien necesita ese servicio.';

  return `${greeting}

${enPadron}

${red}

Qué recibís si te registrás:
- Tu perfil visible con tu zona de cobertura.
- Tu matrícula verificada en las búsquedas.
- Sin costo de alta ni suscripción mensual.

Cómo funciona el cobro:
El registro es gratuito, pero publicar avisos es un servicio pago. Cada aviso
tiene un costo único según el tipo de trabajo (hogar, oficina, pyme o industria)
y dura 30 días. No hay permanencia ni renovación automática: cada aviso se
paga y se publica por separado, y vos decidís si volvés a publicar.

Antes de pagar nada vas a ver el precio exacto y confirmás. KuraTe no te cobra
sin que vos lo autorices.

Para crear tu cuenta:
${link}

Aclaración: que figurés en el padrón de matriculados no implica que ya tengas cuenta en KuraTe.

Si no te sirve o preferís que no te escribamos más, respondé este mail con "nomolestar" y no te volvemos a contactar.`;
}

// @desc    Send email to a selected batch of potential professionals
// @route   POST /api/v1/admin/potential-professionals/send-email
// @access  Private/Admin
//
// Solo a los ids que el admin tilda. No hay modo "todos": el padron tiene 1665
// personas que no dieron consentimiento para ser contactadas, asi que el envio
// masivo es siempre una decision manual y consciente.
//
// El envio corre en segundo plano (emailOutreachService) y responde 202: con la
// frecuencia configurable por minuto un lote puede tardar varios minutos y un
// request sincronico se caeria en el timeout de nginx. El admin pollea
// GET /api/v1/admin/outreach/bulk-email/status para ver el progreso.
exports.sendEmailToSelected = async (req, res, next) => {
  try {
    const { ids, subject, message, rate } = req.body || {};

    const cleanSubject = String(subject || '').trim();
    const cleanMessage = String(message || '').trim();
    if (!cleanSubject || !cleanMessage) {
      return res.status(400).json({ success: false, error: 'Subject and message are required' });
    }
    if (cleanSubject.length > 200) {
      return res.status(400).json({ success: false, error: 'Subject too long' });
    }
    if (cleanMessage.length > 10000) {
      return res.status(400).json({ success: false, error: 'Message too long' });
    }
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ success: false, error: 'Select at least one recipient' });
    }
    // Techo por request: mandar 1665 mails en un solo POST deja el proceso
    // colgado y no se puede cancelar. El admin manda tandas.
    if (ids.length > 100) {
      return res.status(400).json({ success: false, error: 'Max 100 recipients per batch' });
    }
    // Frecuencia: emails por minuto (10 -> un email cada 6 segundos). Se valida
    // aca con un mensaje claro antes de pasarle el numero crudo al servicio.
    const rateNum = Number(rate);
    if (Number.isFinite(rateNum)) {
      if (rateNum < 1 || rateNum > 120) {
        return res.status(400).json({ success: false, error: 'Rate must be between 1 and 120 emails per minute' });
      }
    }

    const status = emailOutreachService.startSendBackground({
      ids,
      subject: cleanSubject,
      message: cleanMessage,
      ratePerMinute: rateNum,
      adminId: req.user.id,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent']
    });

    res.status(202).json({
      success: true,
      message: 'Email outreach started',
      data: status
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Email outreach progress
// @route   GET /api/v1/admin/outreach/bulk-email/status
// @access  Private/Admin
exports.getEmailOutreachStatus = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      data: emailOutreachService.getStatus()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
// @desc    Batch unblock potential professionals (doNotContact -> false, pending)
// @route   POST /api/v1/admin/potential-professionals/unblock-batch
// @access  Private/Admin
//
// El padron se importa entero bloqueado (sin consentimiento): desbloquear uno
// por uno es inmanejable. Este endpoint quita doNotContact de los ids que manda
// el admin y los vuelve a 'pending'. La salvaguarda se mantiene: desbloquear
// no envia ningun mensaje, solo habilita la seleccion en la UI.
exports.unblockBatch = async (req, res, next) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ success: false, error: 'Select at least one lead' });
    }

    const validIds = ids
      .filter((id) => id && mongoose.Types.ObjectId.isValid(String(id)))
      .map((id) => new mongoose.Types.ObjectId(String(id)));

    if (!validIds.length) {
      return res.status(400).json({ success: false, error: 'Select at least one valid lead' });
    }
    // Techo generoso: la UI desbloquea por pagina (max 200) pero no conviene
    // dejar crecer el body sin limite.
    if (validIds.length > 500) {
      return res.status(400).json({ success: false, error: 'Max 500 leads per batch' });
    }

    const result = await PotentialProfessional.updateMany(
      { _id: { $in: validIds }, doNotContact: true },
      {
        $set: {
          doNotContact: false,
          doNotContactReason: '',
          doNotContactAt: null,
          status: 'pending'
        }
      }
    );

    await ActivityLog.create({
      professional: req.user.id,
      action: 'admin_unblock_leads',
      actorType: 'admin',
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
      isGuest: false,
      details: { requested: validIds.length, matched: result.matchedCount, modified: result.modifiedCount }
    });

    res.status(200).json({
      success: true,
      data: { requested: validIds.length, matched: result.matchedCount, modified: result.modifiedCount }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Export de la plantilla pura para poder revisarla desde un script (no HTTP).
// No lo usa el router: es para tests/preview sin sesion admin.
module.exports.buildColdOutreachEmailBody = buildColdOutreachEmailBody;
