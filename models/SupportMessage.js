const mongoose = require('mongoose');

const SupportMessageSchema = new mongoose.Schema({
  professional: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  alias: {
    type: String,
    trim: true
  },
  name: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['open', 'resolved'],
    default: 'open'
  },
  adminNotes: {
    type: String,
    trim: true
  },
  adminReply: {
    type: String,
    trim: true
  },
  repliedAt: {
    type: Date
  },
  resolvedAt: {
    type: Date
  }
}, { timestamps: true });

module.exports = mongoose.model('SupportMessage', SupportMessageSchema, 'support_messages');
