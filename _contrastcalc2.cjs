function srgbToLin(c) { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }
function lum([r, g, b]) { return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b); }
function hexToRgb(h) { const s = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)); }
function ratio(fg, bg) { const a = lum(hexToRgb(fg)), b = lum(hexToRgb(bg)); const [hi, lo] = a > b ? [a, b] : [b, a]; return (hi + 0.05) / (lo + 0.05); }
function over(fgHex, alpha, bgHex) {
  const f = hexToRgb(fgHex), b = hexToRgb(bgHex);
  return '#' + f.map((v, i) => Math.round(alpha * v + (1 - alpha) * b[i]).toString(16).padStart(2, '0')).join('');
}
const GOLD = '#B8922E', CARD = '#27283b';
const activeBg = over(GOLD, 0.15, CARD);

const rows = [
  ['ACTIVE chip text  --gold-light #D9BC6A on tinted bg', ratio('#D9BC6A', activeBg), activeBg],
  ['ACTIVE chip border --primary-gold vs page #0f0f1a (non-text 3:1)', ratio(GOLD, '#0f0f1a'), '#0f0f1a'],
  ['INACTIVE chip text #aaa on card', ratio('#aaa', CARD), CARD],
  ['INACTIVE chip border gold@0.4 over card (vs card)', ratio(over(GOLD, 0.4, CARD), CARD), CARD],
  ['body #666 on #0f0f1a  (CURRENT, failing)', ratio('#666666', '#0f0f1a'), '#0f0f1a'],
  ['body #7e7e7e on #0f0f1a (candidate)', ratio('#7e7e7e', '#0f0f1a'), '#0f0f1a'],
  ['body #8c8c8c on #0f0f1a (candidate, safer)', ratio('#8c8c8c', '#0f0f1a'), '#0f0f1a'],
  ['body #7e7e7e on #27283b card (candidate)', ratio('#7e7e7e', CARD), CARD],
  ['gold text on card #27283b', ratio(GOLD, CARD), CARD]
];
for (const [label, r, bg] of rows) {
  const need = label.includes('non-text') ? 3 : 4.5;
  console.log(`${r >= need ? 'PASS' : 'FAIL'}  ${r.toFixed(2)}:1 (need ${need})  ${label}  [bg ${bg}]`);
}
