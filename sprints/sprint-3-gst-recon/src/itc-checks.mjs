/**
 * Input tax credit checks, each named for the provision it applies.
 *
 *   checkItcAvailability  Section 16(2)(aa): credit only for invoices the supplier has
 *                         reported and GSTR-2B shows as available.
 *   flagRule37            Rule 37: value and tax not paid to the supplier within
 *                         180 days of the invoice date; the proportionate credit is reversed.
 *   flagRule37A           Rule 37A: the supplier has not filed GSTR-3B for the period by
 *                         30 September after the financial year; reverse by 30 November.
 *
 * Amounts are the tax (CGST + SGST + IGST + cess), never the invoice value.
 * Credit notes reduce credit, so they carry a negative sign.
 */
import { rule } from '../../statutory-rules/src/index.mjs';

function round2(value) {
  return Math.round(value * 100) / 100;
}

function normalizeGstin(value) {
  return String(value == null ? '' : value).toUpperCase().replace(/\s+/g, '');
}

function normalizeInvoiceNo(value) {
  return String(value == null ? '' : value).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function matchKey(gstin, invoiceNo) {
  return `${normalizeGstin(gstin)}|${normalizeInvoiceNo(invoiceNo)}`;
}

export function itcOf(row) {
  return round2(['cgst', 'sgst', 'igst', 'cess'].reduce((sum, head) => sum + (Number(row?.[head]) || 0), 0));
}

// A credit note is known from its values or an explicit flag, never from a "CN" prefix.
export function isBookCreditNote(purchase) {
  if (purchase.isCreditNote === true) return true;
  return (Number(purchase.taxableValue) || 0) < 0 || (Number(purchase.totalValue) || 0) < 0;
}

function isCdnr(row) {
  return String(row.section || '').toUpperCase() === 'CDNR';
}

function negative(amount) {
  return -Math.abs(amount);
}

export function checkItcAvailability({ purchaseRegister = [], gstr2b = [] }) {
  const blocked = [];
  const unclaimed = [];
  const creditNotesNotBooked = [];
  const bookedKeys = new Set(purchaseRegister.map((p) => matchKey(p.gstin, p.invoiceNo)));
  const b2bByKey = new Map();
  for (const invoice of gstr2b) {
    if (isCdnr(invoice)) continue;
    const key = matchKey(invoice.supplierGstin, invoice.invoiceNo);
    if (!b2bByKey.has(key)) b2bByKey.set(key, []);
    b2bByKey.get(key).push(invoice);
  }

  let eligible = 0;
  for (const purchase of purchaseRegister) {
    const bookItc = itcOf(purchase);
    if (isBookCreditNote(purchase)) {
      eligible += negative(bookItc);
      continue;
    }
    const matches = b2bByKey.get(matchKey(purchase.gstin, purchase.invoiceNo)) || [];
    const available = matches.find((invoice) => invoice.itcAvailability === 'Y');
    if (available) {
      // Credit cannot exceed what the supplier reported.
      eligible += Math.min(bookItc, itcOf(available));
      continue;
    }
    blocked.push({
      purchase,
      invoice: matches[0] || null,
      code: matches.length ? 'ITC_NOT_AVAILABLE_IN_2B' : 'NOT_IN_2B',
      section: 'Section 16(2)(aa)',
      reason: matches.length
        ? 'GSTR-2B shows this credit as not available, so it cannot be claimed'
        : 'Invoice absent from GSTR-2B, so the credit cannot be claimed until the supplier reports it',
      blockedCredit: bookItc,
    });
  }

  for (const invoice of gstr2b) {
    if (bookedKeys.has(matchKey(invoice.supplierGstin, invoice.invoiceNo))) continue;
    if (isCdnr(invoice)) {
      const itcReduction = negative(itcOf(invoice));
      eligible += itcReduction;
      creditNotesNotBooked.push({ invoice, itcReduction });
    } else if (invoice.itcAvailability === 'Y') {
      unclaimed.push({ invoice, unclaimedCredit: itcOf(invoice) });
    }
  }

  return {
    blocked,
    unclaimed,
    creditNotesNotBooked,
    summary: {
      blockedCount: blocked.length,
      totalBlockedCredit: round2(blocked.reduce((sum, entry) => sum + entry.blockedCredit, 0)),
      unclaimedCount: unclaimed.length,
      totalUnclaimedCredit: round2(unclaimed.reduce((sum, entry) => sum + entry.unclaimedCredit, 0)),
      creditNotesNotBookedCount: creditNotesNotBooked.length,
      totalCreditNoteReduction: round2(creditNotesNotBooked.reduce((sum, entry) => sum + entry.itcReduction, 0)),
      eligibleItc: round2(eligible),
    },
  };
}

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function nextMonth(iso) {
  const [y, m] = iso.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

function fyEndYear(iso) {
  const [y, m] = iso.split('-').map(Number);
  return m >= 4 ? y + 1 : y;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function flagRule37({ purchaseRegister = [], asOfDate, tolerance = 1 }) {
  const reverse = [];
  const unknown = [];
  if (!ISO_RE.test(String(asOfDate || ''))) return { error: 'AS_OF_DATE_REQUIRED', reverse, unknown };
  for (const purchase of purchaseRegister) {
    if (isBookCreditNote(purchase) || !ISO_RE.test(String(purchase.invoiceDate || ''))) continue;
    const days = rule('gst.rule37.payment-days', purchase.invoiceDate);
    if (!days.ok) continue;
    const deadline = addDays(purchase.invoiceDate, days.value);
    if (asOfDate <= deadline) continue;
    if (purchase.paidValue == null) {
      unknown.push({ purchase, deadline, code: 'PAYMENT_STATUS_UNKNOWN' });
      continue;
    }
    const total = Number(purchase.totalValue) || 0;
    const paidInTime = purchase.paymentDate && purchase.paymentDate <= deadline ? Number(purchase.paidValue) || 0 : 0;
    const unpaid = round2(Math.max(0, total - paidInTime));
    if (unpaid <= tolerance || total <= 0) continue;
    reverse.push({
      purchase,
      deadline,
      unpaidValue: unpaid,
      reversalItc: round2((itcOf(purchase) * unpaid) / total),
      reverseInReturnFor: nextMonth(deadline),
      section: 'Section 16(2) second proviso; Rule 37',
      rulesUsed: [`gst.rule37.payment-days@${purchase.invoiceDate}`],
    });
  }
  return {
    reverse,
    unknown,
    summary: { reverseCount: reverse.length, totalReversalItc: round2(reverse.reduce((s, r) => s + r.reversalItc, 0)), unknownCount: unknown.length },
  };
}

// supplierFilings: [{ gstin, period: 'YYYY-MM', filedOn: 'YYYY-MM-DD' | null }]
export function flagRule37A({ purchaseRegister = [], supplierFilings, asOfDate }) {
  const reverse = [];
  const atRisk = [];
  const unknown = [];
  if (!ISO_RE.test(String(asOfDate || ''))) return { checked: false, error: 'AS_OF_DATE_REQUIRED', reverse, atRisk, unknown };
  if (!Array.isArray(supplierFilings)) {
    return { checked: false, reason: 'SUPPLIER_GSTR3B_STATUS_NOT_PROVIDED', reverse, atRisk, unknown, summary: { reverseCount: 0, totalReversalItc: 0, atRiskCount: 0, unknownCount: 0 } };
  }
  const filings = new Map(supplierFilings.map((f) => [`${normalizeGstin(f.gstin)}|${f.period}`, f]));
  for (const purchase of purchaseRegister) {
    if (isBookCreditNote(purchase) || !ISO_RE.test(String(purchase.invoiceDate || ''))) continue;
    const period = purchase.invoiceDate.slice(0, 7);
    const endYear = fyEndYear(purchase.invoiceDate);
    const deadlines = rule('gst.rule37a.deadlines', `${endYear}-09-30`);
    if (!deadlines.ok) continue;
    const pad = (n) => String(n).padStart(2, '0');
    const supplierBy = `${endYear}-${pad(deadlines.value.supplierGstr3bBy.month)}-${pad(deadlines.value.supplierGstr3bBy.day)}`;
    const reverseBy = `${endYear}-${pad(deadlines.value.reverseBy.month)}-${pad(deadlines.value.reverseBy.day)}`;
    const entry = { purchase, period, supplierBy, reverseBy, reversalItc: itcOf(purchase), section: 'Rule 37A', rulesUsed: [`gst.rule37a.deadlines@${endYear}-09-30`] };
    const filing = filings.get(`${normalizeGstin(purchase.gstin)}|${period}`);
    if (!filing) unknown.push({ ...entry, code: 'SUPPLIER_FILING_UNKNOWN' });
    else if (filing.filedOn && filing.filedOn <= supplierBy) continue;
    else if (asOfDate > supplierBy) reverse.push({ ...entry, code: 'SUPPLIER_GSTR3B_NOT_FILED' });
    else atRisk.push({ ...entry, code: 'SUPPLIER_GSTR3B_PENDING' });
  }
  return {
    checked: true,
    reverse,
    atRisk,
    unknown,
    summary: {
      reverseCount: reverse.length,
      totalReversalItc: round2(reverse.reduce((s, r) => s + r.reversalItc, 0)),
      atRiskCount: atRisk.length,
      unknownCount: unknown.length,
    },
  };
}
