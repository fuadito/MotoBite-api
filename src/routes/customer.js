// src/routes/customer.js
// Routes:
//   POST /api/customer/login       — register or login customer
//   GET  /api/customer/orders      — get customer order history


import express from 'express';
import supabase from '../services/supabase.js';

const router = express.Router();

// POST /api/customer/login
// If customer exists — return their data
// If new — create their record

router.post('/login', async (req, res) => {
  try {
    const { phone, name } = req.body;

    if (!phone || !name) {
      return res.status(400).json({ error: 'Phone and name are required' });
    }

    // Check if customer already exists
    const { data: existing } = await supabase
      .from('customers')
      .select('*')
      .eq('phone', phone)
      .single();

    if (existing) {
      // Update name and return
      const { data, error } = await supabase
        .from('customers')
        .update({ name })
        .eq('phone', phone)
        .select()
        .single();

      if (error) throw error;
      return res.json({ customer: data, isNew: false });
    }

    // New customer — create record
    const { data, error } = await supabase
      .from('customers')
      .insert({ phone, name })
      .select()
      .single();

    if (error) throw error;
    return res.json({ customer: data, isNew: true });

  } catch (err) {
    console.error('Customer login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/customer/orders
// Returns last 20 orders for the logged-in customer
// Phone comes from x-user-phone header (sent by apiFetch)

router.get('/orders', async (req, res) => {
  try {
    const phone = req.headers['x-user-phone'];

    if (!phone) {
      return res.status(400).json({ error: 'Phone number required' });
    }

    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('customer_phone', phone)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    res.json({ orders: data || [] });

  } catch (err) {
    console.error('Get orders error:', err.message);
    res.status(500).json({ error: 'Could not fetch orders' });
  }
});


export default router;