import { isBookCreditNote } from './itc-checks.mjs';

// Each head is compared on its own: a match on taxable value alone can hide
// wrong tax, and CGST+SGST against IGST means the place of supply is wrong.
const HEADS = ['taxableValue', 'cgst', 'sgst', 'igst', 'cess'];

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

function round2(v) {
  return Math.round(v * 100) / 100;
}

// Credit notes carry opposite signs in books and 2B, so heads compare as magnitudes.
// A head is compared only when both sides report it.
function headMismatches(p, r, tolerance) {
  const out = [];
  for (const head of HEADS) {
    if (!Number.isFinite(p[head]) || !Number.isFinite(r[head])) continue;
    const books = Math.abs(p[head]);
    const gstr2b = Math.abs(r[head]);
    const diff = round2(Math.abs(books - gstr2b));
    if (diff > tolerance) out.push({ head, books, gstr2b, diff });
  }
  return out;
}

function taxType(row) {
  const local = Math.abs(Number(row.cgst) || 0) + Math.abs(Number(row.sgst) || 0);
  const inter = Math.abs(Number(row.igst) || 0);
  if (local > 0 && inter === 0) return 'intra';
  if (inter > 0 && local === 0) return 'inter';
  return null;
}

function scoreOf(diff) {
  return Math.round((1 / (1 + diff)) * 100) / 100;
}

function bestMatch(row, candidates, accept, used, tolerance) {
  const key = keyOf(row);
  let best = null;
  for (let i = 0; i < candidates.length; i++) {
    const r = candidates[i];
    if (!accept(r.section) || used.has(i) || keyOf(r) !== key) continue;
    const mismatches = headMismatches(row, r, tolerance);
    const diff = round2(mismatches.reduce((s, m) => s + m.diff, 0));
    if (best === null || diff < best.diff) best = { r, i, mismatches, diff };
  }
  return best;
}

function describe(purchase, best) {
  const exact = best.mismatches.length === 0;
  const booksType = taxType(purchase);
  const twobType = taxType(best.r);
  return {
    purchase,
    invoice: best.r,
    exact,
    score: scoreOf(best.diff),
    amountMismatch: !exact,
    mismatches: best.mismatches,
    placeOfSupplyMismatch: Boolean(booksType && twobType && booksType !== twobType),
  };
}

export function match2B({ purchaseRegister, gstr2b, tolerance = 1 }) {
  const purchases = Array.isArray(purchaseRegister) ? purchaseRegister : [];
  const twob = Array.isArray(gstr2b) ? gstr2b : [];
  const matched = [];
  const creditNotes = [];
  const inBooksNotIn2B = [];
  const in2BNotInBooks = [];
  const creditNotesInBooksNotIn2B = [];
  const creditNotesIn2BNotInBooks = [];
  const used = new Set();

  for (const p of purchases) {
    const creditNote = isBookCreditNote(p);
    const best = bestMatch(p, twob, creditNote ? isCdnr : isPositiveSection, used, tolerance);
    if (best === null) {
      (creditNote ? creditNotesInBooksNotIn2B : inBooksNotIn2B).push(p);
      continue;
    }
    used.add(best.i);
    (creditNote ? creditNotes : matched).push(describe(p, best));
  }

  for (let i = 0; i < twob.length; i++) {
    if (used.has(i)) continue;
    (isCdnr(twob[i].section) ? creditNotesIn2BNotInBooks : in2BNotInBooks).push(twob[i]);
  }

  const stats = {
    purchaseInvoices: purchases.length,
    b2bInvoices: twob.filter((r) => !isCdnr(r.section)).length,
    matchedCount: matched.length,
    amountMismatchCount: matched.filter((m) => m.amountMismatch).length + creditNotes.filter((c) => c.amountMismatch).length,
    cnCount: creditNotes.length,
  };

  return {
    ok: inBooksNotIn2B.length === 0 && creditNotesInBooksNotIn2B.length === 0 && stats.amountMismatchCount === 0,
    matched,
    creditNotes,
    unmatched: { inBooksNotIn2B, in2BNotInBooks, creditNotesInBooksNotIn2B, creditNotesIn2BNotInBooks },
    stats,
  };
}
