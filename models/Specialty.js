const mongoose = require('mongoose');

const SpecialtySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  specialty: {
    type: String,
    enum: ['Love Alchemy', 'Massage', 'Virtual Connection', 'Media Content', 'Streaming Kisses'],
    required: true,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Ensure a user cannot have the exact same specialty duplicated in this table
SpecialtySchema.index({ user: 1, specialty: 1 }, { unique: true });

module.exports = mongoose.model('Specialty', SpecialtySchema);