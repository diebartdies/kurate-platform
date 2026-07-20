function normalizeE164Digits(phone) {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '');
}

function normalizeWhatsAppPhone(phone) {
  if (!phone) return '';
  const cleanPhone = normalizeE164Digits(phone);
  if (!cleanPhone) return '';
  if (!cleanPhone.startsWith('54')) return '549' + cleanPhone.replace(/^0+/, '');
  if (cleanPhone.startsWith('54') && !cleanPhone.startsWith('549')) return cleanPhone.slice(0, 2) + '9' + cleanPhone.slice(2);
  return cleanPhone;
}

function normalizeSmsPhone(phone) {
  const digits = normalizeWhatsAppPhone(phone);
  if (!digits) return '';
  return '+' + digits;
}

module.exports = { normalizeSmsPhone };
