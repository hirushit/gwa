const mongoose = require('mongoose');


const reviewSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  rating: { type: Number, min: 1, max: 5, required: true },
  reviewText: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const doctorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['doctor'], default: 'doctor' },
  phoneNumber: String,
  verificationToken: String,
  isVerified: { type: Boolean, default: false },
  title: String,
  speciality: { type: [String], required: true },
  country: String,
  state: String,
  city: String,
  location: String,
  gender: String,
  availability: String,
  dateOfBirth: Date,
  bloodGroup: String,
  languages: [String],
  hospitals: [{
    name: { type: String, required: true },
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    country: { type: String, required: true },
    zip: { type: String, required: true }
  }],
  insurances: [String],
  consultation: { type: String, enum: ['In-person', 'Video call', 'Both'], default: 'In-person' },
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
  verified: { type: String, enum: ['Not Verified', 'Pending', 'Verified'], default: 'Not Verified' },
  timeSlots: [{
    date: { type: Date, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    status: { type: String, enum: ['free', 'booked'], default: 'free' },
    hospital: { type: String, required: true },
    hospitalLocation: {
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      country: { type: String, required: true },
      zip: { type: String, required: true }
    }
  }],
  rating: { type: Number, default: 5 },
  consultationsCompleted: { type: Number, default: 0 },
  profileViews: { type: Number, default: 0 },
  conditions: [String],
  reviews: [reviewSchema], 
  subscriptionType: { type: String, default: "Free" },
  paymentDetails: { type: String },
  documents: {
    licenseProof: { data: Buffer, contentType: String },
    certificationProof: { data: Buffer, contentType: String },
    businessProof: { data: Buffer, contentType: String }
  },
  subscriptionVerification: { type: String, enum: ['Pending', 'Verified', 'Rejected'], default: 'Pending' }
});

module.exports = mongoose.model('Doctor', doctorSchema);
