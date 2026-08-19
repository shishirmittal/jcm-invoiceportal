import { escapeHtml, digitsOnly } from '../utils.js';

export function html(state) {
  const { mobile, last4, loading, error } = state;

  return `
    <div class="screen">
      <div class="brand-header">
        <img class="brand-logo" src="/jcm-logo.png" alt="JCM Retails" />
        <div class="brand-sub">My Invoices</div>
      </div>
      <div class="screen-body">
        ${error ? `<div class="error-box">${escapeHtml(error)}</div>` : ''}
        <form id="login-form" novalidate>
          <div class="field">
            <label for="mobile">Mobile Number</label>
            <input
              id="mobile"
              name="mobile"
              type="tel"
              inputmode="numeric"
              pattern="[0-9]*"
              maxlength="10"
              placeholder="10-digit mobile number"
              autocomplete="tel"
              value="${escapeHtml(mobile)}"
            />
          </div>
          <div class="field">
            <label for="last4">Last 4 digits of any invoice number</label>
            <input
              id="last4"
              name="last4"
              type="tel"
              inputmode="numeric"
              pattern="[0-9]*"
              maxlength="4"
              placeholder="e.g. 4709"
              value="${escapeHtml(last4)}"
            />
          </div>
          <button type="submit" class="btn-primary" ${loading ? 'disabled' : ''}>
            ${loading ? '<span class="spinner"></span>Looking up…' : 'View My Invoices'}
          </button>
        </form>
        <div class="hint">
          Enter the mobile number on file and the last 4 digits from any of
          your JCM Retails invoices to view your purchase history.
        </div>
      </div>
    </div>
  `;
}

export function mount(root, { setState, submitLogin }) {
  const mobileInput = root.querySelector('#mobile');
  const last4Input = root.querySelector('#last4');
  const form = root.querySelector('#login-form');

  mobileInput.addEventListener('input', () => {
    mobileInput.value = digitsOnly(mobileInput.value, 10);
  });
  last4Input.addEventListener('input', () => {
    last4Input.value = digitsOnly(last4Input.value, 4);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const mobile = digitsOnly(mobileInput.value, 10);
    const last4 = digitsOnly(last4Input.value, 4);

    if (mobile.length !== 10) {
      setState({ mobile, last4, error: 'Please enter a valid 10-digit mobile number.' });
      return;
    }
    if (last4.length !== 4) {
      setState({ mobile, last4, error: 'Please enter the last 4 digits of an invoice number.' });
      return;
    }

    submitLogin(mobile, last4);
  });
}
