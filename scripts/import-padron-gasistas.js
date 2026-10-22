// Importa el padron de gasistas matriculados a `potential_professionals`.
//
// Por que NO va a `users`:
//   - `users.email` es required + unique, y el padron tiene emails
//     compartidos (familia / empresa). 9 valores se repiten.
//   - `users.password` es required: un padron no puede implicar credenciales.
//   - `potential_professionals` no la lee ningun endpoint publico, asi que
//     cargar el padron NO publica direccion ni telefono de terceros.
//
// Por que `doNotContact: true` en todos los registros:
//   - Varios servicios de outreach (WhatsApp drip, SMS, Telegram) leen esta
//     misma coleccion buscando leads `pending`. Marcar el lote como
//     do-not-contact los excluye de esos barridos, y estas personas no
//     hanconsentido a ser contactadas. Es reversible desde el admin.
//
// Idempotente: dry-run por defecto, y antes de insertar busca (fuente, matricula).
//
//   node scripts/import-padron-gasistas.js                     # dry-run
//   node scripts/import-padron-gasistas.js --apply             # escribe
//   node scripts/import-padron-gasistas.js --apply --limit 100
//
// No imprime datos de contacto (ni email ni telefono) en los reportes.
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const config = require('../config/appConfig');
const PotentialProfessional = require('../models/PotentialProfessional');

const APPLY = process.argv.includes('--apply');
const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg !== -1 ? parseInt(limitArg[limitArg + 1], 10) : 0;

// Local: el archivo original con el nombre prolijo. En el contenedor el fuente
// sube como /app/padron.txt (docker cp), asi que se acepta el override por env.
const DEFAULT_SOURCE_FILE = path.resolve(__dirname, '..', 'hasistas maticulados edenor.txt');
const SOURCE_FILE = process.env.PADRON_FILE
  ? path.resolve(process.env.PADRON_FILE)
  : (fs.existsSync(DEFAULT_SOURCE_FILE) ? DEFAULT_SOURCE_FILE : path.resolve(__dirname, '..', 'padron.txt'));
const FUENTE = 'padron_medenor';
const IMPORT_BATCH = 'medenor-2026-10';
// Oficio de este padron. Este script es del padron de gasistas; los de otros
// oficios traerian su propio PROFESION.
const PROFESION = 'gasista';

// El padron tiene una fila de encabezado y las matriculas vienen en una linea
// suelta ANTES de cada registro (la primera quedo pegada al header: "36523Matricula").
// Eso NO se puede parsear con un split simple: se camina linea por linea y la
// matricula pendiente se asocia al proximo registro con >=7 columnas.
function parsePadron(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const lines = raw.split(/\r?\n/);
  const rows = [];
  const issues = [];
  let pendingMatricula = null;
  let skippedMatriculaLines = 0;

  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    const trimmed = line.trim();
    if (!trimmed) return;

    if (/^\d{1,8}$/.test(trimmed)) {
      pendingMatricula = trimmed;
      return;
    }

    // Primera linea: "36523Matricula<tab>Apellido y Nombre..."
    if (/^\d{1,8}Matr/i.test(trimmed)) {
      const m = trimmed.match(/^(\d{1,8})/);
      pendingMatricula = m[1];
      const rest = trimmed.slice(m[0].length);
      // La matricula viene pegada al header ("36523Matricula"); el resto es la
      // fila de encabezado, no un registro. Ojo: "Matricula" tiene acento, asi
      // que no alcanza con /^Matr/.
      if (/Apellido/i.test(rest)) return;
    }

    if (/^Matr/i.test(trimmed)) return; // header

    const cols = line.split('\t');
    if (cols.length < 7) {
      issues.push({ lineNo, cols: cols.length, sample: trimmed.slice(0, 40) });
      return;
    }

    rows.push({
      matricula: pendingMatricula || '',
      name: (cols[0] || '').trim(),
      address: (cols[1] || '').trim(),
      locality: (cols[2] || '').trim(),
      postalCode: (cols[3] || '').trim(),
      phonesRaw: (cols[4] || '').trim(),
      category: (cols[5] || '').trim(),
      email: (cols[6] || '').trim().toLowerCase(),
      social: (cols[7] || '').trim(),
      lineNo
    });
    pendingMatricula = null;
  });

  return { rows, issues, skippedMatriculaLines };
}

// El padron viene con 10-11 digitos (CABA). No se inventa el prefijo 15 de
// celular: solo se guardan los digitos tal cual, mas el crudo para auditar.
function normalizePhones(raw) {
  const parts = String(raw || '').split(/[\s/]+/).filter(Boolean);
  const out = [];
  parts.forEach((p) => {
    const digits = p.replace(/\D/g, '');
    if (digits.length >= 8 && digits.length <= 15) out.push(digits);
  });
  return [...new Set(out)];
}

function validEmail(e) {
  return typeof e === 'string' && /.+@.+\..+/.test(e.trim());
}

async function main() {
  if (!fs.existsSync(SOURCE_FILE)) {
    console.error('No existe el archivo fuente: ' + SOURCE_FILE);
    process.exit(1);
  }

  const { rows, issues } = parsePadron(SOURCE_FILE);
  console.log('archivo    : ' + SOURCE_FILE);
  console.log('modo       : ' + (APPLY ? 'APPLY (escribe)' : 'DRY-RUN (no escribe)'));
  console.log('filas leidas: ' + rows.length);
  if (issues.length) {
    console.log('filas con formato inesperado: ' + issues.length);
    issues.slice(0, 5).forEach((i) => console.log('   linea ' + i.lineNo + ' cols=' + i.cols));
  }

  const seenMatricula = new Set();
  const seenEmail = new Set();
  const seenPhone = new Set();
  const toInsert = [];
  const skip = { sinMatricula: [], sinEmail: [], emailDuplicado: [], sinTelefono: [], telefonoDuplicado: [], matriculaRepetida: [] };

  for (const r of rows) {
    const label = r.matricula + ' ' + r.name;
    if (!r.matricula) { skip.sinMatricula.push(label); continue; }
    if (seenMatricula.has(r.matricula)) { skip.matriculaRepetida.push(label); continue; }
    if (!validEmail(r.email)) { skip.sinEmail.push(label); continue; }
    if (seenEmail.has(r.email)) { skip.emailDuplicado.push(label); continue; }

    const phones = normalizePhones(r.phonesRaw);
    if (!phones.length) { skip.sinTelefono.push(label); continue; }
    if (seenPhone.has(phones[0])) { skip.telefonoDuplicado.push(label); continue; }

    seenMatricula.add(r.matricula);
    seenEmail.add(r.email);
    seenPhone.add(phones[0]);
    toInsert.push({
      phone: phones[0],
      alias: r.name,
      name: r.name,
      email: r.email,
      address: r.address,
      locality: r.locality,
      postalCode: r.postalCode,
      matricula: r.matricula,
      category: r.category,
      // Oficio normalizado: permite que el mail de invitation nombre al
      // profession en vez de decir siempre "gasista".
      profession: PROFESION,
      phones,
      phoneRaw: r.phonesRaw,
      fuente: FUENTE,
      importBatch: IMPORT_BATCH,
      // Sin consentimiento para ser contactados: quedan fuera de cualquier
      // barrido de outreach hasta que el admin lo revise.
      doNotContact: true,
      doNotContactReason: 'padron importado, sin consentimiento de contacto',
      doNotContactAt: new Date(),
      sourceUrl: '',
      status: 'pending'
    });
  }

  const batch = LIMIT > 0 ? toInsert.slice(0, LIMIT) : toInsert;

  console.log('\n--- descartes ---');
  Object.keys(skip).forEach((k) => {
    if (skip[k].length) {
      console.log('  ' + k + ': ' + skip[k].length);
      skip[k].slice(0, 6).forEach((l) => console.log('      ' + l));
      if (skip[k].length > 6) console.log('      ... +' + (skip[k].length - 6));
    }
  });
  console.log('\n--- a insertar ---');
  console.log('  registros limpios : ' + toInsert.length);
  console.log('  a procesar        : ' + batch.length + (LIMIT > 0 ? ' (--limit ' + LIMIT + ')' : ''));

  const byLocality = {};
  toInsert.forEach((d) => {
    const loc = d.locality || '(sin localidad)';
    byLocality[loc] = (byLocality[loc] || 0) + 1;
  });
  const top = Object.entries(byLocality).sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log('  top localidades    : ' + top.map((t) => t[0] + ' (' + t[1] + ')').join(', '));

  if (!APPLY) {
    console.log('\nDRY-RUN: no se escribio nada. Re-run con --apply para insertar.');
    await mongoose.disconnect();
    return;
  }

  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
  console.log('\nconectado a ' + mongoose.connection.host + '/' + mongoose.connection.name);

  const existing = await PotentialProfessional.find({ fuente: FUENTE, matricula: { $in: batch.map((b) => b.matricula) } })
    .select('matricula')
    .lean();
  const already = new Set(existing.map((e) => e.matricula));
  const fresh = batch.filter((b) => !already.has(b.matricula));
  console.log('ya importados (idempotencia, se saltan): ' + already.size);
  console.log('nuevos a insertar                    : ' + fresh.length);

  if (!fresh.length) {
    console.log('nada nuevo que hacer.');
    await mongoose.disconnect();
    return;
  }

  const inserted = await PotentialProfessional.insertMany(fresh, { ordered: false });
  console.log('\ninsertados: ' + inserted.length);
  console.log('NO se envio ningun email/SMS/WhatsApp: este script no importa ningun sender.');

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('ERROR: ' + err.message);
  if (err.code === 11000) console.error('  -> violacion de indice unico (phone/email duplicado).');
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});