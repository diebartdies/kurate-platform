const {
  getPlatformWhatsAppPhone,
  updatePlatformWhatsAppPhone,
  formatWhatsAppPhoneDisplay,
  getAdminWhatsAppSettings,
  getPlatformWhatsAppPhoneSource,
  isTwilioWhatsAppPhoneConfigured
} = require('../utils/whatsappConfig');
const platformService = require('../services/whatsappPlatformService');
const dripRunner = require('../services/whatsappDripRunner');
const inboundService = require('../services/twilioWhatsAppInboundService');
const twilioWhatsApp = require('../services/twilioWhatsAppService');
const { buildStep2LaunchFeedbackReply, buildStep2OutreachReply } = require('../utils/professionalInviteMessage');

// @desc    Get platform WhatsApp configuration
// @route   GET /api/v1/admin/whatsapp/config
// @access  Private/Admin
exports.getWhatsAppConfig = async (req, res) => {
  try {
    const settings = await getAdminWhatsAppSettings();
    const status = await platformService.getRegistrationStatus();
    const phoneSource = await getPlatformWhatsAppPhoneSource();

    res.status(200).json({
      success: true,
      data: {
        phoneNumber: status.phoneNumber,
        displayPhone: status.displayPhone,
        phoneSource,
        twilioConfigured: phoneSource === 'twilio',
        twilioEnvDefault: isTwilioWhatsAppPhoneConfigured(),
        transport: status.transport || 'webjs',
        twilioApi: Boolean(status.twilioApi),
        registeredAt: settings.registeredAt || null,
        lastConnectedAt: settings.lastConnectedAt || null,
        sessionSaved: status.sessionSaved,
        connected: status.connected,
        phase: status.phase,
        qr: status.qr || null,
        lastError: status.lastError || null,
        inboundWebhookUrl: inboundService.getWebhookPublicUrl(),
        whatsappTemplateConfigured: twilioWhatsApp.isColdOutreachTemplateConfigured(),
        coldOutreachBlocked: Boolean(twilioWhatsApp.getColdOutreachBlockReason()),
        coldOutreachBlockReason: twilioWhatsApp.getColdOutreachBlockReason() || null
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Update platform WhatsApp origin phone number
// @route   PUT /api/v1/admin/whatsapp/config
// @access  Private/Admin
exports.updateWhatsAppPhone = async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber || !String(phoneNumber).trim()) {
      return res.status(400).json({ success: false, error: 'Phone number is required' });
    }

    const clean = await updatePlatformWhatsAppPhone(phoneNumber);

    res.status(200).json({
      success: true,
      message: 'WhatsApp phone number updated',
      data: {
        phoneNumber: clean,
        displayPhone: formatWhatsAppPhoneDisplay(clean)
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Start WhatsApp Web registration (QR flow)
// @route   POST /api/v1/admin/whatsapp/register
// @access  Private/Admin
exports.startWhatsAppRegistration = async (req, res) => {
  try {
    const status = await platformService.startRegistration();
    const message = status.twilioApi
      ? 'Twilio WhatsApp API is active — no QR scan required'
      : 'WhatsApp registration started — scan the QR with the configured phone';
    res.status(202).json({
      success: true,
      message,
      data: status
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Poll WhatsApp registration / connection status
// @route   GET /api/v1/admin/whatsapp/register/status
// @access  Private/Admin
exports.getWhatsAppRegistrationStatus = async (req, res) => {
  try {
    const status = await platformService.getRegistrationStatus();
    res.status(200).json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Start the in-app WhatsApp batch drip sender (100 msgs / 30 min pause)
// @route   POST /api/v1/admin/whatsapp/drip/start
// @access  Private/Admin
exports.startWhatsAppDrip = async (req, res) => {
  try {
    const result = await dripRunner.start();
    const status = await dripRunner.getStatus();

    if (!result.ok) {
      const code = result.templatePending ? 503 : (result.notConnected ? 409 : 400);
      return res.status(code).json({ success: false, error: result.error, data: status });
    }

    res.status(202).json({
      success: true,
      message: 'WhatsApp drip started',
      data: status
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Stop the in-app WhatsApp batch drip sender
// @route   POST /api/v1/admin/whatsapp/drip/stop
// @access  Private/Admin
exports.stopWhatsAppDrip = async (req, res) => {
  try {
    dripRunner.stop();
    const status = await dripRunner.getStatus();
    res.status(200).json({
      success: true,
      message: 'WhatsApp drip stopped',
      data: status
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Live status of the in-app WhatsApp batch drip sender
// @route   GET /api/v1/admin/whatsapp/drip/status
// @access  Private/Admin
exports.getWhatsAppDripStatus = async (req, res) => {
  try {
    const status = await dripRunner.getStatus();
    res.status(200).json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Get configured origin phone (for UI labels)
// @route   GET /api/v1/admin/whatsapp/phone
// @access  Private/Admin
exports.getWhatsAppPhone = async (req, res) => {
  try {
    const phoneNumber = await getPlatformWhatsAppPhone();
    res.status(200).json({
      success: true,
      data: {
        phoneNumber,
        displayPhone: formatWhatsAppPhoneDisplay(phoneNumber)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    List inbound WhatsApp replies (Twilio webhook)
// @route   GET /api/v1/admin/whatsapp/inbound
// @access  Private/Admin
exports.listWhatsAppInbound = async (req, res) => {
  try {
    const limit = req.query.limit;
    const since = req.query.since;
    const messages = await inboundService.listInboundMessages({ limit, since });
    res.status(200).json({
      success: true,
      data: {
        messages,
        webhookUrl: inboundService.getWebhookPublicUrl()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Send manual WhatsApp reply to a lead (Twilio session message or linked web client)
// @route   POST /api/v1/admin/whatsapp/reply
// @access  Private/Admin
exports.sendWhatsAppReply = async (req, res) => {
  try {
    const { toPhone, body, template, alias, inboundId } = req.body || {};
    if (!toPhone || !String(toPhone).trim()) {
      return res.status(400).json({ success: false, error: 'Recipient phone is required' });
    }

    let messageBody = String(body || '').trim();
    if (template === 'step2') {
      messageBody = buildStep2LaunchFeedbackReply(alias);
    } else if (template === 'step2link') {
      messageBody = buildStep2OutreachReply(alias);
    }
    if (!messageBody) {
      return res.status(400).json({ success: false, error: 'Message body is required' });
    }

    const doc = await inboundService.sendManualReply({
      toPhone,
      body: messageBody,
      alias,
      inboundId,
      sentBy: req.user && req.user._id
    });

    res.status(200).json({
      success: true,
      message: 'WhatsApp reply sent',
      data: {
        id: doc._id,
        toPhone: doc.toPhone,
        body: doc.body,
        sentAt: doc.sentAt,
        messageSid: doc.messageSid
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};
