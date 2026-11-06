import { csvRows } from './text-safe.mjs';
import { isReturnPeriod, periodOf } from './return-period.mjs';
import { localToday } from './dates.mjs';
import { countryOf } from './country.mjs';

export const HEADER = ['date', 'type', 'number', 'party', 'party_gstin', 'head', 'description', 'taxable', 'cgst', 'sgst', 'igst', 'total', 'paid_by', 'refers_to'];
export const HEADER_US = ['date', 'type', 'number', 'party', 'account', 'description', 'subtotal', 'sales_tax', 'total', 'paid_by', 'refers_to'];

export function usRow(row) {
  const tax = Math.round(((Number(row[8]) || 0) + (Number(row[9]) || 0) + (Number(row[10]) || 0)) * 100) / 100;
  return [row[0], row[1], row[2], row[3], row[5], row[6], row[7], tax, row[11], row[12], row[13]];
}

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

function describe(lines = []) {
  return lines.map((line) => line.description).filter(Boolean).join('; ');
}

export function rowsFor(state, period) {
  const inPeriod = (doc) => periodOf(doc?.date) === period;
  const rows = [];
  for (const inv of (state.invoices || []).filter(inPeriod)) {
    rows.push([inv.date, inv.status === 'cancelled' ? 'Sale (cancelled)' : 'Sale', inv.id, inv.partyName, inv.partyGstin || '', 'Sales', describe(inv.lines), round2(inv.taxable), round2(inv.cgst), round2(inv.sgst), round2(inv.igst), round2(inv.total), '', '']);
    for (const receipt of inv.receipts || []) {
      if (periodOf(receipt.date) !== period) continue;
      rows.push([receipt.date, 'Receipt', '', inv.partyName, inv.partyGstin || '', '', '', '', '', '', '', round2(receipt.amount), receipt.mode || 'bank', inv.id]);
    }
  }
  for (const inv of state.invoices || []) {
    if (inPeriod(inv)) continue;
    for (const receipt of inv.receipts || []) {
      if (periodOf(receipt.date) !== period) continue;
      rows.push([receipt.date, 'Receipt', '', inv.partyName, inv.partyGstin || '', '', '', '', '', '', '', round2(receipt.amount), receipt.mode || 'bank', inv.id]);
    }
  }
  for (const note of (state.creditNotes || []).filter(inPeriod)) {
    rows.push([note.date, note.cancels ? 'Cancellation' : 'Credit note', note.id, note.partyName, note.partyGstin || '', 'Sales', note.reason, round2(-note.taxable), round2(-note.cgst), round2(-note.sgst), round2(-note.igst), round2(-note.total), '', note.invoiceId]);
  }
  for (const note of (state.debitNotes || []).filter(inPeriod)) {
    rows.push([note.date, 'Debit note', note.id, note.partyName, note.partyGstin || '', 'Sales', note.reason, round2(note.taxable), round2(note.cgst), round2(note.sgst), round2(note.igst), round2(note.total), '', note.invoiceId]);
  }
  for (const note of (state.purchaseNotes || []).filter(inPeriod)) {
    rows.push([note.date, 'Debit note to supplier', note.id, note.partyName, note.partyGstin || '', 'Purchases', note.reason, round2(-note.taxable), round2(-note.cgst), round2(-note.sgst), round2(-note.igst), round2(-note.total), '', note.billId]);
  }
  for (const bill of (state.purchases || []).filter(inPeriod)) {
    rows.push([bill.date, 'Purchase', bill.id, bill.partyName, bill.partyGstin || '', 'Purchases', describe(bill.lines), round2(bill.taxable), round2(bill.cgst), round2(bill.sgst), round2(bill.igst), round2(bill.total), '', '']);
  }
  for (const expense of (state.expenses || []).filter(inPeriod)) {
    rows.push([expense.date, 'Expense', expense.id, expense.payee || '', expense.supplierGstin || '', expense.headName, expense.description, round2(expense.taxable), round2(expense.cgst), round2(expense.sgst), round2(expense.igst), round2(expense.amount), expense.mode, '']);
  }
  return rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[2]).localeCompare(String(b[2])));
}

export function exportEntries(state, { period } = {}) {
  const wanted = String(period || '').trim() || localToday().slice(0, 7);
  if (!isReturnPeriod(wanted)) return { ok: false, error: 'INVALID_PERIOD', hint: 'Use YYYY-MM, for example 2026-09.' };
  const rows = rowsFor(state, wanted);
  const gstin = String(state.company?.gstin || '').trim();
  const us = countryOf(state) === 'US';
  return {
    ok: true,
    data: {
      period: wanted,
      count: rows.length,
      fileName: `entries_${gstin || 'books'}_${wanted}.csv`,
      csv: us ? csvRows([HEADER_US, ...rows.map(usRow)]) : csvRows([HEADER, ...rows]),
    },
  };
}
