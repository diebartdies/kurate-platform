const PreRegistration = require('../models/PreRegistration');
const User = require('../models/User');
const config = require('../config/appConfig');
const sendEmail = require('../sendEmail');
const fs = require('fs');
const path = require('path');
const { sendSms } = require('../services/smsService');
const { OAuth2Client } = require('google-auth-library');
const crypto = require('crypto');
const { decodeDniBarcode, parseDniDate, calculateAge } = require('../utils/dniBarcode');
const { rollbackUserByRegistrationPreId } = require('../utils/pendingRegistration');
const { findUserByPhone } = require('../utils/userIdentity');
const Specialty = require('../models/Specialty');
const ActivityLog = require('../models/ActivityLog');
const { getClientIp } = require('../utils/clientIp');
function normalizeAlias(s){ if(!s) return s; return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim(); }
const { assignGpsToLocation } = require('../utils/cityCoordinates');
const jwt = require('jsonwebtoken');

// ---------------------------------------------------------------------------
// Registro transaccional
//
// Toda la cuenta se escribe en UN solo insert (documento completo), asi que no
// puede quedar a medias. Alrededor:
//   - idempotencia por registrationPreId (reintentar no duplica)
//   - timeout duro: si el insert no contesta a tiempo se busca la cuenta por la
//     clave; si no quedo escrita, no se registro nada y se responde 504
//   - rollback compensatorio si falla algo despues del insert
// ---------------------------------------------------------------------------
const REGISTRATION_TIMEOUT_MS = parseInt(process.env.REGISTRATION_TIMEOUT_MS, 10) || 20000;
const POST_COMMIT_TIMEOUT_MS = parseInt(process.env.POST_COMMIT_TIMEOUT_MS, 10) || 8000;

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${label} timed out after ${ms}ms`);
      err.code = 'REGISTRATION_TIMEOUT';
      reject(err);
    }, ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

function isTimeoutError(err) {
  return Boolean(err && (err.code === 'REGISTRATION_TIMEOUT' || /timed out/i.test(err.message || '')));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Efectos secundarios del alta (best-effort, con timeout propio). Ninguno de
// estos puede impedir que la cuenta quede creada: se corren con allSettled.
// ---------------------------------------------------------------------------
async function syncSpecialties(user) {
  if (user.role !== 'professional') return;
  const services = user.professionalProfile?.services || [];
  if (!services.length) return;
  await Specialty.deleteMany({ user: user._id });
  await Specialty.insertMany(services.map((s) => ({ user: user._id, specialty: s })))
    .catch((err) => console.error('Failed to sync specialties table:', err.message));
}

async function logRegistration(user, req) {
  await ActivityLog.create({
    professional: user._id,
    action: 'register',
    actorType: user.role === 'professional' ? 'professional' : 'user',
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
    details: {
      registrationMode: 'pre-registration',
      dniVerificationSource: user.dniVerificationSource,
      dniNeedsManualReview: user.dniNeedsManualReview,
      age: user.professionalProfile?.age
    }
  });
}

async function notifyAdminNewRegistration(user) {
  const adminEmail = config.payment?.adminEmail || 'admin@drsrv.net.ar';
  const prof = user.professionalProfile || {};
  const lines = [
    'Nuevo registro verificado (email + SMS + DNI).',
    `Email: ${user.email}`,
    `Telefono: ${prof.mobilePhone || '-'}`,
    `Nombre: ${[prof.firstName, prof.surname].filter(Boolean).join(' ') || '-'}`,
    `DNI: ${prof.idNumber || '-'}`,
    `Edad: ${prof.age == null ? '-' : prof.age}`,
    `DNI leido: ${user.dniVerificationSource === 'barcode' ? 'codigo de barras (PDF417)' : 'MANUAL (revisar foto)'}`
  ];
  if (user.dniNeedsManualReview) {
    lines.push('', 'ATENCION: no se pudo leer el codigo de barras. Revisar la foto del DNI antes de aprobar.');
  }
  await sendEmail({
    email: adminEmail,
    subject: 'KuraTe - Nuevo profesional registrado',
    message: lines.join('\n')
  });
}

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
  // Signed through the model so the token carries tokenVersion like every other
  // auth path — an admin password reset must be able to revoke these tokens too.
  const token = user.getSignedJwtToken();
  const cookieOptions = {
    expires: new Date(Date.now() + (process.env.JWT_COOKIE_EXPIRE || 30) * 24 * 60 * 60 * 60 * 1000),
    httpOnly: true
  };
  if (process.env.NODE_ENV === 'production') cookieOptions.secure = true;

  // The user was just built in memory, so it still carries the raw base64 ID image
  // that `select: false` would normally hide. Never ship it to the browser.
  const safeUser = user.toObject ? user.toObject() : { ...user };
  if (Array.isArray(safeUser.verificationDocuments)) {
    safeUser.verificationDocumentsCount = safeUser.verificationDocuments.length;
    delete safeUser.verificationDocuments;
  }

  res.status(statusCode).cookie('token', token, cookieOptions).json({ success: true, token, user: safeUser });
};

// Step 1: Submit email + phone -> send SMS code
exports.startPreRegistration = async (req, res) => {
  try {
    const { email, phone } = req.body;
    if (!email || !phone) {
      return res.status(400).json({ error: 'Email y telefono son requeridos.' });
    }
    const emailLower = email.trim().toLowerCase();
    const normalizedPhone = normalizePhone(phone);

    // Email unico: lo garantiza el indice unique del schema, pero se avisa aca
    // antes de mandar el SMS (evita gastar un mensaje en un alta imposible).
    const existingUser = await User.findOne({ email: emailLower }).select('_id');
    if (existingUser) {
      return res.status(409).json({
        code: 'EMAIL_ALREADY_REGISTERED',
        error: 'Este email ya esta registrado. Inicia sesion o recupera tu cuenta.'
      });
    }

    // Telefono unico: una persona no puede tener dos cuentas con el mismo
    // numero, sin importar el formato en que se haya guardado.
    const phoneOwner = await findUserByPhone(normalizedPhone);
    if (phoneOwner) {
      return res.status(409).json({
        code: 'PHONE_ALREADY_REGISTERED',
        error: 'Este telefono ya esta registrado en otra cuenta. Si es tu cuenta, inicia sesion; si no, usa otro numero.'
      });
    }

    // Drafts viejos de este email o telefono: se descartan para que el wizard no
    // retome una sesion abandonada.
    await PreRegistration.deleteMany({
      $or: [{ email: emailLower }, { phone: normalizedPhone }],
      step: { $nin: ['complete'] }
    });
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
    prereg.emailVerifiedViaGoogle = true;
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

// Step 4 bis: DNI data entered by hand when the PDF417 barcode can't be read.
// The photo is still stored (verificationDocuments) and the record is flagged
// as manual so admin can review it; without this path a blurry photo left the
// registration stuck in an endless "upload the DNI again" loop.
exports.submitDniManual = async (req, res) => {
  try {
    const { id, image, nombre, apellido, dni, fechaNacimiento } = req.body;
    if (!id) return res.status(400).json({ error: 'Faltan datos.' });
    const prereg = await PreRegistration.findById(id);
    if (!prereg) return res.status(404).json({ error: 'Sesion no encontrada.' });
    if (!['verified', 'dni'].includes(prereg.step)) {
      return res.status(400).json({ error: 'Completa la verificacion de email primero.' });
    }

    const cleanNombre = String(nombre || '').trim();
    const cleanApellido = String(apellido || '').trim();
    const cleanDni = String(dni || '').replace(/[^\d]/g, '');
    const cleanFecha = String(fechaNacimiento || '').trim();

    if (!cleanNombre || !cleanApellido) {
      return res.status(400).json({ error: 'Ingresa nombre y apellido.' });
    }
    if (cleanDni.length < 7 || cleanDni.length > 8) {
      return res.status(400).json({ error: 'El numero de DNI debe tener 7 u 8 digitos.' });
    }
    if (!parseDniDate(cleanFecha)) {
      return res.status(400).json({ error: 'La fecha de nacimiento debe ser DD/MM/AAAA.' });
    }
    const age = calculateAge(cleanFecha);
    if (age === null) {
      return res.status(400).json({ error: 'Fecha de nacimiento invalida.' });
    }
    if (age < 18) {
      return res.status(400).json({ error: 'Segun el DNI, sos menor de 18 anios.' });
    }
    if (age > 110) {
      return res.status(400).json({ error: 'Revisa la fecha de nacimiento.' });
    }

    if (image) prereg.dniFrontImage = image;
    prereg.dniNumeroTramite = cleanDni;
    prereg.dniApellido = cleanApellido;
    prereg.dniNombre = cleanNombre;
    prereg.dniFechaNacimiento = cleanFecha;
    prereg.dniVerifiedManually = true;
    prereg.firstName = cleanNombre;
    prereg.surname = cleanApellido;
    prereg.step = 'dni';
    await prereg.save();

    res.status(200).json({
      message: 'Datos del DNI guardados. Podes completar tu perfil.',
      manual: true,
      dni: {
        apellido: cleanApellido,
        nombre: cleanNombre,
        dni: cleanDni,
        fechaNacimiento: parseDniDate(cleanFecha),
        age
      },
      step: 'dni'
    });
  } catch (error) {
    console.error('DNI manual error:', error);
    res.status(400).json({ error: 'Error guardando los datos del DNI.' });
  }
};

// Step 5: Complete registration -> create User -> return JWT
//
// TRANSACCIONAL: la cuenta entera se escribe en un unico insert. Si el insert
// no termina (timeout / caida) no queda nada a medias: se reconcilia por la
// clave de idempotencia y, si no quedo escrita, se responde 504 sin cuenta.
exports.complete = async (req, res) => {
  try {
    let { id, password, passwordConfirm, role, alias, bio, street, number, floor, apartment, postalCode, province, city, neighborhood, services, height, measurements, originCountry, instagram, facebook } = req.body;
    alias = normalizeAlias(alias);
    if (!id) return res.status(400).json({ error: 'Faltan datos requeridos.' });

    const prereg = await PreRegistration.findById(id).catch(() => null);
    if (!prereg) return res.status(404).json({ error: 'Sesion no encontrada.' });

    // Idempotencia: un reintento (doble click, timeout del cliente, refresh)
    // devuelve la cuenta ya creada en vez de duplicarla.
    const alreadyCreated = await User.findOne({ registrationPreId: prereg._id });
    if (alreadyCreated) {
      return sendTokenResponse(alreadyCreated, 200, res);
    }
    if (prereg.step === 'complete') {
      // El draft quedo marcado como completo pero la cuenta ya no existe (por
      // ejemplo, la borro un admin): se deja seguir y se recrea. Si existiera,
      // el chequeo de idempotencia de arriba ya habria respondido.
      prereg.step = 'dni';
    }

    if (prereg.step !== 'dni') return res.status(400).json({ error: 'Escanea tu DNI primero.' });
    if (!prereg.emailVerified || !prereg.phoneVerified) {
      return res.status(400).json({ error: 'Completa la verificacion de email y telefono.' });
    }

    // Quien verifico el email con Google no crea contrasena: la cuenta entra
    // con Google (mismo criterio que authController.googleAuth, que guarda un
    // hash aleatorio que el usuario nunca ve).
    const usedGoogle = !!prereg.emailVerifiedViaGoogle;
    if (!usedGoogle) {
      if (!password) return res.status(400).json({ error: 'Faltan datos requeridos.' });
      if (password.length < 6) return res.status(400).json({ error: 'La password debe tener al menos 6 caracteres.' });
      // La confirmacion se valida tambien aca: el cliente puede estar salteado.
      if (typeof passwordConfirm !== 'string' || password !== passwordConfirm) {
        return res.status(400).json({ error: 'Las passwords no coinciden.' });
      }
    }

    // Solo professional o user: nunca se acepta un rol arbitrario del body.
    const userRole = role === 'user' ? 'user' : 'professional';
    const parsedBirthDate = parseDniDate(prereg.dniFechaNacimiento);
    // Edad calculada a partir de la fecha del DNI (barcode o carga manual).
    const age = parsedBirthDate ? calculateAge(prereg.dniFechaNacimiento) : null;
    if (age !== null && age < 18) {
      return res.status(400).json({ error: 'Segun el DNI, sos menor de 18 anios.' });
    }
    const manualDni = !!prereg.dniVerifiedManually;
    const dniNeedsManualReview = manualDni || !prereg.dniFrontImage;

    // Antes del insert: email y telefono tienen que seguir libres. Cubre dos
    // sesiones de pre-registro en paralelo y el caso de una cuenta creada entre
    // el paso 1 y este paso.
    const emailTaken = await User.findOne({
      email: prereg.email,
      registrationPreId: { $ne: prereg._id }
    }).select('_id');
    if (emailTaken) {
      return res.status(409).json({
        code: 'EMAIL_ALREADY_REGISTERED',
        error: 'Este email ya esta registrado. Inicia sesion o recupera tu cuenta.'
      });
    }
    const phoneTaken = await findUserByPhone(prereg.phone);
    if (phoneTaken) {
      return res.status(409).json({
        code: 'PHONE_ALREADY_REGISTERED',
        error: 'Este telefono ya esta registrado en otra cuenta. Si es tu cuenta, inicia sesion; si no, usa otro numero.'
      });
    }

    // Nombre visible de la cuenta (lo usan admin, soporte y notificaciones como
    // fallback cuando no hay alias).
    const fullName = [prereg.firstName || prereg.dniNombre, prereg.surname || prereg.dniApellido]
      .filter(Boolean).join(' ').trim();

    // Documento completo: TODO el alta viaja en este unico insert.
    const userPayload = {
      email: prereg.email,
      name: fullName || undefined,
      password: password || crypto.randomBytes(16).toString('hex'),
      role: userRole,
      isEmailVerified: true,
      isVerified: userRole !== 'professional',
      verificationStatus: userRole === 'professional' ? 'pending' : 'approved',
      verificationDocuments: prereg.dniFrontImage ? [prereg.dniFrontImage] : [],
      verificationDocumentsCount: prereg.dniFrontImage ? 1 : 0,
      phoneVerified: true,
      registrationMode: 'pre-registration',
      registrationPreId: prereg._id,
      dniVerificationSource: manualDni ? 'manual' : 'barcode',
      dniNeedsManualReview,
      professionalProfile: userRole === 'professional' ? {
        firstName: prereg.firstName || prereg.dniNombre,
        surname: prereg.surname || prereg.dniApellido,
        middleName: prereg.middleName || prereg.dniSegundoNombre || '',
        idNumber: prereg.dniNumeroTramite,
        birthDate: parsedBirthDate ? new Date(parsedBirthDate) : undefined,
        age: age === null ? undefined : age,
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
        birthDate: parsedBirthDate ? new Date(parsedBirthDate) : undefined,
        // El telefono verificado por SMS se guarda para mostrarlo en el perfil.
        contact: { mobilePhone: prereg.phone }
      } : undefined
    };

    let user;
    try {
      user = await withTimeout(User.create(userPayload), REGISTRATION_TIMEOUT_MS, 'User.create');
    } catch (insertError) {
      // Duplicado por la clave de idempotencia: otro intento ya la creo.
      if (insertError && insertError.code === 11000) {
        const existing = await User.findOne({ registrationPreId: prereg._id });
        if (existing) return sendTokenResponse(existing, 200, res);
      }
      if (isTimeoutError(insertError)) {
        // El insert puede haber quedado en vuelo: esperamos un momento y
        // buscamos la cuenta. Si no esta, no se registro nada.
        await sleep(1500);
        const late = await User.findOne({ registrationPreId: prereg._id });
        if (late) return sendTokenResponse(late, 200, res);
        // Reconciliacion final: si aparecio entre el timeout y ahora, se borra.
        await rollbackUserByRegistrationPreId(prereg._id).catch(() => {});
        await sleep(500);
        const ghost = await User.findOne({ registrationPreId: prereg._id });
        if (ghost) await rollbackUserByRegistrationPreId(prereg._id).catch(() => {});
        console.error('Pre-registration timeout: no se creo la cuenta', prereg._id);
        return res.status(504).json({
          error: 'El registro tardo demasiado y no se creo ninguna cuenta. Reintenta.',
          retryable: true
        });
      }
      // Cualquier otro fallo del insert: no quedo nada escrito (insert atomico
      // de un solo documento), se informa y se puede reintentar.
      console.error('Pre-registration insert error:', insertError);
      await rollbackUserByRegistrationPreId(prereg._id).catch(() => {});
      const message = insertError && insertError.code === 11000
        ? 'Este email ya esta registrado.'
        : (insertError.message || 'No se pudo crear la cuenta.');
      return res.status(400).json({ error: message });
    }

    // A partir de aca la cuenta YA existe. Nada de lo que sigue puede borrarla
    // por un fallo accesorio: los efectos secundarios son best-effort.

    // Carrera entre dos altas simultaneas: la que quedo segunda detecta a la
    // primera (los ObjectId ordenan por creacion) y se revierte, para que el
    // telefono quede asociado a una sola cuenta.
    try {
      const phoneConflict = await findUserByPhone(prereg.phone, { excludeUserId: user._id });
      if (phoneConflict && String(phoneConflict._id) < String(user._id)) {
        await rollbackUserByRegistrationPreId(prereg._id);
        return res.status(409).json({
          code: 'PHONE_ALREADY_REGISTERED',
          error: 'Este telefono ya esta registrado en otra cuenta. Si es tu cuenta, inicia sesion; si no, usa otro numero.'
        });
      }
    } catch (raceCheckError) {
      console.error('Pre-registration phone race check failed:', raceCheckError.message);
    }

    try {
      prereg.step = 'complete';
      await prereg.save();
    } catch (e) {
      console.error('Pre-registration: no se pudo marcar el draft como completo:', e.message);
    }

    await Promise.allSettled([
      withTimeout(syncSpecialties(user), POST_COMMIT_TIMEOUT_MS, 'syncSpecialties'),
      withTimeout(logRegistration(user, req), POST_COMMIT_TIMEOUT_MS, 'logRegistration'),
      withTimeout(notifyAdminNewRegistration(user), POST_COMMIT_TIMEOUT_MS, 'notifyAdminNewRegistration')
    ]).then((results) => {
      results.filter((r) => r.status === 'rejected').forEach((r) => {
        console.error('Pre-registration post-commit side effect failed:', r.reason && r.reason.message);
      });
    });

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
