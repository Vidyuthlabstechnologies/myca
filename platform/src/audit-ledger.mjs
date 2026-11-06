import { csvRows } from './text-safe.mjs';
import { isTdsReceipt } from './tds-credits.mjs';

const HEADER = ['clientId', 'date', 'narration', 'debit', 'credit', 'party', 'category', 'tdsSection'];
const HEAD_CATEGORY = { 5110: 'rent', 5120: 'salary', 5150: 'travel', 5160: 'repairs', 5170: 'fees', 5180: 'bank_charges' };

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

function row(clientId, date, narration, debit, credit, party, category, tdsSection = '') {
  return [clientId, String(date || ''), String(narration || '').slice(0, 200), debit == null ? '' : round2(debit), credit == null ? '' : round2(credit), String(party || ''), category, tdsSection];
}

export function booksAuditRows(state) {
  const clientId = String(state.activeClientId || 'SELF');
  const rows = [];
  for (const inv of state.invoices || []) {
    if (inv.status === 'cancelled' || inv.cancelledOn) continue;
    rows.push(row(clientId, inv.date, `${inv.id} sale`, null, inv.total, inv.partyName, 'sales'));
    for (const receipt of inv.receipts || []) rows.push(row(clientId, receipt.date, `${inv.id} ${isTdsReceipt(receipt) ? 'TDS withheld' : 'received'}`, receipt.amount, null, inv.partyName, 'receipt'));
  }
  for (const note of state.creditNotes || []) rows.push(row(clientId, note.date, `${note.id} credit note`, note.total, null, note.partyName, 'sales'));
  for (const bill of state.purchases || []) {
    rows.push(row(clientId, bill.date, `${bill.id} purchase`, bill.total, null, bill.partyName, 'purchase', bill.tds?.section || ''));
    for (const payment of bill.payments || []) rows.push(row(clientId, payment.date, `${bill.id} paid`, null, payment.amount, bill.partyName, 'payment'));
  }
  for (const expense of state.expenses || []) {
    const category = HEAD_CATEGORY[Number(expense.head)] || 'misc';
    rows.push(row(clientId, expense.date, `${expense.id} ${expense.description || expense.headName || ''}`, expense.amount, null, expense.payee || '', category, expense.tds?.section || ''));
  }
  for (const run of Object.values(state.payrollRuns || {})) {
    if (!run || run.status !== 'approved') continue;
    const net = (run.lines || run.employees || []).reduce((sum, line) => sum + Number(line.netPay ?? line.net ?? 0), 0);
    if (net > 0) rows.push(row(clientId, run.paidOn || run.approvedOn || `${run.period}-28`, `Payroll ${run.period}`, net, null, '', 'salary'));
  }
  rows.sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  return rows;
}

export function booksAuditLedger(state) {
  const rows = booksAuditRows(state);
  if (!rows.length) return { ok: false, error: 'NO_ENTRIES', hint: 'The books have no sales, purchases, expenses or receipts yet, so there is nothing to audit.' };
  return { ok: true, text: csvRows([HEADER, ...rows]), rows: rows.length };
}
