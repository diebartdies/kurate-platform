/** Use explicit WhatsApp number, or fall back to mobile phone. */
function resolveWhatsappNumber(prof = {}) {
  const whatsapp = (prof.whatsappNumber || '').trim();
  if (whatsapp) return whatsapp;
  return (prof.mobilePhone || '').trim();
}

function hasContactNumber(prof = {}) {
  return !!resolveWhatsappNumber(prof);
}

module.exports = { resolveWhatsappNumber, hasContactNumber };
