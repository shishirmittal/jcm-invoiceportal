// api/_lib/otpStore.js
//
// We generate and check login codes ourselves now (WhatsApp just delivers
// them), so this module owns the rules:
//   - 6-digit code from a cryptographically secure generator
//   - only a keyed hash (HMAC with OTP_SESSION_SECRET) is stored, never the
//     code itself
//   - a code is valid for 10 minutes and can be used once
//   - at most 5 wrong guesses per code, then it is dead
//   - at most 3 codes per mobile number per 10 minutes
//   - a new code invalidates any earlier unused one for that number
//
// Backed by the public.otp_codes table (RLS on, no policies -- only the
// server's service key can touch it).
//
// Environment variable needed: OTP_SESSION_SECRET

const crypto = require('crypto');

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_WINDOW = 3;
const CODE_PATTERN = /^\d{6}$/;

function hashCode(mobile, code) {
  const secret = process.env.OTP_SESSION_SECRET;
  if (!secret) throw new Error('OTP_SESSION_SECRET is not set in environment variables.');
  return crypto.createHmac('sha256', secret).update(`${mobile}:${code}`).digest('hex');
}

// Creates a fresh code for `mobile`. Returns { rateLimited: true } if the
// number already asked for too many codes recently, otherwise { id, code }.
async function createOtp(supabase, mobile) {
  const windowStart = new Date(Date.now() - CODE_TTL_MS).toISOString();
  const { count, error: countErr } = await supabase
    .from('otp_codes')
    .select('id', { count: 'exact', head: true })
    .eq('mobile', mobile)
    .gte('created_at', windowStart);
  if (countErr) throw new Error(`otp_codes count failed: ${countErr.message}`);
  if ((count || 0) >= MAX_SENDS_PER_WINDOW) return { rateLimited: true };

  // Kill any earlier unused code for this number.
  const { error: killErr } = await supabase
    .from('otp_codes')
    .update({ used: true })
    .eq('mobile', mobile)
    .eq('used', false);
  if (killErr) throw new Error(`otp_codes invalidate failed: ${killErr.message}`);

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const { data, error: insErr } = await supabase
    .from('otp_codes')
    .insert({
      mobile,
      code_hash: hashCode(mobile, code),
      expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    })
    .select('id')
    .single();
  if (insErr) throw new Error(`otp_codes insert failed: ${insErr.message}`);

  // Housekeeping: drop rows older than a day. Failure here is harmless.
  supabase
    .from('otp_codes')
    .delete()
    .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .then(() => {}, () => {});

  return { id: data.id, code };
}

// Removes a code that was never delivered, so a failed send doesn't use up
// the customer's quota.
async function discardOtp(supabase, id) {
  await supabase.from('otp_codes').delete().eq('id', id);
}

// Returns one of: 'ok' | 'invalid' | 'expired' | 'locked'
async function checkOtp(supabase, mobile, code) {
  if (!CODE_PATTERN.test(String(code))) return 'invalid';

  const { data: row, error } = await supabase
    .from('otp_codes')
    .select('id, code_hash, attempts')
    .eq('mobile', mobile)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`otp_codes lookup failed: ${error.message}`);
  if (!row) return 'expired';

  if (row.attempts >= MAX_ATTEMPTS) {
    await supabase.from('otp_codes').update({ used: true }).eq('id', row.id);
    return 'locked';
  }

  // Claim this guess atomically: only succeeds if nobody else bumped the
  // counter since we read it, so parallel requests can't sneak extra tries.
  const { data: claimed, error: claimErr } = await supabase
    .from('otp_codes')
    .update({ attempts: row.attempts + 1 })
    .eq('id', row.id)
    .eq('attempts', row.attempts)
    .eq('used', false)
    .select('id');
  if (claimErr) throw new Error(`otp_codes attempt update failed: ${claimErr.message}`);
  if (!claimed || claimed.length === 0) return 'invalid';

  const given = Buffer.from(hashCode(mobile, code), 'hex');
  const stored = Buffer.from(row.code_hash, 'hex');
  const matches = given.length === stored.length && crypto.timingSafeEqual(given, stored);

  if (!matches) {
    if (row.attempts + 1 >= MAX_ATTEMPTS) {
      await supabase.from('otp_codes').update({ used: true }).eq('id', row.id);
      return 'locked';
    }
    return 'invalid';
  }

  // Correct code: spend it so it can never be replayed.
  const { data: spent, error: spendErr } = await supabase
    .from('otp_codes')
    .update({ used: true })
    .eq('id', row.id)
    .eq('used', false)
    .select('id');
  if (spendErr) throw new Error(`otp_codes spend failed: ${spendErr.message}`);
  return spent && spent.length === 1 ? 'ok' : 'invalid';
}

module.exports = { createOtp, discardOtp, checkOtp };
