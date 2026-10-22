const mongoose = require('mongoose');

const ProfessionSchema = new mongoose.Schema({
  slug: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true,
    lowercase: true
  },
  name: {
    type: String,
    required: true,
    index: true,
    trim: true
  },
  image: {
    type: String,
    default: ''
  },
  description: {
    type: String,
    default: ''
  },
  // Profesiones reguladas (gasista, electricista): exigen matricula
  // habilitante. El profesional declara si la tiene y, en ese caso, el
  // numero de matricula y/o la foto del titulo.
  regulated: {
    type: Boolean,
    default: false,
    index: true
  },
  active: {
    type: Boolean,
    default: true,
    index: true
  }
}, { timestamps: true });

ProfessionSchema.index({ name: 1, active: 1 });
ProfessionSchema.index({ slug: 1, active: true });
ProfessionSchema.index({ regulated: 1, active: 1 });

module.exports = mongoose.model('Profession', ProfessionSchema);