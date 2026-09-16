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
  active: {
    type: Boolean,
    default: true,
    index: true
  }
}, { timestamps: true });

ProfessionSchema.index({ name: 1, active: 1 });
ProfessionSchema.index({ slug: 1, active: 1 });

module.exports = mongoose.model('Profession', ProfessionSchema);