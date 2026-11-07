const { readBarcodesFromImageFile } = require('zxing-wasm');

// sharp es opcional: si no esta instalado seguimos intentando con la imagen
// original en vez de romper el endpoint.
let sharp = null;
try { sharp = require('sharp'); } catch (e) { sharp = null; }

const READER_OPTIONS = {
  tryHarder: true,
  tryRotate: true,
  tryInvert: true,
  tryDownscale: true,
  maxNumberOfSymbols: 5,
  possibleFormats: [28] // PDF417 = 28 en ZXing
};

/**
 * Las fotos de celular suelen fallar por tamaño enorme, bajo contraste o
 * ruido. Generamos variantes (gris, normalizada, con mas contraste e
 * invertida) y probamos el lector con cada una antes de rendirnos.
 */
async function buildImageVariants(imageBuffer) {
  const variants = [{ label: 'original', buffer: imageBuffer }];
  if (!sharp) return variants;

  const jobs = [
    {
      label: 'gray-1800',
      make: () => sharp(imageBuffer).rotate().resize({ width: 1800, withoutEnlargement: false }).grayscale().normalize().sharpen({ sigma: 1 }).png()
    },
    {
      label: 'gray-2400',
      make: () => sharp(imageBuffer).rotate().resize({ width: 2400, withoutEnlargement: false }).grayscale().normalize().png()
    },
    {
      label: 'contrast',
      make: () => sharp(imageBuffer).rotate().grayscale().linear(1.5, -40).png()
    },
    {
      label: 'invert',
      make: () => sharp(imageBuffer).rotate().resize({ width: 2000, withoutEnlargement: false }).grayscale().negate().png()
    }
  ];

  for (const job of jobs) {
    try {
      variants.push({ label: job.label, buffer: await job.make().toBuffer() });
    } catch (e) {
      // variante no valida: seguimos con las demas
    }
  }
  return variants;
}

/**
 * Decode PDF417 barcode from Argentine DNI image.
 * 
 * DNI barcode format (fields separated by '@'):
 * 
 * NEW FORMAT (front, 8-9 fields):
 *   [0] unknown | [1] apellido | [2] nombre | [3] sexo | [4] dni | [5] unknown | [6] fecha_nacimiento | [7] fecha_emision | [8] unknown
 * 
 * OLD FORMAT (back, 16-17 fields):
 *   [0] unknown | [1] dni | [2-3] unknown | [4] apellido | [5] nombre | [6] unknown | [7] fecha_nacimiento | [8] sexo | [9] fecha_emision | [10-11] unknown | [12] fecha_vencimiento | [13-16] unknown
 *
 * @param {Buffer} imageBuffer - DNI image as buffer
 * @returns {Object} Extracted DNI data
 */
async function decodeDniBarcode(imageBuffer) {
  const variants = await buildImageVariants(imageBuffer);
  let lastRaw = '';
  let readError = '';

  for (const variant of variants) {
    let barcodes = [];
    try {
      const result = await readBarcodesFromImageFile(variant.buffer, READER_OPTIONS);
      if (result && result.error) readError = String(result.error.message || result.error);
      barcodes = (result && result.barcodes) || [];
    } catch (e) {
      readError = e.message;
      continue;
    }

    for (const barcode of barcodes) {
      const text = barcode && barcode.text ? String(barcode.text) : '';
      if (!text || text.length < 10) continue;
      if (!lastRaw) lastRaw = text;
      const parsed = parseDniBarcode(text);
      if (parsed) {
        return { success: true, data: parsed, raw: text, variant: variant.label };
      }
    }
  }

  if (!lastRaw) {
    return {
      success: false,
      error: 'No pudimos leer el código de barras del DNI. Probá con una foto más nítida, sin reflejos y con el código completo, o completá los datos a mano.'
    };
  }
  return { success: false, error: 'El código de barras no contiene datos válidos de DNI', raw: lastRaw };
}

/**
 * Parse raw barcode text into structured DNI data.
 */
function parseDniBarcode(rawText) {
  if (!rawText) return null;

  const parts = rawText.split('@').map(p => p.trim());
  const len = parts.length;

  // New format: 8-9 fields (front barcode)
  if (len === 8 || len === 9) {
    return {
      format: 'new',
      apellido: parts[1] || '',
      nombre: parts[2] || '',
      sexo: parts[3] || '',
      dni: parts[4] || '',
      fechaNacimiento: parts[6] || '',
      fechaEmision: parts[7] || ''
    };
  }

  // Old format: 16-17 fields (back barcode)
  if (len === 16 || len === 17) {
    return {
      format: 'old',
      dni: parts[1] || '',
      apellido: parts[4] || '',
      nombre: parts[5] || '',
      fechaNacimiento: parts[7] || '',
      sexo: parts[8] || '',
      fechaEmision: parts[9] || '',
      fechaVencimiento: parts[12] || ''
    };
  }

  // Try to find DNI data in any format by looking for known patterns
  // Some DNIs may have different field counts
  if (len >= 8) {
    // Try new format heuristic
    const apellido = parts[1] || '';
    const nombre = parts[2] || '';
    const dni = parts[4] || '';
    const fechaNac = parts[6] || '';
    const fechaEm = parts[7] || '';

    if (apellido && nombre && dni && /\d/.test(dni)) {
      return {
        format: 'new',
        apellido,
        nombre,
        sexo: parts[3] || '',
        dni,
        fechaNacimiento: fechaNac,
        fechaEmision: fechaEm
      };
    }
  }

  return null;
}

/**
 * Parse DNI birth date from barcode format (dd/mm/yyyy or ddmmyyyy).
 * Returns ISO date string (YYYY-MM-DD).
 */
function parseDniDate(dateStr) {
  if (!dateStr) return null;

  // Try dd/mm/yyyy
  const slashMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Try ddmmyyyy
  const rawMatch = dateStr.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (rawMatch) {
    const [, day, month, year] = rawMatch;
    return `${year}-${month}-${day}`;
  }

  // Try yyyy-mm-dd (already ISO)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  return null;
}

/**
 * Calculate age from DNI birth date string.
 */
function calculateAge(birthDateStr) {
  const isoDate = parseDniDate(birthDateStr);
  if (!isoDate) return null;

  const birth = new Date(isoDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

module.exports = { decodeDniBarcode, parseDniBarcode, parseDniDate, calculateAge };
