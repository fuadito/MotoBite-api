// src/services/pesapal.js
// Pesapal v3 API wrapper with token caching and IPN management.
//
// Environment variables required:
//   PESAPAL_CONSUMER_KEY    — from Pesapal merchant dashboard
//   PESAPAL_CONSUMER_SECRET — from Pesapal merchant dashboard
//   PESAPAL_ENV             — 'sandbox' (default) | 'production'
//   APP_URL                 — your public URL, e.g. https://motobite.app
//
// Sandbox base:    https://cybqa.pesapal.com/pesapalv3
// Production base: https://pay.pesapal.com/v3

const BASE = process.env.PESAPAL_ENV === 'production'
  ? 'https://pay.pesapal.com/v3'
  : 'https://cybqa.pesapal.com/pesapalv3';

// ── Token cache — tokens are valid for ~5 minutes ─────────────────────────────
let _token       = null;
let _tokenExpiry = null;

// ── IPN ID cache — register once per server restart ───────────────────────────
// Store in env var PESAPAL_IPN_ID after first registration to survive restarts.
let _ipnId = process.env.PESAPAL_IPN_ID || null;

// ── Helper ────────────────────────────────────────────────────────────────────
async function pesapalFetch(path, options = {}) {
  const url = `${BASE}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await res.text();

  console.log("Pesapal URL:", url);
  console.log("Pesapal raw response:", text);

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `Pesapal returned non-JSON. URL: ${url}\nResponse: ${text.slice(0, 300)}`
    );
  }

  if (data.error?.code) {
    throw new Error(
      `Pesapal error [${path}]: ${data.error.message || JSON.stringify(data.error)}`
    );
  }

  return data;
}

// ── 1. Auth — get bearer token ─────────────────────────────────────────────────
export async function getPesapalToken() {
  // Return cached token if still valid (subtract 30s buffer)
  if (_token && _tokenExpiry && new Date() < new Date(_tokenExpiry) - 30000) {
    return _token;
  }

  const data = await pesapalFetch('/api/Auth/RequestToken', {
    method: 'POST',
    body:   JSON.stringify({
      consumer_key:    process.env.PESAPAL_CONSUMER_KEY,
      consumer_secret: process.env.PESAPAL_CONSUMER_SECRET
    })
  });

  if (!data.token) throw new Error('Pesapal auth: no token in response');

  _token       = data.token;
  _tokenExpiry = data.expiryDate; // ISO string
  console.log('🔑 Pesapal token refreshed');
  return _token;
}

// ── 2. IPN Registration — tell Pesapal where to send payment notifications ────
// Only needs to be done once; ipn_id is stable per URL.
// If PESAPAL_IPN_ID is set in env, registration is skipped on restarts.
export async function getIpnId() {
  if (_ipnId) return _ipnId;

  const token  = await getPesapalToken();
  const ipnUrl = `${process.env.APP_URL}/api/orders/pesapal-ipn`;

  const data = await pesapalFetch('/api/URLSetup/RegisterIPN', {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}` },
    body:    JSON.stringify({ url: ipnUrl, ipn_notification_type: 'POST' })
  });

  if (!data.ipn_id) throw new Error(`IPN registration failed: ${JSON.stringify(data)}`);

  _ipnId = data.ipn_id;
  // Log so you can add PESAPAL_IPN_ID=<value> to .env to skip re-registration on restart
  console.log(`📡 Pesapal IPN registered — id: ${_ipnId} — add PESAPAL_IPN_ID=${_ipnId} to .env`);
  return _ipnId;
}

// ── 3. Submit order to Pesapal — returns redirect URL ─────────────────────────
export async function submitPesapalOrder({ orderId, orderNumber, amount, customerName, customerPhone }) {
  const token = await getPesapalToken();
  const ipnId = await getIpnId();

  // Split name into first / last for Pesapal billing_address
  const parts     = (customerName || 'Customer').trim().split(' ');
  const firstName = parts[0];
  const lastName  = parts.length > 1 ? parts.slice(1).join(' ') : parts[0];

  // Pesapal requires a unique merchant reference per order
  const merchantRef = `MB-${orderNumber}-${orderId}`;

  // callback_url — where Pesapal redirects the iframe after payment
  // We use a minimal /pesapal-return page (or the main app URL).
  // The real payment detection happens via IPN + polling, not the callback redirect.
  const callbackUrl = `${process.env.APP_URL}/pesapal-return`;

  const data = await pesapalFetch('/api/Transactions/SubmitOrderRequest', {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}` },
    body:    JSON.stringify({
      id:              merchantRef,
      currency:        'KES',
      amount,
      description:     `MotoBite Order ${orderNumber}`,
      callback_url:    callbackUrl,
      notification_id: ipnId,
      billing_address: {
        email_address: `${customerPhone.replace(/\D/g, '')}@motobite.app`,
        phone_number:  customerPhone,
        country_code:  'KE',
        first_name:    firstName,
        last_name:     lastName,
        line_1:        'Narok Town',
        city:          'Narok',
        state:         'Narok County',
        postal_code:   '20500',
        zip_code:      '20500'
      }
    })
  });

  if (!data.redirect_url) {
    throw new Error(`Pesapal submit failed: ${JSON.stringify(data)}`);
  }

  return {
    redirectUrl:  data.redirect_url,
    trackingId:   data.order_tracking_id,
    merchantRef
  };
}

// ── 4. Get transaction status — called from IPN handler and manual verify ─────
export async function getTransactionStatus(orderTrackingId) {
  const token = await getPesapalToken();
  const data  = await pesapalFetch(
    `/api/Transactions/GetTransactionStatus?orderTrackingId=${orderTrackingId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  // payment_status_description: 'Completed' | 'Failed' | 'Invalid' | 'Reversed'
  // status_code: 1=Completed, 0=Invalid, 2=Failed, 3=Reversed
  return data;
}
export async function verifyPesapalPayment(orderTrackingId) {
  try {
    const token = await getPesapalToken();
    const response = await axios.get(
      `${baseUrl}/api/Transactions/GetTransactionStatus?orderTrackingId=${orderTrackingId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    // validate response structure and status code
    if (!response.data || response.data.status_code !== '200') {
     return {
      success: false,
      status: response.data?.status || 'error',
      message: response.data?.message || 'Invalid response from Pesapal'
     };
    }
    const payment = response.data;

    // Additional validation: ensure amounts match expected values, check 
    // This should be checked against the order details in your database to prevent tampering.

    return {
      success: true,
      status: payment.payment_status_description, // e.g. 'Completed'
     amount: payment.amount,
     currency: payment.currency,
     paymentMethod: payment.payment_method,
     confirmationCode: payment.confirmation_code,
     paymentAccount: payment.payment_account,
     trackingId: payment.order_tracking_id, // dont trust this blindly, verify against your database records
     merchantReference: payment.merchant_reference
    };
  } catch (error)
  {
    console.error('Error verifying Pesapal payment:', error.message);
    return {
      success: false,
      status: 'error',
      message: error.message || 'Error verifying payment'
    };  
  }

}
export { BASE };