const mongoose = require('mongoose');

const WhatsAppOutboundMessageSchema = new mongoose.Schema({
  messageSid: {
    type: String,
    trim: true,
    default: ''
  },
  toPhone: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  body: {
    type: String,
    required: true,
    default: ''
  },
  inboundReplyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WhatsAppInboundMessage',
    default: null
  },
  sentBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  sentAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

module.exports = mongoose.model('WhatsAppOutboundMessage', WhatsAppOutboundMessageSchema);
