const mongoose = require('mongoose');

const ServiceSchema = new mongoose.Schema({
  area: { type: String, required: true, index: true },
  category: { type: String, required: true },
  device: { type: String, required: true },
  brands: [{ type: String }],
  path: { type: String, required: true, unique: true, index: true }
}, { timestamps: true });

ServiceSchema.index({ area: 1, category: 1, device: 1 });

module.exports = mongoose.model('Service', ServiceSchema);
