const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/KuraTe';

const provinces = [
  { name: 'CABA', countryCode: '054' },
  { name: 'Buenos Aires', countryCode: '054' },
  { name: 'Catamarca', countryCode: '054' },
  { name: 'Chaco', countryCode: '054' },
  { name: 'Chubut', countryCode: '054' },
  { name: 'Córdoba', countryCode: '054' },
  { name: 'Corrientes', countryCode: '054' },
  { name: 'Entre Ríos', countryCode: '054' },
  { name: 'Formosa', countryCode: '054' },
  { name: 'Jujuy', countryCode: '054' },
  { name: 'La Pampa', countryCode: '054' },
  { name: 'La Rioja', countryCode: '054' },
  { name: 'Mendoza', countryCode: '054' },
  { name: 'Misiones', countryCode: '054' },
  { name: 'Neuquén', countryCode: '054' },
  { name: 'Río Negro', countryCode: '054' },
  { name: 'Salta', countryCode: '054' },
  { name: 'San Juan', countryCode: '054' },
  { name: 'San Luis', countryCode: '054' },
  { name: 'Santa Cruz', countryCode: '054' },
  { name: 'Santa Fe', countryCode: '054' },
  { name: 'Santiago del Estero', countryCode: '054' },
  { name: 'Tierra del Fuego', countryCode: '054' },
  { name: 'Tucumán', countryCode: '054' }
];

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const Province = mongoose.model('Province', new mongoose.Schema({
    name: { type: String, required: true, unique: true, trim: true },
    countryCode: { type: String, default: '054', required: true }
  }));

  const City = mongoose.model('City', new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    province: { type: mongoose.Schema.Types.ObjectId, ref: 'Province', required: true }
  }));

  await Province.deleteMany({});
  const inserted = await Province.insertMany(provinces);
  console.log('Inserted', inserted.length, 'provinces');

  const citiesByProvince = {
    'CABA': ['Agronomía','Almagro','Balvanera','Barracas','Belgrano','Boedo','Caballito','Chacarita','Coghlan','Colegiales','Constitución','Flores','Floresta','La Boca','Liniers','Mataderos','Monte Castro','Monserrat','Nueva Pompeya','Núñez','Palermo','Parque Avellaneda','Parque Chacabuco','Parque Chas','Parque Patricios','Puerto Madero','Recoleta','Retiro','Saavedra','San Cristóbal','San Nicolás','San Telmo','Vélez Sarsfield','Versalles','Villa Crespo','Villa del Parque','Villa Devoto','Villa General Mitre','Villa Lugano','Villa Luro','Villa Ortúzar','Villa Pueyrredón','Villa Real','Villa Riachuelo','Villa Santa Rita','Villa Soldati','Villa Urquiza'],
    'Buenos Aires': ['La Plata', 'Mar del Plata', 'Bahía Blanca', 'Tandil', 'Olavarría', 'Quilmes', 'Lomas de Zamora', 'Avellaneda', 'Lanús', 'General San Martín', 'Vicente López', 'La Matanza', 'Morón', 'Ituzaingó', 'Merlo', 'Moreno', 'Tres de Febrero', 'San Isidro', 'San Fernando', 'Tigre', 'Escobar', 'Pilar', 'José C. Paz', 'Malvinas Argentinas', 'Junín', 'Chivilcoy', 'Lobos', 'Cañuelas', 'Esteban Echeverría', 'Ezeiza'],
    'Córdoba': ['Córdoba', 'Villa Carlos Paz', 'Río Cuarto', 'Villa María', 'Villa Allende', 'Cosquín', 'Alta Gracia', 'Río Tercero', 'San Francisco', 'Villa General Belgrano', 'La Calera', 'Unquillo'],
    'Santa Fe': ['Rosario', 'Santa Fe', 'Rafaela', 'Venado Tuerto', 'Reconquista', 'Casilda', 'Villa Gobernador Gálvez', 'Sunchales', 'Cañada de Gómez', 'Funes', 'Pérez'],
    'Mendoza': ['Mendoza', 'San Rafael', 'Godoy Cruz', 'Guaymallén', 'Las Heras', 'Luján de Cuyo', 'Maipú', 'Tunuyán', 'San Martín', 'Villa Nueva'],
    'Tucumán': ['San Miguel de Tucumán', 'Concepción', 'Bella Vista', 'Tafí Viejo', 'Aguilares', 'Lules', 'Monteros', 'Simoca', 'Chicligasta'],
    'Salta': ['Salta', 'San Ramón de la Nueva Orán', 'Cafayate', 'Metán', 'Tartagal', 'Orán', 'Vaqueros'],
    'Entre Ríos': ['Paraná', 'Concordia', 'Gualeguaychú', 'Villaguay', 'Federal', 'Basavilbaso', 'Diamante', 'Victoria'],
    'Misiones': ['Posadas', 'Puerto Iguazú', 'Eldorado', 'Oberá', 'San Pedro', 'Leandro N. Alem', 'Apóstoles'],
    'Chaco': ['Resistencia', 'Presidencia Roque Sáenz Peña', 'Villa Ángela', 'Charata', 'Saenz Peña', 'Barranqueras'],
    'Corrientes': ['Corrientes', 'Goya', 'Mercedes', 'Curuzú Cuatiá', 'Esquina', 'Paso de los Libres', 'Monte Caseros'],
    'San Juan': ['San Juan', 'Rawson', 'Chimbas', 'Rivadavia', 'Santa Lucía', 'Caucete', 'Jáchal', 'San Agustín de Valle Fértil'],
    'Neuquén': ['Neuquén', 'San Martín de los Andes', 'Bariloche', 'Cutral Có', 'Plottier', 'Villa Regina', 'General Roca', 'Cipolletti'],
    'Chubut': ['Rawson', 'Comodoro Rivadavia', 'Trelew', 'Puerto Madryn', 'Esquel', 'Gaiman', 'Trelew'],
    'Río Negro': ['Viedma', 'General Roca', 'Bariloche', 'Cipolletti', 'Villa Regina', 'Choele Choel', 'El Bolsón'],
    'La Pampa': ['Santa Rosa', 'General Pico', '25 de Mayo', 'Victorica', 'Realicó', 'Macachín'],
    'Catamarca': ['San Fernando del Valle de Catamarca', 'Belén', 'Fiambalá', 'Tinogasta', 'Andalgalá', 'Chumbicha'],
    'Santiago del Estero': ['Santiago del Estero', 'La Banda', 'Termas de Río Hondo', 'Frías', 'Añatuya', 'Suncho Corral'],
    'Formosa': ['Formosa', 'Clorinda', 'Pirané', 'El Colorado', 'Las Lomitas', 'Ingeniero Juárez'],
    'Jujuy': ['San Salvador de Jujuy', 'San Pedro', 'La Quiaca', 'Humahuaca', 'Santa Catalina', 'Perico'],
    'San Luis': ['San Luis', 'Villa Mercedes', 'Villa de la Quebrada del Río Potrero', 'Concarán', 'Quines'],
    'La Rioja': ['La Rioja', 'Chilecito', 'Villa Unión', 'Chamical', 'Famatina'],
    'Santa Cruz': ['Río Gallegos', 'Caleta Olivia', 'El Calafate', 'Perito Moreno', 'Gobernador Gregores', 'Las Heras'],
    'Tierra del Fuego': ['Ushuaia', 'Río Grande', 'Tolhuin']
  };

  let cityCount = 0;
  for (const prov of inserted) {
    const cities = citiesByProvince[prov.name] || [];
    const cityDocs = cities.map(name => ({ name, province: prov._id }));
    if (cityDocs.length > 0) {
      await City.insertMany(cityDocs);
      cityCount += cityDocs.length;
    }
  }

  console.log('Inserted', cityCount, 'cities');
  console.log('Done');
  await mongoose.disconnect();
}

seed().catch(err => { console.error(err); process.exit(1); });
