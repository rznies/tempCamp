const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const ms = require('ms');
const User = require('../models/User');
const { verifyToken } = require('../middleware/auth');

// Security constants
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const SALT_ROUNDS = 12;
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = ms('15m');

// Secure rate limiter configuration
const apiLimiter = rateLimit({
  windowMs: LOGIN_WINDOW_MS,
  max: MAX_LOGIN_ATTEMPTS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({
    error: 'rate_limit_exceeded',
    message: `Too many requests. Please try again in ${ms(LOGIN_WINDOW_MS, { long: true })}`
  })
});

// Secure cookie configuration
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/api/auth/refresh'
};

// JWT token generation
const generateTokens = (user, sessionId) => ({
  accessToken: jwt.sign(
    {
      sub: user._id,
      role: user.role,
      jti: sessionId,
      type: 'access'
    },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  ),
  refreshToken: jwt.sign(
    {
      sub: user._id,
      jti: sessionId,
      type: 'refresh'
    },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  )
});

// Session management middleware
const createSession = async (user) => {
  const sessionId = uuidv4();
  const hashedToken = await bcrypt.hash(sessionId, SALT_ROUNDS);
  
  user.sessions.push({
    sessionId: hashedToken,
    expiresAt: new Date(Date.now() + ms(REFRESH_TOKEN_EXPIRY))
  });
  
  await user.save();
  return sessionId;
};

// Validation middleware
const validate = (validations) => [
  validations,
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }
    return next();
  }
];

// Login endpoint
router.post('/login', 
  apiLimiter,
  validate([
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 12 })
  ]),
  async (req, res) => {
    try {
      const user = await User.findOne({ email: req.body.email })
        .select('+password +sessions')
        .lean();

      if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
        return res.status(401).json({
          error: 'authentication_failed',
          message: 'Invalid credentials'
        });
      }

      const sessionId = await createSession(user);
      const { accessToken, refreshToken } = generateTokens(user, sessionId);

      res.cookie('refreshToken', refreshToken, cookieOptions);
      return res.json({
        data: {
          accessToken,
          user: {
            _id: user._id,
            email: user.email,
            name: user.name
          }
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        error: 'server_error',
        message: 'Authentication service unavailable'
      });
    }
  }
);

// Registration endpoint
router.post('/register',
  validate([
    body('email').isEmail().normalizeEmail(),
    body('password').isStrongPassword({
      minLength: 12,
      minLowercase: 1,
      minUppercase: 1,
      minNumbers: 1,
      minSymbols: 1
    }),
    body('name').trim().escape()
  ]),
  async (req, res) => {
    try {
      const existingUser = await User.findOne({ email: req.body.email });
      if (existingUser) {
        return res.status(409).json({
          error: 'email_exists',
          message: 'Account with this email already exists'
        });
      }

      const hashedPassword = await bcrypt.hash(req.body.password, SALT_ROUNDS);
      const user = new User({
        ...req.body,
        password: hashedPassword,
        sessions: []
      });

      await user.save();
      return res.sendStatus(201);
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({
        error: 'server_error', 
        message: 'Account creation failed'
      });
    }
  }
);

// Token refresh endpoint
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken;
    if (!refreshToken) return res.sendStatus(401);

    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    const user = await User.findById(decoded.sub).select('+sessions');

    if (!user || !user.sessions.some(session => 
      bcrypt.compareSync(decoded.jti, session.sessionId)
    )) {
      return res.sendStatus(403);
    }

    const { accessToken } = generateTokens(user, decoded.jti);
    return res.json({ data: { accessToken } });
  } catch (error) {
    console.error('Refresh error:', error);
    return res.sendStatus(401);
  }
});

// Logout endpoint
router.post('/logout', verifyToken, async (req, res) => {
  try {
    await User.updateOne(
      { _id: req.user.sub },
      { $pull: { sessions: { sessionId: req.user.jti } } }
    );
    
    res.clearCookie('refreshToken', cookieOptions);
    return res.sendStatus(204);
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to terminate session'
    });
  }
});

// Account management endpoint
router.route('/me')
  .get(verifyToken, async (req, res) => {
    try {
      const user = await User.findById(req.user.sub)
        .select('-sessions -__v');
      return res.json({ data: user });
    } catch (error) {
      console.error('Profile error:', error);
      res.status(500).json({
        error: 'server_error',
        message: 'Failed to retrieve profile'
      });
    }
  })
  .delete(verifyToken, async (req, res) => {
    try {
      await User.deleteOne({ _id: req.user.sub });
      res.clearCookie('refreshToken', cookieOptions);
      return res.sendStatus(204);
    } catch (error) {
      console.error('Delete error:', error);
      res.status(500).json({
        error: 'server_error',
        message: 'Account deletion failed'
      });
    }
  });

module.exports = router;
