import './style.css';
import { lookupInvoices } from './api.js';
import * as loginScreen from './screens/login.js';
import * as listScreen from './screens/list.js';
import * as detailScreen from './screens/detail.js';

const app = document.getElementById('app');

const state = {
  screen: 'login', // 'login' | 'list' | 'detail'
  loading: false,
  error: null,
  mobile: '',
  last4: '',
  customer: null,
  invoices: [],
  search: '',
  currentInvoice: null,
};

function setState(patch) {
  Object.assign(state, patch);
  render();
}

const actions = {
  state,
  setState,

  async submitLogin(mobile, last4) {
    setState({ mobile, last4, loading: true, error: null });
    try {
      const data = await lookupInvoices(mobile, last4);
      setState({
        loading: false,
        error: null,
        customer: data.customer,
        invoices: data.invoices || [],
        search: '',
        screen: 'list',
      });
    } catch (err) {
      setState({ loading: false, error: err.message });
    }
  },

  logout() {
    setState({
      screen: 'login',
      loading: false,
      error: null,
      mobile: '',
      last4: '',
      customer: null,
      invoices: [],
      search: '',
      currentInvoice: null,
    });
  },

  openInvoice(invoice) {
    setState({ screen: 'detail', currentInvoice: invoice });
  },

  backToList() {
    setState({ screen: 'list', currentInvoice: null });
  },

  async downloadPdf() {
    if (!state.currentInvoice) return;
    const { generateInvoicePdf } = await import('./pdf.js');
    generateInvoicePdf(state.customer, state.currentInvoice);
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

render();
