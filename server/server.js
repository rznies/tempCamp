import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import hpp from 'hpp';
import mongoSanitize from 'express-mongo-sanitize';
import { NODE_ENV, PORT, MONGODB_URI, CLIENT_ORIGIN } from './config/env.js';
import authRoutes from './routes/auth.js';
import { errorHandler } from './middleware/error.js';

const app = express();

// Security middleware pipeline
app.use(helmet());
app.use(cors({
  origin: CLIENT_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(mongoSanitize());
app.use(hpp());
app.use(cookieParser());

// Rate limiting for API routes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again later'
});

// Request logging
if (NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(
    morgan('combined', {
      skip: (req, res) => res.statusCode < 400 || req.originalUrl === '/health'
    })
  );
}

// Body parsing and security
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// Application middleware
app.use(compression());
app.disable('x-powered-by');

// Database connection
mongoose.set('strictQuery', false);
const connectDB = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('📦 MongoDB Connected');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
};

// Health check endpoint
const healthCheckRouter = express.Router();
healthCheckRouter.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now()
  });
});
app.use(healthCheckRouter);

// Apply rate limiter to API routes
app.use('/api', apiLimiter);
app.use('/api/v1/auth', authRoutes);

// Error handling middleware
app.use(errorHandler);

// Start server with graceful shutdown
const server = app.listen(PORT, async () => {
  await connectDB();
  console.log(`🚀 Server running in ${NODE_ENV} mode on port ${PORT}`);
});

// Graceful shutdown
const shutdown = async (signal) => {
  console.log(`${signal} received: closing HTTP server`);
  server.close(async () => {
    console.log('HTTP server closed');
    await mongoose.connection.close();
    console.log('Database connection closed');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  shutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  shutdown('unhandledRejection');
});
