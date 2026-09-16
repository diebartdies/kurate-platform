const mongoose = require('mongoose');

const AvisoSchema = new mongoose.Schema({
  professional: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'Professional is required'],
    index: true
  },
  environment: {
    type: String,
    enum: ['hogar', 'oficina', 'pime', 'industria'],
    required: [true, 'Environment is required'],
    index: true
  },
  serviceLine: {
    type: String,
    required: [true, 'Service line is required'],
    index: true
  },
  serviceLineName: {
    type: String,
    default: ''
  },
  text: {
    type: String,
    maxlength: 1000,
    default: ''
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['pending_payment', 'active', 'expiring', 'expired', 'rejected', 'cancelled'],
    default: 'pending_payment',
    index: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  paymentReceiptUrl: {
    type: String
  },
  paymentReceiptType: {
    type: String,
    enum: ['image', 'pdf', null]
  },
  paymentMethod: {
    type: String,
    enum: ['mercadopago', 'transferencia', null],
    default: null
  },
  adminNotes: {
    type: String,
    maxlength: 2000
  },
  rejectionReason: {
    type: String,
    maxlength: 1000
  },
  expiryWarningSent: {
    type: Date
  },
  renewalCount: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

AvisoSchema.index({ professional: 1, environment: 1, serviceLine: 1 });
AvisoSchema.index({ status: 1, endDate: 1 });
AvisoSchema.index({ status: 1, environment: 1 });

module.exports = mongoose.model('Aviso', AvisoSchema);
