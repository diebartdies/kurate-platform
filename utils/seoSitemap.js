const fs = require('fs');
const path = require('path');
const KURATE_BASE = 'https://kurate.drsrv.net.ar';

function resolveRequestBaseUrl(req) {
  return KURATE_BASE;
}

function isKuraTeHost(req) {
  return true;
}

function baseUrlForNamedSite(site) {
  return KURATE_BASE;
}

const { getAllSeoUrls } = require('./seoLandingPages');
const { getAllServiceUrls } = require('./seoServicePages');
const { isProfileIndexable } = require('./seoMeta');
const serviceTree = require('../data/serviceTree');

const ENV_NAMES = { hogar: 'Hogar', oficina: 'Oficina', 'casa-campo': 'Casa de Campo', industria: 'Industria' };
const SEO_ACTIONS = ['reparar', 'instalar', 'mantener', 'verificar'];

/**
 * Las landings por área (/hogar/linea-blanca/heladera/reparar) generan 728 URLs
 * que son casi idénticas entre sí: mismo texto cambiando dispositivo y acción.
 * Google las lee como contenido duplicado y deja de rankear el conjunto. Por eso
 * quedan fuera del sitemap; siguen accesibles por link directo, pero no compiten
 * contra las páginas de /servicios/, que sí tienen contenido propio.
 */
function getAllServicePages() {
  return [];
}

/**
 * Páginas estáticas que sí queremos en el índice.
 *
 * /home.html quedó afuera: es una página residual del fork original (título
 * "Professionals — Colección exclusiva", nav "Model Entrance", acentos rotos) y
 * ahora redirige 301 a /hogar.html. Anunciarla en el sitemap era enviarle a
 * Google una página fuera de marca.
 *
 * /precios-aire-acondicionado (sin .html) redirige 301 a la versión .html: en el
 * sitemap tiene que ir la URL final, no la que redirige.
 */
const STATIC_URLS = [
  { loc: '/', priority: 1.0, changefreq: 'weekly' },
  { loc: '/hogar.html', priority: 0.9, changefreq: 'daily' },
  { loc: '/avisos.html', priority: 0.7, changefreq: 'daily' },
  { loc: '/precios-aire-acondicionado.html', priority: 0.8, changefreq: 'monthly' },
  { loc: '/condiciones-servicio.html', priority: 0.3, changefreq: 'yearly' },
  { loc: '/conciencia-vih.html', priority: 0.4, changefreq: 'yearly' },
  { loc: '/conciencia-cancer-mama.html', priority: 0.4, changefreq: 'yearly' }
];

/**
 * Fecha real de última modificación del archivo servido. Antes todas las URLs
 * del sitemap llevaban la fecha del día: Google detecta que el lastmod no es
 * confiable y lo ignora por completo (peor que no ponerlo).
 * @returns {string|null} YYYY-MM-DD
 */
function staticLastmod(loc) {
  const file = loc === '/' ? 'index.html' : loc.replace(/^\//, '');
  try {
    const stat = fs.statSync(path.join(__dirname, '..', 'public', file));
    return stat.mtime.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

function isoDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function urlXml(baseUrl, entry) {
  const lastmod = entry.lastmod || null;
  const parts = [`  <url>`, `    <loc>${baseUrl}${entry.loc}</loc>`];
  if (lastmod) parts.push(`    <lastmod>${lastmod}</lastmod>`);
  parts.push(`    <changefreq>${entry.changefreq}</changefreq>`);
  parts.push(`    <priority>${entry.priority}</priority>`);
  parts.push(`  </url>`);
  return parts.join('\n');
}

async function buildSitemapForBase(baseUrl) {
  const seoUrls = getAllSeoUrls();
  const serviceUrls = getAllServiceUrls();
  const dynamicServicePages = getAllServicePages();

  // Perfiles: solo profesionales reales, verificados, con aviso activo y con
  // contenido propio (bio). Los perfiles QA y las cuentas seed quedan afuera.
  let profileUrls = [];
  try {
    const User = require('../models/User');
    const Aviso = require('../models/Aviso');
    const activeAvisoProfessionals = await Aviso.distinct('professional', { status: { $in: ['active', 'expiring'] } });
    const profiles = await User.find({
      _id: { $in: activeAvisoProfessionals },
      role: 'professional',
      verificationStatus: 'approved',
      accountDeletedAt: null,
      'professionalProfile.alias': { $exists: true, $ne: '' }
    }).select(
      'email verificationStatus updatedAt professionalProfile.alias professionalProfile.bio '
      + 'professionalProfile.isExposed'
    ).lean();
    profileUrls = profiles
      .filter(isProfileIndexable)
      .map(p => ({
        loc: '/perfil/' + encodeURIComponent(p.professionalProfile.alias),
        priority: 0.6,
        changefreq: 'weekly',
        lastmod: isoDate(p.updatedAt)
      }));
  } catch (err) {
    console.error('Failed to load profiles for sitemap:', err.message);
  }

  const staticUrls = STATIC_URLS.map(entry => ({
    ...entry,
    lastmod: staticLastmod(entry.loc)
  }));

  const allUrls = [...staticUrls, ...seoUrls, ...serviceUrls, ...dynamicServicePages, ...profileUrls];
  const inner = allUrls.map(e => urlXml(baseUrl, e)).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${inner}\n</urlset>`;
  return { xml, urls: allUrls.map(e => ({ loc: baseUrl + e.loc })) };
}

function buildSitemapXml() {
  const staticUrls = STATIC_URLS.map(entry => ({ ...entry, lastmod: staticLastmod(entry.loc) }));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${staticUrls.map(e => urlXml(KURATE_BASE, e)).join('\n')}\n</urlset>`;
}

/**
 * robots.txt.
 *
 * Se sacaron los `Allow:` de /home.html y /precios-aire-acondicionado: el
 * primero redirige 301 y el segundo también, así que anunciarlos acá solo
 * mandaba a Google a URLs que redirigen. Los Disallow de páginas privadas se
 * mantienen. Los dos sitemaps se declaran (el general y el de /servicios/).
 */
function buildRobotsTxt(baseUrl) {
  return `User-agent: *
Allow: /
Allow: /hogar.html
Allow: /servicios/
Allow: /categorias/
Allow: /acciones/
Allow: /entornos/
Allow: /niveles/
Allow: /perfil/
Disallow: /api/
Disallow: /dashboard.html
Disallow: /profDashboard.html
Disallow: /login.html
Disallow: /register.html
Disallow: /recover.html
Disallow: /verify.html
Disallow: /admin.html
Disallow: /forgot.html
Disallow: /feedback.html
Disallow: /discover.html
Disallow: /hogar-detail.html
Disallow: /captura-dni.html
Disallow: /set-password.html

Sitemap: ${baseUrl}/sitemap.xml
Sitemap: ${baseUrl}/sitemap-services.xml
`;
}

function buildKuraTeRobotsTxt() {
  return buildRobotsTxt(KURATE_BASE);
}

module.exports = {
  KURATE_BASE,
  resolveRequestBaseUrl,
  isKuraTeHost,
  baseUrlForNamedSite,
  buildSitemapForBase,
  buildSitemapXml,
  buildRobotsTxt,
  buildKuraTeRobotsTxt
};
