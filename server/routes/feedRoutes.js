const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const { authenticateToken } = require('../middleware/auth');
const multer = require('multer');
const redis = require('../lib/redis');
const { v4: uuidv4 } = require('uuid');
const { rateLimit } = require('express-rate-limit');
const cloudinary = require('cloudinary').v2;

// Rate limiter for expensive operations
const feedLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
});

// Configure cloud storage
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// Caching middleware
const cachePosts = async (req, res, next) => {
  const page = req.query.page || 1;
  const cacheKey = `feed:${page}`;
  
  try {
    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
      return res.status(200).json(JSON.parse(cachedData));
    }
    req.cacheKey = cacheKey;
    next();
  } catch (error) {
    next();
  }
};

// Atomic update operations
const atomicUpdate = (model, filter, update) => model.findOneAndUpdate(
  filter,
  update,
  { new: true, useFindAndModify: false }
);

// Optimized GET feed posts with cursor-based pagination
router.get('/', authenticateToken, cachePosts, async (req, res) => {
  try {
    const cursor = req.query.cursor || new Date().toISOString();
    const pageSize = parseInt(req.query.pageSize) || 20;

    const query = {
      createdAt: { $lt: new Date(cursor) },
      visibility: 'public'
    };

    const posts = await Post.find(query)
      .populate('author', '_id name avatar')
      .sort({ createdAt: -1 })
      .limit(pageSize + 1) // Fetch one extra to check hasMore
      .lean()
      .cache({ key: req.user.id });

    const hasMore = posts.length > pageSize;
    if (hasMore) posts.pop();

    const newCursor = posts.length > 0 ? posts[posts.length - 1].createdAt : null;

    // Cache results for 1 minute
    if (req.cacheKey) {
      redis.setex(req.cacheKey, 60, JSON.stringify({
        success: true,
        data: posts,
        cursor: newCursor,
        hasMore
      }));
    }

    res.status(200).json({
      success: true,
      data: posts,
      cursor: newCursor,
      hasMore
    });
  } catch (error) {
    console.error('Error fetching feed posts:', error);
    res.status(500).json({
      success: false,
      code: 'FEED_FETCH_FAILED'
    });
  }
});

// Optimized like endpoint with atomic updates
router.post('/like', authenticateToken, feedLimiter, async (req, res) => {
  try {
    const { postId } = req.body;
    const userId = req.user.id;

    const result = await atomicUpdate(
      Post,
      { _id: postId },
      userId.startsWith('LIKE-') 
        ? { $pull: { likes: userId } }
        : { $addToSet: { likes: userId }, $inc: { likesCount: 1 } }
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        code: 'POST_NOT_FOUND'
      });
    }

    // Invalidate cache for posts feed
    redis.del(`feed:${req.user.id}`);

    res.status(200).json({
      success: true,
      data: {
        likes: result.likes.length,
        hasLiked: result.likes.includes(userId)
      }
    });
  } catch (error) {
    console.error('Error liking post:', error);
    res.status(500).json({
      success: false,
      code: 'LIKE_UPDATE_FAILED'
    });
  }
});

const uploadToCloudinary = (file) => new Promise((resolve, reject) => {
  cloudinary.uploader.upload_stream(
    { resource_type: 'auto' },
    (error, result) => error ? reject(error) : resolve(result)
  ).end(file.buffer);
});

// Improved post creation with CDN
router.post('/create', authenticateToken, async (req, res) => {
  try {
    const { content } = req.body;
    let image;

    if (req.file) {
      const result = await uploadToCloudinary(req.file);
      image = {
        url: result.secure_url,
        public_id: result.public_id,
        transformations: {
          thumbnail: cloudinary.url(result.public_id, {
            transformation: [
              { width: 300, height: 300, crop: 'fill' },
              { quality: 'auto' }
            ]
          })
        }
      };
    }

    const newPost = new Post({
      _id: uuidv4(),
      author: req.user.id,
      content,
      image,
      likesCount: 0,
      commentsCount: 0
    });

    await newPost.save();

    // Invalidate feed cache immediately
    redis.del(`feed:${req.user.id}`);

    res.status(201).json({
      success: true,
      data: await newPost.populate('author', '_id name avatar')
    });
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({
      success: false,
      code: 'POST_CREATION_FAILED'
    });
  }
});

// Optimized comments handling
const commentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many comments, please try again later'
});

router.post('/comments', authenticateToken, commentLimiter, async (req, res) => {
  try {
    const { postId, content } = req.body;

    const result = await atomicUpdate(
      Post,
      { _id: postId },
      { 
        $push: { 
          comments: {
            _id: uuidv4(),
            author: req.user.id,
            content
          } 
        },
        $inc: { commentsCount: 1 }
      }
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        code: 'POST_NOT_FOUND'
      });
    }

    const newComment = result.comments[result.comments.length - 1];
    await newComment.populate('author', '_id name avatar');

    redis.del(`comments:${postId}*`);

    res.status(201).json({
      success: true,
      data: newComment
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({
      success: false,
      code: 'COMMENT_CREATION_FAILED'
    });
  }
});

module.exports = router;
