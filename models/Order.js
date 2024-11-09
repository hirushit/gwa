const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    buyerEmail: {
        type: String,
        required: true
    },
    supplierEmail: {
        type: String,
        required: true
    },
    products: [{
        productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product', // Assuming you have a Product model
            required: true
        },
        quantity: {
            type: Number,
            required: true,
            min: 1 // Ensure quantity is at least 1
        }
    }],
    totalAmount: {
        type: Number,
        required: true,
        min: 0 // Ensure total amount is not negative
    },
    orderDate: {
        type: Date,
        default: Date.now // Automatically set the order date to now
    },
    orderStatus: {
        type: String,
        enum: ['Pending', 'Processed', 'Shipped', 'Delivered', 'Cancelled'], // Define possible statuses
        default: 'Pending' // Default status when order is created
    },
    expectedDeliveryDate: {
        type: Date, 
    }
});

module.exports = mongoose.model('Order', orderSchema);
