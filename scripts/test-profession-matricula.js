/**
 * Prueba local del filtro profession/matriculado.
 * Usa un usuario professional real contra el backend LOCAL para verificar que
 *   1) el PUT guarda la matriculacion,
 *   2) "matriculado=1" solo devuelve matriculados,
 *   3) la respuesta publica NO filtra matriculaNumero ni matriculaFoto.
 */
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/kurate_local';
const mongoose = require('mongoose');
const User = require('../models/User');

const BASE = process.env.TEST_BASE || 'http://localhost:3000';
const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('OK    ' + label); }
  else { fail++; console.log('FALLA ' + label + (extra ? ' -> ' + JSON.stringify(extra) : '')); }
}

(async () => {
  if (!EMAIL || !PASSWORD) {
    console.log('Falta TEST_EMAIL / TEST_PASSWORD: se aborta la prueba (no se adivinan credenciales).');
    process.exit(2);
  }

  // --- login ---
  const lr = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  });
  const lj = await lr.json();
  if (!lr.ok || !lj.token) {
    console.log('Login fallo (' + lr.status + '): ' + JSON.stringify(lj));
    process.exit(2);
  }
  const auth = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + lj.token };
  console.log('Login OK como ' + (lj.user && lj.user.email) + ' (rol ' + (lj.user && lj.user.role) + ')\n');

  const me = await User.findOne({ email: EMAIL.toLowerCase() }).lean();
  const original = JSON.parse(JSON.stringify(me.hogarProfile.professions || []));
  console.log('Profesiones originales: ' + JSON.stringify(original.map(p => ({ slug: p.slug, matriculado: !!p.matriculado }))) + '\n');

  try {
    // --- 1) PUT con matriculacion ---
    const put1 = await fetch(`${BASE}/api/v1/professionals/professions`, {
      method: 'PUT', headers: auth,
      body: JSON.stringify({ professions: [
        { slug: 'gasista', matriculado: true, matriculaNumero: 'TEST-1234' },
        { slug: 'electricista', matriculado: false }
      ] })
    });
    const put1j = await put1.json();
    check('PUT profesiones acepta matriculado + numero', put1.ok && put1j.success, put1j);

    let after = await User.findById(me._id).lean();
    const gasista = (after.hogarProfile.professions || []).find(p => p.slug === 'gasista');
    const elec = (after.hogarProfile.professions || []).find(p => p.slug === 'electricista');
    check('gasista queda matriculado=true', gasista && gasista.matriculado === true, gasista);
    check('gasista guarda el numero', gasista && gasista.matriculaNumero === 'TEST-1234', gasista && gasista.matriculaNumero);
    check('hogarProfile y professionalProfile quedan sincronizados',
      JSON.stringify((after.professionalProfile.professions || []).map(p => p.slug).sort()) ===
      JSON.stringify((after.hogarProfile.professions || []).map(p => p.slug).sort()));
    check('electricista NO matriculado queda matriculado=false', elec && elec.matriculado === false, elec);

    // --- 2) PUT que omite matriculado NO debe borrar la matriculacion ---
    const put2 = await fetch(`${BASE}/api/v1/professionals/professions`, {
      method: 'PUT', headers: auth,
      body: JSON.stringify({ professions: [{ slug: 'gasista', name: 'Gasista' }] })
    });
    await put2.json();
    after = await User.findById(me._id).lean();
    const g2 = (after.hogarProfile.professions || []).find(p => p.slug === 'gasista');
    check('payload sin el campo "matriculado" conserva la matriculacion (fix admin)',
      g2 && g2.matriculado === true && g2.matriculaNumero === 'TEST-1234', g2);

    // --- 3) matriculado=true sin numero ni foto debe ser rechazado ---
    const put3 = await fetch(`${BASE}/api/v1/professionals/professions`, {
      method: 'PUT', headers: auth,
      body: JSON.stringify({ professions: [{ slug: 'electricista', matriculado: true, matriculaNumero: '' }] })
    });
    const put3j = await put3.json();
    check('matriculado sin numero ni foto se rechaza', put3.status === 400, { status: put3.status, body: put3j });

    // --- 4) profesion inexistente se rechaza ---
    const put4 = await fetch(`${BASE}/api/v1/professionals/professions`, {
      method: 'PUT', headers: auth,
      body: JSON.stringify({ professions: [{ slug: 'no-existe-este-oficio' }] })
    });
    check('profesion desconocida se rechaza (400)', put4.status === 400, put4.status);

    // --- 5) filtro: matriculado=1 + profession solo trae matriculados ---
    const q1 = await (await fetch(`${BASE}/api/v1/hogar/professionals?profession=gasista&matriculado=1&limit=50`)).json();
    const rows1 = (q1.data || []).map(r => {
      const pr = (r.hogarProfile && r.hogarProfile.professions) || r.professions || [];
      return pr.find(p => p.slug === 'gasista');
    }).filter(Boolean);
    check('?profession=gasista&matriculado=1 devuelve solo matriculados',
      rows1.length > 0 && rows1.every(p => p.matriculado === true), { total: rows1.length, valores: rows1.map(p => p.matriculado) });

    const q2 = await (await fetch(`${BASE}/api/v1/hogar/professionals?profession=gasista&limit=50`)).json();
    const rows2 = ((q2.data || []).flatMap(r => (r.hogarProfile && r.hogarProfile.professions) || [])).filter(p => p.slug === 'gasista');
    check('?profession=gasista SIN matriculado incluye no matriculados',
      rows2.length >= rows1.length, { sinFiltro: rows2.length, soloMatriculados: rows1.length });

    const q3 = await (await fetch(`${BASE}/api/v1/hogar/professionals?matriculado=1&limit=50`)).json();
    const rows3 = ((q3.data || []).flatMap(r => (r.hogarProfile && r.hogarProfile.professions) || [])).filter(p => p.matriculado === true);
    check('?matriculado=1 sin profesion devuelve alguno matriculado', rows3.length > 0, rows3.length);

    // --- 6) la respuesta publica NO filtra datos privados ---
    const leak = [];
    const scan = (rows) => rows.forEach(r => {
      ['hogarProfile', 'professionalProfile'].forEach(k => {
        const prs = r[k] && r[k].professions;
        (Array.isArray(prs) ? prs : []).forEach(p => {
          if (p.matriculaNumero) leak.push({ donde: 'listado.' + k, campo: 'matriculaNumero', valor: p.matriculaNumero });
          if (p.matriculaFoto) leak.push({ donde: 'listado.' + k, campo: 'matriculaFoto', valor: p.matriculaFoto });
        });
      });
    });
    scan(q1.data || []); scan(q2.data || []); scan(q3.data || []);
    check('el listado publico NO expone matriculaNumero ni matriculaFoto', leak.length === 0, leak);

    const det = await (await fetch(`${BASE}/api/v1/hogar/professionals/${me._id}`)).json();
    const leakDet = [];
    ['hogarProfile', 'professionalProfile'].forEach(k => {
      const prs = det.data && det.data[k] && det.data[k].professions;
      (Array.isArray(prs) ? prs : []).forEach(p => {
        if (p.matriculaNumero) leakDet.push({ donde: 'detalle.' + k, campo: 'matriculaNumero' });
        if (p.matriculaFoto) leakDet.push({ donde: 'detalle.' + k, campo: 'matriculaFoto' });
      });
    });
    check('la ficha publica NO expone matriculaNumero ni matriculaFoto', leakDet.length === 0, leakDet);

    // --- 7) la matriculacion ajena no se puede ver ---
    const ajena = await fetch(`${BASE}/api/v1/professionals/matricula/electricista`, { headers: { Authorization: 'Bearer ' + lj.token } });
    check('GET matricula de otro oficio responde 4xx', ajena.status === 403 || ajena.status === 404, ajena.status);

  } finally {
    // --- restauracion ---
    const restore = await fetch(`${BASE}/api/v1/professionals/professions`, {
      method: 'PUT', headers: auth, body: JSON.stringify({ professions: original })
    });
    const back = await User.findById(me._id).lean();
    console.log('\nRestaurado: ' + JSON.stringify((back.hogarProfile.professions || []).map(p => ({ slug: p.slug, matriculado: !!p.matriculado, n: p.matriculaNumero || '' }))));
    console.log('Restore HTTP ' + restore.status);
    await mongoose.disconnect();
  }

  console.log('\n' + pass + ' OK / ' + fail + ' FALLAS');
  process.exit(fail === 0 ? 0 : 1);
})().catch(async (e) => {
  console.error('Error inesperado: ' + e.message);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
