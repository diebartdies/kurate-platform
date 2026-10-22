const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const AXE_SOURCE = fs.readFileSync(path.join(__dirname, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');

const BASE = process.argv[2];
const PAGES = process.argv[3].split(',');
const RULES = (process.argv[4] || 'region').split(',');

(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  for (const name of PAGES) {
    const p = await b.newPage();
    await p.setViewport({ width: 1366, height: 900 });
    try {
      await p.goto(`${BASE}/${name}`, { waitUntil: 'networkidle2', timeout: 40000 });
    } catch (e) { console.log(`${name}: nav fail`); await p.close(); continue; }
    await new Promise((r) => setTimeout(r, 900));
    await p.evaluate(AXE_SOURCE);
    const res = await p.evaluate(async (rules) => {
      // eslint-disable-next-line no-undef
      return await axe.run(document, { runOnly: { type: 'rule', values: rules } });
    }, RULES);
    console.log(`\n######## ${name} ########`);
    for (const v of res.violations) {
      console.log(`  -- ${v.id}: ${v.nodes.length} node(s)`);
      for (const n of v.nodes) {
        console.log(`     ${JSON.stringify(n.target)}`);
        console.log(`        ${(n.html || '').slice(0, 150).replace(/\s+/g, ' ')}`);
      }
    }
    await p.close();
  }
  await b.close();
})();
