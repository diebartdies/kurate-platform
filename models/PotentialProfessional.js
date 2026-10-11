const mongoose = require('mongoose');

const PotentialProfessionalSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true, trim: true },
  alias: { type: String, trim: true },

  // Oficio del lead. El padron de gasistas es 'gasista', pero la coleccion
  // tambien recibe padrones de otros oficios, asi que no se hardcodea. Se usa
  // para que la comunicacion no sea siempre el mismo texto para todos.
  profession: { type: String, trim: true, lowercase: true },

  // --- Padron de matriculados (gasistas) -------------------------------
  // Importado desde un padron de asociacion: NO son cuentas de KuraTe, no
  // tienen password y no se publican. Quedan aca como contacto potential y
  // solo pasa a `users` cuando la persona se registra y acepta.
  //
  // Razon de vivir en esta coleccion y no en `users`:
  //   - `users.email` es required + unique y aca hay emails compartidos
  //     (familia / empresa), que es comun en un padron.
  //   - `users.password` es required: un padron no puede implicar credenciales.
  //   - Esta coleccion no la lee ningun endpoint publico, asi que cargar el
  //     padron no publica direccion ni telefono de terceros.
  name: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  address: { type: String, trim: true },
  locality: { type: String, trim: true },
  postalCode: { type: String, trim: true },
  matricula: { type: String, trim: true },
  category: { type: String, trim: true },

  // El padron trae varias celdas con mas de un telefono ("1142... 1135...").
  // `phone` es la clave required+unique: guarda el primero ya normalizado.
  phones: { type: [String], default: [] },
  phoneRaw: { type: String, trim: true },
  /** Procedencia del registro, para poder revertir oauditar un lote. */
  fuente: { type: String, trim: true },
  importBatch: { type: String, trim: true, index: true },
  sourceUrl: { type: String, trim: true },
  status: {
    type: String,
    enum: ['pending', 'contacted', 'joined', 'rejected', 'failed'],
    default: 'pending'
  },
  whatsappSentAt: { type: Date },
  whatsappError: { type: String, trim: true },
  whatsappMessageId: { type: String, trim: true },
  smsStatus: {
    type: String,
    enum: ['pending', 'sent', 'failed'],
    default: 'pending'
  },
  smsSentAt: { type: Date },
  smsError: { type: String, trim: true },
  smsSid: { type: String, trim: true },
  telegramStatus: {
    type: String,
    enum: ['pending', 'sent', 'failed', 'blocked'],
    default: 'pending'
  },
  telegramSentAt: { type: Date },
  telegramError: { type: String, trim: true },

  // Outreach por mail. Mismo esquema que smsStatus/telegramStatus para que el
  // admin vea el estado junto a los otros canales.
  // El padron se importa con doNotContact=true y SIN tocar esto: queda
  // 'pending', pero el envio lo bloquea igual, porque la guarda real es
  // doNotContact y no este campo.
  emailStatus: {
    type: String,
    enum: ['pending', 'sent', 'failed'],
    default: 'pending'
  },
  emailSentAt: { type: Date },
  emailError: { type: String, trim: true },
  emailSubject: { type: String, trim: true },

  doNotContact: { type: Boolean, default: false },
  doNotContactReason: { type: String, trim: true },
  doNotContactAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

// El importador corre en dry-run y es idempotente: antes de insertar busca por
// (fuente, matricula), que es la clave natural del padron.
PotentialProfessionalSchema.index({ fuente: 1, matricula: 1 });

// Indices para la lectura paginada del admin (getPotentialProfessionals). Sin
// estos, cada pagina hace un sort en memoria de toda la coleccion + countDocuments
// full-scan; con ~1700 filas se nota y crece mal.
// El primero cubre la pagina sin filtros; los siguientes los filtros por estado
// y por bloqueo (padron), que comparten el mismo orden de paginacion.
PotentialProfessionalSchema.index({ createdAt: -1, matricula: 1, _id: 1 });
PotentialProfessionalSchema.index({ status: 1, createdAt: -1, matricula: 1, _id: 1 });
PotentialProfessionalSchema.index({ doNotContact: 1, status: 1, createdAt: -1, matricula: 1, _id: 1 });

// blockPhone busca por numero normalizado.
PotentialProfessionalSchema.index({ phone: 1 });

module.exports = mongoose.model('PotentialProfessional', PotentialProfessionalSchema, 'potential_professionals');
