// src/services/sms.js
// Africa's Talking SMS wrapper
// All SMS sending goes through this file — nothing calls AT directly
//
// Uses these Railway environment variables:
//   AT_API_KEY    — your Africa's Talking API key
//   AT_USERNAME   — your AT username (sandbox during testing, your username when live)
//   AT_SENDER_ID  — optional registered sender ID e.g. 'KFCNAROK'
//
// Sandbox testing:
//   AT_USERNAME=sandbox  +  AT_API_KEY=<your sandbox key from AT dashboard>
//   Messages won't reach real phones but the API returns success responses
//
// Go live:
//   AT_USERNAME=<your real AT username>  +  AT_API_KEY=<your live API key>


import AfricasTalking from 'africastalking';

// Simple direct init — AT client is created once at module load
const at = AfricasTalking({
  apiKey:   process.env.AT_API_KEY,
  username: process.env.AT_USERNAME
});

const sms = at.SMS;


// ─── HELPER — phone formatter ─────────────────────────────────────────────────
// Converts any Kenyan number to +254XXXXXXXXX format AT requires
// Accepts: 07XXXXXXXX  /  7XXXXXXXX  /  2547XXXXXXXX  /  +2547XXXXXXXX

function formatPhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('254')) return `+${digits}`;
  if (digits.startsWith('0'))   return `+254${digits.slice(1)}`;
  if (digits.length === 9)      return `+254${digits}`;
  return `+${digits}`;
}


// ─── CORE SEND ────────────────────────────────────────────────────────────────
// All SMS calls pass through here
// Returns the Africa's Talking response object on success, or null on failure

export async function sendSMS(phone, message) {
  try {
    const normalized = formatPhone(phone);
    const result = await sms.send({
      to:      [normalized],
      message,
      from:    process.env.AT_SENDER_ID || 'KFC-NAROK'
    });
    console.log(`📱 SMS sent to ${normalized}:`, result);
    return result;
  } 
  
  catch (err) {
    console.warn('SMS skipped — AT credentials not set');
    return null;
  }
}


// ─── MESSAGE TEMPLATES ────────────────────────────────────────────────────────

// Sent to customer immediately after placing an order
export async function sendDeliveryPIN(phone, orderNumber, pin) {
  const message =
    `KFC Narok - Order ${orderNumber}\n` +
    `Your delivery PIN is: ${pin}\n` +
    `Share this PIN with your rider ONLY after you receive your food.\n` +
    `Do not share it before delivery.`;

  return sendSMS(phone, message);
}

// Sent to rider when admin approves their application
export async function sendRiderApproved(phone, name) {
  const message =
    `Congratulations! Your KFC Narok rider application has been APPROVED. ` +
    `You can now log in to the app with your phone number and start earning. ` +
    `Welcome to the team, ${name}!`;

  return sendSMS(phone, message);
}

// Sent to rider when admin rejects their application
export async function sendRiderRejected(phone, name) {
  const message =
    `Hi ${name}, your KFC Narok rider application was not successful at this time. ` +
    `Contact us at 0702 923 826 for more information.`;

  return sendSMS(phone, message);
}

// Sent to rider when their account is suspended
export async function sendRiderSuspended(phone) {
  const message =
    `Your KFC Narok rider account has been suspended. ` +
    `Contact us on 0702 923 826 if you believe this is a mistake.`;

  return sendSMS(phone, message);
}