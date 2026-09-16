const mongoose = require('mongoose');

const ClickEventSchema = new mongoose.Schema({
  professional: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['profile_card', 'phone', 'whatsapp', 'telegram'],
    required: true,
    index: true
  },
  visitorIp: {
    type: String
  },
  visitorFingerprint: {
    type: String
  },
  userAgent: {
    type: String,
    maxlength: 300
  },
  referer: {
    type: String,
    maxlength: 500
  },
  aviso: {
    type: mongoose.Schema.ObjectId,
    ref: 'Aviso'
  },
  month: {
    type: String,
    required: true,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

ClickEventSchema.index({ professional: 1, month: 1 });
ClickEventSchema.index({ professional: 1, type: 1, month: 1 });
ClickEventSchema.index({ createdAt: 1 });

module.exports = mongoose.model('ClickEvent', ClickEventSchema);
