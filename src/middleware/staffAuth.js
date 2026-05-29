// src/middleware/staffAuth.js
// JWT + Supabase + Phone hybrid auth middleware
// UPDATED 2026-05-30: Now accepts Supabase Auth tokens (admin web app)
//                     and x-user-phone header auth (riders / kitchen)

import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * requireStaff — tries THREE auth methods in order:
 *  1. Legacy staff JWT (Bearer token signed with JWT_SECRET)
 *  2. Supabase JWT     (Bearer token from admin web app → role = 'admin')
 *  3. Phone header     (x-user-phone → role = 'rider')
 */
export async function requireStaff(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    // ── Method 1: Legacy staff JWT ──
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.staff = decoded;
        return next();
      } catch {
        // Not a valid staff JWT — fall through to Supabase check
      }

      // ── Method 2: Supabase JWT (admin web app) ──
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (!error && user) {
        req.staff = { role: 'admin', user_id: user.id, authMethod: 'supabase' };
        return next();
      }
    }

    // ── Method 3: Phone-based auth (riders & kitchen) ──
    const phone = req.headers['x-user-phone'];
    if (phone) {
      const normalizedPhone = phone.startsWith('+') ? phone : `+${phone}`;
      if (/^\+254\d{9}$/.test(normalizedPhone)) {
        req.staff = { role: 'rider', phone: normalizedPhone, authMethod: 'phone' };
        return next();
      }
    }

    return res.status(401).json({ error: 'Authentication required' });
  } catch (err) {
    console.error('❌ Auth middleware error:', err.message);
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.staff) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!allowedRoles.includes(req.staff.role)) {
      return res.status(403).json({ error: 'Access denied for this role' });
    }
    next();
  };
}