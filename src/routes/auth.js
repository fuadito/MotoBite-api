// src/routes/auth.js
// Authentication routes using Supabase Auth
// Admin signs in with email/password on the office computer
// Customers and riders use phone-based OTP via Africa's Talking

import express from 'express';
import supabase from '../services/supabase.js';
import { sendSMS } from '../services/sms.js';

const router = express.Router();


// In-memory OTP store (use Redis in production)
const otpStore = new Map();

function generatePIN() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// POST /api/auth/admin/login
router.post('/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: 'Invalid email or password' });

    const role = data.user?.user_metadata?.role;
    if (role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

    res.json({ success: true, token: data.session.access_token, refresh_token: data.session.refresh_token, user: { id: data.user.id, email: data.user.email, role } });
  } catch (err) { res.status(500).json({ error: 'Login failed' }); }
});

// POST /api/auth/admin/refresh
router.post('/admin/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) return res.status(400).json({ error: 'Refresh token required' });

    const { data, error } = await supabase.auth.refreshSession({ refresh_token });
    if (error) return res.status(401).json({ error: 'Invalid refresh token' });

    res.json({ success: true, token: data.session.access_token, refresh_token: data.session.refresh_token });
  } catch (err) { res.status(500).json({ error: 'Refresh failed' }); }
});

// POST /api/auth/send-otp
router.post('/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number required' });

    const normalizedPhone = phone.replace(/^\+/, '');
    const pin = generatePIN();
    
    otpStore.set(normalizedPhone, { pin, expiresAt: Date.now() + 5 * 60 * 1000 });
    await sendSMS(normalizedPhone, `Your verification code is ${pin}. Valid for 5 minutes.`);
    
    console.log(`📱 OTP sent to ${normalizedPhone}`);
    res.json({ success: true, message: 'Verification code sent' });
  } catch (err) { res.status(500).json({ error: 'Could not send OTP' }); }
});

// POST /api/auth/verify-otp
router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, pin } = req.body;
    if (!phone || !pin) return res.status(400).json({ error: 'Phone and PIN required' });

    const normalizedPhone = phone.replace(/^\+/, '');
    const stored = otpStore.get(normalizedPhone);
    if (!stored) return res.status(400).json({ error: 'No OTP sent to this phone' });
    if (Date.now() > stored.expiresAt) { otpStore.delete(normalizedPhone); return res.status(400).json({ error: 'OTP expired' }); }
    if (stored.pin !== pin) return res.status(401).json({ error: 'Invalid verification code' });

    otpStore.delete(normalizedPhone);
    res.json({ success: true, message: 'Phone verified successfully', phone: normalizedPhone });
  } catch (err) { res.status(500).json({ error: 'Verification failed' }); }
});

export default router;