const fs = require('fs');
const path = require('path');

// Ring buffer en memoria. Antes 2000: con ~120 call sites de console.* en la
// app, un arranque movido lo desbordaba en minutos y el panel perdia lo
// interesante (el error que estabas buscando). Configurable por env.
const RING_SIZE = Math.max(parseInt(process.env.LOG_RING_SIZE, 10) || 20000, 200);
const MAX_FILE_BYTES = Math.max(parseInt(process.env.LOG_MAX_FILE_BYTES, 10) || 64 * 1024 * 1024, 1024 * 1024);

const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'app.log');
// Copia persistente del log. `/app/logs` NO esta montado en el contenedor, asi
// que al recrear el contenedor ese directorio se pierde. `/app/data` si es un
// bind mount, por eso se escribe una copia alla para poder leer logs de arranques
// anteriores y no solo del proceso actual.
const PERSIST_FILE = process.env.PERSIST_LOG_FILE
  || path.join(__dirname, '..', 'data', 'app-persist.log');

// Guardamos los metodos originales ANTES de hookear console: log() escribe en
// el stdout real y no debe pasar por el wrapper (seria recursion).
const rawConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console)
};

const ring = [];
let dirReady = null;
let fileDisabled = false;
let persistDisabled = false;

function ensureDir() {
  if (dirReady !== null) return dirReady;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    dirReady = true;
  } catch (e) {
    dirReady = false;
  }
  return dirReady;
}

/** El log persistente vive en /app/data, que si esta montado. */
function ensurePersistDir() {
  try {
    fs.mkdirSync(path.dirname(PERSIST_FILE), { recursive: true });
    return true;
  } catch (e) {
    return false;
  }
}

function rotateIfTooBig(file) {
  try {
    const st = fs.statSync(file);
    if (st.size <= MAX_FILE_BYTES) return;
    fs.renameSync(file, file + '.1');
  } catch (e) {
    // no file yet, or rename failed: keep appending
  }
}

function stringify(value) {
  if (value instanceof Error) return value.stack || value.message;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch (e) {
    return String(value);
  }
}

function pushLine(line) {
  ring.push(line);
  if (ring.length > RING_SIZE) ring.splice(0, ring.length - RING_SIZE);
}

/**
 * Escribe una linea en un archivo sin lanzar nunca. Si el archivo falla se
 * deshabilita ese destino y se sigue con los demas: perder el log es malo,
 * pero romper la request que se esta logueando es peor.
 */
function appendToFile(file, line) {
  try {
    rotateIfTooBig(file);
    fs.appendFileSync(file, line + '\n', 'utf8');
    return true;
  } catch (e) {
    return false;
  }
}

function writeToFiles(line) {
  if (!fileDisabled && ensureDir()) {
    if (!appendToFile(LOG_FILE, line)) fileDisabled = true;
  }
  if (!persistDisabled && ensurePersistDir()) {
    if (!appendToFile(PERSIST_FILE, line)) persistDisabled = true;
  }
}

/**
 * Log a line. Always goes to stdout so `docker logs` keeps working.
 * Also kept in an in-memory ring and appended to a capped file so the
 * admin panel can read recent lines from inside the container.
 * Never throws: logging must not break the request it is describing.
 *
 * Un stack trace viene con \n embebido: se parte para que el archivo siga
 * siendo "una linea por entrada" y el visor no muestre continuaciones sueltas
 * como si fueran registros sin timestamp.
 */
function log(level, args) {
  const text = args.map(stringify).join(' ');
  const parts = text.split('\n');
  let first = true;

  for (const part of parts) {
    const line = `${new Date().toISOString()} [${level}] ${part}`;
    pushLine(line);

    // A stdout solo la primera, como haria console: partirlo ahi duplicaria la
    // salida de `docker logs` de forma distinta a como lo hace Node.
    if (first) {
      if (level === 'ERROR') rawConsole.error(text);
      else if (level === 'WARN') rawConsole.warn(text);
      else rawConsole.log(text);
      first = false;
    } else {
      if (level === 'ERROR') rawConsole.error(line);
      else if (level === 'WARN') rawConsole.warn(line);
      else rawConsole.log(line);
    }

    writeToFiles(line);
  }
  return parts.length ? `${new Date().toISOString()} [${level}] ${parts[0]}` : '';
}

/** Multi-line tail is split so the ring/file stay line-oriented. */
function logError(args) {
  const text = args.map(stringify).join(' ');
  return text.split('\n').forEach((l) => log('ERROR', [l]));
}

// --- Captura de console.* -------------------------------------------------
//
// La app llama a console.log/error/warn en ~120 lugares (controllers, services,
// server.js) y ninguno pasaba por este logger, asi que el ring buffer del panel
// de admin quedaba practicamente vacio. En vez de editar 120 call sites, se
// intercepta console una vez y se deriva al ring.
//
// El wrapper escribe al stdout original (para que `docker logs` no se rompa) y
// ademas agrega la linea al ring y a los archivos.
let hooked = false;

function hookConsole() {
  if (hooked) return;
  hooked = true;

  const toLevel = {
    log: 'INFO',
    warn: 'WARN',
    error: 'ERROR',
    debug: 'DEBUG'
  };

  Object.keys(toLevel).forEach((method) => {
    if (typeof console[method] !== 'function') return;
    const stdout = method === 'debug' ? rawConsole.log : rawConsole[method];
    console[method] = function capturedConsole(...args) {
      // Prioridad 1: nunca romper `docker logs`. Un solo write con todos los
      // args, igual que hace console de verdad.
      try {
        stdout.apply(console, args);
      } catch (e) { /* el stdout no debe propagar */ }
      // Prioridad 2: persistir. Un fallo aca se silencia a proposito.
      try {
        const level = toLevel[method];
        const text = args.map(stringify).join(' ');
        // Un stack trace viene con \n embebido. Si se escribe tal cual, el
        // archivo deja de ser "una linea por entrada" y el visor muestra las
        // continuaciones como si fueran registros sin timestamp. Se parte
        // igual que hace logError().
        for (const part of text.split('\n')) {
          const line = `${new Date().toISOString()} [${level}] ${part}`;
          pushLine(line);
          writeToFiles(line);
        }
      } catch (e) { /* el logging nunca propaga */ }
    };
  });
}

// Se engancha al cargar el modulo, de modo que ningun require posterior capture
// el console original por error.
hookConsole();

// --- Lectura --------------------------------------------------------------

/** Ultimas lineas de un archivo, sin cargar todo en memoria. */
function tailFile(file, limit) {
  try {
    const size = fs.statSync(file).size;
    if (!size) return [];

    // Lee desde el final hacia atras hasta cubrir `limit` lineas. Con archivos
    // de 64 MB cargarlos enteros para mostrar 300 lineas es un desperdicio.
    const wantBytes = Math.min(size, Math.max(limit * 200, 8 * 1024));
    const start = size - wantBytes;
    const fd = fs.openSync(file, 'r');
    try {
      const buf = Buffer.alloc(wantBytes);
      fs.readSync(fd, buf, 0, wantBytes, start);
      const lines = buf.toString('utf8').split('\n').filter(Boolean);
      // Si no empezamos en el inicio del archivo, la primera linea esta
      // cortada por la mitad. Si se deja, aparece duplicada contra el ring
      // (mismo contenido, distinta forma) y el contador de lineas se infla.
      if (start > 0) lines.shift();
      return lines.slice(-limit);
    } finally {
      fs.closeSync(fd);
    }
  } catch (e) {
    return [];
  }
}

/**
 * Lineas recientes para el panel de admin.
 *
 * El archivo persistente es la fuente de verdad: el ring en memoria se pierde
 * en cada restart del contenedor, que es justo cuando mas hacen falta los logs.
 * El ring solo se usa de respaldo si el archivo todavia no se pudo escribir
 * (permiso denegado, filesystem read-only), para que el panel no quede en
 * blanco en un contenedor con /app/data de solo lectura.
 *
 * No se concatenan archivo + ring: ambos reciben las mismas lineas, asi que
 * sumarlos duplicaba cada entrada.
 */
function getRecentLines(limit = 200) {
  const max = Math.min(Math.max(parseInt(limit, 10) || 200, 1), RING_SIZE);

  const fromFile = tailFile(PERSIST_FILE, max);
  if (fromFile.length) return fromFile;
  return ring.slice(-max);
}

function getStats() {
  const lines = getRecentLines(RING_SIZE);
  const counts = { ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0 };
  for (const line of lines) {
    if (line.includes('[ERROR]')) counts.ERROR += 1;
    else if (line.includes('[WARN]')) counts.WARN += 1;
    else if (line.includes('[DEBUG]')) counts.DEBUG += 1;
    else counts.INFO += 1;
  }

  let fileBytes = 0;
  let persistBytes = 0;
  try { fileBytes = fs.statSync(LOG_FILE).size; } catch (e) { fileBytes = 0; }
  try { persistBytes = fs.statSync(PERSIST_FILE).size; } catch (e) { persistBytes = 0; }

  return {
    buffered: ring.length,
    ringSize: RING_SIZE,
    fileBytes,
    persistBytes,
    persistFile: PERSIST_FILE,
    maxFileBytes: MAX_FILE_BYTES,
    counts
  };
}

module.exports = {
  log,
  logError,
  getRecentLines,
  getStats,
  LOG_FILE,
  PERSIST_FILE,
  RING_SIZE,
  LEVELS: ['ERROR', 'WARN', 'INFO', 'DEBUG']
};