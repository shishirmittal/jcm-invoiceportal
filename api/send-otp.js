// api/send-otp.js
//
// POST body: { mobile: "9876543210" }
// Generates a 6-digit login code, stores a hash of it (see _lib/otpStore.js)
// and delivers it on WhatsApp from JCM's own business number. Nothing secret
// is returned to the browser -- the code only ever travels to the customer's
// WhatsApp, and verify-otp.js checks it against the stored hash.
//
// Environment variables needed: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID,
// OTP_SESSION_SECRET, SUPABASE_URL, SUPABASE_SERVICE_KEY

const { createClient } = require('@supabase/supabase-js');
const { sendOtpMessage } = require('./_lib/whatsappOtp');
const { createOtp, discardOtp } = require('./_lib/otpStore');
const { normalizeMobile } = require('./_lib/verifyCustomer');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const { mobile } = req.body || {};
  const cleanMobile = normalizeMobile(mobile || '');
  if (cleanMobile.length !== 10) {
    res.status(400).json({ error: 'Please enter a valid 10-digit mobile number.' });
    return;
  }

  let issued = null;
  try {
    issued = await createOtp(supabase, cleanMobile);
    if (issued.rateLimited) {
      res.status(429).json({ error: 'Too many codes requested for this number. Please wait a few minutes and try again.' });
      return;
    }

    await sendOtpMessage(cleanMobile, issued.code);
    res.status(200).json({ sent: true });
  } catch (err) {
    console.error('send-otp error:', err.message);
    if (issued && issued.id) {
      await discardOtp(supabase, issued.id).catch(() => {});
    }
    res.status(500).json({ error: "Couldn't send the code on WhatsApp. Please check the number and try again." });
  }
};
