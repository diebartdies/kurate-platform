const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const {
  RESERVED_PROFILE_ALIASES,
  isProfileIndexable,
  buildProfileSeo,
  applySeoToHtml,
  absoluteUrl
} = require('../utils/seoMeta');
const {
  resolveRequestBaseUrl,
  isKuraTeHost,
  buildKuraTeRobotsTxt,
  baseUrlForNamedSite,
  buildSitemapForBase,
  buildRobotsTxt
} = require('../utils/seoSitemap');
const {
  findLocationPage,
  fetchProfessionalsForPage,
  buildLocationSeo,
  buildLocationHtml,
  buildSubAreaLinks
} = require('../utils/seoLocations');

const TREASURE_TEMPLATE_PATH = path.join(__dirname, '..', 'public', 'treasure.html');
let treasureTemplateCache = null;

function loadTreasureTemplate() {
  if (!treasureTemplateCache) {
    treasureTemplateCache = fs.readFileSync(TREASURE_TEMPLATE_PATH, 'utf8');
  }
  return treasureTemplateCache;
}

function sendSitemapXml(res, xml) {
  res.set('Content-Type', 'text/xml; charset=UTF-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.end(Buffer.from(xml, 'utf8'));
}

exports.robotsTxt = (req, res) => {
  if (isKuraTeHost(req)) {
    res.type('text/plain');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.send(buildKuraTeRobotsTxt());
  }
  const baseUrl = resolveRequestBaseUrl(req);
  res.type('text/plain');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(buildRobotsTxt(baseUrl));
};

exports.sitemapXml = async (req, res, next) => {
  try {
    const baseUrl = isKuraTeHost(req)
      ? baseUrlForNamedSite('KuraTe')
      : resolveRequestBaseUrl(req);
    const { xml } = await buildSitemapForBase(baseUrl);
    sendSitemapXml(res, xml);
  } catch (error) {
    next(error);
  }
};

exports.sitemapKuraTeXml = async (req, res, next) => {
  try {
    const { xml } = await buildSitemapForBase(baseUrlForNamedSite('KuraTe'));
    sendSitemapXml(res, xml);
  } catch (error) {
    next(error);
  }
};

exports.sitemapKuraTeXml = async (req, res, next) => {
  try {
    const { xml } = await buildSitemapForBase(baseUrlForNamedSite('KuraTe'));
    sendSitemapXml(res, xml);
  } catch (error) {
    next(error);
  }
};

exports.renderLocationPage = async (req, res, next) => {
  try {
    const provinceSlug = String(req.params.provinceSlug || '').trim();
    const areaSlug = req.params.areaSlug ? String(req.params.areaSlug).trim() : null;
    const page = await findLocationPage(provinceSlug, areaSlug);

    if (!page) {
      res.status(404);
      res.type('html');
      return res.send(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="robots" content="noindex, nofollow"><title>Ubicacion no encontrada | KuraTe</title></head><body><h1>Ubicacion no encontrada</h1><p><a href="/categories.html">Volver al directorio</a></p></body></html>`);
    }

    const professionals = await fetchProfessionalsForPage(page);
    if (!professionals.length) {
      res.status(404);
      res.type('html');
      return res.send(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="robots" content="noindex, nofollow"><title>Sin perfiles en esta zona | KuraTe</title></head><body><h1>Sin perfiles en esta zona</h1><p><a href="/categories.html">Volver al directorio</a></p></body></html>`);
    }

    const seo = buildLocationSeo(page, professionals);
    const subAreas = page.areaSlug ? [] : await buildSubAreaLinks(page);
    const html = buildLocationHtml(page, professionals, seo, subAreas);

    res.type('html');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(html);
  } catch (error) {
    next(error);
  }
};

exports.renderProfilePage = async (req, res, next) => {
  try {
    const aliasParam = String(req.params.alias || '').trim();
    const aliasLower = aliasParam.toLowerCase();

    if (RESERVED_PROFILE_ALIASES.has(aliasLower)) {
      return res.redirect(301, `/${aliasParam}`);
    }

    const aliasRegex = new RegExp(`^${aliasParam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const professional = await User.findOne({
      'professionalProfile.alias': aliasRegex,
      role: 'professional',
      accountDeletedAt: null
    }).select(
      'role isVerified verificationStatus accountDeletedAt professionalProfile.alias professionalProfile.quality '
      + 'professionalProfile.bio professionalProfile.services professionalProfile.location '
      + 'professionalProfile.photos professionalProfile.subscriptionStatus professionalProfile.isExposed'
    );

    const template = loadTreasureTemplate();

    if (!professional || !isProfileIndexable(professional)) {
      res.status(404);
      const html = applySeoToHtml(template, {
        title: 'Perfil no encontrado | KuraTe',
        description: 'El perfil solicitado no está disponible en KuraTe.',
        url: absoluteUrl(`/perfil/${encodeURIComponent(aliasParam)}`),
        robots: 'noindex, nofollow'
      });
      res.type('html');
      return res.send(html);
    }

    const seo = buildProfileSeo(professional);
    const html = applySeoToHtml(template, seo);
    res.type('html');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(html);
  } catch (error) {
    next(error);
  }
};

const serviceTree = require('../data/serviceTree');

const ACTION_SYNONYMS = {
  reparar: ['reparar', 'repara', 'reparo', 'arreglar', 'arreglo', 'arregla', 'componer', 'solucionar'],
  instalar: ['instalar', 'instalo', 'instalacion', 'colocar', 'montar', 'montaje'],
  mantener: ['mantener', 'mantengo', 'mantenimiento', 'service', 'servicio', 'revision'],
  desinstalar: ['desinstalar', 'desinstalo', 'retirar', 'retiro', 'quitar'],
  verificar: ['verificar', 'verifico', 'diagnosticar', 'diagnostico', 'chequear', 'chequeo'],
  configurar: ['configurar', 'configuro', 'ajustar', 'calibrar']
};

const VERB_MAP = {
  reparar: { verb: 'Reparar', gerund: 'Reparando' },
  instalar: { verb: 'Instalar', gerund: 'Instalando' },
  mantener: { verb: 'Mantener', gerund: 'Manteniendo' },
  desinstalar: { verb: 'Desinstalar', gerund: 'Desinstalando' },
  verificar: { verb: 'Verificar', gerund: 'Verificando' },
  configurar: { verb: 'Configurar', gerund: 'Configurando' }
};

const ENV_NAMES_SEO = { hogar: 'Hogar', oficina: 'Oficina', 'casa-campo': 'Casa de Campo', industria: 'Industria' };

function resolveActionSeo(slug) {
  if (ACTION_SYNONYMS[slug]) return slug;
  for (const [canonical, synonyms] of Object.entries(ACTION_SYNONYMS)) {
    if (synonyms.includes(slug)) return canonical;
  }
  return null;
}

function getAllServiceSeoPages() {
  const pages = [];
  for (const env of serviceTree) {
    for (const cat of env.categories) {
      for (const device of cat.devices) {
        for (const action of ['reparar', 'instalar', 'mantener', 'verificar']) {
          pages.push({
            envId: env.id, envName: ENV_NAMES_SEO[env.id] || env.name,
            categoryId: cat.id, categoryName: cat.name,
            deviceId: device.id, deviceName: device.name,
            action, brands: device.brands,
            path: '/' + env.id + '/' + cat.id + '/' + device.id + '/' + action
          });
        }
      }
    }
  }
  return pages;
}

exports.handleServiceSeoPage = async (req, res) => {
  try {
    const { environment, category, device, action: rawAction } = req.params;
    const action = resolveActionSeo(rawAction);
    if (!action) return res.status(404).send('Action not found');
    const env = serviceTree.find(e => e.id === environment);
    if (!env) return res.status(404).send('Environment not found');
    const cat = env.categories.find(c => c.id === category);
    if (!cat) return res.status(404).send('Category not found');
    const dev = cat.devices.find(d => d.id === device);
    if (!dev) return res.status(404).send('Device not found');
    const envName = ENV_NAMES_SEO[env.id] || env.name;
    const verbInfo = VERB_MAP[action] || VERB_MAP.reparar;
    const title = verbInfo.verb + ' ' + dev.name + ' en ' + envName + ' | ' + cat.name + ' | KuraTe';
    const metaDesc = 'Servicio de ' + verbInfo.verb.toLowerCase() + ' ' + dev.name.toLowerCase() + ' en ' + envName + '. Profesionales verificados en ' + cat.name + '. ' + dev.brands.slice(0, 5).join(', ') + ' y mas.';
    const canonicalUrl = 'https://kurate.drsrv.net.ar/' + env.id + '/' + cat.id + '/' + dev.id + '/' + action;
    const searchUrl = '/index.html?specialty=' + encodeURIComponent(env.id + '.' + cat.id + '.' + dev.id) + '&province=CABA';
    const kwList = [verbInfo.verb.toLowerCase() + ' ' + dev.name.toLowerCase(), verbInfo.verb.toLowerCase() + ' ' + dev.name.toLowerCase() + ' ' + envName.toLowerCase(), dev.name.toLowerCase() + ' ' + cat.name.toLowerCase(), 'tecnico ' + dev.name.toLowerCase(), 'reparacion ' + dev.name.toLowerCase(), 'service ' + dev.name.toLowerCase(), 'arreglo ' + dev.name.toLowerCase()];
    dev.brands.slice(0, 10).forEach(function(b) { kwList.push(verbInfo.verb.toLowerCase() + ' ' + dev.name.toLowerCase() + ' ' + b); });
    const keywords = kwList.join(', ');
    const brandLinks = dev.brands.map(function(b) { return '<li><a href="/' + env.id + '/' + cat.id + '/' + dev.id + '/' + action + '?brand=' + encodeURIComponent(b) + '">' + b + '</a></li>'; }).join('\n');
    const envLinks = serviceTree.map(function(e) { return '<a href="/' + e.id + '">' + (ENV_NAMES_SEO[e.id] || e.name) + '</a>'; }).join(' | ');
    const deviceLinks = env.categories.flatMap(function(c2) { return c2.devices.map(function(d) { return '<a href="/' + env.id + '/' + c2.id + '/' + d.id + '/reparar">' + d.name + '</a>'; }); }).join(' | ');
    const sd = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Service', name: verbInfo.verb + ' ' + dev.name, description: metaDesc, url: canonicalUrl, provider: { '@type': 'Organization', name: 'KuraTe', url: 'https://kurate.drsrv.net.ar' }, areaServed: { '@type': 'Country', name: 'Argentina' }, serviceType: verbInfo.verb + ' ' + dev.name, category: cat.name });
    const bc = JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Inicio', item: 'https://kurate.drsrv.net.ar' }, { '@type': 'ListItem', position: 2, name: envName, item: 'https://kurate.drsrv.net.ar/' + env.id }, { '@type': 'ListItem', position: 3, name: cat.name, item: 'https://kurate.drsrv.net.ar/' + env.id + '/' + cat.id }, { '@type': 'ListItem', position: 4, name: dev.name, item: 'https://kurate.drsrv.net.ar/' + env.id + '/' + cat.id + '/' + dev.id }, { '@type': 'ListItem', position: 5, name: verbInfo.verb + ' ' + dev.name }] });
    const faq = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: 'Como encontrar un tecnico para ' + dev.name.toLowerCase() + ' en ' + envName + '?', acceptedAnswer: { '@type': 'Answer', text: 'En KuraTe encontraras profesionales verificados para ' + verbInfo.verb.toLowerCase() + ' ' + dev.name.toLowerCase() + ' en ' + envName + '.' } }, { '@type': 'Question', name: 'Que marcas de ' + dev.name.toLowerCase() + ' se pueden ' + verbInfo.verb.toLowerCase() + '?', acceptedAnswer: { '@type': 'Answer', text: 'Nuestros profesionales trabajan con: ' + dev.brands.join(', ') + '.' } }] });
    const html = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>' + title + '</title><meta name="description" content="' + metaDesc + '"><meta name="keywords" content="' + keywords + '"><meta name="robots" content="index, follow"><link rel="canonical" href="' + canonicalUrl + '"><meta property="og:title" content="' + title + '"><meta property="og:description" content="' + metaDesc + '"><meta property="og:url" content="' + canonicalUrl + '"><meta property="og:type" content="website"><meta property="og:site_name" content="KuraTe"><script type="application/ld+json">' + sd + '</script><script type="application/ld+json">' + bc + '</script><script type="application/ld+json">' + faq + '</script><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Inter,sans-serif;background:#0a0a0a;color:#e0e0e0}.hero{background:linear-gradient(135deg,#1a1a2e,#16213e,#0f3460);padding:60px 20px;text-align:center;border-bottom:3px solid #d4af37}.hero h1{color:#d4af37;font-size:2rem;margin-bottom:10px}.hero p{color:#ccc;font-size:1.1rem;max-width:700px;margin:0 auto 20px}.cta{display:inline-block;background:#d4af37;color:#0a0a0a;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:1.1rem}.container{max-width:900px;margin:0 auto;padding:30px 20px}.section{margin-bottom:30px}.section h2{color:#d4af37;margin-bottom:12px;font-size:1.3rem}.section p{line-height:1.6;color:#bbb}.brands-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;list-style:none}.brands-grid li{background:#1a1a1a;padding:8px 12px;border-radius:4px;border:1px solid #333}.brands-grid a{color:#d4af37;text-decoration:none;font-size:0.9rem}.nav{padding:15px 20px;background:#111;border-bottom:1px solid #333}.nav a{color:#d4af37;text-decoration:none;margin:0 8px;font-size:0.9rem}.breadcrumb{padding:10px 20px;background:#111;font-size:0.85rem}.breadcrumb a{color:#888;text-decoration:none}.breadcrumb span{color:#d4af37}footer{background:#111;padding:30px 20px;text-align:center;color:#666;border-top:1px solid #333}footer a{color:#d4af37;text-decoration:none}@media(max-width:600px){.hero h1{font-size:1.4rem}.brands-grid{grid-template-columns:repeat(2,1fr)}}</style></head><body><nav class="nav"><a href="/">KuraTe</a>' + envLinks + '</nav><div class="breadcrumb"><a href="/">Inicio</a> &gt; <a href="/' + env.id + '">' + envName + '</a> &gt; <a href="/' + env.id + '/' + cat.id + '">' + cat.name + '</a> &gt; <a href="/' + env.id + '/' + cat.id + '/' + dev.id + '/reparar">' + dev.name + '</a> &gt; <span>' + verbInfo.verb + '</span></div><div class="hero"><h1>' + verbInfo.verb + ' ' + dev.name + ' en ' + envName + '</h1><p>' + metaDesc + '</p><a class="cta" href="' + searchUrl + '">Encontrar tecnico ahora</a></div><div class="container"><div class="section"><h2>Servicios de ' + verbInfo.verb.toLowerCase() + ' para ' + dev.name.toLowerCase() + '</h2><p>Nuestros profesionales estan capacitados para ' + verbInfo.verb.toLowerCase() + ' todo tipo de ' + dev.name.toLowerCase() + '. Ya sea que necesites una reparacion urgente o un mantenimiento preventivo, en KuraTe encontraras al tecnico ideal para tu zona.</p></div><div class="section"><h2>Marcas que trabajamos</h2><ul class="brands-grid">' + brandLinks + '</ul></div><div class="section"><h2>Que incluye el servicio?</h2><p>El servicio de ' + verbInfo.verb.toLowerCase() + ' de ' + dev.name.toLowerCase() + ' incluye diagnostico, presupuesto previo, repuestos originales o equivalentes, garantia sobre el trabajo y atencion post-servicio.</p></div><div class="section"><h2>Otros dispositivos en ' + cat.name + '</h2><p>' + deviceLinks + '</p></div></div><footer><p><a href="/">KuraTe</a> - Plataforma de servicios profesionales en Argentina.</p></footer></body></html>';
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('SEO service page error:', err);
    res.status(500).send('Internal Server Error');
  }
};

exports.getServiceSitemap = async (req, res) => {
  try {
    const pages = getAllServiceSeoPages();
    const baseUrl = 'https://kurate.drsrv.net.ar';
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    xml += '  <url><loc>' + baseUrl + '/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>\n';
    for (const page of pages) {
      xml += '  <url><loc>' + baseUrl + page.path + '</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>\n';
    }
    xml += '</urlset>';
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(xml);
  } catch (err) {
    console.error('Service sitemap error:', err);
    res.status(500).send('Internal Server Error');
  }
};
