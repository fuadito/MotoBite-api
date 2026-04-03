// src/routes/auth.js
// Authentication routes using Supabase Auth

import express from 'express';
import supabase from '../services/supabase.js';

const router = express.Router();

// POST /api/auth/admin/login
router.post('/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      console.warn(`🔐 Admin login failed for ${email}: ${error.message}`);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const role = data.user?.email === 'admin@kfcnarok.com' ? 'admin' :
    (data.user?.user_metadata?.role || 'customer');
    if (role !== 'admin') {
      console.warn(`🚫 Non-admin login attempt: ${email} (role: ${role})`);
      return res.status(403).json({ error: 'Admin access required' });
    }

    console.log(`✅ Admin logged in: ${email}`);

    res.json({
      success: true,
      token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        role: role
      }
    });

  } catch (err) {
    console.error('Admin login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/admin/refresh
router.post('/admin/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token
    });

    if (error) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    res.json({
      success: true,
      token: data.session.access_token,
      refresh_token: data.session.refresh_token
    });

  } catch (err) {
    console.error('Token refresh error:', err.message);
    res.status(500).json({ error: 'Refresh failed' });
  }
});

// POST /api/auth/send-otp (placeholder for future phone auth)
router.post('/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'Phone number required' });
    }

    res.json({
      success: false,
      message: 'Phone auth coming soon — continue using phone number login for now'
    });

  } catch (err) {
    console.error('Send OTP error:', err.message);
    res.status(500).json({ error: 'Could not send OTP' });
  }
});

export default router;
