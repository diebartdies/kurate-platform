#!/usr/bin/env node
/**
 * One-time interactive WhatsApp login for server-watch alerts.
 * Prefer Admin Dashboard → Dashboard Config → Register number on WhatsApp.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const { alertWhatsAppNumber } = require('../utils/watchAlertNotify');
const { loginWatchWhatsAppSession, sendWatchWhatsAppAlert } = require('../services/watchWhatsAppSender');

async function main() {
  if (process.env.MONGO_URI) {
    await mongoose.connect(process.env.MONGO_URI);
  }

  const target = await alertWhatsAppNumber();
  console.log('');
  console.log('Platform WhatsApp login');
  console.log('Origin number: +' + target);
  console.log('Waiting for QR...');
  console.log('');

  await loginWatchWhatsAppSession();

  const testMsg = `[TEST] FullMinent platform WhatsApp linked.\nAlerts for ${process.env.WATCH_SERVER_IP || '91.208.206.35'} will come to +${target}.`;
  await sendWatchWhatsAppAlert(target, testMsg, { showQr: false, timeoutMs: 60000 });

  console.log('');
  console.log('Done. You can run check_server.bat / server_watch.bat — no QR needed until session expires.');

  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('');
  console.error('Login failed:', err.message);
  process.exit(1);
});
