const mongoose = require('mongoose');
const { env } = require('../config/env');

const connectDB = async () => {
  try {
    await mongoose.connect(env.MONGODB_URI, {
      autoIndex: env.NODE_ENV !== 'production',
      minPoolSize: 10,
      maxPoolSize: 100,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      ssl: true,
      sslValidate: env.NODE_ENV === 'production',
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    mongoose.connection.on('error', err => {
      console.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected. Attempting to reconnect...');
    });

    console.log('MongoDB Connected');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    process.exit(1);
  }
};

module.exports = connectDB;