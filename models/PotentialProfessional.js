const mongoose = require('mongoose');

const PotentialProfessionalSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true, trim: true },
  alias: { type: String, trim: true },
  sourceUrl: { type: String, trim: true },
  status: {
    type: String,
    enum: ['pending', 'contacted', 'joined', 'rejected', 'failed'],
    default: 'pending'
  },
  whatsappSentAt: { type: Date },
  whatsappError: { type: String, trim: true },
  whatsappMessageId: { type: String, trim: true },
  smsStatus: {
    type: String,
    enum: ['pending', 'sent', 'failed'],
    default: 'pending'
  },
  smsSentAt: { type: Date },
  smsError: { type: String, trim: true },
  smsSid: { type: String, trim: true },
  telegramStatus: {
    type: String,
    enum: ['pending', 'sent', 'failed', 'blocked'],
    default: 'pending'
  },
  telegramSentAt: { type: Date },
  telegramError: { type: String, trim: true },
  doNotContact: { type: Boolean, default: false },
  doNotContactReason: { type: String, trim: true },
  doNotContactAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PotentialProfessional', PotentialProfessionalSchema, 'potential_professionals');
