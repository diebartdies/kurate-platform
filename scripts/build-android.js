#!/usr/bin/env node
'use strict';
/**
 * Build cross-platform del APK de Android (Windows + macOS/Linux).
 *
 *   node scripts/build-android.js           -> debug
 *   node scripts/build-android.js release   -> release (firmado con key.properties)
 *
 * Hace: capacitor sync android -> gradlew assemble<Debug|Release> -> imprime
 * la ruta, tamano y SHA-256 del APK generado.
 */
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const type = (process.argv[2] || 'debug').toLowerCase();
if (!['debug', 'release'].includes(type)) {
  console.error('Uso: node scripts/build-android.js [debug|release]');
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  console.log(`\n> ${cmd} ${args.join(' ')}`);
  const res = spawnSync(cmd, args, Object.assign({ stdio: 'inherit', cwd: root }, opts));
  if (res.error) {
    console.error(`Error al ejecutar: ${res.error.message}`);
    process.exit(1);
  }
  if (res.status !== 0) {
    process.exit(res.status == null ? 1 : res.status);
  }
}

// 1) Sincronizar assets web (public/) + config al proyecto Android
const capBin = path.join(root, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor');
if (!fs.existsSync(capBin)) {
  console.error('@capacitor/cli no esta instalado (ejecuta: npm install)');
  process.exit(1);
}
run(process.execPath, [capBin, 'sync', 'android']);

// 2) Gradle: el wrapper .bat en Windows, el script shell en el resto
const androidDir = path.join(root, 'android');
const task = type === 'release' ? 'assembleRelease' : 'assembleDebug';
if (process.platform === 'win32') {
  run('cmd', ['/c', path.join(androidDir, 'gradlew.bat'), task, '--console=plain'], { cwd: androidDir });
} else {
  run(path.join(androidDir, 'gradlew'), [task, '--console=plain'], { cwd: androidDir });
}

// 3) Resultado
const apk = path.join(androidDir, 'app', 'build', 'outputs', 'apk', type, `app-${type}.apk`);
if (!fs.existsSync(apk)) {
  console.error(`APK no encontrado: ${apk}`);
  process.exit(1);
}
const buf = fs.readFileSync(apk);
console.log(`\nAPK     : ${apk}`);
console.log(`Tamano  : ${(buf.length / 1048576).toFixed(1)} MB (${buf.length} bytes)`);
console.log(`SHA-256 : ${crypto.createHash('sha256').update(buf).digest('hex')}`);
