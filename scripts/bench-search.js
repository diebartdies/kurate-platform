// Medicion de la busqueda publica sin instalar nada (sin dependencias).
// Complementa a perf/gatling/SearchSimulation.js, que da el reporte HTML.
//
//   node scripts/bench-search.js                 # latencia de 4 consultas
//   node scripts/bench-search.js --load 20       # 20 usuarios virtuales
//   node scripts/bench-search.js --explain       # guarda la consulta para explain
//
// OJO: --explain imprime el filtro de Mongo, no lo ejecuta. Para el explain real
// hay que correrlo dentro del contenedor contra produccion.
const BASE = process.env.BASE_URL || 'https://kurate.drsrv.net.ar';

const CONSULTAS = [
  { nombre: 'area', q: 'area=hogar' },
  { nombre: 'categoria', q: 'area=hogar&service=hogar%2Flinea-blanca' },
  { nombre: 'dispositivo', q: 'area=hogar&service=hogar%2Flinea-blanca%2Fheladera' },
  { nombre: 'profesion', q: 'area=hogar&profession=gasista' },
  { nombre: 'solo matriculados', q: 'area=hogar&matriculado=1' },
  { nombre: 'profesion + matriculado', q: 'area=hogar&profession=gasista&matriculado=1' },
  { nombre: 'provincia', q: 'area=hogar&province=CABA' }
];

function stats(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const pct = p => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return {
    min: Math.round(s[0]),
    p50: Math.round(pct(0.5)),
    p95: Math.round(pct(0.95)),
    p99: Math.round(pct(0.99)),
    max: Math.round(s[s.length - 1]),
    promedio: Math.round(s.reduce((a, b) => a + b, 0) / s.length)
  };
}

async function medir(url, n, conc) {
  const tiempos = [];
  let errores = 0;
  let ultimoJson = null;
  let semUsuarios = 0;

  async function worker(id) {
    for (let i = 0; i < n; i++) {
      const t0 = process.hrtime.bigint();
      try {
        const r = await fetch(url, { headers: { Accept: 'application/json' } });
        const txt = await r.text();
        if (r.status !== 200) errores++;
        else {
          try {
            const j = JSON.parse(txt);
            ultimoJson = j;
            if (j && j.success === false) errores++;
          } catch (e) { /* respuesta no-JSON */ }
        }
        if (txt) semUsuarios++;
      } catch (e) { errores++; }
      const t1 = process.hrtime.bigint();
      tiempos.push(Number(t1 - t0) / 1e6);
      await new Promise(r => setTimeout(r, 100 + Math.random() * 200));
    }
  }

  await Promise.all(Array.from({ length: conc }, (_, i) => worker(i)));
  return { tiempos, errores, ultimoJson, semUsuarios };
}

async function main() {
  const wantExplain = process.argv.includes('--explain');
  const li = process.argv.indexOf('--load');
  const usuarios = li !== -1 ? parseInt(process.argv[li + 1], 10) : 0;

  console.log('destino: ' + BASE);
  console.log('');

  if (wantExplain) {
    console.log('=== filtros de Mongo para verificar con explain() ===');
    console.log('Ejecutar dentro del contenedor:');
    console.log('  docker exec -it KuraTe_app mongosh kurate --eval \'(q)=>db.users.find(q).explain("executionStats")\' --eval \'');
    CONSULTAS.forEach(c => {
      console.log('  // ' + c.nombre);
      console.log('  ' + JSON.stringify({ 'hogarProfile.servicePaths': { $in: ['hogar/linea-blanca/heladera'] }, role: 'professional' }));
    });
    console.log('');
    return;
  }

  const nPorUsuario = 8;
  for (const c of CONSULTAS) {
    const url = BASE + '/api/v1/hogar/professionals?' + c.q;
    const r = await medir(url, nPorUsuario, usuarios || 4);
    const st = stats(r.tiempos);
    const total = r.tiempos.length;
    console.log(
      c.nombre.padEnd(26) +
      'n=' + String(total).padStart(3) +
      '  p50=' + String(st.p50).padStart(5) + 'ms' +
      '  p95=' + String(st.p95).padStart(5) + 'ms' +
      '  max=' + String(st.max).padStart(5) + 'ms' +
      (r.errores ? '  errores=' + r.errores : '')
    );
  }

  console.log('\n(interpretar: si p95 > 1000ms la consulta no esta usando indice)');
}

main().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
