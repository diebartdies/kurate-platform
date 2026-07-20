const mongoose = require('mongoose');

const InterestNoteSchema = new mongoose.Schema({
  sourceLocale: {
    type: String,
    enum: ['es', 'en'],
    default: 'es'
  },
  titleEs: {
    type: String,
    trim: true,
    maxlength: 200
  },
  titleEn: {
    type: String,
    trim: true,
    maxlength: 200
  },
  bodyEs: {
    type: String,
    maxlength: 50000
  },
  bodyEn: {
    type: String,
    maxlength: 50000
  },
  // Legacy single-locale fields (migrated on read)
  title: {
    type: String,
    trim: true,
    maxlength: 200
  },
  body: {
    type: String,
    maxlength: 50000
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  published: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

InterestNoteSchema.index({ published: 1, sortOrder: 1, createdAt: -1 });

module.exports = mongoose.model('InterestNote', InterestNoteSchema);
