// src/routes/orders.js
// @ts-nocheck

// Routes:
//   POST /api/orders                    — create new order
//   GET  /api/orders/history            — customer order history
//   GET  /api/orders/:id                — get order status
//   POST /api/orders/:id/accept         — rider accepts order
//   POST /api/orders/:id/pay            — trigger M-Pesa STK push
//   POST /api/orders/:id/rate           — submit food + rider rating
//   POST /api/orders/:id/collected      — rider collected from KFC
//   POST /api/orders/:id/confirm-pin    — rider confirms delivery PIN


import express from 'express';
import bcrypt  from 'bcryptjs';
import supabase from '../services/supabase.js';
import { sendDeliveryPIN } from '../services/sms.js';

const router = express.Router();

// POST /api/orders
// Creates a new order in the database
// Called by initPay() in the frontend after cart is confirmed

router.post('/', async (req, res) => {
  try {
    const phone = req.headers['x-user-phone'];
    const { items, notes, location, mpesa_reference } = req.body;

    if (!phone || !items || !items.length) {
      return res.status(400).json({ error: 'Phone and items are required' });
    }

    const food_amount = items.reduce((sum, i) => sum + i.price, 0);

    // Fetch customer name FIRST — before the insert so it's available
    const { data: customer } = await supabase
      .from('customers')
      .select('name')
      .eq('phone', phone)
      .single();

    // Generate PIN before insert — hash for DB, send plain via SMS
    const pin            = Math.floor(1000 + Math.random() * 9000).toString();
    const pin_hash       = await bcrypt.hash(pin, 10);
    const pin_expires_at = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('orders')
      .insert({
        customer_phone:  phone,
        items:           items,
        special_notes:   notes || null,
        food_amount:     food_amount,
        customer_lat:    location?.lat || null,
        customer_lng:    location?.lng || null,
        location:        location || null,
        customer_area:   location?.areaName || location?.area || 'Narok Town',
        mpesa_reference: mpesa_reference || null,
        pin_hash:        pin_hash,
        pin_expires_at:  pin_expires_at,
        pin_attempts:    0,
        status:          'pending',
        customer_name:   customer?.name || null,
      })
      .select()
      .single();

    if (error) throw error;

      // Trigger M-Pesa STK push — customer gets a payment prompt on their phone
    // Fire-and-forget: don't block the order response waiting for Daraja
    let stkSent = false;
    try {
      const stkRes = await fetch(
        `${process.env.BACKEND_URL || 'http://localhost:3000'}/api/mpesa/stk-push`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ orderId: data.id, phone, amount: food_amount })
        }
      );
      const stkData = await stkRes.json();
      stkSent = !!stkData.success;
      if (stkSent)         console.log(`💳 STK push sent for order ${data.order_number}`);
      else if (stkData.pending) console.log(`💳 STK skipped — credentials pending`);
      else                 console.warn(`⚠️  STK push failed for order ${data.order_number}`);
    } catch(e) {
      console.warn(`⚠️  STK push error for order ${data.order_number}:`, e.message);
    }

    res.json({
      id:           data.id,
      order_number: data.order_number,
      status:       data.status,
      stkSent:      stkSent
    });

    // Send delivery PIN via SMS after response — non-blocking
    sendDeliveryPIN(phone, data.order_number, pin)
      .then(r => {
        if (r?.success) console.log(`📱 PIN SMS sent to ${phone} for order ${data.order_number}`);
        else console.warn(`⚠️  PIN SMS failed for ${phone}:`, r?.error);
      });

  } catch (err) {
    console.error('Create order error:', err.message);
    res.status(500).json({ error: 'Could not create order' });
  }
});



// GET /api/orders/history
// Returns last 20 orders for the logged-in customer
// Called by loadHistory() in the frontend
// NOTE: Must be defined BEFORE /:id to avoid Express treating 'history' as an id

router.get('/history', async (req, res) => {
  try {
    const phone = req.headers['x-user-phone'];

    if (!phone) {
      return res.status(400).json({ error: 'Phone number required' });
    }

    const { data, error } = await supabase
      .from('orders')
      .select('id, order_number, status, food_amount, items, created_at, customer_area')
      .eq('customer_phone', phone)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    res.json({ orders: data || [] });

  } catch (err) {
    console.error('Order history error:', err.message);
    res.status(500).json({ error: 'Could not fetch order history' });
  }
});



// GET /api/orders/:id
// Returns full order details including status
// Called every 12 seconds by renderTracking() in frontend

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('orders')
      .select('*, riders(name, phone, rating, current_lat, current_lng)')
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Add rider lat/lng at top level for easy access in frontend
    res.json({
      ...data,
      rider_lat: data.riders?.current_lat || null,
      rider_lng: data.riders?.current_lng || null,
    });

  } catch (err) {
    console.error('Get order error:', err.message);
    res.status(500).json({ error: 'Could not fetch order' });
  }
});



// POST /api/orders/:id/accept
// Rider accepts a dispatched order
// Called by acceptOrder() in the frontend
// Sets status to rider_assigned and records the rider's phone

router.post('/:id/accept', async (req, res) => {
  try {
    const { id }  = req.params;
    const phone   = req.headers['x-user-phone'];

    if (!phone) {
      return res.status(400).json({ error: 'Phone required' });
    }

    // Guard: only assign if not already taken by another rider
    const { data: existing } = await supabase
      .from('orders')
      .select('rider_phone, status')
      .eq('id', id)
      .single();

    if (existing?.rider_phone && existing.rider_phone !== phone) {
      return res.status(409).json({ error: 'Order already accepted by another rider' });
    }

    // Fetch rider name so it shows on the customer tracking screen
    const { data: riderRow } = await supabase
      .from('riders')
      .select('name, rating')
      .eq('phone', phone)
      .single();

    const { error } = await supabase
      .from('orders')
      .update({
        status: 'rider_assigned',
        rider_phone: phone,
        rider_name: riderRow?.name || null,
        rider_rating: riderRow?.rating || null,
        assigned_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) throw error;

    console.log(`🏍️  Order ${id} accepted by rider ${phone} (${riderRow?.name})`);
    res.json({ success: true });

  } catch (err) {
    console.error('Accept order error:', err.message);
    res.status(500).json({ error: 'Could not accept order' });
  }
});

// POST /api/orders/:id/pay
// Triggers M-Pesa STK Push to customer's phone
// Called after order is created

router.post('/:id/pay', async (req, res) => {
  try {
    const { id } = req.params;
    const phone = req.headers['x-user-phone'];

    // Get the order
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // TODO: Trigger real M-Pesa STK push here
    // We will wire this up when Daraja credentials are ready
    console.log(`💳 STK push for ${phone} — KES ${order.food_amount}`);

    res.json({ success: true, message: 'M-Pesa prompt sent' });

  } catch (err) {
    console.error('Pay error:', err.message);
    res.status(500).json({ error: 'Payment initiation failed' });
  }
});

// POST /api/orders/:id/rate
// Saves food and rider star ratings
// Called by submitRating() in frontend after delivery

router.post('/:id/rate', async (req, res) => {
  try {
    const { id } = req.params;
    const phone = req.headers['x-user-phone'];
    const { foodStars, riderStars } = req.body;

    if (!foodStars || !riderStars) {
      return res.status(400).json({ error: 'Both ratings required' });
    }

    // Get the order to find rider phone
    const { data: order } = await supabase
      .from('orders')
      .select('rider_phone')
      .eq('id', id)
      .single();

    // Save rating
    const { error } = await supabase
      .from('ratings')
      .insert({
        order_id:       parseInt(id),
        customer_phone: phone,
        rider_phone:    order?.rider_phone || null,
        food_stars:     foodStars,
        rider_stars:    riderStars
      });

    if (error) throw error;

    res.json({ success: true });

  } catch (err) {
    console.error('Rating error:', err.message);
    res.status(500).json({ error: 'Could not save rating' });
  }
});

// POST /api/orders/:id/collected
// Rider marks that they have collected the order from KFC
// Updates order status to picked_up

router.post('/:id/collected', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('orders')
      .update({ status: 'picked_up' })
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true });

  } catch (err) {
    console.error('Collected error:', err.message);
    res.status(500).json({ error: 'Could not update order' });
  }
});

// POST /api/orders/:id/confirm-pin
// Rider enters the 4-digit PIN the customer received via SMS
// If correct — order is marked delivered

router.post('/:id/confirm-pin', async (req, res) => {
  try {
    const { id } = req.params;
    const { pin } = req.body;

    // Get the order — fetch all fields needed for security checks
    // delivery_pin is NOT selected — we compare against pin_hash only
    const { data: order, error } = await supabase
      .from('orders')
      .select('pin_hash, pin_expires_at, pin_attempts, status, rider_phone')
      .eq('id', id)
      .single();

    if (error || !order) {
      return res.status(404).json({ error: 'Order not found' });
    }

// Already delivered — block replay
    if (order.status === 'delivered') {
      return res.json(null);
    }

    // Lockout after 3 wrong attempts
    if (order.pin_attempts >= 3) {
      console.warn(`🔒 Order ${id} PIN locked — too many wrong attempts`);
      return res.status(403).json({ error: 'Too many attempts. Contact KFC Narok.' });
    }

    // Check expiry
    if (new Date() > new Date(order.pin_expires_at)) {
      console.warn(`⏰ Order ${id} PIN expired`);
      return res.status(403).json({ error: 'PIN has expired. Contact KFC Narok.' });
    }

     // Guard: pin_hash wiped after delivery — reject immediately
    if (!order.pin_hash) {
      return res.json(null);
    }

    // Compare against hash
    const match = await bcrypt.compare(pin, order.pin_hash);

    if (!match) {
      await supabase
        .from('orders')
        .update({ pin_attempts: order.pin_attempts + 1 })
        .eq('id', id);

      console.log(`❌ Wrong PIN for order ${id} — attempt ${order.pin_attempts + 1}/3`);
      return res.json(null); // frontend shows red shake — same response as wrong PIN
    }

     // ✅ Correct — mark delivered and wipe hash
    await supabase
      .from('orders')
      .update({
        status:       'delivered',
        delivered_at:  new Date().toISOString(),
        pin_hash:      null,  // wiped — can never be reused
        pin_attempts:  0
      })
      .eq('id', id);

        if (order.rider_phone) {
      await supabase.rpc('increment_rider_trips', {
        rider_phone: order.rider_phone
      });
    }

    console.log(`✅ Order ${id} delivered — PIN confirmed`);
    res.json({ success: true });

  } catch (err) {
    console.error('Confirm PIN error:', err.message);
    res.status(500).json({ error: 'Could not confirm delivery' });
  }
});


export default router;