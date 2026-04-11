// src/index.js — KFC NAROK BACKEND ENTRY POINT

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

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// MIDDLEWARE

// Allow frontend to talk to backend (CORS)
app.use(cors({
  origin: '*', // In production one can restrict this to their domain
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'x-user-phone', 'Authorization']
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
    app: 'KFC Narok Backend',
    time: new Date().toISOString()
  });
});

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
  console.log(`✅ KFC Narok Backend running on http://localhost:${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/health`);

  // Re-dispatch any "ready" orders with no rider every 3 minutes
  // Catches cases where no riders were online when kitchen first marked ready
  setInterval(redispatchStaleOrders, 3 * 60 * 1000);
  console.log(`🔄 Re-dispatch timer started — checks every 3 minutes`);
});