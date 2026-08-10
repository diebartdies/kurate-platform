const KURATE_BASE = 'https://kurate.drsrv.net.ar';

const ACTIONS = [
  { slug: 'arreglar', title: 'Arreglar', description: 'Encontrá técnicos para arreglar electrodomésticos, instalaciones y equipos en Argentina.', keywords: 'arreglar, reparar, arreglo, técnico, Argentina' },
  { slug: 'reparar', title: 'Reparar', description: 'Servicio de reparación profesional para heladeras, lavarropas, aires, cocinas y más.', keywords: 'reparar, reparación, servicio técnico, Argentina' },
  { slug: 'instalar', title: 'Instalar', description: 'Instalación profesional de electrodomésticos, climatización, gas y sistemas.', keywords: 'instalar, instalación, montaje, técnico, Argentina' },
  { slug: 'mantener', title: 'Mantenimiento', description: 'Mantenimiento preventivo y correctivo para hogares, oficinas e industrias.', keywords: 'mantenimiento, preventivo, correctivo, service, Argentina' },
  { slug: 'comprar', title: 'Comprar', description: 'Comprá repuestos y equipamiento original con asesoramiento profesional.', keywords: 'comprar, repuestos, equipamiento, original, Argentina' },
  { slug: 'vender', title: 'Vender', description: 'Vendé equipamiento y electrodomésticos con garantía y asesoramiento.', keywords: 'vender, equipamiento, electrodomésticos, Argentina' },
  { slug: 'mejorar', title: 'Mejorar', description: 'Mejorá tu hogar o espacio de trabajo con soluciones profesionales.', keywords: 'mejorar, renovar, upgrade, hogar, oficina, Argentina' },
  { slug: 'disenar', title: 'Diseñar', description: 'Diseño y proyección de instalaciones eléctricas, gas y climatización.', keywords: 'diseñar, proyectar, ingeniería, instalaciones, Argentina' }
];

const ENVIRONMENTS = [
  { slug: 'hogar', title: 'Hogar', description: 'Técnicos verificados para tu hogar. Reparación de electrodomésticos, gas, plomería y electricidad domiciliaria.', keywords: 'hogar, casa, departamento, técnico domiciliario, Argentina' },
  { slug: 'oficina', title: 'Oficina', description: 'Servicios técnicos para oficinas: climatización, redes, seguridad y equipamiento.', keywords: 'oficina, empresa, comercio, técnico empresarial, Argentina' },
  { slug: 'industria', title: 'Industria', description: 'Automatización, electromecánica y refrigeración industrial. Servicio técnico especializado.', keywords: 'industria, fábrica, planta, automatización, industrial, Argentina' },
  { slug: 'campo', title: 'Campo', description: 'Servicios rurales: riego, energía solar, maquinaria agrícola y ganadería.', keywords: 'campo, rural, agro, campo, ganadería, Argentina' }
];

const CATEGORIES = [
  { slug: 'linea-blanca', title: 'Línea Blanca', description: 'Reparación y mantenimiento de heladeras, lavarropas, cocinas, microondas y más.', keywords: 'línea blanca, heladera, lavarropas, cocina, microondas, Argentina' },
  { slug: 'electrohogar', title: 'Electrohogar', description: 'Servicio técnico para aspiradoras, batidoras, cafeteras y electrodomésticos menores.', keywords: 'electrohogar, aspiradora, batidora, cafetera, Argentina' },
  { slug: 'clima', title: 'Climatización', description: 'Instalación y reparación de aires acondicionados, termotanques y calefacción.', keywords: 'climatización, aire acondicionado, termotanque, calefacción, Argentina' },
  { slug: 'seguridad', title: 'Seguridad', description: 'Cámaras, alarmas, control de acceso y sistemas de seguridad para hogares y empresas.', keywords: 'seguridad, cámaras, alarmas, control de acceso, CCTV, Argentina' },
  { slug: 'informatica', title: 'Informática', description: 'Reparación de computadoras, notebooks, impresoras y redes.', keywords: 'informática, computadora, notebook, impresora, redes, Argentina' },
  { slug: 'automatizacion', title: 'Automatización', description: 'PLC, variadores, tableros industriales y sistemas de automatización.', keywords: 'automatización, PLC, variador, tablero industrial, Argentina' },
  { slug: 'electricidad', title: 'Electricidad', description: 'Instalaciones eléctricas, tableros, iluminación y certificación.', keywords: 'electricidad, instalación eléctrica, tablero, iluminación, Argentina' },
  { slug: 'gas', title: 'Gas', description: 'Instalación y reparación de gas, termotanques, estufas y calderas.', keywords: 'gas, instalación gas, termotanque, estufa, caldera, Argentina' },
  { slug: 'plomeria', title: 'Plomería', description: 'Reparación de cañerías, grifería, inodoros y sistemas de agua.', keywords: 'plomería, cañería, grifería, inodoro, agua, Argentina' },
  { slug: 'soldadura', title: 'Soldadura', description: 'Servicios de soldadura, corte plasma y estructuras metálicas.', keywords: 'soldadura, corte plasma, estructura metálica, Argentina' }
];

function buildSeoLandingPage(type, item) {
  const searchParams = new URLSearchParams();
  if (type === 'action') searchParams.set('accion', item.slug);
  if (type === 'environment') searchParams.set('service', item.slug);
  if (type === 'category') searchParams.set('service', item.slug);
  const searchUrl = `/hogar.html?${searchParams.toString()}`;

  const otherActions = ACTIONS.filter(a => a.slug !== item.slug).slice(0, 5);
  const otherEnvs = ENVIRONMENTS.filter(e => e.slug !== item.slug);
  const otherCats = CATEGORIES.filter(c => c.slug !== item.slug).slice(0, 5);

  let linksHtml = '';
  if (type === 'action') {
    linksHtml = otherActions.map(a => `<li><a href="/acciones/${a.slug}">${a.title}</a></li>`).join('');
  } else if (type === 'environment') {
    linksHtml = otherEnvs.map(e => `<li><a href="/entornos/${e.slug}">${e.title}</a></li>`).join('');
  } else {
    linksHtml = otherCats.map(c => `<li><a href="/categorias/${c.slug}">${c.title}</a></li>`).join('');
  }

  const breadcrumb = type === 'action' ? 'Acciones' : type === 'environment' ? 'Entornos' : 'Categorías';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${item.title} | KuraTe — Profesionales verificados en Argentina</title>
  <meta name="description" content="${item.description}">
  <meta name="keywords" content="${item.keywords}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${KURATE_BASE}/${type === 'action' ? 'acciones' : type === 'environment' ? 'entornos' : 'categorias'}/${item.slug}">
  <meta property="og:title" content="${item.title} | KuraTe">
  <meta property="og:description" content="${item.description}">
  <meta property="og:url" content="${KURATE_BASE}/${type === 'action' ? 'acciones' : type === 'environment' ? 'entornos' : 'categorias'}/${item.slug}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="KuraTe">
  <meta property="og:image" content="${KURATE_BASE}/images/reparacion.png">
  <meta name="theme-color" content="#B8922E">
  <meta name="color-scheme" content="dark">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Service",
    "name": "${item.title} — KuraTe",
    "description": "${item.description}",
    "provider": {
      "@type": "Organization",
      "name": "KuraTe",
      "url": "${KURATE_BASE}"
    },
    "areaServed": "Argentina",
    "serviceType": "${item.title}"
  }
  </script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f0f1a; color: #e0e0e0; margin: 0; }
    .container { max-width: 800px; margin: 0 auto; padding: 2rem 1.5rem; }
    h1 { color: #B8922E; font-size: 2rem; margin-bottom: 0.5rem; }
    .breadcrumb { color: #888; font-size: 0.85rem; margin-bottom: 1.5rem; }
    .breadcrumb a { color: #B8922E; text-decoration: none; }
    .breadcrumb a:hover { text-decoration: underline; }
    p { line-height: 1.7; font-size: 1.1rem; color: #ccc; }
    .cta { display: inline-block; margin: 1.5rem 0; padding: 14px 32px; background: linear-gradient(135deg, #B8922E, #967018); color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 1.05rem; }
    .cta:hover { opacity: 0.9; }
    h2 { color: #B8922E; font-size: 1.3rem; margin-top: 2rem; }
    ul { list-style: none; padding: 0; }
    ul li { margin: 0.4rem 0; }
    ul li a { color: #B8922E; text-decoration: none; font-size: 1rem; }
    ul li a:hover { text-decoration: underline; }
    footer { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid #333; color: #666; font-size: 0.85rem; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="breadcrumb"><a href="/">KuraTe</a> &rsaquo; <a href="/${type === 'action' ? 'acciones' : type === 'environment' ? 'entornos' : 'categorias'}">${breadcrumb}</a> &rsaquo; ${item.title}</div>
    <h1>${item.title}</h1>
    <p>${item.description}</p>
    <a href="${searchUrl}" class="cta">Buscar profesionales</a>
    <h2>Otros${type === 'action' ? ' servicios' : type === 'environment' ? ' entornos' : ' categorías'}</h2>
    <ul>${linksHtml}</ul>
    <footer>&copy; 2026 KuraTe — Tu respuesta rápida y directa.</footer>
  </div>
</body>
</html>`;
}

function getAllSeoUrls() {
  const urls = [];
  ACTIONS.forEach(a => urls.push({ loc: `/acciones/${a.slug}`, priority: 0.6, changefreq: 'monthly' }));
  ENVIRONMENTS.forEach(e => urls.push({ loc: `/entornos/${e.slug}`, priority: 0.6, changefreq: 'monthly' }));
  CATEGORIES.forEach(c => urls.push({ loc: `/categorias/${c.slug}`, priority: 0.6, changefreq: 'monthly' }));
  return urls;
}

module.exports = { ACTIONS, ENVIRONMENTS, CATEGORIES, buildSeoLandingPage, getAllSeoUrls, KURATE_BASE };
