// api/lookup-invoices.js
//
// Vercel Serverless Function. This is the ONLY way invoice data reaches the
// browser -- the frontend never talks to Supabase directly for this data.
//
// POST body: { mobile: "9876543210", last4: "4709" }
//
// How verification works:
//   1. Find the customer(s) whose mobile number matches.
//   2. Only return data if at least one of THAT customer's own invoices
//      has an invoice number ending in the given last4. This proves the
//      person has a real invoice in hand, not just a phone number.
//   3. Once verified, return ALL of that customer's invoices + line items
//      (not just the one matching invoice) -- that's the point of the portal.
//
// Environment variables needed (set in Vercel project settings, NOT in
// the frontend build): SUPABASE_URL, SUPABASE_SERVICE_KEY

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function normalizeMobile(raw) {
  // Strip spaces, dashes, and a leading +91/91 if present, so "+91 98765
  // 43210", "919876543210", and "9876543210" all match the same way.
  let digits = String(raw).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  }
  return digits;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { mobile, last4 } = req.body || {};

  if (!mobile || !last4 || !/^\d{4}$/.test(last4)) {
    res.status(400).json({ error: 'Please provide a valid mobile number and 4-digit invoice code.' });
    return;
  }

  const cleanMobile = normalizeMobile(mobile);
  if (cleanMobile.length !== 10) {
    res.status(400).json({ error: 'Please enter a valid 10-digit mobile number.' });
    return;
  }

  try {
    // Step 1: find customer(s) with this mobile number.
    const { data: customers, error: custErr } = await supabase
      .from('customers')
      .select('party_code, name, mobile')
      .eq('mobile', cleanMobile);

    if (custErr) throw custErr;
    if (!customers || customers.length === 0) {
      res.status(404).json({ error: 'No account found for this mobile number.' });
      return;
    }

    const partyCodes = customers.map((c) => c.party_code);

    // Step 2: verify -- does at least one invoice for this customer end in last4?
    const { data: matchingInvoice, error: matchErr } = await supabase
      .from('invoices')
      .select('vch_code')
      .in('party_code', partyCodes)
      .eq('vch_no_last4', last4)
      .limit(1);

    if (matchErr) throw matchErr;
    if (!matchingInvoice || matchingInvoice.length === 0) {
      res.status(401).json({ error: 'That invoice code doesn\'t match our records for this mobile number.' });
      return;
    }

    // Step 3: verified -- return ALL invoices + line items for this customer.
    const { data: invoices, error: invErr } = await supabase
      .from('invoices')
      .select('vch_code, vch_no, vch_date, total_amount, taxable_amount')
      .in('party_code', partyCodes)
      .order('vch_date', { ascending: false });

    if (invErr) throw invErr;

    const vchCodes = invoices.map((i) => i.vch_code);
    const { data: items, error: itemsErr } = await supabase
      .from('invoice_items')
      .select('vch_code, item_code, item_name, qty, rate, taxable_amount, tax_amount')
      .in('vch_code', vchCodes);

    if (itemsErr) throw itemsErr;

    // Group line items under their invoice for a convenient response shape.
    const itemsByInvoice = {};
    for (const item of items) {
      if (!itemsByInvoice[item.vch_code]) itemsByInvoice[item.vch_code] = [];
      itemsByInvoice[item.vch_code].push(item);
    }
    const fullInvoices = invoices.map((inv) => ({
      ...inv,
      items: itemsByInvoice[inv.vch_code] || [],
    }));

    res.status(200).json({
      customer: { name: customers[0].name },
      invoices: fullInvoices,
    });
  } catch (err) {
    console.error('lookup-invoices error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again in a moment.' });
  }
};
