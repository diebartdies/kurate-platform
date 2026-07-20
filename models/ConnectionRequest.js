const mongoose = require('mongoose');

const ConnectionRequestSchema = new mongoose.Schema({
  guestUser: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  professional: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'completed'],
    default: 'pending'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('ConnectionRequest', ConnectionRequestSchema);
