// Seed the `professions` collection with the 22 trades featured on the
// landing page /oficios grid. Idempotent: upserts by slug, disables any slug
// no longer present in this list.
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const Profession = require('../models/Profession');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/KuraTe';

// slug -> display name, matching /images/categorias/<slug>.webp
const PROFESSIONS = [
  { slug: 'albanil', name: 'Albañil' },
  { slug: 'carpintero', name: 'Carpintero' },
  { slug: 'cerrajero', name: 'Cerrajero' },
  { slug: 'colocador-cortinas-toldos', name: 'Colocador de cortinas y toldos' },
  { slug: 'colocador-durlock', name: 'Colocador de durlock' },
  { slug: 'electricista', name: 'Electricista' },
  { slug: 'fumigador', name: 'Fumigador' },
  { slug: 'gasista', name: 'Gasista' },
  { slug: 'herrero', name: 'Herrero' },
  { slug: 'instalador-aire-acondicionado', name: 'Instalador de aire acondicionado' },
  { slug: 'instalador-camaras-seguridad', name: 'Instalador de cámaras de seguridad' },
  { slug: 'mudanzas-fletes', name: 'Mudanzas y fletes' },
  { slug: 'pintor', name: 'Pintor' },
  { slug: 'plomero', name: 'Plomero' },
  { slug: 'repartidor-de-agua', name: 'Repartidor de Agua' },
  { slug: 'tapicero', name: 'Tapicero' },
  { slug: 'techista', name: 'Techista' },
  { slug: 'tecnico-calderas', name: 'Técnico de calderas' },
  { slug: 'tecnico-generadores', name: 'Técnico de generadores' },
  { slug: 'tecnico-heladeras', name: 'Técnico en heladeras y lavarropas' },
  { slug: 'vidriero', name: 'Vidriero' },
  { slug: 'yesero', name: 'Yesero' }
];

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const expected = new Set(PROFESSIONS.map(p => p.slug));

  for (const p of PROFESSIONS) {
    await Profession.updateOne(
      { slug: p.slug },
      {
        $set: {
          name: p.name,
          image: `/images/categorias/${p.slug}.webp`,
          active: true
        }
      },
      { upsert: true }
    );
    console.log(`  upserted ${p.slug} -> ${p.name}`);
  }

  const deactivated = await Profession.updateMany(
    { active: true, slug: { $nin: [...expected] } },
    { $set: { active: false } }
  );
  console.log(`Deactivated ${deactivated.modifiedCount} removed professions`);

  const total = await Profession.countDocuments({ active: true });
  console.log(`Active professions: ${total}`);

  await mongoose.disconnect();
  console.log('Done');
}

seed().catch(err => { console.error(err); process.exit(1); });