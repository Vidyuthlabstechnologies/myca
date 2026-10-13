import { localToday } from './dates.mjs';
import { isReturnPeriod, periodOf } from './return-period.mjs';
import { outstandingOf } from './credit-notes.mjs';
import { salaryPrivate } from './employees.mjs';
import { overdueBy } from './payment-terms.mjs';
import { billOutstanding } from './invoice.mjs';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

function previousPeriod(period) {
  const [year, month] = period.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function sumOf(documents, key) {
  return { count: documents.length, total: round2(documents.reduce((sum, doc) => sum + Number(doc[key] || 0), 0)) };
}

function monthFigures(state, period) {
  const inPeriod = (doc) => periodOf(doc?.date) === period;
  const sales = sumOf((state.invoices || []).filter(inPeriod), 'total');
  const creditNotes = sumOf((state.creditNotes || []).filter(inPeriod), 'total');
  const debitNotes = sumOf((state.debitNotes || []).filter(inPeriod), 'total');
  const purchaseNotes = sumOf((state.purchaseNotes || []).filter(inPeriod), 'total');
  return {
    sales: { ...sales, net: round2(sales.total - creditNotes.total + debitNotes.total) },
    creditNotes,
    debitNotes,
    purchaseNotes,
    purchases: sumOf((state.purchases || []).filter(inPeriod), 'total'),
    expenses: sumOf((state.expenses || []).filter(inPeriod), 'amount'),
    payroll: payrollFigures(state, period),
  };
}

function payrollFigures(state, period) {
  if (salaryPrivate(state)) return null;
  const run = state.payrollRuns && typeof state.payrollRuns === 'object' && Object.hasOwn(state.payrollRuns, period) ? state.payrollRuns[period] : null;
  if (!run || run.status !== 'approved') return { status: (state.employees || []).some((e) => !e.leftOn) ? 'draft' : 'none', employees: 0, gross: 0, net: 0, employerCost: 0, paidOn: '' };
  const minor = (key) => run.totals[`${key}Paise`] ?? run.totals[`${key}Cents`] ?? 0;
  return { status: 'approved', employees: run.employees, gross: round2(minor('gross') / 100), net: round2(minor('net') / 100), employerCost: round2(minor('employerCost') / 100), paidOn: run.paidOn || '' };
}

export function businessSummary(state, { period } = {}) {
  const requested = String(period || '').trim();
  if (requested && !isReturnPeriod(requested)) return { ok: false, error: 'INVALID_PERIOD', hint: 'Use YYYY-MM, for example 2026-10.' };
  const current = requested || localToday().slice(0, 7);
  const previous = previousPeriod(current);
  const open = (state.invoices || []).filter((invoice) => invoice.status !== 'cancelled').map((invoice) => ({ invoice, due: outstandingOf(state, invoice) })).filter((item) => item.due > 0.005);
  const byCustomer = new Map();
  for (const { invoice, due } of open) {
    const key = String(invoice.partyName || '').trim().toLowerCase();
    const row = byCustomer.get(key) || { name: invoice.partyName, due: 0, invoices: 0 };
    row.due = round2(row.due + due);
    row.invoices += 1;
    byCustomer.set(key, row);
  }
  const customers = [...byCustomer.values()].sort((a, b) => b.due - a.due);
  const unpaidBills = (state.purchases || []).map((bill) => ({ bill, due: billOutstanding(bill) })).filter((item) => item.due > 0.005);
  const bySupplier = new Map();
  for (const { bill, due } of unpaidBills) {
    const key = String(bill.partyName || '').trim().toLowerCase();
    const row = bySupplier.get(key) || { name: bill.partyName, due: 0, bills: 0 };
    row.due = round2(row.due + due);
    row.bills += 1;
    bySupplier.set(key, row);
  }
  const suppliers = [...bySupplier.values()].sort((a, b) => b.due - a.due);
  const today = localToday();
  const late = open.filter(({ invoice }) => (overdueBy(invoice, today) || 0) > 0);
  return {
    ok: true,
    data: {
      period: current,
      previousPeriod: previous,
      current: monthFigures(state, current),
      previous: monthFigures(state, previous),
      owedToYou: {
        total: round2(open.reduce((sum, item) => sum + item.due, 0)),
        invoices: open.length,
        customers: customers.slice(0, 5),
        overdue: { total: round2(late.reduce((sum, item) => sum + item.due, 0)), invoices: late.length },
      },
      owedBySuppliers: {
        total: round2(unpaidBills.reduce((sum, item) => sum + item.due, 0)),
        bills: unpaidBills.length,
        suppliers: suppliers.slice(0, 5),
      },
      caveat: 'What you owe suppliers counts only payments recorded against bills; a bill paid outside MyCA shows as owed until its payment is recorded.',
    },
  };
}
