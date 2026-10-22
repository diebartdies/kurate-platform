/**
 * Verifica que los filtros de hogar.html reflejen los parametros de la URL.
 * Uso: node scripts/check-filtros-url.js "<url>"
 */
const puppeteer = require('puppeteer');

const url = process.argv[2] || 'https://kurate.drsrv.net.ar/hogar.html?accion=reparar&service=hogar%2Flinea-blanca%2Fheladera&provincia=CABA&ciudad=Villa+Urquiza';

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const errores = [];
  page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errores.push('console: ' + m.text()); });

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2500));

  const out = await page.evaluate(() => {
    const val = (id) => {
      const el = document.getElementById(id);
      if (!el) return '(no existe)';
      const opt = el.options[el.selectedIndex];
      return (el.value || '(vacio)') + '  [' + (opt ? opt.textContent : '-') + ']  opciones=' + el.options.length + (el.disabled ? '  disabled' : '');
    };
    const cards = document.querySelectorAll('#hogarGrid .hogar-card, #hogarGrid > *').length;
    const txt = (document.getElementById('hogarLoader') || {}).textContent || '';
    return {
      accion: val('fAction'), provincia: val('fProvince'), ciudad: val('fCity'),
      servicio: val('fService'), marca: val('fBrand'),
      resultados: cards, loader: txt.trim(),
      url: location.search
    };
  });

  console.log(url);
  Object.keys(out).forEach((k) => console.log(`  ${k.padEnd(10)} ${out[k]}`));
  if (errores.length) { console.log('\nERRORES JS:'); errores.forEach((e) => console.log('  ' + e)); }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
