// api/_lib/loginToken.js
//
// A short-lived "login pass" handed to the browser after a successful
// WhatsApp code check (verify-otp.js). Endpoints that return customer data
// on later requests -- currently invoice-pdf.js -- require it, and take the
// mobile number FROM the pass rather than from the request body. Without
// this, anyone who knew a customer's mobile number and an invoice number
// could call invoice-pdf.js directly and download that invoice without ever
// logging in.
//
// Format: base64url("<mobile>:<expiresAt>") + "." + HMAC-SHA256 signature,
// keyed with OTP_SESSION_SECRET. Only the server knows the secret, so a pass
// can't be forged or edited to another number.
//
// Environment variable needed: OTP_SESSION_SECRET

const crypto = require('crypto');

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour -- matches the frontend session
const PURPOSE = 'invoice-portal-login'; // keeps these signatures distinct from OTP hashes

function secret() {
  const s = process.env.OTP_SESSION_SECRET;
  if (!s) throw new Error('OTP_SESSION_SECRET is not set in environment variables.');
  return s;
}

function sign(payload) {
  return crypto.createHmac('sha256', secret()).update(`${PURPOSE}:${payload}`).digest('base64url');
}

// mobile: normalized 10-digit number
function createLoginToken(mobile) {
  const payload = `${mobile}:${Date.now() + TOKEN_TTL_MS}`;
  return `${Buffer.from(payload).toString('base64url')}.${sign(payload)}`;
}

// Returns the mobile number the pass was issued for, or null if the pass is
// missing, malformed, tampered with or expired.
function verifyLoginToken(token) {
  if (typeof token !== 'string' || token.length > 512) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  try {
    const payload = Buffer.from(token.slice(0, dot), 'base64url').toString('utf8');
    const given = Buffer.from(token.slice(dot + 1), 'base64url');
    const expected = Buffer.from(sign(payload), 'base64url');
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;

    const [mobile, expiresAtStr] = payload.split(':');
    const expiresAt = Number(expiresAtStr);
    if (!/^\d{10}$/.test(mobile || '') || !Number.isFinite(expiresAt) || Date.now() > expiresAt) {
      return null;
    }
    return mobile;
  } catch {
    return null;
  }
}

module.exports = { createLoginToken, verifyLoginToken };
