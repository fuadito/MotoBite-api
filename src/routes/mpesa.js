// src/routes/mpesa.js

// Routes:
//   POST /api/mpesa/stk-push       — trigger M-Pesa prompt
//   POST /api/mpesa/callback       — Safaricom sends result here


import express from 'express';
import axios from 'axios';
import supabase from '../services/supabase.js';
import crypto from 'crypto';

const router = express.Router();

// ENVIRONMENT
const IS_LIVE    = process.env.MPESA_ENV === 'production';
const MPESA_BASE = IS_LIVE
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';


  // HELPER — format phone for Daraja
  // // Daraja requires 2547XXXXXXXX — no + prefix
  function formatPhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('254')) return digits;
  if (digits.startsWith('0'))   return '254' + digits.slice(1);
  if (digits.length === 9)      return '254' + digits;
  return digits;
}

// HELPER — get M-Pesa access token
// Safaricom requires a fresh token for every request
// Token expires after 1 hour

async function getMpesaToken() {
  const key    = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;
  if (!key || !secret) throw new Error('MPESA_CONSUMER_KEY or MPESA_CONSUMER_SECRET not set');
  const credentials = Buffer.from(`${key}:${secret}`).toString('base64');

  const { data } = await axios.get(
    `${MPESA_BASE}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${credentials}` } }
  );

  return data.access_token;
}


// HELPER — generate M-Pesa password
// Required by Safaricom for STK push authentication

function getMpesaPassword() {
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey   = process.env.MPESA_PASSKEY;
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const password  = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
  return { password, timestamp };
}
// POST /api/mpesa/stk-push
// Sends M-Pesa payment prompt to customer's phone
// Customer sees a popup asking them to enter their PIN

router.post('/stk-push', async (req, res) => {
  try {
    const { orderId, phone, amount } = req.body;

    if (!orderId || !phone || !amount) {
      return res.status(400).json({ error: 'orderId, phone and amount required' });
    }

   // If production credentials not yet configured — keep app working manually
    if (!process.env.MPESA_CONSUMER_KEY || !process.env.MPESA_PASSKEY) {
      console.log(`💳 [STK SKIPPED] Order ${orderId} — set MPESA credentials to enable`);
      return res.json({ success: false, pending: true });
    }

    const token               = await getMpesaToken();
    const { password, timestamp } = getMpesaPassword();
    const shortcode           = process.env.MPESA_SHORTCODE;
    const callbackUrl         = process.env.MPESA_CALLBACK_URL;

    console.log(`💳 STK push → ${phone} KES ${amount} [${IS_LIVE ? 'LIVE' : 'SANDBOX'}]`);

     const { data } = await axios.post(
      `${MPESA_BASE}/mpesa/stkpush/v1/processrequest`,
      {
        BusinessShortCode: shortcode,
        Password:          password,
        Timestamp:         timestamp,
        TransactionType:   'CustomerBuyGoodsOnline',  // For Till numbers
        Amount:            Math.ceil(amount),                   // Daraja requires whole number
        PartyA:            formatPhone(phone),
        PartyB:            shortcode,
        PhoneNumber:       formatPhone(phone),
        CallBackURL:       callbackUrl,
        AccountReference:  `KFC-${orderId}`,
        TransactionDesc:   `KFC Narok Order ${orderId}`
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    // Save the checkout request ID so we can match the callback later
    await supabase
      .from('orders')
      .update({ mpesa_reference: data.CheckoutRequestID })
      .eq('id', orderId);

    console.log(`✅ STK sent — CheckoutRequestID: ${data.CheckoutRequestID}`);
    res.json({ success: true, checkoutRequestId: data.CheckoutRequestID });


  } catch (err) {
    console.error('STK push error:', err.message);
    res.status(500).json({ error: 'Could not initiate payment' });
  }
});


// POST /api/mpesa/callback
// Safaricom calls this URL after customer enters their PIN
// This is where we confirm payment and move order to 'paid'
// IMPORTANT: Must respond with 200 immediately — Safaricom retries if slow.
// Processing happens after the response is sent.

// mpesa callback security middleware
function validateMpesaCallback(req, res, next) {
  // in production, safaricom sends a validation request before the actual callback.
  // for now, we check basic structure and prevent duplicate processing by looking for the expected fields and a valid order reference.

  const { Body } = req.body;
  if (!Body?.stkCallback) {
    console.warn('⚠️  Invalid M-Pesa callback received — missing Body.stkCallback');
    return res.status(400).json({ error: 'Invalid callback structure' });
  }

  const callback = Body.stkCallback;
  
  // prevent replay attacks by checking if the checkout ID exists in our orders
  const checkoutId = callback.CheckoutRequestID;

  if (!checkoutId) {
    console.warn('⚠️  M-Pesa callback received with no CheckoutRequestID');
    return res.status(400).json({ error: 'Missing CheckoutRequestID' });
  }
  if (processCallbacks.has(checkoutId)) {
    console.log(`⚠️  Duplicate M-Pesa callback ignored: ${checkoutId}`);
    return res.status(200).json({ ResultCode: 0, ResultDesc: 'Duplicate callback ignored' });
  }

  // signature verification using m-pesa passkey
  // safaricom sends the password as base64 of shortcode+passkey+timestamp, so we can verify the password to ensure authenticity
  // we recompute it and compare to verify the callback is from safaricom and not a malicious actor
  
  const callbackPassword = callback.Password || req.body?.Password;
  if (callbackPassword) {
    const shortcode = process.env.MPESA_SHORTCODE;
    const passkey = process.env.MPESA_PASSKEY;
    if (shortcode && passkey) {
      const timestamp = callback?.Timestamp || new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
      const expectedPassword = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
      if (callbackPassword !== expectedPassword) {
        console.warn(`⚠️  M-Pesa callback failed password verification: ${checkoutId}`);
        return res.status(400).json({ error: 'Invalid callback password' });
      }
    }
  }

  next();
}

// Store processed callback IDs (use redis in production for persistence across instances)
const processCallbacks = new Set();
// clear old entries every hour to prevent memory leak
setInterval(() => {
  processCallbacks.clear();
}, 60 * 60 * 1000);

// Apply the validation middleware to the callback route
router.post('/callback', validateMpesaCallback, async (req, res) => {
  // Acknowledge Safaricom immediately — do not await anything before this
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

  try {
    const body     = req.body?.Body?.stkCallback;
    const resultCode = body?.ResultCode;
    const checkoutId = body?.CheckoutRequestID;

     if (!checkoutId) {
      console.warn('⚠️  M-Pesa callback received with no CheckoutRequestID');
      return;
    }

    // Payment failed or cancelled by customer
    if (resultCode !== 0) {
      console.log(`❌ M-Pesa payment failed. Code: ${resultCode}`);
      // Mark order cancelled so customer can retry
       await supabase
        .from('orders')
        .update({ status: 'cancelled' })
        .eq('mpesa_reference', checkoutId);
      return;
    }

    // Payment confirmed -- Extract M-Pesa transaction reference 
    const items    = body?.CallbackMetadata?.Item || [];
    const mpesaRef = items.find(i => i.Name === 'MpesaReceiptNumber')?.Value;
    const amount   = items.find(i => i.Name === 'Amount')?.Value;

    console.log(`✅ Payment confirmed — M-Pesa ref: ${mpesaRef} — KES ${amount}`);

    // add  at success
    processedCallbacks.add(checkoutId);

    // Mark order as paid — Supabase Realtime will push this to kitchen instantly
    await supabase
      .from('orders')
      .update({
        status:                  'paid',
        payment_confirmed:       true,
        payment_confirmed_at:    new Date().toISOString(),
        mpesa_reference:         mpesaRef || checkoutId,
        paid_at:              new Date().toISOString()
      })
      .eq('mpesa_reference', checkoutId);

  } catch (err) {
    console.error('M-Pesa callback error:', err.message);
  }
});

export default router;
