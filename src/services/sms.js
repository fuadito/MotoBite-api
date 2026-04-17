// src/services/sms.js
// Twilio SMS wrapper
// All SMS sending goes through this file
//
// Uses these environment variables:
//   TWILIO_ACCOUNT_SID           — Your Twilio Account SID
//   TWILIO_AUTH_TOKEN            — Your Twilio Auth Token
//   TWILIO_PHONE_NUMBER          — Your Twilio phone number (fallback)
//   TWILIO_MESSAGING_SERVICE_SID — Your Twilio Messaging Service SID (preferred)

import twilio from 'twilio';

const TWILIO_ACCOUNT_SID          = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN           = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER         = process.env.TWILIO_PHONE_NUMBER;
const TWILIO_MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID;

// ✅ DEBUG LOGGING
console.log('🔍 Twilio Environment Check:');
console.log('   ACCOUNT_SID:', TWILIO_ACCOUNT_SID 
  ? `${TWILIO_ACCOUNT_SID.substring(0, 10)}...` 
  : '❌ Missing');
console.log('   AUTH_TOKEN:', TWILIO_AUTH_TOKEN 
  ? '✅ Set' 
  : '❌ Missing');
console.log('   PHONE_NUMBER:', TWILIO_PHONE_NUMBER    || '⚠️  Not set (using Messaging Service)');
console.log('   MESSAGING_SERVICE_SID:', TWILIO_MESSAGING_SERVICE_SID 
  ? `${TWILIO_MESSAGING_SERVICE_SID.substring(0, 10)}...` 
  : '⚠️  Not set (falling back to phone number)');

// ─── Validate at least one sender is configured ───────────────────────────────
if (!TWILIO_MESSAGING_SERVICE_SID && !TWILIO_PHONE_NUMBER) {
  console.error('❌ Twilio sender not configured — set TWILIO_MESSAGING_SERVICE_SID or TWILIO_PHONE_NUMBER');
}

// ─── Initialize Twilio client ─────────────────────────────────────────────────
let client = null;

if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
  client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  console.log('✅ Twilio SMS client initialized');
} else {
  console.warn('⚠️ Twilio credentials not set — SMS will not be sent');
}

// ─── HELPER — phone formatter ─────────────────────────────────────────────────
// Converts any Kenyan number to +254XXXXXXXXX format
// Accepts: 07XXXXXXXX / 7XXXXXXXX / 2547XXXXXXXX / +2547XXXXXXXX

function formatPhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('254')) return `+${digits}`;
  if (digits.startsWith('0'))   return `+254${digits.slice(1)}`;
  if (digits.length === 9)      return `+254${digits}`;
  return `+${digits}`;
}

// ─── Validate Kenyan number ───────────────────────────────────────────────────
function isValidKenyanNumber(phone) {
  // Must be +2547XXXXXXXX or +2541XXXXXXXX (12 digits total)
  return /^\+254[17]\d{8}$/.test(phone);
}

// ─── CORE SEND ────────────────────────────────────────────────────────────────
// All SMS calls pass through here
// Returns true on success, false on failure

export async function sendSMS(phone, message) {
  try {
    if (!client) {
      console.warn('⚠️ SMS skipped — Twilio not configured');
      return false;
    }

    const normalized = formatPhone(phone);

    // ✅ Validate number format
    if (!isValidKenyanNumber(normalized)) {
      console.error(`❌ Invalid Kenyan number: ${normalized}`);
      return false;
    }

    console.log(`📱 Sending SMS to ${normalized}`);

    // ✅ Build message params
    // Prefer Messaging Service SID (fixes geo-permission issues)
    // Fall back to direct phone number
    const messageParams = {
      body: message,
      to: normalized,
      ...(TWILIO_MESSAGING_SERVICE_SID
        ? { messagingServiceSid: TWILIO_MESSAGING_SERVICE_SID }  // ✅ Preferred
        : { from: TWILIO_PHONE_NUMBER }                          // ⚠️ Fallback
      )
    };

    console.log('📤 Using sender:', TWILIO_MESSAGING_SERVICE_SID 
      ? `Messaging Service (${TWILIO_MESSAGING_SERVICE_SID.substring(0, 10)}...)` 
      : `Phone Number (${TWILIO_PHONE_NUMBER})`
    );

    const result = await client.messages.create(messageParams);

    const successStatuses = ['queued', 'sent', 'delivered'];

    if (successStatuses.includes(result.status)) {
      console.log(`✅ SMS sent to ${normalized} | SID: ${result.sid} | Status: ${result.status}`);
      return true;
    } else {
      console.warn(`⚠️ Unexpected SMS status: ${result.status} for ${normalized}`);
      return false;
    }

  } catch (err) {
    // ✅ Detailed error logging
    console.error('❌ SMS error:', err.message);
    console.error('   Code:', err.code);
    console.error('   More info:', err.moreInfo || 'N/A');

    // ✅ Helpful hints per error code
    if (err.code === 21608) {
      console.error('   💡 Fix: This number is not verified in your Twilio trial account');
      console.error('   💡 Go to: Twilio Console → Verified Caller IDs → Add number');
    }
    if (err.code === 21211) {
      console.error('   💡 Fix: Invalid "To" phone number format');
    }
    if (err.code === 21614) {
      console.error('   💡 Fix: "To" number not valid for SMS');
    }
    if (err.code === 21215) {
      console.error('   💡 Fix: Enable Kenya in Twilio Geo Permissions');
      console.error('   💡 Go to: Messaging → Settings → Geo Permissions → Kenya ✅');
    }
    if (err.code === 20003) {
      console.error('   💡 Fix: Invalid Twilio credentials — check ACCOUNT_SID and AUTH_TOKEN');
    }

    return false;
  }
}

// ─── MESSAGE TEMPLATES ────────────────────────────────────────────────────────

// Sent to customer immediately after placing an order
export async function sendDeliveryPIN(phone, orderNumber, pin) {
  const message =
    `MotoBite - Order ${orderNumber}\n` +
    `Your delivery PIN is: ${pin}\n` +
    `Share this PIN with your rider ONLY after you receive your food.\n` +
    `Do not share it before delivery.`;

  return sendSMS(phone, message);
}

// Sent to rider when admin approves their application
export async function sendRiderApproved(phone, name) {
  const message =
    `Congratulations! Your MotoBite rider application has been APPROVED. ` +
    `You can now log in to the app with your phone number and start earning. ` +
    `Welcome to the team, ${name}!`;

  return sendSMS(phone, message);
}

// Sent to rider when admin rejects their application
export async function sendRiderRejected(phone, name) {
  const message =
    `Hi ${name}, your MotoBite rider application was not successful at this time. ` +
    `Contact us at support@motobite.com for more information.`;

  return sendSMS(phone, message);
}

// Sent to rider when their account is suspended
export async function sendRiderSuspended(phone) {
  const message =
    `Your MotoBite rider account has been suspended. ` +
    `Contact us at support@motobite.com if you believe this is a mistake.`;

  return sendSMS(phone, message);
}

// Send order confirmation SMS
export async function sendOrderConfirmation(phone, orderNumber) {
  const message =
    `MotoBite - Order ${orderNumber} received! ` +
    `We're preparing your food. You'll receive your delivery PIN shortly.`;

  return sendSMS(phone, message);
}