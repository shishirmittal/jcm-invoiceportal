// api/send-otp.js
//
// POST body: { mobile: "9876543210" }
// Sends an OTP via 2Factor.in, returns a signed ticket to the frontend
// (needed for the verify step). The ticket binds 2Factor's session id to
// the mobile number the OTP was sent to -- see _lib/otpSessionToken.js for
// why the raw session id is never handed to the client on its own. The
// ticket alone doesn't grant any access -- the correct OTP is still
// required to proceed.
//
// Environment variables needed: TWOFACTOR_API_KEY, OTP_SESSION_SECRET

const { sendOtp } = require('./_lib/twoFactor');
const { createTicket } = require('./_lib/otpSessionToken');
const { normalizeMobile } = require('./_lib/verifyCustomer');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const { mobile } = req.body || {};
  const cleanMobile = normalizeMobile(mobile || '');
  if (cleanMobile.length !== 10) {
    res.status(400).json({ error: 'Please enter a valid 10-digit mobile number.' });
    return;
  }

  try {
    const sessionId = await sendOtp(cleanMobile);
    res.status(200).json({ ticket: createTicket(sessionId, cleanMobile) });
  } catch (err) {
    console.error('send-otp error:', err);
    res.status(500).json({ error: "Couldn't send OTP, please check the number and try again." });
  }
};
