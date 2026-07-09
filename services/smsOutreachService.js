const PotentialProfessional = require('../models/PotentialProfessional');
const { OUTREACH_ALLOWED_FILTER, isOutreachBlocked } = require('../utils/outreachPhone');
const config = require('../config/appConfig');
const smsService = require('./smsService');
const { inviteSms } = require('../utils/smsTemplates');

const BUSY_PHASES = new Set(['sending', 'waiting_window']);

// Legacy leads were stored before the `smsStatus` field existed, so they carry
// no value at all (Mongoose schema defaults are NOT back-filled onto documents
// already in the DB). Treat missing/null exactly like an explicit 'pending' so
// "all pending" actually targets those existing leads. Mirrors the WhatsApp
// engine's `status`-based selection but on the independent `smsStatus` field.
const PENDING_SMS_QUERY = {
  ...OUTREACH_ALLOWED_FILTER,
  $or: [
    { smsStatus: 'pending' },
    { smsStatus: { $exists: false } },
    { smsStatus: null }
  ]
};

const state = {
  phase: 'idle',
  total: 0,
  sent: 0,
  failed: 0,
  skipped: 0,
  currentLead: null,
  lastError: null,
  startedAt: null,
  finishedAt: null,
  waitingReason: null,   // null | 'outside_night_window' | 'nightly_cap_reached'
  nightlySent: 0,
  currentNightId: null
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function randomDelay(minMs, maxMs) {
  const lo = Math.min(minMs, maxMs);
  const hi = Math.max(minMs, maxMs);
  return Math.floor(Math.random() * (hi - lo + 1) + lo);
}

// Persist a lead's SMS outcome (best-effort: a DB hiccup must not abort the run).
async function markLeadSms(leadDoc, { status, error, sid }) {
  if (!leadDoc) return;
  try {
    leadDoc.smsStatus = status;
    if (status === 'sent') {
      leadDoc.smsSentAt = new Date();
      leadDoc.smsSid = sid || undefined;
      leadDoc.smsError = undefined;
    } else if (status === 'failed') {
      leadDoc.smsError = (error && String(error).slice(0, 300)) || 'unknown error';
    }
    await leadDoc.save();
  } catch (err) {
    state.lastError = `Failed to mark lead sms ${status}: ${err.message}`;
  }
}

// --- Slow-drip night-window helpers (mirror whatsappOutreachService) ---------
function parseTimeToMinutes(value) {
  const match = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(String(value || ''));
  if (!match) return 0;
  const hours = Math.min(23, parseInt(match[1], 10));
  const minutes = Math.min(59, parseInt(match[2], 10));
  return hours * 60 + minutes;
}

function localNow(offsetHours) {
  return new Date(Date.now() + offsetHours * 60 * 60 * 1000);
}

function minutesOfDay(shiftedDate) {
  return shiftedDate.getUTCHours() * 60 + shiftedDate.getUTCMinutes();
}

function localDateString(shiftedDate) {
  return shiftedDate.toISOString().slice(0, 10);
}

function isWithinWindow(nowMin, startMin, endMin) {
  if (startMin === endMin) return true;
  if (startMin < endMin) return nowMin >= startMin && nowMin < endMin;
  return nowMin >= startMin || nowMin < endMin;
}

function nightIdFor(shiftedDate, nowMin, startMin, endMin) {
  if (startMin > endMin && nowMin < endMin) {
    const prev = new Date(shiftedDate.getTime() - 24 * 60 * 60 * 1000);
    return localDateString(prev);
  }
  return localDateString(shiftedDate);
}

async function waitForSendSlot() {
  const cfg = config.sms;
  const startMin = parseTimeToMinutes(cfg.nightWindowStart);
  const endMin = parseTimeToMinutes(cfg.nightWindowEnd);
  const cap = Number(cfg.nightlyCap) || 0;
  const pollMs = Number(cfg.pollIntervalMs) || 30000;

  for (;;) {
    const shifted = localNow(cfg.timezoneOffsetHours);
    const nowMin = minutesOfDay(shifted);

    if (!isWithinWindow(nowMin, startMin, endMin)) {
      state.phase = 'waiting_window';
      state.waitingReason = 'outside_night_window';
      state.currentLead = null;
      await sleep(pollMs);
      continue;
    }

    const nightId = nightIdFor(shifted, nowMin, startMin, endMin);
    if (nightId !== state.currentNightId) {
      state.currentNightId = nightId;
      state.nightlySent = 0;
    }

    if (cap > 0 && state.nightlySent >= cap) {
      state.phase = 'waiting_window';
      state.waitingReason = 'nightly_cap_reached';
      state.currentLead = null;
      await sleep(pollMs);
      continue;
    }

    state.waitingReason = null;
    return;
  }
}

function getStatus() {
  return { ...state, processed: state.sent + state.failed + state.skipped };
}

function resetRunCounters(total) {
  state.total = total;
  state.sent = 0;
  state.failed = 0;
  state.skipped = 0;
  state.currentLead = null;
  state.lastError = null;
  state.startedAt = new Date();
  state.finishedAt = null;
  state.waitingReason = null;
  state.nightlySent = 0;
  state.currentNightId = null;
}

async function processLeads(leads) {
  const cfg = config.sms;
  const useDrip = cfg.slowDripEnabled === true;
  state.phase = 'sending';

  for (let i = 0; i < leads.length; i += 1) {
    const lead = leads[i];

    if (isOutreachBlocked(lead)) {
      state.skipped += 1;
      continue;
    }

    if (useDrip) {
      await waitForSendSlot();
    }

    state.phase = 'sending';
    state.currentLead = lead.alias || lead.phone;

    const body = inviteSms({ name: lead.alias, alias: lead.alias });
    const result = await smsService.sendSms({ to: lead.phone, body });

    if (result.ok) {
      await markLeadSms(lead, { status: 'sent', sid: result.sid });
      state.sent += 1;
      if (useDrip) state.nightlySent += 1;

      // Pace only after a real send, and never after the final message.
      if (i < leads.length - 1) {
        await sleep(randomDelay(cfg.minDelayMs, cfg.maxDelayMs));
      }
    } else if (result.error) {
      // Twilio rejected the send (invalid number, carrier filtering, etc).
      // Mark failed and advance — the loop never stalls on a bad number.
      await markLeadSms(lead, { status: 'failed', error: result.error });
      state.failed += 1;
      state.lastError = result.error;
    } else {
      // Skipped before any network call (disabled, no creds, invalid format).
      // Leave smsStatus 'pending' so a future run can retry once configured.
      state.skipped += 1;
      state.lastError = result.reason || 'skipped';
    }
  }

  state.currentLead = null;
  state.waitingReason = null;
  state.phase = 'complete';
  state.finishedAt = new Date();
}

async function startBulkOutreach() {
  if (BUSY_PHASES.has(state.phase)) {
    return getStatus();
  }

  const pendingLeads = await PotentialProfessional
    .find(PENDING_SMS_QUERY)
    .sort({ createdAt: 1 });

  if (pendingLeads.length === 0) {
    state.phase = 'complete';
    state.lastError = 'No pending SMS leads found';
    state.total = 0;
    state.finishedAt = new Date();
    return getStatus();
  }

  resetRunCounters(pendingLeads.length);
  state.phase = 'sending';

  try {
    await processLeads(pendingLeads);
  } catch (err) {
    state.phase = 'error';
    state.lastError = err.message;
    state.finishedAt = new Date();
  }

  return getStatus();
}

function startBulkOutreachBackground() {
  if (BUSY_PHASES.has(state.phase)) {
    return getStatus();
  }

  startBulkOutreach().catch((err) => {
    state.phase = 'error';
    state.lastError = err.message;
    state.finishedAt = new Date();
  });

  return getStatus();
}

// SMS outreach to an explicit set of lead ids (mirrors the WhatsApp engine's
// targeted path). Selection is by _id only — smsStatus does not gate it, so the
// admin can (re)send to any chosen lead regardless of its prior SMS state.
async function startTargetedOutreach({ leadIds = [] } = {}) {
  if (BUSY_PHASES.has(state.phase)) {
    return getStatus();
  }

  const ids = Array.isArray(leadIds) ? leadIds : [];
  const leads = ids.length
    ? await PotentialProfessional.find({ _id: { $in: ids } }).sort({ createdAt: 1 })
    : [];

  if (leads.length === 0) {
    state.phase = 'complete';
    state.lastError = 'No matching SMS leads found';
    state.total = 0;
    state.finishedAt = new Date();
    return getStatus();
  }

  resetRunCounters(leads.length);
  state.phase = 'sending';

  try {
    await processLeads(leads);
  } catch (err) {
    state.phase = 'error';
    state.lastError = err.message;
    state.finishedAt = new Date();
  }

  return getStatus();
}

function startTargetedOutreachBackground(options) {
  if (BUSY_PHASES.has(state.phase)) {
    return getStatus();
  }

  startTargetedOutreach(options).catch((err) => {
    state.phase = 'error';
    state.lastError = err.message;
    state.finishedAt = new Date();
  });

  return getStatus();
}

// Human-readable summary of the effective SMS schedule (for startup logs).
function describeSchedule() {
  const cfg = config.sms;
  if (cfg.slowDripEnabled !== true) {
    const minS = (cfg.minDelayMs / 1000).toFixed(0);
    const maxS = (cfg.maxDelayMs / 1000).toFixed(0);
    return `SMS drip: 24/7 (no night window), ${minS}-${maxS}s between messages (jittered).`;
  }
  const tz = cfg.timezoneOffsetHours;
  const tzLabel = `UTC${tz >= 0 ? '+' : ''}${tz}`;
  const minMin = (cfg.minDelayMs / 60000).toFixed(1);
  const maxMin = (cfg.maxDelayMs / 60000).toFixed(1);
  const cap = Number(cfg.nightlyCap) || 0;
  const capLabel = cap > 0 ? `${cap} messages/night` : 'no cap';
  return [
    'SMS slow nightly drip ENABLED',
    `  Night window : ${cfg.nightWindowStart} -> ${cfg.nightWindowEnd} (${tzLabel})`,
    `  Pacing       : ${minMin}-${maxMin} min between messages (jittered)`,
    `  Nightly cap  : ${capLabel}`,
    `  Poll interval: ${(Number(cfg.pollIntervalMs) || 30000) / 1000}s while paused`
  ].join('\n');
}

module.exports = {
  getStatus,
  startBulkOutreach,
  startBulkOutreachBackground,
  startTargetedOutreach,
  startTargetedOutreachBackground,
  describeSchedule
};
