// src/routes/admin.js

// Routes:
//   GET  /api/admin/stats            — dashboard metrics
//   GET  /api/admin/orders           — all orders
//   GET  /api/admin/riders/pending   — pending rider applications
//   POST /api/admin/riders/approve   — approve a rider
//   POST /api/admin/riders/suspend   — suspend/reject a rider


import express from 'express';
import supabase from '../services/supabase.js';
import { sendRiderApproved, sendRiderRejected, sendRiderSuspended } from '../services/sms.js';

const router = express.Router();

// GET /api/admin/stats
// Returns 4 metrics for the admin dashboard overview

router.get('/stats', async (req, res) => {
  try {
    // Get today's date range
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Active orders — not delivered or cancelled
    const { data: activeOrders } = await supabase
      .from('orders')
      .select('id')
      .not('status', 'in', '("delivered","cancelled")');

    // Delivered today
    const { data: deliveredToday } = await supabase
      .from('orders')
      .select('id, food_amount')
      .eq('status', 'delivered')
      .gte('delivered_at', todayStart.toISOString())
      .lte('delivered_at', todayEnd.toISOString());

    // Online riders
    const { data: onlineRiders } = await supabase
      .from('riders')
      .select('id')
      .eq('is_available', true)
      .eq('status', 'approved');

    // Revenue today — sum of all delivered orders
    const revenueToday = (deliveredToday || [])
      .reduce((sum, o) => sum + o.food_amount, 0);

    res.json({
      active_orders:   (activeOrders || []).length,
      delivered_today: (deliveredToday || []).length,
      revenue_today:   revenueToday,
      online_riders:   (onlineRiders || []).length
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
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

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
// Admin approves a rider application

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

   
    // Fetch rider name for the SMS
    const { data: rider } = await supabase
      .from('riders')
      .select('name')
      .eq('phone', phone)
      .single();

    // Notify rider via SMS
    sendRiderApproved(phone, rider?.name || 'Rider')
      .then(r => {
        if (!r.success) console.warn(`⚠️  Approval SMS failed for ${phone}:`, r.error);
      });

    console.log(`✅ Rider ${phone} approved - SMS sent`);
    res.json({ success: true });

  } catch (err) {
    console.error('Approve rider error:', err.message);
    res.status(500).json({ error: 'Could not approve rider' });
  }
});

// POST /api/admin/riders/suspend
// Admin rejects or suspends a rider

router.post('/riders/suspend', async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'Phone required' });
    }

       // Fetch name and CURRENT status BEFORE updating
    // so we can correctly detect if this is a rejection (was pending)
    // or a suspension (was approved)
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

    // Send appropriate SMS based on whether this is a rejection or suspension
    const wasPending = rider?.status === 'pending';
    if (wasPending) {
      sendRiderRejected(phone, rider?.name || 'Rider')
        .then(r => {
          if (!r.success) console.warn(`⚠️  Rejection SMS failed for ${phone}:`, r.error);
        });
    } else {
      sendRiderSuspended(phone)
        .then(r => {
          if (!r.success) console.warn(`⚠️  Suspension SMS failed for ${phone}:`, r.error);
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
router.post('/:id/mark-paid', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('orders')
      .update({
        status:               'paid',
        payment_confirmed:    true,
        payment_confirmed_at: new Date().toISOString(),
        paid_at:              new Date().toISOString()
      })
      .eq('id', id)
      .eq('status', 'pending'); // only update if still pending — prevents double-confirm

    if (error) throw error;
    console.log(`✅ Admin marked order ${id} as paid`);
    res.json({ success: true });
  } catch (err) {
    console.error('Mark paid error:', err.message);
    res.status(500).json({ error: 'Could not mark as paid' });
  }
});


export default router;

