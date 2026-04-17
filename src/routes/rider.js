// src/routes/rider.js

// Routes:
//   POST /api/rider/login            — rider login
//   POST /api/rider/availability     — toggle online/offline
//   POST /api/rider/location         — update GPS location
//   GET  /api/rider/active-order     — get current active order

import express from 'express';
import supabase from '../services/supabase.js';

const router = express.Router();

function formatPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');

  if (digits.startsWith('254')) return `+${digits}`;
  if (digits.startsWith('0')) return `+254${digits.slice(1)}`;
  if (digits.length === 9) return `+254${digits}`;

  return `+${digits}`;
}

// POST /api/rider/register
// Called when rider submits their application with documents
// Saves rider to database with status 'pending' for admin review

router.post('/register', async (req, res) => {
  try {
    const { phone, name, idPath, licPath, selfiePath } = req.body;

    if (!phone || !name) {
      return res.status(400).json({ error: 'Phone and name are required' });
    }

    // Check if rider already applied
    const { data: existing } = await supabase
      .from('riders')
      .select('id, status')
      .eq('phone', phone)
      .single();

    if (existing) {
      return res.json({
        success: true,
        status:  existing.status,
        message: 'Application already submitted'
      });
    }

    // Create new rider record with pending status
    const { data, error } = await supabase
      .from('riders')
      .insert({
        phone,
        name,
        status:             'pending',
        id_photo_url:       idPath    || null,
        license_photo_url:  licPath   || null,
        selfie_url:         selfiePath || null
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
// Called when rider enters their phone number
// Returns rider data if approved, error if pending/suspended

router.post('/login', async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'Phone number required' });
    }

    const { data: rider, error } = await supabase
      .from('riders')
      .select('*')
      .eq('phone', phone)
      .single();

    // Rider not found — they need to register
    if (!rider) {
      return res.json({ exists: false });
    }

    // Rider found but suspended
    if (rider.status === 'suspended') {
      return res.status(403).json({ 
        error: 'Your account has been suspended. Contact KFC Narok.' 
      });
    }


    // Rider found but still pending approval
    if (rider.status === 'pending') {
      return res.status(403).json({ 
        error: 'Your application is still under review. You will be notified within 24 hours.' 
      });
    }

    // Approved rider — return their data
    res.json({
      exists:      true,
      name:        rider.name,
      phone:       rider.phone,
      rating:      rider.rating,
      deliveries:  rider.total_deliveries,
      todayTrips:  rider.today_trips,
      status:      rider.status
    });

  } catch (err) {
    console.error('Rider login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/rider/availability
// Called when rider toggles the online/offline switch

router.post('/availability', async (req, res) => {
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
// Called every 60 seconds by startLocTracking() in frontend
// Updates rider GPS so customer can see them on the map

router.post('/location', async (req, res) => {
  try {
    const phone = req.headers['x-user-phone'];
    const { lat, lng } = req.body;

    if (!phone || !lat || !lng) {
      return res.status(400).json({ error: 'Phone, lat and lng required' });
    }

    const { error } = await supabase
      .from('riders')
      .update({ 
        current_lat: lat, 
        current_lng: lng 
      })
      .eq('phone', phone);

    if (error) throw error;

    res.json({ success: true });

  } catch (err) {
    console.error('Location update error:', err.message);
    res.status(500).json({ error: 'Could not update location' });
  }
});

// GET /api/rider/active-order
// Returns the rider's current active order if any
// Used to restore state if rider refreshes the page mid-delivery
router.get('/active-order', async (req, res) => {
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
      .single();

       // PGRST116 = no rows found — that's fine, just means no active order
    if (error && error.code !== 'PGRST116') throw error;

    res.json({ order: data || null });

  } catch (err) {
    console.error('Active order error:', err.message);
    res.status(500).json({ error: 'Could not fetch active order' });
  }
});

// GET /api/riders/available
router.get('/available', async (req, res) => {
  try {
    const { data } = await supabase
      .from('riders')
      .select('name, phone, rating, total_deliveries')
      .eq('status', 'approved')
      .eq('is_available', true)  // ← Fixed
      .order('rating', { ascending: false })
      .limit(10);
    
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


export default router;