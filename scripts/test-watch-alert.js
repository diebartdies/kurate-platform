#!/usr/bin/env node
/** Test server-watch WhatsApp alert (CallMeBot or saved WhatsApp Web session). */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const { notifyAlert, alertWhatsAppNumber } = require('../utils/watchAlertNotify');

async function main() {
  if (process.env.MONGO_URI) {
    await mongoose.connect(process.env.MONGO_URI);
  }

  if (!process.env.WATCH_CALLMEBOT_API_KEY && !process.stdout.isTTY) {
    console.error('No CallMeBot key and not interactive — register WhatsApp in Admin Dashboard first.');
    process.exit(1);
  }

  const target = await alertWhatsAppNumber();

  if (!process.env.WATCH_CALLMEBOT_API_KEY) {
    console.log('No CallMeBot key — using WhatsApp Web session.');
    console.log(`If QR appears, scan with +${target}, or register in Admin Dashboard → Dashboard Config.`);
    console.log('');
  }

  const ok = await notifyAlert({
    subject: '[TEST] FullMinent server watch',
    message: `Test alert from your Windows PC.\nTarget: ${process.env.WATCH_SERVER_IP || '91.208.206.35'}\nWhatsApp: +${target}`,
    emailTo: process.env.WATCH_ALERT_EMAIL
  });

  if (!ok) {
    console.error('');
    console.error('Test alert failed. Register WhatsApp in Admin Dashboard → Dashboard Config.');
    process.exit(1);
  }
  console.log('Test WhatsApp alert sent to +' + target);

  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
