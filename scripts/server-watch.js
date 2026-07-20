#!/usr/bin/env node
/**
 * Virtual server reachability watch (TCP only — not the KuraTe app).
 * MUST run from OUTSIDE 91.208.206.35 (your Windows admin PC), never on the server itself.
 *
 * Usage:
 *   node scripts/server-watch.js           # check + alert if down
 *   node scripts/server-watch.js --check   # print result only, no alerts
 *
 * Env: WATCH_SERVER_IP, WATCH_TCP_PORT(S), WATCH_ALERT_WHATSAPP, WATCH_CALLMEBOT_API_KEY, ...
 */
const fs = require('fs');
const path = require('path');
const net = require('net');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { assertExternalWatcher } = require('../utils/assertExternalWatcher');
const { notifyAlert, alertWhatsAppNumber } = require('../utils/watchAlertNotify');

const CHECK_ONLY = process.argv.includes('--check');
const RESET_STATE = process.argv.includes('--reset-state');
const SERVER_IP = process.env.WATCH_SERVER_IP || '91.208.206.35';
const ALERT_EMAIL = process.env.WATCH_ALERT_EMAIL || 'admin@drsrv.net.ar';
const REMIND_MINUTES = parseInt(process.env.WATCH_REMIND_MINUTES || '30', 10);
const STATE_FILE = process.env.WATCH_STATE_FILE
  || path.resolve(__dirname, '..', '.cache', 'server-watch-state.json');

function parsePorts() {
  const raw = process.env.WATCH_TCP_PORTS || process.env.WATCH_TCP_PORT || '22';
  return raw.split(',').map((p) => parseInt(p.trim(), 10)).filter((p) => p > 0 && p < 65536);
}

const TCP_PORTS = parsePorts();

function readState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return { status: 'up', lastAlertAt: null, downSince: null };
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return {
      status: parsed.status === 'down' ? 'down' : 'up',
      lastAlertAt: parsed.lastAlertAt || null,
      downSince: parsed.downSince || null
    };
  } catch {
    return { status: 'up', lastAlertAt: null, downSince: null };
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

assertExternalWatcher(SERVER_IP);

if (RESET_STATE) {
  writeState({ status: 'up', lastAlertAt: null, downSince: null });
  console.log('[server-watch] State reset (status=up).');
  process.exit(0);
}

function tcpProbe(host, port, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (ok, detail) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ok, detail, port });
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true, `TCP ${host}:${port} OK`));
    socket.once('timeout', () => finish(false, `TCP ${host}:${port} timeout`));
    socket.once('error', (err) => finish(false, `TCP ${host}:${port} ${err.message}`));
    socket.connect(port, host);
  });
}

async function checkReachability() {
  const results = await Promise.all(TCP_PORTS.map((port) => tcpProbe(SERVER_IP, port)));
  const ok = results.find((r) => r.ok);
  if (ok) {
    return {
      reachable: true,
      reason: ok.detail,
      failures: results.filter((r) => !r.ok).map((r) => r.detail)
    };
  }
  return {
    reachable: false,
    reason: results.map((r) => r.detail).join('; '),
    failures: results.map((r) => r.detail)
  };
}

function minutesSince(iso) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 60000;
}

async function main() {
  const now = new Date();
  const check = await checkReachability();

  if (CHECK_ONLY) {
    if (check.reachable) {
      console.log(`REACHABLE — ${SERVER_IP} (${check.reason})`);
      process.exit(0);
    }
    console.log(`UNREACHABLE — ${SERVER_IP}`);
    console.log(check.reason);
    process.exit(1);
  }

  const state = readState();

  if (check.reachable) {
    if (state.status === 'down') {
      const subject = `[RECOVERED] Virtual server ${SERVER_IP} is reachable again`;
      const message = [
        'The virtual server is accepting TCP connections again.',
        '',
        `Server IP: ${SERVER_IP}`,
        `Ports checked: ${TCP_PORTS.join(', ')}`,
        `Checked at: ${now.toISOString()}`,
        `Details: ${check.reason}`,
        state.downSince ? `Was unreachable since: ${state.downSince}` : ''
      ].filter(Boolean).join('\n');
      const sent = await notifyAlert({ subject, message, emailTo: ALERT_EMAIL });
      if (sent) {
        console.log('[server-watch] Recovery notification sent.');
      } else {
        console.warn('[server-watch] Server recovered but alert was not sent (set WATCH_CALLMEBOT_API_KEY).');
      }
    } else {
      console.log(`[server-watch] OK — ${check.reason}`);
    }
    writeState({ status: 'up', lastAlertAt: null, downSince: null });
    return;
  }

  const downSince = state.status === 'down' && state.downSince ? state.downSince : now.toISOString();
  const shouldAlert = state.status === 'up'
    || minutesSince(state.lastAlertAt) >= REMIND_MINUTES;

  if (shouldAlert) {
    const subject = `[URGENT] Virtual server ${SERVER_IP} UNREACHABLE`;
    const message = [
      'Virtual server TCP check FAILED (host not accepting connections).',
      '',
      `Server IP: ${SERVER_IP}`,
      `Ports checked: ${TCP_PORTS.join(', ')}`,
      `Checked at: ${now.toISOString()}`,
      `Failure: ${check.reason}`,
      '',
      'Suggested actions:',
      `  1. ping ${SERVER_IP}`,
      `  2. ssh root@${SERVER_IP}`,
      '',
      `Next reminder while down: every ${REMIND_MINUTES} minutes.`
    ].join('\n');
    const sent = await notifyAlert({ subject, message, emailTo: ALERT_EMAIL });
    if (sent) {
      console.log('[server-watch] URGENT alert sent to WhatsApp', alertWhatsAppNumber());
    } else {
      console.warn('[server-watch] Server unreachable but WhatsApp alert was not sent.');
      console.warn('[server-watch] Add WATCH_CALLMEBOT_API_KEY to .env — see test_watch_whatsapp.bat');
    }
    writeState({
      status: 'down',
      lastAlertAt: now.toISOString(),
      downSince
    });
  } else {
    console.log(`[server-watch] Still unreachable (${check.reason}); next reminder in ${Math.ceil(REMIND_MINUTES - minutesSince(state.lastAlertAt))} min`);
    writeState({
      status: 'down',
      lastAlertAt: state.lastAlertAt,
      downSince
    });
  }
}

main().catch((err) => {
  console.error('[server-watch] Fatal:', err.message);
  process.exit(1);
});
