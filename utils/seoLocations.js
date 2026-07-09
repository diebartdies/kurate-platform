const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const { PUBLIC_URL, escapeHtml, absoluteUrl, buildSeoHeadTags } = require('./seoMeta');

const REGISTRY_PATH = path.join(__dirname, 'seo-locations.generated.json');
const MIN_PROFESSIONALS = Math.max(1, parseInt(process.env.SEO_LOCATION_MIN_COUNT || '1', 10));

const INDEXABLE_QUERY = require('./professionalVisibility').INDEXABLE_FILTER;

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeName(value) {
  return String(value || '').trim();
}

function isCabaProvince(province) {
  return normalizeName(province).toLowerCase() === 'caba';
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function fetchIndexableProfessionals(extraQuery = {}, select) {
  return User.find({ ...INDEXABLE_QUERY, ...extraQuery })
    .select(select || 'professionalProfile.alias professionalProfile.quality professionalProfile.location updatedAt createdAt')
    .lean();
}

function aggregateLocationPages(professionals) {
  const pages = new Map();

  const touchPage = (key, data, user) => {
    if (!pages.has(key)) {
      pages.set(key, { ...data, count: 0, lastUpdated: null });
    }
    const page = pages.get(key);
    page.count += 1;
    const ts = user.updatedAt || user.createdAt;
    if (ts && (!page.lastUpdated || new Date(ts) > new Date(page.lastUpdated))) {
      page.lastUpdated = ts;
    }
  };

  professionals.forEach((user) => {
    const loc = user.professionalProfile?.location || {};
    const province = normalizeName(loc.province);
    if (!province) return;

    const provinceSlug = slugify(province);
    if (!provinceSlug) return;

    touchPage(`p:${provinceSlug}`, {
      provinceSlug,
      provinceName: province,
      areaSlug: null,
      areaName: null,
      areaType: 'province',
      path: `/acompanantes/${provinceSlug}`
    }, user);

    if (isCabaProvince(province)) {
      const neighborhood = normalizeName(loc.neighborhood);
      if (!neighborhood) return;
      const areaSlug = slugify(neighborhood);
      if (!areaSlug) return;
      touchPage(`a:${provinceSlug}:${areaSlug}`, {
        provinceSlug,
        provinceName: province,
        areaSlug,
        areaName: neighborhood,
        areaType: 'neighborhood',
        path: `/acompanantes/${provinceSlug}/${areaSlug}`
      }, user);
      return;
    }

    const city = normalizeName(loc.city);
    if (city) {
      const citySlug = slugify(city);
      if (citySlug) {
        touchPage(`a:${provinceSlug}:${citySlug}`, {
          provinceSlug,
          provinceName: province,
          areaSlug: citySlug,
          areaName: city,
          areaType: 'city',
          path: `/acompanantes/${provinceSlug}/${citySlug}`
        }, user);
      }
    }

    const neighborhood = normalizeName(loc.neighborhood);
    if (neighborhood && neighborhood.toLowerCase() !== city.toLowerCase()) {
      const neighborhoodSlug = slugify(neighborhood);
      if (neighborhoodSlug) {
        touchPage(`a:${provinceSlug}:${neighborhoodSlug}`, {
          provinceSlug,
          provinceName: province,
          areaSlug: neighborhoodSlug,
          areaName: neighborhood,
          areaType: 'neighborhood',
          path: `/acompanantes/${provinceSlug}/${neighborhoodSlug}`
        }, user);
      }
    }
  });

  return [...pages.values()]
    .filter((page) => page.count >= MIN_PROFESSIONALS)
    .sort((a, b) => a.path.localeCompare(b.path));
}

async function buildLocationRegistry() {
  const professionals = await fetchIndexableProfessionals();
  const pages = aggregateLocationPages(professionals);
  return {
    generatedAt: new Date().toISOString(),
    minProfessionals: MIN_PROFESSIONALS,
    totalPages: pages.length,
    pages
  };
}

async function refreshLocationRegistry() {
  const registry = await buildLocationRegistry();
  fs.writeFileSync(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
  return registry;
}

function loadLocationRegistry() {
  try {
    if (!fs.existsSync(REGISTRY_PATH)) return null;
    return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  } catch (error) {
    return null;
  }
}

async function getLocationPages() {
  const professionals = await fetchIndexableProfessionals();
  return aggregateLocationPages(professionals);
}

async function findLocationPage(provinceSlug, areaSlug) {
  const normalizedProvince = slugify(provinceSlug);
  const normalizedArea = areaSlug ? slugify(areaSlug) : null;
  const pages = await getLocationPages();

  if (normalizedArea) {
    return pages.find((page) => page.provinceSlug === normalizedProvince && page.areaSlug === normalizedArea) || null;
  }

  return pages.find((page) => page.provinceSlug === normalizedProvince && !page.areaSlug) || null;
}

async function fetchProfessionalsForPage(page) {
  const query = {
    ...INDEXABLE_QUERY,
    'professionalProfile.location.province': {
      $regex: `^${escapeRegex(page.provinceName)}$`,
      $options: 'i'
    }
  };

  if (page.areaSlug && page.areaName) {
    if (page.areaType === 'city') {
      query['professionalProfile.location.city'] = {
        $regex: `^${escapeRegex(page.areaName)}$`,
        $options: 'i'
      };
    } else {
      query['professionalProfile.location.neighborhood'] = {
        $regex: `^${escapeRegex(page.areaName)}$`,
        $options: 'i'
      };
    }
  }

  return User.find(query)
    .select('professionalProfile.alias professionalProfile.quality professionalProfile.bio professionalProfile.services professionalProfile.location')
    .sort({ 'professionalProfile.quality': 1, 'professionalProfile.alias': 1 })
    .lean();
}

function buildLocationTitle(page) {
  if (page.areaName) {
    if (isCabaProvince(page.provinceName)) {
      return `Acompañantes en ${page.areaName}, CABA | FullMinent`;
    }
    return `Acompañantes en ${page.areaName}, ${page.provinceName} | FullMinent`;
  }
  return `Acompañantes en ${page.provinceName} | FullMinent`;
}

function buildLocationDescription(page, count) {
  const place = page.areaName
    ? (isCabaProvince(page.provinceName) ? `${page.areaName}, CABA` : `${page.areaName}, ${page.provinceName}`)
    : page.provinceName;
  return `Directorio FullMinent: ${count} Living Treasures verificadas en ${place}. Perfiles exclusivos de acompañantes en Argentina.`;
}

function buildCategoriesFilterUrl(page) {
  const url = new URL('/categories.html', PUBLIC_URL);
  url.searchParams.set('province', page.provinceName);
  if (page.areaName) {
    if (isCabaProvince(page.provinceName) || page.areaType === 'neighborhood') {
      url.searchParams.set('neighborhood', page.areaName);
    } else {
      url.searchParams.set('city', page.areaName);
    }
  }
  return `${url.pathname}${url.search}`;
}

function buildLocationSeo(page, professionals) {
  const url = absoluteUrl(page.path);
  const title = buildLocationTitle(page);
  const description = buildLocationDescription(page, professionals.length);
  const breadcrumbItems = [
    { '@type': 'ListItem', position: 1, name: 'Inicio', item: PUBLIC_URL },
    {
      '@type': 'ListItem',
      position: 2,
      name: page.provinceName,
      item: absoluteUrl(`/acompanantes/${page.provinceSlug}`)
    }
  ];

  if (page.areaName) {
    breadcrumbItems.push({
      '@type': 'ListItem',
      position: 3,
      name: page.areaName,
      item: url
    });
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    description,
    url,
    inLanguage: 'es-AR',
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbItems
    },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: professionals.length,
      itemListElement: professionals.slice(0, 30).map((user, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: absoluteUrl(`/perfil/${encodeURIComponent(user.professionalProfile.alias)}`),
        name: user.professionalProfile.alias
      }))
    }
  };

  return { title, description, url, robots: 'index, follow', jsonLd };
}

async function buildSubAreaLinks(page) {
  if (page.areaSlug) return [];

  const pages = await getLocationPages();
  return pages
    .filter((entry) => entry.provinceSlug === page.provinceSlug && entry.areaSlug)
    .map((entry) => ({
      href: entry.path,
      label: entry.areaName,
      count: entry.count
    }));
}

function buildLocationHtml(page, professionals, seo, subAreas = []) {
  const placeLabel = page.areaName
    ? (isCabaProvince(page.provinceName) ? `${page.areaName}, CABA` : `${page.areaName}, ${page.provinceName}`)
    : page.provinceName;

  const profileItems = professionals.map((user) => {
    const alias = user.professionalProfile?.alias || 'Perfil';
    const quality = user.professionalProfile?.quality || 'Standard';
    const href = `/perfil/${encodeURIComponent(alias)}`;
    return `<li><a href="${escapeHtml(href)}">${escapeHtml(alias)}</a> — ${escapeHtml(quality)}</li>`;
  }).join('\n          ');

  const subAreaItems = subAreas.map((entry) => (
    `<li><a href="${escapeHtml(entry.href)}">${escapeHtml(entry.label)}</a> (${entry.count})</li>`
  )).join('\n          ');

  const subAreasBlock = subAreas.length
    ? `<section><h2>Barrios y ciudades</h2><ul>${subAreaItems}</ul></section>`
    : '';

  const headTags = buildSeoHeadTags(seo);
  const jsonLd = `<script type="application/ld+json">${JSON.stringify(seo.jsonLd)}</script>`;
  const filterUrl = buildCategoriesFilterUrl(page);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <title>${escapeHtml(seo.title)}</title>
  <link rel="stylesheet" href="/css/style.css?v=7.8">
  <link rel="stylesheet" href="/css/responsive.css?v=7.8">
  ${headTags}
  ${jsonLd}
</head>
<body>
  <div class="container">
    <header class="page-header">
      <a href="/index.html" class="logo"><img src="/FullMinent_logo_black.png" alt="FullMinent Logo" class="page-logo"></a>
    </header>
    <section class="card">
      <h1 class="gold-text">Living Treasures en ${escapeHtml(placeLabel)}</h1>
      <p>${escapeHtml(seo.description)}</p>
      <p><a href="${escapeHtml(filterUrl)}">Ver filtros interactivos en el directorio</a></p>
      ${subAreasBlock}
      <section>
        <h2>Perfiles verificados (${professionals.length})</h2>
        <ul>
          ${profileItems}
        </ul>
      </section>
    </section>
    <noscript>
      <article class="seo-crawler-preview">
        <h1>Living Treasures en ${escapeHtml(placeLabel)}</h1>
        <ul>${profileItems}</ul>
      </article>
    </noscript>
  </div>
</body>
</html>`;
}

module.exports = {
  REGISTRY_PATH,
  MIN_PROFESSIONALS,
  slugify,
  aggregateLocationPages,
  buildLocationRegistry,
  refreshLocationRegistry,
  loadLocationRegistry,
  getLocationPages,
  findLocationPage,
  fetchProfessionalsForPage,
  buildLocationSeo,
  buildLocationHtml,
  buildSubAreaLinks
};
