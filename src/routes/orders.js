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
import { submitPesapalOrder, getTransactionStatus } from '../services/pesapal.js';

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
    const { items, notes, location, mpesa_reference, order_type } = req.body;

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
      landmark:      location?.landmark || null,   // ← human-readable delivery hint for rider
      mpesa_reference: mpesa_reference || null,
      pin_hash: pin_hash,
      pin_expires_at: pin_expires_at,
      pin_attempts: 0,
      status: 'pending',
      payment_status: 'pending',
      customer_name: customerName,
      order_type: req.body.order_type || 'delivery' // 'delivery' or 'pickup' — defaults to delivery
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

  // PIN SMS intentionally NOT sent here — the admin manually confirms payment via
  // POST /api/admin/orders/:id/mark-paid which sends the PIN SMS at the right time.
  // Sending it here would give the customer a PIN before payment is confirmed, causing confusion.
  
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
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Order not found' });
    }
// check if order has been rated and include that in the response (used to disable rating button in frontend if already rated)
    const { data: rating } = await supabase 
      .from('ratings')
      .select('id')
      .eq('order_id', id)
      .maybeSingle();

    // Fetch rider location separately (avoids requiring a FK relationship)
    let rider_lat = null, rider_lng = null, rider_name = data.rider_name || null, rider_rating = data.rider_rating || null;
    if (data.rider_phone) {
      const { data: rider } = await supabase
        .from('riders')
        .select('current_lat, current_lng, name, rating')
        .eq('phone', data.rider_phone)
        .maybeSingle();
      if (rider) {
        rider_lat = rider.current_lat;
        rider_lng = rider.current_lng;
        rider_name = rider_name || rider.name;
        rider_rating = rider_rating || rider.rating;
      }
    }

    res.json({ ...data, rider_lat, rider_lng, rider_name, rider_rating , rated: !!rating });

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

    // Guard: only accept paid orders — don't assign rider to unpaid order
    if (!existing || !['paid', 'ready', 'cooking'].includes(existing.status)) {
      return res.status(400).json({ error: 'Order is not ready for rider assignment' });
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

    if (!foodStars) {
  return res.status(400).json({ error: 'Food rating required' });
}

    // Get the order to find rider phone
    const { data: order } = await supabase
      .from('orders')
      .select('rider_phone, order_type')
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
        rider_stars:    riderStars || null,
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

    // First check what type of order it is
    const { data: order } = await supabase
      .from('orders')
      .select('order_type')
      .eq('id', id)
      .single();

      // Auto pick correct status based on order type
      const newStatus = order.order_type === 'pickup' ? 'delivered' // pickup orders are marked delivered immediately since there's no delivery process 
      : 'picked_up'; // delivery orders are marked picked_up when rider collects from KFC, then later marked delivered when rider confirms PIN with customer
    const { error } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) throw error;

    console.log(`✅ Order ${id} updated → ${newStatus}`);
     
    res.json({ success: true, status:newStatus });

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

    // Guard: pin_hash wiped after delivery — reject immediately (must be before bcrypt)
    if (!order.pin_hash) {
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


// ── PESAPAL ROUTES ────────────────────────────────────────────────────────────
// NOTE: /pesapal-ipn MUST be declared before /:id routes — Express matches
// literal path segments before parameters, but being explicit prevents bugs.

// POST /api/orders/pesapal-ipn
// Pesapal calls this URL when a payment status changes (IPN = Instant Payment Notification).
// We verify the transaction status with Pesapal's API, then mark the order paid.

router.post('/pesapal-ipn', async (req, res) => {
  try {
    const { OrderTrackingId, OrderMerchantReference, OrderNotificationType } = req.body;

    console.log(`📡 Pesapal IPN received — ref: ${OrderMerchantReference}, tracking: ${OrderTrackingId}`);

    // Always respond 200 immediately — Pesapal retries if we don't
    res.json({ orderNotificationType: OrderNotificationType, orderTrackingId: OrderTrackingId, status: '200' });

    // Verify transaction status with Pesapal
    const txStatus = await getTransactionStatus(OrderTrackingId);
    console.log(`📡 Pesapal tx status: ${txStatus.payment_status_description} (code ${txStatus.status_code})`);

    // status_code 1 = Completed — only update DB on confirmed payment
    if (txStatus.status_code !== 1) {
      console.log(`⚠️  IPN ignored — payment not completed (status: ${txStatus.payment_status_description})`);
      return;
    }
const isPickup = order.order_type === 'pickup';
let pin_hash_update = {};
let security_pin = null;

if (!isPickup) {
  security_pin             = Math.floor(1000 + Math.random() * 9000).toString();
  const pinHash            = await bcrypt.hash(security_pin, 10);
  const pinExpiresAt       = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  pin_hash_update = { pin_hash: pinHash, pin_expires_at: pinExpiresAt, pin_attempts: 0 };
}

await supabase
  .from('orders')
  .update({
    status:          'paid',
    payment_method:  'card',
    pesapal_tx_id:   OrderTrackingId,
    mpesa_reference: `PESAPAL-${OrderTrackingId}`,
    paid_at:         new Date().toISOString(),
    ...pin_hash_update
  })
  .eq('id', orderId);

// Send PIN SMS for delivery orders only
if (!isPickup && security_pin) {
  const { data: fullOrder } = await supabase
    .from('orders').select('customer_phone, order_number').eq('id', orderId).single();
  if (fullOrder?.customer_phone) {
    sendDeliveryPIN(fullOrder.customer_phone, fullOrder.order_number, security_pin)
      .then(r => { if (!r) console.warn(`⚠️  PIN SMS failed for order ${fullOrder.order_number}`); });
  }
}
    // Find the order by merchant reference (MB-{orderNumber}-{orderId})
    const parts   = (OrderMerchantReference || '').split('-');
    const orderId = parts[parts.length - 1]; // last segment is the DB id

    if (!orderId || isNaN(orderId)) {
      console.error('IPN: could not parse order ID from reference:', OrderMerchantReference);
      return;
    }

    // Fetch order to know order_type (pickup → ready, delivery → paid)
    const { data: order } = await supabase
      .from('orders')
      .select('id, status, order_type, order_number')
      .eq('id', orderId)
      .single();

    if (!order) { console.error(`IPN: order ${orderId} not found`); return; }

    // Idempotency — don't double-process if already paid
    if (order.status !== 'pending') {
      console.log(`IPN: order ${order.order_number} already at status '${order.status}' — skipping`);
      return;
    }

    const newStatus = order.order_type === 'paid';

    await supabase
      .from('orders')
      .update({
        status:          newStatus,
        payment_method:  'card',
        pesapal_tx_id:   OrderTrackingId,
        mpesa_reference: `PESAPAL-${OrderTrackingId}`, // admin display
        paid_at:         new Date().toISOString(),
        pin_attempts:    0
      })
      .eq('id', orderId);

    console.log(`✅ Pesapal IPN — Order ${order.order_number} → ${newStatus}`);

  } catch (err) {
    console.error('Pesapal IPN error:', err.message);
    // Response already sent — just log
  }
});


// POST /api/orders/:id/pesapal-checkout
// Called by the frontend when customer chooses card payment.
// Creates a Pesapal payment session and returns the hosted payment URL.

router.post('/:id/pesapal-checkout', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: order, error } = await supabase
      .from('orders')
      .select('id, order_number, food_amount, customer_name, customer_phone, status')
      .eq('id', id)
      .single();

    if (error || !order) return res.status(404).json({ error: 'Order not found' });

    // Prevent duplicate checkouts on already-paid orders
    if (order.status !== 'pending') {
      return res.status(409).json({ error: `Order already ${order.status}` });
    }

    const { redirectUrl, trackingId, merchantRef } = await submitPesapalOrder({
      orderId:       order.id,
      orderNumber:   order.order_number,
      amount:        order.food_amount,
      customerName:  order.customer_name,
      customerPhone: order.customer_phone
    });

    // Store the Pesapal tracking ID so admin can look it up in disputes
    await supabase
      .from('orders')
      .update({ pesapal_tx_id: trackingId, payment_method: 'card' })
      .eq('id', id);

    console.log(`💳 Pesapal checkout created — Order ${order.order_number} → ${trackingId}`);
    res.json({ redirectUrl, trackingId, merchantRef, orderNumber: order.order_number });

  } catch (err) {
    console.error('Pesapal checkout error:', err.message);
    res.status(500).json({ error: 'Could not create payment session — please try again' });
  }
});


export default router;