const { buildSeoLandingPage, ACTIONS } = require('../utils/seoLandingPages');

const reparar = ACTIONS.find(a => a.slug === 'reparar');
console.log('Action object:', JSON.stringify(reparar, null, 2).slice(0, 500));
console.log('Type check:', typeof reparar, Array.isArray(reparar));

const html = buildSeoLandingPage('action', reparar, 'es', []);
console.log('HTML contains "reparar por dispositivo":', html.includes('reparar por dispositivo'));
console.log('HTML contains "por dispositivo":', html.includes('por dispositivo'));
console.log('HTML contains "/servicios/reparar-":', html.includes('/servicios/reparar-'));

// Check if the action section code ran
const idx = html.indexOf('por dispositivo');
if (idx >= 0) {
  console.log('Found at index:', idx);
  console.log(html.slice(idx, idx + 500));
} else {
  console.log('Not found. Searching for action-specific content...');
  console.log('HTML contains "acciones":', html.includes('acciones'));
}