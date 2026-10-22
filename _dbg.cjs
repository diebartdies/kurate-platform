const puppeteer = require('puppeteer');
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage();
  const resp = await p.goto('http://192.168.1.95:5000/index.html', { waitUntil: 'networkidle2' });
  console.log('status:', resp.status());
  console.log('final url:', p.url());
  console.log('content-type:', resp.headers()['content-type']);
  const html = await p.content();
  console.log('body length:', html.length);
  console.log('--- first 500 chars ---');
  console.log(html.slice(0, 500));
  console.log('--- title/lang as axe sees them ---');
  console.log('title:', await p.title());
  console.log('lang:', await p.evaluate(() => document.documentElement.getAttribute('lang')));
  await b.close();
})();
