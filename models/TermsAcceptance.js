const mongoose = require('mongoose');

// Audit log of every age-verification + Terms & Conditions acceptance.
// One document is written each time a visitor or account accepts the terms
// (from the age gate or at professional registration). This satisfies the
// "saved in our database" requirement for anonymous visitors, who are
// identified by a stable client-generated UUID kept in their browser's
// localStorage. Logged-in acceptances also stamp the User record itself.
const TermsAcceptanceSchema = new mongoose.Schema({
  // Stable per-browser identifier (UUID) generated client-side and persisted
  // in localStorage so repeat acceptances from the same browser are linkable.
  clientId: {
    type: String,
    index: true
  },
  // Present when the acceptor was authenticated at acceptance time.
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    default: null
  },
  termsVersion: {
    type: String,
    required: true
  },
  // Where the acceptance happened.
  source: {
    type: String,
    enum: ['age-gate', 'registration'],
    default: 'age-gate'
  },
  ip: String,
  userAgent: String,
  acceptedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('TermsAcceptance', TermsAcceptanceSchema);
