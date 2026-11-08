import { localToday } from './dates.mjs';
import { countryOf, formatMoney } from './country.mjs';
import { deadlineRun } from './deadline-run.mjs';
import { listReminders } from './reminders.mjs';
import { outstandingOf } from './credit-notes.mjs';
import { salesTaxOverview } from './us-sales-tax.mjs';
import { estimatedTaxDates } from './us-owner-tax.mjs';
import { normalizeClientId } from './books.mjs';
import { supplierDues } from './supplier-dues.mjs';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

function plusDays(date, days) {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

export function weekAhead(state, args = {}) {
  const today = /^\d{4}-\d{2}-\d{2}$/.test(String(args.asOf || '')) ? args.asOf : localToday();
  const until = plusDays(today, 7);
  const items = [];
  const country = countryOf(state);
  if (country === 'IN') {
    const clientId = normalizeClientId(state.activeClientId);
    const run = deadlineRun(state, { asOfDate: today });
    for (const row of run.deadlines || []) {
      if (row.clientId !== clientId || row.filed || row.level === 'nothing_due') continue;
      if (row.dueDate > until) continue;
      items.push({ kind: 'filing', when: row.dueDate, overdue: row.dueDate < today, title: `${row.returnLabel || row.returnType} for ${row.period}`, detail: row.dueDate < today ? 'Overdue' : `Due ${row.dueDate}`, returnType: row.returnType, period: row.period });
    }
  } else {
    const overview = salesTaxOverview(state);
    for (const row of overview.data.states) {
      const last = row.lastPeriod;
      if (!last || last.filed || !last.dueDate || last.dueDate > until) continue;
      items.push({ kind: 'filing', when: last.dueDate, overdue: last.dueDate < today, title: `Sales tax return ${row.state} for ${last.period}`, detail: `${last.toPay > 0 ? `To pay ${last.toPay}; ` : ''}${last.dueDate < today ? 'overdue' : `due ${last.dueDate}`}`, returnType: `SALES_TAX_${row.state}`, period: last.period });
    }
    const estimated = estimatedTaxDates(state, { year: today.slice(0, 4) });
    if (estimated.ok) {
      for (const item of estimated.data.installments) {
        if (item.paid || item.dueDate > until || item.dueDate < plusDays(today, -30)) continue;
        items.push({ kind: 'estimated-tax', when: item.dueDate, overdue: item.dueDate < today, title: `Estimated tax instalment ${item.installment}`, detail: item.covers, period: item.period });
      }
    }
  }
  const reminders = listReminders(state, { status: 'open', today });
  for (const reminder of reminders.data.reminders) {
    if (reminder.due > until) continue;
    items.push({ kind: 'reminder', when: reminder.due, overdue: reminder.state === 'overdue', title: reminder.text, detail: reminder.state === 'overdue' ? 'Overdue' : reminder.state === 'today' ? 'Today' : `Due ${reminder.due}`, id: reminder.id });
  }
  for (const invoice of state.invoices || []) {
    if (invoice.status === 'cancelled' || !invoice.dueDate || invoice.dueDate > until) continue;
    const due = round2(outstandingOf(state, invoice));
    if (due <= 0.005) continue;
    items.push({ kind: 'receivable', when: invoice.dueDate, overdue: invoice.dueDate < today, title: `${invoice.partyName} owes ${due} on ${invoice.id}`, detail: invoice.dueDate < today ? `Overdue since ${invoice.dueDate}` : `Due ${invoice.dueDate}`, invoiceId: invoice.id, amount: due });
  }
  for (const bill of supplierDues(state, { asOf: today }).data.bills) {
    if (bill.payBy > until) continue;
    items.push({ kind: 'payable', when: bill.payBy, overdue: bill.overdue, title: `Pay ${bill.supplier} ${formatMoney(state, bill.outstanding)} on ${bill.billId}${bill.msme ? ' (MSME)' : ''}`, detail: bill.overdue ? `${bill.msme ? 'Past the MSMED limit since' : 'Overdue since'} ${bill.payBy}` : `Pay by ${bill.payBy}`, billId: bill.billId, amount: bill.outstanding, msme: bill.msme });
  }
  const payrollMonth = plusDays(today, 0).slice(0, 7);
  const lastMonth = plusDays(`${payrollMonth}-01`, -1).slice(0, 7);
  const employees = (state.employees || []).filter((e) => !e.leftOn).length;
  if (employees > 0) {
    const run = state.payrollRuns && typeof state.payrollRuns === 'object' ? state.payrollRuns[lastMonth] : null;
    if (!run) items.push({ kind: 'payroll', when: `${payrollMonth}-07`, overdue: today > `${payrollMonth}-07`, title: `Payroll for ${lastMonth} not yet approved`, detail: `${employees === 1 ? '1 employee' : `${employees} employees`}`, period: lastMonth });
    else if (!run.paidOn) items.push({ kind: 'payroll', when: `${payrollMonth}-07`, overdue: today > `${payrollMonth}-07`, title: `Salaries for ${lastMonth} not yet recorded as paid`, detail: 'Say "paid salaries" once they are', period: lastMonth });
  }
  items.sort((a, b) => a.when.localeCompare(b.when) || a.kind.localeCompare(b.kind));
  return { ok: true, data: { today, until, items, overdue: items.filter((item) => item.overdue).length, count: items.length } };
}

export function weekAheadWords(data, money) {
  if (!data.items.length) return `Nothing is due between ${data.today} and ${data.until}: no filings, reminders, overdue invoices or payroll waiting.`;
  const lines = [`${data.count === 1 ? '1 thing' : `${data.count} things`} in the week to ${data.until}${data.overdue ? `, ${data.overdue} overdue` : ''}:`];
  for (const item of data.items) lines.push(`· ${item.when}: ${item.kind === 'receivable' ? `${item.title.replace(/ owes [0-9.]+ on /, ` owes ${money(item.amount)} on `)}` : item.title}${item.detail ? ` (${item.detail})` : ''}`);
  return lines.join('\n');
}
