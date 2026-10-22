/**
 * Requisitos para poder lanzar un aviso (publicar un aviso pago).
 *
 * El usuario pidio tres condiciones, todas obligatorias antes de crear un aviso:
 *   1. Telefono verificado
 *   2. Mail verificado
 *   3. Direccion completa cargada
 * y, si la direccion esta completa pero falta el codigo postal (CP), se busca
 * automaticamente y se completa el campo.
 *
 * Este modulo es la UNICA fuente de verdad: lo usan el backend
 * (controllers/avisoController.js, que es el que manda de verdad) y el front
 * (public/js/avisos.js) para mostrar el popup antes de dejar enviar.
 */

/** Campos de la direccion que son obligatorios. El CP se resuelve aparte. */
const DIRECCION_REQUERIDA = ['street', 'number', 'city', 'province'];

/** Etiquetas legibles para el popup. */
const ETIQUETAS_DIRECCION = {
  street: 'calle',
  number: 'número',
  city: 'ciudad/localidad',
  province: 'provincia'
};

/** Etiquetas legibles para los avisos de verificacion. */
const ETIQUETAS_VERIFICACION = {
  telefono: 'teléfono',
  email: 'email'
};

function texto(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

/**
 * Evalua los requisitos de publicacion sobre un usuario (documento mongoose o
 * objeto plano). Devuelve SIEMPRE un objeto con:
 *   canPublish  boolean
 *   faltantes    [{ tipo, campo, mensaje }]
 *   necesitaCP   boolean   -> hay que completar el codigo postal automaticamente
 *   direccion    objeto normalizado, para poder completarla
 */
function evaluatePublishRequirements(user) {
  const u = user || {};
  const faltantes = [];

  // --- 1. telefono verificado ---
  if (!u.phoneVerified) {
    faltantes.push({
      tipo: 'verificacion',
      campo: 'phoneVerified',
      mensaje: 'Tenés que verificar tu teléfono antes de lanzar un aviso.'
    });
  }

  // --- 2. email verificado ---
  if (!u.isEmailVerified) {
    faltantes.push({
      tipo: 'verificacion',
      campo: 'isEmailVerified',
      mensaje: 'Tenés que verificar tu email antes de lanzar un aviso.'
    });
  }

  // --- 3. direccion completa ---
  // Se lee de hogarProfile.address (donde se guardan los servicios del
  // profesional) y, como respaldo, de professionalProfile.location, que es
  // donde el dashboard general guarda la ubicacion.
  const hp = u.hogarProfile || {};
  const pp = u.professionalProfile || {};
  const a = hp.address || pp.location || {};
  const ap = a.postalCode || pp.location?.postalCode || '';

  const direccion = {
    street: texto(a.street),
    number: texto(a.number),
    city: texto(a.city),
    province: texto(a.province),
    postalCode: texto(ap)
  };

  for (const campo of DIRECCION_REQUERIDA) {
    if (!direccion[campo]) {
      faltantes.push({
        tipo: 'direccion',
        campo,
        mensaje: `Falta cargar ${ETIQUETAS_DIRECCION[campo]} en tu perfil.`
      });
    }
  }

  // La direccion esta completa si tiene calle, numero, ciudad y provincia.
  const direccionCompleta = DIRECCION_REQUERIDA.every(c => direccion[c]);
  const necesitaCP = direccionCompleta && !direccion.postalCode;

  if (necesitaCP) {
    faltantes.push({
      tipo: 'cp',
      campo: 'postalCode',
      mensaje: 'Falta el código postal de tu dirección. Lo buscamos automáticamente.'
    });
  }

  return {
    canPublish: faltantes.length === 0,
    faltantes,
    necesitaCP,
    direccionCompleta,
    direccion
  };
}

/**
 * Mensaje unico para el popup. Junta todos los motivos para que el profesional
 * vea TODO lo que le falta de una vez y no de a uno.
 */
function buildPublishBlockedMessage(resultado) {
  const { faltantes = [], necesitaCP = false } = resultado || {};
  if (!faltantes.length) return '';
  if (faltantes.length === 1) return faltantes[0].mensaje;
  // El CP no se cuenta como algo que el usuario deba hacer: lo resolvemos
  // nosotros, asi que no va en la lista de "cosas que te faltan".
  const acciones = faltantes.filter(f => f.tipo !== 'cp').map(f => f.mensaje);
  if (!acciones.length) {
    return 'Estamos completando el código postal de tu dirección. Probá de nuevo en unos segundos.';
  }
  return 'Antes de lanzar un aviso tenés que:\n\n' + acciones.map(m => '• ' + m).join('\n');
}

/** Version de a single string para mandar por HTTP y que el front la muestre. */
function buildPublishBlockedText(resultado) {
  return buildPublishBlockedMessage(resultado).replace(/\n+/g, ' ');
}

module.exports = {
  DIRECCION_REQUERIDA,
  ETIQUETAS_DIRECCION,
  ETIQUETAS_VERIFICACION,
  evaluatePublishRequirements,
  buildPublishBlockedMessage,
  buildPublishBlockedText
};
