// api/_lib/whatsappOtp.js
//
// Sends the login code through JCM's own WhatsApp Business API (Meta Cloud
// API) using the approved Authentication template `invoice_portal_otp`
// (category Authentication, "copy code" button).
//
// Environment variables needed:
//   WHATSAPP_TOKEN            permanent system-user token
//   WHATSAPP_PHONE_NUMBER_ID  the sending number's id
// Optional:
//   WHATSAPP_OTP_TEMPLATE       default "invoice_portal_otp"
//   WHATSAPP_OTP_TEMPLATE_LANG  default "en"
//   WHATSAPP_API_VERSION        default "v23.0"
//
// The code itself is never logged.

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const TEMPLATE = process.env.WHATSAPP_OTP_TEMPLATE || 'invoice_portal_otp';
const LANGUAGE = process.env.WHATSAPP_OTP_TEMPLATE_LANG || 'en';
const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v23.0';

const PHONE_PATTERN = /^\d{10}$/;
const CODE_PATTERN = /^\d{4,8}$/;

// mobile: normalized 10-digit Indian number. Resolves on success, throws if
// Meta rejects the message.
async function sendOtpMessage(mobile, code) {
  if (!TOKEN || !PHONE_NUMBER_ID) {
    const err = new Error('WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID are not set in environment variables.');
    err.stage = 'CFG';
    throw err;
  }
  if (!PHONE_PATTERN.test(String(mobile))) {
    throw new Error('sendOtpMessage requires a normalized 10-digit mobile number.');
  }
  if (!CODE_PATTERN.test(String(code))) {
    throw new Error('sendOtpMessage requires a numeric code.');
  }

  const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to: `91${mobile}`,
    type: 'template',
    template: {
      name: TEMPLATE,
      language: { code: LANGUAGE },
      components: [
        // Authentication templates take the code twice: once in the body,
        // once for the "copy code" button.
        { type: 'body', parameters: [{ type: 'text', text: String(code) }] },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: String(code) }],
        },
      ],
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    // non-JSON; handled below
  }

  if (!response.ok) {
    // Meta's error object has no secrets in it; the request body (which
    // holds the code) is deliberately not logged.
    console.error('WhatsApp OTP send failed:', response.status, JSON.stringify(data.error || data));
    const err = new Error((data.error && data.error.message) || 'WhatsApp send failed');
    err.raw = data;
    err.stage = 'WA';
    err.code = (data.error && data.error.code) || response.status;
    throw err;
  }

  return data.messages && data.messages[0] && data.messages[0].id;
}

module.exports = { sendOtpMessage };
