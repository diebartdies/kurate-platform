const fs = require('fs');
const puppeteer = require('puppeteer');
const AXE_SOURCE = fs.readFileSync('node_modules/axe-core/axe.min.js', 'utf8');

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
  const token = data.token;
  for (const name of PAGES) {
    const p = await b.newPage();
    await p.setViewport({ width: 1366, height: 900 });
    await p.evaluateOnNewDocument((t, u) => {
      localStorage.setItem('token', t);
      localStorage.setItem('user', JSON.stringify(u || {}));
    }, token, data.user);
    await p.goto(`${BASE}/${name}`, { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1500));
    const info = await p.evaluate(() => ({
      url: location.pathname,
      headers: [...document.querySelectorAll('h1,h2,h3,h4')].map((h) => `${h.tagName}:"${(h.textContent||'').trim().slice(0,50)}"`),
      mains: document.querySelectorAll('main').length
    }));
    console.log(`${name} -> url:${info.url} mains:${info.mains}`);
    info.headers.forEach((x) => console.log('   ' + x));
    await p.close();
  }
  await b.close();
})();