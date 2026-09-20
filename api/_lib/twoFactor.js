// api/_lib/twoFactor.js
//
// Thin wrapper around 2Factor.in's SMS OTP REST API. Plain HTTP GET calls,
// no client-side SDK/widget involved -- both send and verify happen
// entirely server-side. API key stays server-side only (process.env),
// never exposed to the frontend.
//
// Docs pattern (confirmed via multiple independent sources):
//   Send:   GET https://2factor.in/API/V1/{api_key}/SMS/{phone}/AUTOGEN
//           -> { "Status": "Success", "Details": "<session_id>" }
//   Verify: GET https://2factor.in/API/V1/{api_key}/SMS/VERIFY/{session_id}/{otp}
//           -> { "Status": "Success", "Details": "OTP Matched" }
// On failure, Status is not "Success" -- Details or an error message
// explains why. Log the raw response on first real tests to confirm exact
// failure-mode shapes before assuming any particular error field name.

const API_KEY = process.env.TWOFACTOR_API_KEY;
const BASE_URL = 'https://2factor.in/API/V1';

// All three values below end up as URL path segments, and otp/sessionId
// originate from the client -- so they're checked against strict shapes
// before being interpolated, rather than trusting callers to have done it.
// A value like "../.." must never be able to reshape the 2Factor request.
const PHONE_PATTERN = /^\d{10}$/;
const OTP_PATTERN = /^\d{4,6}$/;
const SESSION_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/; // 2Factor session ids are UUIDs

function assertApiKeyConfigured() {
  if (!API_KEY) {
    throw new Error('TWOFACTOR_API_KEY is not set in environment variables.');
  }
}

// phone: 10-digit Indian mobile number, no country code (2Factor prepends
// +91 itself per their docs pattern -- confirm this holds on first real
// test; if they expect a 91-prefixed number instead, adjust here).
async function sendOtp(phone) {
  assertApiKeyConfigured();
  if (!PHONE_PATTERN.test(String(phone))) {
    throw new Error('sendOtp requires a normalized 10-digit mobile number.');
  }
  const url = `${BASE_URL}/${API_KEY}/SMS/${phone}/AUTOGEN`;
  const response = await fetch(url);
  const data = await response.json();
  console.log('2Factor sendOtp response:', data); // keep for first real tests
  if (data.Status !== 'Success') {
    const err = new Error(data.Details || '2Factor OTP send failed');
    err.raw = data;
    throw err;
  }
  return data.Details; // session id
}

// Returns false (without calling 2Factor) for a malformed sessionId/otp --
// a badly-shaped code is just a wrong code as far as the caller cares.
async function verifyOtp(sessionId, otp) {
  assertApiKeyConfigured();
  if (!SESSION_ID_PATTERN.test(String(sessionId)) || !OTP_PATTERN.test(String(otp))) {
    return false;
  }
  const url = `${BASE_URL}/${API_KEY}/SMS/VERIFY/${sessionId}/${otp}`;
  const response = await fetch(url);
  const data = await response.json();
  console.log('2Factor verifyOtp response:', data); // keep for first real tests
  return data.Status === 'Success' && data.Details === 'OTP Matched';
}

module.exports = { sendOtp, verifyOtp };
