// src/routes/mpesa.js

// Routes:
//   POST /api/mpesa/stk-push       — trigger M-Pesa prompt
//   POST /api/mpesa/callback       — Safaricom sends result here


import express from 'express';
import axios from 'axios';
import supabase from '../services/supabase.js';

const router = express.Router();

// HELPER — get M-Pesa access token
// Safaricom requires a fresh token for every request
// Token expires after 1 hour

async function getMpesaToken() {
  const key    = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;

  const credentials = Buffer.from(`${key}:${secret}`).toString('base64');

  const { data } = await axios.get(
    'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
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

    // Check if Daraja credentials are configured
    if (!process.env.MPESA_CONSUMER_KEY || process.env.MPESA_CONSUMER_KEY === 'your-consumer-key-here') {
      console.log(`💳 [DEMO] STK push to ${phone} for KES ${amount} — Daraja not configured yet`);
      return res.json({ success: true, demo: true, message: 'Demo mode — Daraja not configured' });
    }

    const token               = await getMpesaToken();
    const { password, timestamp } = getMpesaPassword();
    const shortcode           = process.env.MPESA_SHORTCODE;
    const callbackUrl         = process.env.MPESA_CALLBACK_URL;

    const { data } = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      {
        BusinessShortCode: shortcode,
        Password:          password,
        Timestamp:         timestamp,
        TransactionType:   'CustomerBuyGoodsOnline',
        Amount:            amount,
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

    res.json({ success: true, checkoutRequestId: data.CheckoutRequestID });

  } catch (err) {
    console.error('STK push error:', err.message);
    res.status(500).json({ error: 'Could not initiate payment' });
  }
});


// POST /api/mpesa/callback
// Safaricom calls this URL after customer enters their PIN
// This is where we confirm payment and move order to 'paid'

router.post('/callback', async (req, res) => {
  try {
    const body     = req.body?.Body?.stkCallback;
    const resultCode = body?.ResultCode;
    const checkoutId = body?.CheckoutRequestID;

    // Always respond to Safaricom immediately — they expect a fast response
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

    // Payment failed or cancelled by customer
    if (resultCode !== 0) {
      console.log(`❌ M-Pesa payment failed. Code: ${resultCode}`);
      return;
    }

    // Extract M-Pesa transaction reference
    const items    = body?.CallbackMetadata?.Item || [];
    const mpesaRef = items.find(i => i.Name === 'MpesaReceiptNumber')?.Value;

    console.log(`✅ Payment confirmed — M-Pesa ref: ${mpesaRef}`);

    // Find the order by checkout request ID and mark as paid
    await supabase
      .from('orders')
      .update({
        status:                  'paid',
        payment_confirmed:       true,
        payment_confirmed_at:    new Date().toISOString(),
        mpesa_reference:         mpesaRef || checkoutId
      })
      .eq('mpesa_reference', checkoutId);

  } catch (err) {
    console.error('M-Pesa callback error:', err.message);
  }
});


export default router;
