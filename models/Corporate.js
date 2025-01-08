const mongoose = require('mongoose');

const corporateSchema = new mongoose.Schema({
  corporateName: {
    type: String,
  },
  email: {
    type: String,
  },
  role: {
    type: String,
  },
  mobileNumber: {
    type: String,
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
  },
  doctorReviews: [
    {
      doctorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Doctor',
      },
      reviewText: {
        type: String,
      },
      rating: {
        type: Number,
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
      },
      rating: {
        type: Number,
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
  corporateSpecialties: [
    {
      name: { type: String },
      image: {
        data: Buffer,
        contentType: String,
      },
    },
  ],
  createdByAdmin: { type: Boolean, default: false },
  profileVerification: [{
    email: { type: String },
    document: {
      data: Buffer,
      contentType: String
    }
  }],   
  profileTransferRequest: {
    type: String,
    enum: ['Accepted', 'Pending', 'Rejected', 'Idle'], 
    default: 'Idle'
  }
});

module.exports = mongoose.model('Corporate', corporateSchema);
