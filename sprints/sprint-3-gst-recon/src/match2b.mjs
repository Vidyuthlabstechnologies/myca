function normGstin(s) {
  return String(s === null || s === undefined ? '' : s)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function normInvoiceNo(s) {
  return String(s === null || s === undefined ? '' : s)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function normDate(s) {
  return String(s === null || s === undefined ? '' : s).trim();
}

function keyOf(row) {
  const gstin = row.supplierGstin ?? row.gstin ?? '';
  const invoiceNo = row.invoiceNo ?? '';
  const invoiceDate = row.invoiceDate ?? '';
  return `${normGstin(gstin)}|${normInvoiceNo(invoiceNo)}|${normDate(invoiceDate)}`;
}

function isCdnr(section) {
  return String(section === null || section === undefined ? '' : section).toUpperCase() === 'CDNR';
}

function isPositiveSection(section) {
  const s = String(section === null || section === undefined ? '' : section).toUpperCase();
  return s === 'B2B' || s === 'B2B-URD';
}

function taxAmount(row) {
  if (Number.isFinite(row.taxableValue)) return Math.abs(row.taxableValue);
  if (Number.isFinite(row.totalValue)) return Math.abs(row.totalValue);
  return 0;
}

function scoreOf(diff) {
  return Math.round((1 / (1 + diff)) * 100) / 100;
}

export function match2B({ purchaseRegister, gstr2b, tolerance = 1 }) {
  const purchases = Array.isArray(purchaseRegister) ? purchaseRegister : [];
  const twob = Array.isArray(gstr2b) ? gstr2b : [];
  const positive = purchases.filter((p) => !p.isCreditNote);
  const creditNotePurchases = purchases.filter((p) => p.isCreditNote);
  const matched = [];
  const creditNotes = [];
  const inBooksNotIn2B = [];
  const in2BNotInBooks = [];
  const usedTwob = new Set();
  const usedCdnr = new Set();

  for (const p of positive) {
    const key = keyOf(p);
    let best = null;
    for (let i = 0; i < twob.length; i++) {
      const r = twob[i];
      if (!isPositiveSection(r.section)) continue;
      if (usedTwob.has(i)) continue;
      if (keyOf(r) !== key) continue;
      const diff = Math.abs(taxAmount(p) - taxAmount(r));
      if (best === null || diff < best.diff) best = { r, i, diff };
    }
    if (best === null) {
      inBooksNotIn2B.push(p);
      continue;
    }
    usedTwob.add(best.i);
    const exact = best.diff <= tolerance;
    matched.push({
      purchase: p,
      invoice: best.r,
      exact,
      score: scoreOf(best.diff),
      amountMismatch: !exact
    });
  }

  for (const c of creditNotePurchases) {
    const key = keyOf(c);
    let best = null;
    for (let i = 0; i < twob.length; i++) {
      const r = twob[i];
      if (!isCdnr(r.section)) continue;
      if (usedCdnr.has(i)) continue;
      if (keyOf(r) !== key) continue;
      const diff = Math.abs(taxAmount(c) - taxAmount(r));
      if (best === null || diff < best.diff) best = { r, i, diff };
    }
    if (best === null) continue;
    usedCdnr.add(best.i);
    creditNotes.push({ purchase: c, invoice: best.r });
  }

  for (let i = 0; i < twob.length; i++) {
    const r = twob[i];
    if (isCdnr(r.section)) {
      if (usedCdnr.has(i)) continue;
      if (r.totalValue > 0) in2BNotInBooks.push(r);
      else creditNotes.push({ purchase: null, invoice: r });
    } else {
      if (usedTwob.has(i)) continue;
      in2BNotInBooks.push(r);
    }
  }

  const stats = {
    purchaseInvoices: purchases.length,
    b2bInvoices: twob.filter((r) => !isCdnr(r.section)).length,
    matchedCount: matched.length,
    amountMismatchCount: matched.filter((m) => m.amountMismatch).length,
    cnCount: creditNotes.filter((c) => c.purchase !== null).length
  };

  return {
    ok: inBooksNotIn2B.length === 0,
    matched,
    creditNotes,
    unmatched: { inBooksNotIn2B, in2BNotInBooks },
    stats
  };
}