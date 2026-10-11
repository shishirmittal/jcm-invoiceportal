import './style.css';
import { verifyOtp } from './api.js';
import * as loginScreen from './screens/login.js';
import * as listScreen from './screens/list.js';
import * as detailScreen from './screens/detail.js';

const app = document.getElementById('app');

const SESSION_KEY = 'jcm_invoice_session';
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

const state = {
  screen: 'login', // 'login' | 'list' | 'detail'
  loading: false,
  error: null,
  otpStatus: null,
  otpSent: false,
  otp: '',
  mobile: '',
  customer: null,
  invoices: [],
  search: '',
  closedYears: {},
  currentInvoice: null,
};

function setState(patch) {
  Object.assign(state, patch);
  render();
}

function saveSession() {
  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        mobile: state.mobile,
        customer: state.customer,
        invoices: state.invoices,
        savedAt: Date.now(),
      })
    );
  } catch {
    // storage unavailable or over quota -- session just won't survive a refresh
  }
}

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.customer || !Array.isArray(parsed.invoices)) return null;
    if (Date.now() - parsed.savedAt > SESSION_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

// Routing: every screen transition gets a real history entry (via pushState)
// so back/forward -- including a mobile back-swipe -- steps through the app
// instead of leaving the site. 'detail' entries carry the invoice's vch_no;
// the invoice object itself is looked up from state.invoices, not stored in
// history, so a restored session and a deep-linked/back-navigated URL always
// agree on what that invoice currently looks like.
function parseHash(hash) {
  if (hash.startsWith('#/invoices/')) {
    return { screen: 'detail', vchNo: decodeURIComponent(hash.slice('#/invoices/'.length)) };
  }
  if (hash === '#/invoices') return { screen: 'list' };
  if (hash === '#/login') return { screen: 'login' };
  return null;
}

function hashForScreen(screen, invoice) {
  if (screen === 'detail' && invoice) return `#/invoices/${encodeURIComponent(invoice.vch_no)}`;
  if (screen === 'list') return '#/invoices';
  return '#/login';
}

function applyRoute(routeState, mode) {
  if (!state.customer) {
    // No valid session -- login is the only reachable screen, regardless of
    // what the URL/history entry claims.
    state.screen = 'login';
    state.currentInvoice = null;
  } else if (routeState && routeState.screen === 'detail' && routeState.vchNo) {
    const inv = state.invoices.find((i) => i.vch_no === routeState.vchNo);
    state.screen = inv ? 'detail' : 'list';
    state.currentInvoice = inv || null;
  } else {
    state.screen = 'list';
    state.currentInvoice = null;
  }

  const hash = hashForScreen(state.screen, state.currentInvoice);
  const historyState = { screen: state.screen, vchNo: state.currentInvoice ? state.currentInvoice.vch_no : undefined };
  if (mode === 'push') history.pushState(historyState, '', hash);
  else if (mode === 'replace') history.replaceState(historyState, '', hash);

  render();
}

// Runs after a successful OTP login.
function finishLogin(data) {
  state.customer = data.customer;
  state.invoices = data.invoices || [];
  state.search = '';
  state.otpSent = false;
  state.otp = '';
  saveSession();
  applyRoute(null, 'push');
}

const actions = {
  state,
  setState,

  async completeOtpLogin(mobile, otp) {
    setState({ mobile, loading: true, error: null, otpStatus: null });
    try {
      const data = await verifyOtp(mobile, otp);
      state.loading = false;
      state.error = null;

      if (data.noHistory) {
        // Phone ownership is verified, but this number has no purchase
        // history -- not an error, just nothing to show yet. Drop back to
        // the mobile step, which is the one that renders otpStatus (the
        // code is spent now anyway).
        state.otpStatus = data.message || 'No purchase history found for this number.';
        state.otpSent = false;
        state.otp = '';
              render();
        return;
      }

      finishLogin(data);
    } catch (err) {
      setState({ loading: false, error: err.message });
    }
  },

  logout() {
    clearSession();
    state.loading = false;
    state.error = null;
    state.otpStatus = null;
    state.otpSent = false;
    state.otp = '';
    state.mobile = '';
    state.customer = null;
    state.invoices = [];
    state.search = '';
    state.closedYears = {};
    applyRoute(null, 'push');
  },

  openInvoice(invoice) {
    applyRoute({ screen: 'detail', vchNo: invoice.vch_no }, 'push');
  },

  backToList() {
    history.back();
  },

  async downloadPdf(invoice) {
    const target = invoice || state.currentInvoice;
    if (!target) return;

    const res = await fetch('/api/invoice-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile: state.mobile, vch_no: target.vch_no }),
    });

    if (!res.ok) {
      let message = 'Could not generate the PDF. Please try again.';
      try {
        const data = await res.json();
        if (data.error) message = data.error;
      } catch {
        // non-JSON error response, keep default message
      }
      throw new Error(message);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Invoice-${String(target.vch_no).trim()}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

function render() {
  let screenModule;
  if (state.screen === 'list') screenModule = listScreen;
  else if (state.screen === 'detail') screenModule = detailScreen;
  else screenModule = loginScreen;

  app.innerHTML = screenModule.html(state);
  screenModule.mount(app, actions);
}

function boot() {
  const session = loadSession();
  if (session) {
    state.mobile = session.mobile;
    state.customer = session.customer;
    state.invoices = session.invoices;
  }

  window.addEventListener('popstate', (e) => {
    applyRoute(e.state || parseHash(location.hash), 'none');
  });

  applyRoute(parseHash(location.hash), 'replace');
}

boot();
