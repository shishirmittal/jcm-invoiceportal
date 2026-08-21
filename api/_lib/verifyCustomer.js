// Shared ownership check used by every endpoint that returns customer data.
//
// Verification: find customer(s) by mobile, then confirm at least one of
// THEIR OWN invoices has an invoice number ending in last4. This proves the
// caller holds a real invoice for this mobile number, not just the number
// itself. Returns { customer, partyCodes } on success, or { error, status }
// on failure -- callers should check for `error` first.

function normalizeMobile(raw) {
  let digits = String(raw).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  }
  return digits;
}

async function verifyCustomer(supabase, mobile, last4) {
  if (!mobile || !last4 || !/^\d{4}$/.test(last4)) {
    return { error: 'Please provide a valid mobile number and 4-digit invoice code.', status: 400 };
  }

  const cleanMobile = normalizeMobile(mobile);
  if (cleanMobile.length !== 10) {
    return { error: 'Please enter a valid 10-digit mobile number.', status: 400 };
  }

  const { data: customers, error: custErr } = await supabase
    .from('customers')
    .select('party_code, name, mobile')
    .eq('mobile', cleanMobile);

  if (custErr) throw custErr;
  if (!customers || customers.length === 0) {
    return { error: 'No account found for this mobile number.', status: 404 };
  }

  const partyCodes = customers.map((c) => c.party_code);

  const { data: matchingInvoice, error: matchErr } = await supabase
    .from('invoices')
    .select('vch_code')
    .in('party_code', partyCodes)
    .eq('vch_no_last4', last4)
    .limit(1);

  if (matchErr) throw matchErr;
  if (!matchingInvoice || matchingInvoice.length === 0) {
    return { error: "That invoice code doesn't match our records for this mobile number.", status: 401 };
  }

  return { customer: customers[0], partyCodes };
}

module.exports = { verifyCustomer, normalizeMobile };
