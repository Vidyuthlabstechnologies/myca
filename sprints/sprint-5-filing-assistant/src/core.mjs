export function r2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function r4(n) {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

export function parseAmount(v) {
  if (typeof v === 'number') return v;
  if (v === null || v === undefined) return NaN;
  const s = String(v).trim();
  if (!s) return NaN;
  const neg = s.startsWith('(') || s.trim().endsWith('-') || s.startsWith('-');
  const digits = s.replace(/[^0-9.\-]/g, '');
  const n = Number(digits);
  if (Number.isNaN(n)) return NaN;
  return neg && n > 0 ? -n : n;
}

export function prevMonth(ym) {
  const mm = Number(ym.slice(5, 7));
  const yy = Number(ym.slice(0, 4));
  return mm === 1 ? `${String(yy - 1).padStart(4, '0')}-12` : `${String(yy).padStart(4, '0')}-${String(mm - 1).padStart(2, '0')}`;
}
