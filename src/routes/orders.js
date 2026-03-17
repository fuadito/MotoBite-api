// src/routes/orders.js

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
import bcrypt  from 'bcrypt';
import supabase from '../services/supabase.js';
import { sendDeliveryPIN } from '../services/sms.js';

const router = express.Router();

// HELPER — generate a random 4-digit delivery PIN
function generatePIN() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// POST /api/orders
// Creates a new order in the database
// Called by initPay() in the frontend after cart is confirmed

router.post('/', async (req, res) => {
  try {
    const phone = req.headers['x-user-phone'];
    const { items, notes, location } = req.body;

    if (!phone || !items || !items.length) {
      return res.status(400).json({ error: 'Phone and items are required' });
    }

    const food_amount = items.reduce((sum, i) => sum + i.price, 0);
    const delivery_pin = generatePIN();

       // Hash PIN — plain text is NEVER stored in the DB
    const pinHash      = await bcrypt.hash(delivery_pin, 10);
    const pinExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2 hrs


    const { data, error } = await supabase
      .from('orders')
      .insert({
        customer_phone:  phone,
        items:           items,
        special_notes:   notes || null,
        food_amount:     food_amount,
        customer_lat:    location?.lat || null,
        customer_lng:    location?.lng || null,
        location:       location || null,
        pin_hash:       pinHash,
        pin_expires_at: pinExpiresAt,
        pin_attempts:   0,
        status:          'pending'
      })
      .select()
      .single();

    if (error) throw error;

     // Send delivery PIN to customer via SMS (Africa's Talking)
    // sendDeliveryPIN is fire-and-forget — we don't block the response on it

      sendDeliveryPIN(phone, data.order_number, delivery_pin)
      .then(r => {
        if (!r.success) console.warn(`⚠️  PIN SMS failed for order ${data.order_number}:`, r.error);
      });

    res.json({
      id:           data.id,
      order_number: data.order_number,
      status:       data.status
      // delivery_pin intentionally NOT returned — customer gets it via SMS only
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

    const { error } = await supabase
      .from('orders')
      .update({ status: 'rider_assigned', rider_phone: phone })
      .eq('id', id);

    if (error) throw error;

    console.log(`🏍️  Order ${id} accepted by rider ${phone}`);
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
