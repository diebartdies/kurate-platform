const config = require('../config/appConfig');
const { normalizeSmsPhone } = require('../utils/professionalInviteSms');

// Lazily-instantiated Twilio REST client. Kept as a singleton so we don't
// re-create it per send, and so a missing dependency / bad creds degrade to a
// safe no-op instead of crashing the host process at require-time.
let cachedClient;
let clientResolved = false;

function getClient() {
  if (clientResolved) return cachedClient;
  clientResolved = true;
  const { accountSid, authToken } = config.sms;
  if (!accountSid || !authToken) {
    cachedClient = null;
    return cachedClient;
  }
  try {
    const twilio = require('twilio');
    cachedClient = twilio(accountSid, authToken);
  } catch (err) {
    // twilio package not installed yet (deploy must run `npm install`) — no-op.
    cachedClient = null;
  }
  return cachedClient;
}

// Race a promise against a timeout so a hung Twilio request can never stall a
// caller (outreach loop, request handler, billing job). Mirrors the WhatsApp
// outreach `withTimeout` helper.
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

// Returns true when the global config + environment allow actually sending.
// In non-production, sending additionally requires SMS_ALLOW_NON_PROD=true.
function isSendingAllowed() {
  if (!config.sms.enabled) return { ok: false, reason: 'SMS disabled (SMS_ENABLED is not true)' };
  if (config.env !== 'production' && !config.sms.allowNonProd) {
    return { ok: false, reason: `SMS suppressed in ${config.env} (set SMS_ALLOW_NON_PROD=true to allow)` };
  }
  return { ok: true };
}

// Low-level sender. NEVER throws. Returns { ok, sid } on success or
// { ok:false, reason|error } when skipped/failed, so every caller can branch
// on the result without try/catch around it.
async function sendSms({ to, body } = {}) {
  const gate = isSendingAllowed();
  if (!gate.ok) {
    console.log(`[SMS] Skipped (${gate.reason}).`);
    return { ok: false, reason: gate.reason };
  }

  const { messagingServiceSid, fromNumber } = config.sms;
  if (!messagingServiceSid && !fromNumber) {
    const reason = 'No sender configured (set TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER)';
    console.log(`[SMS] Skipped (${reason}).`);
    return { ok: false, reason };
  }

  const e164 = normalizeSmsPhone(to);
  if (!e164) {
    const reason = `Invalid destination number: ${to}`;
    console.log(`[SMS] Skipped (${reason}).`);
    return { ok: false, reason };
  }

  const text = String(body || '').trim();
  if (!text) {
    const reason = 'Empty message body';
    console.log(`[SMS] Skipped (${reason}).`);
    return { ok: false, reason };
  }

  const client = getClient();
  if (!client) {
    const reason = 'Twilio client unavailable (missing creds or twilio package not installed)';
    console.log(`[SMS] Skipped (${reason}).`);
    return { ok: false, reason };
  }

  // Prefer a Messaging Service (handles sender pools / sticky sender) when set,
  // otherwise fall back to a single "from" number.
  const payload = { to: e164, body: text };
  if (messagingServiceSid) {
    payload.messagingServiceSid = messagingServiceSid;
  } else {
    payload.from = fromNumber;
  }

  try {
    const message = await withTimeout(
      client.messages.create(payload),
      config.sms.sendTimeoutMs,
      'twilio.messages.create'
    );
    return { ok: true, sid: message.sid };
  } catch (err) {
    const error = (err && err.message) || String(err);
    console.error(`[SMS] Send failed for ${e164}: ${error}`);
    return { ok: false, error };
  }
}

// True when the channel is configured enough to attempt sends (used by callers
// that want to short-circuit before building a message).
function isConfigured() {
  const { accountSid, authToken, messagingServiceSid, fromNumber } = config.sms;
  return Boolean(accountSid && authToken && (messagingServiceSid || fromNumber));
}

module.exports = {
  sendSms,
  isSendingAllowed,
  isConfigured,
  withTimeout,
  getClient
};
