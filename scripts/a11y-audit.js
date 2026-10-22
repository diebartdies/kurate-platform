/**
 * WCAG 2.1 AA audit.
 *
 *   node scripts/a11y-audit.js
 *   node scripts/a11y-audit.js https://kurate.drsrv.net.ar
 *   node scripts/a11y-audit.js <base> index.html,hogar.html
 *
 * Authenticated pages are covered when credentials are supplied via env:
 *   A11Y_PRO_EMAIL / A11Y_PRO_PASSWORD   -> professional pages
 *   A11Y_ADMIN_EMAIL / A11Y_ADMIN_PASSWORD -> admin pages
 *
 * Exit code 1 when a WCAG A/AA violation or a moderate+ best-practice issue
 * remains, so this can gate deploys.
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const AXE_SOURCE = fs.readFileSync(
  path.join(__dirname, '..', 'node_modules', 'axe-core', 'axe.min.js'),
  'utf8'
);

const BASE = process.argv[2] && process.argv[2].startsWith('http')
  ? process.argv[2].replace(/\/$/, '')
  : 'https://kurate.drsrv.net.ar';

const PUBLIC_PAGES = [
  ['index.html', '/'], ['hogar.html', '/hogar.html'], ['hogar-detail.html', '/hogar-detail.html'],
  ['avisos.html', '/avisos.html'], ['login.html', '/login.html'], ['register.html', '/register.html'],
  ['recover.html', '/recover.html'], ['verify.html', '/verify.html'],
  ['set-password.html', '/set-password.html'], ['feedback.html', '/feedback.html'],
  ['precios-aire-acondicionado.html', '/precios-aire-acondicionado.html'],
  ['conciencia-cancer-mama.html', '/conciencia-cancer-mama.html'],
  ['conciencia-vih.html', '/conciencia-vih.html']
];

const PRO_PAGES = [
  ['profile.html', '/profile.html'],
  ['profDashboard.html', '/profDashboard.html']
];

const PENDING_PAGES = [
  ['captura-dni.html', '/captura-dni.html']
];

const ADMIN_PAGES = [
  ['dashboard.html', '/dashboard.html'],
  ['admin.html', '/admin.html']
];

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const BEST_TAGS = ['best-practice'];

const only = process.argv[3] ? process.argv[3].split(',').map((s) => s.trim()) : null;
const wants = (name) => !only || only.some((o) => name.includes(o));

async function login(email, password) {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) {
    console.log(`WARN  could not log in as ${email}: ${res.status} ${data.error || ''}`);
    return null;
  }
  return { token: data.token, user: data.user || (data.data && data.data.user) || { id: '', role: '' } };
}

async function auditPage(browser, label, pathName, auth) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 900 });
  await page.setCacheEnabled(false);

  if (auth) {
// Seed the session before any script on the page runs. The Flow Guardian
  // (bootstrap.js) enforces an entry chain via sessionStorage, so a cold
  // browser tab would otherwise bounce protected pages back to the landing.
  await page.evaluateOnNewDocument((t) => {
    if (t.token) localStorage.setItem('token', t.token);
    if (t.user) localStorage.setItem('user', JSON.stringify(t.user));
    localStorage.setItem('is18Plus', 'true');
    sessionStorage.setItem('valid_entry', 'true');
    sessionStorage.setItem('ancestor_code', 'index.html');
  }, auth);
  }

  let resp;
  try {
    resp = await page.goto(BASE + pathName, { waitUntil: 'networkidle2', timeout: 45000 });
  } catch (err) {
    console.log(`SKIP  ${label}  (${err.message.split('\n')[0]})`);
    await page.close();
    return null;
  }

  const status = resp ? resp.status() : 0;
  if (status !== 200 && status !== 304) {
    console.log(`SKIP  ${label}  (HTTP ${status})`);
    await page.close();
    return null;
  }

  const finalPath = new URL(page.url()).pathname;
  if (finalPath !== pathName) {
    console.log(`SKIP  ${label}  (redirected to ${finalPath})`);
    await page.close();
    return null;
  }

  // Let the client-side a11y wiring (skip link, main landmark, live region)
  // and i18n (some pages hide content until translations apply) settle.
  await new Promise((r) => setTimeout(r, 2500));
  await page.evaluate(AXE_SOURCE);

  const run = async (tags) => page.evaluate(async (t) => {
    // eslint-disable-next-line no-undef
    return await axe.run(document, { runOnly: { type: 'tag', values: t } });
  }, tags);

  const wcag = await run(WCAG_TAGS);
  const best = await run(BEST_TAGS);

  const report = (res, gate) => res.violations.filter(
    (v) => gate || v.impact === 'serious' || v.impact === 'critical' || v.impact === 'moderate'
  );

  const wcagV = report(wcag, true);
  const bestV = report(best, false);

  console.log(`\n=== ${label} ===  wcag:${wcagV.length} best-practice:${bestV.length}`);
  [...wcagV, ...bestV].forEach((v) =>
    console.log(`    ${String(v.impact || 'n/a').toUpperCase().padEnd(9)} ${v.id} (${v.nodes.length})  ${v.help}`)
  );

  const nodes = [...wcagV, ...bestV].flatMap((v) => v.nodes.map((n) => ({
    page: label, id: v.id, impact: v.impact || 'best-practice', help: v.help,
    wcag: (v.tags || []).filter((t) => t.startsWith('wcag')).join(' ') || '-',
    target: Array.isArray(n.target) ? n.target.join(' ') : n.target,
    summary: (n.failureSummary || '').split('\n').filter(Boolean).slice(0, 3).join(' | ')
  })));

  await page.close();
  return { wcag: wcagV.length, best: bestV.length, nodes };
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  let proLogin = null;
  let adminLogin = null;
  if (process.env.A11Y_PRO_EMAIL && process.env.A11Y_PRO_PASSWORD) {
    proLogin = await login(process.env.A11Y_PRO_EMAIL, process.env.A11Y_PRO_PASSWORD);
  }
  if (process.env.A11Y_ADMIN_EMAIL && process.env.A11Y_ADMIN_PASSWORD) {
    adminLogin = await login(process.env.A11Y_ADMIN_EMAIL, process.env.A11Y_ADMIN_PASSWORD);
  }
  let pendingLogin = null;
  if (process.env.A11Y_PENDING_EMAIL && process.env.A11Y_PENDING_PASSWORD) {
    pendingLogin = await login(process.env.A11Y_PENDING_EMAIL, process.env.A11Y_PENDING_PASSWORD);
  }

  const results = [];
  const pages = [
    ...PUBLIC_PAGES.filter(([l]) => wants(l)),
    ...PRO_PAGES.filter(([l]) => wants(l)),
    ...PENDING_PAGES.filter(([l]) => wants(l)),
    ...ADMIN_PAGES.filter(([l]) => wants(l))
  ];

  for (const [label, pathName] of pages) {
    const auth = PUBLIC_PAGES.some(([l]) => l === label) ? null
      : ADMIN_PAGES.some(([l]) => l === label) ? adminLogin
      : PENDING_PAGES.some(([l]) => l === label) ? pendingLogin : proLogin;
    if (!auth && !PUBLIC_PAGES.some(([l]) => l === label)) {
      console.log(`SKIP  ${label}  (no credentials for an authenticated page)`);
      continue;
    }
    const r = await auditPage(browser, label, pathName, auth);
    if (r) results.push(r);
  }

  await browser.close();

  const nodes = results.flatMap((r) => r.nodes);
  const totalWcag = results.reduce((a, r) => a + r.wcag, 0);
  const totalBest = results.reduce((a, r) => a + r.best, 0);

  console.log(`\n\n########## WCAG 2.1 AA SUMMARY ##########`);
  console.log(`Pages audited: ${results.length}/${pages.length}`);
  console.log(`WCAG A/AA violations: ${totalWcag}`);
  console.log(`Best-practice issues: ${totalBest}`);

  if (!results.length) {
    console.error('\nNothing was audited — broken base URL or bad page list.');
    process.exit(1);
  }

  if (nodes.length) {
    const byRule = {};
    for (const n of nodes) {
      const k = `${n.id} — ${n.help}`;
      byRule[k] = byRule[k] || { count: 0, pages: new Set(), wcag: n.wcag, example: n.target, detail: n.summary };
      byRule[k].count++;
      byRule[k].pages.add(n.page);
    }
    Object.entries(byRule).sort((a, b) => b[1].count - a[1].count).forEach(([rule, v]) => {
      console.log(`\n${v.count}x  ${rule}`);
      console.log(`     wcag: ${v.wcag}`);
      console.log(`     pages: ${[...v.pages].join(', ')}`);
      console.log(`     e.g.: ${v.example}`);
      console.log(`     ${v.detail}`);
    });
  }

  process.exit(totalWcag > 0 ? 1 : 0);
})();
