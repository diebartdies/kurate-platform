const puppeteer = require('puppeteer');

const BASE = process.argv[2];
const EMAIL = process.argv[3];
const PASSWORD = process.argv[4];
const PAGES = process.argv[5].split(',');

(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  });
  const data = await res.json();
  for (const name of PAGES) {
    const p = await b.newPage();
    await p.setViewport({ width: 1366, height: 900 });
    await p.evaluateOnNewDocument((t, u) => {
      localStorage.setItem('token', t);
      localStorage.setItem('is18Plus', 'true');
      localStorage.setItem('valid_entry', 'true');
      localStorage.setItem('ancestor_code', 'index.html');
      localStorage.setItem('user', JSON.stringify(u || {}));
    }, data.token, data.user);
    const logs = [];
    p.on('console', (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 160)}`));
    p.on('pageerror', (e) => logs.push(`[pageerror] ${String(e).slice(0, 200)}`));
    let reqfail = [];
    p.on('requestfailed', (r) => reqfail.push(r.url().slice(0, 120) + ' :: ' + (r.failure()?.errorText || '')));
    await p.goto(`${BASE}/${name}`, { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 2500));
    const finalUrl = p.url().replace(BASE, '');
    const hasMain = await p.evaluate(() => !!document.querySelector('#dashboardContent,#profDashboardContent,#profileContent'));
    const contentLen = await p.evaluate(() => (document.querySelector('#dashboardContent,#profDashboardContent,#profileContent')?.innerHTML || '').length);
    console.log(`\n=== ${name} === final:${finalUrl} hasContent:${hasMain} contentLen:${contentLen}`);
    logs.slice(-12).forEach((l) => console.log('   ' + l));
    reqfail.slice(0, 6).forEach((l) => console.log('   REQFAIL ' + l));
    await p.close();
  }
  await b.close();
})();