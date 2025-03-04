const mongoose = require('mongoose');

const likeSchema = new mongoose.Schema({
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true 
  },
  post: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Post' 
  },
  comment: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Comment' 
  },
  createdAt: { 
    type: Date, 
    default: Date.now,
    index: true 
  }
}, {
  timestamps: false
});

// Compound indexes for querying
likeSchema.index({ user: 1, post: 1 }, { unique: true, sparse: true });
likeSchema.index({ user: 1, comment: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Like', likeSchema);