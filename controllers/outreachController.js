const config = require('../config/appConfig');
const outreachService = require('../services/whatsappOutreachService');
const smsOutreachService = require('../services/smsOutreachService');

// @desc    Start bulk WhatsApp outreach to pending leads
// @route   POST /api/v1/admin/outreach/bulk-whatsapp
// @access  Private/Admin
exports.startBulkWhatsApp = async (req, res, next) => {
  try {
    const twilioWa = require('../services/twilioWhatsAppService');
    const templateBlock = twilioWa.getColdOutreachBlockReason();
    if (templateBlock) {
      return res.status(503).json({ success: false, error: templateBlock });
    }

    const status = outreachService.startBulkOutreachBackground();
    res.status(202).json({
      success: true,
      message: 'Bulk WhatsApp outreach started',
      data: status
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Bulk WhatsApp outreach progress
// @route   GET /api/v1/admin/outreach/bulk-whatsapp/status
// @access  Private/Admin
exports.getBulkWhatsAppStatus = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      data: outreachService.getStatus()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Send WhatsApp to selected leads and/or professionals
// @route   POST /api/v1/admin/outreach/whatsapp/targeted
// @access  Private/Admin
exports.startTargetedWhatsApp = async (req, res, next) => {
  try {
    const { leadIds = [], professionalIds = [], message = '' } = req.body;
    const hasLeads = Array.isArray(leadIds) && leadIds.length > 0;
    const hasProfessionals = Array.isArray(professionalIds) && professionalIds.length > 0;

    if (!hasLeads && !hasProfessionals) {
      return res.status(400).json({ success: false, error: 'Select at least one recipient' });
    }

    const status = outreachService.startTargetedOutreachBackground({
      leadIds: hasLeads ? leadIds : [],
      professionalIds: hasProfessionals ? professionalIds : [],
      message
    });

    res.status(202).json({
      success: true,
      message: 'Targeted WhatsApp outreach started',
      data: status
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Start bulk SMS outreach to pending leads
// @route   POST /api/v1/admin/outreach/bulk-sms
// @access  Private/Admin
exports.startBulkSms = async (req, res, next) => {
  try {
    if (config.sms.senderBypass) {
      return res.status(503).json({
        success: false,
        error: 'SMS/Twilio sender bypass is active (TWILIO_SENDER_BYPASS). Configure Twilio creds on the server .env, then set TWILIO_SENDER_BYPASS=false.'
      });
    }
    const status = smsOutreachService.startBulkOutreachBackground();
    res.status(202).json({
      success: true,
      message: 'Bulk SMS outreach started',
      data: status
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Bulk SMS outreach progress
// @route   GET /api/v1/admin/outreach/bulk-sms/status
// @access  Private/Admin
exports.getBulkSmsStatus = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      data: smsOutreachService.getStatus()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Send SMS invitation to selected leads
// @route   POST /api/v1/admin/outreach/sms/targeted
// @access  Private/Admin
exports.startTargetedSms = async (req, res, next) => {
  try {
    if (config.sms.senderBypass) {
      return res.status(503).json({
        success: false,
        error: 'SMS/Twilio sender bypass is active (TWILIO_SENDER_BYPASS). Configure WhatsApp Business / Twilio sender first.'
      });
    }
    const { leadIds = [] } = req.body;
    const hasLeads = Array.isArray(leadIds) && leadIds.length > 0;

    if (!hasLeads) {
      return res.status(400).json({ success: false, error: 'Select at least one recipient' });
    }

    const status = smsOutreachService.startTargetedOutreachBackground({ leadIds });

    res.status(202).json({
      success: true,
      message: 'Targeted SMS outreach started',
      data: status
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
