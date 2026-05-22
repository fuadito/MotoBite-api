// src/index.js — MotoBite-api ENTRY POINT

// All imports MUST be at the top in ES modules
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import customerRoutes from './routes/customer.js';
import orderRoutes    from './routes/orders.js';
import riderRoutes    from './routes/rider.js';
import kitchenRoutes  from './routes/kitchen.js';
import adminRoutes    from './routes/admin.js';
import mpesaRoutes    from './routes/mpesa.js';
import menuRoutes     from './routes/menu.js';
import authRoutes     from './routes/auth.js';
import { redispatchStaleOrders } from './services/dispatch.js';
import rateLimit from 'express-rate-limit';


// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later.' }
});

// strict rate limit on auth endpoints to prevent abuse
const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
 skipSuccessfulRequests: true, // only count failed attempts
});
// Apply auth limiter to auth routes
app.use('/api/auth', authLimiter);
// Apply general limiter to all routes  
app.use('/api', generalLimiter);

// MIDDLEWARE

// Allow frontend to talk to backend (CORS)

const allowedOrigins = [
  'http://localhost:5500', // live server
  'http://localhost:3000', // In case frontend is served from same origin in production
  // Add your production frontend URL here, e.g. 'https://app.motobite.com'
  'https://moto-bite-web.vercel.app',
  'https://motobite-api.onrender.com'
].filter(Boolean); // Remove any empty values

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin || allowedOrigins.includes(origin)) {
     return callback(null, true);
    }
    console.warn(`⚠️ CORS blocked request from origin: ${origin}`);
    callback(new Error('CORS policy: Origin not allowed'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'x-user-phone', 'Authorization'],
  credentials: true // if you need to send cookies or auth headers from frontend, set this to true and ensure your frontend fetch/axios requests have credentials: 'include'
}));

// Parse incoming JSON request bodies
app.use(express.json());

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true }));


// HEALTH CHECK
// Visit http://localhost:3000/health to confirm server is running
app.get('/health', (req, res) => {
  res.json({
    status: 'running',
    app: 'MotoBite-api',
    time: new Date().toISOString()
  });
});


setInterval(async () => {
  try {
    await fetch(`${process.env.BACKEND_URL || 'http://localhost:3000'}/health`);
    console.log('🏓 Keep-alive ping sent');
  } catch(e) {}
}, 14 * 60 * 1000); // ping every 14 minutes


// ROUTES
// Each role has its own route file in src/routes/

// Auth routes — NO middleware (login endpoints)
app.use('/api/auth', authRoutes);

app.use('/api/customer', customerRoutes);
app.use('/api/orders',   orderRoutes);
app.use('/api/rider',    riderRoutes);
app.use('/api/kitchen',  kitchenRoutes);
app.use('/api/admin',    adminRoutes);
app.use('/api/mpesa',    mpesaRoutes);
app.use('/api/menu',     menuRoutes);


// 404 HANDLER
// Catches any route that doesn't exist
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ERROR HANDLER
// Catches any unhandled errors in routes
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// START SERVER
app.listen(PORT, () => {
  console.log(`✅ MotoBite-api running on http://localhost:${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/health`);

  // Re-dispatch any "ready" orders with no rider every 3 minutes
  // Catches cases where no riders were online when kitchen first marked ready
  setInterval(redispatchStaleOrders, 3 * 60 * 1000);
  console.log(`🔄 Re-dispatch timer started — checks every 3 minutes`);
});