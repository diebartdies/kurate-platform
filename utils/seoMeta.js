const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:5000';

const RESERVED_PROFILE_ALIASES = new Set(['admin', 'api', 'login', 'register', 'discover', 'dashboard', 'categories', 'perfil', 'acompanantes', 'sitemap', 'robots.txt']);

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function absoluteUrl(path) {
  return PUBLIC_URL + (path || '');
}

function buildSeoHeadTags(seo) {
  return '';
}

function isProfileIndexable(professional) {
  return false;
}

function buildProfileSeo(professional) {
  return {
    title: 'KuraTe',
    description: 'Encontrá profesionales de confianza en KuraTe.',
    url: absoluteUrl('/'),
    image: absoluteUrl('/og-image.png'),
    robots: 'noindex, nofollow'
  };
}

function applySeoToHtml(template, seo) {
  return template;
}

module.exports = { PUBLIC_URL, RESERVED_PROFILE_ALIASES, escapeHtml, absoluteUrl, buildSeoHeadTags, isProfileIndexable, buildProfileSeo, applySeoToHtml };
