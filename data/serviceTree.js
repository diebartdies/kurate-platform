// Service taxonomy: Entorno > Categoría > Dispositivo > Marca

const serviceTree = [
  {
    id: 'hogar', name: 'Home', description: 'Consumo familiar, confort, entretenimiento, conectividad y equipamiento de baño residencial',
    categories: [
      {
        id: 'linea-blanca', name: 'Línea Blanca',
        devices: [
          { id: 'heladera', name: 'Heladera', brands: ['Ariston', 'Bambi', 'Bosch', 'Briket', 'Columbia', 'Drean', 'Electrolux', 'Eslabón de Lujo', 'Gafa', 'Hisense', 'Koh-i-noor', 'LG', 'Midea', 'Patrick', 'Philco', 'Samsung', 'Siam', 'Smartlife', 'Vondom', 'Whirlpool'] },
          { id: 'freezer', name: 'Freezer', brands: ['Bambi', 'Briket', 'Columbia', 'Drean', 'Electrolux', 'Eslabón de Lujo', 'Frate', 'Gafa', 'Hisense', 'Inelro', 'Koh-i-noor', 'LG', 'Midea', 'Nebba', 'Patrick', 'Philco', 'Siam', 'Teora', 'Vondom', 'Whirlpool'] },
          { id: 'lavarropas', name: 'Lavarropas', brands: ['Alladio', 'Ariston', 'Aurora', 'Beko', 'Candy', 'Codini', 'Columbia', 'Drean', 'Electrolux', 'Enova', 'Eslabón de Lujo', 'Koh-i-noor', 'LG', 'Longvie', 'Midea', 'Patrick', 'Philco', 'Samsung', 'Siam', 'Whirlpool'] },
          { id: 'microondas', name: 'Microondas', brands: ['Atma', 'BGH', 'Candy', 'Daewoo', 'Jeluz', 'Ken Brown', 'LG', 'Liliana', 'Midea', 'Noblex', 'Oster', 'Peabody', 'Philco', 'RICA', 'Samsung', 'Sansei', 'Siam', 'Smartlife', 'Ultracomb', 'Whirlpool'] },
          { id: 'cocina-horno', name: 'Cocina y Horno', brands: ['Ariston', 'Balay', 'Bertazzoni', 'Bosch', 'Candy', 'Domec', 'Drean', 'Escorial', 'Florencia', 'Llanos', 'Longvie', 'Martiri', 'Morelli', 'Orbis', 'Patrick', 'Philco', 'Siam', 'Smeg', 'TST', 'Whirlpool'] }
        ]
      },
      {
        id: 'linea-marron', name: 'Línea Marrón',
        devices: [
          { id: 'smart-tv', name: 'Smart TV', brands: ['Admiral', 'BGH', 'Enova', 'Hisense', 'Hitachi', 'JVC', 'LG', 'Noblex', 'Philco', 'Philips', 'Quint', 'RCA', 'Samsung', 'Sansei', 'Sanyo', 'Skyworth', 'Sony', 'TCL', 'Telefunken', 'Xiaomi'] },
          { id: 'audio-parlantes', name: 'Sistemas de Audio y Parlantes', brands: ['Aiwa', 'Bose', 'Daewoo', 'Edifier', 'JBL', 'Ken Brown', 'LG', 'Logitech', 'Noblex', 'Panacom', 'Philco', 'Philips', 'Pioneer', 'Samsung', 'Siam', 'Sony', 'Stromberg', 'Suono', 'Thonet and Vander', 'Winco'] },
          { id: 'secarropa', name: 'Secarropa', brands: ['Ariete', 'Atma', 'Black and Decker', 'Braun', 'Cecotec', 'Confort', 'Daewoo', 'Everest', 'Imaco', 'Keefe', 'LG', 'Liliana', 'Midea', 'Oster', 'Panasonic', 'Peabody', 'Philco', 'Philips', 'Scarlett', 'Tefal', 'Ultracomb', 'Winco', 'Xiaomi'] }
        ]
      },
      {
        id: 'climatizacion', name: 'Climatización',
        devices: [
          { id: 'aire-acondicionado', name: 'Aire Acondicionado', brands: ['BGH', 'Carrier', 'Coventry', 'Daitsu', 'Electra', 'Fedders', 'Hisense', 'Hitachi', 'LG', 'Midea', 'Noblex', 'Philco', 'Rheem', 'Samsung', 'Sansei', 'Siam', 'Surrey', 'TCL', 'Whirlpool', 'York'] },
          { id: 'calefactores-estufas', name: 'Calefactores y Estufas', brands: ['Atma', 'Axel', 'BGH', 'Calden', 'Coppens', 'DeLonghi', 'Domec', 'Emege', 'Eskabe', 'Klarstein', 'Lepanto', 'Liliana', 'Longvie', 'Magic Click', 'Orbis', 'Peabody', 'Philco', 'Rheem', 'Tromen', 'Volcan'] }
        ]
      },
      {
        id: 'calentamiento-agua', name: 'Calentamiento de Agua',
        devices: [
          { id: 'termotanque-calefon', name: 'Termotanque y Calefón', brands: ['Ariston', 'BGH', 'Coppens', 'Domec', 'Escorial', 'Eskabe', 'Fogata', 'Gorenje', 'Heineken', 'Longvie', 'Orbis', 'Peabody', 'Philco', 'Rheem', 'Rinnai', 'Saiar', 'Señorial', 'Sherman', 'Termonic', 'Volcan'] }
        ]
      },
      {
        id: 'bano-sanitarios', name: 'Baño, Sanitarios y Cuidado Personal',
        devices: [
          { id: 'inodoros-bidets', name: 'Inodoros y Bidets', brands: ['Aqualia', 'Ariel', 'Ariston', 'Bari', 'Capea', 'Deca', 'Derpla', 'Duravit', 'Eskabe', 'Ferrum', 'Incepa', 'Jacuzzi', 'Laufen', 'Peirano', 'Piazza', 'Pringles', 'Roca', 'Stone', 'Toto', 'Vasser'] },
          { id: 'duchas-termostaticos', name: 'Duchas y Sistemas Termostáticos', brands: ['Aqualia', 'Ariston', 'Clever', 'Decca', 'Delta', 'FV (Franz Viegener)', 'Genebre', 'Gheco', 'Grohe', 'Hansgrohe', 'Hydra', 'Hydro', 'Kohler', 'Moen', 'Peirano', 'Piazza', 'Roca', 'Stiebel Eltron', 'Teka', 'Vasser'] },
          { id: 'lavamanos-bachas', name: 'Lavamanos y Bachas', brands: ['Aqualia', 'Bari', 'Capea', 'Deca', 'Derpla', 'Duravit', 'Ferrum', 'FV', 'Incepa', 'Kohler', 'Laufen', 'Marmolina', 'Peirano', 'Piazza', 'Pringles', 'Roca', 'Schneider', 'Stone', 'Toto', 'Vasser'] },
          { id: 'extractores-bano', name: 'Extractores de Aire de Baño', brands: ['Axel', 'Cata', 'Gralf', 'Hydra', 'Janis', 'KDK', 'Liliana', 'Maraldi', 'Martin y Martin', 'Panasonic', 'Protalia', 'S&P (Soler & Palau)', 'Sodeca', 'Spar', 'TST', 'Vents', 'Ventrex', 'Vornado', 'Winco', 'Yelmo'] },
          { id: 'secadores-pelo', name: 'Secadores de Pelo y Estilizadores', brands: ['Atma', 'Babyliss', 'Bellissima', 'Braun', 'Conair', 'Dyson', 'GA.MA Italy', 'Heineken', 'Oster', 'Panasonic', 'Peabody', 'Philco', 'Philips', 'Remington', 'Revlon', 'Smartlife', 'Taiff', 'Ultracomb', 'Valera', 'Yelmo'] },
          { id: 'balanzas', name: 'Balanzas Digitales (Smart / Bioimpedancia)', brands: ['Aspen', 'Atma', 'Beurer', 'Braun', 'Etekcity', 'Fitbit', 'Garmin', 'Huawei', 'Kretz', 'Liliana', 'Omron', 'Oster', 'Peabody', 'Philco', 'Philips', 'Renpho', 'San Up', 'Silfab', 'Smartlife', 'Xiaomi'] },
          { id: 'hidromasajes-jacuzzis', name: 'Hidromasajes y Jacuzzis', brands: ['Aquaglass', 'Buckingham', 'Calypso', 'Duravit', 'Ferrum', 'Hydra', 'Idro', 'Intex', 'Jacuzzi', 'Kohler', 'Laufen', 'Motorarg', 'Niza', 'Plomyplas', 'Roca', 'Sanycer', 'Schneider', 'Toto', 'Vulcano', 'Zenith'] }
        ]
      },
      {
        id: 'linea-gris', name: 'Línea Gris (Informática y Conectividad)',
        devices: [
          { id: 'pcs-notebooks', name: 'PCs de Escritorio y Notebooks', brands: ['Acer', 'Apple', 'ASUS', 'Bangho', 'Corsair', 'CX', 'Dell', 'Enova', 'Exo', 'Gigabyte', 'HP', 'Huawei', 'Lenovo', 'MSI', 'Noblex', 'Overtech', 'Positivo BGH', 'Razer', 'Samsung', 'Xiaomi'] },
          { id: 'consolas-streaming', name: 'Consolas de Videojuegos y Streaming', brands: ['Amazon Fire', 'Apple TV', 'Asus ROG', 'Atari', 'Dynacom', 'Google Chromecast', 'Lenovo Legion', 'Microsoft Xbox', 'MSI Claw', 'Nintendo', 'Nvidia Shield', 'PC Engine', 'Razer', 'Realme', 'Roku', 'Sega', 'Sony PlayStation', 'Steam Valve', 'Xiaomi Mi Box'] },
          { id: 'impresoras-domesticas', name: 'Impresoras Domésticas y Multifunción', brands: ['Anycubic', 'Brother', 'Canon', 'Creality', 'Dremel', 'Epson', 'FlashForge', 'Fujifilm', 'Hellbot', 'HP', 'Instax', 'Kodak', 'Lexmark', 'Pantun', 'Polaroid', 'Prusa', 'Ricoh', 'Samsung', 'Trilab', 'Xerox'] },
          { id: 'nas-domestico', name: 'Servidores Domésticos y Almacenamiento NAS', brands: ['Adata', 'Asustor', 'Buffalo', 'Crucial', 'Dell', 'Drobo', 'HP', 'Kingston', 'Lenovo', 'Netgear', 'Pny', 'QNAP', 'Samsung', 'SanDisk', 'Seagate', 'Synology', 'Verbatim', 'Western Digital'] },
          { id: 'routers-wifi', name: 'Dispositivos de Red y Routers Wi-Fi', brands: ['Arris', 'Asus', 'Belkin', 'Cisco Small Business', 'D-Link', 'Eero', 'Google Nest', 'Huawei', 'Kozumi', 'Linksys', 'Mercusys', 'MikroTik', 'Motorola', 'Nisuta', 'Tenda', 'TP-Link', 'Ubiquiti', 'Xiaomi', 'Zyxel'] }
        ]
      }
    ]
  },
  {
    id: 'oficina', name: 'Office', description: 'Productividad corporativa, infraestructura IT, conectividad, climatización y sanidad en espacios de trabajo',
    categories: [
      {
        id: 'linea-blanca-oficina', name: 'Línea Blanca de Oficina',
        devices: [
          { id: 'frigobar-exhibidoras', name: 'Frigobar y Exhibidoras', brands: ['Atma', 'Bambi', 'Briket', 'Drean', 'Gafa', 'Hisense', 'Inelro', 'Klimatic', 'Koh-i-noor', 'LG', 'Midea', 'Nebba', 'Patrick', 'Philco', 'Samsung', 'Siam', 'Smartlife', 'Teora', 'Vondom', 'Whirlpool'] },
          { id: 'cafeteras-profesionales', name: 'Cafeteras Profesionales y de Cápsula', brands: ['Atma', 'Bialetti', 'Black and Decker', 'DeLonghi', 'Dolce Gusto', 'Electrolux', 'Gaggia', 'Hamilton Beach', 'Krups', 'Liliana', 'Moulinex', 'Nespresso', 'Oster', 'Peabody', 'Philips', 'Saeco', 'Sanremo', 'Smartlife', 'Ultracomb', 'Winco'] }
        ]
      },
      {
        id: 'linea-marron-oficina', name: 'Línea Marrón de Oficina',
        devices: [
          { id: 'monitores-proyeccion', name: 'Monitores y Pantallas de Proyección', brands: ['Acer', 'AOC', 'ASUS', 'Bangho', 'BenQ', 'Dell', 'Enova', 'Epson', 'Gigabyte', 'HP', 'Hisense', 'Lenovo', 'LG', 'MSI', 'Noblex', 'Philips', 'Samsung', 'Sony', 'TCL', 'ViewSonic'] },
          { id: 'videoconferencia-audio', name: 'Sistemas de Videoconferencia y Audio', brands: ['Anker', 'Aver', 'Bose', 'Cisco', 'Jabra', 'JBL', 'Logitech', 'Microsoft', 'Owl Labs', 'Panacom', 'Philips', 'Poly', 'Redragon', 'Sennheiser', 'Shure', 'Sony', 'Stromberg', 'Thonet and Vander', 'Yamaha', 'Yealink'] }
        ]
      },
      {
        id: 'climatizacion-oficina', name: 'Climatización de Oficina',
        devices: [
          { id: 'aire-acondicionado-oficina', name: 'Aire Acondicionado (Cassette y Baja Silueta)', brands: ['BGH', 'Carrier', 'Coventry', 'Daikin', 'Electra', 'Fedders', 'Fujitsu VRF', 'Hisense', 'Hitachi', 'LG', 'Midea', 'Mitsubishi Electric', 'Noblex', 'Philco', 'Samsung', 'Sansei', 'Siam', 'Surrey', 'TCL', 'York'] },
          { id: 'calefaccion-corporativa', name: 'Calefacción Corporativa y Paneles', brands: ['Atma', 'Axel', 'BGH', 'Calden', 'Coppens', 'DeLonghi', 'Domec', 'EcoLogic', 'Emege', 'Eskabe', 'Klarstein', 'Liliana', 'Longvie', 'Magic Click', 'Orbis', 'Peabody', 'Philco', 'Rheem', 'Tromen', 'Volcan'] }
        ]
      },
      {
        id: 'calentamiento-agua-oficina', name: 'Calentamiento de Agua de Oficina',
        devices: [
          { id: 'dispensers-termotanques', name: 'Dispensers de Agua y Termotanques', brands: ['Ariston', 'Atma', 'BGH', 'Columbia', 'Domec', 'Escorial', 'Eskabe', 'Humma', 'Longvie', 'Orbis', 'Peabody', 'Philco', 'Rheem', 'Saiar', 'Señorial', 'Sherman', 'Spar', 'Tabureto', 'Volcan', 'Waterplast'] }
        ]
      },
      {
        id: 'bano-sanidad-oficina', name: 'Baño y Sanidad de Oficina',
        devices: [
          { id: 'secadores-manos', name: 'Secadores de Manos por Aire (Soplado de Alta Velocidad)', brands: ['Axel', 'Cata', 'Dyson', 'Excel Dryer', 'Hydra', 'Inelro', 'Jofel', 'Klarstein', 'Liliana', 'Maraldi', 'Mediclinics', 'Oster', 'Panasonic', 'Peabody', 'San Up', 'Smartlife', 'Spar', 'Valera', 'Vents', 'Winco'] },
          { id: 'dispensers-automaticos', name: 'Dispensers Automáticos (Jabón y Sanitizante con Sensor)', brands: ['Biork', 'Care', 'Dany', 'Elite', 'Gojo', 'Gralf', 'Humma', 'Jofel', 'Kimberly-Clark', 'Kretz', 'Mediclinics', 'Nisuta', 'Peabody', 'Philco', 'Purell', 'Rubbermaid', 'Smartlife', 'Tork', 'Vasser', 'Xiaomi'] },
          { id: 'inodoros-mingitorios-oficina', name: 'Inodoros, Mingitorios y Flujómetros con Sensor', brands: ['Aqualia', 'Bari', 'Capea', 'Deca', 'Derpla', 'Duravit', 'Ferrum', 'FV (Flujómetros)', 'Incepa', 'Jacuzzi', 'Laufen', 'Peirano', 'Piazza', 'Pringles', 'Roca', 'Sloan', 'Stone', 'Toto', 'Vasser', 'Zenith'] },
          { id: 'griferias-sensor', name: 'Griferías Electrónicas con Sensor de Presencia', brands: ['Aqualia', 'Clever', 'Decca', 'Delta', 'FV (Franz Viegener)', 'Genebre', 'Gheco', 'Grohe', 'Hansgrohe', 'Hydra', 'Hydro', 'Kohler', 'Moen', 'Peirano', 'Piazza', 'Roca', 'Sloan', 'Teka', 'Toto', 'Vasser'] },
          { id: 'extractores-industriales', name: 'Extractores de Aire Industriales y Forzadores', brands: ['Axel Industrial', 'Cata', 'Gralf', 'Hydra', 'KDK', 'Maraldi', 'Martin y Martin', 'Panasonic Industry', 'Protalia', 'S&P (Soler & Palau)', 'Sodeca', 'Spar', 'Systemair', 'TST', 'Ventrex', 'Vents', 'Vornado', 'Winco', 'Yelmo', 'Zilmet'] }
        ]
      },
      {
        id: 'linea-gris-oficina', name: 'Línea Gris (Informática y Conectividad)',
        devices: [
          { id: 'pcs-corporativas', name: 'PCs Corporativas y Thin Clients', brands: ['Acer TravelMate', 'Aopen', 'Apple Mac', 'ASUS ExpertBook', 'Bangho Professional', 'CX Corp', 'Dell Latitude', 'Elo Touch', 'Exo Corporate', 'Fujitsu', 'Gigabyte Brix', 'HP ProDesk', 'Huawei MateBook', 'Intel NUC', 'Lenovo ThinkPad', 'Microsoft Surface', 'MSI Pro', 'Positivo BGH Pro', 'Samsung Galaxy Book', 'Toshiba Dynabook'] },
          { id: 'impresoras-corporativas', name: 'Impresoras Corporativas y Fotocopiadoras', brands: ['Bixolon', 'Brother', 'Canon ImageRunner', 'Citizen', 'Epson EcoTank', 'Fujitsu Scanners', 'Honeywell', 'HP LaserJet', 'Kodak Alaris', 'Konica Minolta', 'Kyocera', 'Lexmark', 'Pantun Pro', 'Ricoh', 'Sato', 'Sharp', 'Star Micronics', 'Toshiba', 'Xerox', 'Zebra'] },
          { id: 'servidores-empresariales', name: 'Servidores Empresariales y Racks', brands: ['APC (Schneider Electric)', 'Asustor Lockerstor', 'Bangho ProServer', 'Cisco UCS', 'Dell PowerEdge', 'Eaton', 'Exo Server', 'Fujitsu Primergy', 'Furukawa', 'HPE (Hewlett Packard Enterprise)', 'Huawei FusionServer', 'IBM', 'Inspur', 'Lenovo ThinkSystem', 'Oracle', 'QNAP Enterprise', 'Supermicro', 'Synology RackStation', 'Tripp Lite', 'Vertiv'] },
          { id: 'switches-administrables', name: 'Dispositivos de Red y Switches Administrables', brands: ['Allied Telesis', 'Aruba (HPE)', 'Check Point', 'Cisco Systems', 'D-Link Business', 'Extreme Networks', 'Fortinet', 'Huawei Enterprise', 'Juniper Networks', 'Linksys Business', 'MikroTik', 'Netgear Insight', 'Palo Alto Networks', 'Ruckus (CommScope)', 'SonicWall', 'Sophos', 'TP-Link Omada', 'Ubiquiti UniFi', 'WatchGuard', 'Zyxel Networks'] }
        ]
      }
    ]
  },
  {
    id: 'casa-campo', name: 'Casa de Campo', description: 'Equipamiento optimizado para entornos rurales, alta capacidad, gas envasado, sistemas solares/12V, conectividad de largo alcance y sanidad rural',
    categories: [
      {
        id: 'linea-blanca-campo', name: 'Línea Blanca de Campo',
        devices: [
          { id: 'freezer-horizontal', name: 'Freezer Horizontal y Heladeras Duales/12V', brands: ['Bambi', 'Briket', 'Columbia', 'Drean', 'Eslabón de Lujo', 'Frare', 'Gafa', 'Hisense', 'Inelro', 'Koh-i-noor', 'Lacar', 'LG', 'Midea', 'Patrick', 'Philco', 'Samsung', 'Siam', 'Teora', 'Vondom', 'Whirlpool'] },
          { id: 'cocinas-multi-gas', name: 'Cocinas Multi-gas y Semi-Industriales', brands: ['Bosch', 'Domec', 'Drean', 'Escorial', 'Florencia', 'Forza', 'Llanos', 'Longvie', 'Macom', 'Martiri', 'Morelli', 'Orbis', 'Patrick', 'Philco', 'Siam', 'Smeg', 'Sol Real', 'Signo de Oro', 'Volcan', 'Whirlpool'] }
        ]
      },
      {
        id: 'linea-marron-campo', name: 'Línea Marrón de Campo',
        devices: [
          { id: 'smart-tv-campo', name: 'Smart TV y Receptores Satelitales', brands: ['Admiral', 'BGH', 'Enova', 'Hisense', 'Hitachi', 'JVC', 'LG', 'Noblex', 'Philco', 'Philips', 'Quint', 'RCA', 'Samsung', 'Sansei', 'Sanyo', 'Skyworth', 'Sony', 'TCL', 'Telefunken', 'Xiaomi'] },
          { id: 'radios-multibanda', name: 'Radios Multibanda y Audio a Batería', brands: ['Aiwa', 'Bose', 'Daewoo', 'Edifier', 'JBL', 'Ken Brown', 'LG', 'Logitech', 'Noblex', 'Panacom', 'Philco', 'Philips', 'Pioneer', 'Siam', 'Sony', 'Stromberg', 'Suono', 'Thonet and Vander', 'Winco', 'Xiaomi'] }
        ]
      },
      {
        id: 'climatizacion-campo', name: 'Climatización de Campo',
        devices: [
          { id: 'estufas-lena', name: 'Estufas a Leña y Salamandras Eficientes', brands: ['Amesti', 'Axel', 'Bosca', 'Calden', 'Coppens', 'Domec', 'Emege', 'Eskabe', 'Filfer', 'Herom', 'Istilart', 'Lepanto', 'Liliana', 'Longvie', 'Ñuke', 'Orbis', 'Peabody', 'Qutral', 'Tromen', 'Volcan'] },
          { id: 'aires-inverter-ventiladores', name: 'Aires Inverter y Ventiladores de Techo', brands: ['Atma', 'Axel', 'BGH', 'Carrier', 'Hisense', 'Hitachi', 'LG', 'Martin y Martin', 'Midea', 'Noblex', 'Philco', 'Protalia', 'Samsung', 'Sansei', 'Siam', 'Surrey', 'TCL', 'Whirlpool', 'Yelmo', 'York'] }
        ]
      },
      {
        id: 'calentamiento-agua-campo', name: 'Calentamiento de Agua de Campo',
        devices: [
          { id: 'termotanques-solares', name: 'Termotanques Solares y Multi-gas', brands: ['Ariston', 'Ciroc', 'Coppens', 'Domec', 'Enertik', 'Escorial', 'Eskabe', 'Eter Sol', 'Goodenergy', 'Heliotropo', 'Longvie', 'Orbis', 'Rheem', 'Saiar', 'Señorial', 'Sherman', 'Soleventus', 'Splendid', 'Termonic', 'Volcan'] }
        ]
      },
      {
        id: 'bano-sanidad-campo', name: 'Baño y Sanidad de Campo',
        devices: [
          { id: 'inodoros-bidets-campo', name: 'Inodoros y Bidets (Bajo Consumo Hídrico / Aptos Pozo)', brands: ['Aqualia', 'Ariel', 'Ariston', 'Bari', 'Capea', 'Deca', 'Derpla', 'Duravit', 'Eskabe', 'Ferrum', 'Incepa', 'Jacuzzi', 'Laufen', 'Peirano', 'Piazza', 'Pringles', 'Roca', 'Stone', 'Toto', 'Vasser'] },
          { id: 'duchas-baja-presion', name: 'Duchas y Sistemas Termostáticos (Aptos Baja Presión)', brands: ['Aqualia', 'Ariston', 'Clever', 'Decca', 'Delta', 'FV (Franz Viegener)', 'Genebre', 'Gheco', 'Grohe', 'Hansgrohe', 'Hydra', 'Hydro', 'Kohler', 'Moen', 'Peirano', 'Piazza', 'Roca', 'Stiebel Eltron', 'Teka', 'Vasser'] },
          { id: 'bombas-presurizadoras', name: 'Bombas Presurizadoras y Elevadoras de Agua', brands: ['Czerweny', 'Ebara', 'Flotec', 'Grundfos', 'Ksb', 'Leo', 'Lowara', 'Motorarg', 'Pedrollo', 'Pluvius', 'Rowa', 'Salmson', 'Shurflo', 'Speroni', 'Tromen', 'Turbion', 'Udaondo', 'Vulcano', 'Zenit'] },
          { id: 'extractores-campo', name: 'Extractores de Aire de Baño (Bajo Consumo / 12V)', brands: ['Axel', 'Cata', 'Gralf', 'Hydra', 'Janis', 'KDK', 'Liliana', 'Maraldi', 'Martin y Martin', 'Panasonic', 'Protalia', 'S&P (Soler & Palau)', 'Sodeca', 'Spar', 'TST', 'Vents', 'Ventrex', 'Vornado', 'Winco', 'Yelmo'] },
          { id: 'balanzas-eficiencia', name: 'Balanzas Digitales y Secadores (Eficiencia Energética A+)', brands: ['Aspen', 'Atma', 'Babyliss', 'Bellissima', 'Beurer', 'Braun', 'GA.MA Italy', 'Huawei', 'Liliana', 'Omron', 'Oster', 'Peabody', 'Philco', 'Philips', 'Remington', 'Revlon', 'Silfab', 'Smartlife', 'Ultracomb', 'Xiaomi'] }
        ]
      },
      {
        id: 'linea-gris-campo', name: 'Línea Gris (Informática y Conectividad)',
        devices: [
          { id: 'notebooks-robustas', name: 'Notebooks Robustas y Equipos Bajo Consumo', brands: ['Acer Enduro', 'Apple MacBook Air', 'ASUS TUF', 'Bangho Robust', 'CX Advance', 'Dell Rugged', 'Enova Notebooks', 'Exo Mobile', 'Getac', 'Gigabyte', 'HP EliteBook', 'Intel NUC', 'Lenovo ThinkPad', 'Microsoft Surface Go', 'Panasonic Toughbook', 'Positivo BGH', 'Raspberry Pi', 'Samsung Galaxy Tab', 'Xiaomi Pad', 'Lenovo Yoga'] },
          { id: 'impresoras-continuo', name: 'Impresoras de Sistema Continuo', brands: ['Anycubic', 'Bixolon', 'Brother InkBenefit', 'Canon MegaTank', 'Canon Selphy', 'Creality', 'Epson EcoTank', 'Fujifilm', 'Hellbot', 'Honeywell', 'HP Smart Tank', 'HP Sprocket', 'Kodak', 'Lexmark', 'Pantun', 'Polaroid', 'Ricoh', 'Samsung', 'Xerox', 'Zebra'] },
          { id: 'micro-servers', name: 'Micro-Servers y Almacenamiento Local', brands: ['Adata Durapro', 'Asustor', 'Buffalo', 'Crucial', 'Dell PowerEdge', 'HPE MicroServer', 'Kingston Rugged', 'LaCie', 'Lenovo ThinkSystem', 'Netgear', 'QNAP', 'Samsung T-Series', 'SanDisk Pro', 'Seagate Expansion', 'Silicon Power', 'Synology', 'TerraMaster', 'Toshiba Canvio', 'Verbatim', 'Western Digital'] },
          { id: 'antenas-satelitales', name: 'Antenas Satelitales y Routers 4G Rurales', brands: ['Alcatel', 'Amphenol', 'Asus Rogue', 'Cisco Small Business', 'D-Link', 'Elsys', 'Huawei Rural', 'Kozumi', 'LigoWave', 'Linksys', 'Mercusys', 'MikroTik LTE', 'Netgear Nighthawk', 'Nisuta', 'Starlink SpaceX', 'Tenda High Power', 'TP-Link 4G', 'Ubiquiti AirMax', 'ZTE', 'Zyxel'] }
        ]
      }
    ]
  },
  {
    id: 'industria', name: 'Industria', description: 'Equipamiento pesado Heavy Duty, uso continuo 24/7, conexiones trifásicas, normas de seguridad biológica e infraestructura de planta',
    categories: [
      {
        id: 'linea-blanca-industrial', name: 'Línea Blanca Industrial / Gastronomía',
        devices: [
          { id: 'refrigeracion-comercial', name: 'Refrigeración Comercial y Cámaras Frigoríficas', brands: ['Arneg', 'Blaybar', 'Bonano', 'Briket', 'Carrier Transicold', 'Costan', 'Criotec', 'Fogel', 'Frare', 'Frimont', 'Friomax', 'Inelro', 'Koxka', 'Metalfrio', 'Midea Commercial', 'Nebba', 'Refriworld', 'Teora', 'Thermo King', 'Zilmet'] },
          { id: 'cocinas-industriales', name: 'Cocinas Industriales y Hornos Convectores', brands: ['Anvil', 'Bari', 'Blodgett', 'Fineschi', 'Forza', 'Gapan', 'Garland', 'Frymaster', 'Hobart', 'Ingeniería Gastronómica', 'L gastronomic', 'Macom', 'Marva', 'Morelli', 'Pauna', 'Rational', 'Santini', 'Sol Real', 'Tecno calor', 'UnoX'] }
        ]
      },
      {
        id: 'linea-marron-industrial', name: 'Línea Marrón Industrial / Señalización',
        devices: [
          { id: 'pantallas-industriales', name: 'Pantallas de Cartelería y Monitores Industriales', brands: ['Acer Pro', 'Advantech', 'AOC Professional', 'Asus ProArt', 'Barco', 'BenQ Pro', 'Christie', 'Dell Commercial', 'Elo Touch', 'HP Enterprise', 'LG Information Display', 'Lenovo ThinkVision', 'NEC Display', 'Panasonic Industry', 'Philips Signage', 'Planar', 'Samsung Business', 'Sharp Pro', 'Sony Professional', 'TCL Commercial'] },
          { id: 'audio-evacuacion', name: 'Sistemas de Audio Evacuación y Megafonía IP', brands: ['Audac', 'Axis Communications', 'B&S Audio', 'Behringer Pro', 'Biamp', 'Bose Professional', 'Bosch Security', 'Crown', 'Electro-Voice', 'Harman Pro', 'Inter-M', 'JBL Commercial', 'Mackie', 'Peavey Commercial', 'QSC', 'RCF', 'Sennheiser Business', 'Shure Pro', 'TOA Electronics', 'Yamaha Commercial'] }
        ]
      },
      {
        id: 'climatizacion-industrial', name: 'Climatización Industrial (HVAC)',
        devices: [
          { id: 'vrf-chillers', name: 'Sistemas VRF, Chillers y Roof-Tops', brands: ['BGH Eco Smart', 'Carrier', 'Clivet', 'Daikin', 'Dunham-Bush', 'Fujitsu VRF', 'Gree Commercial', 'Haier HVAC', 'Hitachi Industrial', 'Lennox', 'LG Chiller', 'McQuay', 'Midea Commercial', 'Mitsubishi Electric', 'Rhoss', 'Samsung DVM', 'Surrey Industrial', 'Toshiba HVAC', 'Trane', 'York'] },
          { id: 'cortinas-aire', name: 'Cortinas de Aire y Ventilación Axial', brands: ['Axel Industrial', 'Blauberg', 'Casals', 'Cata', 'Dynair', 'Eurovent', 'FlaktGroup', 'Gralf', 'Kruger', 'Maico', 'Martin y Martin', 'Ostberg', 'Protalia', 'S&P (Soler & Palau)', 'Sodeca', 'Systemair', 'Ventrex', 'Vents', 'Zilmet'] }
        ]
      },
      {
        id: 'vapor-industrial', name: 'Calentamiento de Agua / Vapor Industrial',
        devices: [
          { id: 'calderas-industriales', name: 'Calderas Humotubulares y Termotanques Alta Potencia', brands: ['A.O. Smith Pro', 'Ariston High Power', 'Baxi Industrial', 'Bosch Thermotechnology', 'Bradford White', 'Caldaia', 'Eskabe Max', 'Fimaco', 'Fontanet', 'Lochinvar', 'Longvie Comercial', 'Navien Industrial', 'Orbis Pro', 'Rheem Commercial', 'Rinnai Commercial', 'Salcor Cavi', 'Spiro', 'Vaillant Group', 'Viessmann', 'Zilmet'] }
        ]
      },
      {
        id: 'sanidad-planta', name: 'Sanidad, Vestuarios y Seguridad de Planta',
        devices: [
          { id: 'lavamanos-mecanico', name: 'Lavamanos de Accionamiento Mecánico (Pedal / Rodilla) y Bachas de Inox', brands: ['Abrasivos Argentinos', 'Bari', 'Blaybar', 'Briket', 'Escorial', 'Ferrum', 'Fineschi', 'Forza', 'FV', 'Ingeniería Gastronómica', 'L gastronomic', 'Macom', 'Morelli', 'Piazza', 'Pringles', 'Roca', 'Sol Real', 'Tecno calor', 'Vasser', 'Zenith'] },
          { id: 'duchas-emergencia', name: 'Duchas de Emergencia y Estaciones Lavaojos de Seguridad', brands: ['Aero', 'Aqualia', 'Ariston', 'Clever', 'Delta', 'Encon', 'FV', 'Haws', 'Hughes Safety', 'Hydra', 'Hydro', 'Kohler', 'Melisam', 'Moen', 'Piazza', 'Roca', 'Sloan', 'Speakman', 'Vasser', 'Zenith'] },
          { id: 'secadores-antivandalicos', name: 'Secadores de Manos Antivandalicos (Uso Intensivo)', brands: ['Axel Industrial', 'Cata', 'Dyson', 'Excel Dryer', 'Hydra', 'Inelro', 'Jofel', 'Klarstein', 'Liliana', 'Maraldi', 'Mediclinics', 'Oster', 'Panasonic', 'Peabody', 'San Up', 'Smartlife', 'Spar', 'Valera', 'Vents', 'Winco'] },
          { id: 'inodoros-alto-transito', name: 'Inodoros, Mingitorios y Flujómetros Pesados (Aptos Alto Tránsito)', brands: ['Aqualia', 'Bari', 'Capea', 'Deca', 'Derpla', 'Duravit', 'Ferrum', 'FV (Flujómetros)', 'Incepa', 'Jacuzzi', 'Laufen', 'Peirano', 'Piazza', 'Pringles', 'Roca', 'Sloan', 'Stone', 'Toto', 'Vasser', 'Zenith'] },
          { id: 'estaciones-sanitizacion', name: 'Estaciones de Sanitización y Dispensers Industriales IP', brands: ['Biork', 'Care', 'Dany', 'Elite', 'Gojo', 'Gralf', 'Humma', 'Jofel', 'Kimberly-Clark', 'Kretz', 'Mediclinics', 'Nisuta', 'Peabody', 'Philco', 'Purell', 'Rubbermaid', 'Smartlife', 'Tork', 'Vasser', 'Xiaomi'] }
        ]
      },
      {
        id: 'linea-gris-industrial', name: 'Línea Gris (Informática y Conectividad Industrial)',
        devices: [
          { id: 'computadoras-industriales', name: 'Computadoras Industriales (IPC) y Paneles Táctiles IP65', brands: ['Aaeon (Asus)', 'Advantech', 'Axiomtek', 'B&R Industrial', 'Beckhoff', 'Dell Rugged', 'Elo Touch Industrial', 'Getac', 'Honeywell Industrial', 'IEI Integration', 'Kontron', 'Moxa', 'Nexcom', 'Omron', 'Pepperl+Fuchs', 'Rockwell Automation', 'Schneider Electric Magelis', 'Siemens Simatic IPC', 'Winmate', 'Yokogawa'] },
          { id: 'impresoras-industriales', name: 'Impresoras Industriales de Código de Barras', brands: ['Brady', 'Brother Industrial', 'Canon Production', 'Citizen Systems', 'Dominó', 'Dymo Industrial', 'Epson LabelWorks', 'Fujitsu Industrial', 'Honeywell Datamax', 'Konica Minolta Accurio', 'Kyocera TaskAlfa', 'Lexmark Enterprise', 'Printronix', 'Ricoh Industrial', 'Sato', 'Toshiba TEC', 'TSC Auto ID', 'Xerox Production', 'Zebra Technologies'] },
          { id: 'servidores-planta', name: 'Servidores de Planta Rugerizados y Racks IP', brands: ['APC NetShelter IP', 'Advantech Server', 'Cisco UCS Industrial', 'Dell PowerEdge XR', 'Eaton Industrial', 'Furukawa Industrial', 'HPE Edgeline', 'Hirschmann', 'IBM Power Systems', 'Lenovo ThinkSystem SE350', 'Moxa Industrial Server', 'Oracle Engineered', 'QNAP Industrial NAS', 'Rittal Racks', 'Schneider Electric', 'Siemens Simatic Server', 'Supermicro IoT', 'Synology RackStation', 'Tripp Lite Industrial', 'Vertiv Knurr'] },
          { id: 'switches-din-rail', name: 'Switches Industriales DIN-Rail y Firewalls OT', brands: ['Antaira Technologies', 'Check Point Quantum Rugged', 'Cisco Industrial IE', 'Claroty', 'Fortinet FortiGate Rugged', 'Hirschmann Belden', 'MikroTik Industrial', 'Moxa', 'Nozomi Networks', 'Omron Industrial', 'Phoenix Contact', 'Red Lion Controls', 'Rockwell Allen-Bradley', 'Schneider ConneXium', 'Siemens Scalance', 'Trend Micro TXOne', 'Ubiquiti EdgeMax', 'Weidmüller', 'Westermo', 'Yokogawa'] }
        ]
      }
    ]
  }
];

module.exports = serviceTree;
