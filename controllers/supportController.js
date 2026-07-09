const SupportMessage = require('../models/SupportMessage');

// @desc    Professional creates a support message
// @route   POST /api/v1/support
// @access  Private/Professional
exports.createSupportMessage = async (req, res) => {
  try {
    const message = (req.body.message || '').trim();
    if (!message) {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }

    const user = req.user;
    const prof = user.professionalProfile || {};
    const fullName = [prof.firstName, prof.middleName, prof.surname]
      .filter(Boolean)
      .join(' ')
      .trim();

    const supportMessage = await SupportMessage.create({
      professional: user._id || user.id,
      alias: prof.alias || '',
      name: fullName || user.name || '',
      email: user.email || '',
      phone: prof.mobilePhone || prof.whatsappNumber || '',
      message
    });

    res.status(201).json({ success: true, data: supportMessage });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Admin lists support messages (newest first)
// @route   GET /api/v1/admin/support
// @access  Private/Admin
exports.getSupportMessages = async (req, res) => {
  try {
    const query = {};
    if (req.query.status === 'open' || req.query.status === 'resolved') {
      query.status = req.query.status;
    }

    const messages = await SupportMessage.find(query).sort({ status: 1, createdAt: -1 });
    const openCount = await SupportMessage.countDocuments({ status: 'open' });

    res.status(200).json({ success: true, count: messages.length, openCount, data: messages });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Admin updates a support message (reply and/or resolve)
// @route   PUT /api/v1/admin/support/:id
// @access  Private/Admin
exports.updateSupportMessage = async (req, res) => {
  try {
    const message = await SupportMessage.findById(req.params.id);
    if (!message) {
      return res.status(404).json({ success: false, error: 'Support message not found' });
    }

    if (typeof req.body.adminReply === 'string') {
      message.adminReply = req.body.adminReply.trim();
      message.repliedAt = new Date();
    }

    if (typeof req.body.adminNotes === 'string') {
      message.adminNotes = req.body.adminNotes.trim();
    }

    if (req.body.status === 'resolved') {
      message.status = 'resolved';
      message.resolvedAt = new Date();
    } else if (req.body.status === 'open') {
      message.status = 'open';
      message.resolvedAt = undefined;
    }

    await message.save();

    res.status(200).json({ success: true, data: message });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
