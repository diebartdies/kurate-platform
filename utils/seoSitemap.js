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

const STATIC_URLS = [
  { loc: '/', priority: 1.0, changefreq: 'weekly' },
  { loc: '/home.html', priority: 0.8, changefreq: 'daily' },
  { loc: '/hogar.html', priority: 0.7, changefreq: 'daily' },
  { loc: '/avisos.html', priority: 0.7, changefreq: 'daily' },
  { loc: '/precios-aire-acondicionado', priority: 0.8, changefreq: 'monthly' },
  { loc: '/conciencia-vih.html', priority: 0.5, changefreq: 'yearly' },
  { loc: '/conciencia-cancer-mama.html', priority: 0.5, changefreq: 'yearly' }
];

/** Fecha de hoy en ISO, para <lastmod>. Google lo usa como señal de frescura. */
function today() {
  return new Date().toISOString().slice(0, 10);
}

function urlXml(baseUrl, entry) {
  const lastmod = entry.lastmod || today();
  return `  <url>\n    <loc>${baseUrl}${entry.loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${entry.changefreq}</changefreq>\n    <priority>${entry.priority}</priority>\n  </url>`;
}

async function buildSitemapForBase(baseUrl) {
  const seoUrls = getAllSeoUrls();
  const serviceUrls = getAllServiceUrls();
  const dynamicServicePages = getAllServicePages();

  // Add profile pages for approved professionals with an active/expiring aviso
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
      'professionalProfile.alias': { $exists: true, $ne: '' },
      'professionalProfile.isExposed': { $ne: false }
    }).select('professionalProfile.alias').lean();
    profileUrls = profiles
      .map(p => p.professionalProfile?.alias)
      .filter(Boolean)
      .map(alias => ({
        loc: '/perfil/' + encodeURIComponent(alias),
        priority: 0.6,
        changefreq: 'weekly'
      }));
  } catch (err) {
    console.error('Failed to load profiles for sitemap:', err.message);
  }

  const allUrls = [...STATIC_URLS, ...seoUrls, ...serviceUrls, ...dynamicServicePages, ...profileUrls];
  const inner = allUrls.map(e => urlXml(baseUrl, e)).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${inner}\n</urlset>`;
  return { xml, urls: allUrls.map(e => ({ loc: baseUrl + e.loc })) };
}

function buildSitemapXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${STATIC_URLS.map(e => urlXml(KURATE_BASE, e)).join('\n')}\n</urlset>`;
}

function buildRobotsTxt(baseUrl) {
  return `User-agent: *
Allow: /
Allow: /index.html
Allow: /home.html
Allow: /hogar.html
Allow: /servicios/
Allow: /precios-aire-acondicionado
Allow: /conciencia-vih.html
Allow: /conciencia-cancer-mama.html
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

Sitemap: ${baseUrl}/sitemap.xml
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
