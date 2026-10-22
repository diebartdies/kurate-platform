// Prueba del prototipo dev contra el Ollama local (no toca la app ni la DB).
//   node scripts/test-ai-advice.js
process.env.AI_ADVICE_ENABLED = 'true';
const { askAdvice, cleanAnswer } = require('../utils/aiAdvice');

const PREGUNTAS = [
  'se me corto la luz y el disyuntor salta cada ratito, que reviso?',
  'huelo a gas en la cocina, que hago ya?'
];

(async () => {
  console.log('Probando adviseAdvice contra Ollama...\n');
  let ok = 0, fail = 0;
  for (const p of PREGUNTAS) {
    const t = Date.now();
    const r = await askAdvice(p);
    if (!r) {
      fail++;
      console.log('FALLA (sin respuesta): "' + p + '"');
      continue;
    }
    ok++;
    console.log('PREGUNTA: ' + p);
    console.log('  modelo=' + r.model + '  ' + r.ms + 'ms  ' + r.advice.length + ' chars');
    console.log('  -> ' + cleanAnswer(r.advice).replace(/\n/g, '\n     '));
    console.log('');
  }
  console.log(ok + ' OK / ' + fail + ' FALLAS');
  process.exit(fail === 0 ? 0 : 1);
})();
