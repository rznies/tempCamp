const bcrypt = require('bcrypt');
const { promisify } = require('util');
const { logSecurityEvent } = require('../lib/security-logger');
const { zxcvbn } = require('@zxcvbn-ts/core');
const crypto = require('crypto');

// Configuration
const CONFIG = {
  SALT_ROUNDS: process.env.PW_SALT_ROUNDS || 12,
  MIN_LENGTH: process.env.PW_MIN_LENGTH || 14,
  MAX_LENGTH: process.env.PW_MAX_LENGTH || 128,
  ZXCVBN_THRESHOLD: 3
};

// Password policy constants
const COMMON_PASSWORDS = new Set(require('./breached-passwords.json').slice(0, 100000));

// Promisify crypto random bytes
const randomBytesAsync = promisify(crypto.randomBytes);

// Secure password validation
const isStrongPassword = (password) => {
  if (typeof password !== 'string') return false;
  
  // Length checks
  if (password.length < CONFIG.MIN_LENGTH || password.length > CONFIG.MAX_LENGTH) {
    return false;
  }

  // Check against common passwords
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return false;
  }

  // ZXCVBN complexity check
  const { score } = zxcvbn(password);
  return score >= CONFIG.ZXCVBN_THRESHOLD;
};

const generatePasswordHash = async (password) => {
  try {
    if (!isStrongPassword(password)) {
      throw new Error('INVALID_CREDENTIALS');
    }

    // Generate cryptographically secure random buffer
    const randomBuffer = await randomBytesAsync(16);
    
    // Add pepper to password
    const pepperedPassword = password + process.env.PASSWORD_PEPPER;
    
    const salt = await bcrypt.genSalt(Number(CONFIG.SALT_ROUNDS));
    const hash = await bcrypt.hash(pepperedPassword, salt);
    
    // Store both hash and random buffer (split storage recommended)
    return `${hash}|${randomBuffer.toString('hex')}`;
  } catch (error) {
    logSecurityEvent('PASSWORD_HASH_FAILURE', { error: error.message });
    throw new Error('ACCOUNT_CREATION_FAILED');
  }
};

const validatePassword = async (password, storedHash) => {
  try {
    if (!password || !storedHash) {
      throw new Error('MISSING_CREDENTIALS');
    }

    const [hash, randomBufferHex] = storedHash.split('|');
    if (!hash || !randomBufferHex) {
      throw new Error('INVALID_HASH_FORMAT');
    }

    // Validate hash structure
    if (!/^\$2[aby]\$[\d]+\$[./A-Za-z0-9]{53}$/.test(hash)) {
      throw new Error('INVALID_HASH_FORMAT');
    }

    // Add pepper and validate
    const pepperedPassword = password + process.env.PASSWORD_PEPPER;
    const isValid = await bcrypt.compare(pepperedPassword, hash);
    
    if (!isValid) {
      logSecurityEvent('PASSWORD_MATCH_FAILURE');
    }

    return isValid;
  } catch (error) {
    logSecurityEvent('PASSWORD_VALIDATION_ERROR', { error: error.message });
    throw new Error('AUTHENTICATION_FAILED');
  }
};

// Advanced hash validation
const isPasswordHash = (hash) => {
  try {
    const [bcryptHash] = hash.split('|');
    return bcryptHash && bcrypt.getRounds(bcryptHash) >= CONFIG.SALT_ROUNDS;
  } catch (error) {
    return false;
  }
};

module.exports = {
  generatePasswordHash,
  validatePassword,
  isPasswordHash,
  isStrongPassword,
  CONFIG
};
