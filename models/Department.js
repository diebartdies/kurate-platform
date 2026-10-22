const mongoose = require('mongoose');

const DepartmentSchema = new mongoose.Schema({
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

DepartmentSchema.index({ province: 1, name: 1 });

module.exports = mongoose.model('Department', DepartmentSchema);