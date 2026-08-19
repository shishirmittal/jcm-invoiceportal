import { escapeHtml, formatCurrency, formatDate } from '../utils.js';

function matchesSearch(invoice, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return (invoice.items || []).some((item) =>
    String(item.item_name || '').toLowerCase().includes(q)
  );
}

function filterInvoices(invoices, query) {
  return invoices.filter((inv) => matchesSearch(inv, query));
}

function renderRows(invoices) {
  if (invoices.length === 0) {
    return `<div class="empty-state">No invoices match your search.</div>`;
  }
  return invoices
    .map(
      (inv, i) => `
        <li class="invoice-row" data-index="${i}">
          <div class="invoice-row-main">
            <span class="invoice-no">#${escapeHtml(inv.vch_no)}</span>
            <span class="invoice-date">${formatDate(inv.vch_date)}</span>
          </div>
          <span class="invoice-amt">${formatCurrency(inv.total_amount)}</span>
        </li>
      `
    )
    .join('');
}

export function html(state) {
  const { customer, invoices, search } = state;
  const filtered = filterInvoices(invoices, search);

  return `
    <div class="screen">
      <div class="bar-header">
        <div class="bar-title">My Invoices</div>
        <button class="bar-action" id="logout-btn">Search another number</button>
      </div>
      <div class="greeting">Hi, <strong>${escapeHtml(customer?.name || '')}</strong></div>
      <div class="search-wrap">
        <input id="search-input" type="text" placeholder="Search by item name…" value="${escapeHtml(search)}" />
      </div>
      <ul class="invoice-list" id="invoice-list">
        ${renderRows(filtered)}
      </ul>
    </div>
  `;
}

export function mount(root, { state, setState, openInvoice, logout }) {
  const searchInput = root.querySelector('#search-input');
  const list = root.querySelector('#invoice-list');
  const logoutBtn = root.querySelector('#logout-btn');

  let currentFiltered = filterInvoices(state.invoices, state.search);

  function attachRowListeners() {
    list.querySelectorAll('.invoice-row').forEach((row) => {
      row.addEventListener('click', () => {
        const idx = Number(row.getAttribute('data-index'));
        openInvoice(currentFiltered[idx]);
      });
    });
  }
  attachRowListeners();

  searchInput.addEventListener('input', () => {
    const query = searchInput.value;
    state.search = query;
    currentFiltered = filterInvoices(state.invoices, query);
    list.innerHTML = renderRows(currentFiltered);
    attachRowListeners();
  });

  logoutBtn.addEventListener('click', () => {
    logout();
  });
}
