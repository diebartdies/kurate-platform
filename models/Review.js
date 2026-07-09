const mongoose = require('mongoose');

const ReviewSchema = new mongoose.Schema({
  text: {
    type: String,
    required: [true, 'Please add some text for your comment']
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    required: [true, 'Please provide a rating between 1 and 5']
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  professional: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  author: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  }
});

// Prevent user from submitting more than one review per professional
ReviewSchema.index({ professional: 1, author: 1 }, { unique: true });

module.exports = mongoose.model('Review', ReviewSchema);