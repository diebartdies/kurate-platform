const config = require('../config/appConfig');
const smsService = require('./smsService');
const { resolveWhatsappNumber } = require('../utils/contactNumber');
const { visibilityChangeSms, dueDateSms, tariffChangeSms } = require('../utils/smsTemplates');

// Transactional SMS notifications for professionals. Every function here is
// best-effort: it resolves the professional's mobile, checks the per-event
// toggle, and sends without ever throwing — so a notification can never break
// the request/billing flow that triggered it. Each returns the smsService
// result (or a skip reason) for optional logging.

function profileOf(user) {
  return (user && user.professionalProfile) || {};
}

function aliasOf(user) {
  const profile = profileOf(user);
  return profile.alias || user?.name || user?.email || '';
}

function mobileOf(user) {
  // Prefer the dedicated mobile, fall back to the WhatsApp number.
  const profile = profileOf(user);
  return (profile.mobilePhone && profile.mobilePhone.trim())
    ? profile.mobilePhone.trim()
    : resolveWhatsappNumber(profile);
}

async function send(toggleOn, user, body, label) {
  if (!toggleOn) return { ok: false, reason: `${label} notifications disabled` };
  const to = mobileOf(user);
  if (!to) return { ok: false, reason: 'No mobile number on profile' };
  try {
    const result = await smsService.sendSms({ to, body });
    if (result.ok) {
      console.log(`[SMS:${label}] Sent to ${aliasOf(user) || to} (sid ${result.sid}).`);
    }
    return result;
  } catch (err) {
    // sendSms never throws, but guard anyway so a notification can't bubble up.
    console.error(`[SMS:${label}] Unexpected error: ${(err && err.message) || err}`);
    return { ok: false, error: (err && err.message) || String(err) };
  }
}

// Visibility / active-state transitions (approval, suspension, vacation, hide).
// `newState` is a short Spanish state word, e.g. "activo", "oculto", "en vacaciones".
async function notifyVisibilityChange(user, newState) {
  return send(
    config.sms.notifyVisibility,
    user,
    visibilityChangeSms({ alias: aliasOf(user), newState }),
    'visibility'
  );
}

// Payment due / vencimiento reminders. `dueInfo` is a short pre-formatted snippet.
async function notifyDueDate(user, dueInfo) {
  return send(
    config.sms.notifyDueDate,
    user,
    dueDateSms({ alias: aliasOf(user), dueInfo }),
    'duedate'
  );
}

// Tariff / category changes. `info` is a short pre-formatted snippet.
async function notifyTariffChange(user, info) {
  return send(
    config.sms.notifyTariff,
    user,
    tariffChangeSms({ alias: aliasOf(user), info }),
    'tariff'
  );
}

module.exports = {
  notifyVisibilityChange,
  notifyDueDate,
  notifyTariffChange
};
