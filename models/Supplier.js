const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const slugify = require('slugify');  

const supplierSchema = new Schema({
    name: { type: String },
    contactEmail: { type: String },
    slug: { type: String, unique: true },
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
    },
    messages: [{
        name: { type: String, required: true },
        companyName: { type: String },
        phone: { type: String },
        email: { type: String },
        interestedProduct: { type: String },
        message: { type: String },
        timeframe: { type: String },
        createdAt: { type: Date, default: Date.now },
    }],
  
    showConditionLibrary: { type: Boolean, default: false }, 
    showReviews: { type: Boolean, default: false }, 
    showProducts: { type: Boolean, default: false }, 
    showCategories: { type: Boolean, default: false }, 
});

function generateRandomSlugSuffix() {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789'; 
    let result = '';
    
    result += numbers.charAt(Math.floor(Math.random() * numbers.length));
  
    const allChars = chars + numbers;
    for (let i = 0; i < 3; i++) {
      result += allChars.charAt(Math.floor(Math.random() * allChars.length));
    }
  
    return result;
  }

  supplierSchema.pre('save', async function(next) {
    if (this.name) {
      let baseSlug = slugify(this.name, { lower: true, strict: true });
  
      const existingSupplier = await this.constructor.findOne({ slug: baseSlug });
  
      if (existingSupplier) {
        let newSlug = `${baseSlug}-${generateRandomSlugSuffix()}`;
        
        while (await this.constructor.findOne({ slug: newSlug })) {
          newSlug = `${baseSlug}-${generateRandomSlugSuffix()}`;
        }
        
        this.slug = newSlug;  
      } else {
        this.slug = baseSlug;  
      }
    }
  
    next(); 
  });
  
  const Supplier = mongoose.model('Supplier', supplierSchema);
  
  module.exports = Supplier;
  