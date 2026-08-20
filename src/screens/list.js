import { escapeHtml, formatCurrency, formatDate } from '../utils.js';

const DOWNLOAD_ICON = `
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5M4 18v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1"
      stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

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

function groupByYear(invoices) {
  const groups = new Map();
  invoices.forEach((inv, index) => {
    const year = inv.vch_date ? String(inv.vch_date).slice(0, 4) : 'Unknown';
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year).push({ inv, index });
  });
  return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

function renderCard(inv, index) {
  return `
    <div class="invoice-card" data-index="${index}">
      <div class="card-top">
        <div class="card-field">
          <div class="field-label">Invoice no</div>
          <div class="field-value strong">#${escapeHtml(String(inv.vch_no).trim())}</div>
        </div>
        <div class="card-amount">${formatCurrency(inv.total_amount)}</div>
      </div>
      <div class="card-bottom">
        <div class="card-field">
          <div class="field-label">Date</div>
          <div class="field-value">${formatDate(inv.vch_date)}</div>
        </div>
        <div class="card-field">
          <div class="field-label">Items</div>
          <div class="field-value">${(inv.item_count ?? (inv.items || []).length) || '—'}</div>
        </div>
        <div class="card-field">
          <div class="field-label">Total qty</div>
          <div class="field-value">${inv.total_qty || '—'}</div>
        </div>
        <button class="card-download-btn" data-download-index="${index}" title="Download PDF" aria-label="Download PDF">
          ${DOWNLOAD_ICON}
        </button>
      </div>
    </div>
  `;
}

function renderList(invoices) {
  if (invoices.length === 0) {
    return `<div class="empty-state">No invoices match your search.</div>`;
  }
  const groups = groupByYear(invoices);
  return groups
    .map(
      ([year, group]) => `
        <div class="year-group">
          <div class="year-heading">${escapeHtml(year)}</div>
          <div class="year-cards">
            ${group.map(({ inv, index }) => renderCard(inv, index)).join('')}
          </div>
        </div>
      `
    )
    .join('');
}

export function html(state) {
  const { customer, invoices, search } = state;
  const filtered = filterInvoices(invoices, search);

  return `
    <div class="screen">
      <div class="list-header">
        <div class="list-header-text">
          <div class="list-greeting">Namaste, ${escapeHtml(customer?.name || '')}</div>
          <div class="list-headline">All your invoices, in one place</div>
        </div>
        <button class="logout-link" id="logout-btn">Log out</button>
      </div>
      <div class="search-wrap">
        <div class="search-input-wrap">
          <input id="search-input" type="text" placeholder="Search by item name…" value="${escapeHtml(search)}" />
          <button class="search-clear-btn${search ? ' visible' : ''}" id="search-clear-btn" aria-label="Clear search" title="Clear search">&#10005;</button>
        </div>
      </div>
      <div class="invoice-list" id="invoice-list">
        ${renderList(filtered)}
      </div>
    </div>
  `;
}

export function mount(root, { state, setState, openInvoice, logout, downloadPdf }) {
  const searchInput = root.querySelector('#search-input');
  const clearBtn = root.querySelector('#search-clear-btn');
  const listEl = root.querySelector('#invoice-list');
  const logoutBtn = root.querySelector('#logout-btn');

  let currentFiltered = filterInvoices(state.invoices, state.search);

  function attachListListeners() {
    listEl.querySelectorAll('.invoice-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.card-download-btn')) return;
        const idx = Number(card.getAttribute('data-index'));
        openInvoice(currentFiltered[idx]);
      });
    });
    listEl.querySelectorAll('.card-download-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(btn.getAttribute('data-download-index'));
        downloadPdf(currentFiltered[idx]);
      });
    });
  }
  attachListListeners();

  function refreshList(query) {
    currentFiltered = filterInvoices(state.invoices, query);
    listEl.innerHTML = renderList(currentFiltered);
    attachListListeners();
    clearBtn.classList.toggle('visible', Boolean(query));
  }

  searchInput.addEventListener('input', () => {
    state.search = searchInput.value;
    refreshList(state.search);
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    state.search = '';
    searchInput.focus();
    refreshList('');
  });

  logoutBtn.addEventListener('click', () => {
    logout();
  });
}
