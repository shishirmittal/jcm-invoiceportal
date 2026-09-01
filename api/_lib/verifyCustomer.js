// Shared ownership check used by every endpoint that returns customer data.
//
// PRIMARY match: invoices.customer_mobile (sourced from Busy's BillingDet
// table, per-invoice -- covers ~94% of invoices regardless of whether a
// party ledger exists for the buyer, e.g. counter/retail cash sales that
// never got a full customer account).
//
// FALLBACK match: the old customers -> party_code -> invoices.party_code
// path, for the remaining invoices where customer_mobile is null (older
// records / edge cases BillingDet didn't cover).
//
// Both sets are combined and deduped by vch_no. Verification: at least one
// invoice in the COMBINED set must have vch_no_last4 matching what the
// caller entered -- proves they hold a real invoice for this mobile number,
// not just the number itself. On success, returns the full verified
// invoice list (not just party codes) plus a display name, since the
// combined-matching logic lives here and callers shouldn't have to
// duplicate it.
function normalizeMobile(raw) {
  let digits = String(raw).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  }
  return digits;
}

// BillingDet.MobileNo sometimes holds MORE THAN ONE number in a single
// field (confirmed on a real invoice: "9893780880,9827580880" -- likely
// two contact numbers given at checkout). A naive normalizeMobile() on the
// whole field would concatenate both numbers into one garbled string that
// can never match a clean 10-digit input. This splits on common
// separators first, normalizes each piece individually, and checks
// whether ANY of them match.
function mobileFieldMatches(rawField, cleanMobile) {
  if (!rawField) return false;
  return String(rawField)
    .split(/[,/;|\s]+/)
    .some((piece) => piece && normalizeMobile(piece) === cleanMobile);
}

async function verifyCustomer(supabase, mobile, last4) {
  if (!mobile || !last4 || !/^\d{4}$/.test(last4)) {
    return { error: 'Please provide a valid mobile number and 4-digit invoice code.', status: 400 };
  }
  const cleanMobile = normalizeMobile(mobile);
  if (cleanMobile.length !== 10) {
    return { error: 'Please enter a valid 10-digit mobile number.', status: 400 };
  }

  // PRIMARY: broad ilike fetch (can't rely on exact string equality since
  // BillingDet.MobileNo formatting isn't 100% guaranteed consistent --
  // e.g. accidental spaces or a +91 prefix typed by staff), then exact-match
  // after normalizing in JS to avoid false-positive substring matches.
  const { data: mobileMatches, error: mobileErr } = await supabase
    .from('invoices')
    .select('vch_code, vch_no, vch_date, total_amount, taxable_amount, customer_name, customer_mobile, vch_no_last4, party_code')
    .ilike('customer_mobile', `%${cleanMobile}%`);
  if (mobileErr) throw mobileErr;

  const primaryInvoices = (mobileMatches || []).filter((inv) =>
    mobileFieldMatches(inv.customer_mobile, cleanMobile)
  );

  // FALLBACK: old party-ledger path, only for invoices customer_mobile
  // didn't cover.
  const { data: customers, error: custErr } = await supabase
    .from('customers')
    .select('party_code, name, mobile')
    .eq('mobile', cleanMobile);
  if (custErr) throw custErr;

  let fallbackInvoices = [];
  if (customers && customers.length > 0) {
    const partyCodes = customers.map((c) => c.party_code);
    const { data: partyMatches, error: partyErr } = await supabase
      .from('invoices')
      .select('vch_code, vch_no, vch_date, total_amount, taxable_amount, customer_name, customer_mobile, vch_no_last4, party_code')
      .in('party_code', partyCodes)
      .is('customer_mobile', null);
    if (partyErr) throw partyErr;
    fallbackInvoices = partyMatches || [];
  }

  // Combine + dedupe by vch_no (a vch_no should never appear in both sets,
  // but guard defensively).
  const combinedByVchNo = new Map();
  for (const inv of [...primaryInvoices, ...fallbackInvoices]) {
    combinedByVchNo.set(inv.vch_no, inv);
  }
  const combined = [...combinedByVchNo.values()];

  if (combined.length === 0) {
    return { error: 'No account found for this mobile number.', status: 404 };
  }

  const ownsInvoice = combined.some((inv) => inv.vch_no_last4 === last4);
  if (!ownsInvoice) {
    return { error: "That invoice code doesn't match our records for this mobile number.", status: 401 };
  }

  combined.sort((a, b) => new Date(b.vch_date) - new Date(a.vch_date));

  // Display name: prefer the most recent invoice's own customer_name
  // (BillingDet-sourced, per-invoice), fall back to the party ledger's
  // name if this mobile only ever matched via the fallback path.
  const displayName =
    combined.find((inv) => inv.customer_name)?.customer_name ||
    (customers && customers[0] && customers[0].name) ||
    null;

  return {
    customer: { name: displayName },
    invoices: combined,
  };
}

module.exports = { verifyCustomer, normalizeMobile, mobileFieldMatches };
