const { REGISTER_URL } = require('./professionalInviteMessage');
const { buildInviteSms } = require('./professionalInviteSms');

// SHORT, plain-text Spanish SMS templates. Aim for 1-2 GSM-7 segments: no emojis,
// no accents-heavy padding, keep each message tight. These mirror (but never
// replace) the long WhatsApp invite in professionalInviteMessage.js.

// Invitation + registration link. Delegates to the shared invite builder so the
// outreach copy stays single-sourced.
function inviteSms({ name, alias } = {}) {
  return buildInviteSms({ name, alias });
}

function recipient(alias) {
  return (alias && String(alias).trim()) || 'hola';
}

// Visibility/active-state change, e.g. "tu perfil ahora figura como activo".
function visibilityChangeSms({ alias, newState } = {}) {
  const estado = (newState && String(newState).trim()) || 'actualizado';
  return `KuraTe: ${recipient(alias)}, tu perfil ahora figura como ${estado}. Ingresa a tu panel para mas detalles: ${REGISTER_URL}`;
}

// Payment due / vencimiento reminder. `dueInfo` is a short, already-formatted
// snippet (e.g. "$15000 ARS vence el 07/07").
function dueDateSms({ alias, dueInfo } = {}) {
  const info = (dueInfo && String(dueInfo).trim()) || 'tienes un pago pendiente';
  return `KuraTe: ${recipient(alias)}, recordatorio de pago: ${info}. Sube tu comprobante en el panel para mantener tu perfil activo.`;
}

// Tariff/category change, e.g. "tu tarifa vigente cambio a Gold ($30000 ARS)".
function tariffChangeSms({ alias, info } = {}) {
  const detail = (info && String(info).trim()) || 'tu tarifa vigente fue actualizada';
  return `KuraTe: ${recipient(alias)}, ${detail}. Ingresa a tu panel para revisar el detalle.`;
}

module.exports = {
  inviteSms,
  visibilityChangeSms,
  dueDateSms,
  tariffChangeSms
};
