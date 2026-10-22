/**
 * Matching tolerante para la busqueda de texto libre de profesionales.
 *
 * El usuario escribe como habla: sin tildes, sin guion y abreviando
 * ("reparo", "repare", "reparar", "arreglo", "service", "podar arboles",
 * "cortar cesped", "piletas de natacion"). Un regex con el texto exacto
 * deja esos servicios invisibles aunque el dispositivo se llame
 * "Podar Arboles" o "Mantenimiento de Bombas y Piletas de Natacion".
 *
 * Por eso cada vocal se convierte en una clase que acepta version con y sin
 * tilde, la n acepta ñ, la c acepta ç, y guion/subrayado aceptan guion,
 * subrayado o espacio ('linea-blanca' ~ 'linea blanca').
 */

const DIACRITICS = {
  a: 'aáàäâãå',
  e: 'eéèëê',
  i: 'iíìïî',
  o: 'oóòöôõ',
  u: 'uúùüû',
  n: 'nñ',
  c: 'cç'
};

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Quita la tilde para consultar el mapa: 'á' -> 'a', 'ñ' -> 'n', 'ü' -> 'u'.
 * Asi "césped" genera la misma clase que "cesped" y matchea los dos lados.
 */
function baseLetter(ch) {
  return ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Convierte texto en una fuente de regex que tolera tildes, ñ y separadores.
 * @param {string} input
 * @returns {string} fuente de regex (sin flags)
 */
function flexibleTextSource(input) {
  if (input === undefined || input === null) return '';
  let out = '';
  for (const ch of String(input)) {
    // el path guardado usa separadores ('casa-campo', 'podar-arboles'), el
    // usuario escribe espacios: 'casa de campo', 'podar arboles'
    if (ch === '-' || ch === '_' || ch === '/' || ch === ' ') { out += '[-_/ ]'; continue; }
    const set = DIACRITICS[baseLetter(ch).toLowerCase()];
    if (set) { out += '[' + set + ']'; continue; }
    out += escapeRegex(ch);
  }
  return out;
}

/**
 * Regex case-insensitive tolerante a tildes y separadores.
 * @param {string} input
 * @returns {RegExp}
 */
function flexibleTextRegex(input) {
  return new RegExp(flexibleTextSource(input), 'i');
}

module.exports = { flexibleTextSource, flexibleTextRegex, escapeRegex, DIACRITICS };
