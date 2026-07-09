require('dotenv').config();
const smsService = require('../services/smsService');
const { inviteSms } = require('../utils/smsTemplates');
const { normalizeSmsPhone } = require('../utils/professionalInviteSms');

// One-off test sender. Sends the invite SMS to a SINGLE number WITHOUT touching
// the leads table. Requires only the Twilio env vars to be set (and SMS_ENABLED;
// outside production also SMS_ALLOW_NON_PROD). No DB connection is opened.
//
// Usage: node scripts/send-test-sms.js <phone> [alias]
//   e.g. node scripts/send-test-sms.js +5491134679434 Sofia
async function main() {
  const phoneArg = process.argv[2];
  const aliasArg = process.argv[3];

  if (!phoneArg) {
    console.error('Usage: node scripts/send-test-sms.js <phone> [alias]');
    process.exit(1);
  }

  const e164 = normalizeSmsPhone(phoneArg);
  if (!e164) {
    console.error(`Could not normalize "${phoneArg}" to E.164. Pass a valid Argentina mobile.`);
    process.exit(1);
  }

  if (!smsService.isConfigured()) {
    console.error('[SMS] Twilio is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN '
      + 'and TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID, then retry.');
  }

  const body = inviteSms({ alias: aliasArg });
  console.log(`Sending test invite SMS to ${e164}:`);
  console.log(`  "${body}"`);

  const result = await smsService.sendSms({ to: e164, body });

  if (result.ok) {
    console.log(`\n✅ Sent. Twilio SID: ${result.sid}`);
    process.exit(0);
  }
  console.error(`\n❌ Not sent. ${result.error || result.reason || 'unknown reason'}`);
  process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
