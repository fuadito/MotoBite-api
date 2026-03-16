// src/routes/kitchen.js

// Routes:
//   GET  /api/kitchen/orders              — get all active orders
//   POST /api/kitchen/orders/:id/status   — update order status

import express from 'express';
import supabase from '../services/supabase.js';

const router = express.Router();

// GET /api/kitchen/orders
// Returns all orders that kitchen needs to see:
// paid (new), cooking, ready, rider_assigned
// Called every 8 seconds by pollKitchen() in frontend

router.get('/orders', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .in('status', ['pending','paid', 'cooking', 'ready', 'rider_assigned'])
      .order('created_at', { ascending: true }); // oldest first — FIFO

    if (error) throw error;

    res.json({ orders: data || [] });

  } catch (err) {
    console.error('Kitchen orders error:', err.message);
    res.status(500).json({ error: 'Could not fetch orders' });
  }
});

// POST /api/kitchen/orders/:id/status
// Kitchen staff taps "Start Cooking" or "Mark Ready"
// Updates the order status in the database
// The timestamp (cooking_started_at, ready_at) is set
// automatically by the trigger we created in Supabase
// ============================================================
router.post('/orders/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Only allow valid kitchen status updates
    const allowed = ['cooking', 'ready'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const { error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', id);

    if (error) throw error;

    // Log for visibility in terminal
    console.log(`🍳 Order ${id} status → ${status}`);

    res.json({ success: true, status });

  } catch (err) {
    console.error('Kitchen status update error:', err.message);
    res.status(500).json({ error: 'Could not update order status' });
  }
});


export default router;
