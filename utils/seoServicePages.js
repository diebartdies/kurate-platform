const KURATE_BASE = 'https://kurate.drsrv.net.ar';

const ACTION_ALIASES = {
  reparar: { label: 'Reparar', synonyms: ['reparar', 'arreglar', 'componer', 'reparación', 'service', 'servicio técnico'] },
  arreglar: { label: 'Arreglar', synonyms: ['arreglar', 'reparar', 'componer'] },
  instalar: { label: 'Instalar', synonyms: ['instalar', 'colocar', 'montar', 'instalación'] },
  mantener: { label: 'Mantener', synonyms: ['mantener', 'mantenimiento', 'revisar', 'chequear', 'verificar'] },
  revisar: { label: 'Revisar', synonyms: ['revisar', 'chequear', 'verificar', 'inspeccionar'] },
  certificar: { label: 'Certificar', synonyms: ['certificar', 'habilitar'] },
  vender: { label: 'Vender', synonyms: ['vender', 'venta'] },
  comprar: { label: 'Comprar', synonyms: ['comprar', 'compra'] },
  service: { label: 'Service', synonyms: ['service', 'servicio técnico', 'reparar', 'arreglar'] },
  reparacion: { label: 'Reparación', synonyms: ['reparación', 'reparar', 'arreglar', 'componer', 'service'] }
};

const DEVICES_ES = {
  'heladera': { name: 'Heladera', plural: 'Heladeras' },
  'freezer': { name: 'Freezer', plural: 'Freezers' },
  'lavarropas': { name: 'Lavarropas', plural: 'Lavarropas' },
  'microondas': { name: 'Microondas', plural: 'Microondas' },
  'cocina-horno': { name: 'Cocina y Horno', plural: 'Cocinas y Hornos' },
  'smart-tv': { name: 'Smart TV', plural: 'Smart TV' },
  'audio-parlantes': { name: 'Sistemas de Audio', plural: 'Sistemas de Audio' },
  'secarropa': { name: 'Secarropa', plural: 'Secarropas' },
  'aire-acondicionado': { name: 'Aire Acondicionado', plural: 'Aires Acondicionados' },
  'calefactores-estufas': { name: 'Calefactores y Estufas', plural: 'Calefactores' },
  'termotanque-calefon': { name: 'Termotanque y Calefón', plural: 'Termotanques' },
  'inodoros-bidets': { name: 'Inodoros y Bidets', plural: 'Inodoros' },
  'camaras-seguridad': { name: 'Cámaras de Seguridad', plural: 'Cámaras de Seguridad' },
  'pc-notebook': { name: 'PC y Notebook', plural: 'PCs y Notebooks' },
  'impresoras': { name: 'Impresoras', plural: 'Impresoras' },
  'instalaciones-gas': { name: 'Instalaciones de Gas', plural: 'Gas' },
  'plomeria': { name: 'Plomería', plural: 'Plomería' },
  'electricidad': { name: 'Electricidad', plural: 'Electricidad' }
};

function buildServiceLandingPage(actionSlug, deviceSlug) {
  const action = ACTION_ALIASES[actionSlug];
  const device = DEVICES_ES[deviceSlug];
  if (!action || !device) return null;

  const title = `${action.label} ${device.name} en Argentina | KuraTe`;
  const description = `Servicio profesional para ${action.label.toLowerCase()} ${device.plural.toLowerCase()} en Argentina. Técnicos verificados en KuraTe. Presupuesto sin cargo.`;
  const canonical = `${KURATE_BASE}/servicios/${actionSlug}-${deviceSlug}`;
  const ogImage = `${KURATE_BASE}/images/reparacion.png`;
  const searchUrl = `${KURATE_BASE}/hogar.html`;

  return {
    title,
    description,
    canonical,
    html: `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" href="/favicon.svg" type="image+xml">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <meta name="keywords" content="${action.label.toLowerCase()} ${device.name.toLowerCase()}, ${action.synonyms.join(', ')} ${device.name.toLowerCase()}, técnico ${device.name.toLowerCase()}, servicio técnico ${device.name.toLowerCase()} Argentina">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${canonical}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="KuraTe">
  <meta property="og:image" content="${ogImage}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${ogImage}">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Service",
    "name": "${action.label} ${device.name}",
    "description": "${description}",
    "url": "${canonical}",
    "provider": {
      "@type": "Organization",
      "name": "KuraTe",
      "url": "${KURATE_BASE}",
      "logo": "${KURATE_BASE}/KuraTe_logo_black.png"
    },
    "areaServed": {
      "@type": "Country",
      "name": "Argentina"
    },
    "serviceType": "${action.label} ${device.name}",
    "category": "Servicio Técnico"
  }
  </script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f0f1a; color: #e0e0e0; margin: 0; }
    .container { max-width: 900px; margin: 0 auto; padding: 40px 20px; }
    h1 { color: #B8922E; font-size: 1.8rem; }
    p { color: #ccc; line-height: 1.7; margin: 16px 0; }
    .cta { display: inline-block; padding: 14px 32px; background: #B8922E; color: #0f0f1a; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 1rem; margin-top: 20px; }
    .cta:hover { background: #D9BC6A; }
    .synonyms { color: #888; font-size: 0.9rem; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${action.label} ${device.name} en Argentina</h1>
    <p>Encontrá técnicos verificados en KuraTe para <strong>${action.label.toLowerCase()} ${device.plural.toLowerCase()}</strong> en toda Argentina. Todos los profesionales están verificados y ofrecen presupuesto sin cargo.</p>
    <p>Nuestros técnicos cubren CABA, Gran Buenos Aires, Córdoba, Santa Fe, Mendoza y todo el país. Elegí el profesional, coordiná el turno y resolvé tu problema al instante.</p>
    <p>${action.synonyms.map(s => `<strong>${s.charAt(0).toUpperCase() + s.slice(1)}</strong> ${device.name.toLowerCase()}`).join(' · ')}</p>
    <a href="${searchUrl}" class="cta">Encontrar técnico ahora</a>
    <div class="synonyms">
      <p>También buscado como: ${action.synonyms.map(s => `${s} ${device.name.toLowerCase()}`).join(', ')}</p>
    </div>
  </div>
</body>
</html>`
  };
}

function getAllServiceUrls() {
  const urls = [];
  for (const [actionSlug, action] of Object.entries(ACTION_ALIASES)) {
    for (const deviceSlug of Object.keys(DEVICES_ES)) {
      urls.push({
        loc: `/servicios/${actionSlug}-${deviceSlug}`,
        priority: 0.6,
        changefreq: 'monthly'
      });
    }
  }
  return urls;
}

module.exports = { buildServiceLandingPage, getAllServiceUrls, ACTION_ALIASES, DEVICES_ES };
