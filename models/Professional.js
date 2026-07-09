const mongoose = require('mongoose');

const ProfessionalSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  alias: {
    type: String,
    required: [true, 'Please add an alias'],
    unique: true,
    trim: true,
    maxlength: [50, 'Alias cannot be more than 50 characters']
  },
  bio: {
    type: String,
    required: [true, 'Please add a bio'],
    maxlength: [500, 'Bio cannot be more than 500 characters']
  },
  province: {
    type: String,
    required: [true, 'Please select a province']
  },
  isVerified: {
    type: Boolean,
    default: false // Requires admin approval to show up on the site
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Professional', ProfessionalSchema);