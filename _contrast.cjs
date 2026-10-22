const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const AXE_SOURCE = fs.readFileSync(path.join(__dirname, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');

const BASE = process.argv[2];
const PAGES = (process.argv[3] || 'hogar.html,avisos.html,precios-aire-acondicionado.html').split(',');

(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  for (const name of PAGES) {
    const p = await b.newPage();
    await p.setViewport({ width: 1366, height: 900 });
    await p.goto(`${BASE}/${name}`, { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 700));
    await p.evaluate(AXE_SOURCE);
    const res = await p.evaluate(async () => {
      // eslint-disable-next-line no-undef
      return await axe.run(document, { runOnly: { type: 'rule', values: ['color-contrast'] } });
    });
    console.log(`\n######## ${name} ########`);
    if (!res.violations.length) { console.log('  (none)'); await p.close(); continue; }
    for (const v of res.violations) {
      for (const n of v.nodes) {
        console.log('\n  target:', JSON.stringify(n.target));
        console.log('  html  :', (n.html || '').slice(0, 220));
        console.log('  why   :', (n.failureSummary || '').replace(/\n/g, ' | '));
      }
    }
    await p.close();
  }
  await b.close();
})();
