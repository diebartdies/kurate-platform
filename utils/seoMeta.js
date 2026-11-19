const PUBLIC_URL = process.env.PUBLIC_URL || 'https://kurate.drsrv.net.ar';

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
  if (professional.verificationStatus !== 'approved') return false;
  if (prof.isExposed === false) return false;

  // Cuentas de prueba/seed: nunca al índice. El catálogo actual es 100% seed
  // (@kurate.seed / @test.com) y perfiles QA; indexarlos es una señal de
  // calidad negativa y además muestra bios "Perfil QA KuraTe" a los usuarios.
  const email = String(professional.email || '');
  if (/@(kurate\.seed|test\.com|example\.(com|org))$/i.test(email)) return false;

  const alias = String(prof.alias || '').trim();
  if (!alias) return false;

  // Un perfil sin bio (o con menos de 40 caracteres) es una página vacía: no
  // aporta nada al índice y Google la trata como thin content.
  const bio = String(prof.bio || '').trim();
  if (bio.length < 40) return false;
  if (/^perfil\s+qa\b/i.test(bio)) return false;

  return true;
}

function buildProfileSeo(professional) {
  const prof = professional.professionalProfile || {};
  const hp = professional.hogarProfile || {};
  const alias = prof.alias || (hp.firstName ? `${hp.firstName} ${hp.lastName || ''}`.trim() : 'Profesional');
  const bio = String(prof.bio || '').trim();
  const services = serviceLabels(prof);
  const place = profileLocation(prof);
  const primary = services[0] ? `${services[0]} en ${place.city || place.region || 'Argentina'}` : null;

  const title = primary
    ? `${alias} — ${primary} | KuraTe`
    : `${alias} — Profesional verificado | KuraTe`;
  const desc = bio
    ? `${bio.substring(0, 150)}${bio.length > 150 ? '…' : ''}`
    : `${alias}, profesional verificado en KuraTe. Presupuesto sin cargo y contacto directo.`;

  const photo = Array.isArray(prof.photos) && prof.photos.length ? prof.photos[0] : null;
  const url = absoluteUrl(`/perfil/${encodeURIComponent(prof.alias || '')}`);

  return {
    title,
    description: desc,
    url,
    image: photo && /^https?:/i.test(photo) ? photo : absoluteUrl(photo || '/og-image.png'),
    robots: 'index, follow, max-image-preview:large',
    jsonLd: buildProfileJsonLd({ alias, bio, services, place, photo, url }),
    bodyHtml: buildProfileBodyHtml({ alias, bio, services, place, photo })
  };
}

/** Nombres de los servicios del perfil, sea array de strings u objetos. */
function serviceLabels(prof) {
  const raw = prof.services || (prof.hogarProfile && prof.hogarProfile.services) || [];
  const out = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    if (typeof item === 'string') {
      if (item.trim()) out.push(item.trim());
    } else if (item && typeof item === 'object') {
      if (item.name && String(item.name).trim()) out.push(String(item.name).trim());
      if (Array.isArray(item.brands)) {
        for (const brand of item.brands) {
          const name = typeof brand === 'string' ? brand : (brand && brand.name);
          if (name && String(name).trim()) out.push(String(name).trim());
        }
      }
    }
  }
  return [...new Set(out)].slice(0, 12);
}

/** Ubicación legible del perfil: {city, region, label}. */
function profileLocation(prof) {
  const loc = prof.location || {};
  const city = String(loc.city || loc.ciudad || '').trim();
  const region = String(loc.province || loc.provincia || '').trim();
  const neighborhood = String(loc.neighborhood || loc.barrio || loc.area || '').trim();
  const label = [neighborhood, city, region].filter(Boolean).join(', ');
  return { city, region, neighborhood, label };
}

function buildProfileJsonLd({ alias, bio, services, place, photo, url }) {
  const person = {
    '@type': 'Person',
    '@id': url + '#person',
    name: alias,
    url
  };
  if (bio) person.description = bio.substring(0, 300);
  if (photo) person.image = photo;
  if (services.length) {
    person.jobTitle = services[0];
    person.knowsAbout = services.slice(0, 8);
  }
  if (place.city || place.region) {
    person.address = {
      '@type': 'PostalAddress',
      addressLocality: place.city || undefined,
      addressRegion: place.region || undefined,
      addressCountry: 'AR'
    };
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    url,
    mainEntity: person,
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: PUBLIC_URL + '/' },
        { '@type': 'ListItem', position: 2, name: 'Profesionales', item: PUBLIC_URL + '/hogar.html' },
        { '@type': 'ListItem', position: 3, name: alias, item: url }
      ]
    }
  };
}

/**
 * Contenido del perfil renderizado en el servidor.
 *
 * treasure.html entrega un <div id="treasureContent"></div> vacío y lo llena
 * por JS: el HTML que veía Google eran 1.7 KB sin <h1>, sin bio y sin servicios.
 * Este bloque es el contenido real de la página; el JS lo reemplaza al cargar,
 * así que no cambia la experiencia, pero Google ya lo ve en el HTML inicial.
 */
function buildProfileBodyHtml({ alias, bio, services, place, photo }) {
  const parts = [];
  parts.push('<div class="seo-profile">');
  if (photo) {
    parts.push(`<img src="${escapeHtml(photo)}" alt="${escapeHtml(alias)}" width="160" height="160" loading="eager" style="float:right;margin:0 0 16px 16px;border-radius:50%;object-fit:cover">`);
  }
  parts.push(`<h1>${escapeHtml(alias)}</h1>`);
  if (place.label) parts.push(`<p class="seo-profile-location">${escapeHtml(place.label)}</p>`);
  if (bio) parts.push(`<p>${escapeHtml(bio)}</p>`);
  if (services.length) {
    parts.push('<h2>Servicios</h2>');
    parts.push('<ul>' + services.map(s => `<li>${escapeHtml(s)}</li>`).join('') + '</ul>');
  }
  parts.push(`<p><a href="/hogar.html">Buscar profesionales en KuraTe</a></p>`);
  parts.push('</div>');
  return parts.join('\n');
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
  // Inject JSON-LD (ProfilePage/Person, etc.)
  if (seo.jsonLd) {
    const json = JSON.stringify(seo.jsonLd).replace(/</g, '\\u003c');
    html = html.replace('</head>', `<script type="application/ld+json">${json}</script>\n</head>`);
  }
  // Inject server-rendered content into the empty placeholder.
  if (seo.bodyHtml) {
    if (html.includes('<div id="treasureContent"></div>')) {
      html = html.replace('<div id="treasureContent"></div>', `<div id="treasureContent">\n${seo.bodyHtml}\n</div>`);
    } else {
      html = html.replace('</body>', `<div class="seo-fallback">\n${seo.bodyHtml}\n</div>\n</body>`);
    }
  }
  return html;
}

module.exports = {
  PUBLIC_URL,
  RESERVED_PROFILE_ALIASES,
  escapeHtml,
  absoluteUrl,
  buildSeoHeadTags,
  isProfileIndexable,
  buildProfileSeo,
  buildProfileJsonLd,
  buildProfileBodyHtml,
  serviceLabels,
  profileLocation,
  applySeoToHtml
};
