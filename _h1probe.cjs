const puppeteer = require('puppeteer');
const axe = require('axe-core');
const BASE = process.argv[2];
const PAGE = process.argv[3];
const WAIT_MS = parseInt(process.argv[4] || '2500', 10);

(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1366, height: 900 });
  await p.setCacheEnabled(false);
  await p.goto(`${BASE}/${PAGE}`, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise((r) => setTimeout(r, 1200));
  await p.addScriptTag({ content: axe.source });
  for (const t of [WAIT_MS, 5000]) {
    if (process.argv[4] && t !== WAIT_MS) continue;
    if (!process.argv[4] && t === 5000) await new Promise((r) => setTimeout(r, 5000 - WAIT_MS < 0 ? 0 : 5000 - WAIT_MS));
    const res = await p.evaluate(() => {
      const h1s = [...document.querySelectorAll('h1')].map((h) => {
        const cs = getComputedStyle(h);
        const r = h.getBoundingClientRect();
        return { text: h.textContent.trim(), display: cs.display, visibility: cs.visibility, w: r.width, h: r.height };
      });
      return { url: location.pathname, h1s };
    });
    const v = await p.evaluate(() => axe.run(document, { runOnly: { type: 'rule', values: ['page-has-heading-one', 'region'] } }).then((r) => r.violations.map((x) => ({ id: x.id, nodes: x.nodes.map((n) => n.target) }))));
    console.log(`PAGE ${PAGE} at ~${t}ms ->`, JSON.stringify({ ...res, axe: v }));
  }
  await b.close();
})();