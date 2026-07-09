const PotentialProfessional = require('../models/PotentialProfessional');
const platformService = require('./whatsappPlatformService');
const config = require('../config/appConfig');
const {
  normalizeWhatsAppPhone,
  buildProfessionalInviteMessage
} = require('../utils/professionalInviteMessage');
const { OUTREACH_ALLOWED_FILTER, isOutreachBlocked } = require('../utils/outreachPhone');

const BUSY_PHASES = new Set(['initializing', 'qr', 'sending', 'waiting_window']);

// Hard ceilings so a single lead can never stall the whole run. whatsapp-web.js
// calls can hang indefinitely for numbers that are not on WhatsApp, so every
// network-bound call is raced against a timeout.
const REGISTER_CHECK_TIMEOUT_MS = 30000;
const SEND_TIMEOUT_MS = 60000;
// Total attempts per lead for TRANSIENT failures only (never for permanent
// ones like an unregistered number). Guarantees the loop always advances.
const MAX_SEND_ATTEMPTS = 2;
// Short jittered backoff between transient retries (NOT the slow-drip pacing,
// and never counted toward the nightly cap).
const RETRY_BACKOFF_MS = [4000, 9000];

const state = {
  phase: 'idle',
  qr: null,
  total: 0,
  sent: 0,
  failed: 0,
  skipped: 0,
  currentLead: null,
  lastError: null,
  startedAt: null,
  finishedAt: null,
  // Slow-drip state
  waitingReason: null,   // null | 'outside_night_window' | 'nightly_cap_reached'
  nightlySent: 0,        // sends counted for the current calendar night
  currentNightId: null   // identifier (local date) of the active night window
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function randomDelay(minMs, maxMs) {
  const lo = Math.min(minMs, maxMs);
  const hi = Math.max(minMs, maxMs);
  return Math.floor(Math.random() * (hi - lo + 1) + lo);
}

// Race a promise against a timeout so a hung WhatsApp call cannot block the run
// forever. Rejects with a labelled timeout error if `promise` does not settle.
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

// Persist a lead's status (best-effort: a DB hiccup must not abort the run or
// re-block the queue). Only acts when the target carries a DB document.
async function markLeadStatus(target, status) {
  if (!target.leadDoc) return;
  try {
    target.leadDoc.status = status;
    await target.leadDoc.save();
  } catch (err) {
    state.lastError = `Failed to mark lead ${status}: ${err.message}`;
  }
}

// Heuristic: does this send error look permanent (bad/unregistered number) vs.
// transient (network/session). Permanent => reject & move on; transient =>
// bounded retry. We err toward "transient" so we never discard a real lead.
function isPermanentSendError(err) {
  const msg = String((err && err.message) || err || '').toLowerCase();
  return /not.*regist|invalid.*(wid|jid|phone|number|recipient)|number.*not|no.*account|wid error|phone number is not/.test(msg);
}

// "HH:MM" -> minutes since local midnight (0..1439). Falls back to 0 if malformed.
function parseTimeToMinutes(value) {
  const match = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(String(value || ''));
  if (!match) return 0;
  const hours = Math.min(23, parseInt(match[1], 10));
  const minutes = Math.min(59, parseInt(match[2], 10));
  return hours * 60 + minutes;
}

// Wall-clock Date shifted into the configured local timezone, so the UTC
// getters return local components (avoids relying on the host TZ).
function localNow(offsetHours) {
  return new Date(Date.now() + offsetHours * 60 * 60 * 1000);
}

// Minutes since local midnight for the given shifted date.
function minutesOfDay(shiftedDate) {
  return shiftedDate.getUTCHours() * 60 + shiftedDate.getUTCMinutes();
}

// Local YYYY-MM-DD for the given shifted date.
function localDateString(shiftedDate) {
  return shiftedDate.toISOString().slice(0, 10);
}

// Is `nowMin` inside the window [startMin, endMin)? Handles cross-midnight.
function isWithinWindow(nowMin, startMin, endMin) {
  if (startMin === endMin) return true; // 24h window
  if (startMin < endMin) {
    return nowMin >= startMin && nowMin < endMin; // same-day window
  }
  // crosses midnight, e.g. 21:00 (1260) -> 08:00 (480)
  return nowMin >= startMin || nowMin < endMin;
}

// Stable id for the current night so the cap resets per calendar night.
// For a cross-midnight window, the early-morning portion belongs to the
// previous calendar date (the evening the window opened).
function nightIdFor(shiftedDate, nowMin, startMin, endMin) {
  if (startMin > endMin && nowMin < endMin) {
    const prev = new Date(shiftedDate.getTime() - 24 * 60 * 60 * 1000);
    return localDateString(prev);
  }
  return localDateString(shiftedDate);
}

// Block until it's allowed to send the next message under the slow-drip rules:
// inside the night window and (if a cap is set) under the nightly cap.
// Returns when a slot is available. Long-lived: may sleep across nights.
async function waitForSendSlot() {
  const cfg = config.outreach;
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
  const platformStatus = platformService.isClientReady()
    ? { phase: 'ready', qr: null }
    : { phase: platformService.getQrCode() ? 'qr' : 'idle', qr: platformService.getQrCode() };

  if (BUSY_PHASES.has(state.phase) || state.phase === 'complete' || state.phase === 'error') {
    return {
      ...state,
      qr: state.phase === 'qr' || platformStatus.phase === 'qr' ? (state.qr || platformStatus.qr) : null
    };
  }

  if (platformStatus.qr) {
    return { ...state, phase: 'qr', qr: platformStatus.qr };
  }

  return { ...state };
}

function resetRunCounters(total) {
  state.total = total;
  state.sent = 0;
  state.failed = 0;
  state.skipped = 0;
  state.currentLead = null;
  state.lastError = null;
  state.qr = null;
  state.startedAt = new Date();
  state.finishedAt = null;
  state.waitingReason = null;
  state.nightlySent = 0;
  state.currentNightId = null;
}

async function waitForClientReady() {
  state.phase = platformService.getQrCode() ? 'qr' : 'initializing';

  const pollQr = setInterval(() => {
    const qr = platformService.getQrCode();
    if (qr) {
      state.phase = 'qr';
      state.qr = qr;
    }
  }, 1000);

  try {
    await platformService.waitForReady();
    state.qr = null;
  } finally {
    clearInterval(pollQr);
  }
}

async function processTargets(targets, options = {}) {
  const { customMessage, slowDrip = false } = options;
  const cfg = config.outreach;
  const useDrip = Boolean(slowDrip) && cfg.slowDripEnabled !== false;

  state.phase = 'sending';
  state.qr = null;

  for (let i = 0; i < targets.length; i += 1) {
    const target = targets[i];

    if (isOutreachBlocked(target.leadDoc) || target.leadDoc?.doNotContact) {
      state.skipped += 1;
      continue;
    }

    // Slow-drip gate:
    // and under the nightly cap. Long-lived; may span multiple nights.
    if (useDrip) {
      await waitForSendSlot();
    }

    state.phase = 'sending';
    state.currentLead = target.alias || target.phone;

    // --- 1. Normalize. A malformed number can never be sent: reject & advance.
    const cleanPhone = normalizeWhatsAppPhone(target.phone);
    if (!cleanPhone) {
      await markLeadStatus(target, 'rejected');
      state.skipped += 1;
      continue;
    }

    const alias = (target.alias && String(target.alias).trim()) || 'hermosa';
    const messageToSend = customMessage
      ? String(customMessage).replace(/\{alias\}/gi, alias)
      : buildProfessionalInviteMessage(alias);

    // --- 2. Pre-validate the number is actually on WhatsApp (web.js only).
    let registered;
    try {
      registered = await withTimeout(
        platformService.isRegisteredUser(cleanPhone),
        REGISTER_CHECK_TIMEOUT_MS,
        'isRegisteredUser'
      );
    } catch (err) {
      // Could not determine registration (timeout/session glitch). Treat as
      // transient: count as failed, leave the lead 'pending' for a later run,
      // and advance so one bad number cannot stall the queue.
      state.failed += 1;
      state.lastError = `Registration check failed for ${target.phone}: ${err.message}`;
      continue;
    }

    if (!registered) {
      await markLeadStatus(target, 'rejected');
      state.skipped += 1;
      // Light throttle so we don't fire hundreds of checks back-to-back.
      if (useDrip && i < targets.length - 1) {
        await sleep(randomDelay(2000, 5000));
      }
      continue;
    }

    // --- 3. Send, with a hard timeout and a small bounded retry for transient
    // errors only. Never infinite-retry; the loop always advances.
    let delivered = false;
    let permanentlyRejected = false;
    for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt += 1) {
      try {
        await withTimeout(
          platformService.sendMessage(target.phone, messageToSend, { alias }),
          SEND_TIMEOUT_MS,
          'sendMessage'
        );
        delivered = true;
        break;
      } catch (err) {
        state.lastError = err.message;
        if (isPermanentSendError(err)) {
          permanentlyRejected = true;
          break;
        }
        // Transient: back off briefly, then retry until the cap is reached.
        if (attempt < MAX_SEND_ATTEMPTS) {
          await sleep(randomDelay(RETRY_BACKOFF_MS[0], RETRY_BACKOFF_MS[1]));
        }
      }
    }

    if (delivered) {
      await markLeadStatus(target, 'contacted');
      state.sent += 1;
      if (useDrip) {
        state.nightlySent += 1;
      }

      // Slow-drip pacing applies ONLY after a real successful send.
      // Don't waste a long delay after the final message.
      if (i < targets.length - 1) {
        const delay = useDrip
          ? randomDelay(cfg.minDelayMs, cfg.maxDelayMs)
          : randomDelay(15000, 30000);
        await sleep(delay);
      }
    } else if (permanentlyRejected) {
      await markLeadStatus(target, 'rejected');
      state.failed += 1;
    } else {
      // Transient failure exhausted retries. Leave as 'pending' so a future
      // run can try again, but advance now so the queue is never blocked.
      state.failed += 1;
    }
  }

  state.currentLead = null;
  state.waitingReason = null;
  state.phase = 'complete';
  state.finishedAt = new Date();
}

async function processLeads(leads) {
  const targets = leads.map((lead) => ({ phone: lead.phone, alias: lead.alias, leadDoc: lead }));
  // Bulk / all-pending outreach honors the slow nightly drip.
  await processTargets(targets, { slowDrip: true });
}

async function startBulkOutreach() {
  if (BUSY_PHASES.has(state.phase)) {
    return getStatus();
  }

  const twilioWa = require('./twilioWhatsAppService');
  const templateBlock = twilioWa.getColdOutreachBlockReason();
  if (templateBlock) {
    state.phase = 'error';
    state.lastError = templateBlock;
    state.finishedAt = new Date();
    return getStatus();
  }

  const pendingLeads = await PotentialProfessional.find({
    status: 'pending',
    ...OUTREACH_ALLOWED_FILTER
  }).sort({ createdAt: 1 });

  if (pendingLeads.length === 0) {
    state.phase = 'complete';
    state.lastError = 'No pending leads found';
    state.total = 0;
    state.finishedAt = new Date();
    return getStatus();
  }

  resetRunCounters(pendingLeads.length);
  state.phase = 'initializing';

  try {
    await waitForClientReady();
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

async function resolveTargetedRecipients({ leadIds = [], professionalIds = [] }) {
  const User = require('../models/User');
  const { resolveWhatsappNumber } = require('../utils/contactNumber');
  const targets = [];

  if (leadIds.length) {
    const leads = await PotentialProfessional.find({ _id: { $in: leadIds } });
    leads.forEach((lead) => {
      targets.push({ phone: lead.phone, alias: lead.alias, leadDoc: lead });
    });
  }

  if (professionalIds.length) {
    const professionals = await User.find({ _id: { $in: professionalIds }, role: 'professional' });
    professionals.forEach((user) => {
      const phone = resolveWhatsappNumber(user.professionalProfile || {});
      if (phone) {
        targets.push({
          phone,
          alias: user.professionalProfile?.alias || user.email
        });
      }
    });
  }

  return targets;
}

async function startTargetedOutreach({ leadIds = [], professionalIds = [], message = '' } = {}) {
  if (BUSY_PHASES.has(state.phase)) {
    return getStatus();
  }

  const twilioWa = require('./twilioWhatsAppService');
  const templateBlock = twilioWa.getColdOutreachBlockReason();
  if (templateBlock) {
    state.phase = 'error';
    state.lastError = templateBlock;
    state.finishedAt = new Date();
    return getStatus();
  }

  const targets = await resolveTargetedRecipients({ leadIds, professionalIds });

  if (targets.length === 0) {
    state.phase = 'complete';
    state.lastError = 'No valid WhatsApp recipients found';
    state.total = 0;
    state.finishedAt = new Date();
    return getStatus();
  }

  resetRunCounters(targets.length);
  state.phase = 'initializing';

  try {
    await waitForClientReady();
    await processTargets(targets, { customMessage: message && String(message).trim() ? String(message).trim() : null });
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

// Human-readable summary of the effective slow-drip schedule (for startup logs).
function describeSchedule() {
  const cfg = config.outreach;
  if (cfg.slowDripEnabled === false) {
    return 'Slow drip DISABLED — legacy fast burst (15-30s between messages, no night window).';
  }
  const tz = cfg.timezoneOffsetHours;
  const tzLabel = `UTC${tz >= 0 ? '+' : ''}${tz}`;
  const minMin = (cfg.minDelayMs / 60000).toFixed(1);
  const maxMin = (cfg.maxDelayMs / 60000).toFixed(1);
  const cap = Number(cfg.nightlyCap) || 0;
  const capLabel = cap > 0 ? `${cap} messages/night` : 'no cap';
  return [
    'Slow nightly drip ENABLED',
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
