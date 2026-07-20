const PotentialProfessional = require('../models/PotentialProfessional');
const { OUTREACH_ALLOWED_FILTER } = require('../utils/outreachPhone');
const platformService = require('./whatsappPlatformService');
const config = require('../config/appConfig');

const cfg = config.whatsappDrip;
const BATCH_SIZE = Math.max(1, Number(cfg.batchSize) || 50);
const BATCH_PAUSE_MS = Math.max(1, Number(cfg.batchPauseMinutes) || 30) * 60 * 1000;
const BATCHES_PER_DAY = Math.max(1, Number(cfg.batchesPerDay) || 5);
const DAILY_CAP = BATCH_SIZE * BATCHES_PER_DAY;
const INTER_MESSAGE_DELAY_MS = Math.max(0, Number(cfg.interMessageDelayMs) || 0);
const REGISTER_CHECK_TIMEOUT_MS = Number(cfg.registerCheckTimeoutMs) || 30000;
const SEND_TIMEOUT_MS = Number(cfg.sendTimeoutMs) || 60000;
const BRAND_IMAGE = cfg.brandImagePath || require('../utils/professionalInviteMessage').BRAND_IMAGE_PATH;

const PENDING_WA_QUERY = { doNotContact: { $ne: true }, $or: [{ status: 'pending' }, { status: { $exists: false } }, { status: null }] };

const state = {
  running: false, phase: 'idle', startedAt: null, finishedAt: null,
  sent: 0, failed: 0, rejected: 0, batchesCompletedThisRun: 0,
  batchSentThisCycle: 0, lastSendAt: null, lastResult: null,
  nextSendAt: null, lastError: null, timer: null
};

function log(...args) { console.log(new Date().toISOString(), '[wa-drip]', ...args); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms); });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

async function nextPendingLead() { return PotentialProfessional.findOne(PENDING_WA_QUERY).sort({ createdAt: 1 }); }
async function countPendingLeads() { return PotentialProfessional.countDocuments(PENDING_WA_QUERY); }

async function saveLead(lead, label) { try { await lead.save(); } catch (err) { log('WARN failed to persist lead', label, '-', err.message); } }

async function markSent(lead, messageId) {
  lead.status = 'contacted'; lead.whatsappSentAt = new Date();
  lead.whatsappMessageId = typeof messageId === 'string' ? messageId : undefined;
  lead.whatsappError = undefined; await saveLead(lead, 'sent');
}

async function markRejected(lead, reason) {
  lead.status = 'rejected'; lead.whatsappError = reason ? String(reason).slice(0, 300) : 'rejected';
  await saveLead(lead, 'rejected');
}

async function markFailed(lead, error) {
  lead.status = 'failed'; lead.whatsappError = (error && String(error).slice(0, 300)) || 'unknown error';
  await saveLead(lead, 'failed');
}

function recordResult(kind, label, detail) {
  state.lastSendAt = new Date();
  if (kind === 'sent') { state.sent += 1; state.lastResult = `SENT ${label}`; log('SENT', label, '- id:', detail); }
  else if (kind === 'rejected') { state.rejected += 1; state.lastResult = `REJECTED ${label}: ${detail}`; log('REJECT', label, '-', detail); }
  else { state.failed += 1; state.lastResult = `FAILED ${label}: ${detail}`; log('FAIL', label, '-', detail); }
}

async function sendOneLead(lead) {
  const { normalizeWhatsAppPhone, buildSanitizedWhatsAppCaption, BRAND_IMAGE_PATH } = require('../utils/professionalInviteMessage');
  const label = lead.alias || lead.phone;
  const cleanPhone = normalizeWhatsAppPhone(lead.phone);
  if (!cleanPhone) { await markRejected(lead, 'invalid phone number'); recordResult('rejected', label, 'invalid phone number'); return; }

  let registered;
  try { registered = await withTimeout(platformService.isRegisteredUser(cleanPhone), REGISTER_CHECK_TIMEOUT_MS, 'isRegisteredUser'); }
  catch (err) { await markFailed(lead, `registration check: ${err.message}`); recordResult('failed', label, `registration check: ${err.message}`); return; }

  if (!registered) { await markRejected(lead, 'number not on WhatsApp'); recordResult('rejected', label, 'number not on WhatsApp'); return; }

  const alias = (lead.alias && String(lead.alias).trim()) || 'hermosa';
  const caption = buildSanitizedWhatsAppCaption(alias);

  try {
    const messageId = await withTimeout(platformService.sendMessage(lead.phone, caption, { mediaPath: BRAND_IMAGE, timeoutMs: SEND_TIMEOUT_MS, alias }), SEND_TIMEOUT_MS + 5000, 'sendMessage');
    await markSent(lead, messageId);
    recordResult('sent', label, typeof messageId === 'string' ? messageId : '(no id)');
  } catch (err) { await markFailed(lead, err.message); recordResult('failed', label, err.message); }
}

function clearTimer() { if (state.timer) { clearTimeout(state.timer); state.timer = null; } }

function finish(phase) {
  clearTimer(); state.running = false; state.phase = phase;
  state.finishedAt = new Date(); state.nextSendAt = null; state.batchSentThisCycle = 0;
}

async function runBatchCycle() {
  if (!state.running) return;
  state.phase = 'running'; state.batchSentThisCycle = 0; state.nextSendAt = null;
  log(`Batch start — up to ${BATCH_SIZE} messages`);

  for (let i = 0; i < BATCH_SIZE && state.running; i += 1) {
    if (!platformService.isClientReady()) {
      state.lastError = 'WhatsApp client not connected — drip stopped.';
      log('STOP', state.lastError); finish('disconnected'); return;
    }
    let lead;
    try { lead = await nextPendingLead(); } catch (err) { state.lastError = `Could not query next lead: ${err.message}`; log('WARN', state.lastError); break; }
    if (!lead) { log('ALL DONE - no pending leads left.'); finish('completed'); return; }
    await sendOneLead(lead); state.batchSentThisCycle += 1;
    if (INTER_MESSAGE_DELAY_MS > 0 && i < BATCH_SIZE - 1 && state.running) await sleep(INTER_MESSAGE_DELAY_MS);
  }

  if (!state.running) return;
  let remaining = 0;
  try { remaining = await countPendingLeads(); } catch (err) { state.lastError = `Could not count pending leads: ${err.message}`; log('WARN', state.lastError); }
  if (remaining === 0) { log('ALL DONE - no pending leads left.'); finish('completed'); return; }

  state.batchesCompletedThisRun += 1;
  if (state.batchesCompletedThisRun >= BATCHES_PER_DAY) { log(`Daily batch limit reached (${BATCHES_PER_DAY} batches × ${BATCH_SIZE} = ${DAILY_CAP}).`); finish('daily_limit'); return; }

  state.phase = 'waiting_batch';
  state.nextSendAt = new Date(Date.now() + BATCH_PAUSE_MS);
  log(`Batch ${state.batchesCompletedThisRun}/${BATCHES_PER_DAY} complete (${state.batchSentThisCycle} sent). Pending=${remaining}. Next batch at ${state.nextSendAt.toISOString()}`);
  clearTimer();
  state.timer = setTimeout(() => { Promise.resolve(runBatchCycle()).catch((err) => { state.lastError = (err && err.message) || String(err); log('WARN unexpected batch error:', state.lastError); finish('error'); }); }, BATCH_PAUSE_MS);
}

function resetRun() {
  state.sent = 0; state.failed = 0; state.rejected = 0; state.batchesCompletedThisRun = 0;
  state.batchSentThisCycle = 0; state.lastSendAt = null; state.lastResult = null;
  state.nextSendAt = null; state.lastError = null; state.finishedAt = null;
}

async function start() {
  if (state.running) return { ok: false, error: 'Drip is already running.' };
  const twilioWa = require('./twilioWhatsAppService');
  const templateBlock = twilioWa.getColdOutreachBlockReason();
  if (templateBlock) return { ok: false, error: templateBlock, templatePending: true };
  if (!platformService.isClientReady()) return { ok: false, error: platformService.isTwilioApiMode() ? 'Twilio WhatsApp is not configured.' : 'WhatsApp is not connected.', notConnected: true };
  let pending;
  try { pending = await countPendingLeads(); } catch (err) { return { ok: false, error: `Could not query pending leads: ${err.message}` }; }
  if (pending === 0) return { ok: false, error: 'No pending leads to contact.' };
  resetRun(); state.running = true; state.phase = 'running'; state.startedAt = new Date();
  log(`--- WhatsApp Batch Drip starting --- pending=${pending}, batch=${BATCH_SIZE}, batches/day=${BATCHES_PER_DAY} (cap ${DAILY_CAP}), pause=${cfg.batchPauseMinutes || 30}min`);
  Promise.resolve(runBatchCycle()).catch((err) => { state.lastError = (err && err.message) || String(err); log('WARN unexpected start error:', state.lastError); finish('error'); });
  return { ok: true };
}

function stop() {
  if (!state.running) return { ok: true, alreadyStopped: true };
  log('Drip stopped by admin.'); finish('stopped'); return { ok: true };
}

async function getStatus() {
  let pending = null;
  try { pending = await countPendingLeads(); } catch { pending = null; }
  return {
    running: state.running, phase: state.phase, startedAt: state.startedAt,
    finishedAt: state.finishedAt, batchSize: BATCH_SIZE,
    batchPauseMinutes: Number(cfg.batchPauseMinutes) || 30, batchesPerDay: BATCHES_PER_DAY,
    dailyCap: DAILY_CAP, batchesCompletedThisRun: state.batchesCompletedThisRun,
    batchSentThisCycle: state.batchSentThisCycle, pending, sent: state.sent,
    failed: state.failed, rejected: state.rejected, lastSendAt: state.lastSendAt,
    lastResult: state.lastResult, nextSendAt: state.running ? state.nextSendAt : null,
    lastError: state.lastError, clientReady: platformService.isClientReady()
  };
}

module.exports = { start, stop, getStatus };
