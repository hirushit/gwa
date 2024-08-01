const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const notificationSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, required: true },
    type: { type: String, enum: ['chat', 'appointment', 'reminder', 'verification', 'other'], required: true },
    chatId: { type: Schema.Types.ObjectId, ref: 'Chat' }, // Added to link to the chat
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Notification', notificationSchema);
