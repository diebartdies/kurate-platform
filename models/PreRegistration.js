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
    enum: ['phone', 'email', 'verified', 'dni', 'complete'],
    default: 'phone'
  },
  dniFrontImage: {
    type: String
  },
  dniNumeroTramite: {
    type: String
  },
  dniApellido: {
    type: String
  },
  dniNombre: {
    type: String
  },
  dniSegundoNombre: {
    type: String
  },
  dniFechaNacimiento: {
    type: String
  },
  dniFechaEmision: {
    type: String
  },
  firstName: {
    type: String
  },
  surname: {
    type: String
  },
  middleName: {
    type: String
  },
  password: {
    type: String,
    select: false
  },
  role: {
    type: String,
    enum: ['professional', 'user'],
    default: 'professional'
  },
  alias: {
    type: String,
    trim: true
  },
  bio: {
    type: String
  },
  street: {
    type: String
  },
  number: {
    type: String
  },
  floor: {
    type: String
  },
  apartment: {
    type: String
  },
  postalCode: {
    type: String
  },
  province: {
    type: String
  },
  city: {
    type: String
  },
  neighborhood: {
    type: String
  },
  services: {
    type: [String]
  },
  height: {
    type: String
  },
  measurements: {
    type: String
  },
  originCountry: {
    type: String
  },
  instagram: {
    type: String
  },
  facebook: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

PreRegistrationSchema.index({ email: 1 });
PreRegistrationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model('PreRegistration', PreRegistrationSchema);
