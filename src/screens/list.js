import { escapeHtml, formatCurrency, formatDate, maskMobile } from '../utils.js';

const SEARCH_ICON = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8f9bb4" stroke-width="2.4" stroke-linecap="round">
    <circle cx="11" cy="11" r="7"></circle>
    <path d="M20 20l-4-4"></path>
  </svg>
`;

const DOWNLOAD_ICON = `
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 4v11"></path>
    <path d="M7 12l5 5 5-5"></path>
    <path d="M5 20h14"></path>
  </svg>
`;

function matchesSearch(invoice, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  if (String(invoice.vch_no || '').toLowerCase().includes(q)) return true;
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

function computeStats(invoices) {
  const years = new Set(invoices.map((inv) => (inv.vch_date ? String(inv.vch_date).slice(0, 4) : 'Unknown')));
  const totalItems = invoices.reduce((s, inv) => s + (inv.item_count ?? (inv.items || []).length), 0);
  const totalQty = invoices.reduce((s, inv) => s + (inv.total_qty || 0), 0);
  return {
    totalInvoices: invoices.length,
    yearCount: years.size,
    totalItems,
    totalQtyLabel: `${totalQty.toLocaleString('en-IN')} units total`,
  };
}

function renderInvoiceRow(inv, index) {
  const itemCount = inv.item_count ?? (inv.items || []).length;
  const qty = inv.total_qty || 0;
  const itemsLabel = itemCount ? `${itemCount} ${itemCount === 1 ? 'item' : 'items'}` : '— items';
  const qtyLabel = qty ? `Qty ${qty}` : 'Qty —';

  return `
    <div class="invoice-row" data-index="${index}">
      <div class="invoice-row-top">
        <div class="invoice-row-id">
          <span class="invoice-no">#${escapeHtml(String(inv.vch_no).trim())}</span>
          <span class="invoice-date">${formatDate(inv.vch_date)}</span>
        </div>
        <span class="invoice-amount">${formatCurrency(inv.total_amount)}</span>
      </div>
      <div class="invoice-row-bottom">
        <span class="chip">${itemsLabel}</span>
        <span class="chip">${qtyLabel}</span>
        <button class="pdf-btn" data-download-index="${index}" title="Download PDF">
          ${DOWNLOAD_ICON}
          PDF
        </button>
      </div>
    </div>
  `;
}

function renderYearCard(year, group, isOpen) {
  const total = group.reduce((s, { inv }) => s + Number(inv.total_amount || 0), 0);
  return `
    <div class="year-card">
      <button type="button" class="year-header" data-year="${escapeHtml(year)}" aria-expanded="${isOpen}">
        <span class="year-name">${escapeHtml(year)}</span>
        <span class="year-count-pill">${group.length} ${group.length === 1 ? 'invoice' : 'invoices'}</span>
        <span class="year-total">${formatCurrency(total)}</span>
        <span class="year-caret${isOpen ? ' open' : ''}">▾</span>
      </button>
      ${isOpen ? `<div class="year-body">${group.map(({ inv, index }) => renderInvoiceRow(inv, index)).join('')}</div>` : ''}
    </div>
  `;
}

function renderScrollRegion(invoices, closedYears, hasQuery) {
  if (invoices.length === 0) {
    return `
      <div class="empty-state">
        <span class="empty-state-title">No invoices found</span>
        <span class="empty-state-sub">Try a different invoice number or item name.</span>
      </div>
    `;
  }
  const groups = groupByYear(invoices);
  return groups
    .map(([year, group]) => renderYearCard(year, group, hasQuery ? true : !closedYears[year]))
    .join('');
}

export function html(state) {
  const { customer, mobile, invoices, search, closedYears } = state;
  const filtered = filterInvoices(invoices, search);
  const stats = computeStats(invoices);

  return `
    <div class="screen">
      <div class="invoices-header">
        <div class="invoices-header-top">
          <div class="invoices-greeting">
            <span class="invoices-greeting-label">Namaste,</span>
            <span class="invoices-greeting-name">${escapeHtml(customer?.name || '')}</span>
            <span class="invoices-greeting-phone">${escapeHtml(maskMobile(mobile))}</span>
          </div>
          <button class="logout-pill" id="logout-btn">Log out</button>
        </div>

        <div class="stat-grid">
          <div class="stat-card">
            <span class="stat-label">Invoices</span>
            <span class="stat-value">${stats.totalInvoices}</span>
            <span class="stat-sub">across ${stats.yearCount} ${stats.yearCount === 1 ? 'year' : 'years'}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Items bought</span>
            <span class="stat-value">${stats.totalItems}</span>
            <span class="stat-sub">${stats.totalQtyLabel}</span>
          </div>
        </div>

        <div class="invoices-search">
          ${SEARCH_ICON}
          <input id="search-input" type="text" placeholder="Search invoice no. or item" value="${escapeHtml(search)}" />
        </div>
      </div>

      <div class="scroll-region" id="scroll-region">
        ${renderScrollRegion(filtered, closedYears, Boolean(search))}
      </div>
    </div>
  `;
}

export function mount(root, { state, openInvoice, logout, downloadPdf }) {
  const searchInput = root.querySelector('#search-input');
  const regionEl = root.querySelector('#scroll-region');
  const logoutBtn = root.querySelector('#logout-btn');

  let currentFiltered = filterInvoices(state.invoices, state.search);
  let debounceTimer = null;

  function attachRegionListeners() {
    regionEl.querySelectorAll('.year-header').forEach((btn) => {
      btn.addEventListener('click', () => {
        const year = btn.getAttribute('data-year');
        state.closedYears[year] = !state.closedYears[year];
        renderRegion();
      });
    });
    regionEl.querySelectorAll('.invoice-row').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.pdf-btn')) return;
        const idx = Number(row.getAttribute('data-index'));
        openInvoice(currentFiltered[idx]);
      });
    });
    regionEl.querySelectorAll('.pdf-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const idx = Number(btn.getAttribute('data-download-index'));
        const original = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span>PDF';
        try {
          await downloadPdf(currentFiltered[idx]);
        } catch (err) {
          alert(err.message || 'Could not generate the PDF. Please try again.');
        } finally {
          btn.disabled = false;
          btn.innerHTML = original;
        }
      });
    });
  }

  function renderRegion() {
    regionEl.innerHTML = renderScrollRegion(currentFiltered, state.closedYears, Boolean(state.search));
    attachRegionListeners();
  }

  attachRegionListeners();

  searchInput.addEventListener('input', () => {
    const query = searchInput.value;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      state.search = query;
      currentFiltered = filterInvoices(state.invoices, query);
      renderRegion();
    }, 200);
  });

  logoutBtn.addEventListener('click', () => {
    logout();
  });
}
