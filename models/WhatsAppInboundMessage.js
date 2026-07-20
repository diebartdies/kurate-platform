const mongoose = require('mongoose');

const WhatsAppInboundMessageSchema = new mongoose.Schema({
  messageSid: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  fromPhone: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  fromName: {
    type: String,
    trim: true,
    default: ''
  },
  toPhone: {
    type: String,
    trim: true,
    default: ''
  },
  body: {
    type: String,
    default: ''
  },
  numMedia: {
    type: Number,
    default: 0
  },
  mediaUrls: [{
    type: String,
    trim: true
  }],
  lead: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PotentialProfessional',
    default: null
  },
  receivedAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

module.exports = mongoose.model('WhatsAppInboundMessage', WhatsAppInboundMessageSchema);
