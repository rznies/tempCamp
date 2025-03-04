const mongoose = require('mongoose');
const { setGlobalDispatcher, Agent } = require('undici');
const retry = require('async-retry');
const { createLogger } = require('@/lib/logger');

const logger = createLogger('database');
const RETRY_TIMEOUT = 15000; // 15 seconds

// Configure connection pool
const POOL_CONFIG = {
  maxPoolSize: process.env.DB_MAX_POOL_SIZE || 100,
  minPoolSize: process.env.DB_MIN_POOL_SIZE || 10,
  heartbeatFrequencyMS: 30000,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 30000,
  family: 4,
};

// Security-first connection string construction
const constructConnectionURI = () => {
  const requiredEnvVars = ['DB_USER', 'DB_PASSWORD', 'DB_HOST', 'DB_NAME'];
  requiredEnvVars.forEach(varName => {
    if (!process.env[varName]) {
      throw new Error(`Missing required DB environment variable: ${varName}`);
    }
  });

  return `mongodb+srv://${encodeURIComponent(process.env.DB_USER)}:${encodeURIComponent(process.env.DB_PASSWORD)}@${process.env.DB_HOST}/${process.env.DB_NAME}?retryWrites=true&w=majority`;
};

// Configure secure TCP connections
setGlobalDispatcher(new Agent({
  connect: {
    rejectUnauthorized: process.env.NODE_ENV === 'production',
    servername: process.env.DB_HOST,
    timeout: POOL_CONFIG.serverSelectionTimeoutMS,
  }
}));

let isConnected = false;
let connectionAttempts = 0;
const MAX_RETRIES = 5;

const connectWithRetry = async () => {
  return retry(async (bail) => {
    try {
      if (isConnected) return;

      const conn = await mongoose.connect(constructConnectionURI(), {
        ...POOL_CONFIG,
        ssl: process.env.DB_SSL === 'true',
        sslValidate: process.env.NODE_ENV === 'production',
        tlsAllowInvalidCertificates: process.env.NODE_ENV !== 'production',
      });

      isConnected = true;
      connectionAttempts = 0;
      
      logger.info(`Connected to MongoDB cluster ${process.env.DB_HOST}`, {
        protocol: conn.connection._connectionOptions?.authSource,
        poolSize: POOL_CONFIG.maxPoolSize,
        host: conn.connection.host,
        port: conn.connection.port,
        database: conn.connection.name
      });

      return conn;
    } catch (error) {
      connectionAttempts++;
      const criticalError = error.message.includes('ENOTFOUND') || 
                           error.message.includes('ETIMEDOUT') ||
                           connectionAttempts >= MAX_RETRIES;

      logger.error(`MongoDB connection attempt ${connectionAttempts} failed`, {
        error: error.message,
        critical: criticalError
      });

      if (criticalError) bail(new Error('Critical database connection failure'));
      throw error;
    }
  }, {
    retries: MAX_RETRIES,
    minTimeout: RETRY_TIMEOUT,
    factor: 2,
  });
};

// Enhanced connection listeners
const configureEventListeners = () => {
  mongoose.connection.on('connected', () => {
    logger.info('MongoDB connection established');
    mongoose.connection.on('error', err => {
      logger.error('MongoDB runtime connection error', { error: err.message });
    });
  });

  mongoose.connection.on('disconnected', () => {
    isConnected = false;
    logger.warn('MongoDB connection lost', { 
      lastActive: mongoose.connection.readyState,
      uptime: process.uptime() 
    });
  });

  mongoose.connection.on('reconnected', () => {
    isConnected = true;
    logger.info('MongoDB connection reestablished', {
      pingTime: mongoose.connection.db.serverConfig.isConnected() 
        ? mongoose.connection.db.serverConfig.ping() 
        : 'disconnected'
    });
  });
};

// Health check endpoint integration
const statusMonitor = () => ({
  dbState: mongoose.connection.readyState,
  poolSize: mongoose.connection.base.connections.length,
  lastPing: new Date().toISOString(),
  connectionStats: mongoose.connection.stats()
});

const closeDatabase = async () => {
  try {
    await mongoose.connection.close(false);
    logger.info('MongoDB connection gracefully closed', {
      openHandles: mongoose.connection.base.connections.length
    });
  } catch (err) {
    logger.error('MongoDB connection closure failed', { error: err.message });
    process.exitCode = 1;
  }
};

// Automatically attempt reconnection on termination signals
process.on('SIGINT', closeDatabase);
process.on('SIGTERM', closeDatabase);

// Handle uncaught exceptions related to MongoDB
process.on('uncaughtException', async (err) => {
  if (err.name === 'MongoError' || err.name === 'MongoServerError') {
    logger.fatal('Uncaught MongoDB exception', { error: err });
    await closeDatabase();
    process.exit(1);
  }
});

module.exports = {
  connectDB: connectWithRetry,
  closeDatabase,
  statusMonitor,
  connection: mongoose.connection,
  models: mongoose.models,
  constructConnectionURI,
  POOL_CONFIG
};
