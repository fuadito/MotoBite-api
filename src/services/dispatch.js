// src/routes/orders.js
// @ts-nocheck
//
// UPDATED 2026-05-30:
//   • PUT /:id/assign-rider now:
//       – normalises rider_phone with formatPhone()
//       – guards against assigning to unpaid / pending orders
//       – checks rider is_available before assigning
//       – preserves existing notes if none sent from frontend
//   • formatPhone() helper added at top (shared with rider.js)

import express from 'express';
import bcrypt from 'bcryptjs';
import supabase from '../services/supabase.js';
import { submitPesapalOrder, getTransactionStatus } from '../services/pesapal.js';
import { sendDeliveryPIN } from '../services/sms.js';

const router = express.Router();
const pesapalIPNWhitelist = ['52.8.2.100', '54.67.12.34'];

function sanitizeInput(str) {
  if (!str || typeof str !== 'string') return '';
  return str.trim().slice(0, 500);
}

function formatPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('254')) return `+${digits}`;
  if (digits.startsWith('0')) return `+254${digits.slice(1)}`;
  if (digits.length === 9) return `+254${digits}`;
  return `+${digits}`;
}

// ═══════════════════════════════════════════════════════════
// POST /api/orders  (create order — UNCHANGED)
// ═══════════════════════════════════════════════════════════
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

    if (!phone) {
      console.error('❌ ERROR: Missing phone number');
      return res.status(400).json({ error: 'Phone number required in x-user-phone header' });
    }
    if (!items || !items.length) {
      console.error('❌ ERROR: Missing or empty items array');
      return res.status(400).json({ error: 'Items are required' });
    }

    orderPhone = phone;

    const food_amount = items.reduce((sum, i) => {
      console.log(` - ${i.name}: ${i.price}`);
      return sum + (i.price || 0);
    }, 0);

    console.log('💰 Total calculated:', food_amount);
    if (!food_amount || food_amount <= 0) {
      console.error('❌ ERROR: Invalid food amount:', food_amount);
      return res.status(400).json({ error: 'Invalid order total' });
    }

    let customerName = null;
    try {
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('name')
        .eq('phone', phone)
        .maybeSingle();
      if (customerError) console.warn('⚠️ Customer fetch error:', customerError.message);
      if (customer) {
        customerName = customer.name;
        console.log('✅ Customer found:', customerName);
      } else {
        console.log('ℹ️ New customer (no record found)');
      }
    } catch (err) {
      console.warn('⚠️ Customer lookup failed:', err.message);
    }

    pin = Math.floor(1000 + Math.random() * 9000).toString();
    console.log('🔐 Generating PIN...');
    const pin_hash = await bcrypt.hash(pin, 10);
    console.log('✅ PIN hashed successfully');
    const pin_expires_at = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    console.log('⏰ PIN expires at:', pin_expires_at);

    const insertData = {
      customer_phone: phone,
      items: items,
      special_notes: sanitizeInput(notes) || null,
      food_amount: food_amount,
      customer_lat: location?.lat || null,
      customer_lng: location?.lng || null,
      location: location || null,
      customer_area: location?.areaName || location?.area || 'Narok Town',
      landmark: location?.landmark || null,
      mpesa_reference: mpesa_reference || null,
      pin_hash: pin_hash,
      pin_expires_at: pin_expires_at,
      pin_attempts: 0,
      status: 'pending',
      payment_status: 'pending',
      customer_name: customerName,
      order_type: req.body.order_type || 'delivery'
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
      console.error(' Message:', error.message);
      console.error(' Details:', error.details);
      console.error(' Hint:', error.hint);
      console.error(' Code:', error.code);
      console.error(' Full error:', JSON.stringify(error, null, 2));
      throw new Error(`Supabase error: ${error.message}`);
    }

    orderData = data;
    console.log('✅ ORDER CREATED SUCCESSFULLY!');
    console.log(' ID:', orderData.id);
    console.log(' Order Number:', orderData.order_number);
    console.log(' Status:', orderData.status);

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
    console.error(' Error name:', err.name);
    console.error(' Error message:', err.message);
    console.error(' Stack trace:', err.stack);
    res.status(500).json({
      error: 'Could not create order',
      details: err.message
    });
  }

  console.log('='.repeat(50));
});

// ═══════════════════════════════════════════════════════════
// GET /api/orders/history  (UNCHANGED)
// ═══════════════════════════════════════════════════════════
router.get('/history', async (req, res) => {
  try {
    const rawPhone = req.headers['x-user-phone'];
    const phone = formatPhone(rawPhone);
    if (!phone) {
      return res.status(400).json({ error: 'Phone number required' });
    }
    const { data, error } = await supabase
      .from('orders')
      .select('id, order_number, status, food_amount, items, created_at, customer_area, order_type')
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

// ═══════════════════════════════════════════════════════════
// GET /api/orders/:id  (UNCHANGED)
// ═══════════════════════════════════════════════════════════
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

    const { data: rating } = await supabase
      .from('ratings')
      .select('id')
      .eq('order_id', id)
      .maybeSingle();

    let rider_lat = null, rider_lng = null,
        rider_name = data.rider_name || null,
        rider_rating = data.rider_rating || null;

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

    res.json({ ...data, rider_lat, rider_lng, rider_name, rider_rating, rated: !!rating });
  } catch (err) {
    console.error('Get order error:', err.message);
    res.status(500).json({ error: 'Could not fetch order' });
  }
});

// ═══════════════════════════════════════════════════════════
// PUT /api/orders/:id/assign-rider  (PATCHED)
// ═══════════════════════════════════════════════════════════
router.put('/:id/assign-rider', async (req, res) => {
  try {
    const { id } = req.params;
    const { rider_phone: rawRiderPhone } = req.body;
    const rider_phone = formatPhone(rawRiderPhone);

    console.log(`🏍️ Assigning rider to order ${id}`);
    console.log('📞 Rider phone (raw):', rawRiderPhone);
    console.log('📞 Rider phone (norm):', rider_phone);

    if (!rider_phone) {
      console.error('❌ Missing rider_phone');
      return res.status(400).json({ error: 'rider_phone is required' });
    }

    // ── GUARD 1: Check order status ──
    console.log('🔍 Fetching order status...');
    const { data: orderCheck, error: orderCheckErr } = await supabase
      .from('orders')
      .select('status')
      .eq('id', id)
      .single();

    if (orderCheckErr || !orderCheck) {
      console.error('❌ Order not found');
      return res.status(404).json({ error: 'Order not found' });
    }

    const allowedStatuses = ['paid', 'ready', 'cooking', 'rider_assigned'];
    if (!allowedStatuses.includes(orderCheck.status)) {
      console.error(`❌ Order status is '${orderCheck.status}' — cannot assign rider`);
      return res.status(400).json({
        error: `Order is '${orderCheck.status}' — must be paid, ready, or cooking before assigning a rider`
      });
    }

    // ── GUARD 2: Fetch rider + verify approved & available ──
    console.log('👤 Fetching rider details...');
    const { data: rider, error: riderError } = await supabase
      .from('riders')
      .select('name, rating, phone, is_available, status')
      .eq('phone', rider_phone)
      .single();

    if (riderError || !rider) {
      console.error('❌ Rider not found:', riderError?.message);
      return res.status(404).json({ error: 'Rider not found' });
    }

    if (rider.status !== 'approved') {
      console.error(`❌ Rider status is '${rider.status}' — not approved`);
      return res.status(403).json({ error: `Rider is '${rider.status}' — not approved for deliveries` });
    }

    if (!rider.is_available) {
      console.error('❌ Rider is offline or already busy');
      return res.status(409).json({ error: 'Rider is currently offline or already on another delivery' });
    }

    console.log('✅ Rider found:', rider.name, '| available:', rider.is_available);

    // ── Build update payload (preserve notes if not provided) ──
    const updatePayload = {
      status: 'rider_assigned',
      rider_phone: rider_phone,
      rider_name: rider.name,
      rider_rating: rider.rating,
      assigned_at: new Date().toISOString()
    };

    if (req.body.notes !== undefined) {
      updatePayload.notes = sanitizeInput(req.body.notes);
    }

    const { data: order, error: updateError } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Update error:', updateError);
      throw updateError;
    }
    if (!order) {
      console.error('❌ Order not found after update');
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

// ═══════════════════════════════════════════════════════════
// POST /api/orders/:id/accept  (UNCHANGED)
// ═══════════════════════════════════════════════════════════
router.post('/:id/accept', async (req, res) => {
  try {
    const { id } = req.params;
    const rawPhone = req.headers['x-user-phone'];
    const phone = formatPhone(rawPhone);

    if (!phone) {
      return res.status(400).json({ error: 'Phone required' });
    }

    const { data: existing } = await supabase
      .from('orders')
      .select('rider_phone, status')
      .eq('id', id)
      .single();

    if (existing?.rider_phone && existing.rider_phone !== phone) {
      return res.status(409).json({ error: 'Order already accepted by another rider' });
    }

    if (!existing || !['paid', 'ready', 'cooking'].includes(existing.status)) {
      return res.status(400).json({ error: 'Order is not ready for rider assignment' });
    }

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
    console.log(`🏍️ Order ${id} accepted by rider ${phone} (${riderRow?.name})`);
    res.json({ success: true });
  } catch (err) {
    console.error('Accept order error:', err.message);
    res.status(500).json({ error: 'Could not accept order' });
  }
});

// ═══════════════════════════════════════════════════════════
// PUT /api/orders/:id/confirm-payment  (UNCHANGED)
// ═══════════════════════════════════════════════════════════
router.put('/:id/confirm-payment', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`💳 Confirming payment for order ${id}`);

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

// ═══════════════════════════════════════════════════════════
// POST /api/orders/:id/rate  (UNCHANGED)
// ═══════════════════════════════════════════════════════════
router.post('/:id/rate', async (req, res) => {
  try {
    const { id } = req.params;
    const rawPhone = req.headers['x-user-phone'];
    const phone = formatPhone(rawPhone);
    const { foodStars, riderStars } = req.body;

    if (!foodStars) {
      return res.status(400).json({ error: 'Food rating required' });
    }

    const { data: order } = await supabase
      .from('orders')
      .select('rider_phone, order_type')
      .eq('id', id)
      .single();

    const { error } = await supabase
      .from('ratings')
      .insert({
        order_id: parseInt(id),
        customer_phone: phone,
        rider_phone: order?.rider_phone || null,
        food_stars: foodStars,
        rider_stars: riderStars || null,
      });

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('Rating error:', err.message);
    res.status(500).json({ error: 'Could not save rating' });
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/orders/:id/collected  (UNCHANGED)
// ═══════════════════════════════════════════════════════════
router.post('/:id/collected', async (req, res) => {
  try {
    const { id } = req.params;
    const { data: order } = await supabase
      .from('orders')
      .select('order_type')
      .eq('id', id)
      .single();

    const newStatus = order.order_type === 'pickup' ? 'delivered' : 'picked_up';
    const { error } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) throw error;
    console.log(`✅ Order ${id} updated → ${newStatus}`);
    res.json({ success: true, status: newStatus });
  } catch (err) {
    console.error('Collected error:', err.message);
    res.status(500).json({ error: 'Could not update order' });
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/orders/:id/confirm-pin  (UNCHANGED)
// ═══════════════════════════════════════════════════════════
router.post('/:id/confirm-pin', async (req, res) => {
  try {
    const { id } = req.params;
    const { pin } = req.body;

    const { data: order, error } = await supabase
      .from('orders')
      .select('pin_hash, pin_expires_at, pin_attempts, status, rider_phone')
      .eq('id', id)
      .single();

    if (error || !order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status === 'delivered') {
      return res.json(null);
    }
    if (!order.pin_hash) {
      return res.json(null);
    }
    if (order.pin_attempts >= 3) {
      console.warn(`🔒 Order ${id} PIN locked — too many wrong attempts`);
      return res.status(403).json({ error: 'Too many attempts. Contact KFC Narok.' });
    }
    if (new Date() > new Date(order.pin_expires_at)) {
      console.warn(`⏰ Order ${id} PIN expired`);
      return res.status(403).json({ error: 'PIN has expired. Contact KFC Narok.' });
    }

    const match = await bcrypt.compare(pin, order.pin_hash);
    if (!match) {
      await supabase
        .from('orders')
        .update({ pin_attempts: order.pin_attempts + 1 })
        .eq('id', id);
      console.log(`❌ Wrong PIN for order ${id} — attempt ${order.pin_attempts + 1}/3`);
      return res.json(null);
    }

    await supabase
      .from('orders')
      .update({
        status: 'delivered',
        delivered_at: new Date().toISOString(),
        pin_hash: null,
        pin_attempts: 0
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

// ═══════════════════════════════════════════════════════════
// POST /api/orders/:id/cancel  (UNCHANGED)
// ═══════════════════════════════════════════════════════════
router.post('/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const rawPhone = req.headers['x-user-phone'];
    const phone = formatPhone(rawPhone);

    if (!phone) {
      return res.status(400).json({ error: 'Phone required' });
    }

    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('id, status, customer_phone, order_number')
      .eq('id', id)
      .single();

    if (fetchError || !order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (order.customer_phone !== phone) {
      return res.status(403).json({ error: 'Not your order' });
    }
    if (order.status !== 'pending') {
      return res.status(409).json({
        error: `Cannot cancel — order is already '${order.status}'`
      });
    }

    const { error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: 'customer'
      })
      .eq('id', id);

    if (updateError) throw updateError;
    console.log(`❌ Order ${order.order_number} cancelled by customer ${phone}`);
    res.json({ success: true, message: 'Order cancelled' });
  } catch (err) {
    console.error('Cancel order error:', err.message);
    res.status(500).json({ error: 'Could not cancel order' });
  }
});

// ═══════════════════════════════════════════════════════════
// PESAPAL IPN  (UNCHANGED)
// ═══════════════════════════════════════════════════════════
router.post('/pesapal-ipn', async (req, res) => {
  try {
    const { OrderTrackingId, OrderMerchantReference, OrderNotificationType } = req.body;
    console.log(`📡 Pesapal IPN received — ref: ${OrderMerchantReference}, tracking: ${OrderTrackingId}`);

    res.status(200).json({
      orderNotificationType: OrderNotificationType,
      orderTrackingId: OrderTrackingId,
      status: '200'
    });

    const txStatus = await getTransactionStatus(OrderTrackingId);
    console.log(`📡 Pesapal tx status: ${txStatus.payment_status_description} (code ${txStatus.status_code})`);

    if (txStatus.status_code !== 1) {
      console.log(`⚠️ IPN ignored — payment not completed (${txStatus.payment_status_description})`);
      return;
    }

    const parts = (OrderMerchantReference || '').split('-');
    const orderId = parts[parts.length - 1];
    if (!orderId || isNaN(orderId)) {
      console.error('IPN: could not parse order ID from reference:', OrderMerchantReference);
      return;
    }

    const { data: order } = await supabase
      .from('orders')
      .select('id, status, order_type, order_number, customer_phone, food_amount')
      .eq('id', orderId)
      .single();

    if (!order) {
      console.error(`IPN: order ${orderId} not found`);
      return;
    }
    if (order.status !== 'pending') {
      console.log(`IPN: order ${order.order_number} already '${order.status}' — skipping`);
      return;
    }
    if (txStatus.amount && parseFloat(txStatus.amount) < order.food_amount) {
      console.error(`❌ Amount mismatch: IPN ${txStatus.amount} vs Order ${order.food_amount}`);
      return;
    }

    const isPickup = order.order_type === 'pickup';
    const newStatus = isPickup ? 'ready' : 'paid';
    const updatePayload = {
      status: newStatus,
      payment_status: 'paid',
      payment_method: 'card',
      pesapal_tx_id: OrderTrackingId,
      mpesa_reference: `PESAPAL-${OrderTrackingId}`,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      pin_attempts: 0,
    };

    let security_pin = null;
    if (!isPickup) {
      security_pin = Math.floor(1000 + Math.random() * 9000).toString();
      const pinHash = await bcrypt.hash(security_pin, 10);
      const pinExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      updatePayload.pin_hash = pinHash;
      updatePayload.pin_expires_at = pinExpiresAt;
    }

    await supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', orderId);

    console.log(`✅ Pesapal IPN — Order ${order.order_number} → ${newStatus} | payment_status → paid`);

    if (!isPickup && security_pin && order.customer_phone) {
      sendDeliveryPIN(order.customer_phone, order.order_number, security_pin)
        .then(r => {
          if (!r) console.warn(`⚠️ PIN SMS failed for ${order.order_number}`);
          else console.log(`📱 PIN SMS sent to ${order.customer_phone}`);
        });
    }
  } catch (err) {
    console.error('Pesapal IPN error:', err.message);
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/orders/:id/pesapal-checkout  (UNCHANGED)
// ═══════════════════════════════════════════════════════════
router.post('/:id/pesapal-checkout', async (req, res) => {
  try {
    const { id } = req.params;
    const { data: order, error } = await supabase
      .from('orders')
      .select('id, order_number, food_amount, customer_name, customer_phone, status')
      .eq('id', id)
      .single();

    if (error || !order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'pending') {
      return res.status(409).json({ error: `Order already ${order.status}` });
    }

    const { redirectUrl, trackingId, merchantRef } = await submitPesapalOrder({
      orderId: order.id,
      orderNumber: order.order_number,
      amount: order.food_amount,
      customerName: order.customer_name,
      customerPhone: order.customer_phone
    });

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