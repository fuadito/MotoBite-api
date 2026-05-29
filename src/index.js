// src/index.js — MotoBite-api ENTRY POINT
// UPDATED 2026-05-30: Rider routes now handle auth inline (public login/register,
//                       protected everything else).  This fixes the 401 errors
//                       when admin (Supabase auth) tried to call /api/rider/available
//                       and when riders (phone auth) tried to log in.

import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import customerRoutes from './routes/customer.js';
import orderRoutes from './routes/orders.js';
import riderRoutes from './routes/rider.js';
import kitchenRoutes from './routes/kitchen.js';
import adminRoutes from './routes/admin.js';
import mpesaRoutes from './routes/mpesa.js';
import menuRoutes from './routes/menu.js';
import authRoutes from './routes/auth.js';
import staffAuthRoutes from './routes/staffAuth.js';
import { requireStaff, requireRole } from './middleware/staffAuth.js';
import { redispatchStaleOrders } from './services/dispatch.js';
import rateLimit from 'express-rate-limit';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
});

app.use('/api/auth', authLimiter);
app.use('/api', generalLimiter);

// CORS
const allowedOrigins = [
  'http://localhost:5500',
  'http://localhost:3000',
  'https://moto-bite-web.vercel.app',
  'https://motobite-api.onrender.com'
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    console.warn(`⚠️ CORS blocked request from origin: ${origin}`);
    callback(new Error('CORS policy: Origin not allowed'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'x-user-phone', 'Authorization'],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
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
}, 14 * 60 * 1000);

// ═══════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════

// Auth — no middleware
app.use('/api/auth', authRoutes);

// Public / customer-facing
app.use('/api/customer', customerRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/mpesa', mpesaRoutes);

// Staff authentication (separate from customer auth)
app.use('/api/staff', staffAuthRoutes);

// Protected staff routes
app.use('/api/kitchen', requireStaff, requireRole('kitchen', 'admin'), kitchenRoutes);
app.use('/api/admin',  requireStaff, requireRole('admin'),           adminRoutes);

// FIX: Rider routes now handle auth INLINE inside rider.js.
//      /login and /register are public; everything else is protected.
//      This lets Supabase-authenticated admins hit /api/rider/available
//      and phone-authenticated riders hit /api/rider/availability etc.
app.use('/api/rider', riderRoutes);

// 404 & ERROR HANDLERS
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

app.use((err, req, res, next) => {
  console.error('❌ Server error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// START SERVER
app.listen(PORT, () => {
  console.log(`✅ MotoBite-api running on http://localhost:${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/health`);

  setInterval(redispatchStaleOrders, 3 * 60 * 1000);
  console.log(`🔄 Re-dispatch timer started — checks every 3 minutes`);
});