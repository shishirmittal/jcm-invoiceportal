import { escapeHtml, digitsOnly, maskMobile } from '../utils.js';

const WIDGET_ID = '36696a706d70343036363138';
const TOKEN_AUTH = '569853TzLz50GRwH6aa2d872P1';
const OTP_PROVIDER_SRC = 'https://verify.msg91.com/otp-provider.js';

// MSG91's widget OTP length is configured per-widget on their dashboard and
// isn't exposed anywhere in the sendOtp/verifyOtp response we can read --
// this renders up to 6 boxes (a common default) but verifying only requires
// 4+ digits typed contiguously from the first box, so a 4-digit widget still
// works. Confirm against a live test and trim this down if it's shorter.
const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 30;

let widgetInitialized = false;
let cooldownIntervalId = null;

function isOtpComplete(otp) {
  const trimmed = otp.replace(/\s+$/, '');
  return trimmed.length >= 4 && !trimmed.includes(' ');
}

// otp-provider.js defines a global `initSendOTP` once loaded. Calling it
// with exposeMethods: true is what makes window.sendOtp/window.verifyOtp
// callable directly -- without that flag they're left undefined, and
// without calling initSendOTP at all MSG91 would render its own popup UI
// instead (which is exactly what we're avoiding here in favor of our own
// branded OTP screen).
function loadOtpScript(onReady, onError) {
  if (typeof window.initSendOTP === 'function') {
    onReady();
    return;
  }
  console.log('MSG91: loading otp-provider.js');
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = OTP_PROVIDER_SRC;
  script.onload = () => {
    console.log('MSG91: otp-provider.js loaded, initSendOTP is', typeof window.initSendOTP);
    if (typeof window.initSendOTP !== 'function') {
      onError(new Error('otp-provider.js loaded but did not define initSendOTP'));
      return;
    }
    onReady();
  };
  script.onerror = (err) => {
    console.error('MSG91: failed to load otp-provider.js', err);
    onError(err);
  };
  document.body.appendChild(script);
}

function waitForExposedMethods(timeoutMs = 5000, intervalMs = 150) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function poll() {
      if (typeof window.sendOtp === 'function' && typeof window.verifyOtp === 'function') {
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error('sendOtp/verifyOtp were not exposed after initSendOTP -- check exposeMethods config'));
        return;
      }
      setTimeout(poll, intervalMs);
    })();
  });
}

function ensureWidgetReady() {
  return new Promise((resolve, reject) => {
    loadOtpScript(() => {
      if (!widgetInitialized) {
        try {
          console.log('MSG91: calling initSendOTP with exposeMethods: true');
          window.initSendOTP({
            widgetId: WIDGET_ID,
            tokenAuth: TOKEN_AUTH,
            exposeMethods: true,
            // Widget-level success/failure are unused -- we drive sendOtp
            // and verifyOtp directly and handle their own per-call
            // callbacks below, per MSG91's custom-UI pattern.
            success: () => {},
            failure: () => {},
          });
          widgetInitialized = true;
        } catch (err) {
          reject(err);
          return;
        }
      }
      waitForExposedMethods().then(resolve, reject);
    }, reject);
  });
}

function renderOtpBoxes(otp, hasError) {
  return Array.from({ length: OTP_LENGTH }, (_, i) => {
    const char = (otp[i] || '').trim();
    const classes = ['code-box', char ? 'filled' : 'empty'];
    if (hasError) classes.push('has-error');
    return `<input
      class="${classes.join(' ')}"
      data-otp-index="${i}"
      type="tel"
      inputmode="numeric"
      pattern="[0-9]*"
      maxlength="1"
      autocomplete="one-time-code"
      value="${escapeHtml(char)}"
    />`;
  }).join('');
}

export function html(state) {
  const { mobile, loading, error, otpStatus, otpSent, otp } = state;
  const mobileValid = mobile.length === 10;

  if (!otpSent) {
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

          <form id="mobile-form" novalidate>
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

            <button type="submit" class="btn-primary" id="send-otp-btn" ${loading || !mobileValid ? 'disabled' : ''}>
              ${loading ? '<span class="spinner"></span>Sending…' : 'Send OTP'}
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

  const otpValid = isOtpComplete(otp);
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
        <p class="auth-intro">Enter the code we texted to +91 ${escapeHtml(maskMobile(mobile).replace('+91 ', ''))}.</p>

        <form id="otp-form" novalidate>
          <div class="auth-field">
            <label class="auth-field-label">One-time code</label>
            <div class="code-boxes" id="otp-boxes">
              ${renderOtpBoxes(otp, Boolean(error))}
            </div>
            ${error ? `<span class="code-error">${escapeHtml(error)}</span>` : ''}
          </div>

          <button type="submit" class="btn-primary" id="verify-btn" ${loading || !otpValid ? 'disabled' : ''}>
            ${loading ? '<span class="spinner"></span>Verifying…' : 'Verify'}
          </button>
        </form>

        <div class="otp-actions">
          <button type="button" class="link-btn" id="change-number-btn">Change number</button>
          <button type="button" class="link-btn" id="resend-btn" disabled>Resend OTP (${RESEND_COOLDOWN_SECONDS}s)</button>
        </div>
      </div>
    </div>
  `;
}

export function mount(root, { state, setState, completeOtpLogin }) {
  if (cooldownIntervalId) {
    clearInterval(cooldownIntervalId);
    cooldownIntervalId = null;
  }

  function sendOtp() {
    setState({ loading: true, error: null, otpStatus: null });
    const mobile = state.mobile;
    ensureWidgetReady()
      .then(() => {
        console.log('MSG91: calling sendOtp for', mobile);
        window.sendOtp(
          `91${mobile}`,
          (data) => {
            console.log('MSG91 sendOtp success:', data);
            setState({ loading: false, error: null, otpSent: true, otp: '' });
          },
          (err) => {
            console.log('MSG91 sendOtp failure:', err);
            setState({ loading: false, error: "Couldn't send OTP, please check the number and try again." });
          }
        );
      })
      .catch((err) => {
        console.error('MSG91: could not initialize widget', err);
        setState({ loading: false, error: 'Could not start verification. Please try again.' });
      });
  }

  if (!state.otpSent) {
    const mobileInput = root.querySelector('#mobile');
    const form = root.querySelector('#mobile-form');
    const submitBtn = root.querySelector('#send-otp-btn');

    mobileInput.addEventListener('input', () => {
      mobileInput.value = digitsOnly(mobileInput.value, 10);
      state.mobile = mobileInput.value;
      submitBtn.disabled = state.mobile.length !== 10 || state.loading;
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (state.mobile.length !== 10 || state.loading) return;
      sendOtp();
    });
    return;
  }

  // Step 2: OTP entry
  const otpBoxesEl = root.querySelector('#otp-boxes');
  const form = root.querySelector('#otp-form');
  const verifyBtn = root.querySelector('#verify-btn');
  const changeNumberBtn = root.querySelector('#change-number-btn');
  const resendBtn = root.querySelector('#resend-btn');

  function otpBoxes() {
    return [...otpBoxesEl.querySelectorAll('.code-box')];
  }

  function syncOtpFromBoxes() {
    state.otp = otpBoxes().map((b) => b.value || ' ').join('');
  }

  function refreshVerifyValidity() {
    verifyBtn.disabled = !isOtpComplete(state.otp) || state.loading;
  }

  otpBoxesEl.addEventListener('input', (e) => {
    const box = e.target;
    if (!box.classList.contains('code-box')) return;
    const index = Number(box.getAttribute('data-otp-index'));
    const digit = digitsOnly(box.value, 1);
    box.value = digit;
    box.classList.toggle('filled', Boolean(digit));
    box.classList.toggle('empty', !digit);
    box.classList.remove('has-error');
    syncOtpFromBoxes();
    if (digit && index < OTP_LENGTH - 1) otpBoxes()[index + 1].focus();
    refreshVerifyValidity();
  });

  otpBoxesEl.addEventListener('keydown', (e) => {
    const box = e.target;
    if (!box.classList.contains('code-box')) return;
    const index = Number(box.getAttribute('data-otp-index'));
    if (e.key === 'Backspace' && !box.value && index > 0) {
      const prev = otpBoxes()[index - 1];
      prev.value = '';
      prev.classList.add('empty');
      prev.classList.remove('filled');
      prev.focus();
      syncOtpFromBoxes();
      refreshVerifyValidity();
    }
  });

  otpBoxesEl.addEventListener('paste', (e) => {
    const box = e.target;
    if (!box.classList.contains('code-box')) return;
    e.preventDefault();
    const pasted = digitsOnly((e.clipboardData || window.clipboardData).getData('text'), OTP_LENGTH);
    if (!pasted) return;
    const boxes = otpBoxes();
    boxes.forEach((b, i) => {
      b.value = pasted[i] || '';
      b.classList.toggle('filled', Boolean(pasted[i]));
      b.classList.toggle('empty', !pasted[i]);
      b.classList.remove('has-error');
    });
    syncOtpFromBoxes();
    boxes[Math.min(pasted.length, OTP_LENGTH - 1)].focus();
    refreshVerifyValidity();
  });

  otpBoxes()[0]?.focus();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!isOtpComplete(state.otp) || state.loading) return;

    setState({ loading: true, error: null });
    const otpDigits = state.otp.replace(/\s+$/, '');
    const mobile = state.mobile;

    ensureWidgetReady()
      .then(() => {
        console.log('MSG91: calling verifyOtp');
        window.verifyOtp(
          Number(otpDigits),
          (data) => {
            // Per MSG91's docs, listening to verifyOtp's own success
            // callback carries the same payload the widget-level success
            // callback would have -- confirm the access-token field name
            // against this log the first time a real OTP is verified.
            console.log('MSG91 verifyOtp success:', data);
            const accessToken = data && (data.message || data.accessToken || data.token);
            if (!accessToken) {
              setState({ loading: false, error: 'Could not complete verification. Please try again.' });
              return;
            }
            completeOtpLogin(mobile, accessToken);
          },
          (err) => {
            console.log('MSG91 verifyOtp failure:', err);
            setState({ loading: false, error: 'Incorrect code. Please try again.' });
          }
        );
      })
      .catch((err) => {
        console.error('MSG91: could not verify right now', err);
        setState({ loading: false, error: 'Could not verify right now. Please try again.' });
      });
  });

  changeNumberBtn.addEventListener('click', () => {
    setState({ otpSent: false, otp: '', error: null, otpStatus: null, loading: false });
  });

  resendBtn.addEventListener('click', () => {
    if (resendBtn.disabled) return;
    sendOtp();
  });

  // Resend cooldown -- ticks a plain DOM text update rather than going
  // through setState, so it doesn't blow away focus/typed digits in the OTP
  // boxes every second the way a full re-render would.
  let remaining = RESEND_COOLDOWN_SECONDS;
  resendBtn.disabled = true;
  resendBtn.textContent = `Resend OTP (${remaining}s)`;
  cooldownIntervalId = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(cooldownIntervalId);
      cooldownIntervalId = null;
      resendBtn.disabled = false;
      resendBtn.textContent = 'Resend OTP';
      return;
    }
    resendBtn.textContent = `Resend OTP (${remaining}s)`;
  }, 1000);
}
