const { NotFoundError, ConflictError, AuthenticationError } = require('../lib/errors');
const User = require('../models/User');
const logger = require('../lib/logger');
const {
  generatePasswordHash,
  validatePassword,
  isPasswordStrong,
} = require('../utils/password');

// Cache configuration (example using Redis)
const cache = {
  ttl: 60 * 5, // 5 minutes
  get: async (key) => {/* Redis get implementation */},
  set: async (key, value) => {/* Redis set implementation */}
};

const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'"
};

class UserService {
  static defaultProjection = '-password -refreshTokens -securityLogs';

  static async list({ page = 1, limit = 25 } = {}) {
    try {
      return await User.find()
        .select(this.defaultProjection)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .cache(cache.ttl);
    } catch (error) {
      logger.error('Failed to list users', { error });
      throw new NotFoundError('Failed to retrieve user list');
    }
  }

  static async get(id, options = {}) {
    try {
      const user = await User.findById(id)
        .select(options.includeSensitive ? '' : this.defaultProjection)
        .lean({ virtuals: true });

      if (!user) {
        throw new NotFoundError(`User not found with ID: ${id}`);
      }
      return user;
    } catch (error) {
      logger.error('Failed to get user', { userId: id, error });
      throw error.name === 'CastError' 
        ? new NotFoundError('Invalid user ID format') 
        : error;
    }
  }

  static async getByEmail(email) {
    try {
      const user = await User.findOne({ email: email.toLowerCase() })
        .select(this.defaultProjection)
        .lean();

      return user || null;
    } catch (error) {
      logger.error('Failed to get user by email', { email, error });
      throw new NotFoundError('User lookup failed');
    }
  }

  static async update(id, updateData) {
    try {
      const user = await User.findByIdAndUpdate(
        id,
        { $set: updateData },
        {
          new: true,
          runValidators: true,
          context: 'query',
          projection: this.defaultProjection
        }
      ).lean();

      if (!user) {
        throw new NotFoundError(`User not found with ID: ${id}`);
      }

      cache.set(`user:${id}`, user);
      return user;
    } catch (error) {
      logger.error('Failed to update user', { userId: id, error });
      throw error.name === 'MongoServerError' && error.code === 11000
        ? new ConflictError('Email already exists')
        : error;
    }
  }

  static async delete(id) {
    try {
      const result = await User.findByIdAndDelete(id);
      if (!result) {
        throw new NotFoundError(`User not found with ID: ${id}`);
      }
      cache.del(`user:${id}`);
      return true;
    } catch (error) {
      logger.error('Failed to delete user', { userId: id, error });
      throw error;
    }
  }

  static async authenticateWithPassword(email, password) {
    if (!email || !password) {
      throw new AuthenticationError('Email and password required');
    }

    try {
      const user = await User.findOne({ email: email.toLowerCase() })
        .select('+password +loginAttempts +lockUntil')
        .exec();

      if (!user) {
        throw new AuthenticationError('Invalid credentials');
      }

      if (user.isLocked) {
        throw new AuthenticationError('Account is temporarily locked');
      }

      if (!(await validatePassword(password, user.password))) {
        await this.handleFailedLogin(user);
        throw new AuthenticationError('Invalid credentials');
      }

      await this.handleSuccessfulLogin(user);
      return this.get(user._id);
    } catch (error) {
      logger.warn('Authentication attempt failed', { 
        email,
        errorType: error.name,
        message: error.message
      });
      throw error;
    }
  }

  static async handleFailedLogin(user) {
    user.loginAttempts += 1;
    if (user.loginAttempts >= 5) {
      user.lockUntil = Date.now() + (15 * 60 * 1000); // 15 minutes
    }
    await user.save();
  }

  static async handleSuccessfulLogin(user) {
    if (user.loginAttempts > 0 || user.lockUntil) {
      user.loginAttempts = 0;
      user.lockUntil = undefined;
      await user.save();
    }
  }

  static async create({ email, password, name = '' }) {
    if (!email || !password) {
      throw new AuthenticationError('Email and password required');
    }

    if (!isPasswordStrong(password)) {
      throw new AuthenticationError('Password does not meet security requirements');
    }

    try {
      const hash = await generatePasswordHash(password);
      const user = await User.create({
        email: email.toLowerCase(),
        password: hash,
        name,
        lastLogin: Date.now()
      });

      return this.get(user._id);
    } catch (error) {
      if (error.name === 'MongoServerError' && error.code === 11000) {
        throw new ConflictError('Email address already registered');
      }
      logger.error('User creation failed', { email, error });
      throw new Error('Failed to create user account');
    }
  }

  static async setPassword(userId, newPassword) {
    if (!userId || !newPassword) {
      throw new AuthenticationError('User ID and password required');
    }

    try {
      const hash = await generatePasswordHash(newPassword);
      const user = await User.findByIdAndUpdate(
        userId,
        { $set: { password: hash } },
        { new: true, projection: this.defaultProjection }
      );

      if (!user) {
        throw new NotFoundError(`User not found with ID: ${userId}`);
      }

      logger.info('Password updated successfully', { userId });
      return user;
    } catch (error) {
      logger.error('Password update failed', { userId, error });
      throw new Error('Failed to update user password');
    }
  }
}

module.exports = UserService;
