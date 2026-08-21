// api/invoice-pdf.js
//
// Renders public/invoice-template.html with real invoice data via headless
// Chromium and returns the resulting PDF bytes. The template is the exact
// print-ready page from the design handoff -- this endpoint just injects
// window.__INVOICE__ before it runs, then captures page.pdf().
//
// POST body: { mobile, last4, vch_no }
//
// Re-verifies mobile+last4 ownership (same check as lookup-invoices.js) AND
// confirms the requested vch_no belongs to that verified party_code group --
// this is a separate authenticated request, not a continuation of a prior
// one, so it re-proves ownership rather than trusting a client-supplied
// vch_no on its own.
//
// Environment variables needed: SUPABASE_URL, SUPABASE_SERVICE_KEY

const os = require('os');
const { createClient } = require('@supabase/supabase-js');
const { verifyCustomer } = require('./_lib/verifyCustomer');
const { stateNameForCode } = require('./_lib/gstStateCodes');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Static company details -- not DB-dependent, per the data-wiring brief.
const SELLER = {
  name: 'J.C.Mittal And Sons',
  gstin: '23AAPFJ0607D1ZT',
  address: '87-88, Freeganj Road, Ratlam, MP 457001',
  contact: '07412 490490 · 910910-8258 · jcmretails@gmail.com',
  website: 'www.jcmretails.com',
  logo: '/jcm-logo.png',
  customerCare: '910 910 8258',
};
const BANK = { name: 'State Bank of India', account: '38596845721', ifsc: 'SBIN0009452', branch: 'SME Branch, Ratlam' };
const TERMS = [
  'Installation charges are not included in this invoice.',
  'No return policy.',
  'Interest at 18% p.a. on delayed payments.',
  'Not responsible for damage or loss in transit.',
  'Service claims are handled by the respective service centre.',
  'Subject to Ratlam jurisdiction only.',
];
const COPY_MARK = 'Digital Invoice';

function formatDate(isoDate) {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getUTCFullYear()}`;
}

function formatDateTimeIST(isoDatetime) {
  if (!isoDatetime) return '';
  const d = new Date(isoDatetime);
  if (Number.isNaN(d.getTime())) return '';
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  const dd = String(ist.getUTCDate()).padStart(2, '0');
  const mm = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const hh = String(ist.getUTCHours()).padStart(2, '0');
  const mi = String(ist.getUTCMinutes()).padStart(2, '0');
  return `${dd}-${mm}-${ist.getUTCFullYear()} ${hh}:${mi}`;
}

// challan_refs is sometimes just the invoice's own vch_no (self-referencing
// for invoices not actually entered "against challan"), not a real distinct
// challan number -- only surface it when it's genuinely different.
function realChallanRef(challanRefs, vchNo) {
  if (!challanRefs) return '';
  const trimmed = String(challanRefs).trim();
  if (!trimmed || trimmed === String(vchNo).trim()) return '';
  return trimmed;
}

async function launchBrowser() {
  if (os.platform() === 'linux') {
    // Vercel's actual runtime -- @sparticuz/chromium ships a Linux-only
    // binary, and at these current versions both it and puppeteer-core are
    // published ESM-only, so they must be dynamically imported even though
    // this function itself is CommonJS.
    const chromium = (await import('@sparticuz/chromium')).default;
    const puppeteer = await import('puppeteer-core');
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
  }
  throw new Error('Headless Chromium is only available in the deployed (Linux) environment.');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { mobile, last4, vch_no: vchNo } = req.body || {};

  if (!vchNo) {
    res.status(400).json({ error: 'Missing invoice number.' });
    return;
  }

  try {
    const verified = await verifyCustomer(supabase, mobile, last4);
    if (verified.error) {
      res.status(verified.status).json({ error: verified.error });
      return;
    }
    const { partyCodes } = verified;

    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .select(
        'vch_no, vch_date, total_amount, taxable_amount, customer_name, customer_address, ' +
          'customer_mobile, customer_gst_no, place_of_supply_code, is_interstate, transport, ' +
          'station, einvoice_irn, einvoice_ack_no, einvoice_ack_date, last_synced_at, challan_refs'
      )
      .eq('vch_no', vchNo)
      .in('party_code', partyCodes)
      .limit(1)
      .maybeSingle();

    if (invErr) throw invErr;
    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found for this account.' });
      return;
    }

    const { data: items, error: itemsErr } = await supabase
      .from('invoice_items')
      .select('item_name, item_code, qty, rate, discount_percent, hsn_code, gst_rate')
      .eq('vch_no', vchNo)
      .order('line_no', { ascending: true });

    if (itemsErr) throw itemsErr;

    const hasEInvoice = Boolean(invoice.einvoice_irn);
    const invoiceData = {
      seller: SELLER,
      bank: BANK,
      terms: TERMS,
      copyMark: COPY_MARK,
      no: invoice.vch_no,
      date: formatDate(invoice.vch_date),
      status: '',
      interState: Boolean(invoice.is_interstate),
      buyer: {
        name: invoice.customer_name || '',
        address: [invoice.customer_address].filter(Boolean),
        mobile: invoice.customer_mobile || '',
        gstin: invoice.customer_gst_no || '',
      },
      supply: {
        placeOfSupply: stateNameForCode(invoice.place_of_supply_code),
        transport: invoice.transport || '',
        station: invoice.station || '',
        reverseCharge: 'No',
        challan: realChallanRef(invoice.challan_refs, invoice.vch_no),
        reference: '',
      },
      eInvoice: {
        irn: invoice.einvoice_irn || '',
        ackNo: hasEInvoice ? invoice.einvoice_ack_no || '' : '',
        ackDate: hasEInvoice ? formatDate(invoice.einvoice_ack_date) : '',
      },
      generated: {
        at: formatDateTimeIST(invoice.last_synced_at),
        by: '',
      },
      payUrl: '#',
      pdfUrl: '#',
      items: (items || []).map((it) => ({
        desc: it.item_name || '',
        note: '',
        hsn: it.hsn_code || '',
        code: String(it.item_code ?? ''),
        qty: Number(it.qty) || 0,
        unit: 'Pcs',
        rate: Number(it.rate) || 0,
        discount: Number(it.discount_percent) || 0,
        gst: Number(it.gst_rate) || 0,
      })),
    };

    const proto = req.headers['x-forwarded-proto'] || 'https';
    const templateUrl = `${proto}://${req.headers.host}/invoice-template.html`;

    const browser = await launchBrowser();
    try {
      const page = await browser.newPage();
      await page.evaluateOnNewDocument((data) => {
        window.__INVOICE__ = data;
      }, invoiceData);
      await page.goto(templateUrl, { waitUntil: 'networkidle0' });
      await page.waitForSelector('.page');

      // page.pdf() returns a Uint8Array in this puppeteer-core version, not
      // a Node Buffer -- res.send() only recognizes an actual Buffer as
      // binary and otherwise silently JSON-serializes it byte-by-byte.
      const pdfBytes = await page.pdf({
        printBackground: true,
        preferCSSPageSize: true,
      });
      const pdfBuffer = Buffer.from(pdfBytes);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="Invoice-${invoice.vch_no.trim()}.pdf"`);
      res.status(200).send(pdfBuffer);
    } finally {
      await browser.close();
    }
  } catch (err) {
    console.error('invoice-pdf error:', err);
    res.status(500).json({ error: 'Something went wrong generating the PDF. Please try again in a moment.' });
  }
};
