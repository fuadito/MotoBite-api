// src/routes/kitchen.js

// Routes:
//   POST /api/kitchen/verify              — verify kitchen passcode
//   GET  /api/kitchen/orders              — get all active orders
//   POST /api/kitchen/orders/:id/status   — update order status (triggers dispatch on 'ready')

import express from 'express';
import supabase from '../services/supabase.js';
import { dispatchOrder } from '../services/dispatch.js';

const router = express.Router();
// POST /api/kitchen/verify
// Kitchen staff enter a passcode to access the order board
// Passcode is set in KITCHEN_CODE environment variable on Railway
// Called by authSubmit() in the frontend when role === 'kitchen'

router.post('/verify', (req, res) => {
  const { code } = req.body;

    if(!process.env.KITCHEN_CODE){
    console.error('❌ KITCHEN_CODE env var not set in Render');
    return res.json({ ok: false, error: 'Kitchen code not configured' });
  }


  if (!code) {
    return res.status(400).json({ ok: false, error: 'Passcode required' });
  }

  if (code !== process.env.KITCHEN_CODE) {
    console.log(`🔐 Wrong kitchen passcode attempt`);
    return res.json({ ok: false });
  }

  console.log(`✅ Kitchen access granted`);
  res.json({ ok: true });
});


// GET /api/kitchen/orders
// Returns all orders that kitchen needs to see:
// pending, paid (new), cooking, ready, rider_assigned
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

    const allowed = ['cooking', 'ready'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Fetch order so we can check order_type before dispatching
    const { data: order } = await supabase
      .from('orders')
      .select('id, order_type, order_number')
      .eq('id', id)
      .single();

    const { error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', id);

    if (error) throw error;

    console.log(`🍳 Order ${id} status → ${status}`);

    // Only dispatch riders for delivery orders — pickup customers collect at counter
    if (status === 'ready' && order?.order_type !== 'pickup') {
      dispatchOrder(parseInt(id))
        .then(result => {
          if (result.noRiders) {
            console.warn(`⚠️  Order ${id} ready but no riders online — will retry in 3 mins`);
          } else if (result.success) {
            console.log(`📡 Order ${id} dispatched to ${result.riderCount} rider(s)`);
          } else {
            console.error(`❌ Dispatch failed for order ${id}:`, result.error);
          }
        });
    } else if (status === 'ready' && order?.order_type === 'pickup') {
      console.log(`🚶 Pickup order ${order.order_number} ready for collection — no dispatch needed`);
    }

    res.json({ success: true, status });

  } catch (err) {
    console.error('Kitchen status update error:', err.message);
    res.status(500).json({ error: 'Could not update order status' });
  }
});


export default router;
