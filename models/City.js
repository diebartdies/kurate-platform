const mongoose = require('mongoose');

const CitySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  province: {
    type: mongoose.Schema.ObjectId,
    ref: 'Province',
    required: true
  }
});

module.exports = mongoose.model('City', CitySchema);