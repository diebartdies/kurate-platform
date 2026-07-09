const User = require('../models/User');
const config = require('../config/appConfig');
const sendEmail = require('../sendEmail');
const crypto = require('crypto');
const fs = require('fs');
const ActivityLog = require('../models/ActivityLog');
const { getClientIp } = require('../utils/clientIp');
const { recordAdminLoginIp, HOME_LABEL } = require('../utils/adminKnownIps');
const Specialty = require('../models/Specialty');
const { normalizeRegistrationMobilePhone } = require('../utils/professionalInviteMessage');
const { rollbackPendingUser, purgeExpiredUnverifiedUsers, isEmailFullyRegistered, hasVerifiedGuestAccount } = require('../utils/pendingRegistration');
const { getCertificateExpiryWarnings } = require('../utils/certExpiry');
const { OAuth2Client } = require('google-auth-library');

function ageFromBirthDate(dateStr) {
  if (!dateStr) return null;
  const dob = new Date(dateStr);
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let years = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) years -= 1;
  return years;
}

async function generateExpressAlias(phone, mail) {
  const digits = String(phone || '').replace(/\D/g, '').slice(-4);
  const mailLocal = String(mail || '').split('@')[0].replace(/\W/g, '').slice(0, 12);
  const base = (mailLocal || `treasure${digits || 'new'}`).toLowerCase();
  let candidate = base;
  let suffix = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const taken = await User.findOne({
      role: 'professional',
      'professionalProfile.alias': { $regex: new RegExp(`^${candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });
    if (!taken) return candidate;
    suffix += 1;
    candidate = `${base}${suffix}`;
  }
}

const PROFESSIONAL_QUALITIES = ['Standard', 'Silver', 'Gold', 'Premium', 'verificados'];

function normalizeRegistrationMode(value) {
  return String(value || '').trim().toLowerCase();
}

function resolveProfessionalRegistrationMode(role, registrationMode) {
  if (role !== 'professional') return null;
  const mode = normalizeRegistrationMode(registrationMode);
  return mode === 'full' ? 'full' : 'express';
}

function buildVerificationDocumentsFromUpload(req) {
  const verificationDocuments = [];
  if (!req.files || !req.files.length) return verificationDocuments;
  for (const file of req.files) {
    const base64Data = fs.readFileSync(file.path, 'base64');
    verificationDocuments.push(`data:${file.mimetype};base64,${base64Data}`);
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
  }
  return verificationDocuments;
}

async function syncProfessionalSpecialties(user) {
  if (user.role !== 'professional' || !user.professionalProfile?.services?.length) return;
  await Specialty.deleteMany({ user: user._id });
  const specialtyDocs = user.professionalProfile.services.map((s) => ({
    user: user._id,
    specialty: s
  }));
  await Specialty.insertMany(specialtyDocs).catch((err) => console.error('Failed to sync specialties table:', err.message));
}

async function logProfessionalRegistered(user, req, details = {}) {
  const clientIp = getClientIp(req);
  await ActivityLog.create({
    professional: user._id,
    action: 'register',
    actorType: 'professional',
    ipAddress: clientIp,
    userAgent: req.headers['user-agent'],
    details
  }).catch((err) => console.error('Failed to log professional registration:', err.message));
}

async function notifyProfessionalRegistered(user, email, { upgradedFromGuest = false, viaGoogle = false } = {}) {
  try {
    const adminEmail = config.payment?.adminEmail || 'admin@drsrv.net.ar';
    const prof = user.professionalProfile || {};
    const express = prof.expressRegistration || user.registrationMode === 'express';
    const prefix = upgradedFromGuest ? 'Guest upgraded to professional' : (viaGoogle ? 'Express registration via Google' : 'Express registration verified');
    await sendEmail({
      email: adminEmail,
      subject: 'FullMinent - New Professional Registration',
      message: express
        ? `${prefix}: ${email}\nPhone: ${prof.mobilePhone || '—'}\nAlias (temp): ${prof.alias || '—'}\n\nComplete profile and upload gallery photos in Admin before approving.`
        : `A new professional registered: ${email}\nVerification Status: ${user.verificationStatus}`
    });
  } catch (err) {
    console.error('Failed to notify admin:', err.message);
  }
}

async function upgradeGuestToProfessional(existingUser, {
  password,
  professionalProfile,
  verificationDocuments,
  verificationGesture,
  isExpressRegistration,
  req
}) {
  existingUser.password = password;
  existingUser.role = 'professional';
  existingUser.registrationMode = isExpressRegistration ? 'express' : undefined;
  existingUser.professionalProfile = professionalProfile;
  existingUser.verificationDocuments = verificationDocuments || [];
  existingUser.verificationStatus = 'pending';
  existingUser.verificationGesture = isExpressRegistration ? undefined : verificationGesture;
  existingUser.isVerified = false;
  existingUser.isEmailVerified = true;
  existingUser.emailVerificationCode = undefined;
  existingUser.emailVerificationCodeExpire = undefined;
  await existingUser.save();
  await syncProfessionalSpecialties(existingUser);
  await logProfessionalRegistered(existingUser, req, {
    registrationMode: isExpressRegistration ? 'express' : 'full',
    upgradedFromGuest: true
  });
  await notifyProfessionalRegistered(existingUser, existingUser.email, { upgradedFromGuest: true });
  return existingUser;
}

function needsGoogleProfileCompletion(user) {
  if (!user || user.role !== 'professional') return false;
  const prof = user.professionalProfile || {};
  const hasPhone = Boolean(String(prof.mobilePhone || prof.whatsappNumber || '').trim());
  const hasBirth = Boolean(prof.birthDate) || (Number.isFinite(prof.age) && prof.age >= 18);
  return !hasPhone || !hasBirth;
}

async function upgradeGuestToProfessionalViaGoogle(user, req, name) {
  const email = user.email;
  const alias = await generateExpressAlias('', email);
  const evaluationQuality = PROFESSIONAL_QUALITIES[Math.floor(Math.random() * PROFESSIONAL_QUALITIES.length)];
  const firstName = String(name).trim().split(/\s+/)[0] || alias;

  user.role = 'professional';
  user.registrationMode = 'express';
  user.name = undefined;
  user.professionalProfile = {
    firstName,
    alias,
    bio: '',
    expressRegistration: true,
    quality: evaluationQuality,
    isEvaluationPeriod: true
  };
  user.verificationStatus = 'pending';
  user.isVerified = false;
  user.isEmailVerified = true;
  await user.save();
  await logProfessionalRegistered(user, req, {
    alias,
    registrationMode: 'express',
    viaGoogle: true,
    upgradedFromGuest: true
  });
  await notifyProfessionalRegistered(user, email, { upgradedFromGuest: true, viaGoogle: true });
  return user;
}

// @desc    Register user
// @route   POST /api/v1/auth/register
// @access  Public
exports.register = async (req, res, next) => {
  try {
    // Destructure all fields from the multipart form body
    let { 
      email, password, role, alias, bio, hasOwnApartment, hasFantasyWardrobe, 
      province, city, neighborhood, measurements, height, services, verificationGesture,
      firstName, surname, middleName, idNumber, birthDate, age: ageField, mobilePhone, street, number, floor, apartment, postalCode,
      originCountry, instagram, facebook, quality, registrationMode
    } = req.body;

    const isGuestRegistration = role === 'user'
      && normalizeRegistrationMode(registrationMode) === 'guest';

    const professionalRegistrationMode = resolveProfessionalRegistrationMode(role, registrationMode);
    const isFullRegistration = professionalRegistrationMode === 'full';
    const isExpressRegistration = professionalRegistrationMode === 'express';

    let passwordWasGenerated = false;

    // Normalize email to prevent case-sensitive duplicate accounts
    if (email) email = email.toLowerCase().trim();

    await purgeExpiredUnverifiedUsers(email);

    if (isGuestRegistration) {
      if (!email || !String(email).trim()) {
        return res.status(400).json({ success: false, error: 'Email is required.' });
      }
      if (alias && String(alias).trim()) {
        alias = String(alias).trim().slice(0, config.maxAliasLength || 50);
      } else {
        alias = String(email).split('@')[0].replace(/\W/g, '').slice(0, config.maxAliasLength || 50) || 'guest';
      }
      if (!password || String(password).length < 6) {
        password = crypto.randomBytes(16).toString('base64url').slice(0, 12);
        passwordWasGenerated = true;
      }
    }

    let age;
    if (birthDate) {
        age = ageFromBirthDate(birthDate);
    } else if (ageField !== undefined && ageField !== null && String(ageField).trim() !== '') {
        age = parseInt(String(ageField).trim(), 10);
        if (!Number.isFinite(age) || age < 18 || age > 99) {
          return res.status(400).json({ success: false, error: 'Please enter a valid age (18–99).' });
        }
        birthDate = new Date(new Date().getFullYear() - age, 0, 1).toISOString().slice(0, 10);
    }

    if (role === 'professional' && isExpressRegistration) {
      if (!email || !String(email).trim()) {
        return res.status(400).json({ success: false, error: 'Email is required.' });
      }
      if (!password || String(password).length < 6) {
        return res.status(400).json({ success: false, error: 'Password must be at least 6 characters.' });
      }
      if (!mobilePhone || !String(mobilePhone).trim()) {
        return res.status(400).json({ success: false, error: 'Mobile phone is required.' });
      }
      const normalizedMobile = normalizeRegistrationMobilePhone(mobilePhone);
      if (normalizedMobile) mobilePhone = normalizedMobile;
      if (!birthDate || !String(birthDate).trim()) {
        return res.status(400).json({ success: false, error: 'Birth date is required.' });
      }
      if (age === undefined || age === null || !Number.isFinite(age) || age < 18 || age > 99) {
        return res.status(400).json({ success: false, error: 'You must be at least 18 years old to register.' });
      }
    } else if (role === 'professional' && isFullRegistration) {
      const required = [
        ['firstName', firstName], ['surname', surname], ['alias', alias], ['idNumber', idNumber],
        ['street', street], ['number', number], ['province', province], ['city', city],
        ['originCountry', originCountry], ['mobilePhone', mobilePhone]
      ];
      for (const [label, val] of required) {
        if (!val || !String(val).trim()) {
          return res.status(400).json({ success: false, error: `Missing required field: ${label}` });
        }
      }
      const allowedQualities = ['Standard', 'Silver', 'Gold', 'Premium', 'verificados'];
      if (quality && !allowedQualities.includes(String(quality).trim())) {
        return res.status(400).json({ success: false, error: 'Please select a valid category.' });
      }
      if (!req.files || req.files.length < 3) {
        return res.status(400).json({ success: false, error: 'All three verification photos are required.' });
      }
    }

    if (role === 'professional' && isExpressRegistration && !alias) {
      alias = await generateExpressAlias(mobilePhone, email);
    }

    const allowedQualities = ['Standard', 'Silver', 'Gold', 'Premium', 'verificados'];
    const selectedQuality = role === 'professional'
      ? (allowedQualities.includes(String(quality || '').trim()) ? String(quality).trim() : undefined)
      : (allowedQualities.includes(String(quality || '').trim()) ? String(quality).trim() : 'Standard');
    const evaluationQuality = role === 'professional'
      ? allowedQualities[Math.floor(Math.random() * allowedQualities.length)]
      : selectedQuality;

    // Reconstruct the professionalProfile object
    const professionalProfile = role === 'professional' ? {
      firstName, surname, middleName, idNumber, birthDate: birthDate ? new Date(birthDate) : undefined, age, mobilePhone,
      instagram, facebook,
      alias, bio: bio || '',
      hasOwnApartment: hasOwnApartment === 'true',
      hasFantasyWardrobe: hasFantasyWardrobe === 'true',
      location: { province, city, neighborhood, street, number, floor, apartment, postalCode, country: originCountry },
      measurements, height,
      whatsappNumber: mobilePhone ? String(mobilePhone).trim() : '',
      services: services ? services.split(',').map(s => s.trim()).filter(Boolean) : [],
      ...(selectedQuality ? { desiredQuality: selectedQuality } : {}),
      quality: evaluationQuality,
      isEvaluationPeriod: true,
      expressRegistration: isExpressRegistration
    } : undefined;

    // Express and guest signups never require ID verification photos at registration.
    const verificationDocuments = buildVerificationDocumentsFromUpload(req);

    // Block only verified professionals/admins; verified guests may upgrade to professional
    const existingUser = await User.findOne({ email });
    if (existingUser?.isEmailVerified) {
      if (role === 'professional' && existingUser.role === 'user') {
        const upgraded = await upgradeGuestToProfessional(existingUser, {
          password,
          professionalProfile,
          verificationDocuments,
          verificationGesture,
          isExpressRegistration,
          req
        });
        return sendTokenResponse(upgraded, 200, res);
      }
      return res.status(409).json({
        success: false,
        code: 'EMAIL_ALREADY_REGISTERED',
        error: existingUser.role === 'professional'
          ? 'This email is already registered as a professional. Please sign in.'
          : 'This email is already registered. Please sign in.'
      });
    }
    if (existingUser && !existingUser.isEmailVerified) {
      await rollbackPendingUser(existingUser._id);
    }

    // Check if Alias is already taken by a verified professional
    if (role === 'professional' && alias) {
      let existingAlias = await User.findOne({
        role: 'professional',
        isEmailVerified: true,
        'professionalProfile.alias': { $regex: new RegExp('^' + alias.trim() + '$', 'i') }
      });
      if (existingAlias) {
        return res.status(400).json({
          success: false,
          error: 'This alias is already in use by another professional. Please choose a different one.'
        });
      }
    }

    // Generate a 6-digit verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const codeExpireMs = config.verificationCodeExpireMinutes * 60 * 1000;
    const verificationCodeExpire = new Date(Date.now() + codeExpireMs);

    // Category chosen at registration (admin pricing table); legacy auto-score removed.
    // Create user
    const user = await User.create({
      email,
      password,
      role,
      name: isGuestRegistration ? alias : undefined,
      registrationMode: isGuestRegistration
        ? 'guest'
        : (isExpressRegistration ? 'express' : (isFullRegistration ? 'full' : undefined)),
      professionalProfile: role === 'professional' ? professionalProfile : undefined,
      verificationDocuments,
      verificationStatus: role === 'professional' ? 'pending' : 'approved',
      verificationGesture: role === 'professional' && isFullRegistration ? verificationGesture : undefined,
      isVerified: role !== 'professional',
      isEmailVerified: false,
      emailVerificationCode: verificationCode,
      emailVerificationCodeExpire: verificationCodeExpire
    });

    // Sync specialties after email is verified (see verifyEmail)

    // Verification email must succeed — otherwise rollback pending account
    let emailSubject = 'FullMinent Platform - Email Verification Code';
    let emailMessage = `Welcome to the FullMinent Platform!\n\nYour verification code is: ${verificationCode}\n\nThis code will expire in ${config.verificationCodeExpireMinutes} minutes.`;

    if (role === 'professional') {
      if (isExpressRegistration) {
        emailSubject = 'Bienvenida a FullMinent — confirmá tu email';
        emailMessage = `Hola,

Bienvenida a FullMinent.

Tu código de verificación es: ${verificationCode}
(Este código vence en ${config.verificationCodeExpireMinutes} minutos)

Registraste solo lo esencial. Nuestro equipo te contactará por WhatsApp para completar tu perfil y subir tus fotos — no hace falta que lo hagas sola.

Cuando verifiques tu email podés entrar a tu panel con la contraseña que elegiste.

Saludos,
Equipo FullMinent`;
      } else {
        emailSubject = 'Bienvenida a FullMinent — Tu mes de evaluación comienza';
        emailMessage = `Hola,

Bienvenida a FullMinent — la plataforma que conecta profesionales con clientes.

Tu código de verificación es: ${verificationCode}
(Este código vence en ${config.verificationCodeExpireMinutes} minutos)

✅ PRIMER MES GRATIS
Disfrutá de 30 días de evaluación sin costo. Conocé la plataforma, recibí consultas y descubrí el valor de tener tu perfil profesional visible.

📂 TU PERFIL
Durante la evaluación tu perfil aparece en el directorio general. Al abonar tu primera mensualidad, elegís la categoría que mejor se ajuste a tus servicios.

🔒 VERIFICACIÓN
Revisaremos tus documentos con absoluta profesionalidad. El proceso puede demorar al menos 48 horas. Te avisaremos por email cuando tu perfil esté aprobado. Revisá también tu carpeta de Spam.

— Equipo FullMinent`;
      }
    } else if (isGuestRegistration) {
      emailSubject = 'FullMinent — confirm your email';
      emailMessage = `Hello ${alias},

Welcome to FullMinent.

Your verification code is: ${verificationCode}
(This code expires in ${config.verificationCodeExpireMinutes} minutes.)`;
      if (passwordWasGenerated) {
        emailMessage += `

Your temporary password: ${password}
Use it to sign in after you verify your email. You can change it anytime via password recovery.`;
      }
      emailMessage += `

After verification you can browse the collection and participate as a guest.

— FullMinent Team`;
    }

    try {
      await sendEmail({
        email: user.email,
        subject: emailSubject,
        message: emailMessage
      });
    } catch (err) {
      console.error('Email error:', err.message || err);
      await rollbackPendingUser(user._id);
      return res.status(503).json({
        success: false,
        code: err.code === 'EMAIL_NOT_CONFIGURED' ? 'EMAIL_NOT_CONFIGURED' : 'EMAIL_SEND_FAILED',
        error: 'We could not send the verification email. Your registration was not saved — please try again and check spam/junk.'
      });
    }

    const responsePayload = {
      success: true,
      data: user,
      message: 'Registration successful. Please check your email for the verification code.'
    };

    if (process.env.NODE_ENV !== 'production') {
      responsePayload.verificationCode = verificationCode;
    }

    res.status(201).json(responsePayload);
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Verify email with code
// @route   POST /api/v1/auth/verify-email
// @access  Public
exports.verifyEmail = async (req, res, next) => {
  try {
    let { email, code } = req.body;
    if (email) email = email.toLowerCase().trim();

    if (!email || !code) {
      return res.status(400).json({ success: false, error: 'Please provide email and code' });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_VERIFY_CODE',
        error: 'Invalid verification code'
      });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({
        success: false,
        code: 'EMAIL_ALREADY_VERIFIED',
        error: 'This email is already verified. You can sign in.'
      });
    }

    if (!user.emailVerificationCode || user.emailVerificationCode !== String(code).trim()) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_VERIFY_CODE',
        error: 'Invalid verification code'
      });
    }

    if (!user.emailVerificationCodeExpire || user.emailVerificationCodeExpire.getTime() <= Date.now()) {
      await rollbackPendingUser(user._id);
      return res.status(400).json({
        success: false,
        code: 'VERIFY_CODE_EXPIRED',
        error: 'Your verification code has expired. Please register again.'
      });
    }

    user.isEmailVerified = true;
    user.emailVerificationCode = undefined;
    user.emailVerificationCodeExpire = undefined;
    await user.save();

    const clientIp = getClientIp(req);

    if (user.role === 'professional' && user.professionalProfile?.services?.length > 0) {
      await syncProfessionalSpecialties(user);
    }

    if (user.role === 'professional') {
      await logProfessionalRegistered(user, req, {
        registrationMode: user.registrationMode || 'full'
      });
      await notifyProfessionalRegistered(user, email);
    } else if (user.role === 'user' && user.registrationMode === 'guest') {
      await ActivityLog.create({
        professional: user._id,
        action: 'register',
        actorType: 'guest',
        isGuest: true,
        ipAddress: clientIp,
        userAgent: req.headers['user-agent'],
        details: { alias: user.name, registrationMode: 'guest' }
      }).catch((err) => console.error('Failed to log guest registration:', err.message));
    }

    sendTokenResponse(user, 200, res);
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Resend email verification code
// @route   POST /api/v1/auth/resend-verification
// @access  Public
exports.resendVerificationCode = async (req, res) => {
  try {
    let { email } = req.body;
    if (email) email = email.toLowerCase().trim();

    if (!email) {
      return res.status(400).json({ success: false, error: 'Please provide an email address.' });
    }

    await purgeExpiredUnverifiedUsers(email);

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        code: 'REGISTRATION_NOT_FOUND',
        error: 'No pending registration found. Please register again.'
      });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({
        success: false,
        code: 'EMAIL_ALREADY_VERIFIED',
        error: 'This email is already verified. You can sign in.'
      });
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.emailVerificationCode = verificationCode;
    user.emailVerificationCodeExpire = new Date(Date.now() + config.verificationCodeExpireMinutes * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    const subject = user.role === 'professional'
      ? 'FullMinent — nuevo código de verificación'
      : 'FullMinent — verification code';
    const message = `Your verification code is: ${verificationCode}

This code expires in ${config.verificationCodeExpireMinutes} minutes.

If you did not request this, you can ignore this email.`;

    await sendEmail({
      email: user.email,
      subject,
      message
    });

    return res.status(200).json({
      success: true,
      message: 'Verification code sent. Please check your inbox and spam folder.'
    });
  } catch (err) {
    console.error('Resend verification error:', err.message || err);
    return res.status(503).json({
      success: false,
      code: err.code === 'EMAIL_NOT_CONFIGURED' ? 'EMAIL_NOT_CONFIGURED' : 'EMAIL_SEND_FAILED',
      error: 'Could not send email right now. Please try again in a few minutes.'
    });
  }
};

// @desc    Check whether an email is already registered (public, for registration UX)
// @route   GET /api/v1/auth/check-email
// @access  Public
exports.checkEmailRegistered = async (req, res) => {
  try {
    const email = String(req.query.email || '').toLowerCase().trim();
    if (!email || !/.+@.+\..+/.test(email)) {
      return res.status(400).json({ success: false, error: 'Please provide a valid email.' });
    }
    await purgeExpiredUnverifiedUsers(email);
    const registered = await isEmailFullyRegistered(email);
    const guestAccount = await hasVerifiedGuestAccount(email);
    const pendingVerification = Boolean(await User.exists({
      email,
      isEmailVerified: false,
      emailVerificationCodeExpire: { $gt: new Date() }
    }));
    return res.status(200).json({
      success: true,
      data: { registered, guestAccount, pendingVerification }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Login user
// @route   POST /api/v1/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    let { email, password } = req.body;
    if (email) email = email.toLowerCase().trim();

    // Validate email & password
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Please provide an email and password'
      });
    }

    // Check for user
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        code: 'USER_NOT_FOUND',
        error: 'No account found with this email address'
      });
    }

    // Check if password matches
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_PASSWORD',
        error: 'Incorrect password. Please try again.'
      });
    }

    if (!user.isEmailVerified) {
      return res.status(401).json({
        success: false,
        error: 'Please verify your email before logging in'
      });
    }

    if (user.accountDeletedAt) {
      return res.status(401).json({
        success: false,
        error: 'This account has been deleted.'
      });
    }

    // Log professional login activity
    const clientIp = getClientIp(req);
    if (user.role === 'professional') {
      await ActivityLog.create({
        professional: user._id,
        action: 'login',
        actorType: 'professional',
        ipAddress: clientIp,
        userAgent: req.headers['user-agent']
      });
    } else if (user.role === 'admin') {
      const recordedIp = await recordAdminLoginIp(user, clientIp);
      await ActivityLog.create({
        professional: user._id,
        action: 'admin_login',
        actorType: recordedIp ? 'admin_ho' : 'admin',
        ipAddress: clientIp,
        userAgent: req.headers['user-agent'],
        isGuest: false,
        details: {
          adminId: user._id,
          adminEmail: user.email,
          adminIpLabel: recordedIp ? HOME_LABEL : undefined,
          recordedIp: recordedIp || undefined
        }
      });
    }
    let certExpiryWarnings = [];
    if (user.role === 'admin') {
      try {
        certExpiryWarnings = getCertificateExpiryWarnings(10).warnings;
      } catch (err) {
        certExpiryWarnings = [{
          id: 'cert-check',
          domain: 'certificate-check',
          status: 'error',
          error: err.message
        }];
      }
    }

    sendTokenResponse(user, 200, res, { certExpiryWarnings });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Guest login (Anonymous browsing)
// @route   POST /api/v1/auth/guest-login
// @access  Public
exports.guestLogin = async (req, res, next) => {
  try {
    const guestId = crypto.randomBytes(4).toString('hex');
    const guestUsername = `Guest_${guestId}`;

    const guestUser = await User.create({
      name: guestUsername,
      email: `${guestUsername}@anonymous.com`,
      password: crypto.randomBytes(16).toString('hex'),
      role: 'user', // Default role for regular viewing
      verificationStatus: 'approved', // Required by schema to pass validation
      isVerified: true, // Bypass verification
      isEmailVerified: true, // Bypass verification
      isAnonymous: true // Flag to identify temporary accounts
    });

    try {
      const clientIp = req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : (req.socket.remoteAddress || req.ip);
      await ActivityLog.create({
        action: 'guest_login',
        isGuest: true,
        ipAddress: clientIp,
        userAgent: req.headers['user-agent']
      });
    } catch (logErr) {
      console.error('Failed to log guest activity:', logErr.message);
    }

    sendTokenResponse(guestUser, 200, res);
  } catch (error) {
    console.error('Guest Login Error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to generate guest session' });
  }
};

// @desc    Forgot password
// @route   POST /api/v1/auth/forgotpassword
// @access  Public
exports.forgotPassword = async (req, res, next) => {
  try {
    let { email } = req.body;
    if (email) email = email.toLowerCase().trim();
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'There is no user with that email'
      });
    }

    // Generate a 6-digit recovery code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const resetCodeExpire = new Date(Date.now() + config.verificationCodeExpireMinutes * 60 * 1000);

    // We reuse the emailVerificationCode fields to store the reset code 
    // since we know they exist in the User schema.
    user.emailVerificationCode = resetCode;
    user.emailVerificationCodeExpire = resetCodeExpire;
    await user.save({ validateBeforeSave: false });

    try {
      await sendEmail({
        email: user.email,
        subject: 'FullMinent Platform - Password Reset Code',
        message: `You requested a password reset.\n\nYour reset code is: ${resetCode}\n\nThis code will expire in ${config.verificationCodeExpireMinutes} minutes.`
      });

      res.status(200).json({ success: true, message: 'Email sent' });
    } catch (err) {
      console.error('Email error:', err);
      user.emailVerificationCode = undefined;
      user.emailVerificationCodeExpire = undefined;
      await user.save({ validateBeforeSave: false });

      return res.status(500).json({ success: false, error: 'Email could not be sent' });
    }
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Reset password
// @route   PUT /api/v1/auth/resetpassword
// @access  Public
exports.resetPassword = async (req, res, next) => {
  try {
    let { email, code, password } = req.body;
    if (email) email = email.toLowerCase().trim();

    if (!email || !code || !password) {
      return res.status(400).json({ success: false, error: 'Please provide email, code, and new password' });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_RESET_CODE',
        error: 'Invalid reset code'
      });
    }

    if (!user.emailVerificationCode) {
      return res.status(400).json({
        success: false,
        code: 'RESET_CODE_EXPIRED',
        error: 'Your recovery code has expired.'
      });
    }

    if (user.emailVerificationCode !== String(code).trim()) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_RESET_CODE',
        error: 'Invalid reset code'
      });
    }

    if (!user.emailVerificationCodeExpire || user.emailVerificationCodeExpire.getTime() <= Date.now()) {
      return res.status(400).json({
        success: false,
        code: 'RESET_CODE_EXPIRED',
        error: 'Your recovery code has expired.'
      });
    }

    // Set new password
    user.password = password;
    user.emailVerificationCode = undefined;
    user.emailVerificationCodeExpire = undefined;
    await user.save();

    sendTokenResponse(user, 200, res);
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Google Sign-in — existing account, or new guest/professional (email verified by Google, no code)
// @route   POST /api/v1/auth/google
// @access  Public
exports.googleAuth = async (req, res) => {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.status(503).json({ success: false, error: 'Google sign-in is not configured.' });
    }

    const { token, intent } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, error: 'No Google token provided' });
    }

    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: clientId
    });

    const payload = ticket.getPayload();
    const email = String(payload.email || '').toLowerCase().trim();
    const name = payload.name || email.split('@')[0];
    const emailVerified = payload.email_verified;
    const registrationIntent = String(intent || 'login').toLowerCase();

    if (!email) {
      return res.status(400).json({ success: false, error: 'Google account has no email.' });
    }
    if (!emailVerified) {
      return res.status(400).json({ success: false, error: 'Google email is not verified.' });
    }

    let user = await User.findOne({ email });

    if (user) {
      if (user.accountDeletedAt) {
        return res.status(401).json({ success: false, error: 'This account has been deleted.' });
      }
      if (!user.isEmailVerified) {
        user.isEmailVerified = true;
        user.emailVerificationCode = undefined;
        user.emailVerificationCodeExpire = undefined;
        await user.save();
      }
      if (registrationIntent === 'professional' && user.role === 'user') {
        user = await upgradeGuestToProfessionalViaGoogle(user, req, name);
        return sendTokenResponse(user, 200, res, {
          needsProfileCompletion: needsGoogleProfileCompletion(user)
        });
      }
      return sendTokenResponse(user, 200, res, {
        needsProfileCompletion: registrationIntent === 'professional' && needsGoogleProfileCompletion(user)
      });
    } else if (registrationIntent === 'professional') {
      const alias = await generateExpressAlias('', email);
      const evaluationQuality = PROFESSIONAL_QUALITIES[Math.floor(Math.random() * PROFESSIONAL_QUALITIES.length)];
      const firstName = String(name).trim().split(/\s+/)[0] || alias;

      user = await User.create({
        email,
        password: crypto.randomBytes(16).toString('hex'),
        role: 'professional',
        registrationMode: 'express',
        isVerified: false,
        isEmailVerified: true,
        verificationStatus: 'pending',
        professionalProfile: {
          firstName,
          alias,
          bio: '',
          expressRegistration: true,
          quality: evaluationQuality,
          isEvaluationPeriod: true
        }
      });

      const clientIp = getClientIp(req);
      await ActivityLog.create({
        professional: user._id,
        action: 'register',
        actorType: 'professional',
        ipAddress: clientIp,
        userAgent: req.headers['user-agent'],
        details: { alias, registrationMode: 'express', viaGoogle: true }
      }).catch((err) => console.error('Failed to log Google professional registration:', err.message));

      try {
        const adminEmail = config.payment?.adminEmail || 'admin@drsrv.net.ar';
        await sendEmail({
          email: adminEmail,
          subject: 'FullMinent - New Professional Registration (Google)',
          message: `Express registration via Google: ${email}\nAlias (temp): ${alias}\n\nComplete profile and upload gallery photos in Admin before approving.`
        });
      } catch (err) {
        console.error('Failed to notify admin:', err.message);
      }

      return sendTokenResponse(user, 200, res, { needsProfileCompletion: true });
    } else {
      const guestAlias = String(name).trim().slice(0, config.maxAliasLength || 50)
        || String(email).split('@')[0].replace(/\W/g, '').slice(0, config.maxAliasLength || 50)
        || 'guest';

      user = await User.create({
        name: guestAlias,
        email,
        password: crypto.randomBytes(16).toString('hex'),
        role: 'user',
        registrationMode: 'guest',
        isVerified: true,
        isEmailVerified: true,
        verificationStatus: 'approved'
      });

      const clientIp = getClientIp(req);
      await ActivityLog.create({
        professional: user._id,
        action: 'register',
        actorType: 'guest',
        isGuest: true,
        ipAddress: clientIp,
        userAgent: req.headers['user-agent'],
        details: { alias: guestAlias, registrationMode: 'guest', viaGoogle: true }
      }).catch((err) => console.error('Failed to log Google guest registration:', err.message));
    }

    sendTokenResponse(user, 200, res, { needsProfileCompletion: false });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: 'Google authentication failed: ' + error.message
    });
  }
};

// @desc    Complete express model profile after Google sign-in (phone + birth date)
// @route   POST /api/v1/auth/google/complete-profile
// @access  Private (JWT from Google sign-in)
exports.completeGoogleProfile = async (req, res) => {
  try {
    let { mobilePhone, birthDate } = req.body;
    const user = await User.findById(req.user.id);

    if (!user || user.role !== 'professional') {
      return res.status(400).json({ success: false, error: 'Professional account required.' });
    }

    if (!mobilePhone || !String(mobilePhone).trim()) {
      return res.status(400).json({ success: false, error: 'Mobile phone is required.' });
    }
    if (!birthDate || !String(birthDate).trim()) {
      return res.status(400).json({ success: false, error: 'Birth date is required.' });
    }

    const normalizedMobile = normalizeRegistrationMobilePhone(mobilePhone);
    if (normalizedMobile) mobilePhone = normalizedMobile;

    const age = ageFromBirthDate(birthDate);
    if (age === null || age < 18 || age > 99) {
      return res.status(400).json({ success: false, error: 'You must be at least 18 years old to register.' });
    }

    if (!user.professionalProfile) user.professionalProfile = {};
    user.professionalProfile.mobilePhone = mobilePhone;
    user.professionalProfile.whatsappNumber = mobilePhone;
    user.professionalProfile.birthDate = new Date(birthDate);
    user.professionalProfile.age = age;
    await user.save();

    sendTokenResponse(user, 200, res, { needsProfileCompletion: false });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message || 'Could not save profile.' });
  }
};

// @desc    Log out user / clear auth cookie
// @route   POST /api/v1/auth/logout
// @access  Public (clears httpOnly cookie; Bearer optional)
exports.logout = (req, res) => {
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
    ...(process.env.NODE_ENV === 'production' && { secure: true })
  });
  res.status(200).json({ success: true });
};

// Get token from model, create cookie and send response
const sendTokenResponse = (user, statusCode, res, options = {}) => {
  // Create token
  const token = user.getSignedJwtToken();

  const cookieOptions = {
    expires: new Date(Date.now() + process.env.JWT_COOKIE_EXPIRE * 24 * 60 * 60 * 1000),
    httpOnly: true
  };

  if (process.env.NODE_ENV === 'production') {
    cookieOptions.secure = true;
  }

  const payload = {
    success: true,
    token,
    user
  };
  if (options.needsProfileCompletion === true) {
    payload.needsProfileCompletion = true;
  } else if (options.needsProfileCompletion === false) {
    payload.needsProfileCompletion = false;
  }
  if (Array.isArray(options.certExpiryWarnings) && options.certExpiryWarnings.length) {
    payload.certExpiryWarnings = options.certExpiryWarnings;
  }

  res
    .status(statusCode)
    .cookie('token', token, cookieOptions)
    .json(payload);
};