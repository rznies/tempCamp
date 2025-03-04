const Redis = require('redis');
const { promisify } = require('util');

const redisClient = Redis.createClient({
  url: process.env.REDIS_URL,
  password: process.env.REDIS_PASSWORD,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 100, 3000)
  }
});

// Session configuration
const SESSION_CONFIG = {
  prefix: 'sess:',
  ttl: parseInt(process.env.SESSION_AUTO_EXPIRE) || 7 * 24 * 60 * 60
};

// Cache configuration
const CACHE_CONFIG = {
  post: {
    prefix: 'post:',
    ttl: 3600 // 1 hour
  },
  feed: {
    prefix: 'feed:',
    ttl: 300 // 5 minutes
  }
};

// Enhanced Redis commands
const asyncRedis = {
  get: promisify(redisClient.get).bind(redisClient),
  set: promisify(redisClient.set).bind(redisClient),
  setex: promisify(redisClient.setex).bind(redisClient),
  del: promisify(redisClient.del).bind(redisClient),
  exists: promisify(redisClient.exists).bind(redisClient),
  
  // Cache methods
  async cachePost(postId, data) {
    const key = `${CACHE_CONFIG.post.prefix}${postId}`;
    await this.setex(key, CACHE_CONFIG.post.ttl, JSON.stringify(data));
  },
  
  async cacheFeed(userId, cursor, data) {
    const key = `${CACHE_CONFIG.feed.prefix}${userId}:${cursor}`;
    await this.setex(key, CACHE_CONFIG.feed.ttl, JSON.stringify(data));
  }
};

// Session management methods
const sessionManager = {
  async createSession(userId, meta) {
    const sessionKey = `${SESSION_CONFIG.prefix}${meta.sessionId}`;
    await asyncRedis.set(sessionKey, JSON.stringify({
      userId,
      ip: meta.ip,
      userAgent: meta.ua,
      createdAt: new Date()
    }), 'EX', SESSION_CONFIG.ttl);
    return sessionKey;
  },

  async validateSession(sessionId) {
    const sessionKey = `${SESSION_CONFIG.prefix}${sessionId}`;
    const session = await asyncRedis.get(sessionKey);
    return session ? JSON.parse(session) : null;
  },

  async removeSession(sessionId) {
    const sessionKey = `${SESSION_CONFIG.prefix}${sessionId}`;
    await asyncRedis.del(sessionKey);
  }
};

redisClient.on('error', (err) => console.error('Redis Client Error', err));
redisClient.on('connect', () => console.log('Redis Client Connected'));

module.exports = { 
  redisClient, 
  sessionManager,
  SESSION_CONFIG,
  CACHE_CONFIG,
  asyncRedis 
};