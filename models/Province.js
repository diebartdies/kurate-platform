const mongoose = require('mongoose');

const ProvinceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  countryCode: {
    type: String,
    default: '054',
    required: true
  }
});

module.exports = mongoose.model('Province', ProvinceSchema);