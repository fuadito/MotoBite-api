// src/routes/rider.js
// Routes:
// POST /api/rider/login        — PUBLIC  (no auth)
// POST /api/rider/register     — PUBLIC  (no auth)
// POST /api/rider/availability — PROTECTED (rider / admin)
// POST /api/rider/location     — PROTECTED (rider / admin)
// GET  /api/rider/active-order — PROTECTED (rider / admin)
// GET  /api/rider/available    — PROTECTED (rider / admin)
// POST /api/rider/:id/decline  — PROTECTED (rider / admin)

import express from 'express';
import supabase from '../services/supabase.js';
import { requireStaff, requireRole } from '../middleware/staffAuth.js';

const router = express.Router();

function formatPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('254')) return `+${digits}`;
  if (digits.startsWith('0')) return `+254${digits.slice(1)}`;
  if (digits.length === 9) return `+254${digits}`;
  return `+${digits}`;
}

// ═══════════════════════════════════════════════════════════
// PUBLIC ENDPOINTS (no auth required)
// ═══════════════════════════════════════════════════════════

// POST /api/rider/register
router.post('/register', async (req, res) => {
  try {
    const { phone: rawPhone, name, idPath, licPath, selfiePath } = req.body;
    if (!rawPhone || !name) {
      return res.status(400).json({ error: 'Phone and name are required' });
    }
    const phone = formatPhone(rawPhone);

    const { data: existing } = await supabase
      .from('riders')
      .select('id, status')
      .eq('phone', phone)
      .maybeSingle();

    if (existing) {
      return res.json({
        success: true,
        status: existing.status,
        message: 'Application already submitted'
      });
    }

    const { data, error } = await supabase
      .from('riders')
      .insert({
        phone,
        name,
        status: 'pending',
        id_photo_url: idPath || null,
        license_photo_url: licPath || null,
        selfie_url: selfiePath || null
      })
      .select()
      .single();

    if (error) throw error;
    console.log(`🏍️ New rider application: ${name} (${phone})`);
    res.json({ success: true, status: 'pending' });
  } catch (err) {
    console.error('Rider register error:', err.message);
    res.status(500).json({ error: 'Could not save application' });
  }
});

// POST /api/rider/login
router.post('/login', async (req, res) => {
  try {
    const { phone: rawPhone } = req.body;
    if (!rawPhone) {
      return res.status(400).json({ error: 'Phone number required' });
    }
    const phone = formatPhone(rawPhone);

    const { data: rider } = await supabase
      .from('riders')
      .select('*')
      .eq('phone', phone)
      .maybeSingle();

    if (!rider) {
      return res.json({ exists: false });
    }
    if (rider.status === 'suspended') {
      return res.status(403).json({
        error: 'Your account has been suspended. Contact MotoBite.'
      });
    }
    if (rider.status === 'pending') {
      return res.status(403).json({
        error: 'Your application is still under review. You will be notified within 24 hours.'
      });
    }

    res.json({
      exists: true,
      name: rider.name,
      phone: rider.phone,
      rating: rider.rating,
      deliveries: rider.total_deliveries,
      todayTrips: rider.today_trips,
      status: rider.status
    });
  } catch (err) {
    console.error('Rider login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ═══════════════════════════════════════════════════════════
// PROTECTED ENDPOINTS (requireStaff + requireRole)
// ═══════════════════════════════════════════════════════════

// POST /api/rider/availability
router.post('/availability', requireStaff, requireRole('rider', 'admin'), async (req, res) => {
  try {
    const rawPhone = req.headers['x-user-phone'];
    const phone = formatPhone(rawPhone);
    const { available } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'Phone required' });
    }

    const { error } = await supabase
      .from('riders')
      .update({ is_available: available })
      .eq('phone', phone);

    if (error) throw error;
    console.log(`🏍️ Rider ${phone} is now ${available ? 'ONLINE' : 'offline'}`);
    res.json({ success: true, available });
  } catch (err) {
    console.error('Availability error:', err.message);
    res.status(500).json({ error: 'Could not update availability' });
  }
});

// POST /api/rider/location
router.post('/location', requireStaff, requireRole('rider', 'admin'), async (req, res) => {
  try {
    const phone = req.headers['x-user-phone'];
    const { lat, lng } = req.body;

    if (!phone || !lat || !lng) {
      return res.status(400).json({ error: 'Phone, lat and lng required' });
    }

    const { error } = await supabase
      .from('riders')
      .update({ current_lat: lat, current_lng: lng })
      .eq('phone', phone);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('Location update error:', err.message);
    res.status(500).json({ error: 'Could not update location' });
  }
});

// GET /api/rider/active-order
router.get('/active-order', requireStaff, requireRole('rider', 'admin'), async (req, res) => {
  try {
    const rawPhone = req.headers['x-user-phone'];
    const phone = formatPhone(rawPhone);

    if (!phone) {
      return res.status(400).json({ error: 'Phone required' });
    }

    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('rider_phone', phone)
      .in('status', ['rider_assigned', 'picked_up'])
      .maybeSingle();

    if (error) throw error;
    res.json({ order: data || null });
  } catch (err) {
    console.error('Active order error:', err.message);
    res.status(500).json({ error: 'Could not fetch active order' });
  }
});

// GET /api/rider/available
router.get('/available', requireStaff, requireRole('rider', 'admin'), async (req, res) => {
  try {
    const { data } = await supabase
      .from('riders')
      .select('name, phone, rating, total_deliveries')
      .eq('status', 'approved')
      .eq('is_available', true)
      .order('rating', { ascending: false })
      .limit(10);

    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/rider/:id/decline
router.post('/:id/decline', requireStaff, requireRole('rider', 'admin'), async (req, res) => {
  // Temporarily mark rider unavailable for 5 minutes
  const phone = req.headers['x-user-phone'];
  // Store decline in a simple in-memory set or add declined_until field
  res.json({ success: true });
});

export default router;