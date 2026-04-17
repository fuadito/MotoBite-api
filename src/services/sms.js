// src/services/sms.js
// Africa's Talking SMS wrapper
// All SMS sending goes through this file
//
// Uses these environment variables:
//   AT_USERNAME — Your Africa's Talking username (usually 'sandbox' or your app name)
//   AT_API_KEY  — Your Africa's Talking API Key

import AfricasTalking from 'africastalking';

const AT_USERNAME = process.env.AT_USERNAME;
const AT_API_KEY = process.env.AT_API_KEY;

// ✅ DEBUG LOGGING
console.log('🔍 Africa\'s Talking Environment Check:');
console.log('   USERNAME:', AT_USERNAME || '❌ Missing');
console.log('   API_KEY:', AT_API_KEY ? '✅ Set' : '❌ Missing');

// Initialize Africa's Talking client
let smsClient = null;

if (AT_USERNAME && AT_API_KEY) {
  try {
    const africastalking = AfricasTalking({
      apiKey: AT_API_KEY,
      username: AT_USERNAME
    });
    smsClient = africastalking.SMS;
    console.log('✅ Africa\'s Talking SMS client initialized');
  } catch (err) {
    console.error('❌ Failed to initialize Africa\'s Talking:', err.message);
  }
} else {
  console.warn('⚠️ Africa\'s Talking credentials not set - SMS will not be sent');
}

// ─── HELPER — phone formatter ─────────────────────────────────────────────────
// Converts any Kenyan number to +254XXXXXXXXX format
// Accepts: 07XXXXXXXX  /  7XXXXXXXX  /  2547XXXXXXXX  /  +2547XXXXXXXX

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
    if (!smsClient) {
      console.warn('⚠️ SMS skipped — Africa\'s Talking not configured');
      return false;
    }

    const normalized = formatPhone(phone);

    // ✅ Validate number format
    if (!isValidKenyanNumber(normalized)) {
      console.error(`❌ Invalid Kenyan number: ${normalized}`);
      return false;
    }

    console.log(`📱 Sending SMS to ${normalized}`);

    const result = await smsClient.send({
      to: [normalized],
      message: message,
      // from: 'MotoBite'  // Optional: Set sender ID (needs approval from AT)
    });

    console.log('📤 Africa\'s Talking response:', JSON.stringify(result, null, 2));

    // Check result
    if (result.SMSMessageData && result.SMSMessageData.Recipients) {
      const recipient = result.SMSMessageData.Recipients[0];
      
      if (recipient.status === 'Success' || recipient.statusCode === 101) {
        console.log(`✅ SMS sent to ${normalized} | MessageId: ${recipient.messageId} | Cost: ${recipient.cost}`);
        return true;
      } else {
        console.warn(`⚠️ SMS failed: ${recipient.status} (${recipient.statusCode})`);
        return false;
      }
    } else {
      console.warn('⚠️ Unexpected response format from Africa\'s Talking');
      return false;
    }

  } catch (err) {
    console.error('❌ SMS error:', err.message);
    
    // ✅ Helpful hints per error
    if (err.message.includes('Invalid API key')) {
      console.error('   💡 Fix: Check your AT_API_KEY in environment variables');
    }
    if (err.message.includes('username')) {
      console.error('   💡 Fix: Check your AT_USERNAME (should be "sandbox" or your app name)');
    }
    if (err.message.includes('Insufficient balance')) {
      console.error('   💡 Fix: Add credits to your Africa\'s Talking account');
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