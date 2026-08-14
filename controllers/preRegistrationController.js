const PreRegistration = require('../models/PreRegistration');
const User = require('../models/User');
const config = require('../config/appConfig');
const sendEmail = require('../sendEmail');
const fs = require('fs');
const path = require('path');
const { sendSms } = require('../services/smsService');
const { OAuth2Client } = require('google-auth-library');
const { decodeDniBarcode, parseDniDate, calculateAge } = require('../utils/dniBarcode');
const bcrypt = require('bcryptjs');
const { assignGpsToLocation } = require('../utils/cityCoordinates');
const jwt = require('jsonwebtoken');

function normalizePhone(phone) {
  return phone.replace(/[\s\-\+\(\)]/g, '').replace(/^0+/, '');
}

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function getExpireAt() {
  return new Date(Date.now() + config.verificationCodeExpireMinutes * 60 * 1000);
}

const sendTokenResponse = (user, statusCode, res) => {
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '30d'
  });
  const cookieOptions = {
    expires: new Date(Date.now() + (process.env.JWT_COOKIE_EXPIRE || 30) * 24 * 60 * 60 * 1000),
    httpOnly: true
  };
  if (process.env.NODE_ENV === 'production') cookieOptions.secure = true;
  res.status(statusCode).cookie('token', token, cookieOptions).json({ success: true, token, user });
};

// Step 1: Submit email + phone -> send SMS code
exports.startPreRegistration = async (req, res) => {
  try {
    const { email, phone } = req.body;
    if (!email || !phone) {
      return res.status(400).json({ error: 'Email y telefono son requeridos.' });
    }
    const emailLower = email.trim().toLowerCase();
    const existingUser = await User.findOne({ email: emailLower });
    if (existingUser) {
      return res.status(400).json({ error: 'Este email ya esta registrado.' });
    }
    await PreRegistration.deleteMany({ email: emailLower, step: { $nin: ['complete'] } });
    const normalizedPhone = normalizePhone(phone);
    const code = generateCode();
    const expiresAt = getExpireAt();
    const result = await sendSms({
      to: normalizedPhone,
      body: 'KuraTe: tu codigo de verificacion es ' + code + '. Valido por ' + config.verificationCodeExpireMinutes + ' minutos.'
    });
    if (!result.ok) {
      return res.status(500).json({ error: 'No pudimos enviar el SMS. Verifica el numero.' });
    }
    const prereg = await PreRegistration.create({
      email: emailLower,
      phone: normalizedPhone,
      phoneCode: code,
      phoneCodeExpire: expiresAt,
      step: 'phone'
    });
    res.status(200).json({ id: prereg._id, message: 'Codigo SMS enviado.', expiresAt });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Step 2: Verify phone code -> send email code
exports.verifyPhone = async (req, res) => {
  try {
    const { id, code } = req.body;
    if (!id || !code || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Codigo invalido. Ingresa los 6 digitos.' });
    }
    const prereg = await PreRegistration.findById(id);
    if (!prereg) return res.status(404).json({ error: 'Sesion no encontrada.' });
    if (prereg.step !== 'phone') return res.status(400).json({ error: 'Paso incorrecto.' });
    if (Date.now() > new Date(prereg.phoneCodeExpire).getTime()) {
      await PreRegistration.deleteOne({ _id: prereg._id });
      return res.status(400).json({ error: 'Codigo expirado.' });
    }
    if (prereg.phoneCode !== code) return res.status(400).json({ error: 'Codigo incorrecto.' });
    const emailCode = generateCode();
    const emailExpiresAt = getExpireAt();
    await sendEmail({
      email: prereg.email,
      subject: 'KuraTe - Verifica tu email',
      message: 'Tu codigo de verificacion es: ' + emailCode + '\n\nValido por ' + config.verificationCodeExpireMinutes + ' minutos.\n\nKuraTe'
    });
    prereg.phoneVerified = true;
    prereg.phoneCode = undefined;
    prereg.phoneCodeExpire = undefined;
    prereg.emailCode = emailCode;
    prereg.emailCodeExpire = emailExpiresAt;
    prereg.step = 'email';
    await prereg.save();
    res.status(200).json({ message: 'Telefono verificado. Revisa tu email.', emailExpiresAt });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Step 3: Verify email code -> step=verified
exports.verifyEmail = async (req, res) => {
  try {
    const { id, code } = req.body;
    if (!id || !code || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Codigo invalido.' });
    }
    const prereg = await PreRegistration.findById(id);
    if (!prereg) return res.status(404).json({ error: 'Sesion no encontrada.' });
    if (prereg.step !== 'email') return res.status(400).json({ error: 'Paso incorrecto.' });
    if (Date.now() > new Date(prereg.emailCodeExpire).getTime()) {
      await PreRegistration.deleteOne({ _id: prereg._id });
      return res.status(400).json({ error: 'Codigo expirado.' });
    }
    if (prereg.emailCode !== code) return res.status(400).json({ error: 'Codigo incorrecto.' });
    prereg.emailVerified = true;
    prereg.emailCode = undefined;
    prereg.emailCodeExpire = undefined;
    prereg.step = 'verified';
    await prereg.save();
    res.status(200).json({ message: 'Email verificado. Ahora escanea tu DNI.', step: 'verified' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Alternative: verify email via Google sign-in
exports.verifyEmailViaGoogle = async (req, res) => {
  try {
    const { id, token } = req.body;
    if (!id || !token) return res.status(400).json({ error: 'Datos incompletos.' });
    const prereg = await PreRegistration.findById(id);
    if (!prereg) return res.status(404).json({ error: 'Sesion no encontrada.' });
    if (prereg.step !== 'email') return res.status(400).json({ error: 'Paso incorrecto.' });
    const clientId = process.env.GOOGLE_CLIENT_ID || config.google?.clientId;
    if (!clientId) return res.status(500).json({ error: 'Google sign-in no disponible.' });
    const googleClient = new OAuth2Client(clientId);
    const ticket = await googleClient.verifyIdToken({ idToken: token, audience: clientId });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) return res.status(400).json({ error: 'No se pudo verificar con Google.' });
    if (payload.email.toLowerCase() !== prereg.email.toLowerCase()) {
      return res.status(400).json({ error: 'El email de Google no coincide.' });
    }
    prereg.emailVerified = true;
    prereg.emailCode = undefined;
    prereg.emailCodeExpire = undefined;
    prereg.step = 'verified';
    await prereg.save();
    res.status(200).json({ message: 'Email verificado con Google. Ahora escanea tu DNI.', step: 'verified' });
  } catch (error) {
    res.status(400).json({ error: 'Error verificando con Google.' });
  }
};

// Resend current step code
exports.resendCode = async (req, res) => {
  try {
    const { id } = req.body;
    const prereg = await PreRegistration.findById(id);
    if (!prereg) return res.status(404).json({ error: 'Sesion no encontrada.' });
    if (['verified', 'dni', 'complete'].includes(prereg.step)) {
      return res.status(400).json({ error: 'Ya verificaste todos los codigos.' });
    }
    const code = generateCode();
    const expiresAt = getExpireAt();
    if (prereg.step === 'phone') {
      const result = await sendSms({
        to: prereg.phone,
        body: 'KuraTe: tu codigo de verificacion es ' + code + '. Valido por ' + config.verificationCodeExpireMinutes + ' minutos.'
      });
      if (!result.ok) return res.status(500).json({ error: 'No pudimos enviar el SMS.' });
      prereg.phoneCode = code;
      prereg.phoneCodeExpire = expiresAt;
    } else if (prereg.step === 'email') {
      await sendEmail({
        email: prereg.email,
        subject: 'KuraTe - Verifica tu email',
        message: 'Tu codigo de verificacion es: ' + code + '\n\nValido por ' + config.verificationCodeExpireMinutes + ' minutos.\n\nKuraTe'
      });
      prereg.emailCode = code;
      prereg.emailCodeExpire = expiresAt;
    }
    await prereg.save();
    res.status(200).json({ message: 'Codigo reenviado.', expiresAt });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Step 4: Scan DNI barcode (PDF417)
exports.scanDni = async (req, res) => {
  try {
    const { id, image } = req.body;
    if (!id || !image) return res.status(400).json({ error: 'Faltan datos.' });
    const prereg = await PreRegistration.findById(id);
    if (!prereg) return res.status(404).json({ error: 'Sesion no encontrada.' });
    if (!['verified', 'dni'].includes(prereg.step)) {
      return res.status(400).json({ error: 'Completa la verificacion de email primero.' });
    }
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    const result = await decodeDniBarcode(imageBuffer);
    if (!result.success) {
      return res.status(400).json({ error: result.error, raw: result.raw });
    }
    const dni = result.data;
    if (!dni.apellido || !dni.nombre || !dni.dni) {
      return res.status(400).json({ error: 'El codigo de barras no contiene los datos minimos del DNI.' });
    }
    const age = calculateAge(dni.fechaNacimiento);
    if (age !== null && age < 18) {
      return res.status(400).json({ error: 'Segun el DNI, sos menor de 18 anios.' });
    }
    prereg.step = 'dni';
    prereg.dniFrontImage = image;
    prereg.dniNumeroTramite = dni.dni || '';
    prereg.dniApellido = dni.apellido;
    prereg.dniNombre = dni.nombre;
    prereg.dniSegundoNombre = dni.segundoNombre || '';
    prereg.dniFechaNacimiento = dni.fechaNacimiento;
    prereg.dniFechaEmision = dni.fechaEmision;
    prereg.firstName = dni.nombre;
    prereg.surname = dni.apellido;
    prereg.middleName = dni.segundoNombre || '';
    await prereg.save();
    res.status(200).json({
      message: 'DNI escaneado correctamente.',
      dni: { apellido: dni.apellido, nombre: dni.nombre, segundoNombre: dni.segundoNombre || '', dni: dni.dni, fechaNacimiento: dni.fechaNacimiento, fechaEmision: dni.fechaEmision, age: age },
      step: 'dni'
    });
  } catch (error) {
    console.error('DNI scan error:', error);
    res.status(400).json({ error: 'Error procesando la imagen del DNI.' });
  }
};

// Step 5: Complete registration -> create User -> return JWT
exports.complete = async (req, res) => {
  try {
    const { id, password, role, alias, bio, street, number, floor, apartment, postalCode, province, city, neighborhood, services, height, measurements, originCountry, instagram, facebook } = req.body;
    if (!id || !password) return res.status(400).json({ error: 'Faltan datos requeridos.' });
    if (password.length < 6) return res.status(400).json({ error: 'La password debe tener al menos 6 caracteres.' });
    const prereg = await PreRegistration.findById(id).select('+password');
    if (!prereg) return res.status(404).json({ error: 'Sesion no encontrada.' });
    if (prereg.step !== 'dni') return res.status(400).json({ error: 'Escanea tu DNI primero.' });
    if (!prereg.emailVerified || !prereg.phoneVerified) {
      return res.status(400).json({ error: 'Completa la verificacion de email y telefono.' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const userRole = role || 'professional';
    const parsedBirthDate = parseDniDate(prereg.dniFechaNacimiento);
    const user = await User.create({
      email: prereg.email,
      password: hashedPassword,
      role: userRole,
      isEmailVerified: true,
      isVerified: userRole !== 'professional',
      verificationStatus: userRole === 'professional' ? 'pending' : 'approved',
      phoneVerified: true,
      registrationMode: 'pre-registration',
      professionalProfile: userRole === 'professional' ? {
        firstName: prereg.firstName || prereg.dniNombre,
        surname: prereg.surname || prereg.dniApellido,
        middleName: prereg.middleName || prereg.dniSegundoNombre || '',
        idNumber: prereg.dniNumeroTramite,
        birthDate: parsedBirthDate ? new Date(parsedBirthDate) : undefined,
        mobilePhone: prereg.phone,
        alias: alias || '',
        bio: bio || '',
        expressRegistration: false,
        location: assignGpsToLocation({ province: province || '', city: city || '', neighborhood: neighborhood || '', street: street || '', number: number || '', floor: floor || '', apartment: apartment || '', postalCode: postalCode || '' }),
        services: services || [],
        height: height || '',
        measurements: measurements || '',
        instagram: instagram || '',
        facebook: facebook || '',
        originCountry: originCountry || ''
      } : undefined,
      hogarProfile: userRole === 'user' ? {
        firstName: prereg.firstName || prereg.dniNombre,
        lastName: prereg.surname || prereg.dniApellido,
        taxId: prereg.dniNumeroTramite,
        birthDate: parsedBirthDate ? new Date(parsedBirthDate) : undefined
      } : undefined
    });
    await PreRegistration.deleteOne({ _id: prereg._id });
    sendTokenResponse(user, 201, res);
  } catch (error) {
    console.error('Pre-registration complete error:', error);
    res.status(400).json({ error: error.message });
  }
};

// Get pre-registration status
exports.getStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const prereg = await PreRegistration.findById(id);
    if (!prereg) return res.status(404).json({ error: 'No encontrada.' });
    res.status(200).json({
      step: prereg.step,
      email: prereg.email,
      phone: prereg.phone,
      emailVerified: prereg.emailVerified,
      phoneVerified: prereg.phoneVerified,
      dniApellido: prereg.dniApellido || '',
      dniNombre: prereg.dniNombre || ''
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
