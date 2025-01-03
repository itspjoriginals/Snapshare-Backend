const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const { createServer } = require('http'); // `node:http` alias is unnecessary here.

const authRoutes = require('./routes/authRoutes');
const fileShareRoutes = require('./routes/fileShareRoutes');

dotenv.config();

// Initialize database and models
require('./db');
require('./models/userModel');
require('./models/verificationModel');

const app = express();
const server = createServer(app);

const PORT = process.env.PORT || 8000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://snapshare-frontend.vercel.app';

const allowedOrigins = [FRONTEND_URL];

// CORS Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      console.log("Incoming request origin:", origin);
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.error('CORS Error: Not allowed by CORS for origin:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true, // Enables sending cookies and auth headers
  })
);

// Middleware
app.use(bodyParser.json());
app.use(cookieParser()); // Cookie parser doesn't need config here.
app.use('/public', express.static('public')); // Static files route

// Routes
app.use('/auth', authRoutes);
app.use('/file', fileShareRoutes);

// Test Route
app.get('/', (req, res) => {
  res.status(200).send('API is running....');
});

// Start the Server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Allowed Origins: ${allowedOrigins}`);
});
