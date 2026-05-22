// src/middleware/auth.js — Enhanced version
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function authenticate(req, res, next) {
    try {
        // Method 1: Supabase JWT (admin sessions)
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const { data: { user }, error } = await supabase.auth.getUser(token);
            
            if (!error && user) {
                req.user = { ...user, authMethod: 'supabase' };
                return next();
            }
        }
        
        // Method 2: Phone-based auth (riders, kitchen, customers)
        const phone = req.headers['x-user-phone'];
        if (phone) {
            // Validate phone format
            const normalizedPhone = phone.startsWith('+') ? phone : `+${phone}`;
            if (!/^\+254\d{9}$/.test(normalizedPhone)) {
                return res.status(401).json({ error: 'Invalid phone format' });
            }
            
            req.user = { phone: normalizedPhone, authMethod: 'phone' };
            return next();
        }
        
        return res.status(401).json({ error: 'Authentication required' });
        
    } catch (error) {
        console.error('❌ Auth middleware error:', error);
        return res.status(500).json({ error: 'Authentication failed' });
    }
}