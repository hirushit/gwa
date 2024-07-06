const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient' },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
    date: { type: Date, required: true },
    time: { type: String, required: true },
    consultationType: {
        type: String,
        enum: ['In-person', 'Video call'],
        required: true
    },
    status: {
        type: String,
        enum: ['waiting', 'accepted', 'rejected'],
        default: 'waiting'
    },
    meetingLink: { type: String },
    hospitalAddress: String
});

module.exports = mongoose.model('Booking', bookingSchema);
