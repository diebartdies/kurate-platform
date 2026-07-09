const fs = require('fs');
const path = require('path');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { Api } = require('telegram/tl');
const PotentialProfessional = require('../models/PotentialProfessional');
const { OUTREACH_ALLOWED_FILTER, isOutreachBlocked } = require('../utils/outreachPhone');
const config = require('../config/appConfig');
const { buildColdOutreachStep1MessageMetaSafe } = require('../utils/professionalInviteMessage');

const BUSY_PHASES = new Set(['sending', 'waiting_window', 'logging_in']);

const SEND_TIMEOUT_MS = 30000;

const PENDING_TELEGRAM_QUERY = {
  ...OUTREACH_ALLOWED_FILTER,
  $or: [
    { telegramStatus: 'pending' },
    { telegramStatus: { $exists: false } },
    { telegramStatus: null }
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
  waitingReason: null,
  nightlySent: 0,
  currentNightId: null
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function randomDelay(minMs, maxMs) {
  const lo = Math.min(minMs, maxMs);
  const hi = Math.max(minMs, maxMs);
  return Math.floor(Math.random() * (hi - lo + 1) + lo);
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

async function markLeadTelegram(leadDoc, { status, error }) {
  if (!leadDoc) return;
  try {
    leadDoc.telegramStatus = status;
    if (status === 'sent') {
      leadDoc.telegramSentAt = new Date();
      leadDoc.telegramError = undefined;
    } else if (status === 'failed' || status === 'blocked') {
      leadDoc.telegramError = (error && String(error).slice(0, 300)) || 'unknown error';
    }
    await leadDoc.save();
  } catch (err) {
    state.lastError = `Failed to mark lead telegram ${status}: ${err.message}`;
  }
}

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

    return;
  }
}

async function getTelegramCredentials() {
  const apiId = parseInt(process.env.TELEGRAM_API_ID, 10);
  const apiHash = process.env.TELEGRAM_API_HASH;
  const phone = process.env.TELEGRAM_PHONE;

  if (!apiId || !apiHash || !phone) {
    throw new Error(
      'TELEGRAM_API_ID, TELEGRAM_API_HASH, and TELEGRAM_PHONE must be set. '
      + 'Get API credentials at https://my.telegram.org/apps'
    );
  }
  return { apiId, apiHash, phone };
}

function getSessionDir() {
  return process.env.TELEGRAM_SESSION_DIR || path.resolve(__dirname, '..', '.telegram-session');
}

function getSessionPath(phone) {
  const sanitized = phone.replace(/[^0-9]/g, '');
  return path.join(getSessionDir(), `session-${sanitized}.txt`);
}

async function loadSession(phone) {
  const p = getSessionPath(phone);
  try {
    return fs.readFileSync(p, 'utf8').trim();
  } catch (_) {
    return '';
  }
}

async function saveSession(phone, sessionString) {
  const dir = getSessionDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getSessionPath(phone), sessionString, 'utf8');
}

async function createClient() {
  const { apiId, apiHash, phone } = await getTelegramCredentials();
  const savedSession = await loadSession(phone);
  const stringSession = new StringSession(savedSession);
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
    useWSS: false
  });

  await client.start({
    phoneNumber: () => Promise.resolve(phone),
    password: () => Promise.resolve(process.env.TELEGRAM_2FA_PASSWORD || ''),
    phoneCode: () => Promise.reject(new Error('Login required — run with --login flag first')),
    onError: (err) => { state.lastError = `Telegram login error: ${err.message}`; }
  });

  if (!(await client.isUserAuthorized())) {
    throw new Error('Telegram client not authorized. Run with --login first.');
  }

  const sessionString = client.session.save();
  if (sessionString && sessionString !== savedSession) {
    await saveSession(phone, sessionString);
  }

  return client;
}

async function findUserByPhone(client, phone) {
  const digits = phone.replace(/[^0-9]/g, '');
  if (!digits) return null;
  try {
    const result = await client.invoke(
      new Api.contacts.ImportContacts({
        contacts: [new Api.InputPhoneContact({
          clientId: Math.random() * 0xFFFFFFFF,
          phone: `+${digits}`,
          firstName: '_',
          lastName: '_'
        })]
      })
    );
    const users = result.users || [];
    if (users.length > 0) {
      const user = users[0];
      await client.invoke(new Api.contacts.DeleteContacts({ id: [user.id] }));
      return user;
    }
  } catch (_) {}
  return null;
}

async function sendTelegramMessage(client, userId, message) {
  const result = await client.invoke(
    new Api.messages.SendMessage({
      peer: userId,
      message: message,
      randomId: BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)),
      noWebpage: true
    })
  );
  return result;
}

async function processLead(client, leadDoc) {
  const phone = leadDoc.phone;
  if (!phone) {
    state.skipped++;
    return;
  }

  if (isOutreachBlocked(phone)) {
    state.skipped++;
    return;
  }

  state.currentLead = phone;

  let user;
  try {
    user = await withTimeout(findUserByPhone(client, phone), SEND_TIMEOUT_MS, 'Telegram user lookup');
  } catch (err) {
    state.failed++;
    await markLeadTelegram(leadDoc, { status: 'failed', error: err.message });
    return;
  }

  if (!user) {
    state.skipped++;
    await markLeadTelegram(leadDoc, { status: 'blocked', error: 'no Telegram account found' });
    return;
  }

  const alias = (leadDoc.alias && String(leadDoc.alias).trim()) || '';
  const message = buildColdOutreachStep1MessageMetaSafe(alias);

  try {
    await withTimeout(sendTelegramMessage(client, user.id, message), SEND_TIMEOUT_MS, 'Telegram send');
    state.sent++;
    state.nightlySent++;
    await markLeadTelegram(leadDoc, { status: 'sent' });
    state.currentLead = null;
  } catch (err) {
    state.failed++;
    await markLeadTelegram(leadDoc, { status: 'failed', error: err.message });
  }
}

async function loginOnly() {
  state.phase = 'logging_in';
  try {
    const { apiId, apiHash, phone } = await getTelegramCredentials();
    const savedSession = await loadSession(phone);
    const stringSession = new StringSession(savedSession);
    const client = new TelegramClient(stringSession, apiId, apiHash, {
      connectionRetries: 5,
      useWSS: false
    });

    let codeResolver;
    let passwordResolver;
    const codePromise = new Promise((resolve) => { codeResolver = resolve; });
    const passwordPromise = new Promise((resolve) => { passwordResolver = resolve; });

    if (process.env.TELEGRAM_CODE) codeResolver(process.env.TELEGRAM_CODE);

    await client.start({
      phoneNumber: () => Promise.resolve(phone),
      password: () => passwordPromise,
      phoneCode: () => codePromise,
      onError: (err) => { state.lastError = `Telegram login error: ${err.message}`; }
    });

    if (!codeResolver && process.env.TELEGRAM_CODE) {
    }

    if (!(await client.isUserAuthorized())) {
      throw new Error('Authorization failed');
    }

    const sessionString = client.session.save();
    if (sessionString !== savedSession) {
      await saveSession(phone, sessionString);
    }

    console.log(`\n[Telegram] Login successful — session saved for ${phone}`);
    await client.destroy();
    state.phase = 'idle';
  } catch (err) {
    state.phase = 'error';
    state.lastError = err.message;
    console.error(`[Telegram] Login failed: ${err.message}`);
  }
}

async function runBulkOutreach() {
  if (BUSY_PHASES.has(state.phase)) {
    console.log('[Telegram] Already running — skipping duplicate start.');
    return;
  }

  let client;
  try {
    client = await createClient();
    console.log('[Telegram] Client connected.');
  } catch (err) {
    state.phase = 'error';
    state.lastError = err.message;
    console.error(`[Telegram] Connection failed: ${err.message}`);
    return;
  }

  state.phase = 'sending';
  state.startedAt = new Date();

  const cfg = config.sms;
  const slowDrip = cfg.slowDripEnabled;
  const minDelay = cfg.minDelayMs || 10000;
  const maxDelay = cfg.maxDelayMs || 20000;
  const cap = Number(cfg.nightlyCap) || 0;

  try {
    for (;;) {
      if (slowDrip) await waitForSendSlot();

      const leads = await PotentialProfessional.find(PENDING_TELEGRAM_QUERY).limit(50).lean();

      if (!leads || leads.length === 0) {
        console.log('[Telegram] No more pending leads.');
        break;
      }

      state.total += leads.length;

      for (const lead of leads) {
        if (slowDrip) await waitForSendSlot();

        const fresh = await PotentialProfessional.findById(lead._id);
        if (!fresh) { state.skipped++; continue; }
        const tgStatus = fresh.telegramStatus || 'pending';
        if (tgStatus !== 'pending') { state.skipped++; continue; }

        if (isOutreachBlocked(fresh.phone)) { state.skipped++; continue; }

        const alias = (fresh.alias && String(fresh.alias).trim()) || '';
        const message = buildColdOutreachStep1MessageMetaSafe(alias);

        let user;
        try {
          user = await withTimeout(findUserByPhone(client, fresh.phone), SEND_TIMEOUT_MS, 'Telegram user lookup');
        } catch (err) {
          state.failed++;
          await markLeadTelegram(fresh, { status: 'failed', error: err.message });
          continue;
        }

        if (!user) {
          state.skipped++;
          await markLeadTelegram(fresh, { status: 'blocked', error: 'no Telegram account' });
          continue;
        }

        try {
          await withTimeout(sendTelegramMessage(client, user.id, message), SEND_TIMEOUT_MS, 'Telegram send');
          state.sent++;
          state.nightlySent++;
          await markLeadTelegram(fresh, { status: 'sent' });
        } catch (err) {
          state.failed++;
          await markLeadTelegram(fresh, { status: 'failed', error: err.message });
          continue;
        }

        const delay = randomDelay(minDelay, maxDelay);
        await sleep(delay);
      }

      if (slowDrip) {
        await sleep(60000);
      }
    }
  } catch (err) {
    state.lastError = err.message;
    console.error(`[Telegram] Outreach error: ${err.message}`);
  } finally {
    try { await client.destroy(); } catch (_) {}
    state.finishedAt = new Date();
    state.phase = 'complete';
    state.currentLead = null;
    console.log(`[Telegram] Done — sent ${state.sent}, failed ${state.failed}, skipped ${state.skipped}`);
  }
}

function getStatus() {
  return { ...state };
}

function describeSchedule() {
  const cfg = config.sms;
  if (!cfg.slowDripEnabled) return 'Telegram: no night window — sends ASAP.';
  return `Telegram: ${cfg.nightWindowStart}-${cfg.nightWindowEnd} local, cap ${cfg.nightlyCap || 'unlimited'}/night, delay ${cfg.minDelayMs}-${cfg.maxDelayMs}ms.`;
}

function startBulkOutreachBackground() {
  runBulkOutreach().catch((err) => {
    state.phase = 'error';
    state.lastError = err.message;
    console.error('[Telegram] Fatal:', err.message);
  });
}

module.exports = {
  loginOnly,
  startBulkOutreachBackground,
  getStatus,
  describeSchedule
};
