export function formatCurrency(value) {
  const n = Number(value) || 0;
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

export function maskMobile(mobile) {
  const digits = String(mobile || '').replace(/\D/g, '');
  if (digits.length < 10) return mobile || '';
  return `+91 ${digits.slice(0, 2)}${'X'.repeat(8)}`;
}

export function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function digitsOnly(value, maxLen) {
  const cleaned = String(value).replace(/\D/g, '');
  return maxLen ? cleaned.slice(0, maxLen) : cleaned;
}
