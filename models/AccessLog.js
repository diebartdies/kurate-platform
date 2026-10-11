const mongoose = require('mongoose');

const accessLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  email: String,
  action: String,
  ip: String,
  userAgent: String,
  path: String,
  method: String,
  status: Number,
  duration: Number,
  timestamp: { type: Date, default: Date.now }
});

accessLogSchema.index({ timestamp: -1 });
// TTL de 7 días: el middleware escribe un doc por request (incluyendo bots y
// polls del admin). Sin retención acotada la colección crece sin límite y Mongo
// paga cada count/find con un scan peor.
accessLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });
accessLogSchema.index({ user: 1, timestamp: -1 });
accessLogSchema.index({ action: 1 });

module.exports = mongoose.model('AccessLog', accessLogSchema);
