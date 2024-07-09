const mongoose = require('mongoose');

const prescriptionSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true
  },
  patientName: {
    type: String,
    required: true
  },
  doctorName: {
    type: String,
    required: true
  },
  doctorSpeciality: {
    type: String,
    required: true
  },
  doctorEmail: {
    type: String,
    required: true
  },
  patientAge: {
    type: Number,
    required: true
  },
  medicines: [{
    name: {
      type: String,
      required: true
    },
    dosage: {
      type: String,
      required: true
    },
    beforeFood: {
      type: Boolean,
      default: false
    },
    afterFood: {
      type: Boolean,
      default: false
    },
    timing: {
      morning: {
        type: Boolean,
        default: false
      },
      afternoon: {
        type: Boolean,
        default: false
      },
      night: {
        type: Boolean,
        default: false
      }
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  meetingDate: {
    type: Date
  },
  meetingTime: {
    type: String
  }
});

const Prescription = mongoose.model('Prescription', prescriptionSchema);

module.exports = Prescription;
