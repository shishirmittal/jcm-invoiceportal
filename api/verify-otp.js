// api/verify-otp.js
//
// POST body: { mobile: "9876543210", otp: "123456" }
//
// Checks the code against the hash stored by send-otp.js (see
// _lib/otpStore.js: 10-minute expiry, single use, max 5 wrong guesses).
// The stored code is tied to the mobile number it was sent to, so a
// verified code proves ownership of exactly that number. If correct, looks
// up this number's invoices (findInvoicesByMobile).
//
// Zero matching invoices is NOT an error -- it returns noHistory: true.
//
// Environment variables needed: OTP_SESSION_SECRET, SUPABASE_URL,
// SUPABASE_SERVICE_KEY
const { createClient } = require('@supabase/supabase-js');
const { checkOtp } = require('./_lib/otpStore');
const { findInvoicesByMobile, normalizeMobile } = require('./_lib/verifyCustomer');
const { attachInvoiceItems } = require('./_lib/attachInvoiceItems');
const { createLoginToken } = require('./_lib/loginToken');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { mobile, otp } = req.body || {};
  if (!mobile || !otp) {
    res.status(400).json({ error: 'Missing mobile number or code.' });
    return;
  }

  try {
    const cleanMobile = normalizeMobile(mobile);
    if (cleanMobile.length !== 10) {
      res.status(400).json({ error: 'Please enter a valid 10-digit mobile number.' });
      return;
    }

    const result = await checkOtp(supabase, cleanMobile, String(otp));
    if (result === 'expired') {
      res.status(401).json({ error: 'This code has expired. Please request a new one.' });
      return;
    }
    if (result === 'locked') {
      res.status(401).json({ error: 'Too many wrong attempts. Please request a new code.' });
      return;
    }
    if (result !== 'ok') {
      res.status(401).json({ error: 'Incorrect code. Please try again.' });
      return;
    }

    const found = await findInvoicesByMobile(supabase, cleanMobile);
    if (found.error) {
      res.status(found.status).json({ error: found.error });
      return;
    }
    const { customer, invoices } = found;

    if (invoices.length === 0) {
      // OTP proves they own the phone, but not that they're an existing
      // JCM Retails customer -- this is an empty result, not a failure.
      res.status(200).json({
        customer: null,
        invoices: [],
        noHistory: true,
        message: 'No purchase history found for this number.',
      });
      return;
    }

    const fullInvoices = await attachInvoiceItems(supabase, invoices);

    res.status(200).json({
      customer,
      invoices: fullInvoices,
      // Login pass for follow-up requests (PDF download) -- see _lib/loginToken.js
      token: createLoginToken(cleanMobile),
    });
  } catch (err) {
    console.error('verify-otp error:', err);
    res.status(500).json({ error: 'Something went wrong verifying your number. Please try again in a moment.' });
  }
};
