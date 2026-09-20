// api/verify-otp.js
//
// POST body: { mobile: "9876543210", ticket: "<from send-otp>", otp: "123456" }
//
// Verifies the OTP with 2Factor.in server-side, and if correct, looks up
// this mobile number's invoices directly (via findInvoicesByMobile --
// shared with the last4-based login in verifyCustomer.js). No last4 check
// here: a correctly verified OTP is already stronger proof of phone
// ownership than a 4-digit invoice code ever was.
//
// The client never sends a raw 2Factor session id. It sends back the
// signed ticket send-otp.js gave it, and the session id is recovered from
// that ticket ONLY if it was issued for this exact mobile number and
// hasn't expired -- see _lib/otpSessionToken.js. Without that binding,
// 2Factor's "OTP Matched" says nothing about WHICH phone was verified, and
// a caller could verify their own phone then claim someone else's number.
//
// If the mobile has zero matching invoices, that's NOT an error -- OTP
// proves phone ownership, not that they're an existing JCM Retails
// customer. Returns a clear empty-result response instead.
//
// Environment variables needed: TWOFACTOR_API_KEY, OTP_SESSION_SECRET,
// SUPABASE_URL, SUPABASE_SERVICE_KEY
const { createClient } = require('@supabase/supabase-js');
const { verifyOtp } = require('./_lib/twoFactor');
const { verifyTicket } = require('./_lib/otpSessionToken');
const { findInvoicesByMobile, normalizeMobile } = require('./_lib/verifyCustomer');
const { attachInvoiceItems } = require('./_lib/attachInvoiceItems');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { mobile, ticket, otp } = req.body || {};
  if (!mobile || !ticket || !otp) {
    res.status(400).json({ error: 'Missing mobile number, verification ticket, or code.' });
    return;
  }

  try {
    const cleanMobile = normalizeMobile(mobile);

    // Must be normalized the same way send-otp.js normalized it before
    // signing -- verifyTicket does an exact string comparison.
    const sessionId = verifyTicket(String(ticket), cleanMobile);
    if (!sessionId) {
      res.status(401).json({ error: 'This code has expired or is no longer valid. Please request a new one.' });
      return;
    }

    const isValid = await verifyOtp(sessionId, String(otp));
    if (!isValid) {
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
    });
  } catch (err) {
    console.error('verify-otp error:', err);
    res.status(500).json({ error: 'Something went wrong verifying your number. Please try again in a moment.' });
  }
};
