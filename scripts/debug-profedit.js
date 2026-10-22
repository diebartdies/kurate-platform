// Reproduce el bug de los botones de edicion de profDashboard.html en
// produccion y vuelca los errores de consola / peticiones fallidas.
//
//   node scripts/debug-profedit.js [url]
//
// Si no hay TOKEN/USER_ID en el entorno, la pagina redirige al landing y no
// se puede reproducir. Se puede sembrar la sesion con:
//   $env:PROF_TOKEN='...'; $env:PROF_USER='<json del localStorage user>'
const puppeteer = require('puppeteer');

const URL = process.argv[2] || 'https://kurate.drsrv.net.ar/profDashboard.html';

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  const errores = [];
  const warns = [];
  const fallos = [];

  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error') errores.push(t);
    else if (m.type() === 'warning') warns.push(t);
  });
  page.on('pageerror', e => errores.push('PAGEERROR: ' + e.message));
  page.on('requestfailed', r => fallos.push(r.url() + ' -> ' + (r.failure() || {}).errorText));
  page.on('response', r => { if (r.status() >= 400) fallos.push(r.status() + ' ' + r.url()); });

  console.log('=== cargando ' + URL + ' ===');
  try {
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 45000 });
} catch (e) {
  console.log('aviso al cargar: ' + e.message);
}
await new Promise(r => setTimeout(r, 4000));

// Sembrar sesion si viene por env
if (process.env.PROF_TOKEN) {
  await page.evaluate((token) => {
    localStorage.setItem('token', token);
  }, process.env.PROF_TOKEN);
}
if (process.env.PROF_USER) {
  try {
    const u = JSON.parse(process.env.PROF_USER);
    await page.evaluate((usr) => {
      localStorage.setItem('user', JSON.stringify(usr));
    }, u);
  } catch (e) { console.log('USER no parseable: ' + e.message); }
}
if (process.env.PROF_TOKEN || process.env.PROF_USER) {
  console.log('sesion sembrada, recargando...');
  try { await page.goto(URL, { waitUntil: 'networkidle2', timeout: 45000 }); } catch (e) { }
  await new Promise(r => setTimeout(r, 5000));
}

  const info = await page.evaluate(() => {
    const btn = document.getElementById('profDashEditBtn');
    const content = document.getElementById('profDashboardContent');
    return {
      titulo: document.title,
      hayContent: !!content,
      contentHTMLLength: content ? content.innerHTML.length : 0,
      contentTexto: content ? content.innerText.slice(0, 200) : '(sin content)',
      hayEditBtn: !!btn,
      editBtnTexto: btn ? btn.innerText.trim() : '(no existe)',
      editBtnVisible: btn ? !!(btn.offsetParent || btn.getClientRects().length) : false,
      hayLoader: !!document.querySelector('#profDashboardLayout .loader:not(.hidden)'),
      layoutOculto: (() => { const l = document.getElementById('profDashboardLayout'); return l ? l.classList.contains('hidden') : null; })(),
      camposEditable: ['upAlias', 'upMobilePhone', 'upBio', 'upCity'].map(id => {
        const el = document.getElementById(id);
        return { id, existe: !!el, disabled: el ? el.disabled : null };
      }),
      haySaveBtn: !!document.getElementById('explicitSaveBtn'),
      saveOculto: (() => { const s = document.getElementById('explicitSaveBtn'); return s ? s.classList.contains('hidden') : null; })()
    };
  });

  console.log('\n=== ESTADO DEL DOM ===');
  console.log(JSON.stringify(info, null, 2));

  // intentar clickear el boton de editar
  const click = await page.evaluate(() => {
    const btn = document.getElementById('profDashEditBtn');
    if (!btn) return { resultado: 'no existe el boton' };
    btn.click();
    const alias = document.getElementById('upAlias');
    return {
      resultado: 'click ejecutado',
      aliasDisabledDespues: alias ? alias.disabled : 'no existe upAlias',
      botonTextoDespues: btn.innerText.trim()
    };
  });
  console.log('\n=== TRAS CLICK EN EDITAR ===');
  console.log(JSON.stringify(click, null, 2));

  console.log('\n=== ERRORES DE CONSOLA (' + errores.length + ') ===');
  errores.slice(0, 25).forEach(e => console.log('  ' + e.slice(0, 300)));
  console.log('\n=== PETICIONES FALLIDAS (' + fallos.length + ') ===');
  fallos.slice(0, 25).forEach(f => console.log('  ' + f.slice(0, 220)));
  if (warns.length) {
    console.log('\n=== WARNINGS (' + warns.length + ') ===');
    warns.slice(0, 10).forEach(w => console.log('  ' + w.slice(0, 200)));
  }

  await browser.close();
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
