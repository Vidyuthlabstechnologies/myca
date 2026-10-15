import { localToday, postingDate } from './dates.mjs';

const ARN = /^[A-Z0-9]{10,20}$/;

export function monthsBack(asOfDate, back = 24, ahead = 2) {
  const [y, m] = String(asOfDate).slice(0, 7).split('-').map(Number);
  return Array.from({ length: back + ahead + 1 }, (_, i) => {
    const index = y * 12 + (m - 1) + i - back;
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
  });
}

function filingGstin(book, gstin) {
  const wanted = String(gstin || '').replace(/\s+/g, '').toUpperCase();
  const principal = String(book?.company?.gstin || '').replace(/\s+/g, '').toUpperCase();
  return !wanted || wanted === principal ? '' : wanted;
}

export function filingFor(book, returnType, period, gstin) {
  const wanted = filingGstin(book, gstin);
  return (book?.filings || []).find((item) => item.returnType === returnType && item.period === period && String(item.gstin || '') === wanted) || null;
}

export function withFilings(rows, bookOf) {
  return rows.map((row) => {
    const filing = filingFor(bookOf(row.clientId), row.returnType, row.period);
    if (!filing) return row;
    return { ...row, level: 'filed', filed: { arn: filing.arn, filedOn: filing.filedOn, late: filing.filedOn > row.dueDate } };
  });
}

export function planFiling(state, args = {}, rows = []) {
  const returnType = String(args.returnType || '').trim().toUpperCase();
  const period = String(args.period || '').trim();
  if (!returnType || !period) return { ok: false, error: 'RETURN_REQUIRED' };
  const arn = String(args.arn || '').replace(/\s+/g, '').toUpperCase();
  if (!ARN.test(arn)) return { ok: false, error: 'BAD_ARN', arn };
  const today = localToday();
  const filedOn = args.filedOn == null || args.filedOn === '' ? today : postingDate(args.filedOn);
  if (!filedOn) return { ok: false, error: 'INVALID_DATE', date: args.filedOn };
  if (filedOn > today) return { ok: false, error: 'FUTURE_DATE', date: filedOn };
  const returns = rows.filter((item) => item.returnType !== 'TDS_DEPOSIT');
  const row = returns.find((item) => item.returnType === returnType && item.period === period);
  if (!row) {
    if (returnType === 'TDS_DEPOSIT') return { ok: false, error: 'DEPOSIT_NOT_A_FILING' };
    const known = [...new Set(returns.filter((item) => item.dueDate <= today).map((item) => `${item.returnLabel || item.returnType} for ${item.period}`))].slice(-6);
    return { ok: false, error: 'UNKNOWN_RETURN', returnType, period, known, registered: Boolean(state.company?.gstin) };
  }
  const gstin = filingGstin(state, args.gstin);
  if (args.gstin && !(state.company?.registrations || []).some((reg) => reg.gstin === gstin) && gstin) return { ok: false, error: 'UNKNOWN_REGISTRATION', gstin };
  const existing = filingFor(state, returnType, period, gstin);
  if (existing) return { ok: false, error: 'ALREADY_RECORDED', returnType, period, arn: existing.arn, filedOn: existing.filedOn };
  if ((state.filings || []).some((item) => item.arn === arn)) return { ok: false, error: 'ARN_USED', arn };
  const filedBy = String(args.filedBy || '').trim().slice(0, 60);
  return {
    ok: true,
    filing: { returnType, period, ...(gstin ? { gstin } : {}), label: row.returnLabel || returnType, arn, filedOn, dueDate: row.dueDate, late: filedOn > row.dueDate, filedBy, source: 'recorded' },
  };
}

export function listFilings(state) {
  const rows = [...(state.filings || [])].sort((a, b) => b.filedOn.localeCompare(a.filedOn) || b.period.localeCompare(a.period));
  return { ok: true, data: rows };
}

export function recordFiling(state, args = {}, rows = []) {
  const planned = planFiling(state, args, rows);
  if (!planned.ok) return planned;
  state.filings = state.filings || [];
  state.filings.push(planned.filing);
  return { ok: true, filing: planned.filing };
}
