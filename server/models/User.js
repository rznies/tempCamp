const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const validator = require('validator');
const { env } = require('../config/env');

const SALT_WORK_FACTOR = env.NODE_ENV === 'production' ? 12 : 10;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME = 15 * 60 * 1000; // 15 minutes

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    validate: {
      validator: v => validator.isEmail(v),
      message: props => `${props.value} is not a valid email address`
    },
    index: { 
      unique: true,
      collation: { locale: 'en', strength: 2 } // Case-insensitive index
    }
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [12, 'Password must be at least 12 characters'],
    validate: {
      validator: function(v) {
        return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+])[A-Za-z\d!@#$%^&*()_+]{12,}$/.test(v);
      },
      message: 'Password must contain uppercase, lowercase, number, and special character'
    },
    select: false
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [50, 'Name cannot exceed 50 characters'],
    text: true // Enable text search
  },
  avatar: {
    type: String,
    default: null,
    validate: {
      validator: v => validator.isURL(v, { protocols: ['http','https'], require_protocol: true }),
      message: 'Avatar must be a valid URL'
    }
  },
  roles: {
    type: [String],
    enum: ['user', 'moderator', 'admin'],
    default: ['user']
  },
  loginAttempts: {
    type: Number,
    default: 0,
    select: false
  },
  lockUntil: {
    type: Date,
    select: false
  },
  securityLogs: {
    type: [{
      type: {
        type: String,
        enum: ['password_change', 'login', 'logout', 'lock']
      },
      ipAddress: String,
      userAgent: String,
      timestamp: Date
    }],
    select: false
  },
  refreshTokens: [{
    token: String,
    deviceId: String,
    userAgent: String,
    ipAddress: String,
    createdAt: Date
  }]
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.refreshTokens;
      delete ret.securityLogs;
      delete ret.loginAttempts;
      delete ret.lockUntil;
      delete ret.__v;
      delete ret._id;
      ret.id = doc._id.toString();
      return ret;
    }
  }
});

// Compound indexes
userSchema.index({ email: 1, isActive: 1 }); // Common query filter
userSchema.index({ createdAt: -1, points: -1 }); // Leaderboard queries
userSchema.index({ 'refreshTokens.createdAt': 1 }); // Token cleanup

// Virtual property for account lock status
userSchema.virtual('isLocked').get(function() {
  return this.lockUntil && this.lockUntil > Date.now();
});

// Password hashing with pre-save hook
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    this.password = await this.hashPassword(this.password);
    next();
  } catch (error) {
    next(error);
  }
});

// Hash password method
userSchema.methods.hashPassword = async function(password) {
  const salt = await bcrypt.genSalt(SALT_WORK_FACTOR);
  return bcrypt.hash(password, salt);
};

// Password comparison with attack prevention
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (this.isLocked) {
    const timeLeft = Math.ceil((this.lockUntil - Date.now()) / 1000);
    throw new Error(`Account locked. Try again in ${timeLeft} seconds`);
  }

  const isMatch = await bcrypt.compare(candidatePassword, this.password);
  
  if (!isMatch) {
    this.loginAttempts += 1;
    if (this.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
      this.lockUntil = Date.now() + LOCK_TIME;
      this.securityLogs.push({
        type: 'lock',
        timestamp: new Date(),
        ipAddress: this.securityLogs.slice(-1)[0]?.ipAddress,
        userAgent: this.securityLogs.slice(-1)[0]?.userAgent
      });
    }
    await this.save();
    return false;
  }

  // Reset attempts on successful login
  if (this.loginAttempts > 0 || this.lockUntil) {
    this.loginAttempts = 0;
    this.lockUntil = undefined;
    await this.save();
  }

  return true;
};

// Session management methods
userSchema.methods.createRefreshToken = function(deviceId, userAgent, ipAddress) {
  const token = crypto.randomBytes(40).toString('hex');
  this.refreshTokens.push({
    token,
    deviceId,
    userAgent,
    ipAddress,
    createdAt: new Date()
  });
  return token;
};

userSchema.methods.rotateRefreshToken = function(oldToken) {
  const existingToken = this.refreshTokens.find(t => t.token === oldToken);
  if (!existingToken) return null;
  
  const newToken = crypto.randomBytes(40).toString('hex');
  existingToken.token = newToken;
  existingToken.createdAt = new Date();
  return newToken;
};

// Security logging middleware
userSchema.pre(/^(save|findOneAndUpdate)/, function(next) {
  if (this.isModified('password')) {
    this.securityLogs.push({
      type: 'password_change',
      timestamp: new Date(),
      ipAddress: this.securityLogs.slice(-1)[0]?.ipAddress,
      userAgent: this.securityLogs.slice(-1)[0]?.userAgent
    });
  }
  next();
});

// Query helpers
userSchema.query.byEmail = function(email) {
  return this.where({ email: email.toLowerCase() });
};

userSchema.query.active = function() {
  return this.where({ isActive: true });
};

// Static methods
userSchema.statics.generatePassword = async function() {
  const password = crypto.randomBytes(12).toString('hex');
  return await this.hashPassword(password);
};

module.exports = mongoose.model('User', userSchema);
