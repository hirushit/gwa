const mongoose = require('mongoose');

const faqSchema = new mongoose.Schema({
  question: { type: String }, 
  answer: { type: String }   
});

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
  experience: Number,
  verificationToken: String,
  isVerified: { type: Boolean, default: false },
  title: String,
  aboutMe: { type: String },
  speciality: { type: [String], required: true },
  country: String,
  state: String,
  city: String,
  zip: String,
  location: String,
  gender: String,
  availability: String,
  dateOfBirth: Date,
  bloodGroup: String,
  languages: [String],
  doctorFee:{type: Number, default: 85},
  doctorFeeCurrency:{type: String, enum: ['usd', 'inr', 'gbp', 'aed']},
  hospitals: [{
      name: { type: String, required: true },
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      country: { type: String, required: true },
      zip: { type: String, required: true },
    lat: { type: Number }, 
    lng: { type: Number }  
  }],
  insurances: [{ type: String}],
  consultation: { type: String, enum: ['In-person', 'Video call', 'Both'], default: 'In-person' },
  awards: [String],
  faqs: [faqSchema],  
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
    consultation: { 
        type: String, 
        enum: ['In-person', 'Video call'], 
        required: true 
    },
    hospital: {
        type: String,
        required: function() { return this.consultation !== 'Video call'; } 
    },
    hospitalLocation: {
        street: { type: String, required: function() { return this.consultation !== 'Video call'; } }, 
        city: { type: String, required: function() { return this.consultation !== 'Video call'; } }, 
        state: { type: String, required: function() { return this.consultation !== 'Video call'; } },  
        country: { type: String, required: function() { return this.consultation !== 'Video call'; } }, 
        zip: { type: String, required: function() { return this.consultation !== 'Video call'; } }    
    },
    lat: { type: Number }, 
    lng: { type: Number }  
}],

  rating: { type: Number, default: 5 },
  consultationsCompleted: { type: Number, default: 0 },
  profileViews: { type: Number, default: 0 },
  conditions: [String],
  reviews: [reviewSchema], 
  subscriptionType: { type: String, default: "Standard" },
  paymentDetails: { type: String },
  documents: {
    licenseProof: { data: Buffer, contentType: String },
    certificationProof: { data: Buffer, contentType: String },
    businessProof: { data: Buffer, contentType: String }
  },
  licenseNumber: { type: String },
  trialEndDate: Date,
  maxTimeSlots: {
    type: Number,
    default: 0
  },
  subscriptionVerification: { type: String, enum: ['Pending', 'Verified', 'Rejected'], default: 'Verified' },
  subscriptionDate: {
    type: Date,
  },
  subscriptionDuration: {
      type: String, 
      enum: ['monthly', 'annual'],
  },
  adminCommissionFee: { type: Number, default: 10 },
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  tempDoctorFee: Number,
  totalDoctorFee: Number,
  serviceCharge: Number,
  tempDoctorFeeStatus: { type: String, enum: ['Pending', 'Not Paid', 'Paid', "Partially Paid"], default: 'Pending' },
});

module.exports = mongoose.model('Doctor', doctorSchema);
