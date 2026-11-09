const User = require('../models/User');

// ---------------------------------------------------------------------------
// Identidad de una cuenta: email unico + telefono unico.
//
// El email ya es unique en el schema (indice email_1). El telefono no: se
// guarda como texto en tres campos y con formatos distintos ("11 5555-1234",
// "011 5555-1234", "+54 9 11 5555-1234"), asi que no se puede comparar por
// igualdad. Aca se compara el numero nacional (ultimos 10 digitos) y se
// resuelve en JS: son pocos documentos y el campo no tiene indice.
//
// IMPORTANTE: no se agrega indice unique ni se migran las cuentas viejas. La
// regla se aplica a las altas nuevas; si una cuenta vieja ocupa un email o
// telefono, el admin la purga (ver utils/userPurge.js) y queda libre.
// ---------------------------------------------------------------------------

/** Solo digitos, sin separadores ni prefijos. */
function digitsOnly(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\D/g, '');
}

/**
 * Clave canonica de un telefono: ultimos 10 digitos (numero nacional AR).
 * "11 5555-1234", "011 5555-1234", "+54 9 11 5555-1234" y "5491155551234"
 * producen todos "1155551234".
 */
function phoneKey(value) {
  const digits = digitsOnly(value);
  if (!digits) return '';
  const national = digits.length > 10 ? digits.slice(-10) : digits;
  return national.replace(/^0+/, '');
}

/** Telefonos guardados en una cuenta (perfil profesional y perfil hogar). */
function userPhones(user) {
  if (!user) return [];
  const out = [];
  const push = (value) => { if (value) out.push(String(value)); };
  if (user.professionalProfile) {
    push(user.professionalProfile.mobilePhone);
    push(user.professionalProfile.whatsappNumber);
  }
  if (user.hogarProfile && user.hogarProfile.contact) {
    push(user.hogarProfile.contact.mobilePhone);
  }
  return out;
}

/**
 * Variantes con las que el mismo numero puede estar guardado en otra coleccion
 * (WhatsApp guarda solo digitos, con o sin 54/9; PreRegistration normaliza sin
 * separadores ni ceros iniciales).
 */
function phoneVariants(phones) {
  const set = new Set();
  const list = Array.isArray(phones) ? phones : [phones];
  list.filter(Boolean).forEach((raw) => {
    const text = String(raw);
    set.add(text);
    const digits = digitsOnly(text);
    if (digits) set.add(digits);
    const key = phoneKey(text);
    if (key) {
      ['', '0', '9', '54', '549'].forEach((prefix) => set.add(prefix + key));
    }
  });
  return Array.from(set).filter(Boolean);
}

/**
 * Un pendiente sin verificar solo bloquea mientras su codigo siga vigente: si
 * ya expiro lo barre purgeExpiredUnverifiedUsers y no debe impedir que la
 * persona se registre de nuevo.
 */
function isStalePendingUser(user) {
  if (!user || user.isEmailVerified) return false;
  const expire = user.emailVerificationCodeExpire
    ? new Date(user.emailVerificationCodeExpire).getTime()
    : 0;
  return !expire || expire <= Date.now();
}

/**
 * Busca una cuenta con ese telefono. Devuelve el documento (lean) o null.
 * `excludeUserId` sirve para re-chequear una cuenta que se esta por actualizar.
 */
async function findUserByPhone(value, { excludeUserId } = {}) {
  const key = phoneKey(value);
  if (!key || key.length < 6) return null;

  // Acota con los ultimos 6 digitos (permitiendo separadores en el medio) y
  // confirma comparando la clave canonica completa en JS.
  const tail = new RegExp(key.slice(-6).split('').join('\\D*'));
  const candidates = await User.find({
    $or: [
      { 'professionalProfile.mobilePhone': tail },
      { 'professionalProfile.whatsappNumber': tail },
      { 'hogarProfile.contact.mobilePhone': tail }
    ]
  })
    .select('_id email role isEmailVerified emailVerificationCodeExpire professionalProfile.mobilePhone professionalProfile.whatsappNumber hogarProfile.contact.mobilePhone')
    .limit(50)
    .lean();

  const excluded = excludeUserId ? String(excludeUserId) : '';
  for (const candidate of candidates) {
    if (excluded && String(candidate._id) === excluded) continue;
    if (isStalePendingUser(candidate)) continue;
    if (userPhones(candidate).some((phone) => phoneKey(phone) === key)) return candidate;
  }
  return null;
}

module.exports = {
  digitsOnly,
  phoneKey,
  userPhones,
  phoneVariants,
  isStalePendingUser,
  findUserByPhone
};
