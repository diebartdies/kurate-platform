const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/appConfig');

const UserSchema = new mongoose.Schema({
  name: {
    type: String
  },
  email: {
    type: String,
    required: [true, 'Please add an email'],
    unique: true,
    match: [
      /.+@.+\..+/,
      'Please add a valid email'
    ]
  },
  password: {
    type: String,
    required: [true, 'Please add a password'],
    minlength: 6,
    select: false // Do not return the password by default in queries
  },
  role: {
    type: String,
    enum: ['user', 'professional', 'admin'],
    default: 'user'
  },
  professionalType: {
    type: String,
    enum: ['companion', 'hogar'],
    default: 'companion'
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationCode: String,
  emailVerificationCodeExpire: Date,
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  /** Set when the user deletes their account — hidden from public; data retained. */
  accountDeletedAt: {
    type: Date,
    default: null
  },
  rejectionReason: {
    type: String,
    enum: ['photos_unclear', 'photo_info_mismatch', 'general_failure']
  },
  rejectionDetails: {
    type: String
  },
  allowResubmission: {
    type: Boolean,
    default: false
  },
  firstApprovedLogin: {
    type: Boolean,
    default: false
  },
  verificationGesture: {
    type: String,
    enum: ['1 finger', '2 fingers', '3 fingers', 'thumbs up', '1FU', '2FU', '3FU', 'TU', 'OS']
  },
  verificationDocuments: {
    type: [String],
    select: false
  },
  phoneVerified: {
    type: Boolean,
    default: false
  },
  phoneVerificationCode: String,
  phoneVerificationCodeExpire: Date,
  /** Twilio Message SID of the most recent phone verification SMS — used for delivery tracking. */
  phoneVerificationSid: String,
  isAnonymous: {
    type: Boolean,
    default: false
  },
  /** express | guest | full — how the account was created */
  registrationMode: {
    type: String,
    trim: true
  },
  adminSettings: {
    pricing: {
      verificados: { type: Number, default: 50000 },
      Premium: { type: Number, default: 40000 },
      Gold: { type: Number, default: 30000 },
      Silver: { type: Number, default: 20000 },
      Standard: { type: Number, default: 15000 }
    },
    whatsapp: {
      phoneNumber: { type: String, default: '5491178280156' },
      registeredAt: Date,
      lastConnectedAt: Date
    },
    launchCurtain: {
      enabled: { type: Boolean, default: false },
      // Grand opening moment as an ISO-8601 string with offset (Argentina, -03:00),
      // e.g. '2026-06-24T00:00:00-03:00'. When set & valid this overrides the
      // config/env default (config.launchCurtain.openingAt). null = use default.
      openingAt: { type: String, default: null }
    },
    /** Public IPs seen on admin login — used to label browsing logs as Admin-ho. */
    knownIps: [{
      ip: { type: String, trim: true },
      label: { type: String, default: 'ho' },
      lastSeenAt: { type: Date, default: Date.now }
    }]
  },
  professionalProfile: {
    alias: {
      type: String,
      trim: true,
      maxlength: [50, 'Alias cannot be more than 50 characters']
    },
    quality: {
      type: String,
      enum: ['Standard', 'Silver', 'Gold', 'Premium', 'verificados'],
      default: 'Standard'
    },
    desiredQuality: {
      type: String,
      enum: ['Standard', 'Silver', 'Gold', 'Premium', 'verificados']
    },
    lastCatModDate: Date,
    qualityBeforeLastMod: {
      type: String,
      enum: ['Standard', 'Silver', 'Gold', 'Premium', 'verificados']
    },
    categoryChangeLog: [{
      changedAt: { type: Date, default: Date.now },
      fromQuality: String,
      toQuality: String
    }],
    isEvaluationPeriod: {
      type: Boolean,
      default: true
    },
    /** Quick signup (email + phone + age); admin completes profile and photos. */
    expressRegistration: {
      type: Boolean,
      default: false
    },
    firstName: String,
    surname: String,
    middleName: String,
    idNumber: String,
    birthDate: Date,
    age: Number,
    mobilePhone: String,
    instagram: String,
    facebook: String,
    bio: {
      type: String,
      maxlength: [500, 'Bio cannot be more than 500 characters']
    },
    hasOwnApartment: {
      type: Boolean,
      default: false
    },
    hasFantasyWardrobe: {
      type: Boolean,
      default: false
    },
    workingHours: {
      start: { type: String, default: '00:00' }, // HH:mm format
      end: { type: String, default: '23:59' }
    },
    workingDays: [{
      type: String,
      enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      default: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    }],
    services: [{
      type: String,
      index: true
    }],
    whatsappNumber: String,
    photos: [String],
    location: {
      province: String,
      city: String,
      neighborhood: String,
      street: String,
      number: { type: String, match: [/^\d*$/, 'Only numbers allowed'] },
      floor: { type: String, match: [/^\d*$/, 'Only numbers allowed'] },
      apartment: String,
      postalCode: String,
      country: String,
      zipCode: String
    },
    pricing: mongoose.Schema.Types.Mixed,
    measurements: String,
    height: String,
    eyeColor: String,
    hasTattoos: Boolean,
    isDuo: {
      type: Boolean,
      default: false
    },
    duoPartner: {
      type: mongoose.Schema.ObjectId,
      ref: 'User'
    },
    rateChangeAcknowledged: {
      type: Boolean,
      default: true // Default to true, will be set to false on rate changes
    },
    isExposed: {
      type: Boolean,
      default: true // Determines if professional is shown on discovery grid
    },
    paysMonthlyCharges: {
      type: Boolean,
      default: true // Determines if the professional is subject to monthly fees
    },
    subscriptionStatus: {
      type: String,
      enum: ['trial', 'active', 'suspended'],
      default: 'trial' // Starts on the 1-month grace period
    },
    trialEndDate: {
      type: Date,
      // Sets the trial end date to 30 days (1 month) from account creation
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    },
    paymentReceiptUrl: String,
    paymentProcessed: {
      type: Boolean,
      default: true
    },
    paymentHistory: [{
      date: { type: Date, default: Date.now },
      amount: Number,
      method: { 
        type: String, 
        enum: ['MercadoPago', 'Bank Transfer'] 
      },
      receiptUrl: String, // URL/Path to the uploaded comprobante de pago
      status: { 
        type: String, 
        enum: ['pending', 'verified', 'rejected'], 
        default: 'pending' 
      },
      billingMonth: String // Format: YYYY-MM (e.g., '2026-05')
    }],
    invoices: [{
      billingMonth: String, // Format: YYYY-MM (e.g., '2026-05' or '2026-05 (Pro-rated)')
      amount: Number,
      dueDate: Date,
      status: { 
        type: String, 
        enum: ['pending', 'paid', 'late', 'cancelled'], 
        default: 'pending' 
      },
      lateFeeApplied: { 
        type: Boolean, 
        default: false 
      },
      issuedAt: { 
        type: Date, 
        default: Date.now 
      }
    }],
    lastPhotoUpdate: {
      type: Date,
      default: Date.now
    },
    vacation: {
      startDate: Date,
      endDate: Date,
      requestedAt: Date
    }
  },
  hogarProfile: {
    // Identity (persona física o empresa)
    firstName: String,
    lastName: String,
    companyName: String,
    taxId: String, // DNI o CUIT
    birthDate: Date,
    activityStartDate: Date,
    address: {
      street: String,
      number: String,
      floor: String,
      apartment: String,
      neighborhood: String,
      city: String,
      province: String,
      postalCode: String,
      country: String
    },
    // Contact
    contact: {
      email: String,
      mobilePhone: String,
      whatsapp: { type: Boolean, default: false },
      telegram: { type: Boolean, default: false }
    },
    // Category / maturity of the professional
    category: {
      type: String,
      enum: ['profesional_matriculado', 'tecnico_matriculado', 'tecnico_no_matriculado', 'idoneo'],
      default: 'tecnico_no_matriculado'
    },
    // Ad: single action + single area
    action: String,
    actionDetails: String,
    area: {
      type: String,
      enum: ['hogar', 'oficina', 'pime', 'industria']
    },
    // Selected services (multiple nodes, multiple brands each) within the chosen area
    services: [{
      path: { type: String, required: true },
      name: { type: String, required: true },
      brands: [String]
    }],
    photos: [String],
    specialty: String,
    availability: {
      type: String,
      enum: ['inmediata', 'rapida', 'puedo_esperar', 'sin_apuro'],
      default: 'rapida'
    },
    description: String,
    // Legacy fields retained for backward compat
    scope: {
      type: String,
      enum: ['domicilio', 'barrio', 'ciudad', 'provincia', 'pais'],
      default: 'domicilio'
    },
    experience: String,
    certifications: [String]
  },
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  // Age-verification + Terms & Conditions acceptance for this account.
  // termsVersion records WHICH version of the legal text was accepted so a
  // future text change (bumped TERMS_VERSION) can re-trigger acceptance.
  termsAcceptedAt: Date,
  termsVersion: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Encrypt password using bcrypt before saving
UserSchema.pre('save', async function() {
  if (!this.isModified('password')) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Match user entered password to hashed password in database
UserSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Sign JWT and return
UserSchema.methods.getSignedJwtToken = function() {
  return jwt.sign({ id: this._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE
  });
};

// Generate and hash password reset token
UserSchema.methods.getResetPasswordToken = function() {
  // Generate code (6 digits for consistency with email verification)
  const resetToken = Math.floor(100000 + Math.random() * 900000).toString();

  // Set resetPasswordToken field
  this.resetPasswordToken = resetToken;

  // Set expire
  this.resetPasswordExpire = Date.now() + config.verificationCodeExpireMinutes * 60 * 1000;

  return resetToken;
};

module.exports = mongoose.model('User', UserSchema);