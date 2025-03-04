import dotenv from 'dotenv';

dotenv.config();

const config = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000'),
  MONGODB_URI: process.env.MONGODB_URI,
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || 'http://localhost:5173'
};

if (!config.MONGODB_URI) {
  throw new Error('MONGODB_URI environment variable is required');
}

export const { NODE_ENV, PORT, MONGODB_URI, CLIENT_ORIGIN } = config;