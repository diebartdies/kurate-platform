const config = require('../config/appConfig');
const smsService = require('./smsService');
const { getPlatformWhatsAppPhone } = require('../utils/whatsappConfig');
const {
  normalizeWhatsAppPhone,
  normalizeE164Digits,
  getOutreachBrandImageUrl
} = require('../utils/professionalInviteMessage');

function isApiModeEnabled() {
  if (process.env.WHATSAPP_USE_WEBJS === 'true') return false;
  if (process.env.TWILIO_WHATSAPP_API === 'false') return false;

  const { accountSid, authToken, whatsappFromNumber, fromNumber } = config.sms;
  if (!accountSid || !authToken) return false;

  if (process.env.TWILIO_WHATSAPP_API === 'true') return true;
  return Boolean(whatsappFromNumber || fromNumber);
}

function isReadySync() {
  if (!isApiModeEnabled()) return false;
  const { whatsappFromNumber, fromNumber } = config.sms;
  if (whatsappFromNumber || fromNumber) return true;
  return process.env.TWILIO_WHATSAPP_API === 'true';
}

function getConfigError() {
  if (!isApiModeEnabled()) return '';
  const { accountSid, authToken } = config.sms;
  if (!accountSid || !authToken) {
    return 'Twilio credentials missing (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)';
  }
  return '';
}

const APPROVED_WATEXT_SID = 'HX92a57f64dfa083cb94b884da55a85cde';
const REJECTED_WATEXT_UPDATED_SID = 'HX3e76b50fc1f69871bfbc4404c7666482';
// Back-compat alias
const PENDING_WATEXT_UPDATED_SID = REJECTED_WATEXT_UPDATED_SID;

function isColdOutreachTemplateConfigured() {
  return Boolean(config.sms.whatsappContentSid);
}

/** Shown when Twilio API is on but cold outreach cannot run. */
function getColdOutreachBlockReason() {
  if (!isApiModeEnabled()) return '';

  const sid = (config.sms.whatsappContentSid || '').trim();
  if (!sid) {
    return 'WhatsApp cold outreach needs TWILIO_WHATSAPP_CONTENT_SID in server .env. '
      + `Approved template watext: ${APPROVED_WATEXT_SID}. `
      + 'Run: bash scripts/set-twilio-whatsapp-template.sh /root/KuraTe-platform '
      + 'Or set WHATSAPP_USE_WEBJS=true and link WhatsApp via QR (no template).';
  }

  if (sid === REJECTED_WATEXT_UPDATED_SID) {
    return 'Template watext_updated was rejected by Meta — do not use for cold sends. '
      + `Use approved watext: ${APPROVED_WATEXT_SID} `
      + '(bash scripts/set-twilio-whatsapp-template.sh /root/KuraTe-platform '
      + `${APPROVED_WATEXT_SID}) `
      + 'or WHATSAPP_USE_WEBJS=true + QR. Resubmit a simpler text-only template (see getColdOutreachTemplateBodyMetaSample in code).';
  }

  return '';
}

function formatWhatsAppAddress(digits) {
  const clean = normalizeE164Digits(digits) || normalizeWhatsAppPhone(digits);
  return clean ? `whatsapp:+${clean}` : '';
}

function resolveMediaUrl(options = {}) {
  if (options.mediaUrl) return options.mediaUrl;
  return getOutreachBrandImageUrl();
}

/** Meta/Twilio template watext_updated — sample value for {{1}} only (step-1 cold outreach). */
const WATEXT_TEMPLATE_EXAMPLES = Object.freeze({
  '1': process.env.TWILIO_WA_TEMPLATE_EXAMPLE_1 || 'María'
});

function buildContentVariables(options = {}) {
  if (options.contentVariables) {
    const raw = typeof options.contentVariables === 'string'
      ? options.contentVariables
      : JSON.stringify(options.contentVariables);
    const parsed = JSON.parse(raw);
    if (!String(parsed['1'] ?? parsed[1] ?? '').trim()) {
      throw new Error('WhatsApp template variable {{1}} (alias) is required and cannot be empty');
    }
    return raw;
  }

  const alias = (options.alias && String(options.alias).trim())
    || WATEXT_TEMPLATE_EXAMPLES['1'];

  return JSON.stringify({ '1': alias });
}

async function resolveFromAddress() {
  const phone = await getPlatformWhatsAppPhone();
  return formatWhatsAppAddress(phone);
}

function isWhatsAppSendingAllowed() {
  if (config.env !== 'production' && !config.sms.allowNonProd) {
    return {
      ok: false,
      reason: `WhatsApp suppressed in ${config.env} (set SMS_ALLOW_NON_PROD=true to allow)`
    };
  }
  return { ok: true };
}

async function sendWhatsAppMessage(toPhone, body, options = {}) {
  if (!isApiModeEnabled()) {
    throw new Error('Twilio WhatsApp API mode is not enabled');
  }

  const configError = getConfigError();
  if (configError) throw new Error(configError);

  const gate = isWhatsAppSendingAllowed();
  if (!gate.ok) throw new Error(gate.reason);

  const to = formatWhatsAppAddress(toPhone);
  if (!to) throw new Error('Invalid WhatsApp recipient phone number');

  const from = await resolveFromAddress();
  if (!from) {
    throw new Error('Platform WhatsApp sender missing — save the number in Admin or set TWILIO_WHATSAPP_FROM_NUMBER');
  }

  const client = smsService.getClient ? smsService.getClient() : null;
  if (!client) {
    throw new Error('Twilio client unavailable (missing creds or twilio package not installed)');
  }

  const payload = { from, to };

  const contentSid = !options.sessionReply
    && options.useTemplate !== false
    && (options.contentSid || config.sms.whatsappContentSid || '');

  if (contentSid) {
    payload.contentSid = contentSid;
    payload.contentVariables = buildContentVariables(options);
    console.log('[whatsapp-twilio] contentSid=%s contentVariables=%s', contentSid, payload.contentVariables);
  } else {
    const text = String(body || '').trim();
    if (!text) throw new Error('Empty WhatsApp message body');
    payload.body = text;
    if (options.includeMedia) {
      const mediaUrl = options.mediaUrl || resolveMediaUrl(options);
      if (mediaUrl) payload.mediaUrl = [mediaUrl];
    }
  }

  const message = await smsService.withTimeout(
    client.messages.create(payload),
    config.sms.sendTimeoutMs,
    'twilio.whatsapp.messages.create'
  );

  return message.sid || true;
}

module.exports = {
  isApiModeEnabled,
  isReadySync,
  getConfigError,
  isColdOutreachTemplateConfigured,
  getColdOutreachBlockReason,
  APPROVED_WATEXT_SID,
  REJECTED_WATEXT_UPDATED_SID,
  PENDING_WATEXT_UPDATED_SID,
  sendWhatsAppMessage,
  formatWhatsAppAddress,
  resolveFromAddress,
  buildContentVariables,
  WATEXT_TEMPLATE_EXAMPLES
};
