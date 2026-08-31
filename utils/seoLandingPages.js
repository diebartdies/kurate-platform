const KURATE_BASE = 'https://kurate.drsrv.net.ar';

const ACTIONS = [
  { slug: 'arreglar', title: { es: 'Arreglar', en: 'Fix' },
    description: { es: 'Encontrá técnicos para arreglar electrodomésticos, instalaciones y equipos en Argentina.', en: 'Find technicians to fix appliances, installations and equipment in Argentina.' },
    keywords: { es: 'arreglar, reparar, arreglo, técnico, Argentina', en: 'fix, repair, technician, Argentina' },
    content: { es: 'Ya sea que necesites arreglar una heladera que no enfría, un lavarropas que no centrifuga o un aire acondicionado que gotea, en KuraTe encontrá técnicos verificados cerca de tu zona. Nuestros profesionales están evaluados por clientes reales y cuentan con reseñas que te ayudan a elegir con confianza.', en: 'Whether you need to fix a fridge that\'s not cooling, a washing machine that won\'t spin, or an air conditioner that\'s leaking, KuraTe has verified technicians near you. Our professionals are rated by real customers and have reviews to help you choose with confidence.' },
    services: { es: ['Heladeras y freezers', 'Lavarropas y secarropas', 'Cocinas y hornos', 'Aires acondicionados', 'Termotanques', 'Calderas'], en: ['Refrigerators and freezers', 'Washing machines and dryers', 'Stoves and ovens', 'Air conditioners', 'Water heaters', 'Boilers'] },
    faq: [
      { q: { es: '¿Cuánto cuesta arreglar un electrodoméstico?', en: 'How much does it cost to fix an appliance?' }, a: { es: 'El costo depende del tipo de equipo y la falla. Podés solicitar presupuesto sin compromiso directamente desde la plataforma.', en: 'The cost depends on the type of equipment and the issue. You can request a free quote directly from the platform.' } },
      { q: { es: '¿Hacen garantía sobre los trabajos?', en: 'Do you offer warranty on repairs?' }, a: { es: 'Sí, todos nuestros técnicos ofrecen garantía sobre la mano de obra. Los términos varían según el profesional.', en: 'Yes, all our technicians offer warranty on labor. Terms vary by professional.' } },
      { q: { es: '¿Cuánto tarda en llegar el técnico?', en: 'How long does it take for the technician to arrive?' }, a: { es: 'La mayoría de nuestros técnicos ofrecen servicio en el día o dentro de las 48 horas hábiles.', en: 'Most of our technicians offer same-day service or within 48 business hours.' } }
    ] },
  { slug: 'reparar', title: { es: 'Reparar', en: 'Repair' },
    description: { es: 'Servicio de reparación profesional para heladeras, lavarropas, aires, cocinas y más.', en: 'Professional repair service for refrigerators, washing machines, air conditioners, stoves and more.' },
    keywords: { es: 'reparar, reparación, servicio técnico, Argentina', en: 'repair, technical service, Argentina' },
    content: { es: 'La reparación profesional es la solución más económica y sustentable para tus electrodomésticos. En KuraTe encontrarás técnicos especializados en reparación de línea blanca, climatización, informática y más. Cada profesional está verificado y cuenta con reseñas de clientes anteriores.', en: 'Professional repair is the most affordable and sustainable solution for your appliances. KuraTe has technicians specialized in white goods, climate control, IT and more. Every professional is verified and has reviews from previous customers.' },
    services: { es: ['Reparación de heladeras', 'Reparación de lavarropas', 'Reparación de aires acondicionados', 'Reparación de cocinas', 'Reparación de microondas', 'Reparación de impresoras'], en: ['Refrigerator repair', 'Washing machine repair', 'Air conditioner repair', 'Stove repair', 'Microwave repair', 'Printer repair'] },
    faq: [
      { q: { es: '¿Reparan cualquier marca?', en: 'Do you repair any brand?' }, a: { es: 'Sí, nuestros técnicos trabajan con todas las marcas: Samsung, LG, Whirlpool, BGH, Longvie y muchas más.', en: 'Yes, our technicians work with all brands: Samsung, LG, Whirlpool, BGH, Longvie and many more.' } },
      { q: { es: '¿Puedo ver reseñas antes de contratar?', en: 'Can I see reviews before hiring?' }, a: { es: 'Absolutamente. Cada profesional tiene reseñas verificadas de clientes reales.', en: 'Absolutely. Every professional has verified reviews from real customers.' } },
      { q: { es: '¿Ofrecen repuestos originales?', en: 'Do you offer original spare parts?' }, a: { es: 'Sí, muchos de nuestros técnicos trabajan con repuestos originales y ofrecen garantía sobre ellos.', en: 'Yes, many of our technicians work with original spare parts and offer warranty on them.' } }
    ] },
  { slug: 'instalar', title: { es: 'Instalar', en: 'Install' },
    description: { es: 'Instalación profesional de electrodomésticos, climatización, gas y sistemas.', en: 'Professional installation of appliances, climate control, gas and systems.' },
    keywords: { es: 'instalar, instalación, montaje, técnico, Argentina', en: 'install, installation, technician, Argentina' },
    content: { es: 'Una instalación profesional garantiza el correcto funcionamiento y la seguridad de tus equipos. En KuraTe tenés técnicos certificados para instalar aires acondicionados, cocinas a gas, termotanques, sistemas de seguridad y más.', en: 'Professional installation ensures proper operation and safety of your equipment. KuraTe has certified technicians to install air conditioners, gas stoves, water heaters, security systems and more.' },
    services: { es: ['Instalación de aires acondicionados', 'Instalación de cocinas a gas', 'Instalación de termotanques', 'Instalación de cámaras de seguridad', 'Instalación de redes', 'Instalación de paneles solares'], en: ['Air conditioner installation', 'Gas stove installation', 'Water heater installation', 'Security camera installation', 'Network installation', 'Solar panel installation'] },
    faq: [
      { q: { es: '¿Necesito permisos para instalar un aire acondicionado?', en: 'Do I need permits to install an air conditioner?' }, a: { es: 'Depende de tu edificio. Muchos técnicos de KuraTe te asesoran sobre los requisitos.', en: 'It depends on your building. Many KuraTe technicians can advise you on the requirements.' } },
      { q: { es: '¿La instalación incluye materiales?', en: 'Does installation include materials?' }, a: { es: 'Sí, los técnicos presupuestan los materiales necesarios junto con la mano de obra.', en: 'Yes, technicians quote the necessary materials along with labor.' } }
    ] },
  { slug: 'mantener', title: { es: 'Mantenimiento', en: 'Maintenance' },
    description: { es: 'Mantenimiento preventivo y correctivo para hogares, oficinas e industrias.', en: 'Preventive and corrective maintenance for homes, offices and industries.' },
    keywords: { es: 'mantenimiento, preventivo, correctivo, service, Argentina', en: 'maintenance, preventive, corrective, service, Argentina' },
    content: { es: 'El mantenimiento preventivo prolonga la vida útil de tus equipos y evita fallas costosas. En KuraTe podés contratar planes de mantenimiento para aires acondicionados, heladeras, calderas y sistemas industriales.', en: 'Preventive maintenance extends the life of your equipment and prevents costly breakdowns. KuraTe offers maintenance plans for air conditioners, refrigerators, boilers and industrial systems.' },
    services: { es: ['Mantenimiento de aires acondicionados', 'Mantenimiento de heladeras', 'Mantenimiento de calderas', 'Mantenimiento de sistemas industriales', 'Limpieza de filtros y conductos', 'Carga de gas refrigerante'], en: ['Air conditioner maintenance', 'Refrigerator maintenance', 'Boiler maintenance', 'Industrial system maintenance', 'Filter and duct cleaning', 'Refrigerant recharge'] },
    faq: [
      { q: { es: '¿Cada cuánto debo hacer mantenimiento?', en: 'How often should I do maintenance?' }, a: { es: 'Se recomienda mantenimiento de aires cada 6 meses y de heladeras una vez al año.', en: 'Air conditioner maintenance is recommended every 6 months and refrigerator maintenance once a year.' } },
      { q: { es: '¿Ofrecen planes de mantenimiento?', en: 'Do you offer maintenance plans?' }, a: { es: 'Sí, algunos técnicos ofrecen contratos mensuales con descuentos.', en: 'Yes, some technicians offer monthly contracts with discounts.' } }
    ] },
  { slug: 'comprar', title: { es: 'Comprar', en: 'Buy' },
    description: { es: 'Comprá repuestos y equipamiento original con asesoramiento profesional.', en: 'Buy original parts and equipment with professional advice.' },
    keywords: { es: 'comprar, repuestos, equipamiento, original, Argentina', en: 'buy, parts, equipment, original, Argentina' },
    content: { es: 'Comprar repuestos originales con asesoramiento profesional te ahorra tiempo y dinero. En KuraTe nuestros técnicos pueden recomendarte los repuestos correctos para tu marca y modelo, y realizar la instalación.', en: 'Buying original parts with professional advice saves you time and money. KuraTe technicians can recommend the right parts for your brand and model, and handle installation.' },
    services: { es: ['Repuestos para heladeras', 'Repuestos para lavarropas', 'Filtros para aires acondicionados', 'Resistencias y termostatos', 'Bombas y motores', 'Componentes electrónicos'], en: ['Refrigerator parts', 'Washing machine parts', 'Air conditioner filters', 'Heating elements and thermostats', 'Pumps and motors', 'Electronic components'] },
    faq: [
      { q: { es: '¿Venden repuestos directamente?', en: 'Do you sell parts directly?' }, a: { es: 'Algunos técnicos tienen stock de repuestos. Otros pueden conseguir el que necesitás.', en: 'Some technicians have parts in stock. Others can source what you need.' } },
      { q: { es: '¿Los repuestos tienen garantía?', en: 'Do parts come with warranty?' }, a: { es: 'Sí, los repuestos originales tienen garantía del fabricante.', en: 'Yes, original parts come with manufacturer warranty.' } }
    ] },
  { slug: 'vender', title: { es: 'Vender', en: 'Sell' },
    description: { es: 'Vendé equipamiento y electrodomésticos con garantía y asesoramiento.', en: 'Sell equipment and appliances with warranty and advice.' },
    keywords: { es: 'vender, equipamiento, electrodomésticos, Argentina', en: 'sell, equipment, appliances, Argentina' },
    content: { es: 'Si necesitás vender equipamiento profesional o electrodomésticos, en KuraTe podés conectar con compradores interesados y técnicos que pueden evaluar el estado del equipo.', en: 'If you need to sell professional equipment or appliances, KuraTe connects you with interested buyers and technicians who can evaluate the condition of your equipment.' },
    services: { es: ['Evaluación de equipamiento', 'Venta de electrodomésticos usados', 'Venta de equipamiento industrial', 'Asesoramiento en precio de mercado'], en: ['Equipment evaluation', 'Used appliance sales', 'Industrial equipment sales', 'Market price advice'] },
    faq: [
      { q: { es: '¿Puedo vender un electrodoméstico usado?', en: 'Can I sell a used appliance?' }, a: { es: 'Sí, podés publicar tu equipo y conectarte con compradores potenciales.', en: 'Yes, you can list your equipment and connect with potential buyers.' } }
    ] },
  { slug: 'mejorar', title: { es: 'Mejorar', en: 'Upgrade' },
    description: { es: 'Mejorá tu hogar o espacio de trabajo con soluciones profesionales.', en: 'Upgrade your home or workspace with professional solutions.' },
    keywords: { es: 'mejorar, renovar, upgrade, hogar, oficina, Argentina', en: 'improve, renovate, upgrade, home, office, Argentina' },
    content: { es: 'Modernizá tus espacios con soluciones profesionales. En KuraTe encontrarás técnicos para mejorar la eficiencia energética, instalar sistemas inteligentes o renovar instalaciones.', en: 'Modernize your spaces with professional solutions. KuraTe has technicians to improve energy efficiency, install smart systems or renovate installations.' },
    services: { es: ['Upgrade de aires acondicionados', 'Instalación de sistemas smart home', 'Mejora de instalaciones eléctricas', 'Aislamiento térmico', 'Eficiencia energética'], en: ['Air conditioner upgrades', 'Smart home system installation', 'Electrical installation improvements', 'Thermal insulation', 'Energy efficiency'] },
    faq: [
      { q: { es: '¿Puedo cambiar mi aire acondicionado por uno inverter?', en: 'Can I replace my air conditioner with an inverter model?' }, a: { es: 'Sí, nuestros técnicos te asesoran sobre la mejor opción y realizan la instalación.', en: 'Yes, our technicians advise you on the best option and handle installation.' } }
    ] },
  { slug: 'disenar', title: { es: 'Diseñar', en: 'Design' },
    description: { es: 'Diseño y proyección de instalaciones eléctricas, gas y climatización.', en: 'Design and planning of electrical, gas and climate control installations.' },
    keywords: { es: 'diseñar, proyectar, ingeniería, instalaciones, Argentina', en: 'design, engineering, installations, Argentina' },
    content: { es: 'El diseño profesional de instalaciones garantiza seguridad y eficiencia. En KuraTe encontrarás ingenieros y técnicos especializados en proyección de sistemas eléctricos, de gas y climatización.', en: 'Professional installation design ensures safety and efficiency. KuraTe has engineers and technicians specialized in electrical, gas and climate control systems planning.' },
    services: { es: ['Diseño de instalaciones eléctricas', 'Proyecto de gas', 'Diseño de sistemas de climatización', 'Planos eléctricos', 'Cálculo de cargas'], en: ['Electrical installation design', 'Gas system planning', 'Climate control system design', 'Electrical blueprints', 'Load calculation'] },
    faq: [
      { q: { es: '¿Necesito un proyecto para instalar un aire?', en: 'Do I need a project plan to install an air conditioner?' }, a: { es: 'Para instalaciones comerciales o industriales sí. Para hogares, nuestros técnicos evalúan el lugar.', en: 'For commercial or industrial installations, yes. For homes, our technicians assess the site.' } }
    ] }
];

const ENVIRONMENTS = [
  { slug: 'hogar', title: { es: 'Hogar', en: 'Home' }, description: { es: 'Técnicos verificados para tu hogar. Reparación de electrodomésticos, gas, plomería y electricidad domiciliaria.', en: 'Verified technicians for your home. Appliance repair, gas, plumbing and residential electrical.' }, keywords: { es: 'hogar, casa, departamento, técnico domiciliario, Argentina', en: 'home, house, apartment, technician, Argentina' } },
  { slug: 'oficina', title: { es: 'Oficina', en: 'Office' }, description: { es: 'Servicios técnicos para oficinas: climatización, redes, seguridad y equipamiento.', en: 'Technical services for offices: climate control, networking, security and equipment.' }, keywords: { es: 'oficina, empresa, comercio, técnico empresarial, Argentina', en: 'office, company, business, technician, Argentina' } },
  { slug: 'industria', title: { es: 'Industria', en: 'Industrial' }, description: { es: 'Automatización, electromecánica y refrigeración industrial. Servicio técnico especializado.', en: 'Automation, electromechanical and industrial refrigeration. Specialized technical service.' }, keywords: { es: 'industria, fábrica, planta, automatización, industrial, Argentina', en: 'industry, factory, plant, automation, industrial, Argentina' } },
  { slug: 'campo', title: { es: 'Campo', en: 'Rural' }, description: { es: 'Servicios rurales: riego, energía solar, maquinaria agrícola y ganadería.', en: 'Rural services: irrigation, solar energy, agricultural machinery and livestock.' }, keywords: { es: 'campo, rural, agro, campo, ganadería, Argentina', en: 'rural, agriculture, farming, Argentina' } }
];

const CATEGORIES = [
  { slug: 'linea-blanca', title: { es: 'Línea Blanca', en: 'White Goods' }, description: { es: 'Reparación y mantenimiento de heladeras, lavarropas, cocinas, microondas y más.', en: 'Repair and maintenance of refrigerators, washing machines, stoves, microwaves and more.' }, keywords: { es: 'línea blanca, heladera, lavarropas, cocina, microondas, Argentina', en: 'white goods, refrigerator, washing machine, stove, microwave, Argentina' },
    content: { es: 'Los electrodomésticos de línea blanca son esenciales en tu hogar. Cuando fallan, necesitás un técnico rápido y confiable. En KuraTe encontrarás profesionales especializados en todas las marcas y modelos.', en: 'White goods appliances are essential in your home. When they break down, you need a fast and reliable technician. KuraTe has professionals specialized in all brands and models.' },
    services: { es: ['Heladeras y freezers', 'Lavarropas y secarropas', 'Cocinas y hornos', 'Microondas', 'Lavavajillas', 'Camas sanitarias'], en: ['Refrigerators and freezers', 'Washing machines and dryers', 'Stoves and ovens', 'Microwaves', 'Dishwashers', 'Medical beds'] } },
  { slug: 'clima', title: { es: 'Climatización', en: 'Climate Control' }, description: { es: 'Instalación y reparación de aires acondicionados, termotanques y calefacción.', en: 'Installation and repair of air conditioners, water heaters and heating.' }, keywords: { es: 'climatización, aire acondicionado, termotanque, calefacción, Argentina', en: 'climate control, air conditioner, water heater, heating, Argentina' },
    content: { es: 'El confort térmico es fundamental. En KuraTe tenés técnicos certificados para instalar, reparar y mantener sistemas de climatización para hogares, oficinas e industrias.', en: 'Thermal comfort is essential. KuraTe has certified technicians to install, repair and maintain climate control systems for homes, offices and industries.' },
    services: { es: ['Aires acondicionados split', 'Aires centrales y cassette', 'Termotanques a gas y eléctricos', 'Calefactores', 'Estufas', 'Sistemas VRF'], en: ['Split air conditioners', 'Central and cassette air conditioners', 'Gas and electric water heaters', 'Heaters', 'Stoves', 'VRF systems'] } },
  { slug: 'electricidad', title: { es: 'Electricidad', en: 'Electrical' }, description: { es: 'Instalaciones eléctricas, tableros, iluminación y certificación.', en: 'Electrical installations, panels, lighting and certification.' }, keywords: { es: 'electricidad, instalación eléctrica, tablero, iluminación, Argentina', en: 'electricity, electrical installation, panel, lighting, Argentina' },
    content: { es: 'Las instalaciones eléctricas requieren profesionales matriculados por seguridad. En KuraTe encontrarás electricistas verificados para todo tipo de trabajos.', en: 'Electrical installations require licensed professionals for safety. KuraTe has verified electricians for all types of work.' },
    services: { es: ['Instalaciones eléctricas', 'Tableros eléctricos', 'Iluminación', 'Cableado estructurado', 'Certificación de instalaciones'], en: ['Electrical installations', 'Electrical panels', 'Lighting', 'Structured cabling', 'Installation certification'] } },
  { slug: 'gas', title: { es: 'Gas', en: 'Gas' }, description: { es: 'Instalación y reparación de gas, termotanques, estufas y calderas.', en: 'Gas installation and repair, water heaters, stoves and boilers.' }, keywords: { es: 'gas, instalación gas, termotanque, estufa, caldera, Argentina', en: 'gas, gas installation, water heater, stove, boiler, Argentina' },
    content: { es: 'El gas requiere técnicos matriculados y certificados. En KuraTe encontrás profesionales habilitados para trabajos de gas domiciliario e industrial.', en: 'Gas work requires licensed and certified technicians. KuraTe has professionals qualified for residential and industrial gas work.' },
    services: { es: ['Instalación de gas', 'Reparación de gas', 'Termotanques', 'Estufas a gas', 'Calderas', 'Verificación de gas'], en: ['Gas installation', 'Gas repair', 'Water heaters', 'Gas stoves', 'Boilers', 'Gas inspection'] } },
  { slug: 'informatica', title: { es: 'Informática', en: 'IT Services' }, description: { es: 'Reparación de computadoras, notebooks, impresoras y redes.', en: 'Computer, laptop, printer and network repair.' }, keywords: { es: 'informática, computadora, notebook, impresora, redes, Argentina', en: 'IT, computer, laptop, printer, network, Argentina' },
    content: { es: 'Cuando tu computadora falla o necesitás soporte técnico, en KuraTe tenés profesionales de informática para reparación de PCs, notebooks, impresoras y redes.', en: 'When your computer fails or you need technical support, KuraTe has IT professionals for PC, laptop, printer and network repair.' },
    services: { es: ['Reparación de PCs', 'Reparación de notebooks', 'Reparación de impresoras', 'Configuración de redes', 'Recuperación de datos', 'Seguridad informática'], en: ['PC repair', 'Laptop repair', 'Printer repair', 'Network setup', 'Data recovery', 'IT security'] } },
  { slug: 'seguridad', title: { es: 'Seguridad', en: 'Security' }, description: { es: 'Cámaras, alarmas, control de acceso y sistemas de seguridad para hogares y empresas.', en: 'Cameras, alarms, access control and security systems for homes and businesses.' }, keywords: { es: 'seguridad, cámaras, alarmas, control de acceso, CCTV, Argentina', en: 'security, cameras, alarms, access control, CCTV, Argentina' },
    content: { es: 'Protegé tu hogar o negocio con sistemas de seguridad profesionales. En KuraTe encontrás técnicos para instalación de cámaras, alarmas y control de acceso.', en: 'Protect your home or business with professional security systems. KuraTe has technicians for camera, alarm and access control installation.' },
    services: { es: ['Cámaras CCTV', 'Sistemas de alarma', 'Control de acceso', 'Cerraduras electrónicas', 'Monitoreo remoto'], en: ['CCTV cameras', 'Alarm systems', 'Access control', 'Electronic locks', 'Remote monitoring'] } },
  { slug: 'automatizacion', title: { es: 'Automatización', en: 'Automation' }, description: { es: 'PLC, variadores, tableros industriales y sistemas de automatización.', en: 'PLC, drives, industrial panels and automation systems.' }, keywords: { es: 'automatización, PLC, variador, tablero industrial, Argentina', en: 'automation, PLC, drive, industrial panel, Argentina' },
    content: { es: 'La automatización industrial mejora la productividad y reduce costos. En KuraTe encontrás ingenieros y técnicos especializados en PLC, variadores de velocidad y sistemas de control.', en: 'Industrial automation improves productivity and reduces costs. KuraTe has engineers and technicians specialized in PLC, variable speed drives and control systems.' },
    services: { es: ['Programación de PLC', 'Variadores de velocidad', 'Tableros industriales', 'SCADA', 'Instrumentación'], en: ['PLC programming', 'Variable speed drives', 'Industrial panels', 'SCADA', 'Instrumentation'] } },
  { slug: 'plomeria', title: { es: 'Plomería', en: 'Plumbing' }, description: { es: 'Reparación de cañerías, grifería, inodoros y sistemas de agua.', en: 'Pipe repair, faucets, toilets and water systems.' }, keywords: { es: 'plomería, cañería, grifería, inodoro, agua, Argentina', en: 'plumbing, pipes, faucets, toilet, water, Argentina' },
    content: { es: 'Los problemas de plomería requieren atención rápida. En KuraTe encontrás plomeros verificados para reparaciones de cañerías, grifería y sistemas de agua.', en: 'Plumbing problems require fast attention. KuraTe has verified plumbers for pipe, faucet and water system repairs.' },
    services: { es: ['Reparación de cañerías', 'Grifería', 'Inodoros y bidets', 'Desagotes', 'Calentadores de agua'], en: ['Pipe repair', 'Faucets', 'Toilets and bidets', 'Drain cleaning', 'Water heaters'] } },
  { slug: 'soldadura', title: { es: 'Soldadura', en: 'Welding' }, description: { es: 'Servicios de soldadura, corte plasma y estructuras metálicas.', en: 'Welding, plasma cutting and metal structures.' }, keywords: { es: 'soldadura, corte plasma, estructura metálica, Argentina', en: 'welding, plasma cutting, metal structure, Argentina' },
    content: { es: 'Servicios de soldadura profesional para estructuras, rejas, portones y piezas a medida. En KuraTe encontrás soldadores calificados con experiencia comprobada.', en: 'Professional welding services for structures, gates, doors and custom parts. KuraTe has qualified welders with proven experience.' },
    services: { es: ['Soldadura MIG/MAG', 'Soldadura TIG', 'Corte plasma', 'Estructuras metálicas', 'Portones y rejas'], en: ['MIG/MAG welding', 'TIG welding', 'Plasma cutting', 'Metal structures', 'Gates and fences'] } }
];

const UI = {
  es: {
    breadcrumb: 'KuraTe',
    searchCta: 'Buscar profesionales',
    servicesTitle: 'Servicios disponibles',
    faqTitle: 'Preguntas frecuentes',
    othersTitle: (type) => `Otros${type === 'action' ? ' servicios' : type === 'environment' ? ' entornos' : ' categorías'}`,
    footer: '© 2026 KuraTe — Tu respuesta rápida y directa.',
    actions: 'Acciones',
    environments: 'Entornos',
    categories: 'Categorías',
  },
  en: {
    breadcrumb: 'KuraTe',
    searchCta: 'Find professionals',
    servicesTitle: 'Available services',
    faqTitle: 'Frequently asked questions',
    othersTitle: (type) => `Other${type === 'action' ? ' services' : type === 'environment' ? ' environments' : ' categories'}`,
    footer: '© 2026 KuraTe — Your fast and direct answer.',
    actions: 'Actions',
    environments: 'Environments',
    categories: 'Categories',
  }
};

function buildSeoLandingPage(type, item, lang = 'es', topRated = []) {
  const t = UI[lang] || UI.es;
  const title = typeof item.title === 'object' ? (item.title[lang] || item.title.es) : item.title;
  const description = typeof item.description === 'object' ? (item.description[lang] || item.description.es) : item.description;
  const keywords = typeof item.keywords === 'object' ? (item.keywords[lang] || item.keywords.es) : item.keywords;
  const content = typeof item.content === 'object' ? (item.content[lang] || item.content.es) : item.content;
  const services = typeof item.services === 'object' && !Array.isArray(item.services) ? (item.services[lang] || item.services.es) : item.services;
  const faq = item.faq || [];

  const searchParams = new URLSearchParams();
  if (type === 'action') searchParams.set('accion', item.slug);
  if (type === 'environment') searchParams.set('service', item.slug);
  if (type === 'category') searchParams.set('service', item.slug);
  const searchUrl = `/hogar.html?${searchParams.toString()}`;

  const basePath = type === 'action' ? 'acciones' : type === 'environment' ? 'entornos' : 'categorias';
  const canonicalLang = lang === 'en' ? '?lang=en' : '';
  const altLang = lang === 'es' ? 'en' : 'es';
  const altTitle = typeof item.title === 'object' ? (item.title[altLang] || item.title.es) : item.title;

  const otherActions = ACTIONS.filter(a => a.slug !== item.slug);
  const otherEnvs = ENVIRONMENTS.filter(e => e.slug !== item.slug);
  const otherCats = CATEGORIES.filter(c => c.slug !== item.slug);

  let linksHtml = '';
  if (type === 'action') {
    linksHtml = otherActions.map(a => {
      const aTitle = typeof a.title === 'object' ? (a.title[lang] || a.title.es) : a.title;
      return `<li><a href="/acciones/${a.slug}${canonicalLang}">${aTitle}</a></li>`;
    }).join('');
  } else if (type === 'environment') {
    linksHtml = otherEnvs.map(e => {
      const eTitle = typeof e.title === 'object' ? (e.title[lang] || e.title.es) : e.title;
      return `<li><a href="/entornos/${e.slug}${canonicalLang}">${eTitle}</a></li>`;
    }).join('');
  } else {
    linksHtml = otherCats.map(c => {
      const cTitle = typeof c.title === 'object' ? (c.title[lang] || c.title.es) : c.title;
      return `<li><a href="/categorias/${c.slug}${canonicalLang}">${cTitle}</a></li>`;
    }).join('');
  }

  const servicesHtml = (services && services.length)
    ? `<h2>${t.servicesTitle}</h2><ul style="list-style:none;padding:0;">${services.map(s => `<li style="padding:6px 0;border-bottom:1px solid #222;color:#ccc;font-size:1rem;">✓ ${s}</li>`).join('')}</ul>`
    : '';

  const faqHtml = (faq.length)
    ? `<h2>${t.faqTitle}</h2>${faq.map(f => {
        const q = typeof f.q === 'object' ? (f.q[lang] || f.q.es) : f.q;
        const a = typeof f.a === 'object' ? (f.a[lang] || f.a.es) : f.a;
        return `<div style="margin-bottom:16px;"><h3 style="color:#e0e0e0;font-size:1rem;margin-bottom:4px;">${q}</h3><p style="color:#999;font-size:0.95rem;line-height:1.6;">${a}</p></div>`;
      }).join('')}`
    : '';

  const contentHtml = content ? `<p style="margin-top:1.5rem;font-size:1.05rem;color:#bbb;line-height:1.8;">${content}</p>` : '';

  const breadcrumbLabel = type === 'action' ? t.actions : type === 'environment' ? t.environments : t.categories;

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | KuraTe — ${lang === 'en' ? 'Verified professionals in Argentina' : 'Profesionales verificados en Argentina'}</title>
  <meta name="description" content="${description}">
  <meta name="keywords" content="${keywords}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${KURATE_BASE}/${basePath}/${item.slug}${canonicalLang}">
  <link rel="alternate" hreflang="es" href="${KURATE_BASE}/${basePath}/${item.slug}">
  <link rel="alternate" hreflang="en" href="${KURATE_BASE}/${basePath}/${item.slug}?lang=en">
  <link rel="alternate" hreflang="x-default" href="${KURATE_BASE}/${basePath}/${item.slug}">
  <meta property="og:title" content="${title} | KuraTe">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${KURATE_BASE}/${basePath}/${item.slug}${canonicalLang}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="KuraTe">
  <meta property="og:image" content="${KURATE_BASE}/images/reparacion.png">
  <meta name="theme-color" content="#B8922E">
  <meta name="color-scheme" content="dark">
  <link rel="sitemap" type="application/xml" href="/sitemap.xml">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Service",
    "name": "${title} — KuraTe",
    "description": "${description}",
    "provider": {
      "@type": "Organization",
      "name": "KuraTe",
      "url": "${KURATE_BASE}"
    },
    "areaServed": "Argentina",
    "serviceType": "${title}"
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
    .lang-switch { position: fixed; top: 12px; right: 12px; z-index: 100; display: flex; gap: 4px; }
    .lang-switch a { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; text-decoration: none; color: #ccc; background: rgba(255,255,255,0.1); }
    .lang-switch a:hover { background: rgba(255,255,255,0.2); }
    .lang-switch a.active { background: #B8922E; color: #fff; }
  </style>
</head>
<body>
  <div class="lang-switch">
    <a href="/${basePath}/${item.slug}" class="${lang === 'es' ? 'active' : ''}">ES</a>
    <a href="/${basePath}/${item.slug}?lang=en" class="${lang === 'en' ? 'active' : ''}">EN</a>
  </div>
  <div class="container">
    <div class="breadcrumb"><a href="/${lang === 'en' ? '?lang=en' : ''}">${t.breadcrumb}</a> &rsaquo; <a href="/${basePath}${canonicalLang}">${breadcrumbLabel}</a> &rsaquo; ${title}</div>
    <h1>${title}</h1>
    <p>${description}</p>
    ${contentHtml}
    ${topRated.length ? `
    <div style="margin:2rem 0;padding:16px;background:linear-gradient(135deg,rgba(184,146,46,0.12),rgba(150,112,24,0.06));border:1px solid rgba(184,146,46,0.3);border-radius:12px">
      <h2 style="margin:0 0 12px;color:#B8922E;font-size:1.1rem">⭐ Mejores puntuados</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px">
        ${topRated.map(p=>`
          <a href="/perfil/${encodeURIComponent(p.alias)}" style="text-decoration:none;background:#1a1a2e;border:1px solid #2a2a3e;border-radius:10px;overflow:hidden;display:block">
            <img src="${p.photo||'/images/no-photo.svg'}" alt="${p.alias}" style="width:100%;height:120px;object-fit:cover;display:block">
            <div style="padding:8px">
              <div style="color:#fff;font-weight:600;font-size:0.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.alias}</div>
              <div style="color:#B8922E;font-size:0.8rem">★ ${p.rating.toFixed(1)} · ${p.reviews} reseñas</div>
              <div style="color:#888;font-size:0.75rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.location||''}</div>
            </div>
          </a>
        `).join('')}
      </div>
    </div>` : ''}
    <a href="${searchUrl}" class="cta">${t.searchCta}</a>
    ${servicesHtml}
    ${faqHtml}
    <h2>${t.othersTitle(type)}</h2>
    <ul>${linksHtml}</ul>
    <footer>${t.footer}</footer>
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
