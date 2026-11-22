import { fail, toFils, isIsoDate, addDays, ruleOn, todayIso } from './common.mjs';
import { ctDueDate } from './corporate-tax.mjs';

function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

function item(id, what, date, today) {
  const daysLeft = daysBetween(today, date);
  return { id, what, date, daysLeft, overdue: daysLeft < 0 };
}

export function einvoicePhase(revenueFils, { government = false } = {}) {
  const rule = ruleOn('ae.einvoice.mandate', '2026-07-01');
  if (!rule) return null;
  const phases = rule.value.phases;
  if (government) return phases.find((phase) => phase.id === 'government');
  return phases.filter((phase) => phase.revenueAtLeastFils !== null).sort((a, b) => b.revenueAtLeastFils - a.revenueAtLeastFils).find((phase) => revenueFils >= phase.revenueAtLeastFils);
}

export function uaeDeadlines(args = {}) {
  const today = args.today || todayIso();
  if (!isIsoDate(today)) return fail('BAD_DATE', { field: 'today' });
  for (const field of ['vatPeriodEnd', 'ctPeriodEnd']) if (args[field] !== undefined && args[field] !== null && args[field] !== '' && !isIsoDate(args[field])) return fail('BAD_DATE', { field });
  const items = [];
  if (args.vatPeriodEnd) {
    const rule = ruleOn('ae.vat.return-period', args.vatPeriodEnd);
    if (rule) items.push(item('vat-return', 'VAT return (VAT 201) and payment on EmaraTax', addDays(args.vatPeriodEnd, rule.value.dueDaysAfterPeriodEnd), today));
  }
  if (args.ctPeriodEnd) {
    const due = ctDueDate(args.ctPeriodEnd);
    if (due) items.push(item('ct-return', 'Corporate Tax return and payment on EmaraTax', due, today));
  }
  const revenue = args.revenue === undefined || args.revenue === null || args.revenue === '' ? null : toFils(args.revenue);
  if (revenue !== null && revenue < 0) return fail('BAD_AMOUNT', { field: 'revenue' });
  if (revenue !== null || args.government === true) {
    const phase = einvoicePhase(revenue || 0, { government: args.government === true });
    if (phase) {
      items.push(item('einvoice-asp', 'Appoint an Accredited Service Provider for e-invoicing', phase.appointAspBy, today));
      items.push(item('einvoice-live', 'Send and receive every B2B and B2G invoice as a PINT AE e-invoice', phase.liveBy, today));
    }
  }
  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { ok: true, data: { today, items, next: items.find((entry) => !entry.overdue) || null } };
}
