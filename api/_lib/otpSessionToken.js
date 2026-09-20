// api/_lib/otpSessionToken.js
//
// Security fix: 2Factor.in's VERIFY endpoint only confirms "this OTP
// matched this session id" -- it does NOT confirm which phone number that
// session belongs to. Without this, a person could request an OTP on
// THEIR OWN phone, verify it successfully, then submit a DIFFERENT
// customer's mobile number to the invoice lookup and see that customer's
// invoices.
//
// Fix: when we send an OTP, we create a signed "ticket" binding the
// session id + an expiry time to the specific mobile number it was sent
// to, sealed with a server-only secret (OTP_SESSION_SECRET). The client
// gets this ticket back and must present it again at verify time. We
// re-check the signature AND expiry server-side before trusting the
// mobile number -- since only our server knows the secret, nobody can
// forge a ticket for a phone number they don't actually control, and an
// old ticket can't be replayed indefinitely.
//
// IMPORTANT: callers must pass an already-normalized mobile number (via
// normalizeMobile() from verifyCustomer.js) to BOTH createTicket and
// verifyTicket -- this module does exact string comparison and does not
// normalize formatting itself.

const crypto = require('crypto');

const SECRET = process.env.OTP_SESSION_SECRET;
const TICKET_TTL_MS = 10 * 60 * 1000; // 10 minutes

function assertSecretConfigured() {
  if (!SECRET) {
    throw new Error('OTP_SESSION_SECRET is not set in environment variables.');
  }
}

// Creates a signed ticket for a (sessionId, mobile) pair, valid for 10
// minutes from creation.
function createTicket(sessionId, mobile) {
  assertSecretConfigured();
  const expiresAt = Date.now() + TICKET_TTL_MS;
  const payload = `${sessionId}:${mobile}:${expiresAt}`;
  const signature = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  const raw = `${payload}:${signature}`;
  return Buffer.from(raw).toString('base64url');
}

// Verifies a ticket against the mobile number the client is now claiming.
// Returns the sessionId if valid and not expired, or null if the ticket is
// invalid/forged/expired/doesn't match the claimed mobile number.
function verifyTicket(ticket, claimedMobile) {
  assertSecretConfigured();
  try {
    const raw = Buffer.from(ticket, 'base64url').toString('utf8');
    const parts = raw.split(':');
    if (parts.length !== 4) return null;
    const [sessionId, ticketMobile, expiresAtStr, signature] = parts;

    if (ticketMobile !== claimedMobile) return null; // mobile mismatch -- reject

    const expiresAt = Number(expiresAtStr);
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null; // expired -- reject

    const expectedPayload = `${sessionId}:${ticketMobile}:${expiresAtStr}`;
    const expectedSignature = crypto.createHmac('sha256', SECRET).update(expectedPayload).digest('hex');

    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    if (sigBuffer.length !== expectedBuffer.length) return null;
    if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) return null; // tampered/forged -- reject

    return sessionId;
  } catch (e) {
    return null; // malformed ticket
  }
}

module.exports = { createTicket, verifyTicket };
