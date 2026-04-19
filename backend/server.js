const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const chatRoutes = require('./routes/chat');
const researchRoutes = require('./routes/research');
const sessionRoutes = require('./routes/sessions');

const app = express();
app.get('/', (req, res) => {
  res.send('CuraLink Backend API is running');
});
app.use(cors({
  origin: [
    'http://localhost:3000',
     process.env.FRONTEND_URL
  ],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Routes
app.use('/api/chat', chatRoutes);
app.use('/api/research', researchRoutes);
app.use('/api/sessions', sessionRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// MongoDB connection
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/curalink';
    await mongoose.connect(mongoURI);
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.warn('⚠️  MongoDB not available, running without persistence:', err.message);
  }
};

connectDB();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Curalink backend running on port ${PORT}`);
});

module.exports = app;
