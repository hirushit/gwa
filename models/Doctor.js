const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['doctor'],
    default: 'doctor'
  },
  title: String,
  speciality: [String],
  country: String,
  state: String,
  city: String,
  gender: String,
  availability: String,
  dateOfBirth: Date,
  bloodGroup: String,
  languages: [String],
  hospitals: [String],
  insurances: [String],
  consultation: {
    type: String,
    enum: ['In-person', 'Video call', 'Both'],
    default: 'In-person'
  },
  awards: [String],
  faqs: [String],
  website: String,
  socialHandles: {
    twitter: String,
    facebook: String,
    linkedin: String,
    instagram: String
  },
  profilePicture: {
    data: Buffer,
    contentType: String
  },
  verified: {
    type: String,
    enum: ['Not Verified', 'Pending', 'Verified'],
    default: 'Not Verified'
  },
  timeSlots: [{
    date: { type: Date, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    status: { type: String, enum: ['free', 'booked'], default: 'free' }
  }],
  rating: {
    type: Number,
    default: 5
  },
  consultationsCompleted: {
    type: Number,
    default: 0
  }
});

module.exports = mongoose.model('Doctor', doctorSchema);
