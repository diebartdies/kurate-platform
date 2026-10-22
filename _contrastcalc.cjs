// WCAG contrast helper: pick a text/background pair that clears 4.5:1 for body text.
function srgbToLin(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function lum([r, g, b]) {
  return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
}
function hexToRgb(h) {
  const s = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
}
function ratio(fg, bg) {
  const a = lum(hexToRgb(fg));
  const b = lum(hexToRgb(bg));
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}
function over(fgHex, alpha, bgHex) {
  const f = hexToRgb(fgHex);
  const b = hexToRgb(bgHex);
  const mix = f.map((v, i) => Math.round(alpha * v + (1 - alpha) * b[i]));
  return '#' + mix.map((v) => v.toString(16).padStart(2, '0')).join('');
}

const GOLD = '#B8922E';
const CARD = '#27283b';

console.log('Underlying card background resolves to', CARD, '\n');
console.log('--- current state ---');
const curBg = over(GOLD, 0.15, CARD);
console.log(`active chip bg ${curBg}  gold text ${GOLD}  = ${ratio(GOLD, curBg).toFixed(2)}:1  (need 4.5)`);
console.log(`body #666 on #0f0f1a                     = ${ratio('#666666', '#0f0f1a').toFixed(2)}:1  (need 4.5)`);

console.log('\n--- candidate gold tints for the active chip (text stays brand gold) ---');
for (const a of [0.15, 0.12, 0.10, 0.08, 0.06]) {
  const bg = over(GOLD, a, CARD);
  const r = ratio(GOLD, bg);
  console.log(`  rgba(gold,${a.toFixed(2)}) -> ${bg}  ${GOLD} on it = ${r.toFixed(2)}:1  ${r >= 4.5 ? 'PASS' : 'fail'}`);
}

console.log('\n--- candidate text golds on the current bg', curBg, '---');
for (const g of ['#B8922E', '#C79A32', '#D4A93A', '#DCB44A', '#E4C063', '#EFD183']) {
  const r = ratio(g, curBg);
  console.log(`  ${g}  = ${r.toFixed(2)}:1  ${r >= 4.5 ? 'PASS' : 'fail'}${r >= 7 ? '  (AAA)' : ''}`);
}

console.log('\n--- combined: dimmer tint + slightly brighter gold ---');
for (const a of [0.10, 0.08, 0.06]) {
  const bg = over(GOLD, a, CARD);
  for (const g of ['#C79A32', '#D4A93A', '#DCB44A']) {
    const r = ratio(g, bg);
    console.log(`  tint ${a.toFixed(2)} bg ${bg}  text ${g}  = ${r.toFixed(2)}:1  ${r >= 4.5 ? 'PASS' : 'fail'}`);
  }
}

console.log('\n--- body text candidates on #0f0f1a (replacing #666) ---');
for (const g of ['#666666', '#7e7e7e', '#8c8c8c', '#999999', '#a6a6a6']) {
  const r = ratio(g, '#0f0f1a');
  console.log(`  ${g}  = ${r.toFixed(2)}:1  ${r >= 4.5 ? 'PASS' : 'fail'}`);
}

console.log('\n--- gold on the dark page bg, for reference ---');
console.log(`  ${GOLD} on #0f0f1a = ${ratio(GOLD, '#0f0f1a').toFixed(2)}:1`);
