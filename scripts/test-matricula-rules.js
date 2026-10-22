// Prueba de las reglas de matriculacion: que ente corresponde segun oficio y
// provincia, y que el admin no pueda aprobar una matricula emitted por el
// ente equivocado o sin titular.
//
//   node scripts/test-matricula-rules.js
const {
  esCaba,
  entesEsperados,
  padronParaVerificar,
  validarVerificacion,
  aplicarEstadoVerificacion
} = require('../utils/matriculaRules');

let ok = 0, fail = 0;
function check(cond, msg) {
  if (cond) ok++;
  else { fail++; console.log('  FALLA: ' + msg); }
}
function eq(a, b, msg) { check(JSON.stringify(a) === JSON.stringify(b), msg + ' -> ' + JSON.stringify(a) + ' != ' + JSON.stringify(b)); }

// --- deteccion de CABA ---
['CABA', 'caba', 'Buenos Aires', 'buenos aires', 'Ciudad Autónoma de Buenos Aires', 'Capital Federal']
  .forEach(p => check(esCaba(p), 'debería detectar CABA: ' + p));
['Cordoba', 'Santa Fe', 'Mendoza', '', null, 'Buenos Aires Province'].forEach(p =>
  check(!esCaba(p), 'no debería detectar CABA: ' + p));

// --- ente emisor esperado ---
eq(entesEsperados('gasista', 'CABA'), ['metrogas', 'enargas'], 'gasista en CABA');
eq(entesEsperados('gasista', 'Cordoba'), ['enargas'], 'gasista en interior');
eq(entesEsperados('electricista', 'CABA'), ['copime'], 'electricista en CABA');
eq(entesEsperados('electricista', 'Mendoza'), ['copime'], 'electricista en interior');
eq(entesEsperados('plomero', 'CABA'), [], 'oficio no regulado no tiene ente');

// --- padron a consultar ---
const padGasCaba = padronParaVerificar('gasista', 'CABA');
check(padGasCaba.ok, 'gasista en CABA debe devolver padron');
check(padGasCaba.ente === 'metrogas', 'gasista en CABA arranca por Metrogas');
check(padGasCaba.padron.includes('metrogas'), 'el padron debe ser el de Metrogas');
check(padGasCaba.alternativas.length === 1 && padGasCaba.alternativas[0].ente === 'enargas',
  'gasista en CABA debe ofrecer Enargas como alternativa');
check(!!padGasCaba.nota, 'debe avisar que en CABA hay dos emisores');

const padElec = padronParaVerificar('electricista', 'CABA');
eq(padElec.ente, 'copime', 'electricista consulta COPIME');
eq(padElec.alternativas, [], 'electricista no tiene alternativas');

check(!padronParaVerificar('plomero', 'CABA').ok, 'plomero no debe devolver padron');

// --- validacion de la verificacion ---
const base = { slug: 'gasista', provincia: 'CABA', titular: 'Juan Perez', matriculaNumero: 'MG-12345' };

check(validarVerificacion({ ...base, enteEmisor: 'metrogas', estado: 'activa' }).ok,
  'gasista CABA con Metrogas y activa debe validar');

const rGasCabaCopime = validarVerificacion({ ...base, enteEmisor: 'copime', estado: 'activa' });
check(rGasCabaCopime.ok === false, 'gasista NO puede emitirla COPIME');
check(!!rGasCabaCopime.error && rGasCabaCopime.error.includes('Enargas'),
  'el error debe mencionar quien sí puede emitir');

check(validarVerificacion({ ...base, enteEmisor: 'enargas', estado: 'activa' }).ok,
  'gasista CABA con Enargas también valida');

check(validarVerificacion({ ...base, provincia: 'Cordoba', enteEmisor: 'metrogas', estado: 'activa' }).ok === false,
  'gasista en interior NO puede emitirla Metrogas');
check(validarVerificacion({ ...base, provincia: 'Cordoba', enteEmisor: 'enargas', estado: 'activa' }).ok,
  'gasista en interior con Enargas valida');

check(validarVerificacion({ ...base, slug: 'electricista', enteEmisor: 'metrogas', estado: 'activa' }).ok === false,
  'electricista NO puede emitirla Metrogas');
check(validarVerificacion({ ...base, slug: 'electricista', enteEmisor: 'copime', estado: 'activa' }).ok,
  'electricista con COPIME valida');

check(validarVerificacion({ ...base, enteEmisor: 'otro', estado: 'activa' }).ok,
  '"otro" se acepta como excepción');

// --- campos obligatorios ---
check(validarVerificacion({ ...base, titular: '', enteEmisor: 'metrogas', estado: 'activa' }).ok === false,
  'sin titular no valida');
check(validarVerificacion({ ...base, titular: '  ', enteEmisor: 'metrogas', estado: 'activa' }).ok === false,
  'titular en blanco no valida');
check(validarVerificacion({ ...base, titular: 'Juan Perez', matriculaNumero: '', enteEmisor: 'metrogas', estado: 'activa' }).ok === false,
  'sin numero no valida');
check(validarVerificacion({ ...base, enteEmisor: 'metrogas', estado: '' }).ok === false,
  'sin estado no valida');
check(validarVerificacion({ ...base, enteEmisor: 'metrogas', estado: 'inventado' }).ok === false,
  'estado desconocido no valida');
check(validarVerificacion({ ...base, enteEmisor: '', estado: 'activa' }).ok === false,
  'sin ente emisor no valida');
check(validarVerificacion({ ...base, slug: 'plomero', enteEmisor: 'metrogas', estado: 'activa' }).ok === false,
  'oficio no regulado no se verifica');
check(validarVerificacion({ ...base, enteEmisor: 'inventado', estado: 'activa' }).ok === false,
  'ente inventado no valida');

// --- efecto en la insignia ---
check(aplicarEstadoVerificacion('activa', 'MG-1', 'Gasista').matriculaVerificada === true,
  'activa -> verificada');
['suspendida', 'vencida', 'no_encontrada'].forEach(e => {
  const r = aplicarEstadoVerificacion(e, 'MG-1', 'Gasista');
  check(r.matriculaVerificada === false, e + ' -> NO verificada');
  check(r.matriculaRechazada === true, e + ' -> rechazada');
  check(r.matriculaRechazadaMotivo && r.matriculaRechazadaMotivo.length > 10, e + ' -> motivo informado');
});
check(aplicarEstadoVerificacion('no_encontrada', '', 'Gasista').matriculaRechazadaMotivo.includes('sin numero') ||
      aplicarEstadoVerificacion('no_encontrada', '', 'Gasista').matriculaRechazadaMotivo.includes('sin número'),
  'sin numero el motivo lo aclara');

console.log('\nOK: ' + ok + '   FALLAS: ' + fail);
process.exit(fail === 0 ? 0 : 1);
