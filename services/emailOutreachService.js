const PotentialProfessional = require('../models/PotentialProfessional');
const sendEmail = require('../sendEmail');
const ActivityLog = require('../models/ActivityLog');

// Envio de emails de invitacion a lote en segundo plano, con frecuencia
// configurable. Mismo patron que whatsappOutreachService / smsOutreachService:
// el endpoint que lo dispara responde 202 y el admin pollea /bulk-email/status.
// Sin esto, un lote con frecuencia baja (ej. 10/min) dejaria un request HTTP
// abierto por muchos minutos y nginx lo cortaria a los ~60s.

const BUSY_PHASES = new Set(['sending']);

const state = {
  phase: 'idle', // idle | sending | complete | error
  total: 0,
  sent: 0,
  failed: 0,
  skipped: 0,
  notFound: 0,
  currentLead: null,
  lastError: null,
  startedAt: null,
  finishedAt: null,
  ratePerMinute: 10,
  intervalMs: 6000
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// La frecuencia es "emails por minuto": con rate=10 el intervalo es 60/10 = 6s.
// Se admite entre 1 y 120; por debajo de 500ms el SMTP empieza a rebotar.
function clampRate(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 10;
  return Math.min(120, Math.max(1, Math.round(n)));
}

function getStatus() {
  return { ...state, processed: state.sent + state.failed + state.skipped };
}

async function markLeadEmail(leadDoc, { status, error, subject }) {
  if (!leadDoc) return;
  try {
    leadDoc.emailStatus = status;
    if (status === 'sent') {
      leadDoc.emailSentAt = new Date();
      leadDoc.emailSubject = subject || undefined;
      leadDoc.emailError = undefined;
    } else if (status === 'failed') {
      leadDoc.emailError = (error && String(error).slice(0, 500)) || 'unknown error';
    }
    await leadDoc.save();
  } catch (err) {
    state.lastError = `Failed to mark lead email ${status}: ${err.message}`;
  }
}

function resetRunCounters(total, notFound) {
  state.total = total;
  state.sent = 0;
  state.failed = 0;
  state.skipped = 0;
  state.notFound = notFound;
  state.currentLead = null;
  state.lastError = null;
  state.startedAt = new Date();
  state.finishedAt = null;
}

async function processLeads(leads, opts) {
  state.phase = 'sending';

  for (let i = 0; i < leads.length; i += 1) {
    const lead = leads[i];
    state.currentLead = lead.name || lead.alias || lead.email || String(lead._id);

    // Misma guarda que el envio sincronico anterior: bloqueado (padron sin
    // consentimiento) o sin email se saltea y avanza.
    if (lead.doNotContact) {
      state.skipped += 1;
      continue;
    }
    if (!lead.email) {
      state.skipped += 1;
      continue;
    }

    try {
      await sendEmail({ email: lead.email, subject: opts.subject, message: opts.message });
      await markLeadEmail(lead, { status: 'sent', subject: opts.subject });
      state.sent += 1;
    } catch (err) {
      await markLeadEmail(lead, { status: 'failed', error: err.message });
      state.failed += 1;
      state.lastError = `Send failed for ${lead.email}: ${err.message}`;
    }

    // Pacer: 60/rate segundos entre envios. Nunca tras el ultimo para no
    // alargar la corrida.
    if (i < leads.length - 1) {
      await sleep(state.intervalMs);
    }
  }

  state.currentLead = null;
  state.phase = 'complete';
  state.finishedAt = new Date();
}

async function startSend(opts) {
  if (BUSY_PHASES.has(state.phase)) {
    return getStatus();
  }

  const rate = clampRate(opts.ratePerMinute);
  state.ratePerMinute = rate;
  state.intervalMs = Math.max(500, Math.round(60000 / rate));

  const ids = Array.isArray(opts.ids) ? opts.ids.filter(Boolean) : [];
  const uniqueRequested = new Set(ids.map((id) => String(id)));

  // Sincrono hasta el primer await: getStatus() inmediato (el que devuelve
  // startSendBackground) ya tiene que verse 'sending', si no la UI lee un
  // estado viejo y muestra el resumen vacio antes de tiempo.
  state.phase = 'sending';
  resetRunCounters(0, 0);

  const leads = ids.length
    ? await PotentialProfessional.find({ _id: { $in: ids } }).sort({ createdAt: 1 })
    : [];

  state.total = leads.length;
  state.notFound = Math.max(0, uniqueRequested.size - leads.length);

  if (leads.length === 0) {
    state.phase = 'complete';
    state.lastError = ids.length ? 'No matching leads found' : 'Select at least one recipient';
    state.finishedAt = new Date();
    return getStatus();
  }

  try {
    await processLeads(leads, opts);
  } catch (err) {
    state.phase = 'error';
    state.lastError = err.message;
    state.finishedAt = new Date();
  }

  try {
    await ActivityLog.create({
      professional: opts.adminId,
      action: 'admin_potential_email',
      actorType: 'admin',
      ipAddress: opts.ipAddress,
      userAgent: opts.userAgent,
      isGuest: false,
      details: {
        requested: ids.length,
        sent: state.sent,
        skipped: state.skipped,
        failed: state.failed,
        notFound: state.notFound,
        ratePerMinute: state.ratePerMinute,
        subject: opts.subject
      }
    });
  } catch (err) {
    // Auditoria best-effort: no aborta la corrida si falla el log.
    state.lastError = state.lastError || `Activity log failed: ${err.message}`;
  }

  return getStatus();
}

function startSendBackground(opts) {
  if (BUSY_PHASES.has(state.phase)) {
    return getStatus();
  }

  startSend(opts).catch((err) => {
    state.phase = 'error';
    state.lastError = err.message;
    state.finishedAt = new Date();
  });

  return getStatus();
}

module.exports = {
  getStatus,
  startSend,
  startSendBackground
};