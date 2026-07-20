const DEFAULT_WHATSAPP_PHONE = '';

function getTwilioWhatsAppPhone() {
  return '';
}

function isTwilioWhatsAppPhoneConfigured() {
  return false;
}

async function getAdminWhatsAppSettings() {
  return {};
}

async function getPlatformWhatsAppPhone() {
  return '';
}

async function getPlatformWhatsAppPhoneSource() {
  return '';
}

async function updatePlatformWhatsAppPhone(phone) {
  throw new Error('Not implemented');
}

async function markWhatsAppRegistered() {
  return;
}

function formatWhatsAppPhoneDisplay(phone) {
  return '';
}

async function buildPlatformWhatsAppContactUrl() {
  return '';
}

module.exports = {
  DEFAULT_WHATSAPP_PHONE,
  getTwilioWhatsAppPhone,
  isTwilioWhatsAppPhoneConfigured,
  getAdminWhatsAppSettings,
  getPlatformWhatsAppPhone,
  getPlatformWhatsAppPhoneSource,
  updatePlatformWhatsAppPhone,
  markWhatsAppRegistered,
  formatWhatsAppPhoneDisplay,
  buildPlatformWhatsAppContactUrl
};
