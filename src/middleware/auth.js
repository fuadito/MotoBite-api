// src/middleware/auth.js
// Verifies Supabase Auth JWT token from Authorization header
// Attaches the authenticated user to req.user

import supabase from '../services/supabase.js';

export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.replace('Bearer ', '');

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = {
      id: user.id,
      phone: user.phone || user.user_metadata?.phone || null,
      email: user.email || null,
      role: user.user_metadata?.role || 'customer'
    };

    next();
  } catch (err) {
    console.error('Auth middleware error:', err.message);
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

// Transition middleware — accepts token OR x-user-phone header
// REMOVE THIS once frontend is fully migrated to tokens
export async function authenticateOrHeader(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (!error && user) {
        req.user = {
          id: user.id,
          phone: user.phone || user.user_metadata?.phone || null,
          email: user.email || null,
          role: user.user_metadata?.role || 'customer'
        };
        return next();
      }
    }

    const phone = req.headers['x-user-phone'];
    if (phone) {
      req.user = { id: null, phone, email: null, role: 'customer' };
      return next();
    }

    return res.status(401).json({ error: 'Authentication required' });
  } catch (err) {
    console.error('Auth middleware error:', err.message);
    return res.status(401).json({ error: 'Authentication failed' });
  }
}