// src/services/sms.js
// Africa's Talking SMS wrapper
// All SMS sending goes through this file — nothing calls AT directly
//
// Uses these Railway environment variables:
//   AT_API_KEY    — your Africa's Talking API key
//   AT_USERNAME   — your Africa's Talking username (e.g. 'kfcnarok' or 'sandbox')
//   AT_SENDER_ID  — your registered sender name e.g. 'KFCNAROK' (optional — remove if not approved yet)
//
// To switch between sandbox and live:
//   Sandbox  → AT_USERNAME=sandbox  + AT_API_KEY=your-sandbox-key
//   Live     → AT_USERNAME=kfcnarok + AT_API_KEY=your-live-key



import AfricasTalking from 'africastalking';

// Initialise the AT client once — reused across all sends
const at = AfricasTalking({
  apiKey:   process.env.AT_API_KEY,
  username: process.env.AT_USERNAME
});

const sms = at.SMS;

// ─── HELPER ─────────────────────────────────────────────────────────────────
// Formats any Kenyan number to the +254XXXXXXXXX format AT requires
// Accepts: 07XXXXXXXX, 7XXXXXXXX, 2547XXXXXXXX, +2547XXXXXXXX

function formatPhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('254')) return `+${digits}`;
  if (digits.startsWith('0'))   return `+254${digits.slice(1)}`;
  if (digits.length === 9)      return `+254${digits}`;
  return `+${digits}`;
}


// ─── CORE SEND ───────────────────────────────────────────────────────────────
// All SMS calls go through here
// Returns { success: true } or { success: false, error: '...' }

async function sendSMS(phone, message) {
  try {
    const to = formatPhone(phone);

    const options = {
      to:      [to],
      message: message,
    };

    // Only attach sender ID if one is configured
    // (Sender IDs need to be registered with AT — remove this line
    //  and use sandbox or shortcode until yours is approved)
    if (process.env.AT_SENDER_ID) {
      options.from = process.env.AT_SENDER_ID;
    }

    const result = await sms.send(options);
    const recipient = result.SMSMessageData?.Recipients?.[0];

    if (recipient?.status === 'Success') {
      console.log(`📱 SMS sent to ${to} — cost: ${recipient.cost}`);
      return { success: true };
    } else {
      console.error(`📵 SMS failed to ${to}:`, recipient?.status);
      return { success: false, error: recipient?.status };
    }

  } catch (err) {
    console.error('SMS send error:', err.message);
    return { success: false, error: err.message };
  }
}


// ─── MESSAGE TEMPLATES ───────────────────────────────────────────────────────
// One function per SMS type — keeps messages consistent and easy to edit


// Sent to customer immediately after they place an order
// pin is the plain 4-digit number (generated before hashing)

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
    `Habari ${name}! Your KFC Narok rider account has been APPROVED. ` +
    `Open the app, select Rider and enter your phone number to start earning. ` +
    `Welcome to the team! 🏍️`;

  return sendSMS(phone, message);
}


// Sent to rider when admin rejects their application

export async function sendRiderRejected(phone, name) {
  const message =
    `Hi ${name}, unfortunately your KFC Narok rider application was not approved at this time. ` +
    `For more information call: 0702 923 826.`;

  return sendSMS(phone, message);
}


// Sent to rider when their account is suspended

export async function sendRiderSuspended(phone) {
  const message =
    `Your KFC Narok rider account has been suspended. ` +
    `Contact us on 0702 923 826 if you believe this is a mistake.`;

  return sendSMS(phone, message);
}
