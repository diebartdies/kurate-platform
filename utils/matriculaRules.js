/*
 * Reglas de acreditacion de matriculas para oficios regulados.
 *
 * No alcanza con que el profesional pegue un numero: la matricula se verifica
 * contra el padron del ente emisor que corresponde segun el oficio Y la
 * provincia, y hay que saber a nombre de quien esta emitida.
 *
 *   gasista      en CABA      -> Metrogas o Enargas
 *   gasista      en cualquier otra provincia -> Enargas
 *   electricista en cualquier provincia     -> COPIME
 *
 * Los padrones oficiales se consultan a mano por el admin (no hay API publica
 * estable), asi que este modulo NO consulta nada: valida y deja registro de
 * que se consulto, con que padron y con que resultado. La UI de administracion
 * usa esta informacion paraguia al operador.
 */

// Slugs de oficio que tienen matricula habilitante.
const OFICIOS_REGULADOS = new Set(['gasista', 'electricista']);

// Entes emisores conocidos, con el nombre oficial y la URL del padron.
const ENTES = {
  metrogas: {
    label: 'Metrogas',
    padron: 'https://buscadormatriculados.micuenta.metrogas.com.ar/',
    cubre: 'gasista',
    zona: 'caba'
  },
  enargas: {
    label: 'Enargas',
    padron: 'https://www.enargas.com.ar/',
    cubre: 'gasista',
    zona: 'interior'
  },
  copime: {
    label: 'COPIME',
    padron: 'https://www.copime.org.ar/',
    cubre: 'electricista',
    zona: 'todas'
  }
};

// Provincias (y forma de escribir CABA) que se consideran CABA.
const CABA_TERMINOS = [
  'caba',
  'buenos aires',
  'ciudad autonoma de buenos aires',
  'ciudad autónoma de buenos aires',
  'capital federal'
];

/**
 * Normaliza el nombre de provincia a una clave comparable.
 * Sin acentos, minusculas, sin puntuacion.
 */
function normalizarProvincia(valor) {
  return String(valor || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function esCaba(provincia) {
  const n = normalizarProvincia(provincia);
  if (!n) return false;
  return CABA_TERMINOS.some(t => {
    const tn = t
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    return n === tn;
  });
}

/**
 * Entes emisores aceptables para un oficio en una provincia.
 *
 * @param {string} slug      slug del oficio ('gasista', 'electricista')
 * @param {string} provincia provincia del profesional
 * @returns {string[]} slugs de entes validos
 */
function entesEsperados(slug, provincia) {
  const s = String(slug || '').trim().toLowerCase();
  if (s === 'gasista') {
    return esCaba(provincia) ? ['metrogas', 'enargas'] : ['enargas'];
  }
  if (s === 'electricista') {
    return ['copime'];
  }
  return [];
}

/**
 * Que padron tiene que consultar el admin para verificar esta matricula.
 *
 * @returns {{ok:boolean, error?:string,slug:string, ente:string,
 *            enteLabel:string, padron:string, nota?:string}}
 */
function padronParaVerificar(slug, provincia) {
  const s = String(slug || '').trim().toLowerCase();
  if (!OFICIOS_REGULADOS.has(s)) {
    return { ok: false, slug: s, ente: '', enteLabel: '', padron: '', error: 'Ese oficio no requiere matriculación.' };
  }
  const esperados = entesEsperados(s, provincia);
  if (!esperados.length) {
    return { ok: false, slug: s, ente: '', enteLabel: '', padron: '', error: 'No hay ente emisor definido para ese oficio.' };
  }
  // Gasista en CABA admite dos padrones: se devuelve el primario y la nota
  // con la alternativa, para que el admin no descarte el caso valido.
  const principal = esperados[0];
  const meta = ENTES[principal];
  const res = {
    ok: true,
    slug: s,
    ente: principal,
    enteLabel: meta.label,
    padron: meta.padron,
    alternativas: esperados.slice(1).map(k => ({ ente: k, label: ENTES[k].label, padron: ENTES[k].padron }))
  };
  if (esperados.length > 1) {
    res.nota = `En ${s === 'gasista' ? 'CABA' : 'esa zona'} la matrícula puede ser de ${res.enteLabel} o de ${esperados.slice(1).map(k => ENTES[k].label).join(' / ')}.`;
  }
  return res;
}

/**
 * Valida el registro que completa el admin al verificar contra el padron.
 *
 * Reglas:
 *  - tiene que haber titular (a nombre de quien esta la matricula)
 *  - el ente emisor tiene que ser uno de los esperados para el oficio/zona
 *  - el estado tiene que ser uno conocido
 *
 * @returns {{ok:boolean, error?:string, valor?:object}}
 */
function validarVerificacion({ slug, provincia, titular, enteEmisor, estado, matriculaNumero }) {
  const s = String(slug || '').trim().toLowerCase();
  if (!OFICIOS_REGULADOS.has(s)) {
    return { ok: false, error: 'Ese oficio no requiere matriculación.' };
  }

  const t = String(titular || '').trim();
  if (t.length < 3) {
    return { ok: false, error: 'Cargá el nombre de la persona titular de la matrícula.' };
  }
  if (t.length > 120) {
    return { ok: false, error: 'El nombre del titular es demasiado largo.' };
  }

  const numero = String(matriculaNumero || '').trim();
  if (!numero) {
    return { ok: false, error: 'La matrícula necesita un número para poder verificarla.' };
  }

  const estadosValidos = ['activa', 'suspendida', 'vencida', 'no_encontrada'];
  const e = String(estado || '').trim().toLowerCase();
  if (!estadosValidos.includes(e)) {
    return { ok: false, error: 'Indicá el estado de la matrícula según el padrón (activa, suspendida, vencida o no encontrada).' };
  }

  const esperados = entesEsperados(s, provincia);
  const ente = String(enteEmisor || '').trim().toLowerCase();
  if (!ente) {
    return {
      ok: false,
      error: `Indicá el ente emisor. Para ${s === 'electricista' ? 'electricista' : 'gasista'} corresponde ${esperados.map(k => ENTES[k].label).join(' o ')}.`
    };
  }
  if (!['metrogas', 'enargas', 'copime', 'otro'].includes(ente)) {
    return { ok: false, error: 'Ese ente emisor no es válido.' };
  }
  // 'otro' es la excepción justificada, no una puerta libre: se acepta pero se
  // deja marcado para que el admin lo vea en la lista de pendientes.
  if (ente !== 'otro' && !esperados.includes(ente)) {
    const lista = esperados.map(k => ENTES[k].label).join(' o ');
    return {
      ok: false,
      error: `La matrícula de ${s} en ${esCaba(provincia) ? 'CABA' : 'interior'} la emite ${lista}, no ${ENTES[ente] ? ENTES[ente].label : ente}.`
    };
  }

  return {
    ok: true,
    valor: {
      titular: t,
      enteEmisor: ente,
      estado: e,
      // Solo una matricula activa habilita la insignia de verificado.
      matriculaVerificada: e === 'activa'
    }
  };
}

/**
 * Al cargar una matricula: solo se puede marcar verificada si esta ACTIVA.
 * Si el padron la dio de baja, se registra el motivo para que el profesional
 * sepa que tiene que actualizarla.
 */
function aplicarEstadoVerificacion(estado, numero, nombreOficio) {
  if (estado === 'activa') {
    return { matriculaVerificada: true, matriculaRechazada: false, matriculaRechazadaMotivo: '' };
  }
  const motivos = {
    suspendida: `Tu matrícula de ${nombreOficio} figura suspendida en el padrón. Actualizala para volver a aparecer como matriculado.`,
    vencida: `Tu matrícula de ${nombreOficio} figura vencida. Renovala para volver a aparecer como matriculado.`,
    no_encontrada: `No encontramos tu matrícula de ${nombreOficio} (nº ${numero || 'sin número'}) en el padrón. Revisá el número o el ente emisor.`
  };
  return {
    matriculaVerificada: false,
    matriculaRechazada: true,
    matriculaRechazadaMotivo: motivos[estado] || 'La matrícula no pudo verificarse.'
  };
}

module.exports = {
  OFICIOS_REGULADOS,
  ENTES,
  esCaba,
  normalizarProvincia,
  entesEsperados,
  padronParaVerificar,
  validarVerificacion,
  aplicarEstadoVerificacion
};
