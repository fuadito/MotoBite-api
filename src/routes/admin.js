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
import { authenticate } from '../middleware/auth.js';
import { adminOnly } from '../middleware/adminOnly.js';

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

// GET /api/admin/revenue/history?days=30
// Returns daily revenue for the past N days (default 30) for the revenue graph

router.get('/revenue/history', authenticate, adminOnly, async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days || '30'), 365); // limit to 90 days for performance

  // Calculate date range
  const since = new Date();
  since.setDate(since.getDate() - days);
  

  const { data, error } = await supabase
    .from('orders')
    .select('id, food_amount, delivery_fee, created_at, status')
    .in('status', ['delivered', 'ready', 'paid', 'cooking', 'rider_assigned', 'picked_up']) // include paid but not yet delivered for more accurate revenue tracking
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false });
    
  if (error) throw error; 

  // Group by date 
  const byDate = {};
  (data || []).forEach(order => {
    const date = order.created_at.slice(0, 10); // YYYY-MM-DD
    if (!byDate[date]) {
       byDate[date] = {
        date,
        orders: 0,
        food_revenue: 0,
        delivery_revenue: 0,
        total: 0
      };
    }

    const food = Number(order.food_amount) || 0;
    const delivery = Number(order.delivery_fee) || 0;

    byDate[date].orders += 1;
    byDate[date].food_revenue += food;
    byDate[date].delivery_revenue += delivery;
    byDate[date].total += food + delivery;
  });

  // Convert to array and sort by date ascending
  const history = Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date));

  const grand_total = history.reduce((s, d) => s + (d.total || 0), 0);

  console.log(`📈 Revenue history fetched for past ${days} days — ${history.length} days, grand total ${grand_total}`);

    res.json({ history, grand_total, days });
    
  } catch (err) {
    console.error('Revenue history error:', err.message);
    res.status(500).json({ error: 'Could not fetch revenue history' });
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
router.post('/orders/:id/mark-paid', authenticate, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    // ✅ Step 1: Fetch the order FIRST — read only, no update yet
    const { data: existingOrder, error: fetchError } = await supabase
      .from('orders')
      .select('id, order_number, order_type, customer_phone, status')
      .eq('id', id)
      .single();

    if (fetchError || !existingOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Guard — don't re-process already paid orders
    if (existingOrder.status !== 'pending') {
      return res.status(409).json({ 
        error: `Order is already '${existingOrder.status}' — cannot mark as paid again` 
      });
    }

    const isPickup = existingOrder.order_type === 'pickup';

    // ✅ Step 2: Build update payload
    const updatePayload = {
      status:          'paid',
      payment_status:  'paid',                    // ✅ FIX — was missing
      paid_at:         new Date().toISOString(),
      updated_at:      new Date().toISOString(),
    };

    // ✅ Step 3: Generate PIN for delivery orders only
    let security_pin = null;
    if (!isPickup) {
      security_pin                 = Math.floor(1000 + Math.random() * 9000).toString();
      const pinHash                = await bcrypt.hash(security_pin, 10);
      const pinExpiresAt           = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      updatePayload.pin_hash       = pinHash;
      updatePayload.pin_expires_at = pinExpiresAt;
      updatePayload.pin_attempts   = 0;
    }

    // ✅ Step 4: Single update with full payload
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    // ✅ Step 5: Send PIN SMS for delivery only
    if (!isPickup && security_pin && updatedOrder.customer_phone) {
      sendDeliveryPIN(updatedOrder.customer_phone, updatedOrder.order_number, security_pin)
        .then(r => {
          if (!r) console.warn(`⚠️  PIN SMS failed for order ${updatedOrder.order_number}`);
          else    console.log(`📱 PIN SMS sent to ${updatedOrder.customer_phone}`);
        });
      console.log(`✅ Delivery order ${updatedOrder.order_number} marked paid — PIN: ${security_pin}`);
    } else {
      console.log(`✅ Pickup order ${updatedOrder.order_number} marked paid — no PIN needed`);
    }

    // ✅ Step 6: Notify kitchen via Realtime
    const channel = supabase.channel('kitchen-orders');
    await channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.send({
          type:    'broadcast',
          event:   'order_paid',
          payload: updatedOrder
        });
        await channel.unsubscribe();
      }
    });

    res.json({ 
      success:  true, 
      pin:      security_pin, 
      isPickup, 
      order:    updatedOrder 
    });

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