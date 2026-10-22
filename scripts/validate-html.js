const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = process.argv[2] || path.join(__dirname, 'public');
const only = process.argv[3];

const files = fs.readdirSync(PUBLIC_DIR)
  .filter((f) => f.endsWith('.html'))
  .filter((f) => (only ? f.includes(only) : true))
  .sort();

async function validate(file) {
  const html = fs.readFileSync(path.join(PUBLIC_DIR, file));
  const res = await fetch('https://validator.nu/?out=json', {
    method: 'POST',
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: html
  });
  if (!res.ok) throw new Error(`validator.nu responded ${res.status}`);
  return res.json();
}

(async () => {
  const all = [];
  for (const file of files) {
    let data;
    try {
      data = await validate(file);
    } catch (err) {
      console.log(`SKIP  ${file}  (${err.message})`);
      continue;
    }
    const msgs = data.messages || [];
    const errs = msgs.filter((m) => m.type === 'error');
    const warns = msgs.filter((m) => m.type !== 'error' && m.subType !== 'warning');
    const realWarns = msgs.filter((m) => m.type === 'info' || m.subType === 'warning');

    console.log(`\n=== ${file} ===  errors:${errs.length} warnings:${realWarns.length}`);
    for (const m of msgs) {
      if (m.type === 'info' && m.subType !== 'warning') continue;
      all.push({ file, ...m });
      const line = m.lastLine != null ? `L${m.lastLine}` : '';
      console.log(`  [${m.type === 'error' ? 'ERR ' : 'WARN'}] ${line} ${m.message}`);
      if (m.extract) console.log(`         > ${m.extract.replace(/\s+/g, ' ').trim().slice(0, 150)}`);
    }
  }

  const byType = {};
  for (const m of all) {
    if (m.type === 'info' && m.subType !== 'warning') continue;
    const key = `${m.type === 'error' ? 'ERR' : 'WARN'} ${m.message.replace(/".*?"/g, '"X"')}`;
    byType[key] = byType[key] || { count: 0, files: new Set() };
    byType[key].count++;
    byType[key].files.add(m.file);
  }

  console.log('\n\n########## SUMMARY ##########');
  Object.entries(byType)
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([k, v]) => console.log(`${String(v.count).padStart(4)}  ${k}\n        pages: ${[...v.files].join(', ')}`));
})();
