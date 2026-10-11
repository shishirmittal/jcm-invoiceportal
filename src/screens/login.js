import { escapeHtml, digitsOnly, maskMobile } from '../utils.js';
import { sendOtp as requestOtp } from '../api.js';

// Codes are generated server-side (api/_lib/otpStore.js) and are always 6
// digits; they arrive on WhatsApp.
const OTP_LENGTH = 6;
const LAST4_LENGTH = 4;
const RESEND_COOLDOWN_SECONDS = 30;

let cooldownIntervalId = null;

// Bumped on every send AND whenever the user backs out of the OTP flow
// (change number / switch login option), so a send that resolves after
// they've moved on is ignored instead of yanking them back to code entry
// for a number they're no longer verifying.
let sendSeq = 0;

// Code-box values are space-padded to the full length (see wireCodeBoxes),
// so "complete" means full length with no gaps.
function isCodeComplete(value, length) {
  return value.length === length && !value.includes(' ');
}

function renderCodeBoxes(value, length, hasError, autocomplete) {
  return Array.from({ length }, (_, i) => {
    const char = (value[i] || '').trim();
    const classes = ['code-box', char ? 'filled' : 'empty'];
    if (hasError) classes.push('has-error');
    return `<input
      class="${classes.join(' ')}"
      data-code-index="${i}"
      type="tel"
      inputmode="numeric"
      pattern="[0-9]*"
      maxlength="1"
      autocomplete="${autocomplete}"
      value="${escapeHtml(char)}"
    />`;
  }).join('');
}

const AUTH_HEADER = `
  <div class="auth-header">
    <img class="auth-logo" src="/jcm-logo.png" alt="JCM Retails" />
    <div class="auth-brand">
      <span class="auth-eyebrow">MY INVOICES</span>
      <span class="auth-title">Your purchase history</span>
    </div>
  </div>
`;

const HELP_CARD = `
  <div class="help-card">
    <span class="help-title">Need help?</span>
    <span class="help-text">Customer care <a href="tel:9109108258">910 910 8258</a> · Mon–Sat, 10am–7pm</span>
  </div>
`;

function mobileField(mobile, extra) {
  return `
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
      ${extra || ''}
    </div>
  `;
}

function last4Html(state) {
  const { mobile, last4, loading, error } = state;
  const valid = mobile.length === 10 && isCodeComplete(last4, LAST4_LENGTH);

  return `
    <div class="screen">
      ${AUTH_HEADER}
      <div class="auth-body">
        <p class="auth-intro">Enter your mobile number and the last 4 digits of any JCM Retails invoice.</p>

        <form id="last4-form" novalidate>
          ${mobileField(mobile)}

          <div class="auth-field">
            <label class="auth-field-label">Last 4 digits of any invoice</label>
            <div class="code-boxes" id="last4-boxes">
              ${renderCodeBoxes(last4, LAST4_LENGTH, Boolean(error), 'off')}
            </div>
            <span class="code-hint">e.g. invoice #JCM/2627/34531 → 4531</span>
            ${error ? `<span class="code-error">${escapeHtml(error)}</span>` : ''}
          </div>

          <button type="submit" class="btn-primary" id="last4-submit-btn" ${loading || !valid ? 'disabled' : ''}>
            ${loading ? '<span class="spinner"></span>Looking up…' : 'View my invoices'}
          </button>
        </form>

        <button type="button" class="link-btn" id="switch-mode-btn">Get a one-time code on WhatsApp instead</button>

        ${HELP_CARD}
      </div>
    </div>
  `;
}

function otpMobileHtml(state) {
  const { mobile, loading, error, otpStatus } = state;
  const mobileValid = mobile.length === 10;
  const messages = `
    ${error ? `<span class="code-error">${escapeHtml(error)}</span>` : ''}
    ${!error && otpStatus ? `<span class="code-hint">${escapeHtml(otpStatus)}</span>` : ''}
  `;

  return `
    <div class="screen">
      ${AUTH_HEADER}
      <div class="auth-body">
        <p class="auth-intro">Enter your mobile number — we'll send a one-time code to your WhatsApp to verify it's you.</p>

        <form id="mobile-form" novalidate>
          ${mobileField(mobile, messages)}

          <button type="submit" class="btn-primary" id="send-otp-btn" ${loading || !mobileValid ? 'disabled' : ''}>
            ${loading ? '<span class="spinner"></span>Sending…' : 'Send code on WhatsApp'}
          </button>
        </form>

        <button type="button" class="link-btn" id="switch-mode-btn">Use the last 4 digits of an invoice instead</button>

        ${HELP_CARD}
      </div>
    </div>
  `;
}

function otpEntryHtml(state) {
  const { mobile, loading, error, otp } = state;
  const otpValid = isCodeComplete(otp, OTP_LENGTH);

  return `
    <div class="screen">
      ${AUTH_HEADER}
      <div class="auth-body">
        <p class="auth-intro">Enter the code we sent on WhatsApp to +91 ${escapeHtml(maskMobile(mobile).replace('+91 ', ''))}.</p>

        <form id="otp-form" novalidate>
          <div class="auth-field">
            <label class="auth-field-label">One-time code</label>
            <div class="code-boxes" id="otp-boxes">
              ${renderCodeBoxes(otp, OTP_LENGTH, Boolean(error), 'one-time-code')}
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

export function html(state) {
  if (state.loginMode === 'last4') return last4Html(state);
  return state.otpSent ? otpEntryHtml(state) : otpMobileHtml(state);
}

// Wires one row of single-digit boxes (auto-advance, backspace-to-previous,
// paste-to-fill). Shared by the OTP boxes and the last4 boxes. onChange
// receives the current value, space-padded so a box's position survives
// even if boxes were filled out of order (e.g. tapping box 3 before box 0)
// -- plain concatenation would silently shift later digits into the wrong
// slot on re-render.
function wireCodeBoxes(containerEl, length, onChange) {
  function boxes() {
    return [...containerEl.querySelectorAll('.code-box')];
  }

  function setBox(box, digit) {
    box.value = digit;
    box.classList.toggle('filled', Boolean(digit));
    box.classList.toggle('empty', !digit);
    box.classList.remove('has-error');
  }

  function emit() {
    onChange(boxes().map((b) => b.value || ' ').join(''));
  }

  containerEl.addEventListener('input', (e) => {
    const box = e.target;
    if (!box.classList.contains('code-box')) return;
    const index = Number(box.getAttribute('data-code-index'));
    const digit = digitsOnly(box.value, 1);
    setBox(box, digit);
    emit();
    if (digit && index < length - 1) boxes()[index + 1].focus();
  });

  containerEl.addEventListener('keydown', (e) => {
    const box = e.target;
    if (!box.classList.contains('code-box')) return;
    const index = Number(box.getAttribute('data-code-index'));
    if (e.key === 'Backspace' && !box.value && index > 0) {
      const prev = boxes()[index - 1];
      setBox(prev, '');
      prev.focus();
      emit();
    }
  });

  containerEl.addEventListener('paste', (e) => {
    const box = e.target;
    if (!box.classList.contains('code-box')) return;
    e.preventDefault();
    const pasted = digitsOnly((e.clipboardData || window.clipboardData).getData('text'), length);
    if (!pasted) return;
    const all = boxes();
    all.forEach((b, i) => setBox(b, pasted[i] || ''));
    emit();
    all[Math.min(pasted.length, length - 1)].focus();
  });

  return boxes;
}

export function mount(root, { state, setState, completeOtpLogin, submitLogin }) {
  if (cooldownIntervalId) {
    clearInterval(cooldownIntervalId);
    cooldownIntervalId = null;
  }

  function wireMobileInput(onChange) {
    const mobileInput = root.querySelector('#mobile');
    mobileInput.addEventListener('input', () => {
      mobileInput.value = digitsOnly(mobileInput.value, 10);
      state.mobile = mobileInput.value;
      onChange();
    });
  }

  function wireSwitchMode(nextMode) {
    root.querySelector('#switch-mode-btn').addEventListener('click', () => {
      sendSeq += 1;
      setState({ loginMode: nextMode, loading: false, error: null, otpStatus: null, last4: '' });
    });
  }

  // Mobile + last4 login (no code involved)
  if (state.loginMode === 'last4') {
    const form = root.querySelector('#last4-form');
    const submitBtn = root.querySelector('#last4-submit-btn');

    function refreshValidity() {
      submitBtn.disabled = state.mobile.length !== 10 || !isCodeComplete(state.last4, LAST4_LENGTH) || state.loading;
    }

    wireMobileInput(refreshValidity);
    wireCodeBoxes(root.querySelector('#last4-boxes'), LAST4_LENGTH, (value) => {
      state.last4 = value;
      refreshValidity();
    });
    wireSwitchMode('otp');

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (state.mobile.length !== 10 || !isCodeComplete(state.last4, LAST4_LENGTH) || state.loading) return;
      submitLogin(state.mobile, state.last4);
    });
    return;
  }

  function sendOtp() {
    setState({ loading: true, error: null, otpStatus: null });
    const seq = ++sendSeq;
    requestOtp(state.mobile)
      .then(() => {
        if (seq !== sendSeq) return;
        setState({ loading: false, error: null, otpSent: true, otp: '' });
      })
      .catch((err) => {
        if (seq !== sendSeq) return;
        setState({ loading: false, error: err.message });
      });
  }

  // OTP step 1: mobile number
  if (!state.otpSent) {
    const form = root.querySelector('#mobile-form');
    const submitBtn = root.querySelector('#send-otp-btn');

    wireMobileInput(() => {
      submitBtn.disabled = state.mobile.length !== 10 || state.loading;
    });
    wireSwitchMode('last4');

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (state.mobile.length !== 10 || state.loading) return;
      sendOtp();
    });
    return;
  }

  // OTP step 2: code entry
  const form = root.querySelector('#otp-form');
  const verifyBtn = root.querySelector('#verify-btn');
  const changeNumberBtn = root.querySelector('#change-number-btn');
  const resendBtn = root.querySelector('#resend-btn');

  const otpBoxes = wireCodeBoxes(root.querySelector('#otp-boxes'), OTP_LENGTH, (value) => {
    state.otp = value;
    verifyBtn.disabled = !isCodeComplete(state.otp, OTP_LENGTH) || state.loading;
  });

  otpBoxes()[0]?.focus();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!isCodeComplete(state.otp, OTP_LENGTH) || state.loading) return;
    completeOtpLogin(state.mobile, state.otp);
  });

  changeNumberBtn.addEventListener('click', () => {
    sendSeq += 1;
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
