const SEOSAPPEAL_BASE = 'https://www.KuraTe.com';

function resolveRequestBaseUrl(req) {
  return SEOSAPPEAL_BASE;
}

function isKuraTeHost(req) {
  return true;
}

function baseUrlForNamedSite(site) {
  return SEOSAPPEAL_BASE;
}

async function buildSitemapForBase(baseUrl) {
  return { xml: '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>' };
}

function buildSitemapXml() {
  return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>';
}

function buildRobotsTxt(baseUrl) {
  return `User-agent: *\nDisallow: /\n`;
}

function buildKuraTeRobotsTxt() {
  return `User-agent: *\nDisallow: /\n`;
}

module.exports = {
  SEOSAPPEAL_BASE,
  resolveRequestBaseUrl,
  isKuraTeHost,
  baseUrlForNamedSite,
  buildSitemapForBase,
  buildSitemapXml,
  buildRobotsTxt,
  buildKuraTeRobotsTxt
};
