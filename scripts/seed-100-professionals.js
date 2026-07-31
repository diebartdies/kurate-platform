const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const User = require('../models/User');
const Feedback = require('../models/Feedback');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/KuraTe';

const provinces = [
  { name: 'CABA', cities: ['Palermo','Belgrano','Caballito','Flores','San Telmo','Retiro','Almagro','Barracas','La Boca','Villa Crespo','Floresta','Boedo','Chacarita','Núñez','Monserrat','Recoleta','Liniers','Mataderos','Parque Patricios','Puerto Madero','San Nicolás','Villa Urquiza','Villa Devoto','Villa Lugano','Villa Soldati','Saavedra','Coghlan','Colegiales','Parque Chacabuco','Villa del Parque','Villa General Mitre','Villa Riachuelo','Villa Santa Rita','Villa Real','Villa Ortúzar','Villa Pueyrredón','Nueva Pompeya','Constitución','San Cristóbal','Balvanera','Vélez Sarsfield','Versalles','Parque Avellaneda','Parque Chas','Monte Castro'] },
  { name: 'Buenos Aires', cities: ['La Plata','Mar del Plata','Bahía Blanca','Tandil','Olavarría','Quilmes','Lomas de Zamora','Avellaneda','Lanús','General San Martín','Vicente López','La Matanza','Morón','Merlo','Moreno','Tres de Febrero','San Isidro','San Fernando','Tigre','Escobar','Pilar','Junín','Chivilcoy','Lobos','Cañuelas'] },
  { name: 'Córdoba', cities: ['Córdoba','Villa Carlos Paz','Río Cuarto','Villa María','Villa Allende','Cosquín','Alta Gracia','Río Tercero','San Francisco','La Calera'] },
  { name: 'Santa Fe', cities: ['Rosario','Santa Fe','Rafaela','Venado Tuerto','Reconquista','Casilda','Sunchales','Funes'] },
  { name: 'Mendoza', cities: ['Mendoza','San Rafael','Godoy Cruz','Guaymallén','Las Heras','Luján de Cuyo','Maipú'] },
  { name: 'Tucumán', cities: ['San Miguel de Tucumán','Concepción','Bella Vista','Tafí Viejo','Lules'] },
  { name: 'Salta', cities: ['Salta','San Ramón de la Nueva Orán','Cafayete','Metán'] },
  { name: 'Entre Ríos', cities: ['Paraná','Concordia','Gualeguaychú','Villaguay','Diamante'] },
  { name: 'Misiones', cities: ['Posadas','Puerto Iguazú','Eldorado','Oberá','San Pedro'] },
  { name: 'Chaco', cities: ['Resistencia','Presidencia Roque Sáenz Peña','Villa Ángela','Charata'] },
  { name: 'Corrientes', cities: ['Corrientes','Goya','Mercedes','Curuzú Cuatiá'] },
  { name: 'San Juan', cities: ['San Juan','Rawson','Chimbas','Rivadavia','Caucete'] },
  { name: 'Neuquén', cities: ['Neuquén','San Martín de los Andes','Bariloche','Cutral Có','Plottier'] },
  { name: 'Chubut', cities: ['Rawson','Comodoro Rivadavia','Trelew','Puerto Madryn','Esquel'] },
  { name: 'Río Negro', cities: ['Viedma','General Roca','Bariloche','Cipolletti','El Bolsón'] },
  { name: 'La Pampa', cities: ['Santa Rosa','General Pico','25 de Mayo'] },
  { name: 'Catamarca', cities: ['San Fernando del Valle de Catamarca','Belén','Fiambalá'] },
  { name: 'Santiago del Estero', cities: ['Santiago del Estero','La Banda','Termas de Río Hondo','Frías'] },
  { name: 'Formosa', cities: ['Formosa','Clorinda','Pirané'] },
  { name: 'Jujuy', cities: ['San Salvador de Jujuy','San Pedro','La Quiaca','Humahuaca'] },
  { name: 'San Luis', cities: ['San Luis','Villa Mercedes','Concarán'] },
  { name: 'La Rioja', cities: ['La Rioja','Chilecito','Villa Unión'] },
  { name: 'Santa Cruz', cities: ['Río Gallegos','Caleta Olivia','El Calafate'] },
  { name: 'Tierra del Fuego', cities: ['Ushuaia','Río Grande','Tolhuin'] }
];

const areas = {
  'hogar': {
    'categories': {
      'linea-blanca': ['heladera','freezer','lavarropas','secarropas','lavavajillas','cocina','horno','microondas','campana','camara-frio','extractor','calefactor','aire-split','aire-ventana','desumidificador'],
      'electrohogar': ['aspiradora','plancha','batidora','procesadora','cafetera','tostadora','licuadora','secador-pelo','plancha-cabello','depiladora'],
      'electricidad': ['tablero','instalacion','cableado','interruptor','llave-termica','disyuntor','iluminacion','led','persiana-electrica'],
      'gas': ['termotanque','caldera','estufa-gas','calefont','horno-gas','ran-gas'],
      'plomeria': ['caneria','griferia','inodoro','bidet','lavabo','ducha','valvula','cisterna','tapa-canon']
    }
  },
  'oficina': {
    'categories': {
      'informatica': ['computadora','notebook','monitor','impresora','scanner','servidor','ups','cableado-red','switch','router','firewall'],
      'clima': ['aire-split','aire-central','ventilador','humidificador','purificador-aire'],
      'seguridad': ['camaras','alarma','caja-fuerte','cerradura-electrica','control-acceso'],
      'electrohogar': ['cafetera','microondas','refrigerador','dispensador-agua']
    }
  },
  'industria': {
    'categories': {
      'automatizacion': ['plc','variador','tablero-ind','sensor','actuador','hmi','scada'],
      'electromecanica': ['motor','transformador','generador','bomba','compresor','ventilador-ind'],
      'refrigeracion-ind': ['camara-frio','chiller','compresor-ind','condensador','evaporador'],
      'soldadura': ['soldadora','corte-plasma','oxicorte','torno','fresadora']
    }
  },
  'campo': {
    'categories': {
      'agricola': ['tractor','cosechadora','sembradora','pulverizadora','cisterna','acarreadora'],
      'ganaderia': ['ordeñadora','bebedero','boyero','manga','corral','balanza'],
      'energia': ['panel-solar','inversor','bateria','generador','bomba-solar','molino-viento'],
      'riego': ['pivote','bomba-sumergible','goteo','aspersion','caneria-campo']
    }
  }
};

const brandsByDevice = {
  'heladera': ['Samsung','LG','Whirlpool','Gafa','Carrier','Drean','Ferguson','Coldex','Indurama','Mabe'],
  'freezer': ['Friginox','Talin','Williams','Iccold','Refrisat'],
  'lavarropas': ['Samsung','LG','Drean','Gafa','Whirlpool','Bosch','Indesit','Candy','Electrolux','Fool'],
  'secarropas': ['Drean','Samsung','LG','Gafa','Mabe'],
  'lavavajillas': ['Bosch','Electrolux','Whirlpool','Frigelar','Indesit'],
  'cocina': ['Whirlpool','Electrolux','Glorex','BGH','Florencia','Ariston','Teka','Knox','Gaga'],
  'horno': ['Electrolux','Bosch','Whirlpool','Glorex','Florencia','Ariston','Teka'],
  'microondas': ['Samsung','LG','Whirlpool','BGH','Peabody','Oster','Philco','Daewoo','Sanyo'],
  'campana': ['Electrolux','BGH','Teka','Neff','Faber','Mora'],
  'aire-split': ['Samsung','LG','Carrier','Midea','BGH','Daikin','Hitachi','Trane','Fujitsu','Panasonic'],
  'aire-central': ['Carrier','Trane','Daikin','York','McQuay','Johnson Controls'],
  'aire-ventana': ['Window','BGH','Carrier','Midea','LG'],
  'termotanque': ['Rheem','Owen','Electricrol','Florencia','Escorial','Siam Di Tella','Huiro'],
  'caldera': ['Ferroli','Baxi','Ariston','Viessmann','Immergas','Rinnai'],
  'estufa-gas': ['Frigol','Florencia','Electrolux','BGH','Delonghi'],
  'aspiradora': ['Dyson','Samsung','LG','Electrolux','Miele','Philips','Black+Decker','Bosch','Karcher'],
  'computadora': ['Dell','HP','Lenovo','Apple','Asus','Acer','MSI','Gigabyte'],
  'notebook': ['Dell','HP','Lenovo','Apple','Asus','Acer','MSI','Samsung','Huawei'],
  'monitor': ['Samsung','LG','Dell','HP','Asus','BenQ','AOC','Philips','ViewSonic'],
  'impresora': ['HP','Canon','Epson','Brother','Samsung','Xerox','Lexmark'],
  'servidor': ['Dell','HP','Lenovo','Supermicro','IBM'],
  'plc': ['Siemens','Allen Bradley','Schneider','Mitsubishi','Omron','Fanuc','ABB','WEG'],
  'variador': ['Siemens','ABB','Schneider','WEG','Danfoss','Allen Bradley','Mitsubishi'],
  'motor': ['WEG','Siemens','ABB','Schneider','Lorenzetti','Lester','Jeumont','AEG'],
  'transformador': ['Schneider','ABB','Siemens','Legrand','Gallagher'],
  'generador': ['Caterpillar','Cummins','SDMO','Pramac','Atlas Copco','Inmesol'],
  'bomba': ['Grundfos','KSB','Lowara','Pedrollo','Espa','Feposes','Andritz'],
  'compresor': ['Atlas Copco','Ingersoll Rand','Sullair','Kaeser','CompAir','Danfoss'],
  'camara-frio': ['Danfoss','Carrier','Embraco','Tecum','Bitzer','Fricon'],
  'chiller': ['Carrier','Trane','Daikin','McQuay','York','Midea'],
  'soldadora': ['Lincoln','Miller','ESAB','Fany','Wurth','Trumpf','Hypertherm'],
  'tractor': ['John Deere','New Holland','Massey Ferguson','Valtra','Case IH','Fendt','Czerweny'],
  'cosechadora': ['John Deere','New Holland','Massey Ferguson','Case IH','Gleaner'],
  'panel-solar': ['Canadian Solar','Jinko','Trina','JA Solar','LG','SunPower','BenQ','Enertik'],
  'inversor': ['Victron','Fronius','SMA','Huawei','Growatt','Solis','Goodwe'],
  'bomba-sumergible': ['Grundfos','Pedrollo','Feposes','Espa','Lowara'],
  'router': ['Ubiquiti','Mikrotik','TP-Link','Cisco','Fortinet','D-Link','Netgear','Aruba'],
  'switch': ['Ubiquiti','Mikrotik','Cisco','HP','Juniper','D-Link','Netgear','TP-Link'],
  'camaras': ['Hikvision','Dahua','Axis','Samsung','Bosch','Pelco','Uniview'],
  'ups': ['APC','Eaton','CyberPower','Tripp Lite','Furman','Schneider'],
  'cableado': ['Panduit','Belden','Commscope','Nexans','Legrand','Molex']
};

const firstNames = ['Carlos','María','Juan','Ana','Pedro','Lucía','Jorge','Sofía','Luis','Valentina','Martín','Camila','Diego','Martina','Pablo','Isabella','Andrés','Mía','Gabriel','Victoria','Roberto','Catalina','Fernando','Luciana','Eduardo','Daniela','Ricardo','Paula','Sergio','Juliana','Alejandro','Florencia','Raúl','Natalia','Gustavo','Carolina','Oscar','Patricia','Miguel','Laura','Felipe','Andrea','Nicolás','Romina','Tomás','Julieta','Mateo','Bárbara','Sebastián','Teresa','Emiliano','Graciela','Adrián','Silvia','Leandro','Claudia','Hernán','Vanessa','Bruno','Lucía'];

const lastNames = ['García','López','Martínez','Rodríguez','Fernández','Álvarez','Morales','Romero','Torres','Gutiérrez','Ruiz','Díaz','Herrera','Moreno','Castro','Vargas','Medina','Jiménez','Aguilar','Pérez','Sanchez','Ramírez','Flores','Ortega','Rivera','Gómez','Acosta','Miranda','Córdoba','Vega','Ríos','Molina','Navarro','Suárez','Rossi','Peralta','Mendoza','Arias','Campos','Reyes','Cruz','Guzmán','Peña','Rojas','Salazar','Vera','Campos','Fuentes','Carrizo','Silva'];

const bios = [
  'Más de 15 años de experiencia. Trabajo con repuestos originales y garantía escrita.',
  'Especialista certificado. Presupuesto sin cargo. Atención en el día.',
  'Técnico matriculado. Reparación y mantenimiento preventivo. Zona de cobertura amplia.',
  'Servicio técnico oficial de múltiples marcas. Repuestos genuinos disponibles.',
  'Profesional independiente. Trabajo limpio y prolijo. Referencias disponibles.',
  'Empresa familiar desde 1995. Calidad y confianza garantizada.',
  'Especializado en equipos de última generación. Diagnóstico gratuito.',
  'Servicio de emergencia las 24 horas. Costos transparentes.',
  'Técnico biomédico. Certificación en equipos médicos y de laboratorio.',
  'Instalación y puesta en marcha de equipos industriales. Turnos coordinados.',
  'Mantenimiento preventivo y correctivo. Contratos mensuales disponibles.',
  'Especialista en eficiencia energética. Optimizo el consumo de sus equipos.',
  'Reparación de electrodomésticos de todas las marcas. Garantía de 6 meses.',
  'Técnico en climatización. Soluciones para hogar y comercio.',
  'Experto en redes e infraestructura de TI. Certificaciones internacionales.'
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function generateProfessionals(count) {
  const result = [];
  const usedPhones = new Set();

  for (let i = 0; i < count; i++) {
    const areaKey = pick(Object.keys(areas));
    const catKey = pick(Object.keys(areas[areaKey].categories));
    const device = pick(areas[areaKey].categories[catKey]);
    const deviceBrands = brandsByDevice[device] || ['Genérica'];
    const numBrands = Math.min(randInt(2, 5), deviceBrands.length);
    const selectedBrands = [];
    const brandsCopy = [...deviceBrands];
    for (let b = 0; b < numBrands; b++) {
      const idx = Math.floor(Math.random() * brandsCopy.length);
      selectedBrands.push(brandsCopy.splice(idx, 1)[0]);
    }

    const prov = pick(provinces);
    const city = pick(prov.cities);
    const firstName = pick(firstNames);
    const lastName = pick(lastNames);
    const fullName = `${firstName} ${lastName}`;

    let phone;
    do {
      const prefix = ['11','221','223','261','264','291','341','351','381','387','388','420','426','478','525','549'][Math.floor(Math.random()*16)];
      const num = String(randInt(40000000,59999999));
      phone = `549${prefix}${num}`;
    } while (usedPhones.has(phone));
    usedPhones.add(phone);

    const exp = randInt(2, 30);
    const ratingCount = randInt(3, 50);
    const ratingAvg = (randInt(35, 50) / 10).toFixed(1);

    const secondDevice = pick(areas[areaKey].categories[catKey]);
    const devices = [device];
    if (secondDevice !== device) devices.push(secondDevice);

    const actions = ['Reparo','Instalo','Hago mantenimiento','Vendo repuestos','Asesoro'];
    const action = pick(actions);

    const availOptions = ['inmediata','rapida','puedo_esperar','sin_apuro'];
    const availability = pick(availOptions);

    result.push({
      full_name: fullName,
      headline: `${catKey.replace(/-/g, ' ')} - ${device.replace(/-/g, ' ')}`,
      bio: pick(bios),
      phone,
      province: prov.name,
      city,
      areas: [areaKey],
      devices,
      brands: selectedBrands,
      years_experience: exp,
      verified: Math.random() > 0.2,
      available_now: Math.random() > 0.3,
      rating_avg: parseFloat(ratingAvg),
      rating_count: ratingCount,
      action,
      availability
    });
  }
  return result;
}

function slugify(s) { return s.toLowerCase().replace(/\s+/g, '-'); }

function buildServicePath(area, device, brand) {
  return `${area}/linea-blanca/${slugify(device)}/${slugify(brand)}`;
}

function buildDevicePath(area, device) {
  return `${area}/linea-blanca/${slugify(device)}`;
}

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const professionals = generateProfessionals(100);
  let created = 0;
  let updated = 0;

  for (const pro of professionals) {
    const [firstName, ...lastParts] = pro.full_name.split(' ');
    const lastName = lastParts.join(' ') || '';
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/\s+/g, '')}-${randInt(100,999)}@kurate-demo.com`;
    const alias = pro.full_name;

    let user = await User.findOne({ phone: pro.phone });
    if (!user) user = await User.findOne({ email });

    const svcPaths = [];
    const hogarSvcObjs = [];
    for (const area of pro.areas) {
      for (const device of pro.devices) {
        for (const brand of pro.brands) {
          const p = buildServicePath(area, device, brand);
          svcPaths.push(p);
          hogarSvcObjs.push({ path: p, name: `${device} ${brand}`, brands: [brand] });
        }
      }
    }

    const profileData = {
      alias,
      bio: pro.bio,
      services: svcPaths,
      photos: [],
      whatsappNumber: pro.phone,
      location: { province: pro.province, city: pro.city },
      workingHours: { start: '08:00', end: '18:00' },
      workingDays: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
      isExposed: true,
      verificationStatus: pro.verified ? 'approved' : 'pending',
      quality: 'Standard'
    };

    if (user) {
      const isHogar = pro.areas.includes('hogar');
      if (isHogar) {
        user.hogarProfile = user.hogarProfile || {};
        user.hogarProfile.firstName = firstName;
        user.hogarProfile.lastName = lastName;
        user.hogarProfile.bio = pro.bio;
        user.hogarProfile.services = hogarSvcObjs;
        user.hogarProfile.photos = [];
        user.hogarProfile.availability = pro.availability;
        user.hogarProfile.area = pro.areas[0];
        user.hogarProfile.action = pro.action;
        user.hogarProfile.address = { province: pro.province, city: pro.city };
        user.hogarProfile.contact = { phone: pro.phone, whatsapp: true, mobilePhone: pro.phone };
      }
      user.professionalProfile.alias = alias;
      user.professionalProfile.bio = pro.bio;
      user.professionalProfile.services = svcPaths;
      user.professionalProfile.photos = [];
      user.professionalProfile.whatsappNumber = pro.phone;
      user.professionalProfile.location = { province: pro.province, city: pro.city };
      user.professionalProfile.workingHours = { start: '08:00', end: '18:00' };
      user.professionalProfile.workingDays = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      user.professionalProfile.isExposed = true;
      user.professionalProfile.verificationStatus = pro.verified ? 'approved' : 'pending';
      user.professionalProfile.quality = 'Standard';
      user.role = 'professional';
      user.accountDeletedAt = null;
      user.verificationStatus = pro.verified ? 'approved' : 'pending';
      user.isVerified = true;
      user.professionalType = 'hogar';
      await user.save();
      updated++;
    } else {
      user = await User.create({
        email,
        password: 'kurate-demo-2026',
        name: pro.full_name,
        phone: pro.phone,
        role: 'professional',
        professionalProfile: profileData,
        hogarProfile: pro.areas.includes('hogar') ? {
          firstName,
          lastName,
          bio: pro.bio,
          services: hogarSvcObjs,
          photos: [],
          availability: pro.availability,
          area: pro.areas[0],
          action: pro.action,
          address: { province: pro.province, city: pro.city },
          contact: { phone: pro.phone, whatsapp: true, mobilePhone: pro.phone }
        } : undefined,
        emailVerified: true,
        accountDeletedAt: null,
        verificationStatus: pro.verified ? 'approved' : 'pending',
        isVerified: true,
        professionalType: 'hogar'
      });
      created++;
    }

    if (pro.rating_count > 0) {
      await Feedback.deleteMany({ professional: user._id });
      const feedbackDocs = [];
      const fullStars = Math.floor(pro.rating_avg);
      const halfStar = pro.rating_avg % 1 >= 0.5;
      for (let i = 0; i < pro.rating_count; i++) {
        let rating;
        if (i < Math.floor(pro.rating_count * 0.7)) rating = fullStars;
        else if (halfStar && i === Math.floor(pro.rating_count * 0.7)) rating = fullStars + 1;
        else rating = Math.max(1, fullStars - 1);
        rating = Math.min(5, Math.max(1, rating));
        feedbackDocs.push({
          professional: user._id,
          author: new mongoose.Types.ObjectId(),
          customerEmail: `client${i+1}-${randInt(100,999)}@demo.com`,
          rating,
          comment: `Demo feedback ${i+1}`,
          status: 'completed',
          createdAt: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000)
        });
      }
      await Feedback.insertMany(feedbackDocs);
    }
  }

  console.log(`\nDone: ${created} created, ${updated} updated`);
  console.log(`Total professionals: ${await User.countDocuments({ role: 'professional', accountDeletedAt: null })}`);
  await mongoose.disconnect();
}

seed().catch(err => { console.error(err); process.exit(1); });
