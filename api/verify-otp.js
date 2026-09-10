// api/verify-otp.js
//
// Vercel Serverless Function. Verifies an MSG91 widget access token
// server-side, then looks up invoices for the verified mobile number
// directly -- no last4 code needed, since a completed OTP flow already
// proves phone ownership more strongly than a 4-digit code that could be
// read off a discarded receipt.
//
// POST body: { accessToken, mobile }
// `mobile` is the number the user typed into the login form before the
// widget sent the OTP; it's cross-checked against the number MSG91 itself
// verified, as a sanity check against a stale or mismatched token.
//
// Environment variables needed: MSG91_AUTH_KEY (secret, server-side only --
// distinct from the widget's public tokenAuth used in the frontend),
// SUPABASE_URL, SUPABASE_SERVICE_KEY
const { createClient } = require('@supabase/supabase-js');
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

  const { accessToken, mobile } = req.body || {};
  if (!accessToken || !mobile) {
    res.status(400).json({ error: 'Missing verification token or mobile number.' });
    return;
  }

  try {
    const msgRes = await fetch('https://control.msg91.com/api/v5/widget/verifyAccessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        authkey: process.env.MSG91_AUTH_KEY,
        'access-token': accessToken,
      }),
    });
    const result = await msgRes.json();

    // Keep this log for the first several real tests -- MSG91's own docs
    // snippet didn't show a confirmed success response body. Check Vercel's
    // function logs after a real OTP test and adjust the field(s) read
    // below (result.type / result.message) if reality differs.
    console.log('MSG91 verify response:', JSON.stringify(result));

    if (!result || result.type !== 'success') {
      res.status(401).json({ error: 'OTP verification failed. Please try again.' });
      return;
    }

    // MSG91's verifyAccessToken response carries the verified number in
    // `message` on success per their widget docs; a couple of other
    // plausible field names are checked as a fallback in case this
    // account's widget version differs -- confirm against the logged
    // response above and simplify once that's certain.
    const verifiedRaw = result.message || result.data?.mobile || result.mobile;
    const verifiedMobile = normalizeMobile(verifiedRaw || '');
    const submittedMobile = normalizeMobile(mobile);

    if (verifiedMobile.length !== 10 || verifiedMobile !== submittedMobile) {
      res.status(401).json({ error: 'Mobile number verification failed. Please try again.' });
      return;
    }

    const found = await findInvoicesByMobile(supabase, verifiedMobile);
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
