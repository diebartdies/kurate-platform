// Seed the `professions` collection: los oficios que un profesional o empresa
// marca como idoneos. Es la dimension "que hace", complementaria al arbol de
// servicios (que dispositivo/desea trabajar).
//
// Idempotente: upsert por slug, desactiva los slugs que ya no estan en la lista.
//
//   node scripts/seed-professions.js
//
// Las profesiones reguladas (regulated: true) exigen matricula habilitante:
// el profesional declara si la tiene y, en ese caso, numero de matricula
// y/o foto del titulo, para darle veracidad al anuncio.
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const Profession = require('../models/Profession');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/KuraTe';

// slug -> { nombre, regulada, imagen }
// regulada: la ley exige matricula habilitante para ejercerla
const PROFESSIONS = [
  { slug: 'tecnico-heladeras', name: 'Técnico en heladeras y lavarropas' },
  { slug: 'instalador-aire-acondicionado', name: 'Instalador de aire acondicionado' },
  { slug: 'tecnico-calderas', name: 'Técnico de calderas' },
  { slug: 'tecnico-generadores', name: 'Técnico de generadores' },
  { slug: 'techista', name: 'Techista' },
  { slug: 'gasista', name: 'Gasista', regulated: true },
  { slug: 'electricista', name: 'Electricista', regulated: true },
  { slug: 'plomero', name: 'Plomero' },
  { slug: 'instalador-camaras-seguridad', name: 'Instalador de cámaras de seguridad' },
  { slug: 'albanil', name: 'Albañil' },
  { slug: 'yesero', name: 'Yesero' },
  { slug: 'pintor', name: 'Pintor' },
  { slug: 'carpintero', name: 'Carpintero' },
  { slug: 'herrero', name: 'Herrero' },
  { slug: 'cerrajero', name: 'Cerrajero' },
  { slug: 'colocador-durlock', name: 'Colocador de durlock' },
  { slug: 'colocador-cortinas-toldos', name: 'Colocador de cortinas y toldos' },
  { slug: 'vidriero', name: 'Vidriero' },
  { slug: 'tapicero', name: 'Tapicero' },
  { slug: 'fumigador', name: 'Fumigador' },
  { slug: 'mudanzas-fletes', name: 'Mudanzas y fletes' },
  { slug: 'repartidor-de-agua', name: 'Repartidor de Agua' },
  // --- Ensenanza (accion "Educar") ------------------------------------------------
  // regulada: false. Enseñar no exige matricula habilitante en Argentina: la
  // habilitacion depende de cada jurisdiccion y nivel, asi que se deja en false
  // y el profesional declara su titulo en el perfil.
  { slug: 'docente-primaria', name: 'Docente de Primaria' },
  { slug: 'docente-secundaria', name: 'Docente de Secundaria' },
  { slug: 'docente-universitario', name: 'Docente Universitario' },
  { slug: 'profesor-matematicas', name: 'Profesor de Matemáticas' },
  { slug: 'profesor-fisica-quimica', name: 'Profesor de Física y Química' },
  { slug: 'profesor-biologia-ciencias', name: 'Profesor de Biología y Ciencias Naturales' },
  { slug: 'profesor-lengua-literatura', name: 'Profesor de Lengua y Literatura' },
  { slug: 'profesor-ingles', name: 'Profesor de Inglés' },
  { slug: 'profesor-historia-geografia', name: 'Profesor de Historia y Geografía' },
  { slug: 'profesor-educacion-etica', name: 'Profesor de Formación Ética y Ciudadana' }
];

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const expected = new Set(PROFESSIONS.map((p) => p.slug));

  for (const p of PROFESSIONS) {
    await Profession.updateOne(
      { slug: p.slug },
      {
        $set: {
          name: p.name,
          image: p.image || '',
          regulated: !!p.regulated,
          active: true
        }
      },
      { upsert: true }
    );
    console.log(`  upserted ${p.slug} -> ${p.name}${p.regulated ? ' (regulada)' : ''}`);
  }

  const deactivated = await Profession.updateMany(
    { active: true, slug: { $nin: [...expected] } },
    { $set: { active: false } }
  );
  console.log(`Deactivated ${deactivated.modifiedCount} removed professions`);

  const total = await Profession.countDocuments({ active: true });
  const reguladas = await Profession.find({ active: true, regulated: true }).select('slug name').lean();
  console.log(`Active professions: ${total}`);
  console.log(`Reguladas (requieren matricula): ${reguladas.map((r) => r.name).join(', ') || 'ninguna'}`);

  await mongoose.disconnect();
  console.log('Done');
}

seed().catch((err) => { console.error(err); process.exit(1); });
