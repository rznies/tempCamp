const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

// Separate Comment model for better scaling
const commentSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: uuidv4
  },
  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    index: true,
    required: true
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500,
    minlength: 1
  },
  likesCount: {
    type: Number,
    default: 0
  },
  parentComment: {
    type: String,
    ref: 'Comment'
  },
  visibility: {
    type: String,
    enum: ['public', 'private'],
    default: 'public'
  },
  deletedAt: Date
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (doc, ret) => {
      delete ret.__v;
      delete ret.deletedAt;
    }
  }
});

// Media subdocument with versioning
const mediaSchema = new mongoose.Schema({
  publicId: {
    type: String,
    required: true
  },
  url: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['image', 'video', 'gif']
  },
  transformations: {
    thumbnail: String,
    small: String,
    medium: String
  }
});

const postSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: uuidv4
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000,
    minlength: 1
  },
  media: mediaSchema,
  likesCount: {
    type: Number,
    default: 0
  },
  commentsCount: {
    type: Number,
    default: 0
  },
  tags: [{
    type: String,
    lowercase: true,
    trim: true,
    match: /^[a-z0-9]+$/
  }],
  visibility: {
    type: String,
    enum: ['public', 'course', 'private'],
    default: 'public',
    index: true
  },
  course: {
    type: String,
    required: function() {
      return this.visibility === 'course';
    },
    index: true
  },
  trendingScore: {
    type: Number,
    default: 0
  },
  editedAt: Date,
  deletedAt: Date
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (doc, ret) => {
      delete ret.__v;
      delete ret.deletedAt;
    }
  }
});

// Optimized Indexes
postSchema.index({ 
  visibility: 1,
  course: 1,
  trendingScore: -1,
  createdAt: -1
}); // For trending feed

postSchema.index({
  content: 'text',
  tags: 'text'
}); // Full-text search

postSchema.index({ 
  author: 1,
  createdAt: -1 
}); // User profile posts

// Virtual population for comments
postSchema.virtual('comments', {
  ref: 'Comment',
  localField: '_id',
  foreignField: 'post',
  options: {
    limit: 50,
    sort: { createdAt: -1 }
  }
});

// Version control for edits
postSchema.pre('save', function(next) {
  if (this.isModified('content') && !this.isNew) {
    this.editedAt = new Date();
  }
  next();
});

// Optimized Query Methods
postSchema.statics.getFeed = async function(userId, course, lastPostId, limit = 20) {
  const query = {
    $or: [
      { visibility: 'public' },
      { visibility: 'course', course }
    ],
    ...(lastPostId && { _id: { $lt: lastPostId } })
  };

  return this.find(query)
    .sort({ _id: -1 })
    .limit(limit)
    .populate('author', 'name avatar')
    .lean()
    .exec();
};

// Update Methods with Atomic Operations
postSchema.methods.addLike = function() {
  return this.updateOne({ $inc: { likesCount: 1 } });
};

postSchema.methods.removeLike = function() {
  return this.updateOne({ $inc: { likesCount: -1 } });
};

// Media transformation methods
postSchema.methods.generateMediaUrls = function() {
  if (this.media) {
    return {
      original: this.media.url,
      ...this.media.transformations
    };
  }
  return null;
};

// Trending score calculation
postSchema.methods.calculateTrendingScore = function() {
  const hourAge = (Date.now() - this.createdAt) / (1000 * 60 * 60);
  const score = (this.likesCount * 2 + this.commentsCount * 3) / Math.pow(hourAge + 1, 1.8);
  this.trendingScore = Math.round(score * 100);
  return this.save();
};

// Soft delete implementation
postSchema.methods.softDelete = function() {
  this.deletedAt = new Date();
  return this.save();
};

const Post = mongoose.model('Post', postSchema);
const Comment = mongoose.model('Comment', commentSchema);

module.exports = { Post, Comment };
