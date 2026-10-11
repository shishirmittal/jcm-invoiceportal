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

// Asks the server to send a login code to this number on WhatsApp.
export async function sendOtp(mobile) {
  const data = await postJson('/api/send-otp', { mobile });
  if (!data.sent) {
    throw new Error("Couldn't send the code, please try again.");
  }
}

export function verifyOtp(mobile, otp) {
  return postJson('/api/verify-otp', { mobile, otp });
}
