const Tesseract = require('tesseract.js');

const MONTH_MAP = {
  ene: 0, jan: 0,
  feb: 1,
  mar: 2,
  abr: 3, apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  ago: 7, aug: 7,
  set: 8, sep: 8,
  oct: 8,
  nov: 10,
  dic: 11, dec: 11
};

// Matches "15 ENE/JAN 1969" or "15 ENE 1969" or variants
const DOB_REGEX = /\b(\d{1,2})\s+([A-ZÁÉÍÓÚ]{3,4})\s*(?:\/\s*[A-ZÁÉÍÓÚ]{3,4}\s*)?\s*(\d{4})\b/i;

function parseDobFromText(text) {
  const match = text.match(DOB_REGEX);
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const monthStr = match[2].toLowerCase().slice(0, 3);
  const year = parseInt(match[3], 10);
  const month = MONTH_MAP[monthStr];
  if (!month) return null;
  if (day < 1 || day > 31 || year < 1900 || year > 2010) return null;
  return new Date(year, month, day);
}

function ageFromDate(dob) {
  const today = new Date();
  let years = today.getFullYear() - dob.getFullYear();
  const mDiff = today.getMonth() - dob.getMonth();
  if (mDiff < 0 || (mDiff === 0 && today.getDate() < dob.getDate())) years -= 1;
  return years;
}

async function ocrDni(imagePath) {
  const result = await Tesseract.recognize(imagePath, 'spa', {
    logger: () => {}
  });
  return result.data.text;
}

async function validateDniFront(imagePath, expectedDob) {
  const text = await ocrDni(imagePath);
  const parsed = parseDobFromText(text);
  if (!parsed) {
    return { valid: false, error: 'No se pudo leer la fecha de nacimiento del DNI. Asegurate que la foto sea clara y legible.' };
  }

  const ocrAge = ageFromDate(parsed);
  if (ocrAge < 18) {
    return { valid: false, error: 'Según el DNI, sos menor de edad. No podés publicar avisos.' };
  }

  const expected = new Date(expectedDob);
  const diffDays = Math.abs((parsed.getTime() - expected.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays > 365) {
    return {
      valid: false,
      error: `La fecha de nacimiento en tu DNI (${parsed.toLocaleDateString('es-AR')}) no coincide con la que ingresaste (${expected.toLocaleDateString('es-AR')}). Corregí la fecha de acuerdo a tu documento para continuar.`,
      ocrDate: parsed.toISOString(),
      mismatch: true
    };
  }

  if (diffDays > 0) {
    return {
      valid: true,
      warning: `La fecha de nacimiento en tu DNI (${parsed.toLocaleDateString('es-AR')}) tiene una diferencia con la ingresada (${expected.toLocaleDateString('es-AR')}). Actualizala según tu documento.`,
      ocrDate: parsed.toISOString(),
      mismatch: true
    };
  }

  return { valid: true, ocrDate: parsed.toISOString() };
}

module.exports = { validateDniFront, parseDobFromText };
