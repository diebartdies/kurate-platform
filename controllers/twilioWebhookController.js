const inboundService = require('../services/twilioWhatsAppInboundService');

// @desc    Twilio WhatsApp inbound webhook (when someone replies to the platform number)
// @route   POST /api/v1/webhooks/twilio/whatsapp
// @access  Public (Twilio signature)
exports.handleWhatsAppInbound = async (req, res) => {
  try {
    if (!inboundService.validateTwilioSignature(req)) {
      console.warn('[whatsapp-inbound] Rejected webhook — invalid or missing Twilio signature');
      return res.status(403).type('text/plain').send('Forbidden');
    }

    await inboundService.saveInboundMessage(req.body || {});

    res.status(200).type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  } catch (err) {
    console.error('[whatsapp-inbound] Webhook error:', err.message);
    // Still 200 so Twilio does not retry forever on duplicate/parse edge cases we handled.
    res.status(200).type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }
};
