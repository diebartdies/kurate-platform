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
  if (!professional) return false;
  const prof = professional.professionalProfile || {};
  const status = professional.verificationStatus;
  const isExposed = prof.isExposed;
  return status === 'approved' && isExposed !== false;
}

function buildProfileSeo(professional) {
  const prof = professional.professionalProfile || {};
  const hp = professional.hogarProfile || {};
  const name = prof.alias || (hp.firstName ? `${hp.firstName} ${hp.lastName || ''}`.trim() : 'Profesional');
  const bio = prof.bio || '';
  const desc = bio ? `${name} — ${bio.substring(0, 120)}` : `${name} — Profesional verificado en KuraTe.`;
  return {
    title: `${name} | KuraTe`,
    description: desc,
    url: absoluteUrl(`/perfil/${encodeURIComponent(prof.alias || '')}`),
    image: absoluteUrl('/og-image.png'),
    robots: 'index, follow'
  };
}

function applySeoToHtml(template, seo) {
  if (!seo) return template;
  let html = template;
  // Replace or inject <title>
  if (seo.title) {
    if (html.includes('<title>')) {
      html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(seo.title)}</title>`);
    } else {
      html = html.replace('<head>', `<head><title>${escapeHtml(seo.title)}</title>`);
    }
  }
  // Replace or inject meta description
  if (seo.description) {
    if (html.includes('name="description"')) {
      html = html.replace(/<meta\s+name="description"\s+content="[^"]*"/, `<meta name="description" content="${escapeHtml(seo.description)}"`);
    } else {
      html = html.replace('</head>', `<meta name="description" content="${escapeHtml(seo.description)}">\n</head>`);
    }
  }
  // Replace or inject robots meta
  if (seo.robots) {
    if (html.includes('name="robots"')) {
      html = html.replace(/<meta\s+name="robots"\s+content="[^"]*"/, `<meta name="robots" content="${seo.robots}"`);
    } else {
      html = html.replace('</head>', `<meta name="robots" content="${seo.robots}">\n</head>`);
    }
  }
  // Inject canonical link
  if (seo.url) {
    if (html.includes('rel="canonical"')) {
      html = html.replace(/<link\s+rel="canonical"\s+href="[^"]*"/, `<link rel="canonical" href="${escapeHtml(seo.url)}"`);
    } else {
      html = html.replace('</head>', `<link rel="canonical" href="${escapeHtml(seo.url)}">\n</head>`);
    }
  }
  // Inject og:title
  if (seo.title) {
    if (html.includes('property="og:title"')) {
      html = html.replace(/<meta\s+property="og:title"\s+content="[^"]*"/, `<meta property="og:title" content="${escapeHtml(seo.title)}"`);
    } else {
      html = html.replace('</head>', `<meta property="og:title" content="${escapeHtml(seo.title)}">\n</head>`);
    }
  }
  // Inject og:description
  if (seo.description) {
    if (html.includes('property="og:description"')) {
      html = html.replace(/<meta\s+property="og:description"\s+content="[^"]*"/, `<meta property="og:description" content="${escapeHtml(seo.description)}"`);
    } else {
      html = html.replace('</head>', `<meta property="og:description" content="${escapeHtml(seo.description)}">\n</head>`);
    }
  }
  // Inject og:image
  if (seo.image) {
    if (html.includes('property="og:image"')) {
      html = html.replace(/<meta\s+property="og:image"\s+content="[^"]*"/, `<meta property="og:image" content="${escapeHtml(seo.image)}"`);
    } else {
      html = html.replace('</head>', `<meta property="og:image" content="${escapeHtml(seo.image)}">\n</head>`);
    }
  }
  // Inject og:url
  if (seo.url) {
    if (html.includes('property="og:url"')) {
      html = html.replace(/<meta\s+property="og:url"\s+content="[^"]*"/, `<meta property="og:url" content="${escapeHtml(seo.url)}"`);
    } else {
      html = html.replace('</head>', `<meta property="og:url" content="${escapeHtml(seo.url)}">\n</head>`);
    }
  }
  return html;
}

module.exports = { PUBLIC_URL, RESERVED_PROFILE_ALIASES, escapeHtml, absoluteUrl, buildSeoHeadTags, isProfileIndexable, buildProfileSeo, applySeoToHtml };
