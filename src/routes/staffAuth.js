// src/routes/staffAuth.js
// Separate authentication for staff (kitchen, rider, admin)

import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import supabase from '../services/supabase.js';

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';
const TOKEN_EXPIRY = '8h';


// POST /api/staff/login
router.post('/login', async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password || !role) {
      return res.status(400).json({ error: 'Email, password, and role are required' });
    }

    const { data: staff, error } = await supabase
      .from('staff')
      .select('*')
      .eq('email', email.toLowerCase().trim())
      .eq('role', role)
      .single();

    if (error || !staff) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!staff.is_active) {
      return res.status(403).json({ error: 'Account is inactive. Contact admin.' });
    }

    const valid = await bcrypt.compare(password, staff.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    await supabase
      .from('staff')
      .update({ last_login: new Date().toISOString() })
      .eq('id', staff.id);

    const token = jwt.sign(
      { sub: staff.id, email: staff.email, role: staff.role, name: staff.name },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    res.json({
      success: true,
      token,
      staff: { id: staff.id, email: staff.email, name: staff.name, role: staff.role }
    });
  } catch (err) {
    console.error('Staff login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/staff/me
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token required' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);

    const { data: staff, error } = await supabase
      .from('staff')
      .select('id, email, name, role, is_active, created_at')
      .eq('id', decoded.sub)
      .single();

    if (error || !staff || !staff.is_active) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    res.json({ staff });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

export default router;