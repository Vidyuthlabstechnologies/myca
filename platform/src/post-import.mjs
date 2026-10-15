import { createHash } from 'node:crypto';
import { createTransfers, paise } from './ledger.mjs';
import { createInvoice, createPurchase, ensureParty } from './invoice.mjs';
import { csvRows } from './text-safe.mjs';
import { isPeriodLocked } from './period-lock.mjs';
import { isoDate } from './dates.mjs';
import { rules } from './sprint-load.mjs';

function tid(state) {
  return BigInt(state.transferSeq = (state.transferSeq || 100000) + 1);
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

function financialYear(iso) {
  const day = isoDate(iso);
  if (!day) return '';
  const [y, m] = day.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

function ratesInForce(onDate) {
  const found = rules.rule('gst.rates.valid', onDate);
  return found.ok ? found.value : null;
}

// A Tally voucher amount is the gross, GST included. The rate is taken from the
// row or derived from its tax columns; it is never assumed, because assuming 18%
// adds tax on top of a tax-inclusive amount and turns an exempt sale into a taxed one.
function gstOf(row) {
  const gross = Math.abs(row.computedAmount || row.debit || row.credit || 0);
  const tax = round2(Math.abs(row.cgst || 0) + Math.abs(row.sgst || 0) + Math.abs(row.igst || 0));
  const stated = row.gstRate == null || row.gstRate === '' ? null : Number(row.gstRate);
  if (stated != null && !Number.isFinite(stated)) return { error: 'gst_rate_unreadable' };
  const valid = ratesInForce(row.date);
  if (!valid) return { error: 'gst_rates_unknown_on_date' };

  if (row.taxableValue != null && Number.isFinite(Number(row.taxableValue))) {
    const taxable = round2(Math.abs(Number(row.taxableValue)));
    const rate = stated != null ? stated : (taxable > 0 ? round2((tax / taxable) * 100) : 0);
    return valid.includes(rate) ? { taxable, rate } : { error: `rate_not_in_force:${rate}` };
  }
  if (tax > 0) {
    const taxable = round2(gross - tax);
    if (taxable <= 0) return { error: 'tax_exceeds_amount' };
    const derived = round2((tax / taxable) * 100);
    const rate = stated != null ? stated : derived;
    if (!valid.includes(rate)) return { error: `rate_not_in_force:${rate}` };
    if (Math.abs(round2((taxable * rate) / 100) - tax) > 1) return { error: 'tax_does_not_match_rate' };
    return { taxable, rate };
  }
  if (stated == null) return { error: 'gst_rate_unknown' };
  if (!valid.includes(stated)) return { error: `rate_not_in_force:${stated}` };
  return { taxable: round2(gross / (1 + stated / 100)), rate: stated };
}

// Re-importing the same file must not post it twice. Sales and purchases carry a
// voucher id that includes the financial year, because Tally voucher numbers restart
// each year; receipts and payments are matched against transfers already in the ledger.
function postedVoucherIds(state) {
  const seen = new Set();
  for (const t of state.ledger?.transfers || []) {
    if (t.invoiceId) seen.add(`${t.code || ''}|${t.invoiceId}`);
  }
  return seen;
}

function documentExists(list, id, legacyId, date) {
  return (list || []).some((d) => d.id === id || (d.id === legacyId && d.date === date));
}

export function postTallyRows(state, rows) {
  const posted = [];
  const skipped = [];
  const ledgerKeys = postedVoucherIds(state);
  for (const row of rows) {
    if (row._blocking) {
      skipped.push({ voucherNo: row.voucherNo, reason: 'blocking' });
      continue;
    }
    if (isPeriodLocked(state, row.date)) {
      skipped.push({ voucherNo: row.voucherNo, reason: 'period_locked' });
      continue;
    }
    const type = String(row.voucherType || '').toLowerCase();
    const fy = financialYear(row.date);
    const ref = row.voucherNo || row.sourceRow;
    const vid = `TALLY-${fy || 'NOFY'}-${ref}`;
    const legacyVid = `TALLY-${ref}`;
    let taxable = 0;
    let gstRate = 0;
    if (type === 'sales' || type === 'purchase') {
      const gst = gstOf(row);
      if (gst.error) {
        skipped.push({ voucherNo: row.voucherNo, reason: gst.error });
        continue;
      }
      taxable = gst.taxable;
      gstRate = gst.rate;
      if (taxable <= 0) {
        skipped.push({ voucherNo: row.voucherNo, reason: 'zero' });
        continue;
      }
    }
    if (type === 'sales') {
      if (documentExists(state.invoices, vid, legacyVid, row.date)) {
        skipped.push({ voucherNo: row.voucherNo, reason: 'exists' });
        continue;
      }
      const r = createInvoice(state, {
        id: vid,
        partyState: row.partyState || '',
        date: row.date,
        partyName: row.ledger || 'Customer',
        partyGstin: row.gstin || '',
        lines: [{ description: row.narration || 'Sale', hsn: row.hsn || '0000', qty: 1, rate: taxable, gstRate }],
      });
      posted.push(r);
      continue;
    }
    if (type === 'purchase') {
      if (documentExists(state.purchases, vid, legacyVid, row.date)) {
        skipped.push({ voucherNo: row.voucherNo, reason: 'exists' });
        continue;
      }
      const r = createPurchase(state, {
        id: vid,
        date: row.date,
        partyName: row.ledger || 'Supplier',
        partyGstin: row.gstin || '',
        lines: [{ description: row.narration || 'Purchase', hsn: row.hsn || '', qty: 1, rate: taxable, gstRate }],
      });
      posted.push(r);
      continue;
    }
    if (type === 'receipt') {
      const amt = Math.abs(row.credit || row.computedAmount || 0);
      if (!amt) {
        skipped.push({ voucherNo: row.voucherNo, reason: 'zero' });
        continue;
      }
      if (ledgerKeys.has(`TALLY-RECEIPT|${vid}`) || ledgerKeys.has(`TALLY-RECEIPT|${legacyVid}`)) {
        skipped.push({ voucherNo: row.voucherNo, reason: 'exists' });
        continue;
      }
      const party = ensureParty(state, { name: row.ledger || 'Customer', gstin: row.gstin || '' });
      const t = createTransfers(state.ledger, [{
        id: tid(state),
        debitAccountId: 1002,
        creditAccountId: party.accountId,
        amount: paise(amt),
        code: 'TALLY-RECEIPT',
        invoiceId: vid,
        userData: isoDate(row.date) || 0,
      }]);
      ledgerKeys.add(`TALLY-RECEIPT|${vid}`);
      posted.push({ ok: t[0].ok, posted: t });
      continue;
    }
    if (type === 'payment') {
      const amt = Math.abs(row.debit || row.computedAmount || 0);
      if (!amt) {
        skipped.push({ voucherNo: row.voucherNo, reason: 'zero' });
        continue;
      }
      if (ledgerKeys.has(`TALLY-PAYMENT|${vid}`) || ledgerKeys.has(`TALLY-PAYMENT|${legacyVid}`)) {
        skipped.push({ voucherNo: row.voucherNo, reason: 'exists' });
        continue;
      }
      const t = createTransfers(state.ledger, [{
        id: tid(state),
        debitAccountId: 5100,
        creditAccountId: 1002,
        amount: paise(amt),
        code: 'TALLY-PAYMENT',
        invoiceId: vid,
        userData: isoDate(row.date) || 0,
      }]);
      ledgerKeys.add(`TALLY-PAYMENT|${vid}`);
      posted.push({ ok: t[0].ok, posted: t });
      continue;
    }
    skipped.push({ voucherNo: row.voucherNo, reason: `unposted:${type || row.direction}` });
  }
  return { posted: posted.filter((p) => p.ok !== false).length, failed: posted.filter((p) => p.ok === false).length, skipped };
}

const BANK_CREDIT = { sales: 4000, rent_income: 4000, interest_income: 4000, loan_capital_in: 3000 };
const BANK_DEBIT = { purchases: 5000, salary: 5100, rent_expense: 5100, tax_payment: 2100, utilities: 5100, professional_fees: 5100 };

// A bank row has no id of its own, so it is fingerprinted by what the statement
// shows. Identical rows inside one file keep their own occurrence number, so a
// genuine repeat posts once per occurrence but a re-imported file posts nothing.
function bankFingerprint(row, side, amount, seenInFile) {
  const parts = [isoDate(row.date) || String(row.date || ''), side, amount.toFixed(2), String(row.balance ?? ''), String(row.narration || row.description || '')];
  const base = createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
  const nth = (seenInFile.get(base) || 0) + 1;
  seenInFile.set(base, nth);
  return `BANK-${base}-${nth}`;
}

export function postBankRows(state, rows) {
  let posted = 0;
  const skipped = [];
  const ledgerKeys = postedVoucherIds(state);
  const seenInFile = new Map();
  for (const row of rows) {
    if (row._blocking || row.type === 'balance-only') {
      skipped.push({ sourceRow: row.sourceRow, reason: row.type || 'blocking' });
      continue;
    }
    if (isPeriodLocked(state, row.date)) {
      skipped.push({ sourceRow: row.sourceRow, reason: 'period_locked' });
      continue;
    }
    const cat = row.classification?.category;
    if (row.type === 'credit' || (row.credit && row.credit > 0)) {
      const creditId = BANK_CREDIT[cat] || 1100;
      const amt = Math.abs(row.credit || row.amount || 0);
      if (!amt) {
        skipped.push({ sourceRow: row.sourceRow, reason: 'zero' });
        continue;
      }
      const fingerprint = bankFingerprint(row, 'in', amt, seenInFile);
      if (ledgerKeys.has(`BANK|${fingerprint}`)) {
        skipped.push({ sourceRow: row.sourceRow, reason: 'exists' });
        continue;
      }
      ledgerKeys.add(`BANK|${fingerprint}`);
      const t = createTransfers(state.ledger, [{
        id: tid(state),
        debitAccountId: 1002,
        creditAccountId: creditId,
        amount: paise(amt),
        code: 'BANK',
        invoiceId: fingerprint,
        userData: isoDate(row.date) || 0,
      }]);
      if (t[0]?.ok) posted += 1;
      else skipped.push({ sourceRow: row.sourceRow, reason: t[0]?.error || 'ledger_reject' });
    } else if (row.type === 'debit' || (row.debit && row.debit > 0)) {
      const debitId = BANK_DEBIT[cat] || 5100;
      const amt = Math.abs(row.debit || row.amount || 0);
      if (!amt) {
        skipped.push({ sourceRow: row.sourceRow, reason: 'zero' });
        continue;
      }
      const fingerprint = bankFingerprint(row, 'out', amt, seenInFile);
      if (ledgerKeys.has(`BANK|${fingerprint}`)) {
        skipped.push({ sourceRow: row.sourceRow, reason: 'exists' });
        continue;
      }
      ledgerKeys.add(`BANK|${fingerprint}`);
      const t = createTransfers(state.ledger, [{
        id: tid(state),
        debitAccountId: debitId,
        creditAccountId: 1002,
        amount: paise(amt),
        code: 'BANK',
        invoiceId: fingerprint,
        userData: isoDate(row.date) || 0,
      }]);
      if (t[0]?.ok) posted += 1;
      else skipped.push({ sourceRow: row.sourceRow, reason: t[0]?.error || 'ledger_reject' });
    } else {
      skipped.push({ sourceRow: row.sourceRow, reason: 'no-side' });
    }
  }
  return { posted, skipped };
}

function dmy(iso) {
  if (!iso || iso.length < 10) return iso || '';
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

export function purchaseRegisterCsv(purchases) {
  const rows = [['GSTIN', 'SUPPLIER NAME', 'INVOICE NO', 'INVOICE DATE', 'TAXABLE VALUE', 'CGST', 'SGST', 'IGST', 'TOTAL VALUE', 'AMOUNT PAID', 'PAYMENT DATE']];
  for (const p of purchases || []) {
    const payments = Array.isArray(p.payments) ? p.payments : [];
    const paid = Math.round(payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0) * 100) / 100;
    const lastPaid = payments.map((payment) => payment.date).filter(Boolean).sort().at(-1) || '';
    rows.push([p.partyGstin, p.partyName, p.supplierInvoiceNo || p.id, dmy(p.date), p.taxable, p.cgst, p.sgst, p.igst, p.total, paid, lastPaid ? dmy(lastPaid) : '']);
  }
  return csvRows(rows);
}
