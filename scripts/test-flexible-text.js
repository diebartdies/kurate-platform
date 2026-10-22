/**
 * Test del matching tolerante de texto libre.
 * La busqueda real exige CADA palabra (AND), asi que el caso 'casa de campo'
 * no se prueba como un solo regex: se prueba palabra por palabra, que es
 * como despues los resuelve getHogarProfessionals (con retry sin stop words).
 */
const { flexibleTextRegex, flexibleTextSource } = require('../utils/flexibleText');

const CASOS = [
  // [palabra buscada, valor guardado, debe matchear]
  ['podar', 'casa-campo/jardin-piscinas-campo/podar-arboles', true],
  ['arboles', 'casa-campo/jardin-piscinas-campo/podar-arboles', true],
  ['árboles', 'casa-campo/jardin-piscinas-campo/podar-arboles', true],
  ['cesped', 'casa-campo/jardin-piscinas-campo/podar-cortar-cesped', true],
  ['césped', 'casa-campo/jardin-piscinas-campo/podar-cortar-cesped', true],
  ['jardin', 'casa-campo/jardin-piscinas-campo/podar-cortar-cesped', true],
  ['jardín', 'casa-campo/jardin-piscinas-campo/podar-cortar-cesped', true],
  ['natacion', 'Mantenimiento de Bombas y Piletas de Natación', true],
  ['natación', 'Mantenimiento de Bombas y Piletas de Natación', true],
  ['piletas', 'Mantenimiento de Bombas y Piletas de Natación', true],
  ['pileta', 'Mantenimiento de Bombas y Piletas de Natación', true],
  ['bombas', 'Mantenimiento de Bombas y Piletas de Natación', true],
  ['karcher', 'Kärcher', true],
  ['kärcher', 'Kärcher', true],
  ['casa', 'casa-campo', true],
  ['campo', 'casa-campo', true],
  ['linea', 'linea-blanca/lavarropas', true],
  ['blanca', 'linea-blanca/lavarropas', true],
  ['arboles', 'linea-blanca/lavarropas', false],
  ['podar', 'hogar/linea-blanca/lavarropas', false]
];

let fails = 0;
for (const [q, value, expected] of CASOS) {
  const got = flexibleTextRegex(q).test(value);
  if (got !== expected) fails++;
  console.log(`${got === expected ? 'OK   ' : 'FALLA'} "${q}" ~ "${value}" -> ${got} (esperado ${expected})`);
}
console.log(`\nsrc de "casa de campo": ${flexibleTextSource('casa de campo')}`);
console.log(fails ? `${fails} FALLAS` : `Todo OK (${CASOS.length} casos)`);
process.exit(fails ? 1 : 0);
