const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const supplierSchema = new Schema({
    name: { type: String },
    contactEmail: { type: String },
    phone: { type: String },
    alternateContactNumber: { type: String },
    businessRegistrationNumber: { type: String },
    taxIdentificationNumber: { type: String },
    businessType: { type: String },
    address: { 
        street: { type: String },
        city: { type: String },
        state: { type: String },
        zipCode: { type: String },
        country: { type: String}
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
    supplierCategories: [
        {
            name: { type: String },
            image: {
                data: Buffer,
                contentType: String,
            },
        },
    ],
    tagline: { type: String },
    overview: { type: String }, 
    productCategories: [{ type: String }],
    password: { type: String },
    rating: { type: Number, default: 0 },
    totalReviews: { type: Number, default: 0 },
    products: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
    createdAt: { type: Date, default: Date.now },
    verificationToken: { type: String },
    verificationTokenExpires: { type: Date },
    isVerified: { type: Boolean, default: false },

    followers: [{ type: Schema.Types.ObjectId, ref: 'Supplier' }], 
    following: [{ type: Schema.Types.ObjectId, ref: 'Supplier' }] ,
    createdByAdmin: { type: Boolean, default: false },
    profileVerification: [{
        email: { type: String },
        document: {
          data: Buffer,
          contentType: String
        },
        createdAt: { type: Date, default: Date.now } 
      }],
    
        profileTransferRequest: {
        type: String,
        enum: ['Accepted', 'Pending', 'Rejected', 'Idle'], 
        default: 'Idle'
      }
  });
  
const Supplier = mongoose.model('Supplier', supplierSchema);

module.exports = Supplier;
