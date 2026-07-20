const PreRegistration = require('../models/PreRegistration');
const User = require('../models/User');
const config = require('../config/appConfig');
const sendEmail = require('../sendEmail');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { sendSms } = require('../services/smsService');
const { OAuth2Client } = require('google-auth-library');
const { validateDniFront } = require('../utils/dniOcr');

function normalizePhone(phone) {
  return phone.replace(/[\s\-\+\(\)]/g, '').replace(/^0+/, '');
}

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

// Step 1: Submit email + phone + DOB → send SMS code
exports.startPreRegistration = async (req, res, next) => {
  try {
    const { email, phone, dateOfBirth, password } = req.body;

    if (!email || !phone || !dateOfBirth) {
      return res.status(400).json({ error: 'Email, teléfono y fecha de nacimiento son requeridos.' });
    }

    const age = ageFromBirthDate(dateOfBirth);
    if (age === null || age < 18) {
      return res.status(400).json({ error: 'Debés ser mayor de 18 años.' });
    }

    const emailLower = email.trim().toLowerCase();

    const existingUser = await User.findOne({ email: emailLower });
    if (existingUser) {
      return res.status(400).json({ error: 'Este email ya está registrado.' });
    }

    const existing = await PreRegistration.findOne({ email: emailLower, step: { $ne: 'complete' } });
    if (existing) {
      await PreRegistration.deleteOne({ _id: existing._id });
    }

    const normalizedPhone = normalizePhone(phone);

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + config.verificationCodeExpireMinutes * 60 * 1000);

    const result = await sendSms({
      to: normalizedPhone,
      body: `KuraTe: tu código de verificación es ${code}. Válido por ${config.verificationCodeExpireMinutes} minutos.`
    });

    if (!result.ok) {
      return res.status(500).json({ error: 'No pudimos enviar el SMS. Verificá el número.' });
    }

    const preregData = {
      email: emailLower,
      phone: normalizedPhone,
      dateOfBirth: new Date(dateOfBirth),
      phoneCode: code,
      phoneCodeExpire: expiresAt,
      step: 'phone'
    };
    if (password && password.length >= 6) {
      const bcrypt = require('bcryptjs');
      preregData.password = await bcrypt.hash(password, 10);
    }

    const prereg = await PreRegistration.create(preregData);

    res.status(200).json({
      id: prereg._id,
      message: 'Código SMS enviado.',
      expiresAt
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Step 2: Verify phone code → send email code
exports.verifyPhone = async (req, res, next) => {
  try {
    const { id, code } = req.body;

    if (!id || !code || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Código inválido. Ingresá los 6 dígitos.' });
    }

    const prereg = await PreRegistration.findById(id);
    if (!prereg) {
      return res.status(404).json({ error: 'Sesión no encontrada. Empezá de nuevo.' });
    }

    if (prereg.step !== 'phone') {
      return res.status(400).json({ error: 'Paso incorrecto.' });
    }

    if (Date.now() > new Date(prereg.phoneCodeExpire).getTime()) {
      await PreRegistration.deleteOne({ _id: prereg._id });
      return res.status(400).json({ error: 'Código expirado. Empezá de nuevo.' });
    }

    if (prereg.phoneCode !== code) {
      return res.status(400).json({ error: 'Código incorrecto.' });
    }

    const emailCode = Math.floor(100000 + Math.random() * 900000).toString();
    const emailExpiresAt = new Date(Date.now() + config.verificationCodeExpireMinutes * 60 * 1000);

    await sendEmail({
      email: prereg.email,
      subject: 'KuraTe — Verificá tu email',
      message: `Tu código de verificación es: ${emailCode}\n\nVálido por ${config.verificationCodeExpireMinutes} minutos.\n\nKuraTe`
    });

    prereg.phoneVerified = true;
    prereg.phoneCode = undefined;
    prereg.phoneCodeExpire = undefined;
    prereg.emailCode = emailCode;
    prereg.emailCodeExpire = emailExpiresAt;
    prereg.step = 'email';
    await prereg.save();

    res.status(200).json({
      message: 'Teléfono verificado. Revisá tu email.',
      emailExpiresAt
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Step 3: Verify email code → complete
exports.verifyEmail = async (req, res, next) => {
  try {
    const { id, code } = req.body;

    if (!id || !code || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Código inválido. Ingresá los 6 dígitos.' });
    }

    const prereg = await PreRegistration.findById(id);
    if (!prereg) {
      return res.status(404).json({ error: 'Sesión no encontrada. Empezá de nuevo.' });
    }

    if (prereg.step !== 'email') {
      return res.status(400).json({ error: 'Paso incorrecto.' });
    }

    if (Date.now() > new Date(prereg.emailCodeExpire).getTime()) {
      await PreRegistration.deleteOne({ _id: prereg._id });
      return res.status(400).json({ error: 'Código expirado. Empezá de nuevo.' });
    }

    if (prereg.emailCode !== code) {
      return res.status(400).json({ error: 'Código incorrecto.' });
    }

    prereg.emailVerified = true;
    prereg.emailCode = undefined;
    prereg.emailCodeExpire = undefined;
    prereg.step = 'complete';
    await prereg.save();

    res.status(200).json({
      message: 'Email verificado.',
      email: prereg.email,
      phone: prereg.phone
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Alternative: verify email via Google sign-in
exports.verifyEmailViaGoogle = async (req, res, next) => {
  try {
    const { id, token } = req.body;

    if (!id || !token) {
      return res.status(400).json({ error: 'Datos incompletos.' });
    }

    const prereg = await PreRegistration.findById(id);
    if (!prereg) {
      return res.status(404).json({ error: 'Sesión no encontrada. Empezá de nuevo.' });
    }

    if (prereg.step !== 'email') {
      return res.status(400).json({ error: 'Paso incorrecto.' });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID || config.google?.clientId;
    if (!clientId) {
      return res.status(500).json({ error: 'Google sign-in no disponible.' });
    }

    const googleClient = new OAuth2Client(clientId);
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: clientId
    });
    const payload = ticket.getPayload();

    if (!payload || !payload.email) {
      return res.status(400).json({ error: 'No se pudo verificar con Google.' });
    }

    if (payload.email.toLowerCase() !== prereg.email.toLowerCase()) {
      return res.status(400).json({ error: 'El email de Google no coincide con el ingresado.' });
    }

    prereg.emailVerified = true;
    prereg.emailCode = undefined;
    prereg.emailCodeExpire = undefined;
    prereg.step = 'complete';
    await prereg.save();

    res.status(200).json({
      message: 'Email verificado con Google.',
      email: prereg.email,
      phone: prereg.phone
    });
  } catch (error) {
    res.status(400).json({ error: 'Error verificando con Google.' });
  }
};

// Resend current step code
exports.resendCode = async (req, res, next) => {
  try {
    const { id } = req.body;

    const prereg = await PreRegistration.findById(id);
    if (!prereg) {
      return res.status(404).json({ error: 'Sesión no encontrada.' });
    }

    if (prereg.step === 'complete') {
      return res.status(400).json({ error: 'Ya está completo.' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + config.verificationCodeExpireMinutes * 60 * 1000);

    if (prereg.step === 'phone') {
      const result = await sendSms({
        to: prereg.phone,
        body: `KuraTe: tu código de verificación es ${code}. Válido por ${config.verificationCodeExpireMinutes} minutos.`
      });
      if (!result.ok) {
        return res.status(500).json({ error: 'No pudimos enviar el SMS.' });
      }
      prereg.phoneCode = code;
      prereg.phoneCodeExpire = expiresAt;
    } else {
      await sendEmail({
        email: prereg.email,
        subject: 'KuraTe — Verificá tu email',
        message: `Tu código de verificación es: ${code}\n\nVálido por ${config.verificationCodeExpireMinutes} minutos.\n\nKuraTe`
      });
      prereg.emailCode = code;
      prereg.emailCodeExpire = expiresAt;
    }

    await prereg.save();
    res.status(200).json({ message: 'Código reenviado.', expiresAt });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Step 5: Validate DNI front photo via OCR
exports.validateDniPhoto = async (req, res, next) => {
  try {
    const { id, image } = req.body;

    if (!id || !image) {
      return res.status(400).json({ error: 'Faltan datos.' });
    }

    const prereg = await PreRegistration.findById(id);
    if (!prereg) {
      return res.status(404).json({ error: 'Sesión no encontrada.' });
    }

    if (prereg.step !== 'complete' && prereg.step !== 'dni') {
      return res.status(400).json({ error: 'Completá primero la verificación.' });
    }

    // Save image temporarily
    const tmpDir = path.join(__dirname, '..', 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, `dni_${prereg._id}_${Date.now()}.png`);

    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(tmpFile, base64Data, 'base64');

    const result = await validateDniFront(tmpFile, prereg.dateOfBirth);

    // Clean up temp file
    fs.unlink(tmpFile, () => {});

    if (!result.valid) {
      return res.status(400).json(result);
    }

    // Save that DNI was validated
    prereg.step = 'dni';
    prereg.dniFrontValidated = true;
    await prereg.save();

    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error: 'Error procesando la imagen.' });
  }
};

// Get pre-registration status
exports.getStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const prereg = await PreRegistration.findById(id);
    if (!prereg) return res.status(404).json({ error: 'No encontrada.' });
    res.status(200).json({
      step: prereg.step,
      email: prereg.email,
      phone: prereg.phone,
      dateOfBirth: prereg.dateOfBirth,
      emailVerified: prereg.emailVerified,
      phoneVerified: prereg.phoneVerified
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
