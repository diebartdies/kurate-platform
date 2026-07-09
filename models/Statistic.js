const mongoose = require('mongoose');

const statisticSchema = new mongoose.Schema({
    professionalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    photoCount: {
        type: Number,
        default: 0
    },
    whatsappcCount: {
        type: Number,
        default: 0
    },
    callCount: {
        type: Number,
        default: 0
    },
    date: {
        type: String,
        required: true
    },
    time: {
        type: Date,
        default: Date.now
    }
});

statisticSchema.index({ professionalId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Statistic', statisticSchema);