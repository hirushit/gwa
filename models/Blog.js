const mongoose = require('mongoose');
const Schema = mongoose.Schema;


const ReplySchema = new mongoose.Schema({
    username: { type: String, required: true },
    reply: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
});

const commentSchema = new mongoose.Schema({
    username: { type: String, required: true },
    comment: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }, 
    replies: [ReplySchema],
});

const blogSchema = new Schema({
  title: { type: String, required: true },
  author: { type: String, required: true },
  description: { type: String, required: true },
  authorEmail: { type: String, required: true },
  image: {
    data: Buffer,
    contentType: String
  },
  categories: { type: [String] },
  hashtags: { type: [String] }, 
  priority: { type: String, required: true },
  verificationStatus: { type: String, default: 'pending' },
  comments: [commentSchema],  
  authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  readCount: { type: Number, default: 0 },
  conditions: { type: [String] }
});

const Blog = mongoose.model('Blog', blogSchema);

module.exports = Blog;
