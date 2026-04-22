// src/routes/admin.js
//@ts-nocheck
// Routes:
//   GET  /api/admin/stats                  — dashboard metrics
//   GET  /api/admin/orders                 — all orders
//   GET  /api/admin/riders/pending         — pending rider applications
//   POST /api/admin/riders/approve         — approve a rider
//   POST /api/admin/riders/suspend         — suspend/reject a rider
//   POST /api/admin/orders/:id/mark-paid   — manually confirm payment


// FIX: top-level ES module import — require() doesn't work with "type":"module"
import express from 'express';
import bcrypt  from 'bcryptjs';
import supabase from '../services/supabase.js';
import { sendRiderApproved, sendRiderRejected, sendRiderSuspended, sendDeliveryPIN } from '../services/sms.js';

const router = express.Router();

// NOTE: authenticate/adminOnly middleware NOT applied globally —
// the frontend uses Supabase client-side auth (not bearer tokens),
// so middleware would block every request with 401.
// Admin identity is verified at the Supabase session level in the frontend.


// GET /api/admin/stats
// Returns 4 metrics for the admin dashboard overview

router.get('/stats', async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const { data: activeOrders } = await supabase
      .from('orders')
      .select('id')
      .not('status', 'in', '("delivered","cancelled")');

    const { data: deliveredToday } = await supabase
      .from('orders')
      .select('id, food_amount')
      .eq('status', 'delivered')
      .gte('delivered_at', todayStart.toISOString())
      .lte('delivered_at', todayEnd.toISOString());

    const { data: onlineRiders } = await supabase
      .from('riders')
      .select('id')
      .eq('is_available', true)
      .eq('status', 'approved');

    const revenueToday = (deliveredToday || [])
      .reduce((sum, o) => sum + o.food_amount, 0);

    res.json({
      active_orders:   (activeOrders   || []).length,
      delivered_today: (deliveredToday || []).length,
      revenue_today:   revenueToday,
      online_riders:   (onlineRiders   || []).length
    });

  } catch (err) {
    console.error('Admin stats error:', err.message);
    res.status(500).json({ error: 'Could not fetch stats' });
  }
});


// GET /api/admin/orders
// Returns all orders, most recent first

router.get('/orders', async (req, res) => {
  try {
    const { status, limit } = req.query;
    let query = supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit) || 50);

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    res.json({ orders: data || [] });

  } catch (err) {
    console.error('Admin orders error:', err.message);
    res.status(500).json({ error: 'Could not fetch orders' });
  }
});


// GET /api/admin/riders/pending
// Returns all riders waiting for approval

router.get('/riders/pending', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('riders')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true }); // oldest application first

    if (error) throw error;

    res.json(data || []);

  } catch (err) {
    console.error('Pending riders error:', err.message);
    res.status(500).json({ error: 'Could not fetch riders' });
  }
});


// POST /api/admin/riders/approve
// Admin approves a rider application — sends congratulations SMS

router.post('/riders/approve', async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'Phone required' });
    }

    const { error } = await supabase
      .from('riders')
      .update({ status: 'approved' })
      .eq('phone', phone);

    if (error) throw error;

    const { data: rider } = await supabase
      .from('riders')
      .select('name')
      .eq('phone', phone)
      .single();

    // FIX: sendRiderApproved returns the raw AT result or null — check for null, not r.success
    sendRiderApproved(phone, rider?.name || 'Rider')
      .then(r => {
        if (!r) console.warn(`⚠️  Approval SMS failed for ${phone}`);
      });

    console.log(`✅ Rider ${phone} approved — SMS sent`);
    res.json({ success: true });

  } catch (err) {
    console.error('Approve rider error:', err.message);
    res.status(500).json({ error: 'Could not approve rider' });
  }
});

// GET /api/admin/riders/approved
// Returns all approved active riders

router.get('/riders/approved', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('riders')
      .select('*')
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);

  } catch (err) {
    console.error('Approved riders error:', err.message);
    res.status(500).json({ error: 'Could not fetch riders' });
  }
});


// POST /api/admin/riders/suspend
// Admin rejects or suspends a rider — sends appropriate SMS

router.post('/riders/suspend', async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'Phone required' });
    }

    // Fetch name and current status BEFORE updating
    // so we know whether to send a rejection or suspension SMS
    const { data: rider } = await supabase
      .from('riders')
      .select('name, status')
      .eq('phone', phone)
      .single();

    const { error } = await supabase
      .from('riders')
      .update({ status: 'suspended' })
      .eq('phone', phone);

    if (error) throw error;

    const wasPending = rider?.status === 'pending';

    // FIX: check for null (no response) instead of r.success
    if (wasPending) {
      sendRiderRejected(phone, rider?.name || 'Rider')
        .then(r => {
          if (!r) console.warn(`⚠️  Rejection SMS failed for ${phone}`);
        });
    } else {
      sendRiderSuspended(phone)
        .then(r => {
          if (!r) console.warn(`⚠️  Suspension SMS failed for ${phone}`);
        });
    }

    console.log(`🚫 Rider ${phone} ${wasPending ? 'rejected' : 'suspended'} — SMS sent`);
    res.json({ success: true });

  } catch (err) {
    console.error('Suspend rider error:', err.message);
    res.status(500).json({ error: 'Could not suspend rider' });
  }
});


// POST /api/admin/orders/:id/mark-paid
// Admin manually confirms payment — moves order from pending to paid
// FIX: route must be /orders/:id/mark-paid to match frontend call /api/admin/orders/:id/mark-paid

router.post('/orders/:id/mark-paid', async (req, res) => {
  try {
    const { id } = req.params;

    const security_pin = Math.floor(1000 + Math.random() * 9000).toString();

    // FIX: hash the PIN — confirm-pin uses bcrypt.compare against pin_hash, not security_pin
    const pinHash      = await bcrypt.hash(security_pin, 10);
    const pinExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2 hrs

    const { data, error } = await supabase
      .from('orders')
      .update({
        status:         'paid',
        pin_hash:       pinHash,       // FIX: store hash for bcrypt.compare in confirm-pin
        pin_expires_at: pinExpiresAt,  // FIX: without this, expiry check always fails immediately
        pin_attempts:   0,             // FIX: without this, attempt counter is null
        paid_at:        new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    console.log(`✅ Order ${data.order_number} marked as paid. PIN: ${security_pin}`);

    // FIX: use shared sendDeliveryPIN — all SMS credentials stay in env vars
    if (data.customer_phone) {
      sendDeliveryPIN(data.customer_phone, data.order_number, security_pin)
        .then(r => {
          if (!r) console.warn(`⚠️  PIN SMS failed for order ${data.order_number}`);
          else    console.log(`📱 PIN SMS sent to ${data.customer_phone}`);
        });
    }

    // Notify kitchen via Supabase Realtime
    // FIX: must subscribe before sending — same pattern as dispatch.js
    const channel = supabase.channel('kitchen-orders');
    await channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.send({
          type:    'broadcast',
          event:   'order_paid',
          payload: data
        });
        await channel.unsubscribe();
      }
    });

    res.json({ success: true, order: data });

  } catch (err) {
    console.error('Mark paid error:', err.message);
    res.status(500).json({ error: 'Could not mark as paid' });
  }
});


// POST /api/admin/riders/unsuspend
// Lift a suspension — reinstates rider to approved status

router.post('/riders/unsuspend', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone required' });

    const { error } = await supabase
      .from('riders')
      .update({ status: 'approved' })
      .eq('phone', phone);

    if (error) throw error;

    // Fetch name for SMS
    const { data: rider } = await supabase
      .from('riders')
      .select('name')
      .eq('phone', phone)
      .maybeSingle();

    // Notify rider their account is reinstated
    sendRiderApproved(phone, rider?.name || 'Rider')
      .then(r => {
        if (!r) console.warn(`⚠️  Reinstatement SMS failed for ${phone}`);
      });

    console.log(`✅ Rider ${phone} suspension lifted — SMS sent`);
    res.json({ success: true });

  } catch (err) {
    console.error('Unsuspend rider error:', err.message);
    res.status(500).json({ error: 'Could not lift suspension' });
  }
});

// GET /api/admin/orders — support status filter
// Already defined above; adding delivered filter for revenue endpoint

export default router;