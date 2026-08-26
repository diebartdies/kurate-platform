// Service taxonomy grouped by AREA.
// Each area has its own subtree. Leaf nodes carry a `brands` array.
// Keys are English (used as-is for EN, translated via i18n for ES).

const hogarElectro = [
  { id: 'lavarropas', name: 'Washing Machine', brands: ['ARISTON', 'BGH', 'WHIRLPOOL', 'CANDY', 'BOSCH', 'Consul', 'SIAM', 'SAMSUNG', 'Drean', 'LG', 'ATMA', 'PHILCO', 'Otra/s'] },
  {
    id: 'cocinas', name: 'Stoves', children: [
      { id: 'cocinas-gas', name: 'Gas', brands: ['Longvie', 'Domec', 'Florencia', 'Orbis', 'Escorial', 'Morelli', 'Otra/s'] },
      { id: 'cocinas-electricas', name: 'Electric', brands: ['Longvie', 'Domec', 'Florencia', 'Orbis', 'Escorial', 'Morelli', 'Otra/s'] }
    ]
  },
  {
    id: 'calefones', name: 'Water Heaters', children: [
      { id: 'calefones-gas', name: 'Gas', brands: ['Orbis', 'Volcan', 'Longvie', 'Escorial', 'Universal', 'Rheem', 'Sherman', 'Otra/s'] },
      { id: 'calefones-electricos', name: 'Electric', brands: ['Orbis', 'Volcan', 'Longvie', 'Escorial', 'Universal', 'Rheem', 'Sherman', 'Otra/s'] }
    ]
  },
  {
    id: 'termotanques', name: 'Boilers', children: [
      { id: 'termotanques-gas', name: 'Gas', brands: ['ESKABE', 'ORBIS', 'SEÑORIAL', 'Rheem', 'LONGVILE', 'VOLCAN', 'UNIVERSAL', 'SAIAR', 'Escorial', 'Energy', 'Emege', 'ECOTERMO', 'Otra/s'] },
      { id: 'termotanques-electricos', name: 'Electric', brands: ['ESKABE', 'ORBIS', 'SEÑORIAL', 'Rheem', 'LONGVILE', 'VOLCAN', 'UNIVERSAL', 'SAIAR', 'Escorial', 'Energy', 'Emege', 'ECOTERMO', 'Otra/s'] }
    ]
  },
  { id: 'heladeras', name: 'Refrigerators', brands: ['Samsung', 'LG', 'Whirlpool', 'Electrolux', 'Drean', 'Gafa', 'Philco', 'Patrick', 'Bambi', 'Koh-I-Noor', 'Candy', 'Otra/s'] },
  { id: 'freezer', name: 'Freezer', brands: ['Samsung', 'LG', 'Whirlpool', 'Gafa', 'Drean', 'Coldex', 'Otra/s'] },
  { id: 'microondas', name: 'Microwave', brands: ['BGH', 'Atma', 'Philco', 'Gafa', 'Samsung', 'Whirlpool', 'Midea', 'Hisense', 'Toshiba', 'Bompani', 'Otra/s'] },
  { id: 'secarropa', name: 'Dryer', brands: ['BGH', 'WHIRLPOOL', 'SAMSUNG', 'LG', 'Drean', 'ATMA', 'Otra/s'] },
  { id: 'lavavajillas', name: 'Dishwasher', brands: ['Bosch', 'Whirlpool', 'Electrolux', 'Otra/s'] }
];

const hogarClimatizacion = {
  id: 'climatizacion', name: 'Climate Control', children: [
    { id: 'aires-acondicionados', name: 'Air Conditioning', brands: ['Samsung', 'LG', 'Whirlpool', 'BGH', 'Philco', 'Gafa', 'Midea', 'Hisense', 'Toshiba', 'Bompani', 'Otra/s'] },
    { id: 'calefactores', name: 'Heaters', brands: ['Orbis', 'Volcan', 'Longvie', 'Escorial', 'Otra/s'] },
    { id: 'estufas', name: 'Stoves', children: [
      { id: 'estufas-gas', name: 'Gas', brands: ['Orbis', 'Volcan', 'Longvie', 'Escorial', 'Otra/s'] },
      { id: 'estufas-electricas', name: 'Electric', brands: ['Orbis', 'Volcan', 'Longvie', 'Escorial', 'Otra/s'] }
    ]},
    { id: 'estufas-tiro', name: 'Draft Heaters', brands: ['Otra/s'] },
    { id: 'sistemas-radiantes', name: 'Radiant Systems', brands: ['Otra/s'] }
  ]
};

const hogarTree = {
  id: 'hogar', name: 'Home', children: [
    { id: 'electro', name: 'Appliances', children: hogarElectro },
    {
      id: 'bano', name: 'Bathroom', children: [
        { id: 'inodoros', name: 'Toilets', brands: ['Roca', 'Ferrum', 'Duravit', 'Cotto', 'Otra/s'] },
        { id: 'videt', name: 'Bidets', brands: ['Roca', 'Duravit', 'Otra/s'] },
        { id: 'ducha', name: 'Showers', brands: ['Otra/s'] },
        { id: 'lava-manos', name: 'Sinks', brands: ['Roca', 'Ferrum', 'Otra/s'] },
        { id: 'griferia', name: 'Faucets', brands: ['Otra/s'] },
        { id: 'calefactores-agua', name: 'Water Heaters', brands: ['Otra/s'] }
      ]
    },
    {
      id: 'electro-chico', name: 'Small Appliances', children: [
        { id: 'licuadoras', name: 'Blenders', brands: ['Otra/s'] },
        { id: 'batidoras', name: 'Mixers', brands: ['Otra/s'] },
        { id: 'cafeteras', name: 'Coffee Makers', brands: ['Otra/s'] },
        { id: 'televisores', name: 'TVs', brands: ['Otra/s'] },
        { id: 'equipos-sonido', name: 'Sound Systems', brands: ['Otra/s'] }
      ]
    },
    hogarClimatizacion
  ]
};

const oficinaTree = {
  id: 'oficina', name: 'Office', children: [
    { id: 'impresoras', name: 'Printers', brands: ['HP', 'Epson', 'Canon', 'Brother', 'Samsung', 'Xerox', 'Lexmark', 'Otra/s'] },
    { id: 'pcs', name: 'Desktops', brands: ['Dell', 'HP', 'Lenovo', 'Asus', 'Acer', 'Apple', 'Otra/s'] },
    { id: 'notebooks', name: 'Laptops', brands: ['Dell', 'HP', 'Lenovo', 'Asus', 'Acer', 'Apple', 'Otra/s'] },
    { id: 'monitores', name: 'Monitors', brands: ['Samsung', 'LG', 'Dell', 'AOC', 'ViewSonic', 'Otra/s'] },
    {
      id: 'redes', name: 'Networking', children: [
        { id: 'routers', name: 'Routers', brands: ['TP-Link', 'D-Link', 'MikroTik', 'Cisco', 'Otra/s'] },
        { id: 'switches', name: 'Switches', brands: ['TP-Link', 'D-Link', 'Cisco', 'Otra/s'] },
        { id: 'access-points', name: 'Access Points', brands: ['Ubiquiti', 'TP-Link', 'MikroTik', 'Otra/s'] }
      ]
    },
    { id: 'fotocopiadoras', name: 'Copiers', brands: ['Ricoh', 'Canon', 'Sharp', 'Kyocera', 'Otra/s'] },
    { id: 'telefonia-ip', name: 'IP Telephony', brands: ['Yealink', 'Grandstream', 'Otra/s'] },
    { id: 'electro-oficina', name: 'Appliances', children: hogarElectro },
    hogarClimatizacion
  ]
};

const pimeTree = {
  id: 'pime', name: 'SMB', children: [
    {
      id: 'maquinaria', name: 'Machinery', children: [
        { id: 'compresores', name: 'Compressors', brands: ['Otra/s'] },
        { id: 'motores-electricos', name: 'Electric Motors', brands: ['Otra/s'] },
        { id: 'bombas', name: 'Pumps', brands: ['Otra/s'] },
        { id: 'generadores', name: 'Generators', brands: ['Otra/s'] },
        { id: 'electroherramientas', name: 'Power Tools', brands: ['Bosch', 'DeWalt', 'Makita', 'Otra/s'] }
      ]
    },
    {
      id: 'refrigeracion-comercial', name: 'Commercial Refrigeration', children: [
        { id: 'camaras', name: 'Cold Rooms', brands: ['Otra/s'] },
        { id: 'freezers-comerciales', name: 'Freezers', brands: ['Otra/s'] },
        { id: 'expositores', name: 'Display Cases', brands: ['Otra/s'] }
      ]
    },
    {
      id: 'electricidad', name: 'Electrical', children: [
        { id: 'tableros', name: 'Panels', brands: ['Otra/s'] },
        { id: 'cableado', name: 'Wiring', brands: ['Otra/s'] },
        { id: 'iluminacion', name: 'Lighting', brands: ['Otra/s'] }
      ]
    },
    {
      id: 'redes-pime', name: 'IT / Networking', children: [
        { id: 'servidores', name: 'Servers', brands: ['Dell', 'HP', 'Lenovo', 'Otra/s'] },
        { id: 'pcs-pime', name: 'PCs', brands: ['Dell', 'HP', 'Lenovo', 'Otra/s'] },
        { id: 'impresoras-pime', name: 'Printers', brands: ['HP', 'Epson', 'Canon', 'Otra/s'] }
      ]
    },
    { id: 'electro-pime', name: 'Appliances', children: hogarElectro },
    hogarClimatizacion
  ]
};

const industriaTree = {
  id: 'industria', name: 'Industry', children: [
    {
      id: 'instalaciones', name: 'Installations', children: [
        { id: 'neumatica', name: 'Pneumatics', brands: ['Otra/s'] },
        { id: 'hidraulica', name: 'Hydraulics', brands: ['Otra/s'] },
        { id: 'electrica-industrial', name: 'Electrical', brands: ['Otra/s'] },
        { id: 'automatizacion', name: 'Automation / PLC', brands: ['Siemens', 'Allen-Bradley', 'Schneider', 'Otra/s'] }
      ]
    },
    {
      id: 'maquinaria-industrial', name: 'Machinery', children: [
        { id: 'motores', name: 'Motors', brands: ['Otra/s'] },
        { id: 'reductores', name: 'Reducers', brands: ['Otra/s'] },
        { id: 'variadores', name: 'Drives / Inverters', brands: ['Schneider', 'Siemens', 'Otra/s'] },
        { id: 'compresores-industrial', name: 'Compressors', brands: ['Otra/s'] }
      ]
    },
    { id: 'calderas', name: 'Boilers', brands: ['Otra/s'] },
    { id: 'generadores-industrial', name: 'Generators', brands: ['Otra/s'] },
    {
      id: 'redes-industrial', name: 'Communications', children: [
        { id: 'switches-industrial', name: 'Industrial Switches', brands: ['Cisco', 'Hirschmann', 'Otra/s'] },
        { id: 'fibra', name: 'Fiber Optic', brands: ['Otra/s'] }
      ]
    },
    { id: 'electro-industrial', name: 'Appliances', children: hogarElectro },
    { ...hogarClimatizacion, id: 'climatizacion-industrial', name: 'Climate Control' }
  ]
};

const serviceTree = [hogarTree, oficinaTree, pimeTree, industriaTree];

module.exports = serviceTree;
