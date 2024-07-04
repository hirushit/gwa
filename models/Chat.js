const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const chatSchema = new Schema({
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    messages: [
        {
            senderId: { type: mongoose.Schema.Types.ObjectId, required: true },
            text: { type: String, required: true },
            timestamp: { type: Date, default: Date.now }
        }
    ]
});

const Chat = mongoose.model('Chat', chatSchema);

module.exports = Chat;
    