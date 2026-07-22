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

const STATIC_URLS = [
  { loc: '/', priority: 1.0, changefreq: 'weekly' },
  { loc: '/home.html', priority: 0.8, changefreq: 'daily' },
  { loc: '/hogar.html', priority: 0.7, changefreq: 'daily' },
  { loc: '/hogar-detail.html', priority: 0.6, changefreq: 'weekly' },
  { loc: '/discover.html', priority: 0.7, changefreq: 'daily' },
  { loc: '/feedback.html', priority: 0.5, changefreq: 'monthly' },
  { loc: '/conciencia-vih.html', priority: 0.5, changefreq: 'yearly' },
  { loc: '/conciencia-cancer-mama.html', priority: 0.5, changefreq: 'yearly' }
];

function urlXml(baseUrl, entry) {
  return `  <url>\n    <loc>${baseUrl}${entry.loc}</loc>\n    <lastmod>2026-07-22</lastmod>\n    <changefreq>${entry.changefreq}</changefreq>\n    <priority>${entry.priority}</priority>\n  </url>`;
}

async function buildSitemapForBase(baseUrl) {
  const urls = STATIC_URLS.map(e => ({ loc: baseUrl + e.loc }));
  const inner = STATIC_URLS.map(e => urlXml(baseUrl, e)).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${inner}\n</urlset>`;
  return { xml, urls };
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
Allow: /hogar-detail.html
Allow: /conciencia-vih.html
Allow: /conciencia-cancer-mama.html
Allow: /discover.html
Allow: /feedback.html
Disallow: /api/
Disallow: /dashboard.html
Disallow: /profDashboard.html
Disallow: /login.html
Disallow: /register.html
Disallow: /recover.html
Disallow: /verify.html
Disallow: /admin.html

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
