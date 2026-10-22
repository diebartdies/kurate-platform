const puppeteer = require('puppeteer');
const BASE = process.argv[2];
const EMAIL = process.argv[3];
const PASSWORD = process.argv[4];

(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage();
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  });
  const data = await res.json();
  console.log('login:', res.status, data.error || 'ok');
  if (!data.token) { await b.close(); return; }
  const apiResult = await p.evaluate(async (base, token) => {
    const r = await fetch(`${base}/api/v1/professionals/me`, { headers: { Authorization: `Bearer ${token}` } });
    let body = null;
    try { body = await r.json(); } catch {}
    return { status: r.status, keys: body ? Object.keys(body) : null, success: body?.success, role: body?.data?.role, err: body?.error || null };
  }, BASE, data.token);
  console.log('/professionals/me:', JSON.stringify(apiResult));
  await b.close();
})();