async function alertWhatsAppNumber() {
  return '';
}

async function notifyAlert({ subject, message, emailTo }) {
  return false;
}

module.exports = {
  notifyAlert,
  alertWhatsAppNumber
};
