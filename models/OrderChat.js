const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const orderchatSchema = new Schema({
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
    messages: [
        {
            senderId: { type: mongoose.Schema.Types.ObjectId, required: true },
            text: { type: String, required: true },
            timestamp: { type: Date, default: Date.now },
            read: { type: Boolean, default: false }
        }
    ]
});

const OrderChat = mongoose.models.OrderChat || mongoose.model('OrderChat', orderchatSchema);

module.exports = OrderChat;
