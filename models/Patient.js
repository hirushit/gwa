const mongoose = require('mongoose');

const emergencyContactSchema = new mongoose.Schema({
    name: String,
    relationship: String,
    phone: String,
    email: String,
});

const patientSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
        required: true,
    },
    role: {
        type: String,
        enum: ['patient'],
        default: 'patient',
    },
    phoneNumber: String,
    dateOfBirth: Date,
    bloodGroup: String,
    address: String,
    insuranceProvider: String,
    policyNumber: String,
    groupNumber: String,
    emergencyContacts: [emergencyContactSchema],
    profilePicture: {
        data: Buffer,
        contentType: String,
    },
    favoriteDoctors: [{
      type: mongoose.Schema.Types.ObjectId,
    }],
});

module.exports = mongoose.model('Patient', patientSchema);
