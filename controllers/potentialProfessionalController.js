const PotentialProfessional = require('../models/PotentialProfessional');
const {
  buildColdOutreachStep1Message,
  buildOutreachRegisterUrl,
  getOutreachBrandImageUrl,
  buildWhatsAppUrl
} = require('../utils/professionalInviteMessage');

// @desc    Preview outreach invite message (cold WhatsApp step 1 — same as drip/template)
// @route   GET /api/v1/admin/outreach/invite-message
// @access  Private/Admin
exports.getInviteMessage = async (req, res, next) => {
  try {
    const alias = (req.query.alias && String(req.query.alias).trim()) || 'María';
    res.status(200).json({
      success: true,
      data: {
        message: buildColdOutreachStep1Message(alias),
        registerUrl: buildOutreachRegisterUrl(),
        brandImageUrl: getOutreachBrandImageUrl(),
        alias,
        channel: 'whatsapp-cold'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Get all potential professionals
// @route   GET /api/v1/admin/potential-professionals
// @access  Private/Admin
exports.getPotentialProfessionals = async (req, res, next) => {
  try {
    const { status, sourceUrl, page = 1, limit = 50 } = req.query;
    const query = {};

    // Allow filtering by status or the source website
    if (status) query.status = status;
    if (sourceUrl) query.sourceUrl = sourceUrl;

    const startIndex = (page - 1) * limit;

    const potentials = await PotentialProfessional.find(query)
      .sort({ createdAt: -1 })
      .skip(startIndex)
      .limit(parseInt(limit, 10));

    const total = await PotentialProfessional.countDocuments(query);

    res.status(200).json({
      success: true,
      count: potentials.length,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total
      },
      data: potentials.map((lead) => {
        const obj = lead.toObject ? lead.toObject() : lead;
        return {
          ...obj,
          whatsappLink: buildWhatsAppUrl(obj.phone, obj.alias)
        };
      })
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Update potential professional status
// @route   PUT /api/v1/admin/potential-professionals/:id
// @access  Private/Admin
exports.updatePotentialProfessional = async (req, res, next) => {
  try {
    const { status, doNotContact, doNotContactReason } = req.body;

    const updates = {};
    if (status !== undefined) {
      if (!['pending', 'contacted', 'joined', 'rejected', 'failed'].includes(status)) {
        return res.status(400).json({ success: false, error: 'Invalid status' });
      }
      updates.status = status;
    }
    if (doNotContact !== undefined) {
      updates.doNotContact = Boolean(doNotContact);
      if (updates.doNotContact) {
        updates.doNotContactAt = new Date();
        updates.doNotContactReason = String(doNotContactReason || 'Blocked in admin').trim().slice(0, 500);
        if (!updates.status) updates.status = 'rejected';
      } else {
        updates.doNotContactReason = '';
        updates.doNotContactAt = null;
      }
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }

    const potential = await PotentialProfessional.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );

    if (!potential) {
      return res.status(404).json({ success: false, error: 'Potential professional not found' });
    }

    res.status(200).json({
      success: true,
      data: potential
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Block outreach to all leads matching a phone (any alias / duplicate import)
// @route   POST /api/v1/admin/potential-professionals/block-phone
// @access  Private/Admin
exports.blockPhone = async (req, res, next) => {
  try {
    const { phone, reason } = req.body || {};
    if (!phone) {
      return res.status(400).json({ success: false, error: 'phone is required' });
    }

    const { buildPhoneInQuery, expandPhoneVariants } = require('../utils/outreachPhone');
    const query = buildPhoneInQuery(phone);
    if (!query) {
      return res.status(400).json({ success: false, error: 'Invalid phone number' });
    }

    const note = String(reason || 'Blocked in admin').trim().slice(0, 500);
    const now = new Date();
    const result = await PotentialProfessional.updateMany(query, {
      $set: {
        doNotContact: true,
        doNotContactReason: note,
        doNotContactAt: now
      }
    });

    let created = null;
    if (result.matchedCount === 0) {
      const variants = expandPhoneVariants(phone);
      created = await PotentialProfessional.create({
        phone: variants[0],
        status: 'rejected',
        doNotContact: true,
        doNotContactReason: note,
        doNotContactAt: now,
        sourceUrl: 'manual:admin-block-phone'
      });
    }

    const matches = await PotentialProfessional.find(query);

    res.status(200).json({
      success: true,
      data: {
        variants: expandPhoneVariants(phone),
        matched: result.matchedCount,
        modified: result.modifiedCount,
        createdId: created?._id || null,
        leads: matches
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};