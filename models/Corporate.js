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
  password: {
    type: String,
    required: true,
  },
  verificationStatus: {
    type: String,
    default: 'Pending', // Status: Pending, Verified
  },
  verificationToken: {
    type: String,
  },
  verificationTokenExpires: { type: Date }, 
  isVerified: { type: Boolean, default: false } ,
  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // This could be Patient, Doctor, or Supplier model
  }],
  following: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier', // Supplier model reference
  }],
  doctors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' }],
});

module.exports = mongoose.model('Corporate', corporateSchema);
