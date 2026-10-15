export const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];
export const RULESET_VERSION = '2026.1';

export function r2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function r4(n) {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

export function parseAmount(v) {
  if (typeof v === 'number') return v;
  if (v === null || v === undefined) return NaN;
  let s = String(v).trim();
  if (!s) return NaN;
  s = s.replace(/(?:^|\s)(?:dr|db|cr)\.?(?:\s|$)/i, ' ').trim();
  s = s.replace(/^(?:rs\.?|inr|₹)\s*/i, '').replace(/\s*(?:rs\.?|inr)$/i, '').trim();
  const neg = (s.startsWith('(') && s.endsWith(')')) || s.endsWith('-') || s.startsWith('-');
  const digits = s.replace(/[^0-9.]/g, '');
  if (!/^\d+(?:\.\d+)?$|^\.\d+$/.test(digits)) return NaN;
  const n = Number(digits);
  if (Number.isNaN(n)) return NaN;
  return neg && n > 0 ? -n : n;
}

export function csvCells(line) {
  const parts = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQ = true;
      } else if (ch === ',') {
        parts.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
  }
  parts.push(cur);
  return parts;
}

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function fmtINR(n) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(r2(n));
}