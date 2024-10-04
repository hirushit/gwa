const mongoose = require('mongoose');

const newsReleaseSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
    },
    date: {
        type: Date,
        required: true,
    },
    link: {  
        type: String,
        required: true
    },
    description: {
        type: String,
    },
    image: {
        data: Buffer,
        contentType: String,
    }
});

module.exports = mongoose.model('NewsRelease', newsReleaseSchema);
