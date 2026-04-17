// src/routes/auth.js
// Authentication routes using Supabase Auth
// Admin signs in with email/password on the office computer
// Customers and riders use phone-based OTP via Twilio

import express from 'express';
import supabase from '../services/supabase.js';
import { sendSMS } from '../services/sms.js';

const router = express.Router();

// In-memory OTP store (use Redis in production)
const otpStore = new Map();

function generatePIN() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Format phone number
function formatPhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('254')) return `+${digits}`;
  if (digits.startsWith('0'))   return `+254${digits.slice(1)}`;
  if (digits.length === 9)      return `+254${digits}`;
  return `+${digits}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ADMIN AUTHENTICATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// POST /api/auth/admin/login
router.post('/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const role = data.user?.user_metadata?.role;
    if (role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    res.json({ 
      success: true, 
      token: data.session.access_token, 
      refresh_token: data.session.refresh_token, 
      user: { 
        id: data.user.id, 
        email: data.user.email, 
        role 
      } 
    });
  } catch (err) {
    console.error('Admin login error:', err);
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

    const { data, error } = await supabase.auth.refreshSession({ refresh_token });
    if (error) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    res.json({ 
      success: true, 
      token: data.session.access_token, 
      refresh_token: data.session.refresh_token 
    });
  } catch (err) {
    console.error('Token refresh error:', err);
    res.status(500).json({ error: 'Refresh failed' });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CUSTOMER/RIDER OTP AUTHENTICATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// POST /api/auth/send-otp
// Send verification code to phone number
router.post('/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    
    if (!phone) {
      return res.status(400).json({ error: 'Phone number required' });
    }

    const normalizedPhone = formatPhone(phone);
    
    // Rate limiting: check if OTP was sent recently
    const existing = otpStore.get(normalizedPhone);
    if (existing && Date.now() - existing.sentAt < 30000) {
      const remaining = Math.ceil((30000 - (Date.now() - existing.sentAt)) / 1000);
      return res.status(429).json({ 
        error: `Please wait ${remaining} seconds before requesting again` 
      });
    }

    const pin = generatePIN();
    
    otpStore.set(normalizedPhone, { 
      pin, 
      expiresAt: Date.now() + 5 * 60 * 1000,
      sentAt: Date.now(),
      attempts: 0
    });
    
    const message = 
      `MotoBite Verification Code: ${pin}\n\n` +
      `This code expires in 5 minutes.\n` +
      `Do not share this code with anyone.`;

    const sent = await sendSMS(normalizedPhone, message);
    
    if (!sent) {
      otpStore.delete(normalizedPhone);
      return res.status(500).json({ error: 'Could not send SMS. Please try again.' });
    }
    
    console.log(`📱 OTP sent to ${normalizedPhone}`);
    res.json({ 
      success: true, 
      message: 'Verification code sent',
      phone: normalizedPhone
    });
    
  } catch (err) {
    console.error('Send OTP error:', err);
    res.status(500).json({ error: 'Could not send OTP' });
  }
});

// POST /api/auth/verify-otp
// Verify the OTP code
router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, pin, code } = req.body;
    const otpCode = pin || code; // Accept both 'pin' and 'code'
    
    if (!phone || !otpCode) {
      return res.status(400).json({ 
        success: false,
        error: 'Phone and code required' 
      });
    }

    const normalizedPhone = formatPhone(phone);
    const stored = otpStore.get(normalizedPhone);
    
    if (!stored) {
      return res.status(400).json({ 
        success: false,
        error: 'No OTP sent to this phone. Please request a new code.' 
      });
    }
    
    // Check expiration
    if (Date.now() > stored.expiresAt) {
      otpStore.delete(normalizedPhone);
      return res.status(400).json({ 
        success: false,
        error: 'OTP expired. Please request a new code.' 
      });
    }
    
    // Check attempts (max 3)
    if (stored.attempts >= 3) {
      otpStore.delete(normalizedPhone);
      return res.status(400).json({ 
        success: false,
        error: 'Too many attempts. Please request a new code.' 
      });
    }
    
    // Verify code
    if (stored.pin !== otpCode) {
      stored.attempts++;
      const remaining = 3 - stored.attempts;
      return res.status(401).json({ 
        success: false,
        error: `Invalid code. ${remaining} attempts remaining.` 
      });
    }

    // ✅ Valid OTP - delete from store
    otpStore.delete(normalizedPhone);

    // Check if customer exists
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('*')
      .eq('phone', normalizedPhone)
      .maybeSingle();

    console.log(`✅ OTP verified for ${normalizedPhone}`);
    
    res.json({ 
      success: true, 
      message: 'Phone verified successfully', 
      phone: normalizedPhone,
      isNewUser: !existingCustomer,
      customer: existingCustomer || null
    });
    
  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ 
      success: false,
      error: 'Verification failed' 
    });
  }
});

// POST /api/auth/register
// Complete customer registration after OTP verification
router.post('/register', async (req, res) => {
  try {
    const { phone, name } = req.body;

    if (!phone || !name) {
      return res.status(400).json({ error: 'Phone and name are required' });
    }

    const normalizedPhone = formatPhone(phone);

    // Validate name
    if (name.length < 2) {
      return res.status(400).json({ error: 'Name must be at least 2 characters' });
    }

    // Create or update customer
    const { data: customer, error } = await supabase
      .from('customers')
      .upsert({
        phone: normalizedPhone,
        name: name.trim(),
        created_at: new Date().toISOString()
      }, {
        onConflict: 'phone'
      })
      .select()
      .single();

    if (error) {
      console.error('Customer creation error:', error);
      return res.status(500).json({ error: 'Could not create account' });
    }

    console.log(`✅ Customer registered: ${name} (${normalizedPhone})`);

    res.json({ 
      success: true, 
      message: 'Account created successfully',
      customer: customer
    });

  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
// Login existing customer (sends OTP)
router.post('/login', async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const normalizedPhone = formatPhone(phone);

    // Check if customer exists
    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('phone', normalizedPhone)
      .maybeSingle();

    if (!customer) {
      return res.status(404).json({ 
        error: 'No account found. Please register first.',
        needsRegistration: true
      });
    }

    // Send OTP for login verification
    const pin = generatePIN();
    
    otpStore.set(normalizedPhone, { 
      pin, 
      expiresAt: Date.now() + 5 * 60 * 1000,
      sentAt: Date.now(),
      attempts: 0
    });
    
    const message = 
      `MotoBite Login Code: ${pin}\n\n` +
      `This code expires in 5 minutes.`;

    const sent = await sendSMS(normalizedPhone, message);
    
    if (!sent) {
      return res.status(500).json({ error: 'Could not send verification code' });
    }

    console.log(`📱 Login OTP sent to ${normalizedPhone}`);
    
    res.json({ 
      success: true, 
      message: 'Verification code sent' 
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

export default router;