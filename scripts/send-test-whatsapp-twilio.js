#!/usr/bin/env node
/**
 * Send one test WhatsApp via Twilio API (template watext when CONTENT_SID is set).
 * Usage: node scripts/send-test-whatsapp-twilio.js [phone] [alias]
 * Default phone: WHATSAPP_TEST_PHONE in .env or 5491134679434
 * Phone: E.164 digits only (no +). Argentina mobile: 549 + area + number.
 */
require('dotenv').config();
const twilioWa = require('../services/twilioWhatsAppService');
const {
  normalizeWhatsAppPhone,
  normalizeE164Digits,
  buildSanitizedWhatsAppCaption
} = require('../utils/professionalInviteMessage');

async function main() {
  const rawPhone = process.argv[2]
    || process.env.WHATSAPP_TEST_PHONE
    || '5491134679434';
  const alias = process.argv[3] || twilioWa.WATEXT_TEMPLATE_EXAMPLES['1'];

  const to = normalizeWhatsAppPhone(rawPhone) || normalizeE164Digits(rawPhone);
  if (!to || to.length < 11) {
    console.error('[WA] Invalid phone — use full E.164 digits, e.g. 5491134679434 (not 549XXXXXXXXX or +549).');
    console.error('[WA] You passed:', rawPhone, '→ parsed as:', to || '(empty)');
    process.exit(1);
  }

  if (!twilioWa.isApiModeEnabled()) {
    const cfg = require('../config/appConfig');
    console.error('[WA] Twilio WhatsApp API mode is off.');
    console.error('[WA] TWILIO_WHATSAPP_FROM_NUMBER =', process.env.TWILIO_WHATSAPP_FROM_NUMBER ? 'set' : 'MISSING');
    console.error('[WA] TWILIO_ACCOUNT_SID =', cfg.sms.accountSid ? 'set' : 'MISSING');
    process.exit(1);
  }

  const err = twilioWa.getConfigError();
  if (err) {
    console.error('[WA]', err);
    process.exit(1);
  }

  const block = twilioWa.getColdOutreachBlockReason();
  if (block) {
    console.error('[WA]', block);
    process.exit(1);
  }

  const contentVariables = twilioWa.buildContentVariables({ alias });

  console.log('[WA] Template watext (approved):');
  console.log('  {{1}} alias example:', alias);
  console.log('[WA] contentVariables JSON:', contentVariables);
  console.log('[WA] Sending test to whatsapp:+' + to, '...');

  const body = buildSanitizedWhatsAppCaption(alias);
  const sid = await twilioWa.sendWhatsAppMessage(to, body, {
    alias,
    useTemplate: true,
    includeMedia: false
  });
  console.log('[WA] Sent OK. SID:', sid);
}

main().catch((err) => {
  console.error('[WA] Failed:', err.message);
  process.exit(1);
});
