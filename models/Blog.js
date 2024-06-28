const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const blogSchema = new Schema({
    title: { type: String, required: true },
    author: { type: String, required: true },
    description: { type: String, required: true },
    summary: { type: String, required: true },
    authorEmail: { type: String, required: true },
    image: { type: Buffer }, // Store binary data of image
    verificationStatus: { type: String, default: 'pending' },
    comments: [
        {
            username: String,
            comment: String,
            date: { type: Date, default: Date.now }
        }
    ]
});

const Blog = mongoose.model('Blog', blogSchema);

module.exports = Blog;
