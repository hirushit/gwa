const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ReplySchema = new mongoose.Schema({
    username: { type: String, required: true },
    reply: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
});

const CommentSchema = new mongoose.Schema({
    username: { type: String, required: true },
    comment: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    replies: [ReplySchema],
});

const ImageSchema = new Schema({
    data: Buffer,
    contentType: String
});

const BlogSchema = new Schema({
    title: { type: String, required: true },
    author: { type: String, required: true },
    description: { type: String, required: true }, 
    authorEmail: { type: String, required: true },
    image: { 
        data: Buffer,
        contentType: String
    },
    images: [ImageSchema], 
    categories: { type: [String] },
    hashtags: { type: [String] },
    priority: { type: String, required: true },
    verificationStatus: { type: String, default: 'Pending' },
    comments: [CommentSchema],
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    readCount: { type: Number, default: 0 },
    conditions: { type: [String] }
});

const Blog = mongoose.model('Blog', BlogSchema);

module.exports = Blog;
