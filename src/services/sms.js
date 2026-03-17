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
 
// Lazy initialization — client is created on first use, not at module load.
// This prevents a silent startup crash if env vars aren't set yet.
let _sms = null;
 
function getSMS() {
  if (_sms) return _sms;
 
  const apiKey   = process.env.AT_API_KEY;
  const username = process.env.AT_USERNAME;
 
  if (!apiKey || !username) {
    console.error('❌ SMS not configured — AT_API_KEY or AT_USERNAME missing from Railway variables');
    return null;
  }
 
  try {
    const at = AfricasTalking({ apiKey, username });
    _sms = at.SMS;
    console.log(`📱 Africa's Talking SMS initialised (username: ${username})`);
    return _sms;
  } catch (err) {
    console.error('❌ Africa\'s Talking init failed:', err.message);
    return null;
  }
}
 
 
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
// Returns { success: true } or { success: false, error: '...' }
 
async function sendSMS(phone, message) {
  const sms = getSMS();
 
  if (!sms) {
    // SMS not configured — log clearly so it shows up in Railway logs
    console.warn(`📵 SMS skipped (not configured) → ${formatPhone(phone)}: "${message.slice(0, 40)}..."`);
    return { success: false, error: 'SMS service not configured' };
  }
 
  try {
    const to = formatPhone(phone);
 
    const options = { to: [to], message };
 
    // Attach sender ID only if configured
    // Remove AT_SENDER_ID from Railway vars if not yet approved by AT
    if (process.env.AT_SENDER_ID) {
      options.from = process.env.AT_SENDER_ID;
    }
 
    console.log(`📤 Sending SMS to ${to}...`);
    const result    = await sms.send(options);
    const recipient = result.SMSMessageData?.Recipients?.[0];
 
    if (recipient?.status === 'Success') {
      console.log(`✅ SMS delivered to ${to} — cost: ${recipient.cost}`);
      return { success: true };
    }
 
    // AT returned a non-success status — log the full recipient object so we can debug
    console.error(`❌ SMS failed to ${to} — status: ${recipient?.status}`, JSON.stringify(recipient));
    return { success: false, error: recipient?.status || 'Unknown AT error' };
 
  } catch (err) {
    console.error(`❌ SMS exception for ${formatPhone(phone)}:`, err.message);
    return { success: false, error: err.message };
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
    `Habari ${name}! Your KFC Narok rider account has been APPROVED. ` +
    `Open the app, select Rider and enter your phone number to start earning. ` +
    `Welcome to the team!`;
 
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
 
 