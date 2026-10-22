// Test del gating del prototipo IA. NO llama a Ollama: solo ejercita las
// ramas que devuelven antes de pedirle algo al modelo.
//   node scripts/test-ai-advice-gating.js
const path = require('path');

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('OK    ' + label); }
  else { fail++; console.log('FALLA ' + label + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}

// Stub de res
function mkRes() {
  const r = { statusCode: 200, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}

function reload(enabled) {
  // Se inyecta el config en el require cache en vez de tocar process.env:
  // dotenv (dotenvx) resetea process.env en background cuando cambia .env y
  // arruinaria la seccion "deshabilitado" de este test.
  const cfgPath = require.resolve('../config/appConfig');
  const real = require(cfgPath);
  require.cache[cfgPath] = {
    id: cfgPath, filename: cfgPath, loaded: true, exports: real,
    aiAdviceStub: true,
    ...real,
    aiAdvice: { ...real.aiAdvice, enabled: !!enabled }
  };
  const ctrlPath = require.resolve('../controllers/aiController');
  delete require.cache[ctrlPath];
  return require('../controllers/aiController');
}

console.log('--- 1) DESHABILITADO (default, produccion) ---');
{
  const c = reload(undefined);
  const r1 = mkRes(); c.getStatus({}, r1);
  check('GET /ai/status responde 404', r1.statusCode === 404, r1.statusCode);
  check('el 404 no dice nada de infraestructura', r1.body && r1.body.error === 'not available', r1.body);

  const r2 = mkRes(); c.ask({ body: { question: 'hola' } }, r2);
  check('POST /ai/advice responde 404 sin preguntar nada al modelo', r2.statusCode === 404, r2.statusCode);
}

console.log('\n--- 2) HABILITADO (dev) ---');
{
  const c = reload(true);
  const r1 = mkRes(); c.getStatus({}, r1);
  check('GET /ai/status responde 200 con el modelo', r1.statusCode === 200 && r1.body.data.model === 'qwen2.5-coder', r1.body);
  check('el status expone el enabled', r1.body.data.enabled === true, r1.body.data);

  const r2 = mkRes(); c.ask({ body: {} }, r2);
  check('question vacio -> 400', r2.statusCode === 400, r2.statusCode);

  const r3 = mkRes(); c.ask({ body: { question: '   ' } }, r3);
  check('question solo con espacios -> 400', r3.statusCode === 400, r3.statusCode);

  const r4 = mkRes(); c.ask({ body: { question: 'x'.repeat(801) } }, r4);
  check('question de 801 chars -> 400', r4.statusCode === 400, r4.statusCode);
  check('el 400 dice el maximo', /max 800/.test(r4.body.error), r4.body.error);

  const r5 = mkRes(); c.ask({ body: { question: 123 } }, r5);
  check('question no-string -> 400', r5.statusCode === 400, r5.statusCode);

  const r6 = mkRes(); c.ask({}, r6);
  check('sin body -> 400 (no revienta)', r6.statusCode === 400, r6.statusCode);
}

console.log('\n' + pass + ' OK / ' + fail + ' FALLAS  (0 llamadas a Ollama)');
process.exit(fail === 0 ? 0 : 1);
