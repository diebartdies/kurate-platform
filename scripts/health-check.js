const path = require('path');

const BASE = (process.argv[2] && process.argv[2].startsWith('http')
  ? process.argv[2]
  : (process.env.BASE || 'https://kurate.drsrv.net.ar')).replace(/\/$/, '');

const SECTIONS = (process.argv[3] || process.env.ONLY || 'http,locations,directory,static,auth,db')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

const STATIC_PAGES = [
  '/', '/hogar.html', '/hogar-detail.html', '/avisos.html', '/login.html',
  '/register.html', '/recover.html', '/verify.html', '/set-password.html',
  '/feedback.html', '/precios-aire-acondicionado.html',
  '/conciencia-vih.html', '/conciencia-cancer-mama.html'
];

const results = [];
let currentSection = '';

function section(name) { currentSection = name; console.log(`\n--- ${name} ---`); }

async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ section: currentSection, name, ok: true, detail: detail || '' });
    console.log(`  OK   ${name}${detail ? ' — ' + detail : ''}`);
  } catch (err) {
    results.push({ section: currentSection, name, ok: false, detail: err.message });
    console.log(`  FAIL ${name} — ${err.message}`);
  }
}

function warn(name, detail) {
  results.push({ section: currentSection, name, ok: true, warn: true, detail });
  console.log(`  WARN ${name} — ${detail}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, opts) {
  const res = await fetch(url, opts);
  let body = null;
  try { body = await res.json(); } catch (e) { body = null; }
  return { res, body };
}

async function runHttp() {
  section('http');
  await check('home responde 200', async () => {
    const r = await fetch(BASE + '/');
    if (r.status !== 200) throw new Error('status ' + r.status);
    return BASE;
  });
  await check('provincias API responde', async () => {
    const { res, body } = await getJson(BASE + '/api/v1/locations/provinces');
    if (res.status !== 200) throw new Error('status ' + res.status);
    const n = (body && body.data) ? body.data.length : 0;
    if (!n) throw new Error('lista vacía');
    return n + ' provincias';
  });
  await check('servicios API responde', async () => {
    const { res, body } = await getJson(BASE + '/api/v1/services');
    if (res.status !== 200) throw new Error('status ' + res.status);
    if (!body || !body.success || !body.data) throw new Error('respuesta sin data');
    const n = Array.isArray(body.data) ? body.data.length : Object.keys(body.data).length;
    if (!n) throw new Error('árbol de servicios vacío');
    return n + ' áreas de servicio';
  });
}

async function runLocations() {
  section('locations');
  const { body } = await getJson(BASE + '/api/v1/locations/provinces');
  const provinces = (body && body.data) ? body.data.map((p) => p.name) : [];
  if (!provinces.length) { results.push({ section: 'locations', name: 'listar provincias', ok: false, detail: 'sin provincias' }); return; }

  await check('CABA está en la lista de provincias', () => {
    if (!provinces.some((p) => p.toUpperCase() === 'CABA')) throw new Error('CABA ausente');
    return provinces.length + ' provincias';
  });

  await check('CABA lista barrios (no ciudades)', async () => {
    const r = await getJson(BASE + '/api/v1/locations/provinces/name/CABA/cities');
    if (r.res.status !== 200) throw new Error('status ' + r.res.status);
    const list = Array.isArray(r.body) ? r.body : [];
    if (!list.length) throw new Error('CABA devolvió 0 localidades');
    const names = list.map((c) => c.name);
    if (!names.includes('Palermo')) throw new Error('no incluye Palermo (¿no son barrios?)');
    return list.length + ' barrios (incluye Palermo)';
  });

  const others = provinces.filter((p) => p.toUpperCase() !== 'CABA');
  for (const p of others.slice(0, 3)) {
    await check(`${p} lista ciudades`, async () => {
      const r = await getJson(BASE + '/api/v1/locations/provinces/name/' + encodeURIComponent(p) + '/cities');
      if (r.res.status !== 200) throw new Error('status ' + r.res.status);
      const list = Array.isArray(r.body) ? r.body : [];
      if (!list.length) throw new Error('0 ciudades');
      return list.length + ' ciudades';
    });
    await sleep(120);
  }

  const empties = [];
  for (const p of provinces) {
    const r = await getJson(BASE + '/api/v1/locations/provinces/name/' + encodeURIComponent(p) + '/cities');
    if (r.res.status !== 200) { empties.push(p + ' (HTTP ' + r.res.status + ')'); }
    else if (!Array.isArray(r.body) || !r.body.length) empties.push(p + ' (0)');
    await sleep(120);
  }
  await check('todas las provincias devuelven 200 con contenido', () => {
    if (empties.length) throw new Error('sin contenido: ' + empties.join(', '));
    return provinces.length + ' provincias verificadas';
  });
}

async function runDirectory() {
  section('directory');
  await check('directorio hogar responde con técnicos', async () => {
    const { res, body } = await getJson(BASE + '/api/v1/hogar/professionals?limit=5&page=1');
    if (res.status !== 200) throw new Error('status ' + res.status);
    if (!body || !body.success) throw new Error('success=false');
    const n = (body.data || []).length;
    if (!n) throw new Error('0 resultados');
    return n + ' resultados';
  });
  await check('filtro provincia=CABA devuelve técnicos', async () => {
    const { res, body } = await getJson(BASE + '/api/v1/hogar/professionals?limit=50&page=1&province=CABA');
    if (res.status !== 200) throw new Error('status ' + res.status);
    if (!body || !body.success) throw new Error('success=false');
    const n = (body.data || []).length;
    if (!n) throw new Error('0 resultados para CABA');
    return n + ' resultados en CABA';
  });
  await check('filtro area=hogar responde', async () => {
    const { res, body } = await getJson(BASE + '/api/v1/hogar/professionals?limit=5&page=1&area=hogar');
    if (res.status !== 200) throw new Error('status ' + res.status);
    if (!body || !body.success) throw new Error('success=false');
    return (body.data || []).length + ' resultados';
  });
  // Los paths se derivan de data/serviceTree.js: si el arbol cambia, el check
  // sigue apuntando a dispositivos y categorias que existen de verdad.
  const serviceTree = require('../data/serviceTree');
  const hogar = serviceTree.find((a) => a.id === 'hogar') || serviceTree[0];
  const hogarCat = hogar.categories.find((c) => /baño|sanitari/i.test(c.name) && c.devices.some((d) => /inodoros|bidet/i.test(d.name))) || hogar.categories[0];
  const inodoros = hogarCat.devices.find((d) => /inodoros|bidet/i.test(d.name)) || hogarCat.devices[0];
  const lavamanos = hogarCat.devices.find((d) => /lavamanos/i.test(d.name)) || hogarCat.devices[0];
  const svcPath = `${hogar.id}/${hogarCat.id}/${inodoros.id}`;
  const catPath = `${hogar.id}/${hogarCat.id}`;
  await check('filtro service (path completo del árbol) devuelve resultados', async () => {
    const { res, body } = await getJson(BASE + '/api/v1/hogar/professionals?limit=50&page=1&service=' + encodeURIComponent(svcPath));
    if (res.status !== 200) throw new Error('status ' + res.status);
    if (!body || !body.success) throw new Error('success=false');
    const n = (body.data || []).length;
    if (!n) throw new Error('0 resultados para ' + svcPath + ' (¿acentos o path rotos?)');
    return n + ' resultados · ' + svcPath;
  });
  await check('filtro service por slug de dispositivo', async () => {
    const { res, body } = await getJson(BASE + '/api/v1/hogar/professionals?limit=50&page=1&service=' + encodeURIComponent(lavamanos.id));
    if (res.status !== 200) throw new Error('status ' + res.status);
    const n = body && body.success ? (body.data || []).length : 0;
    if (!n) throw new Error('0 resultados para ' + lavamanos.id);
    return n + ' resultados · ' + lavamanos.id;
  });
  await check('filtro categoría (descendientes)', async () => {
    const { res, body } = await getJson(BASE + '/api/v1/hogar/professionals?limit=50&page=1&service=' + encodeURIComponent(catPath));
    if (res.status !== 200) throw new Error('status ' + res.status);
    const n = body && body.success ? (body.data || []).length : 0;
    if (!n) throw new Error('0 resultados para la categoría ' + catPath);
    return n + ' resultados · ' + catPath;
  });
  await check('filtro ciudad (Palermo) devuelve resultados', async () => {
    const { res, body } = await getJson(BASE + '/api/v1/hogar/professionals?limit=50&page=1&city=Palermo');
    if (res.status !== 200) throw new Error('status ' + res.status);
    const n = body && body.success ? (body.data || []).length : 0;
    if (!n) throw new Error('0 resultados para city=Palermo');
    return n + ' resultados';
  });
}

async function runStatic() {
  section('static');
  for (const p of STATIC_PAGES) {
    await check(`${p} responde 200 con <h1>`, async () => {
      const r = await fetch(BASE + p);
      if (r.status !== 200) throw new Error('status ' + r.status);
      const html = await r.text();
      if (!/<h1[\s>]/i.test(html)) throw new Error('sin <h1> visible en el HTML');
      return Math.round(html.length / 1024) + ' KB';
    });
  }
  const assets = new Set();
  for (const p of ['/', '/login.html', '/hogar.html']) {
    const html = await (await fetch(BASE + p)).text();
    const re = /(?:src|href)="(\/(?:js|css)\/[^"]+)"/g;
    let m;
    while ((m = re.exec(html))) assets.add(m[1]);
  }
  const broken = [];
  for (const a of assets) {
    const r = await fetch(BASE + a);
    if (r.status !== 200) broken.push(a + ' → ' + r.status);
  }
  await check('assets /js y /css referenciados cargan 200', () => {
    if (broken.length) throw new Error(broken.join(', '));
    return assets.size + ' assets';
  });
}

async function runAuth() {
  section('auth');
  const email = process.env.A11Y_PRO_EMAIL;
  const password = process.env.A11Y_PRO_PASSWORD;
  if (!email || !password) { warn('auth', 'sin A11Y_PRO_EMAIL/A11Y_PRO_PASSWORD — omitida'); return; }
  let token = null;
  await check('login pro responde 200 con token', async () => {
    const r = await getJson(BASE + '/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (r.res.status !== 200) throw new Error('status ' + r.res.status);
    token = r.body && r.body.data ? (r.body.data.token || r.body.data.accessToken) : (r.body && r.body.token);
    if (!token) throw new Error('sin token en la respuesta');
    return r.body.data && r.body.data.user ? r.body.data.user.email : 'ok';
  });
  if (!token) return;
  const h = { Authorization: 'Bearer ' + token };
  for (const [label, url] of [
    ['avisos/mis-avisos', '/api/v1/avisos/mis-avisos'],
    ['avisos/expiring', '/api/v1/avisos/expiring'],
    ['professionals/me', '/api/v1/professionals/me'],
    ['stats/professional', '/api/v1/stats/professional?months=12']
  ]) {
    await check(`${label} responde 200 con Authorization`, async () => {
      const r = await getJson(BASE + url, { headers: h });
      if (r.res.status !== 200) throw new Error('status ' + r.res.status);
      return 'ok';
    });
  }
  await check('sin token responde 401 (protección activa)', async () => {
    const r = await getJson(BASE + '/api/v1/avisos/mis-avisos');
    if (r.res.status !== 401) throw new Error('status ' + r.res.status + ' (se esperaba 401)');
    return '401 correcto';
  });
}

async function runDb() {
  section('db');
  let mongoose;
  try { mongoose = require('mongoose'); } catch (e) { warn('db', 'mongoose no disponible —omitida'); return; }
  const uri = process.env.MONGO_URI;
  if (!uri) { warn('db', 'sin MONGO_URI — omitida'); return; }
  let conn;
  try {
    conn = await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverSelectionTimeoutMS: 8000 });
  } catch (err) {
    results.push({ section: 'db', name: 'conexión Mongo', ok: false, detail: err.message });
    console.log('  FAIL conexión Mongo — ' + err.message);
    return;
  }
  results.push({ section: 'db', name: 'conexión Mongo', ok: true, detail: 'ok' });
  console.log('  OK   conexión Mongo — ok');
  const db = conn.connection.db;
  const OID = mongoose.Types.ObjectId;

  await check('ping del servidor Mongo', async () => {
    await db.admin().ping();
    return 'ok';
  });

  const cols = await db.listCollections().toArray();
  const names = cols.map((c) => c.name);
  const key = (n) => names.find((x) => x === n) || names.find((x) => new RegExp('^' + n + '$', 'i').test(x));
  for (const n of ['users', 'provinces', 'cities', 'neighborhoods', 'services', 'avisos']) {
    await check(`colección ${n} existe y tiene documentos`, async () => {
      const c = key(n);
      if (!c) throw new Error('colección ausente');
      const cnt = await db.collection(c).countDocuments();
      if (!cnt) throw new Error('0 documentos');
      return cnt + ' docs';
    });
  }

  await check('CABA tiene barrios cargados', async () => {
    const prov = await db.collection(key('provinces')).findOne({ name: /^CABA$/i });
    if (!prov) throw new Error('provincia CABA ausente');
    const cnt = await db.collection(key('neighborhoods')).countDocuments({ province: prov._id });
    if (!cnt) throw new Error('0 barrios');
    return cnt + ' barrios';
  });

  await check('provincias sin ciudades (CABA usa barrios)', async () => {
    const provs = await db.collection(key('provinces')).find({}).toArray();
    const cities = db.collection(key('cities'));
    const missing = [];
    for (const p of provs) {
      if (p.name === 'CABA') continue;
      const cnt = await cities.countDocuments({ province: p._id });
      if (!cnt) missing.push(p.name);
    }
    if (missing.length) throw new Error('sin ciudades: ' + missing.join(', '));
    return provs.length + ' provincias cubiertas';
  });

  await check('ciudades huérfanas (provincia inexistente)', async () => {
    const provIds = new Set((await db.collection(key('provinces')).find({}, { projection: { _id: 1 } }).toArray()).map((p) => String(p._id)));
    const orphan = await db.collection(key('cities')).countDocuments({ province: { $nin: [...provIds].map((id) => new OID(id)) } });
    if (orphan) throw new Error(orphan + ' ciudades sin provincia válida');
    return '0 huérfanas';
  });

  await check('emails de usuario duplicados', async () => {
    const dupes = await db.collection(key('users')).aggregate([
      { $group: { _id: '$email', n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }, { $limit: 5 }
    ]).toArray();
    if (dupes.length) throw new Error(dupes.length + '+ duplicados (ej. ' + dupes[0]._id + ')');
    return '0 duplicados';
  });

  await check('índice único de email en users', async () => {
    const idx = await db.collection(key('users')).indexes();
    const uniq = idx.some((i) => i.unique && (i.key && i.key.email));
    if (!uniq) throw new Error('no hay índice único en email');
    return 'presente';
  });

  await mongoose.disconnect();
}

(async () => {
  if (SECTIONS.includes('http')) await runHttp();
  if (SECTIONS.includes('locations')) await runLocations();
  if (SECTIONS.includes('directory')) await runDirectory();
  if (SECTIONS.includes('static')) await runStatic();
  if (SECTIONS.includes('auth')) await runAuth();
  if (SECTIONS.includes('db')) await runDb();

  const fails = results.filter((r) => !r.ok);
  const warns = results.filter((r) => r.warn);
  console.log('\n========================================');
  console.log(`Total: ${results.length}   OK: ${results.length - fails.length}   FAIL: ${fails.length}   WARN: ${warns.length}`);
  if (fails.length) {
    console.log('\nFallos:');
    fails.forEach((f) => console.log(`  - [${f.section}] ${f.name}: ${f.detail}`));
  }
  console.log('========================================');
  process.exit(fails.length ? 1 : 0);
})();
