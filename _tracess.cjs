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
    const logs = [];
    await p.evaluateOnNewDocument((t, u) => {
      localStorage.setItem('token', t);
      localStorage.setItem('is18Plus', 'true');
      localStorage.setItem('valid_entry', 'true');
      localStorage.setItem('ancestor_code', 'index.html');
      localStorage.setItem('user', JSON.stringify(u || {}));
      const origSet = sessionStorage.setItem.bind(sessionStorage);
      const origRem = sessionStorage.removeItem.bind(sessionStorage);
      sessionStorage.setItem = (k, v) => { if (['ancestor_code', 'valid_entry'].includes(k)) window.__sslog.push(`set ${k}=${v}`); return origSet(k, v); };
      sessionStorage.removeItem = (k) => { if (['ancestor_code', 'valid_entry'].includes(k)) window.__sslog.push(`remove ${k}`); return origRem(k); };
      window.__sslog = [];
      sessionStorage.setItem('ancestor_code', 'index.html');
      sessionStorage.setItem('valid_entry', 'true');
    }, data.token, data.user);
    p.on('console', (m) => { const t = m.text().slice(0, 150); if (t.includes('Flow Guardian') || t.includes('[Flow')) logs.push(`[console] ${t}`); });
    await p.goto(`${BASE}/${name}`, { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 2200));
    const final = p.url().replace(BASE, '');
    const sslog = await p.evaluate(() => window.__sslog || []).catch(() => []);
    console.log(`=== ${name} === final:${final}`);
    [...new Set([...sslog, ...logs])].slice(0, 20).forEach((l) => console.log('   ' + l));
    await p.close();
  }
  await b.close();
})();