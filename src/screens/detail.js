import { escapeHtml, formatCurrency, formatDate } from '../utils.js';

function renderItemRows(items) {
  return items
    .map((item) => {
      const amount = Number(item.taxable_amount || 0) + Number(item.tax_amount || 0);
      return `
        <tr>
          <td class="item-name">${escapeHtml(item.item_name || '')}</td>
          <td>${escapeHtml(item.qty ?? '')}</td>
          <td>${formatCurrency(item.rate)}</td>
          <td>${formatCurrency(amount)}</td>
        </tr>
      `;
    })
    .join('');
}

export function html(state) {
  const invoice = state.currentInvoice;
  const items = invoice.items || [];

  return `
    <div class="screen">
      <div class="bar-header">
        <button class="icon-btn" id="back-btn" title="Back">&#8592;</button>
        <div class="bar-title">Invoice #${escapeHtml(invoice.vch_no)}</div>
      </div>
      <div class="screen-body">
        <div class="detail-summary">
          <div class="detail-row"><span>Invoice No.</span><strong>#${escapeHtml(invoice.vch_no)}</strong></div>
          <div class="detail-row"><span>Date</span><strong>${formatDate(invoice.vch_date)}</strong></div>
          <div class="detail-row"><span>Taxable Amount</span><strong>${formatCurrency(invoice.taxable_amount)}</strong></div>
          <div class="detail-row total"><span>Total</span><strong>${formatCurrency(invoice.total_amount)}</strong></div>
        </div>

        <table class="items-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Rate</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            ${renderItemRows(items)}
          </tbody>
        </table>

        <div class="detail-actions">
          <button class="btn-secondary" id="download-pdf-btn">Download PDF</button>
        </div>
      </div>
    </div>
  `;
}

export function mount(root, { backToList, downloadPdf }) {
  root.querySelector('#back-btn').addEventListener('click', () => {
    backToList();
  });
  root.querySelector('#download-pdf-btn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Generating…';
    try {
      await downloadPdf();
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  });
}
