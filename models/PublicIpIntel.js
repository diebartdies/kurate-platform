const mongoose = require('mongoose');

const PublicIpIntelSchema = new mongoose.Schema({
  ip: { type: String, required: true, unique: true, index: true },
  status: { type: String },
  lookupError: { type: String },
  continent: { type: String },
  continentCode: { type: String },
  country: { type: String },
  countryCode: { type: String },
  region: { type: String },
  regionName: { type: String },
  city: { type: String },
  district: { type: String },
  zip: { type: String },
  lat: { type: Number },
  lon: { type: Number },
  timezone: { type: String },
  offset: { type: Number },
  currency: { type: String },
  isp: { type: String },
  org: { type: String },
  as: { type: String },
  asname: { type: String },
  reverse: { type: String },
  mobile: { type: Boolean },
  proxy: { type: Boolean },
  hosting: { type: Boolean },
  provider: { type: String, default: 'ip-api.com' },
  raw: { type: mongoose.Schema.Types.Mixed },
  lookupCount: { type: Number, default: 1 },
  firstSeenAt: { type: Date, default: Date.now },
  lastLookupAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PublicIpIntel', PublicIpIntelSchema);
