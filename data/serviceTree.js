// Service taxonomy grouped by AREA.
// Each area has its own subtree. Leaf nodes carry a `brands` array.

const hogarElectro = [
  { id: 'lavarropas', name: 'Lavarropas', brands: ['ARISTON', 'BGH', 'WHIRLPOOL', 'CANDY', 'BOSCH', 'Consul', 'SIAM', 'SAMSUNG', 'Drean', 'LG', 'ATMA', 'PHILCO', 'Otra/s'] },
  {
    id: 'cocinas', name: 'Cocinas', children: [
      { id: 'cocinas-gas', name: 'Gas', brands: ['Longvie', 'Domec', 'Florencia', 'Orbis', 'Escorial', 'Morelli', 'Otra/s'] },
      { id: 'cocinas-electricas', name: 'Eléctricas', brands: ['Longvie', 'Domec', 'Florencia', 'Orbis', 'Escorial', 'Morelli', 'Otra/s'] }
    ]
  },
  {
    id: 'calefones', name: 'Calefones', children: [
      { id: 'calefones-gas', name: 'Gas', brands: ['Orbis', 'Volcan', 'Longvie', 'Escorial', 'Universal', 'Rheem', 'Sherman', 'Otra/s'] },
      { id: 'calefones-electricos', name: 'Eléctricos', brands: ['Orbis', 'Volcan', 'Longvie', 'Escorial', 'Universal', 'Rheem', 'Sherman', 'Otra/s'] }
    ]
  },
  {
    id: 'termotanques', name: 'Termotanques', children: [
      { id: 'termotanques-gas', name: 'Gas', brands: ['ESKABE', 'ORBIS', 'SEÑORIAL', 'Rheem', 'LONGVILE', 'VOLCAN', 'UNIVERSAL', 'SAIAR', 'Escorial', 'Energy', 'Emege', 'ECOTERMO', 'Otra/s'] },
      { id: 'termotanques-electricos', name: 'Eléctricos', brands: ['ESKABE', 'ORBIS', 'SEÑORIAL', 'Rheem', 'LONGVILE', 'VOLCAN', 'UNIVERSAL', 'SAIAR', 'Escorial', 'Energy', 'Emege', 'ECOTERMO', 'Otra/s'] }
    ]
  },
  { id: 'heladeras', name: 'Heladeras', brands: ['Samsung', 'LG', 'Whirlpool', 'Electrolux', 'Drean', 'Gafa', 'Philco', 'Patrick', 'Bambi', 'Koh-I-Noor', 'Candy', 'Otra/s'] },
  { id: 'freezer', name: 'Freezer', brands: ['Samsung', 'LG', 'Whirlpool', 'Gafa', 'Drean', 'Coldex', 'Otra/s'] },
  { id: 'microondas', name: 'Microondas', brands: ['BGH', 'Atma', 'Philco', 'Gafa', 'Samsung', 'Whirlpool', 'Midea', 'Hisense', 'Toshiba', 'Bompani', 'Otra/s'] },
  { id: 'secarropa', name: 'Secarropa', brands: ['BGH', 'WHIRLPOOL', 'SAMSUNG', 'LG', 'Drean', 'ATMA', 'Otra/s'] },
  { id: 'lavavajillas', name: 'Lavavajillas', brands: ['Bosch', 'Whirlpool', 'Electrolux', 'Otra/s'] }
];

const hogarClimatizacion = {
  id: 'climatizacion', name: 'Climatización', children: [
    { id: 'aires-acondicionados', name: 'Aires Acondicionados', brands: ['Samsung', 'LG', 'Whirlpool', 'BGH', 'Philco', 'Gafa', 'Midea', 'Hisense', 'Toshiba', 'Bompani', 'Otra/s'] },
    { id: 'calefactores', name: 'Calefactores', brands: ['Orbis', 'Volcan', 'Longvie', 'Escorial', 'Otra/s'] },
    { id: 'estufas', name: 'Estufas', children: [
      { id: 'estufas-gas', name: 'Gas', brands: ['Orbis', 'Volcan', 'Longvie', 'Escorial', 'Otra/s'] },
      { id: 'estufas-electricas', name: 'Eléctricas', brands: ['Orbis', 'Volcan', 'Longvie', 'Escorial', 'Otra/s'] }
    ]},
    { id: 'estufas-tiro', name: 'Estufas de tiro', brands: ['Otra/s'] },
    { id: 'sistemas-radiantes', name: 'Sistemas radiantes', brands: ['Otra/s'] }
  ]
};

const hogarTree = {
  id: 'hogar', name: 'Hogar', children: [
    { id: 'electro', name: 'Electrodomésticos', children: hogarElectro },
    {
      id: 'bano', name: 'Baño', children: [
        { id: 'inodoros', name: 'Inodoros', brands: ['Roca', 'Ferrum', 'Duravit', 'Cotto', 'Otra/s'] },
        { id: 'videt', name: 'Videt', brands: ['Roca', 'Duravit', 'Otra/s'] },
        { id: 'ducha', name: 'Ducha', brands: ['Otra/s'] },
        { id: 'lava-manos', name: 'Lava manos', brands: ['Roca', 'Ferrum', 'Otra/s'] },
        { id: 'griferia', name: 'Grifería', brands: ['Otra/s'] },
        { id: 'calefactores-agua', name: 'Calefactores de agua', brands: ['Otra/s'] }
      ]
    },
    {
      id: 'electro-chico', name: 'Electro Pequeño', children: [
        { id: 'licuadoras', name: 'Licuadoras', brands: ['Otra/s'] },
        { id: 'batidoras', name: 'Batidoras', brands: ['Otra/s'] },
        { id: 'cafeteras', name: 'Cafeteras', brands: ['Otra/s'] },
        { id: 'televisores', name: 'Televisores', brands: ['Otra/s'] },
        { id: 'equipos-sonido', name: 'Equipos de sonido', brands: ['Otra/s'] }
      ]
    },
    hogarClimatizacion
  ]
};

const oficinaTree = {
  id: 'oficina', name: 'Oficina', children: [
    { id: 'impresoras', name: 'Impresoras', brands: ['HP', 'Epson', 'Canon', 'Brother', 'Samsung', 'Xerox', 'Lexmark', 'Otra/s'] },
    { id: 'pcs', name: 'PC / Computadoras', brands: ['Dell', 'HP', 'Lenovo', 'Asus', 'Acer', 'Apple', 'Otra/s'] },
    { id: 'notebooks', name: 'Notebooks', brands: ['Dell', 'HP', 'Lenovo', 'Asus', 'Acer', 'Apple', 'Otra/s'] },
    { id: 'monitores', name: 'Monitores', brands: ['Samsung', 'LG', 'Dell', 'AOC', 'ViewSonic', 'Otra/s'] },
    {
      id: 'redes', name: 'Red / Networking', children: [
        { id: 'routers', name: 'Routers', brands: ['TP-Link', 'D-Link', 'MikroTik', 'Cisco', 'Otra/s'] },
        { id: 'switches', name: 'Switches', brands: ['TP-Link', 'D-Link', 'Cisco', 'Otra/s'] },
        { id: 'access-points', name: 'Access Points', brands: ['Ubiquiti', 'TP-Link', 'MikroTik', 'Otra/s'] }
      ]
    },
    { id: 'fotocopiadoras', name: 'Fotocopiadoras', brands: ['Ricoh', 'Canon', 'Sharp', 'Kyocera', 'Otra/s'] },
    { id: 'telefonia-ip', name: 'Telefonía IP', brands: ['Yealink', 'Grandstream', 'Otra/s'] },
    { id: 'electro-oficina', name: 'Electrodomésticos', children: hogarElectro },
    hogarClimatizacion
  ]
};

const pimeTree = {
  id: 'pime', name: 'PIME', children: [
    {
      id: 'maquinaria', name: 'Maquinaria', children: [
        { id: 'compresores', name: 'Compresores', brands: ['Otra/s'] },
        { id: 'motores-electricos', name: 'Motores eléctricos', brands: ['Otra/s'] },
        { id: 'bombas', name: 'Bombas', brands: ['Otra/s'] },
        { id: 'generadores', name: 'Generadores', brands: ['Otra/s'] },
        { id: 'electroherramientas', name: 'Electroherramientas', brands: ['Bosch', 'DeWalt', 'Makita', 'Otra/s'] }
      ]
    },
    {
      id: 'refrigeracion-comercial', name: 'Refrigeración comercial', children: [
        { id: 'camaras', name: 'Cámaras', brands: ['Otra/s'] },
        { id: 'freezers-comerciales', name: 'Freezers', brands: ['Otra/s'] },
        { id: 'expositores', name: 'Expositores', brands: ['Otra/s'] }
      ]
    },
    {
      id: 'electricidad', name: 'Electricidad', children: [
        { id: 'tableros', name: 'Tableros', brands: ['Otra/s'] },
        { id: 'cableado', name: 'Cableado', brands: ['Otra/s'] },
        { id: 'iluminacion', name: 'Iluminación', brands: ['Otra/s'] }
      ]
    },
    {
      id: 'redes-pime', name: 'Red / Informática', children: [
        { id: 'servidores', name: 'Servidores', brands: ['Dell', 'HP', 'Lenovo', 'Otra/s'] },
        { id: 'pcs-pime', name: 'PC', brands: ['Dell', 'HP', 'Lenovo', 'Otra/s'] },
        { id: 'impresoras-pime', name: 'Impresoras', brands: ['HP', 'Epson', 'Canon', 'Otra/s'] }
      ]
    },
    { id: 'electro-pime', name: 'Electrodomésticos', children: hogarElectro },
    hogarClimatizacion
  ]
};

const industriaTree = {
  id: 'industria', name: 'Industria', children: [
    {
      id: 'instalaciones', name: 'Instalaciones', children: [
        { id: 'neumatica', name: 'Neumática', brands: ['Otra/s'] },
        { id: 'hidraulica', name: 'Hidráulica', brands: ['Otra/s'] },
        { id: 'electrica-industrial', name: 'Eléctrica', brands: ['Otra/s'] },
        { id: 'automatizacion', name: 'Automatización / PLC', brands: ['Siemens', 'Allen-Bradley', 'Schneider', 'Otra/s'] }
      ]
    },
    {
      id: 'maquinaria-industrial', name: 'Maquinaria', children: [
        { id: 'motores', name: 'Motores', brands: ['Otra/s'] },
        { id: 'reductores', name: 'Reductores', brands: ['Otra/s'] },
        { id: 'variadores', name: 'Variadores / Inversores', brands: ['Schneider', 'Siemens', 'Otra/s'] },
        { id: 'compresores-industrial', name: 'Compresores', brands: ['Otra/s'] }
      ]
    },
    { id: 'calderas', name: 'Calderas', brands: ['Otra/s'] },
    { id: 'generadores-industrial', name: 'Generadores', brands: ['Otra/s'] },
    {
      id: 'redes-industrial', name: 'Red / Comunicaciones', children: [
        { id: 'switches-industrial', name: 'Switches industriales', brands: ['Cisco', 'Hirschmann', 'Otra/s'] },
        { id: 'fibra', name: 'Fibra óptica', brands: ['Otra/s'] }
      ]
    },
    { id: 'electro-industrial', name: 'Electrodomésticos', children: hogarElectro },
    { ...hogarClimatizacion, id: 'climatizacion-industrial', name: 'Climatización' }
  ]
};

const serviceTree = [hogarTree, oficinaTree, pimeTree, industriaTree];

module.exports = serviceTree;
