const puppeteer = require('puppeteer');
const BASE = process.argv[2];
const EMAIL = process.argv[3];
const PASSWORD = process.argv[4];
const PAGE = process.argv[5];

(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const loginRes = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  });
  const auth = await loginRes.json();
  console.log('login:', loginRes.status, auth.error || 'ok');
  const p = await b.newPage();
  const responses = [];
  p.on('response', (r) => {
    if (r.url().includes('/api/')) responses.push({ url: r.url().replace(BASE, ''), status: r.status() });
  });
  await p.evaluateOnNewDocument((t) => {
    localStorage.setItem('token', t.token);
    localStorage.setItem('user', JSON.stringify(t.user));
    localStorage.setItem('is18Plus', 'true');
    sessionStorage.setItem('valid_entry', 'true');
    sessionStorage.setItem('ancestor_code', 'index.html');
  }, { token: auth.token, user: { id: String(auth.data?.id ?? auth.user?.id ?? ''), role: auth.data?.role ?? auth.user?.role } });
  const gotoRes = await p.goto(`${BASE}/${PAGE}`, { waitUntil: 'networkidle2', timeout: 60000 }).catch((e) => ({ _error: e.message }));
  await new Promise((r) => setTimeout(r, 4500));
  const state = await p.evaluate((base, token) => {
    const h1s = [...document.querySelectorAll('h1')].map(h => h.textContent.trim());
    const mains = document.querySelectorAll('main').length;
    const topbarRole = (() => { const tb = document.getElementById('globalTopBar'); return tb ? (tb.getAttribute('role') + '|' + tb.getAttribute('aria-label')) : 'none'; })();
    return { finalUrl: location.pathname, className: document.documentElement.className, h1s, mains, topbarRole, bodyText: document.body.innerText.slice(0, 100) };
  }, BASE, auth.token);
  console.log('PAGE:', PAGE);
  console.log('state:', JSON.stringify(state, null, 1));
  console.log('apiResponses:', JSON.stringify(responses));
  await b.close();
})();