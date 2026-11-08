const nodemailer = require('nodemailer');

function isEmailConfigured() {
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_EMAIL &&
    process.env.SMTP_PASSWORD &&
    process.env.FROM_EMAIL
  );
}

const sendEmail = async (options) => {
  if (!isEmailConfigured()) {
    const err = new Error('Email service is not configured on the server.');
    err.code = 'EMAIL_NOT_CONFIGURED';
    throw err;
  }

  const port = Number(process.env.SMTP_PORT) || 587;

  // Timeouts duros: un SMTP colgado no puede colgar el request que lo dispara
  // (registro, verificacion, notificaciones). Si no contesta, falla rapido.
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_PASSWORD
    },
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS) || 10000,
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS) || 10000,
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS) || 20000,
    tls: {
      rejectUnauthorized: false
    }
  });

  const message = {
    from: `${process.env.FROM_NAME || 'KuraTe'} <${process.env.FROM_EMAIL}>`,
    to: options.email,
    subject: options.subject,
    text: options.message
  };

  const info = await transporter.sendMail(message);
  console.log('Message sent: %s to %s', info.messageId, options.email);
};

module.exports = sendEmail;
module.exports.isEmailConfigured = isEmailConfigured;
