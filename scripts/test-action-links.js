const { buildSeoLandingPage, ACTIONS } = require('../utils/seoLandingPages');

const reparar = ACTIONS.find(a => a.slug === 'reparar');
const html = buildSeoLandingPage('action', reparar, 'es', []);

console.log('HTML length:', html.length);

const match = html.match(/reparar por dispositivo[\s\S]*?<div style="display:flex/);
console.log('Has device section:', !!match);

if (match) {
  const section = html.substring(match.index, match.index + 2000);
  const links = (section.match(/href="\/servicios\/reparar-/g) || []).length;
  console.log('Links a /servicios/reparar-*:', links);
  const firstLinks = section.match(/href="(\/servicios\/reparar-[^"]+)"/g) || [];
  console.log('Primeros 5:', firstLinks.slice(0, 5));
}