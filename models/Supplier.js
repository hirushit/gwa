const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const supplierSchema = new Schema({
    name: { type: String, required: true },
    contactEmail: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    alternateContactNumber: { type: String },
    businessRegistrationNumber: { type: String },
    taxIdentificationNumber: { type: String },
    businessType: { type: String },
    address: { 
        street: { type: String },
        city: { type: String },
        state: { type: String },
        zipCode: { type: String },
        country: { type: String, required: true }
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
    productCategories: [{ type: String }],
    password: { type: String, required: true },
    rating: { type: Number, default: 0 },
    totalReviews: { type: Number, default: 0 },
    products: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
    createdAt: { type: Date, default: Date.now },
    verificationToken: { type: String },
    verificationTokenExpires: { type: Date },
    isVerified: { type: Boolean, default: false },

    followers: [{ type: Schema.Types.ObjectId, ref: 'Supplier' }], 
    following: [{ type: Schema.Types.ObjectId, ref: 'Supplier' }] 
});

const Supplier = mongoose.model('Supplier', supplierSchema);

module.exports = Supplier;
