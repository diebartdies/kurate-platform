const fs = require('fs');
const path = require('path');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const { resolveBrowserExecutable } = require('../utils/browserExecutable');
const twilioWhatsApp = require('./twilioWhatsAppService');
const {
  getPlatformWhatsAppPhone,
  markWhatsAppRegistered,
  formatWhatsAppPhoneDisplay
} = require('../utils/whatsappConfig');
const { normalizeWhatsAppPhone } = require('../utils/professionalInviteMessage');

const CLIENT_ID = 'platform';
const DEFAULT_TIMEOUT_MS = 180000;
const SESSION_DIR = path.resolve(process.cwd(), '.wwebjs_auth', `session-${CLIENT_ID}`);

const regState = {
  phase: 'idle',
  qr: null,
  lastError: null
};

let client = null;
let clientReady = false;
let initializing = false;
let readyWaiters = [];

function notifyReadyWaiters(err) {
  const waiters = readyWaiters.slice();
  readyWaiters = [];
  waiters.forEach(({ resolve, reject }) => {
    if (err) reject(err);
    else resolve();
  });
}

function sessionExistsOnDisk() {
  return fs.existsSync(SESSION_DIR);
}

function resetClientState() {
  client = null;
  clientReady = false;
  initializing = false;
  readyWaiters = [];
}

async function destroyClient() {
  if (!client) return;
  try {
    await client.destroy();
  } catch {
    /* ignore */
  }
  resetClientState();
  regState.phase = 'idle';
  regState.qr = null;
}

function attachClientEvents(activeClient) {
  activeClient.on('qr', (qr) => {
    regState.qr = qr;
    regState.phase = 'qr';
  });

  activeClient.on('authenticated', () => {
    regState.phase = 'initializing';
    regState.qr = null;
  });

  activeClient.on('ready', async () => {
    clientReady = true;
    regState.phase = 'ready';
    regState.qr = null;
    regState.lastError = null;
    try {
      await markWhatsAppRegistered();
    } catch (err) {
      console.error('[whatsapp] Failed to persist registration timestamp:', err.message);
    }
    notifyReadyWaiters();
  });

  activeClient.on('auth_failure', (msg) => {
    regState.phase = 'error';
    regState.lastError = msg || 'WhatsApp authentication failed';
    clientReady = false;
    notifyReadyWaiters(new Error(regState.lastError));
  });

  activeClient.on('disconnected', (reason) => {
    // Disconnected: mark not-connected and STOP — no auto-retry loop. Drop our
    // client reference so a later explicit reconnect (admin register / next
    // startup auto-reconnect) starts from a clean slate instead of a dead client.
    clientReady = false;
    regState.phase = 'error';
    regState.lastError = reason || 'WhatsApp disconnected';
    // Tear down the underlying Puppeteer browser before dropping the reference.
    // If we only null the ref, the orphaned browser keeps the LocalAuth session
    // directory locked and the next "Register number" attempt fails to launch —
    // making the admin button look broken (no QR ever appears).
    if (client) {
      Promise.resolve(client.destroy()).catch(() => { /* already gone */ });
    }
    client = null;
    initializing = false;
  });
}

function createClient() {
  if (client || initializing) return client;

  const executablePath = resolveBrowserExecutable();
  if (!executablePath) {
    regState.phase = 'error';
    regState.lastError = 'Chromium not found in the server container. Rebuild the app image (Dockerfile installs chromium).';
    initializing = false;
    console.error('[whatsapp]', regState.lastError);
    return null;
  }

  initializing = true;
  console.log('[whatsapp] Launching client with', executablePath);

  client = new Client({
    authStrategy: new LocalAuth({ clientId: CLIENT_ID }),
    puppeteer: {
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    }
  });

  attachClientEvents(client);
  regState.phase = 'initializing';
  regState.lastError = null;
  // SINGLE attempt only. If initialization fails, mark as disconnected/errored
  // and STOP — never loop-retry. Reset the client ref so the status reflects
  // "not connected" and a later explicit reconnect starts from a clean slate.
  const launchingClient = client;
  client.initialize().catch((err) => {
    regState.phase = 'error';
    regState.lastError = err.message;
    clientReady = false;
    initializing = false;
    notifyReadyWaiters(err);
    // Destroy the half-launched client so any partially-started browser releases
    // the session lock; otherwise a retry of the registration cannot relaunch.
    if (launchingClient) {
      Promise.resolve(launchingClient.destroy()).catch(() => { /* already gone */ });
    }
    client = null;
  }).finally(() => {
    initializing = false;
  });

  return client;
}

async function buildStatus() {
  const phoneNumber = await getPlatformWhatsAppPhone();

  if (twilioWhatsApp.isApiModeEnabled()) {
    const configError = twilioWhatsApp.getConfigError();
    const ready = !configError;
    return {
      phase: ready ? 'ready' : 'error',
      qr: null,
      lastError: configError || regState.lastError,
      phoneNumber,
      displayPhone: formatWhatsAppPhoneDisplay(phoneNumber),
      sessionSaved: false,
      connected: ready,
      transport: 'twilio',
      twilioApi: true
    };
  }

  return {
    phase: clientReady ? 'ready' : regState.phase,
    qr: regState.qr,
    lastError: regState.lastError,
    phoneNumber,
    displayPhone: formatWhatsAppPhoneDisplay(phoneNumber),
    sessionSaved: sessionExistsOnDisk(),
    connected: clientReady,
    transport: 'webjs',
    twilioApi: false
  };
}

async function getRegistrationStatus() {
  return buildStatus();
}

async function startRegistration() {
  if (twilioWhatsApp.isApiModeEnabled()) {
    const configError = twilioWhatsApp.getConfigError();
    if (configError) {
      regState.phase = 'error';
      regState.lastError = configError;
      return buildStatus();
    }
    regState.phase = 'ready';
    regState.qr = null;
    regState.lastError = null;
    try {
      await markWhatsAppRegistered();
    } catch (err) {
      console.error('[whatsapp] Failed to persist Twilio registration timestamp:', err.message);
    }
    return buildStatus();
  }

  // If a QR is already on screen, keep showing it — don't kill a scan the admin
  // may be midway through. (This is the ONLY early-return: a live, scannable QR.)
  if (regState.phase === 'qr' && regState.qr) {
    return buildStatus();
  }

  // Otherwise the admin explicitly asked to (re)link, so force a clean restart.
  // Crucially we do NOT bail out on `clientReady` or a bare `initializing` phase:
  // the startup auto-reconnect (autoReconnectIfSessionSaved) launches a client with
  // the saved session; if that session is stale/restricted it can sit in
  // `initializing` forever (browser alive, no `qr`/`ready` event), which previously
  // made this whole endpoint a permanent no-op and left the admin button disabled.
  // destroyClient() tears down the existing/half-dead browser (releasing the
  // LocalAuth session lock) before we relaunch, so a fresh attempt can produce a QR.
  await destroyClient();
  regState.phase = 'initializing';
  regState.qr = null;
  regState.lastError = null;
  createClient();
  return buildStatus();
}

function waitForReady(timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (twilioWhatsApp.isApiModeEnabled()) {
    const configError = twilioWhatsApp.getConfigError();
    if (configError) return Promise.reject(new Error(configError));
    return Promise.resolve();
  }

  if (clientReady) return Promise.resolve();

  createClient();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('WhatsApp login timed out — scan the QR within 3 minutes'));
    }, timeoutMs);

    readyWaiters.push({
      resolve: () => {
        clearTimeout(timer);
        resolve();
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      }
    });
  });
}

async function isRegisteredUser(phoneOrChatId) {
  if (twilioWhatsApp.isApiModeEnabled()) return true;

  const raw = String(phoneOrChatId || '');
  const chatId = raw.includes('@') ? raw : `${normalizeWhatsAppPhone(raw)}@c.us`;
  if (!chatId || chatId === '@c.us') return false;

  await waitForReady();
  if (!client) return false;
  return client.isRegisteredUser(chatId);
}

// Send a WhatsApp message to a phone number.
//   - Plain text  : sendMessage(phone, text)
//   - Image + text: sendMessage(phone, caption, { mediaPath: '/abs/logo.png' })
//                   The local file is wrapped in a MessageMedia and the `message`
//                   string is used as the image caption (single message, image on
//                   top + caption below). Use this to convey the brand via an
//                   image while keeping the caption text sanitized.
// Returns the sent message id (string) when available, else true.
async function sendMessage(toPhone, message, options = {}) {
  if (twilioWhatsApp.isApiModeEnabled()) {
    return twilioWhatsApp.sendWhatsAppMessage(toPhone, message, {
      ...options,
      alias: options.alias,
      includeMedia: Boolean(options.mediaPath)
    });
  }

  const cleanPhone = normalizeWhatsAppPhone(toPhone);
  if (!cleanPhone) {
    throw new Error('Invalid WhatsApp recipient phone number');
  }

  await waitForReady(options.timeoutMs || DEFAULT_TIMEOUT_MS);

  const chatId = `${cleanPhone}@c.us`;
  let sent;
  if (options.mediaPath) {
    if (!fs.existsSync(options.mediaPath)) {
      throw new Error(`WhatsApp media file not found: ${options.mediaPath}`);
    }
    const media = MessageMedia.fromFilePath(options.mediaPath);
    sent = await client.sendMessage(chatId, media, { caption: message });
  } else {
    sent = await client.sendMessage(chatId, message);
  }

  return (sent && sent.id && (sent.id._serialized || sent.id.id)) || true;
}

function getSharedClient() {
  if (!client) createClient();
  return client;
}

// Called at server startup: if a WhatsApp session is already saved on disk,
// bring the platform (Tulio) client up automatically so a container restart /
// rebuild restores sending without a manual reconnect. No-op if already running
// or if there is no saved session (nothing to reconnect to).
function autoReconnectIfSessionSaved() {
  if (twilioWhatsApp.isApiModeEnabled()) return false;
  if (client || initializing || clientReady) return false;
  if (!sessionExistsOnDisk()) return false;
  createClient();
  return true;
}

function isClientReady() {
  if (twilioWhatsApp.isApiModeEnabled()) {
    return !twilioWhatsApp.getConfigError();
  }
  return clientReady;
}

function isTwilioApiMode() {
  return twilioWhatsApp.isApiModeEnabled();
}

function getQrCode() {
  return regState.qr;
}

module.exports = {
  CLIENT_ID,
  DEFAULT_TIMEOUT_MS,
  getRegistrationStatus,
  startRegistration,
  waitForReady,
  sendMessage,
  isRegisteredUser,
  destroyClient,
  getSharedClient,
  autoReconnectIfSessionSaved,
  isClientReady,
  isTwilioApiMode,
  getQrCode,
  sessionExistsOnDisk
};
