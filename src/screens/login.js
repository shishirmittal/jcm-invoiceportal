import { escapeHtml, digitsOnly } from '../utils.js';

const WIDGET_ID = '36696a706d70343036363138';
const TOKEN_AUTH = '569853TzLz50GRwH6aa2d872P1';
const OTP_PROVIDER_SRC = 'https://verify.msg91.com/otp-provider.js';

// MSG91's widget script defines a global `sendOtp` once loaded. This is
// their own documented loading pattern (inject the script once, then call
// sendOtp -- either immediately if it's already loaded, or on the injected
// script's load event otherwise), adapted to run from a JS module instead
// of an inline <script> tag.
function loadOtpScript(configuration) {
  if (typeof window.sendOtp !== 'undefined') {
    window.sendOtp('', configuration.success, configuration.failure, configuration);
    return;
  }
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = OTP_PROVIDER_SRC;
  script.onload = () => {
    window.sendOtp('', configuration.success, configuration.failure, configuration);
  };
  document.body.appendChild(script);
}

export function html(state) {
  const { mobile, loading, error, otpStatus } = state;
  const valid = mobile.length === 10;

  return `
    <div class="screen">
      <div class="auth-header">
        <img class="auth-logo" src="/jcm-logo.png" alt="JCM Retails" />
        <div class="auth-brand">
          <span class="auth-eyebrow">MY INVOICES</span>
          <span class="auth-title">Your purchase history</span>
        </div>
      </div>
      <div class="auth-body">
        <p class="auth-intro">Enter your mobile number — we'll text you a one-time code to verify it's you.</p>

        <form id="login-form" novalidate>
          <div class="auth-field">
            <label class="auth-field-label" for="mobile">Mobile number</label>
            <div class="mobile-row">
              <span class="mobile-prefix">+91</span>
              <input
                id="mobile"
                class="mobile-input"
                name="mobile"
                type="tel"
                inputmode="numeric"
                pattern="[0-9]*"
                maxlength="10"
                placeholder="98XXXXXXXX"
                autocomplete="tel"
                value="${escapeHtml(mobile)}"
              />
            </div>
            ${error ? `<span class="code-error">${escapeHtml(error)}</span>` : ''}
            ${!error && otpStatus ? `<span class="code-hint">${escapeHtml(otpStatus)}</span>` : ''}
          </div>

          <button type="submit" class="btn-primary" id="submit-btn" ${loading || !valid ? 'disabled' : ''}>
            ${loading ? '<span class="spinner"></span>Please wait…' : 'Send OTP'}
          </button>
        </form>

        <div class="help-card">
          <span class="help-title">Need help?</span>
          <span class="help-text">Customer care <a href="tel:9109108258">910 910 8258</a> · Mon–Sat, 10am–7pm</span>
        </div>
      </div>
    </div>
  `;
}

export function mount(root, { state, setState, completeOtpLogin }) {
  const mobileInput = root.querySelector('#mobile');
  const form = root.querySelector('#login-form');
  const submitBtn = root.querySelector('#submit-btn');

  function refreshValidity() {
    submitBtn.disabled = state.mobile.length !== 10 || state.loading;
  }

  mobileInput.addEventListener('input', () => {
    mobileInput.value = digitsOnly(mobileInput.value, 10);
    state.mobile = mobileInput.value;
    refreshValidity();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (state.mobile.length !== 10 || state.loading) return;

    setState({ loading: true, error: null, otpStatus: null });

    const mobile = state.mobile;
    const configuration = {
      widgetId: WIDGET_ID,
      tokenAuth: TOKEN_AUTH,
      identifier: `91${mobile}`,
      exposeMethods: false,
      success: (data) => {
        // MSG91's widget onSuccess payload carries the access token as
        // `message` per their current docs; fall back to a couple of other
        // field names in case this account's widget version differs --
        // confirm against this log the first time a real OTP is verified.
        console.log('MSG91 widget success:', data);
        const accessToken = data && (data.message || data.accessToken || data.token);
        if (!accessToken) {
          setState({ loading: false, error: 'Could not complete verification. Please try again.' });
          return;
        }
        completeOtpLogin(mobile, accessToken);
      },
      failure: (err) => {
        console.log('MSG91 widget failure:', err);
        setState({ loading: false, error: 'OTP verification failed. Please try again.' });
      },
    };

    loadOtpScript(configuration);
  });
}
