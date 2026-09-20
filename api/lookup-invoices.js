// api/lookup-invoices.js
//
// Vercel Serverless Function. This is the ONLY way invoice data reaches the
// browser -- the frontend never talks to Supabase directly for this data.
//
// POST body: { mobile: "9876543210", last4: "4709" }
//
// All matching/verification logic now lives in verifyCustomer() (see
// api/_lib/verifyCustomer.js) -- it matches PRIMARILY on invoices.customer_
// mobile (covers ~94% of invoices via Busy's BillingDet), with the old
// party-ledger path as a fallback for the rest. verifyCustomer returns the
// full verified invoice list directly, not just party codes, so this file
// just needs to attach line items and respond.
//
// Environment variables needed (set in Vercel project settings, NOT in
// the frontend build): SUPABASE_URL, SUPABASE_SERVICE_KEY
//
// Backs the "last 4 digits of an invoice" login option, offered alongside
// OTP login (api/send-otp.js + api/verify-otp.js) so customers still have a
// way in if SMS delivery is down.
const { createClient } = require('@supabase/supabase-js');
const { verifyCustomer } = require('./_lib/verifyCustomer');
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
  const { mobile, last4 } = req.body || {};
  try {
    const verified = await verifyCustomer(supabase, mobile, last4);
    if (verified.error) {
      res.status(verified.status).json({ error: verified.error });
      return;
    }
    const { customer, invoices } = verified;

    const fullInvoices = await attachInvoiceItems(supabase, invoices);

    res.status(200).json({
      customer,
      invoices: fullInvoices,
    });
  } catch (err) {
    console.error('lookup-invoices error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again in a moment.' });
  }
};
