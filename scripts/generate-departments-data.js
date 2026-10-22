'use strict';
// Genera departments-data.js (CJS) y prototypes/data-departments.js (window.DEPARTMENTS_GEO)
// a partir de scripts/provincias_y_departamentos_argentina.csv (BOM UTF-8, comas escapadas con comillas).
// Uso: node scripts/generate-departments-data.js

const fs = require('fs');
const path = require('path');

const CSV = path.join(__dirname, 'provincias_y_departamentos_argentina.csv');
const OUT_CJS = path.join(__dirname, 'departments-data.js');
const OUT_JS = path.join(__dirname, '..', 'prototypes', 'data-departments.js');

function parseLine(line) {
    const fields = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') inQ = !inQ;
        else if (ch === ',' && !inQ) { fields.push(cur); cur = ''; }
        else cur += ch;
    }
    fields.push(cur);
    return fields;
}

let raw = fs.readFileSync(CSV, 'utf8');
if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);

const provinces = [];
const map = {};
const seen = {};

for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const [prov, dept] = parseLine(line);
    if (!prov || !dept || prov === 'Provincia/Jurisdicción') continue;
    const p = prov.trim();
    const d = dept.trim();
    if (!seen[p]) { seen[p] = true; provinces.push(p); }
    if (!map[p]) map[p] = [];
    if (map[p].indexOf(d) === -1) map[p].push(d);
}

const lines = provinces.map(p => {
    const depts = map[p].sort();
    return '  ' + JSON.stringify(p) + ': [' + depts.map(JSON.stringify).join(',') + ']';
});

const cjs = '// GENERADO desde scripts/provincias_y_departamentos_argentina.csv (no editar a mano)\n' +
    "'use strict';\n\n" +
    'module.exports = {\n' + lines.join(',\n') + '\n};\n';

const js = '// GENERADO desde scripts/provincias_y_departamentos_argentina.csv (no editar a mano)\n' +
    '(function() {\n' +
    '  window.DEPARTMENTS_GEO = {\n' + lines.join(',\n') + '\n  };\n' +
    '})();\n';

fs.writeFileSync(OUT_CJS, cjs, 'utf8');
fs.writeFileSync(OUT_JS, js, 'utf8');

const total = Object.keys(map).reduce((n, p) => n + map[p].length, 0);
console.log('provincias:', provinces.length, '| departamentos:', total);
console.log('OK ->', path.basename(OUT_CJS), '+', path.basename(OUT_JS));