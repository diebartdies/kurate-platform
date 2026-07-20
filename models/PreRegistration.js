const mongoose = require('mongoose');

const PreRegistrationSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  dateOfBirth: {
    type: Date,
    required: true
  },
  phoneCode: {
    type: String
  },
  phoneCodeExpire: {
    type: Date
  },
  phoneVerified: {
    type: Boolean,
    default: false
  },
  emailCode: {
    type: String
  },
  emailCodeExpire: {
    type: Date
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  step: {
    type: String,
    enum: ['phone', 'email', 'complete', 'dni'],
    default: 'phone'
  },
  dniFrontValidated: {
    type: Boolean,
    default: false
  },
  password: {
    type: String,
    select: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

PreRegistrationSchema.index({ email: 1 });
PreRegistrationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model('PreRegistration', PreRegistrationSchema);
