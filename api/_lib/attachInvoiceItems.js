// Used by verify-otp.js: given an already-verified
// invoice list, fetches invoice_items and returns the "full invoice" shape
// both endpoints send to the frontend (items grouped under their invoice,
// plus item_count/total_qty summaries the list screen uses).
async function attachInvoiceItems(supabase, invoices) {
  const vchNos = invoices.map((i) => i.vch_no);
  const { data: items, error: itemsErr } = await supabase
    .from('invoice_items')
    .select('vch_no, item_code, item_name, qty, rate, taxable_amount, tax_amount')
    .in('vch_no', vchNos);
  if (itemsErr) throw itemsErr;

  const itemsByInvoice = {};
  for (const item of items) {
    if (!itemsByInvoice[item.vch_no]) itemsByInvoice[item.vch_no] = [];
    itemsByInvoice[item.vch_no].push(item);
  }

  return invoices.map((inv) => {
    const invItems = itemsByInvoice[inv.vch_no] || [];
    return {
      vch_code: inv.vch_code,
      vch_no: inv.vch_no,
      vch_date: inv.vch_date,
      total_amount: inv.total_amount,
      taxable_amount: inv.taxable_amount,
      items: invItems,
      item_count: invItems.length,
      total_qty: invItems.reduce((sum, item) => sum + (Number(item.qty) || 0), 0),
    };
  });
}

module.exports = { attachInvoiceItems };
