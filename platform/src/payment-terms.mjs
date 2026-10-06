import { localToday } from './dates.mjs';
import { daysBetween } from './reminders.mjs';

export const MAX_TERMS_DAYS = 365;

function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function customerKey({ name = '', gstin = '' } = {}) {
  const tax = String(gstin || '').trim().toUpperCase();
  if (tax) return `gstin:${tax}`;
  const plain = String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return plain ? `name:${plain}` : '';
}

export function termsLabel(days) {
  if (days == null) return '';
  return days === 0 ? 'Due on receipt' : `Net ${days}`;
}

export function validTerms(value) {
  if (value == null || value === '') return null;
  const days = Number(value);
  if (!Number.isInteger(days) || days < 0 || days > MAX_TERMS_DAYS) return undefined;
  return days;
}

export function customerTerms(state, customer) {
  const all = state.customerTerms && typeof state.customerTerms === 'object' ? state.customerTerms : {};
  const byGstin = customerKey({ gstin: customer.gstin });
  if (byGstin && Object.hasOwn(all, byGstin)) return all[byGstin];
  const byName = customerKey({ name: customer.name });
  if (byName && Object.hasOwn(all, byName)) return all[byName];
  return null;
}

export function invoiceTerms(state, { name, gstin, override }) {
  const own = validTerms(override);
  if (own === undefined) return { error: 'BAD_TERMS' };
  if (own != null) return { days: own, source: 'invoice' };
  const usual = customerTerms(state, { name, gstin });
  if (usual != null) return { days: usual, source: 'customer' };
  return { days: null, source: '' };
}

export function dueDateOf(date, days) {
  return days == null ? '' : addDays(date, days);
}

function knownCustomer(state, { name, gstin }) {
  const tax = String(gstin || '').trim().toUpperCase();
  const plain = String(name || '').trim().toLowerCase();
  return (state.invoices || []).find((inv) => (tax && String(inv.partyGstin || '').toUpperCase() === tax) || (!tax && String(inv.partyName || '').trim().toLowerCase() === plain))
    || (state.parties || []).find((party) => (tax && String(party.gstin || '').toUpperCase() === tax) || (!tax && String(party.name || '').trim().toLowerCase() === plain));
}

export function planTerms(state, args = {}) {
  const name = String(args.partyName || '').trim();
  const gstin = String(args.partyGstin || '').trim().toUpperCase();
  if (!name && !gstin) return { ok: false, error: 'CUSTOMER_REQUIRED' };
  const days = validTerms(args.days);
  if (days === undefined || days === null) return { ok: false, error: 'BAD_TERMS' };
  const known = knownCustomer(state, { name, gstin });
  const display = known ? (known.partyName || known.name) : name;
  const before = customerTerms(state, { name: display, gstin: gstin || (known?.partyGstin || known?.gstin || '') });
  return { ok: true, plan: { name: display, gstin: gstin || String(known?.partyGstin || known?.gstin || '').toUpperCase(), days, before, known: Boolean(known) } };
}

export function setPaymentTerms(state, args = {}) {
  const planned = planTerms(state, args);
  if (!planned.ok) return planned;
  const { plan } = planned;
  state.customerTerms = state.customerTerms && typeof state.customerTerms === 'object' ? state.customerTerms : {};
  state.customerTerms[customerKey({ name: plan.name, gstin: plan.gstin })] = plan.days;
  return { ok: true, customer: plan.name, gstin: plan.gstin, days: plan.days, label: termsLabel(plan.days), before: plan.before };
}

export function overdueBy(invoice, today = localToday()) {
  if (!invoice.dueDate) return null;
  const late = daysBetween(invoice.dueDate, today);
  return late > 0 ? late : 0;
}
