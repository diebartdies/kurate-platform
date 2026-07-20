const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Province = require('../models/Province');
const City = require('../models/City');
const Neighborhood = require('../models/Neighborhood');

const provinces = [
  'Buenos Aires', 'CABA', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba',
  'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja',
  'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta', 'San Juan',
  'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucumán'
];

const citiesByProvince = {
  'Buenos Aires': ['La Plata', 'Mar del Plata', 'Bahía Blanca', 'Tandil', 'San Nicolás', 'Zárate', 'Campana', 'Luján', 'Pergamino', 'Junín', 'Azul', 'Olavarría', 'Necochea', 'Pehuajó', 'Chivilcoy', 'Mercedes', 'Bragado', 'Lincoln', 'Carlos Casares', 'Trenque Lauquen', 'Bolívar', 'Daireaux', '9 de Julio', '25 de Mayo'],
  'Catamarca': ['San Fernando del Valle de Catamarca', 'Andalgalá', 'Belén', 'Tinogasta', 'Santa María', 'Recreo', 'San José', 'Fiambalá'],
  'Chaco': ['Resistencia', 'Presidencia Roque Sáenz Peña', 'Villa Ángela', 'Charata', 'General José de San Martín', 'Las Breñas', 'Quitilipi', 'Machagai'],
  'Chubut': ['Rawson', 'Comodoro Rivadavia', 'Puerto Madryn', 'Trelew', 'Esquel', 'Gaiman', 'Dolavon', 'Sarmiento', 'Rada Tilly'],
  'Córdoba': ['Córdoba', 'Villa María', 'Río Cuarto', 'Villa Carlos Paz', 'San Francisco', 'Jesús María', 'Cruz del Eje', 'Cosquín', 'La Falda', 'Mina Clavero', 'Río Tercero', 'Alta Gracia', 'Bell Ville', 'Arroyito', 'Marcos Juárez'],
  'Corrientes': ['Corrientes', 'Goya', 'Paso de los Libres', 'Curuzú Cuatiá', 'Mercedes', 'Santo Tomé', 'Bella Vista', 'Esquina', 'Monte Caseros', 'Saladas'],
  'Entre Ríos': ['Paraná', 'Concordia', 'Gualeguaychú', 'Concepción del Uruguay', 'Colón', 'Gualeguay', 'Villaguay', 'Nogoyá', 'Victoria', 'La Paz', 'Federación', 'Chajarí'],
  'Formosa': ['Formosa', 'Clorinda', 'Pirané', 'Laguna Blanca', 'El Colorado', 'Ibarreta', 'Las Lomitas', 'Ingeniero Juárez'],
  'Jujuy': ['San Salvador de Jujuy', 'Palpalá', 'La Quiaca', 'Libertador General San Martín', 'Humahuaca', 'Tilcara', 'El Carmen', 'Perico', 'Fraile Pintado'],
  'La Pampa': ['Santa Rosa', 'General Pico', 'Eduardo Castex', 'Realicó', 'Intendente Alvear', 'Victorica', 'General Acha', 'Macachín', 'Toay'],
  'La Rioja': ['La Rioja', 'Chilecito', 'Aimogasta', 'Villa Unión', 'Famatina', 'Olta', 'Chamical', 'Chepes'],
  'Mendoza': ['Mendoza', 'Godoy Cruz', 'Guaymallén', 'Las Heras', 'San Rafael', 'Maipú', 'Luján de Cuyo', 'Tunuyán', 'Rivadavia', 'General Alvear', 'Malargüe', 'San Martín'],
  'Misiones': ['Posadas', 'Oberá', 'Eldorado', 'Puerto Iguazú', 'San Vicente', 'Apóstoles', 'Leandro N. Alem', 'Jardín América', 'Montecarlo', 'Aristóbulo del Valle'],
  'Neuquén': ['Neuquén', 'Cutral Có', 'Zapala', 'San Martín de los Andes', 'Villa La Angostura', 'Plottier', 'Centenario', 'Rincón de los Sauces', 'Chos Malal'],
  'Río Negro': ['Viedma', 'General Roca', 'Bariloche', 'Cipolletti', 'Villa Regina', 'Allen', 'Cinco Saltos', 'El Bolsón', 'Choele Choel', 'Río Colorado'],
  'Salta': ['Salta', 'San Ramón de la Nueva Orán', 'Tartagal', 'Cafayate', 'Rosario de la Frontera', 'Metán', 'Embarcación', 'General Güemes', 'Joaquín V. González'],
  'San Juan': ['San Juan', 'Rivadavia', 'Rawson', 'Caucete', 'San Martín', 'Albardón', 'Pocito', 'Jáchal', 'Calingasta'],
  'San Luis': ['San Luis', 'Villa Mercedes', 'Merlo', 'La Punta', 'Justo Daract', 'Buena Esperanza', 'Concarán', 'Tilisarao'],
  'Santa Cruz': ['Río Gallegos', 'Caleta Olivia', 'El Calafate', 'Las Heras', 'Pico Truncado', 'Puerto Deseado', 'Perito Moreno', 'Puerto San Julián'],
  'Santa Fe': ['Rosario', 'Santa Fe', 'Rafaela', 'Venado Tuerto', 'Villa Gobernador Gálvez', 'Reconquista', 'San Lorenzo', 'Esperanza', 'Cañada de Gómez', 'Casilda', 'Firmat', 'Sunchales', 'Tostado'],
  'Santiago del Estero': ['Santiago del Estero', 'La Banda', 'Termas de Río Hondo', 'Añatuya', 'Frías', 'Fernández', 'Monte Quemado', 'Quimilí'],
  'Tierra del Fuego': ['Ushuaia', 'Río Grande', 'Tolhuin'],
  'Tucumán': ['San Miguel de Tucumán', 'Concepción', 'Tafí Viejo', 'Yerba Buena', 'Aguilares', 'Monteros', 'Famaillá', 'Bella Vista', 'Simoca', 'Lules']
};

const cabaNeighborhoods = [
  'Palermo', 'Recoleta', 'Belgrano', 'Nuñez', 'Colegiales', 'Chacarita', 'Villa Crespo',
  'Almagro', 'Balvanera', 'San Nicolás', 'Montserrat', 'Puerto Madero', 'Retiro', 'La Boca',
  'Barracas', 'Constitución', 'San Telmo', 'Parque Patricios', 'Boedo', 'Caballito',
  'Flores', 'Floresta', 'Villa Lugano', 'Villa Soldati', 'Villa Riachuelo', 'Liniers',
  'Mataderos', 'Villa Luro', 'Versalles', 'Villa Real', 'Monte Castro', 'Devoto',
  'Villa del Parque', 'Villa Santa Rita', 'Villa General Mitre', 'Paternal', 'Saavedra',
  'Coghlan', 'Villa Urquiza', 'Parque Avellaneda', 'Villa Devoto', 'Villa Ortúzar',
  'Parque Chacabuco', 'Nueva Pompeya', 'Villa Pueyrredón', 'Agronomía', 'Villa del Parque'
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Clear existing data
    await Promise.all([
      Province.deleteMany({}),
      City.deleteMany({}),
      Neighborhood.deleteMany({})
    ]);
    console.log('Cleared existing location data');

    // Insert provinces
    const provinceDocs = await Province.insertMany(
      provinces.map(name => ({ name }))
    );
    console.log(`Inserted ${provinceDocs.length} provinces`);

    const provinceMap = {};
    for (const p of provinceDocs) {
      provinceMap[p.name] = p._id;
    }

    // Insert cities for each province (except CABA)
    let cityCount = 0;
    for (const [provName, cities] of Object.entries(citiesByProvince)) {
      if (provName === 'CABA') continue;
      const provId = provinceMap[provName];
      if (!provId) continue;
      await City.insertMany(cities.map(name => ({ name, province: provId })));
      cityCount += cities.length;
    }
    console.log(`Inserted ${cityCount} cities`);

    // Insert CABA neighborhoods
    const cabaId = provinceMap['CABA'];
    await Neighborhood.insertMany(cabaNeighborhoods.map(name => ({ name, province: cabaId })));
    console.log(`Inserted ${cabaNeighborhoods.length} CABA neighborhoods`);

    console.log('\nSeed complete!');
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
}

seed();
