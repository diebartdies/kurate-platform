const mongoose = require('mongoose');

const ActivityLogSchema = new mongoose.Schema({
  professional: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: false
  },
  isGuest: {
    type: Boolean,
    default: false
  },
  action: {
    type: String,
    required: true
  },
  /** Computed category for admin log filters: admin, admin_ho, professional, guest, registration_visitor, unknown */
  actorType: {
    type: String,
    index: true
  },
  /** Highlight rows in admin UI (e.g. flagged events). */
  highlight: {
    type: Boolean,
    default: false,
    index: true
  },
  details: {
    type: mongoose.Schema.Types.Mixed
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

ActivityLogSchema.post('save', (doc) => {
  if (!doc?.ipAddress) return;
  setImmediate(() => {
    try {
      const { scheduleIpEnrichment } = require('../services/ipIntelService');
      scheduleIpEnrichment(doc.ipAddress);
    } catch (err) {
      console.error('[ActivityLog] ip enrichment schedule failed:', err.message);
    }
  });
});

module.exports = mongoose.model('ActivityLog', ActivityLogSchema);