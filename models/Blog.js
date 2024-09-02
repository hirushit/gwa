const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const blogSchema = new Schema({
    title: { type: String, required: true },
    author: { type: String, required: true },
    description: { type: String, required: true },
    authorEmail: { type: String, required: true },
    image: {
        data: Buffer,
        contentType: String
    },
    categories: {
        type: [String]
    }, 
    subcategories: {
        type: [String]
    },
    hashtags: {
        type: [String]
    }, 
    priority: {
        type: String,
        required: true
    },
    verificationStatus: { type: String, default: 'pending' },
    comments: [
        {
            username: String,
            comment: String,
            date: { type: Date, default: Date.now }
        }
    ],
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    readCount: {type: Number} 
});

const Blog = mongoose.model('Blog', blogSchema);

module.exports = Blog;
