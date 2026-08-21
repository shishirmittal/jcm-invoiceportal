import { escapeHtml, digitsOnly } from '../utils.js';

function isCodeComplete(last4) {
  return last4.length === 4 && !last4.includes(' ');
}

function renderCodeBoxes(last4, hasError) {
  return Array.from({ length: 4 }, (_, i) => {
    const char = (last4[i] || '').trim();
    const classes = ['code-box', char ? 'filled' : 'empty'];
    if (hasError) classes.push('has-error');
    return `<input
      class="${classes.join(' ')}"
      data-code-index="${i}"
      type="tel"
      inputmode="numeric"
      pattern="[0-9]*"
      maxlength="1"
      autocomplete="off"
      value="${escapeHtml(char)}"
    />`;
  }).join('');
}

export function html(state) {
  const { mobile, last4, loading, error } = state;
  const valid = mobile.length === 10 && isCodeComplete(last4);

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
        <p class="auth-intro">Enter your mobile number and the last 4 digits of any JCM Retails invoice.</p>

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
          </div>

          <div class="auth-field">
            <label class="auth-field-label">Last 4 digits of any invoice</label>
            <div class="code-boxes" id="code-boxes">
              ${renderCodeBoxes(last4, Boolean(error))}
            </div>
            <span class="code-hint">e.g. invoice #JCM/2627/34531 → 4531</span>
            ${error ? `<span class="code-error">${escapeHtml(error)}</span>` : ''}
          </div>

          <button type="submit" class="btn-primary" id="submit-btn" ${loading || !valid ? 'disabled' : ''}>
            ${loading ? '<span class="spinner"></span>Looking up…' : 'View my invoices'}
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

export function mount(root, { state, submitLogin }) {
  const mobileInput = root.querySelector('#mobile');
  const form = root.querySelector('#login-form');
  const codeBoxesEl = root.querySelector('#code-boxes');
  const submitBtn = root.querySelector('#submit-btn');

  function codeBoxes() {
    return [...codeBoxesEl.querySelectorAll('.code-box')];
  }

  function syncLast4FromBoxes() {
    // Space-pad so a box's position survives even if boxes were filled out
    // of order (e.g. tapping box 3 before box 0) -- plain concatenation
    // would silently shift later digits into the wrong slot on re-render.
    state.last4 = codeBoxes().map((b) => b.value || ' ').join('');
  }

  function refreshValidity() {
    submitBtn.disabled = state.mobile.length !== 10 || !isCodeComplete(state.last4) || state.loading;
  }

  mobileInput.addEventListener('input', () => {
    mobileInput.value = digitsOnly(mobileInput.value, 10);
    state.mobile = mobileInput.value;
    refreshValidity();
  });

  codeBoxesEl.addEventListener('input', (e) => {
    const box = e.target;
    if (!box.classList.contains('code-box')) return;
    const index = Number(box.getAttribute('data-code-index'));
    const digit = digitsOnly(box.value, 1);
    box.value = digit;
    box.classList.toggle('filled', Boolean(digit));
    box.classList.toggle('empty', !digit);
    box.classList.remove('has-error');
    syncLast4FromBoxes();
    if (digit && index < 3) codeBoxes()[index + 1].focus();
    refreshValidity();
  });

  codeBoxesEl.addEventListener('keydown', (e) => {
    const box = e.target;
    if (!box.classList.contains('code-box')) return;
    const index = Number(box.getAttribute('data-code-index'));
    if (e.key === 'Backspace' && !box.value && index > 0) {
      const prev = codeBoxes()[index - 1];
      prev.value = '';
      prev.classList.add('empty');
      prev.classList.remove('filled');
      prev.focus();
      syncLast4FromBoxes();
      refreshValidity();
    }
  });

  codeBoxesEl.addEventListener('paste', (e) => {
    const box = e.target;
    if (!box.classList.contains('code-box')) return;
    e.preventDefault();
    const pasted = digitsOnly((e.clipboardData || window.clipboardData).getData('text'), 4);
    if (!pasted) return;
    const boxes = codeBoxes();
    boxes.forEach((b, i) => {
      b.value = pasted[i] || '';
      b.classList.toggle('filled', Boolean(pasted[i]));
      b.classList.toggle('empty', !pasted[i]);
      b.classList.remove('has-error');
    });
    syncLast4FromBoxes();
    boxes[Math.min(pasted.length, 3)].focus();
    refreshValidity();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (state.mobile.length !== 10 || !isCodeComplete(state.last4)) return;
    submitLogin(state.mobile, state.last4);
  });
}
