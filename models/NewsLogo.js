const mongoose = require('mongoose');

const NewsLogoSchema = new mongoose.Schema({
    name: {
        type: String,
    },
    image: {
        data: Buffer,
        contentType: String,
    }
});

module.exports = mongoose.model('NewsLogo', NewsLogoSchema);
