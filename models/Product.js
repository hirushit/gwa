const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const reviewSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    rating: { type: Number, required: true },
    comment: { type: String },
    createdAt: { type: Date, default: Date.now }
});

const optionSchema = new Schema({
    color: { type: String }, 
    type: { type: String },  
    quantity: { type: Number, default: 0 } 
});

const productSchema = new Schema({
    name: { type: String, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    description: { type: String, required: true },
    images: [{
        data: { type: Buffer, required: true }, 
        contentType: { type: String, required: true }
    }],
    category: { type: String, required: true },
    subCategory: { type: String },
    price: { type: Number, required: true },
    countInStock: { type: Number, required: true },
    options: [optionSchema], 
    rating: { type: Number, default: 0 },
    reviews: [reviewSchema],
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    createdAt: { type: Date, default: Date.now }
});

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
