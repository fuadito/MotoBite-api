// src/routes/orders.js
// @ts-nocheck

// Routes:
//   POST /api/orders                    — create new order
//   GET  /api/orders/history            — customer order history
//   GET  /api/orders/:id                — get order status
// PUT /api/orders/:id/confirm-payment   — Confirm payment
// PUT /api/orders/:id/assign-rider      — Assign rider
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

function formatPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');

  if (digits.startsWith('254')) return `+${digits}`;
  if (digits.startsWith('0')) return `+254${digits.slice(1)}`;
  if (digits.length === 9) return `+254${digits}`;

  return `+${digits}`;
}

// POST /api/orders
// Creates a new order in the database
// Called by initPay() in the frontend after cart is confirmed

router.post('/', async (req, res) => {
  console.log('='.repeat(50));
  console.log('📦 NEW ORDER REQUEST');
  console.log('='.repeat(50));
  
  let pin = null;
  let orderData = null;
  let orderPhone = null;

  try {
    const rawPhone = req.headers['x-user-phone'];
    const phone = formatPhone(rawPhone);
    const { items, notes, location, mpesa_reference } = req.body;

    console.log('📞 Phone from header:', phone);
    console.log('🛒 Items:', JSON.stringify(items, null, 2));
    console.log('📝 Notes:', notes);
    console.log('📍 Location:', JSON.stringify(location, null, 2));
    console.log('💳 M-Pesa ref:', mpesa_reference);

    // Validation
    if (!phone) {
      console.error('❌ ERROR: Missing phone number');
      return res.status(400).json({ error: 'Phone number required in x-user-phone header' });
    }

    if (!items || !items.length) {
      console.error('❌ ERROR: Missing or empty items array');
      return res.status(400).json({ error: 'Items are required' });
    }

    orderPhone = phone;
    
    // Calculate total
    const food_amount = items.reduce((sum, i) => {
      console.log(`  - ${i.name}: ${i.price}`);
      return sum + (i.price || 0);
    }, 0);

    console.log('💰 Total calculated:', food_amount);

    if (!food_amount || food_amount <= 0) {
      console.error('❌ ERROR: Invalid food amount:', food_amount);
      return res.status(400).json({ error: 'Invalid order total' });
    }

    // Fetch customer name (optional)
    console.log('👤 Fetching customer from database...');
    let customerName = null;
    try {
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('name')
        .eq('phone', phone)
        .maybeSingle();

      if (customerError) {
        console.warn('⚠️ Customer fetch error:', customerError.message);
      }

      if (customer) {
        customerName = customer.name;
        console.log('✅ Customer found:', customerName);
      } else {
        console.log('ℹ️ New customer (no record found)');
      }
    } catch (err) {
      console.warn('⚠️ Customer lookup failed:', err.message);
    }

    // Generate PIN
    console.log('🔐 Generating PIN...');
    pin = Math.floor(1000 + Math.random() * 9000).toString();
    
    console.log('🔒 Hashing PIN with bcrypt...');
    const pin_hash = await bcrypt.hash(pin, 10);
    console.log('✅ PIN hashed successfully');
    
    const pin_expires_at = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    console.log('⏰ PIN expires at:', pin_expires_at);

    // Prepare data
    const insertData = {
      customer_phone: phone,
      items: items,
      special_notes: notes || null,
      food_amount: food_amount,
      customer_lat: location?.lat || null,
      customer_lng: location?.lng || null,
      location: location || null,
      customer_area: location?.areaName || location?.area || 'Narok Town',
      mpesa_reference: mpesa_reference || null,
      pin_hash: pin_hash,
      pin_expires_at: pin_expires_at,
      pin_attempts: 0,
      status: 'pending',
      payment_status: 'pending',
      customer_name: customerName,
    };

    console.log('💾 Data to insert:', JSON.stringify(insertData, null, 2));
    console.log('🗄️ Inserting into Supabase...');

    const { data, error } = await supabase
      .from('orders')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('❌ SUPABASE ERROR:');
      console.error('   Message:', error.message);
      console.error('   Details:', error.details);
      console.error('   Hint:', error.hint);
      console.error('   Code:', error.code);
      console.error('   Full error:', JSON.stringify(error, null, 2));
      throw new Error(`Supabase error: ${error.message}`);
    }

    orderData = data;
    console.log('✅ ORDER CREATED SUCCESSFULLY!');
    console.log('   ID:', orderData.id);
    console.log('   Order Number:', orderData.order_number);
    console.log('   Status:', orderData.status);

    // STK push (fire-and-forget)
    console.log('💳 Attempting STK push...');
    let stkSent = false;
    try {
      const stkRes = await fetch(
        `${process.env.BACKEND_URL || 'http://localhost:3000'}/api/mpesa/stk-push`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: data.id, phone, amount: food_amount })
        }
      );
      const stkData = await stkRes.json();
      stkSent = !!stkData.success;
      if (stkSent) console.log(`✅ STK push sent`);
      else console.log(`ℹ️ STK push skipped:`, stkData);
    } catch (e) {
      console.warn(`⚠️ STK push error:`, e.message);
    }

    console.log('📤 Sending success response to client');
    res.json({
      id: data.id,
      order_number: data.order_number,
      status: data.status,
      stkSent: stkSent
    });

  } catch (err) {
    console.error('❌ FATAL ERROR IN ORDER CREATION:');
    console.error('   Error name:', err.name);
    console.error('   Error message:', err.message);
    console.error('   Stack trace:', err.stack);
    
    res.status(500).json({ 
      error: 'Could not create order',
      details: err.message
    });
  }

  // Send PIN SMS (outside try/catch)
  if (orderData && pin && orderPhone) {
    console.log('📱 Sending PIN SMS...');
    sendDeliveryPIN(orderPhone, orderData.order_number, pin)
      .then(r => {
        if (r) console.log(`✅ PIN SMS sent to ${orderPhone}`);
        else console.warn(`⚠️ PIN SMS failed for ${orderPhone}`);
      })
      .catch(err => {
        console.error(`❌ PIN SMS error:`, err.message);
      });
  }
  
  console.log('='.repeat(50));
});



// GET /api/orders/history
// Returns last 20 orders for the logged-in customer
// Called by loadHistory() in the frontend
// NOTE: Must be defined BEFORE /:id to avoid Express treating 'history' as an id

router.get('/history', async (req, res) => {
  try {
    const rawPhone = req.headers['x-user-phone'];
    const phone = formatPhone(rawPhone);

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

// PUT /api/orders/:id/assign-rider
// Assign a rider to an order
router.put('/:id/assign-rider', async (req, res) => {
  try {
    const { id } = req.params;
    const { rider_phone } = req.body;

    console.log(`🏍️ Assigning rider to order ${id}`);
    console.log('📞 Rider phone:', rider_phone);

    // Validate rider_phone
    if (!rider_phone) {
      console.error('❌ Missing rider_phone');
      return res.status(400).json({ error: 'rider_phone is required' });
    }

    // Get rider details
    console.log('👤 Fetching rider details...');
    const { data: rider, error: riderError } = await supabase
      .from('riders')
      .select('name, rating, phone')
      .eq('phone', rider_phone)
      .eq('status', 'approved')
      .single();

    if (riderError || !rider) {
      console.error('❌ Rider not found or not approved:', riderError?.message);
      return res.status(404).json({ error: 'Rider not found or not approved' });
    }

    console.log('✅ Rider found:', rider.name);

    // Update order with rider details
    console.log('💾 Updating order...');
    const { data: order, error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'rider_assigned',
        rider_phone: rider_phone,
        rider_name: rider.name,
        rider_rating: rider.rating,
        assigned_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Update error:', updateError);
      throw updateError;
    }

    if (!order) {
      console.error('❌ Order not found');
      return res.status(404).json({ error: 'Order not found' });
    }

    // Mark rider as unavailable
    console.log('🔒 Marking rider as unavailable...');
    await supabase
      .from('riders')
      .update({ is_available: false })
      .eq('phone', rider_phone);

    console.log('✅ Rider assigned successfully');
    res.json({
      success: true,
      message: 'Rider assigned successfully',
      order: order
    });

  } catch (err) {
    console.error('❌ Assign rider error:', err.message);
    res.status(500).json({
      error: 'Could not assign rider',
      details: err.message
    });
  }
});



// POST /api/orders/:id/accept
// Rider accepts a dispatched order
// Called by acceptOrder() in the frontend
// Sets status to rider_assigned and records the rider's phone

router.post('/:id/accept', async (req, res) => {
  try {
    const { id }  = req.params;
    const rawPhone = req.headers['x-user-phone'];
    const phone = formatPhone(rawPhone);

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


// PUT /api/orders/:id/confirm-payment
// Customer confirms they have paid via M-Pesa
router.put('/:id/confirm-payment', async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`💳 Confirming payment for order ${id}`);

    // Get current order
    const { data: currentOrder, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !currentOrder) {
      console.error('❌ Order not found:', fetchError?.message);
      return res.status(404).json({ error: 'Order not found' });
    }

    console.log('📦 Current order status:', currentOrder.status);

    // Update payment status
    const { data: order, error: updateError } = await supabase
      .from('orders')
      .update({
        payment_status: 'paid',
        status: currentOrder.status === 'pending' ? 'paid' : currentOrder.status,
        paid_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Update error:', updateError);
      throw updateError;
    }

    console.log('✅ Payment confirmed');
    res.json({
      success: true,
      message: 'Payment confirmed successfully',
      order: order
    });

  } catch (err) {
    console.error('❌ Confirm payment error:', err.message);
    res.status(500).json({
      error: 'Could not confirm payment',
      details: err.message
    });
  }
});

// POST /api/orders/:id/rate
// Saves food and rider star ratings
// Called by submitRating() in frontend after delivery

router.post('/:id/rate', async (req, res) => {
  try {
    const { id } = req.params;
    const rawPhone = req.headers['x-user-phone'];
    const phone = formatPhone(rawPhone);
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