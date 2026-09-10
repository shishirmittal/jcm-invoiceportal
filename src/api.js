export async function lookupInvoices(mobile, last4) {
  const res = await fetch('/api/lookup-invoices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mobile, last4 }),
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

export async function verifyOtp(mobile, accessToken) {
  const res = await fetch('/api/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mobile, accessToken }),
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
