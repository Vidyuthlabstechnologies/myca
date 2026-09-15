import { createTransfers, paise } from './ledger.mjs';
import { createInvoice, createPurchase, ensureParty } from './invoice.mjs';
import { csvRows } from './text-safe.mjs';

function tid(state) {
  return BigInt(state.transferSeq = (state.transferSeq || 100000) + 1);
}

function taxableOf(row) {
  const tax = (row.cgst || 0) + (row.sgst || 0) + (row.igst || 0);
  const gross = Math.abs(row.computedAmount || row.debit || row.credit || 0);
  if (row.taxableValue != null) return row.taxableValue;
  if (tax > 0) return Math.round((gross - tax) * 100) / 100;
  const rate = row.gstRate || 0;
  if (rate) return Math.round((gross / (1 + rate / 100)) * 100) / 100;
  return gross;
}

export function postTallyRows(state, rows) {
  const posted = [];
  const skipped = [];
  for (const row of rows) {
    if (row._blocking) {
      skipped.push({ voucherNo: row.voucherNo, reason: 'blocking' });
      continue;
    }
    const type = String(row.voucherType || '').toLowerCase();
    const gstRate = row.gstRate || 18;
    const taxable = taxableOf(row);
    if (taxable <= 0 && type !== 'journal' && type !== 'contra') {
      skipped.push({ voucherNo: row.voucherNo, reason: 'zero' });
      continue;
    }
    if (type === 'sales') {
      if ((state.invoices || []).some((i) => i.id === `TALLY-${row.voucherNo}`)) {
        skipped.push({ voucherNo: row.voucherNo, reason: 'exists' });
        continue;
      }
      const r = createInvoice(state, {
        id: `TALLY-${row.voucherNo || row.sourceRow}`,
        date: row.date,
        partyName: row.ledger || 'Customer',
        partyGstin: row.gstin || '',
        lines: [{ description: row.narration || 'Sale', hsn: row.hsn || '0000', qty: 1, rate: taxable, gstRate }],
      });
      posted.push(r);
      continue;
    }
    if (type === 'purchase') {
      const r = createPurchase(state, {
        id: `TALLY-${row.voucherNo || row.sourceRow}`,
        date: row.date,
        partyName: row.ledger || 'Supplier',
        partyGstin: row.gstin || '',
        lines: [{ description: row.narration || 'Purchase', hsn: row.hsn || '0000', qty: 1, rate: taxable, gstRate }],
      });
      posted.push(r);
      continue;
    }
    if (type === 'receipt') {
      const party = ensureParty(state, { name: row.ledger || 'Customer', gstin: row.gstin || '' });
      const amt = Math.abs(row.credit || row.computedAmount || 0);
      posted.push({
        ok: true,
        posted: createTransfers(state.ledger, [{
          id: tid(state),
          debitAccountId: 1002,
          creditAccountId: party.accountId,
          amount: paise(amt),
          code: 'TALLY-RECEIPT',
          invoiceId: row.voucherNo,
        }]),
      });
      continue;
    }
    if (type === 'payment') {
      const amt = Math.abs(row.debit || row.computedAmount || 0);
      posted.push({
        ok: true,
        posted: createTransfers(state.ledger, [{
          id: tid(state),
          debitAccountId: 5100,
          creditAccountId: 1002,
          amount: paise(amt),
          code: 'TALLY-PAYMENT',
          invoiceId: row.voucherNo,
        }]),
      });
      continue;
    }
    skipped.push({ voucherNo: row.voucherNo, reason: `unposted:${type || row.direction}` });
  }
  return { posted: posted.filter((p) => p.ok !== false).length, failed: posted.filter((p) => p.ok === false).length, skipped };
}

const BANK_CREDIT = { sales: 4000, rent_income: 4000, interest_income: 4000, loan_capital_in: 3000 };
const BANK_DEBIT = { purchases: 5000, salary: 5100, rent_expense: 5100, tax_payment: 2100, utilities: 5100, professional_fees: 5100 };

export function postBankRows(state, rows) {
  let posted = 0;
  const skipped = [];
  for (const row of rows) {
    if (row._blocking || row.type === 'balance-only') {
      skipped.push({ sourceRow: row.sourceRow, reason: row.type || 'blocking' });
      continue;
    }
    const cat = row.classification?.category;
    if (row.type === 'credit' || (row.credit && row.credit > 0)) {
      const creditId = BANK_CREDIT[cat] || 1100;
      const amt = Math.abs(row.credit || row.amount || 0);
      if (!amt) continue;
      createTransfers(state.ledger, [{
        id: tid(state),
        debitAccountId: 1002,
        creditAccountId: creditId,
        amount: paise(amt),
        code: `BANK-${cat || 'in'}`,
      }]);
      posted += 1;
    } else if (row.type === 'debit' || (row.debit && row.debit > 0)) {
      const debitId = BANK_DEBIT[cat] || 5100;
      const amt = Math.abs(row.debit || row.amount || 0);
      if (!amt) continue;
      createTransfers(state.ledger, [{
        id: tid(state),
        debitAccountId: debitId,
        creditAccountId: 1002,
        amount: paise(amt),
        code: `BANK-${cat || 'out'}`,
      }]);
      posted += 1;
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
  const rows = [['GSTIN', 'SUPPLIER NAME', 'INVOICE NO', 'INVOICE DATE', 'TAXABLE VALUE', 'CGST', 'SGST', 'IGST', 'TOTAL VALUE']];
  for (const p of purchases || []) {
    rows.push([p.partyGstin, p.partyName, p.id, dmy(p.date), p.taxable, p.cgst, p.sgst, p.igst, p.total]);
  }
  return csvRows(rows);
}
