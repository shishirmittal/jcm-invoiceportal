async function postJson(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  let data = {};
  try {
    data = await res.json();
  } catch {
    // non-JSON response, fall through to generic error below
  }

  if (!res.ok) {
    throw new Error(data.error || 'Something went wrong. Please try again in a moment.');
  }

  return data;
}

export function lookupInvoices(mobile, last4) {
  return postJson('/api/lookup-invoices', { mobile, last4 });
}

// Resolves to the signed ticket /api/verify-otp needs back -- opaque to the
// frontend, it just holds onto it between the two calls.
export async function sendOtp(mobile) {
  const data = await postJson('/api/send-otp', { mobile });
  if (!data.ticket) {
    throw new Error("Couldn't send OTP, please try again.");
  }
  return data.ticket;
}

export function verifyOtp(mobile, ticket, otp) {
  return postJson('/api/verify-otp', { mobile, ticket, otp });
}
