// src/services/dispatch.js
//
// Rider Dispatch System
// ─────────────────────
// When kitchen marks an order "ready", this service:
// 1. Finds all online, approved, unoccupied riders
// 2. Broadcasts the order to them via Supabase Realtime
// 3. The first rider to tap ACCEPT calls POST /api/orders/:id/accept
// 4. If no rider responds within 3 minutes, the order stays "ready"
//    and dispatch fires again on the next kitchen poll cycle
//
// Broadcast channel : rider-dispatch (all online riders subscribe to this)
// Broadcast event   : new_order
// Payload         : full order object the frontend needs to render the alert

import supabase from './supabase.js';

// ─── MAIN DISPATCH FUNCTION ───────────────────────────────────────────────────
// Called by kitchen.js when an order status changes to 'ready'
// orderId — the DB id of the order just marked ready

export async function dispatchOrder(orderId) {
  try {

    // 1. Fetch the full order — we send the whole thing as the broadcast payload
    //    so riders can render the alert without a separate API call
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select(`
        id, order_number, status, food_amount,
        items, special_notes, customer_area, landmark,
        customer_lat, customer_lng, location,
        created_at, paid_at
      `)
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
      console.error(`❌ Dispatch: could not fetch order ${orderId}:`, orderErr?.message);
      return { success: false, error: 'Order not found' };
    }

    // 2. Find available riders
    //    — status must be 'approved' (not pending or suspended)
    //    — is_available must be true (rider toggled themselves online)
    //    — must not already have an active delivery

    const { data: availableRiders, error: riderErr } = await supabase
      .from('riders')
      .select('phone, name')
      .eq('status', 'approved')
      .eq('is_available', true);

    if (riderErr) {
      console.error('❌ Dispatch: could not fetch riders:', riderErr.message);
      return { success: false, error: 'Could not fetch riders' };
    }

    // Filter out riders already on a delivery
    // A rider is busy if they have an order in rider_assigned or picked_up status

    const { data: busyRiders } = await supabase
      .from('orders')
      .select('rider_phone')
      .in('status', ['rider_assigned', 'picked_up'])
      .not('rider_phone', 'is', null);

    const busyPhones = new Set((busyRiders || []).map(r => r.rider_phone));
    const freeRiders = (availableRiders || []).filter(r => !busyPhones.has(r.phone));

    if (!freeRiders.length) {
      // No riders available right now — order stays "ready" on kitchen board
      // Kitchen will keep it visible; admin can see it too
      console.warn(`⚠️ Order ${order.order_number}: no riders available right now`);
      return { success: false, noRiders: true };
    }

    // Build helper variables used in the payload below
    const orderLat = order.customer_lat ?? order.location?.lat ?? null;
    const orderLng = order.customer_lng ?? order.location?.lng ?? null;
    const deliveryHint = order.landmark
      ? `${order.customer_area || 'Narok Town'} — ${order.landmark}`
      : (order.customer_area || 'Narok Town');

    console.log(`🚀 Dispatching order ${order.order_number} to ${freeRiders.length} rider(s)`);

    // 3. Build a clean payload — exactly what the frontend showRiderOrderAlert() needs
    //    We normalise location so the haversine distance calc works on the rider side
    const payload = {
      id: order.id,
      order_number: order.order_number,
      status: order.status,
      food_amount: order.food_amount,
      items: order.items || [],
      special_notes: order.special_notes || null,
      customer_area: order.customer_area || 'Narok Town',
      landmark: order.landmark || null,
      delivery_hint: deliveryHint,
      location: orderLat && orderLng
        ? { lat: orderLat, lng: orderLng }
        : (order.location || null),
      customer_lat: orderLat,
      customer_lng: orderLng,
      paid_at: order.paid_at || order.created_at,
    };

    // 4. Broadcast to the shared rider-dispatch channel
    //    All online riders are subscribed — first to tap ACCEPT wins
    //    Supabase Realtime broadcast does NOT require a DB table
    const channel = supabase.channel('rider-dispatch');

    await channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.send({
          type: 'broadcast',
          event: 'new_order',
          payload: payload
        });

        console.log(`📡 Order ${order.order_number} broadcast sent to ${freeRiders.length} rider(s)`);

        // Unsubscribe after sending — we don't need to keep this channel open
        await channel.unsubscribe();
      }
    });

    return { success: true, riderCount: freeRiders.length };

  } catch (err) {
    console.error('Dispatch error:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── RE-DISPATCH STALE READY ORDERS ──────────────────────────────────────────
// Called on a timer from index.js every 3 minutes
// Catches any "ready" orders that were missed (no riders were online at dispatch time)
// so they get a second chance when a rider comes online
//
// FIX: Uses updated_at instead of ready_at to avoid crash if ready_at column
//      does not exist in schema.  If you ADD ready_at later, switch to the
//      commented query below.

export async function redispatchStaleOrders() {
  try {
    const twoMinsAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();

    /*
    // Use this version ONLY after adding a ready_at column to orders table:
    const { data: staleOrders } = await supabase
      .from('orders')
      .select('id, order_number')
      .eq('status', 'ready')
      .is('rider_phone', null)
      .or(`ready_at.lt.${twoMinsAgo},and(ready_at.is.null,updated_at.lt.${twoMinsAgo})`);
    */

    // SAFE version — works with or without ready_at column:
    const { data: staleOrders } = await supabase
      .from('orders')
      .select('id, order_number')
      .eq('status', 'ready')
      .is('rider_phone', null)
      .lt('updated_at', twoMinsAgo);

    if (!staleOrders?.length) return;

    console.log(`🔄 Re-dispatching ${staleOrders.length} stale order(s)...`);

    for (const order of staleOrders) {
      await dispatchOrder(order.id);
    }

  } catch (err) {
    console.error('Re-dispatch error:', err.message);
  }
}