export const NEW_REGIME_2026_27 = {
  slabs: [
    { upto: 4, rate: 0 },
    { upto: 8, rate: 0.05 },
    { upto: 12, rate: 0.15 },
    { upto: 16, rate: 0.18 },
    { upto: 20, rate: 0.22 },
    { upto: 24, rate: 0.25 },
    { upto: Infinity, rate: 0.3 },
  ],
  rebate: { upto: 12, amount: 60000 },
  standardDeduction: 75000,
  cessRate: 0.04,
};

export const OLD_REGIME_2026_27 = {
  slabs: [
    { upto: 2.5, rate: 0 },
    { upto: 5, rate: 0.05 },
    { upto: 10, rate: 0.2 },
    { upto: Infinity, rate: 0.3 },
  ],
  rebate: { upto: 5, amount: 12500 },
  standardDeduction: 50000,
  cessRate: 0.04,
};

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

export function taxOn(taxableInRupees, cfg) {
  const t = taxableInRupees;
  let base = 0;
  let prev = 0;
  for (const s of cfg.slabs) {
    const lim = s.upto * 1e5;
    if (t > prev) {
      base += (Math.min(t, lim) - prev) * s.rate;
    }
    prev = lim;
    if (t <= lim) break;
  }
  let rebateApplied = 0;
  if (t <= cfg.rebate.upto * 1e5) {
    rebateApplied = Math.min(base, cfg.rebate.amount);
    base = base - rebateApplied;
  }
  const cess = r2(base * cfg.cessRate);
  return {
    base: r2(base),
    rebateApplied: r2(rebateApplied),
    cess,
    total: r2(base + cess),
  };
}