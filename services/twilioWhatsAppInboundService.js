const config = require('../config/appConfig');
const WhatsAppInboundMessage = require('../models/WhatsAppInboundMessage');
const WhatsAppOutboundMessage = require('../models/WhatsAppOutboundMessage');
const PotentialProfessional = require('../models/PotentialProfessional');
const { normalizeWhatsAppPhone, normalizeE164Digits } = require('../utils/professionalInviteMessage');

function stripWhatsAppPrefix(value) {
  return String(value || '').replace(/^whatsapp:/i, '').trim();
}

function parseInboundPhone(value) {
  const raw = stripWhatsAppPrefix(value);
  return normalizeWhatsAppPhone(raw) || normalizeE164Digits(raw) || '';
}

function getWebhookPublicUrl() {
  const explicit = (process.env.TWILIO_WHATSAPP_WEBHOOK_URL || '').trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const base = (config.platform?.publicUrl || '').replace(/\/$/, '');
  return base ? `${base}/api/v1/webhooks/twilio/whatsapp` : '';
}

function validateTwilioSignature(req) {
  if (process.env.TWILIO_WEBHOOK_SKIP_VALIDATE === 'true') return true;

  const authToken = config.sms.authToken;
  const signature = req.headers['x-twilio-signature'];
  if (!authToken || !signature) return false;

  const webhookUrl = getWebhookPublicUrl();
  if (!webhookUrl) return false;

  try {
    const twilio = require('twilio');
    return twilio.validateRequest(authToken, signature, webhookUrl, req.body || {});
  } catch {
    return false;
  }
}

function collectMediaUrls(payload) {
  const count = parseInt(payload.NumMedia, 10) || 0;
  const urls = [];
  for (let i = 0; i < count; i += 1) {
    const url = payload[`MediaUrl${i}`];
    if (url) urls.push(String(url));
  }
  return urls;
}

async function findLeadByPhone(phoneDigits) {
  if (!phoneDigits) return null;

  const variants = new Set([phoneDigits]);
  if (phoneDigits.startsWith('549')) variants.add(phoneDigits.slice(2));
  if (phoneDigits.startsWith('54')) variants.add(phoneDigits.slice(2));

  const lead = await PotentialProfessional.findOne({
    phone: { $in: [...variants] }
  }).select('_id alias phone status');

  return lead;
}

async function saveInboundMessage(payload) {
  const messageSid = String(payload.MessageSid || payload.SmsMessageSid || '').trim();
  if (!messageSid) {
    throw new Error('Missing MessageSid in Twilio webhook payload');
  }

  const existing = await WhatsAppInboundMessage.findOne({ messageSid }).select('_id');
  if (existing) return { duplicate: true, message: existing };

  const fromPhone = parseInboundPhone(payload.From);
  const toPhone = parseInboundPhone(payload.To);
  const body = String(payload.Body || '').trim();
  const fromName = String(payload.ProfileName || '').trim();
  const mediaUrls = collectMediaUrls(payload);
  const lead = await findLeadByPhone(fromPhone);

  const doc = await WhatsAppInboundMessage.create({
    messageSid,
    fromPhone,
    fromName,
    toPhone,
    body,
    numMedia: mediaUrls.length,
    mediaUrls,
    lead: lead ? lead._id : null
  });

  console.log(`[whatsapp-inbound] From +${fromPhone}${fromName ? ` (${fromName})` : ''}: ${body.slice(0, 120)}`);

  return { duplicate: false, message: doc, lead };
}

async function listInboundMessages({ limit = 50, since } = {}) {
  const query = {};
  if (since) {
    const sinceDate = new Date(since);
    if (!Number.isNaN(sinceDate.getTime())) query.receivedAt = { $gte: sinceDate };
  }

  const max = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);

  const [inboundRows, outboundRows] = await Promise.all([
    WhatsAppInboundMessage.find(query)
      .sort({ receivedAt: -1 })
      .limit(max)
      .populate('lead', 'alias phone status')
      .lean(),
    WhatsAppOutboundMessage.find({})
      .sort({ sentAt: -1 })
      .limit(max)
      .lean()
  ]);

  const inbound = inboundRows.map((row) => ({
    id: row._id,
    direction: 'inbound',
    messageSid: row.messageSid,
    phone: row.fromPhone,
    fromPhone: row.fromPhone,
    fromDisplay: row.fromName ? `${row.fromName} (+${row.fromPhone})` : `+${row.fromPhone}`,
    fromName: row.fromName,
    body: row.body,
    numMedia: row.numMedia,
    mediaUrls: row.mediaUrls || [],
    at: row.receivedAt,
    receivedAt: row.receivedAt,
    lead: row.lead
      ? { id: row.lead._id, alias: row.lead.alias, phone: row.lead.phone, status: row.lead.status }
      : null
  }));

  const outbound = outboundRows.map((row) => ({
    id: row._id,
    direction: 'outbound',
    messageSid: row.messageSid,
    phone: row.toPhone,
    toPhone: row.toPhone,
    fromDisplay: `+${row.toPhone}`,
    body: row.body,
    at: row.sentAt,
    sentAt: row.sentAt,
    inboundReplyTo: row.inboundReplyTo
  }));

  const messages = [...inbound, ...outbound]
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, max);

  return messages;
}

async function sendManualReply({ toPhone, body, alias, inboundId, sentBy }) {
  const phone = parseInboundPhone(toPhone) || normalizeWhatsAppPhone(toPhone);
  if (!phone) throw new Error('Invalid recipient phone number');

  const text = String(body || '').trim();
  if (!text) throw new Error('Message body is required');

  const platformService = require('./whatsappPlatformService');
  const twilioWhatsApp = require('./twilioWhatsAppService');

  let messageSid = '';
  if (platformService.isTwilioApiMode()) {
    messageSid = await twilioWhatsApp.sendWhatsAppMessage(phone, text, {
      sessionReply: true,
      includeMedia: false,
      alias
    });
  } else {
    if (!platformService.isClientReady()) {
      throw new Error('WhatsApp is not connected. Link WhatsApp first or enable Twilio API mode.');
    }
    messageSid = await platformService.sendMessage(phone, text, { includeMedia: false });
  }

  const doc = await WhatsAppOutboundMessage.create({
    messageSid: String(messageSid || ''),
    toPhone: phone,
    body: text,
    inboundReplyTo: inboundId || null,
    sentBy: sentBy || null
  });

  console.log(`[whatsapp-outbound] To +${phone}: ${text.slice(0, 120)}`);

  return doc;
}

module.exports = {
  getWebhookPublicUrl,
  validateTwilioSignature,
  saveInboundMessage,
  listInboundMessages,
  sendManualReply
};
