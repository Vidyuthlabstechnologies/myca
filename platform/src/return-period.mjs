const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isReturnPeriod(value) {
  return PERIOD.test(String(value ?? ''));
}

export function periodOf(date) {
  const text = String(date ?? '');
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && isReturnPeriod(text.slice(0, 7)) ? text.slice(0, 7) : '';
}

export function fpOf(period) {
  return isReturnPeriod(period) ? `${period.slice(5, 7)}${period.slice(0, 4)}` : '';
}

export function periodsWithDocuments(state) {
  return periodsOf([...(state.invoices || []), ...(state.purchases || []), ...(state.creditNotes || [])]);
}

function periodsOf(documents) {
  const seen = new Set();
  for (const doc of documents) {
    const period = periodOf(doc?.date);
    if (period) seen.add(period);
  }
  return [...seen].sort();
}

// A GST return covers one tax period. Every return figure is built from the documents
// of that month only; without this, a later month's invoices were added into an earlier
// month's draft. With no period asked for, the latest month that has documents is used.
export function documentsForPeriod(state, requested, fallback = '') {
  const periods = periodsWithDocuments(state);
  if (requested != null && requested !== '' && !isReturnPeriod(requested)) {
    return { ok: false, error: 'INVALID_PERIOD', hint: 'Use YYYY-MM, for example 2026-09.', periods };
  }
  const period = requested || periods.at(-1) || (isReturnPeriod(fallback) ? fallback : '');
  const inPeriod = (doc) => periodOf(doc?.date) === period;
  return {
    ok: true,
    period,
    periods,
    invoices: (state.invoices || []).filter(inPeriod),
    purchases: (state.purchases || []).filter(inPeriod),
    creditNotes: (state.creditNotes || []).filter(inPeriod),
  };
}

function paise(amount) {
  return Math.round(Number(amount || 0) * 100);
}

export function taxByHead(igst, cgst, sgst) {
  const heads = { igst: Number(igst || 0), cgst: Number(cgst || 0), sgst: Number(sgst || 0) };
  return { ...heads, total: (paise(heads.igst) + paise(heads.cgst) + paise(heads.sgst)) / 100 };
}
