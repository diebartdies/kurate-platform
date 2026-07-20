require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const serviceTree = require('../data/serviceTree');

const TEST_PASSWORD = 'test1234';
const TOTAL = 100;

function makePhoto(label, hex) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500">
    <rect width="400" height="500" fill="${hex}"/>
    <text x="50%" y="52%" font-family="Arial" font-size="48" fill="#ffffff" text-anchor="middle">${label}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

const PHOTO_COLORS = ['#1f6feb', '#2ea043', '#bf3989', '#d29922', '#8957e5', '#0a7ea4', '#cf222e', '#6e40c9'];

const CATEGORIES = ['profesional_matriculado', 'tecnico_matriculado', 'tecnico_no_matriculado', 'idoneo'];
const AVAIL = ['inmediata', 'rapida', 'puedo_esperar', 'sin_apuro'];
const SCOPES = ['domicilio', 'barrio', 'ciudad', 'provincia', 'pais'];
const ACTIONS = ['Reparo', 'Instalo', 'Hago mantenimiento', 'Diagnóstico', 'Instalo y reparo'];

const FIRST = ['Mariano', 'Jorge', 'Ana', 'Carlos', 'Diego', 'Lucía', 'Federico', 'Pablo', 'Sofía', 'Ricardo',
  'Valentina', 'Tomás', 'Camila', 'Nicolás', 'Agustín', 'Martina', 'Esteban', 'Florencia', 'Gonzalo', 'Micaela',
  'Leandro', 'Paula', 'Sebastián', 'Julieta', 'Matías', 'Daniela', 'Hernán', 'Carla', 'Gustavo', 'Natalia',
  'Ezequiel', 'Vanesa', 'Rodrigo', 'Melina', 'Cristian', 'Sol', 'Adrián', 'Laura', 'Marcelo', 'Marina',
  'Ignacio', 'Fernanda', 'Patricio', 'Romina', 'Javier', 'Emilia', 'Bruno', 'Clara', 'Facundo', 'Luciano'];
const LAST = ['López', 'Pérez', 'Gómez', 'Ramírez', 'Fernández', 'Martínez', 'Sánchez', 'Romero', 'Acuña', 'Bustos',
  'Díaz', 'Torres', 'García', 'Silva', 'Rojas', 'Castro', 'Álvarez', 'Núñez', 'Vargas', 'Molina',
  'Suárez', 'Herrera', 'Morales', 'Ortiz', 'Iglesias', 'Cabrera', 'Vega', 'Méndez', 'Ruiz', 'Pizarro',
  'Domínguez', 'Gallardo', 'Aguirre', 'Benítez', 'Cáceres', 'Campos', 'Cantero', 'Caputo', 'Carrizo', 'Cuenca',
  'Delgado', 'Esposito', 'Figueroa', 'Franco', 'Giménez', 'González', 'Guzmán', 'Iriarte', 'Juárez', 'Ledesma'];

// Real province/city/neighborhood coverage (subset of seed-locations)
const LOCATIONS = {
  'CABA': [
    ['Palermo', 'C1425'], ['Recoleta', 'C1125'], ['Belgrano', 'C1428'], ['Almagro', 'C1042'],
    ['Caballito', 'C1424'], ['San Telmo', 'C1107'], ['Retiro', 'C1005'], ['Boedo', 'C1206'],
    ['Villa Urquiza', 'C1431'], ['Núñez', 'C1426'], ['Flores', 'C1406'], ['Devoto', 'C1424'],
    ['Villa Crespo', 'C1414'], ['Parque Patricios', 'C1244'], ['Puerto Madero', 'C1107'], ['Colegiales', 'C1426']
  ],
  'Buenos Aires': [
    ['La Plata', ''], ['Mar del Plata', ''], ['Bahía Blanca', ''], ['Tandil', ''], ['Quilmes', ''],
    ['Luján', ''], ['San Nicolás', ''], ['Zárate', ''], ['Campana', ''], ['Pergamino', '']
  ],
  'Córdoba': [['Córdoba', ''], ['Villa María', ''], ['Río Cuarto', ''], ['Carlos Paz', '']],
  'Santa Fe': [['Rosario', ''], ['Santa Fe', ''], ['Rafaela', ''], ['Venado Tuerto', '']],
  'Mendoza': [['Mendoza', ''], ['San Rafael', ''], ['Godoy Cruz', '']],
  'Tucumán': [['San Miguel de Tucumán', ''], ['Yerba Buena', '']],
  'Salta': [['Salta', ''], ['General Güemes', '']],
  'Misiones': [['Posadas', ''], ['Oberá', '']],
  'Neuquén': [['Neuquén', ''], ['San Martín de los Andes', '']],
  'Río Negro': [['Bariloche', ''], ['Viedma', ''], ['General Roca', '']],
  'Entre Ríos': [['Paraná', ''], ['Concepción del Uruguay', '']],
  'Chaco': [['Resistencia', ''], ['Presidencia Roque Sáenz Peña', '']]
};

function pick(arr, seed) { return arr[seed % arr.length]; }

// Flatten serviceTree into leaf nodes with their dotted path + brands
function collectLeaves(area, node, prefix, out) {
  const path = prefix ? `${prefix}.${node.id}` : node.id;
  if (node.children) {
    node.children.forEach(c => collectLeaves(area, c, path, out));
  } else {
    out.push({ area, path, name: node.name, brands: (node.brands || ['Otra/s']) });
  }
}

const ALL_LEAVES = [];
serviceTree.forEach(areaNode => collectLeaves(areaNode.id, areaNode, '', ALL_LEAVES));

const SPECIALTY_BY_AREA = {
  hogar: ['Electrodomésticos de línea blanca', 'Gasista matriculado', 'Cocinas y microondas', 'Climatización',
    'Plomería doméstica', 'Calefacción y estufas', 'Reparación de TV y audio', 'Heladeras y freezer'],
  oficina: ['Equipos de oficina', 'IT de oficina', 'Climatización comercial', 'Redes y telecomunicaciones',
    'Impresión y fotocopiado', 'Soporte de PCs y notebooks', 'Telefonía IP'],
  pime: ['Redes y voz para Pymes', 'Refrigeración comercial', 'Electricidad comercial', 'Maquinaria PIME',
    'Mantenimiento de servidores', 'Climatización para Pymes'],
  industria: ['Mantenimiento industrial', 'Automatización y PLC', 'Instalaciones industriales',
    'Neumática e hidráulica', 'Variadores y motores', 'Climatización industrial', 'Fibra óptica industrial']
};

function rand(seed) { return ((seed * 9301 + 49297) % 233280) / 233280; }

async function main() {
  const uri = (process.env.MONGO_URI || '').replace(/\/fullmental$/, '/KuraTe').replace(/\/fullminent$/, '/KuraTe');
  await mongoose.connect(uri);
  console.log(`MongoDB Connected: ${mongoose.connection.host} db=${mongoose.connection.db.databaseName}`);

  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(TEST_PASSWORD, salt);

  let created = 0, skipped = 0;

  for (let i = 0; i < TOTAL; i++) {
    const areaNode = serviceTree[i % serviceTree.length];
    const area = areaNode.id;

    const firstName = pick(FIRST, i);
    const lastName = pick(LAST, (i * 7 + 3) % LAST.length);
    const email = `tech${area}.${i + 1}@kurate.seed`;
    const taxId = `${20 + (i % 9)}${String(10000000 + i * 137).padStart(8, '0')}`;

    const leavesInArea = ALL_LEAVES.filter(l => l.area === area);
    const svcCount = 1 + (i % 3); // 1 a 3 servicios
    const services = [];
    const seen = new Set();
    let s = i;
    for (let k = 0; k < svcCount; k++) {
      let leaf;
      let guard = 0;
      do {
        leaf = pick(leavesInArea, s);
        s = s * 3 + 1;
        guard++;
      } while (seen.has(leaf.path) && guard < 20);
      seen.add(leaf.path);
      const brands = leaf.brands.length && leaf.brands[0] !== 'Otra/s'
        ? leaf.brands.slice(0, 2 + (i % 3))
        : ['Otra/s'];
      services.push({ path: leaf.path, name: leaf.name, brands });
    }

    const locProvince = pick(Object.keys(LOCATIONS), i);
    const locList = LOCATIONS[locProvince];
    const [city, postal] = pick(locList, i * 5);
    const neighborhood = locProvince === 'CABA' ? city : '';

    const specialty = pick(SPECIALTY_BY_AREA[area], i * 2);
    const action = pick(ACTIONS, i * 3);
    const category = pick(CATEGORIES, i);
    const availability = pick(AVAIL, i * 4);
    const scope = pick(SCOPES, i * 5);

    const photo = makePhoto(`${firstName[0]}${lastName[0]}`, PHOTO_COLORS[i % PHOTO_COLORS.length]);

    const exists = await User.findOne({ email });
    if (exists) { skipped++; continue; }

    await User.create({
      name: `${firstName} ${lastName}`,
      email,
      password: hash,
      role: 'professional',
      professionalType: 'hogar',
      isEmailVerified: true,
      isVerified: true,
      verificationStatus: 'approved',
      hogarProfile: {
        firstName, lastName,
        companyName: `${firstName} ${lastName} Servicios`,
        taxId,
        category, area,
        action,
        actionDetails: `${action} de ${services.map(sv => sv.name).join(', ').toLowerCase()}.`,
        services,
        specialty,
        scope,
        availability,
        contact: { email, mobilePhone: `11 6${(100 + i) % 1000}-${(1000 + i * 13) % 9000}`, whatsapp: i % 2 === 0, telegram: i % 3 === 0 },
        address: { street: `Calle ${i + 1}`, number: String(100 + i), city, neighborhood, province: locProvince, postalCode: postal || String(1000 + i * 7) },
        photos: [photo]
      }
    });
    created++;
  }

  console.log(`Done. Created: ${created}, Skipped (already exist): ${skipped}`);
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
