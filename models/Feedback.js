const mongoose = require('mongoose');

const FeedbackSchema = new mongoose.Schema({
  professional: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  customerEmail: {
    type: String,
    required: true
  },
  customerName: String,
  rating: {
    type: Number,
    min: 1,
    max: 5
  },
  comment: String,
  status: {
    type: String,
    enum: ['pending', 'sent', 'completed'],
    default: 'pending'
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  sentAt: Date,
  completedAt: Date,
  expiresAt: Date
});

FeedbackSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Feedback', FeedbackSchema);
