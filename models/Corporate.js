const mongoose = require('mongoose');

const corporateSchema = new mongoose.Schema({
  corporateName: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  role: {
    type: String,
    required: true,
  },
  mobileNumber: {
    type: String,
    required: true,
  },
  alternateContactNumber: { type: String },
  businessRegistrationNumber: { type: String },
  taxIdentificationNumber: { type: String },
  businessType: { type: String },
  address: {
    street: { type: String },
    city: { type: String },
    state: { type: String },
    zipCode: { type: String },
    country: { type: String }
  },
  companyName: { type: String },
  profilePicture: {
    data: Buffer,
    contentType: String
  },
  coverPhoto: {
    data: Buffer,
    contentType: String
  },
  tagline: { type: String },
  overview: { type: String },
  password: {
    type: String,
    required: true,
  },
  doctorReviews: [
    {
      doctorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Doctor',
      },
      reviewText: {
        type: String,
        required: true,
      },
      rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5,
      },
      createdAt: {
        type: Date,
        default: Date.now,
      },
      showOnPage: { type: Boolean, default: true }
    }
  ],
  patientReviews: [
    {
      patientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Patient',
      },
      reviewText: {
        type: String,
        required: true,
      },
      rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5,
      },
      createdAt: {
        type: Date,
        default: Date.now,
      },
      showOnPage: { type: Boolean, default: true }
    }
  ],
  rating: { type: Number, default: 0 },
  totalReviews: { type: Number, default: 0 },
  verificationStatus: {
    type: String,
    default: 'Pending',
  },
  verificationToken: {
    type: String,
  },
  verificationTokenExpires: { type: Date },
  isVerified: { type: Boolean, default: false },
  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  following: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
  }],
  doctors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' }],
});

module.exports = mongoose.model('Corporate', corporateSchema);
