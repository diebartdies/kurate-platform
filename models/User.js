const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/appConfig');

// Un oficio que el profesional declara idoneo. Para los oficios regulados
// (gasista, electricista) puede acreditar la matricula: numero y/o foto del
// titulo, con su estado de verificacion para que el admin la apruebe.
//
// La verificacion no es solo "el numero existe": el registro oficial se
// consulta segun el ofício y la provincia, y el ente emisor esperado depende
// de la combinacion (ver utils/matriculaRules.js):
//   gasista  + CABA      -> Metrogas o Enargas
//   gasista  + Provincia -> Enargas
//   electricista         -> COPIME
// Por eso se guardan titular, ente emisor y estado segun el padron oficial.
const matriculaSchema = {
  titular: { type: String, trim: true, default: '' },
  enteEmisor: { type: String, trim: true, default: '', lowercase: true },
  estado: { type: String, trim: true, default: 'sin_verificar' },
  verificadoEn: Date,
  verificadoPor: { type: String, trim: true, default: '' },
  fuenteConsulta: { type: String, trim: true, default: '' }
};

const ENTE_EMISOR_VALIDOS = ['metrogas', 'enargas', 'copime', 'otro', ''];

const professionSchema = new mongoose.Schema({
  slug: { type: String, index: true, trim: true, lowercase: true },
  name: { type: String, index: true, trim: true },
  matriculado: { type: Boolean, default: false },
  matriculaNumero: { type: String, trim: true, default: '' },
  matriculaFoto: { type: String, default: '' },
  matriculaVerificada: { type: Boolean, default: false },
  matriculaVerificadaAt: Date,
  matriculaRechazada: { type: Boolean, default: false },
  matriculaRechazadaMotivo: { type: String, trim: true, default: '' },
  matriculaTitular: matriculaSchema.titular,
  matriculaEnteEmisor: {
    type: String,
    trim: true,
    lowercase: true,
    default: '',
    enum: ENTE_EMISOR_VALIDOS
  },
  matriculaEstado: {
    type: String,
    trim: true,
    default: 'sin_verificar',
    enum: ['sin_verificar', 'activa', 'suspendida', 'vencida', 'no_encontrada']
  },
  matriculaVerificadoEn: matriculaSchema.verificadoEn,
  matriculaVerificadoPor: matriculaSchema.verificadoPor,
  matriculaFuenteConsulta: matriculaSchema.fuenteConsulta
}, { _id: false });


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
  /** Bumped whenever the password is reset by an admin. The JWT carries the value
      it was issued with, so a mismatch logs every previously issued token out. */
  tokenVersion: {
    type: Number,
    default: 0
  },
  /** Set when an admin issues a temporary password: the user must replace it on
      first login before using the app normally. */
  mustChangePassword: {
    type: Boolean,
    default: false
  },
  role: {
    type: String,
    enum: ['user', 'professional', 'admin'],
    default: 'user'
  },
  professionalType: {
    type: String,
    enum: ['profesional_matriculado', 'tecnico_matriculado', 'tecnico_no_matriculado', 'idoneo'],
    default: 'tecnico_no_matriculado'
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
  /** Number of stored verification documents. Kept in sync via pre-save hook so the
      frontend can know whether a DNI was submitted without ever receiving the images. */
  verificationDocumentsCount: {
    type: Number,
    default: 0
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
    }],
    /** Device-gated admin login: only approved device IDs can sign in (soft-MAC). */
    devices: {
      enabled: { type: Boolean, default: false },
      allowedDevices: [{
        deviceId: { type: String, trim: true },
        label: { type: String, trim: true, default: '' },
        createdAt: { type: Date, default: Date.now },
        lastSeenAt: { type: Date, default: Date.now },
        ipAddress: { type: String, trim: true }
      }]
    }
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
    usesWhatsApp: { type: Boolean, default: true },
    usesTelegram: { type: Boolean, default: false },
    instagram: String,
    facebook: String,
    bio: {
      type: String,
      maxlength: [500, 'Bio cannot be more than 500 characters']
    },
    commercialDescription: {
      type: String,
      maxlength: [1000, 'Commercial description cannot be more than 1000 characters']
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
    // Cache desnormalizado de los prefijos de services[].path, para que la
    // busqueda por jerarquia resuelva con igualdad y no con regex. Se llena
    // con servicePathPrefixes() y se mantiene con el backfill.
    servicePaths: [String],
    // Trades/professions the professional exercises (e.g. "Plomero", "Cerrajero").
    // Each entry mirrors the professions taxonomy collection: { slug, name }.
    // Para las profesiones reguladas (gasista, electricista) el profesional
    // declara si esta matriculado y adjunta el numero de matricula y/o el
    // titulo escaneado: eso es lo que le da veracidad al anuncio.
    professions: [professionSchema],
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
      zipCode: String,
      lat: Number,
      lng: Number
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
    budgetType: {
      type: String,
      enum: ['sin_cargo', 'con_cargo'],
      default: 'sin_cargo'
    },
    budgetAmount: {
      type: Number,
      min: 0
    },
    responseSpeed: {
      type: String,
      enum: ['inmediata', '24hs', '48hs', '72hs'],
      default: '24hs'
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
      actions: [{ type: String }],
      brands: [String]
    }],
    // Cache derivado de services[].path con TODOS los prefijos:
    // 'hogar/linea-blanca/heladera/Ariston' -> ['hogar', 'hogar/linea-blanca',
    // 'hogar/linea-blanca/heladera', 'hogar/linea-blanca/heladera/Ariston'].
    // Es lo que permite buscar por igualdad (usa indice) en vez de con regex
    // anclado parcial que MongoDB no puede acotar -> collscan.
    // Derivado: lo regenera servicePathPrefixes() en cada guardado.
    servicePaths: [String],
    // Trades/professions the professional exercises (e.g. "Plomero", "Cerrajero").
    // Each entry mirrors the professions taxonomy collection: { slug, name }.
    professions: [professionSchema],
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
    certifications: [String],
    workingHours: {
      start: { type: String, default: '09:00' },
      end: { type: String, default: '18:00' }
    },
    workingDays: [{
      type: String,
      enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      default: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    }],
    commercialDescription: {
      type: String,
      maxlength: [1000, 'Commercial description cannot be more than 1000 characters']
    },
    onCall: {
      type: Boolean,
      default: false
    },
    budgetPrice: {
      type: { type: String, enum: ['sin_cargo', 'con_cargo'], default: 'sin_cargo' },
      amount: { type: Number }
    },
    // Cobro por app: el profesional facilita que el cliente pague vía KuraTe sin efectivo
    payment: {
      wantsAppPayment: { type: Boolean, default: false },
      cbu: { type: String, trim: true, maxlength: 22 },
      cvu: { type: String, trim: true, maxlength: 22 },
      alias: { type: String, trim: true, maxlength: 30 },
      accountNumber: { type: String, trim: true },
      bankName: { type: String, trim: true }
    }
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
  if (this.isModified('verificationDocuments') || this.isNew) {
    this.verificationDocumentsCount = Array.isArray(this.verificationDocuments)
      ? this.verificationDocuments.length
      : 0;
  }
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
  return jwt.sign({ id: this._id, tokenVersion: this.tokenVersion || 0 }, process.env.JWT_SECRET, {
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

// --- Índices de búsqueda ---
// Antes cada /professionals/search era un collection scan de `users`: ninguno de
// los campos del filtro base tenía índice. El compuesto cubre el camino caliente
// (rol + vivo + estado verificado + servicios). Los de servicios.path / .brands
// soportan el filtro jerárquico y el match por marca.
UserSchema.index({ role: 1, accountDeletedAt: 1, verificationStatus: 1 });
UserSchema.index({ role: 1, accountDeletedAt: 1, 'hogarProfile.services.path': 1 });
UserSchema.index({ 'hogarProfile.services.path': 1 });
UserSchema.index({ 'hogarProfile.services.brands': 1 });
UserSchema.index({ 'hogarProfile.area': 1, 'hogarProfile.action': 1 });
UserSchema.index({ 'hogarProfile.address.province': 1, 'hogarProfile.address.city': 1 });
UserSchema.index({ 'professionalProfile.location.province': 1, 'professionalProfile.location.city': 1 });

// servicePaths: cache desnormalizado de los prefijos de services[].path.
// Es lo que permite que el filtro jerarquico sea IGUALDAD en vez de regex.
// Un $in de un solo valor sobre este array corta el indice; el regex alternado
// de servicePrefixRegex() no arrancaba con '^' y no podia acotarlo.
//
// El campo va primero a proposito: el filtro siempre trae $in sobre
// servicePaths, asi que el indice se acota en la primera clave y despues
// filtra role / verificationStatus / accountDeletedAt desde el doc.
UserSchema.index({ 'hogarProfile.servicePaths': 1, role: 1, verificationStatus: 1, accountDeletedAt: 1 });
UserSchema.index({ 'professionalProfile.servicePaths': 1, role: 1, verificationStatus: 1, accountDeletedAt: 1 });

// Ordenar/filtrar por area y accion: el listing los trae siempre juntos.
UserSchema.index({ role: 1, 'hogarProfile.area': 1, 'hogarProfile.action': 1, accountDeletedAt: 1 });

// busqueda por profesion + solo matriculados. Los dos campos salen del MISMO
// array (professionalProfile.professions / hogarProfile.professions), asi que
// el compuesto es valido como multikey.
UserSchema.index({ 'professionalProfile.professions.slug': 1, 'professionalProfile.professions.matriculado': 1, role: 1, accountDeletedAt: 1 });
UserSchema.index({ 'hogarProfile.professions.slug': 1, 'hogarProfile.professions.matriculado': 1, role: 1, accountDeletedAt: 1 });

// Listar solo matriculados sin filtrar profesion: cubre el caso
// matriculado=1 sin profession.
UserSchema.index({ 'professionalProfile.professions.matriculado': 1, role: 1, accountDeletedAt: 1 });
UserSchema.index({ 'hogarProfile.professions.matriculado': 1, role: 1, accountDeletedAt: 1 });

module.exports = mongoose.model('User', UserSchema);