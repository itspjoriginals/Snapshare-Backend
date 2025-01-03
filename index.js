const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const authRoutes = require('./routes/authRoutes');
const fileShareRoutes = require('./routes/fileShareRoutes');
const { createServer } = require('node:http');


dotenv.config();

require('./db');
require('./models/userModel');
require('./models/verificationModel');


const app = express();
const server = createServer(app);


const PORT = process.env.PORT || 8000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';


const allowedOrigins = [FRONTEND_URL];
app.use(
    cors({
        origin: function (origin, callback) {
            console.log("Incoming request origin:", origin);
            if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
                callback(null, true);
            } else {
                console.error('CORS Error: Not allowed by CORS for origin:', origin);
                callback(new Error('Not allowed by CORS'));
            }
        },
        credentials: true, 
    })
);

// Middleware
app.use(bodyParser.json());
app.use(
    cookieParser({
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', 
        sameSite: 'none',
        maxAge: 1000 * 60 * 60 * 24 * 7, 
        signed: true,
    })
);
app.use('/public', express.static('public')); 

// Routes
app.use('/auth', authRoutes);
app.use('/file', fileShareRoutes);

// Test Route
app.get('/', (req, res) => {
    res.send('API is running....');
});

// Start the Server
server.listen(PORT, () => {
    console.log(`Server running at ${PORT}`);
    console.log(`Allowed Origins: ${allowedOrigins}`);
});
