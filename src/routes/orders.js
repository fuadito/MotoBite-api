// src/routes/orders.js

// Routes:
//   POST /api/orders                    — create new order
//   GET  /api/orders/:id                — get order status
//   POST /api/orders/:id/pay            — trigger M-Pesa STK push
//   POST /api/orders/:id/rate           — submit food + rider rating
//   POST /api/orders/:id/collected      — rider collected from KFC
//   POST /api/orders/:id/confirm-pin    — rider confirms delivery PIN


import express from 'express';
import supabase from '../services/supabase.js';

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

    const { data, error } = await supabase
      .from('orders')
      .insert({
        customer_phone:  phone,
        items:           items,
        special_notes:   notes || null,
        food_amount:     food_amount,
        customer_lat:    location?.lat || null,
        customer_lng:    location?.lng || null,
        delivery_pin:    delivery_pin,
        status:          'pending'
      })
      .select()
      .single();

    if (error) throw error;

     // TODO: Send delivery PIN to customer via SMS (Africa's Talking)
    // We will wire this up when AT credentials are ready

     console.log(`📱 PIN for order ${data.order_number}: ${delivery_pin}`);

    res.json({ 
      id:           data.id,
      order_number: data.order_number,
      status:       data.status,
      delivery_pin: delivery_pin
    });

  } catch (err) {
    console.error('Create order error:', err.message);
    res.status(500).json({ error: 'Could not create order' });
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

    // Get the order and check PIN
    const { data: order, error } = await supabase
      .from('orders')
      .select('delivery_pin, rider_phone')
      .eq('id', id)
      .single();

    if (error || !order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.delivery_pin !== pin) {
      return res.status(400).json({ error: 'Wrong PIN' });
    }

    // PIN correct — mark as delivered
    await supabase
      .from('orders')
      .update({ status: 'delivered' })
      .eq('id', id);

    // Update rider trip count
    if (order.rider_phone) {
      await supabase.rpc('increment_rider_trips', { 
        rider_phone: order.rider_phone 
      });
    }

    res.json({ success: true });

  } catch (err) {
    console.error('Confirm PIN error:', err.message);
    res.status(500).json({ error: 'Could not confirm delivery' });
  }
});


export default router;
