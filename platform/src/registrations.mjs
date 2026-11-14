import { gstin as gstinRules } from './sprint-load.mjs';
import { postingDate, localToday } from './dates.mjs';
import { outstandingOf } from './credit-notes.mjs';
import { filingFor } from './filings.mjs';

function billOutstanding(bill) {
  const paid = (bill.payments || []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  return Math.round((Number(bill.total || 0) - Number(bill.notedTotal || 0) - (Number(bill.tds?.amount || 0) - Number(bill.tds?.reversed || 0)) - paid) * 100) / 100;
}

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const REGISTRATION_KINDS = ['apob', 'warehouse', 'branch'];
const MAX_LABEL = 60;

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function clean(value) {
  return String(value == null ? '' : value).replace(/\s+/g, '').toUpperCase();
}

function extras(state) {
  const company = state?.company || {};
  return Array.isArray(company.registrations) ? company.registrations : [];
}

export function principalOf(state) {
  const company = state?.company || {};
  const gstin = clean(company.gstin);
  return { gstin, state: String(company.state || gstin.slice(0, 2) || ''), kind: 'principal', label: 'Principal', effectiveFrom: '', effectiveTo: '' };
}

export function registrationsOf(state, { includeRetired = true } = {}) {
  const all = [principalOf(state), ...extras(state)];
  return includeRetired ? all : all.filter((reg) => !reg.effectiveTo);
}

export function isPrincipal(state, gstin) {
  const wanted = clean(gstin);
  return !wanted || wanted === principalOf(state).gstin;
}

export function registrationByGstin(state, gstin) {
  const wanted = clean(gstin);
  if (!wanted) return principalOf(state);
  return registrationsOf(state).find((reg) => reg.gstin === wanted) || null;
}

export function registrationByState(state, stateCode) {
  const code = String(stateCode || '').padStart(2, '0');
  if (!code || code === '00') return null;
  return registrationsOf(state, { includeRetired: false }).find((reg) => String(reg.state || '').padStart(2, '0') === code) || null;
}

export function docGstin(state, doc) {
  return clean(doc?.registrationGstin) || principalOf(state).gstin;
}

export function companyAs(state, gstin) {
  const reg = registrationByGstin(state, gstin) || principalOf(state);
  return { ...(state?.company || {}), gstin: reg.gstin, state: reg.state, registrationLabel: reg.label };
}

export function regArg(state, value) {
  const wanted = clean(value);
  if (!wanted) return { ok: true, gstin: principalOf(state).gstin, registration: principalOf(state), principal: true };
  const reg = registrationByGstin(state, wanted);
  if (!reg) return fail('UNKNOWN_REGISTRATION', { gstin: wanted, known: registrationsOf(state).map((r) => r.gstin).filter(Boolean) });
  return { ok: true, gstin: reg.gstin, registration: reg, principal: reg.kind === 'principal' };
}

export function docFieldsFor(registration) {
  if (!registration || registration.kind === 'principal') return {};
  return { registrationGstin: registration.gstin, registrationState: registration.state };
}

export function forRegistration(state, docs, gstin) {
  const wanted = clean(gstin);
  if (gstin === undefined) return docs;
  return (docs || []).filter((doc) => docGstin(state, doc) === wanted);
}

export function scopeKey(state, period, gstin) {
  return isPrincipal(state, gstin) ? String(period) : `${period}@${clean(gstin)}`;
}

export function planRegistration(state, args = {}) {
  const gstin = clean(args.gstin);
  if (!GSTIN.test(gstin)) return fail('BAD_GSTIN', { gstin });
  const checked = typeof gstinRules.validateGstin === 'function' ? gstinRules.validateGstin(gstin) : null;
  if (checked && (checked.ok === false || checked.valid === false)) return fail('BAD_GSTIN', { gstin, hint: 'The checksum does not match.' });
  const principal = principalOf(state);
  if (!principal.gstin) return fail('PRINCIPAL_REQUIRED', { hint: 'Set the company GSTIN first; other registrations hang off it.' });
  if (gstin === principal.gstin) return fail('IS_PRINCIPAL', { gstin });
  if (gstin.slice(2, 12) !== principal.gstin.slice(2, 12)) return fail('DIFFERENT_PAN', { gstin, hint: 'Every registration of one business shares its PAN (characters 3 to 12 of the GSTIN).' });
  const stateCode = gstin.slice(0, 2);
  if (!gstinRules.STATE_CODES?.[stateCode]) return fail('BAD_STATE', { stateCode });
  const kind = String(args.kind || 'apob').trim().toLowerCase();
  if (!REGISTRATION_KINDS.includes(kind)) return fail('BAD_KIND', { kind, hint: REGISTRATION_KINDS.join(', ') });
  const label = String(args.label || '').trim().slice(0, MAX_LABEL) || `${kind.toUpperCase()} ${gstinRules.STATE_CODES[stateCode]}`;
  const effectiveFrom = args.effectiveFrom ? postingDate(args.effectiveFrom) : localToday();
  if (args.effectiveFrom && !effectiveFrom) return fail('INVALID_DATE', { effectiveFrom: args.effectiveFrom });
  const existing = extras(state).find((reg) => reg.gstin === gstin) || null;
  const clash = registrationsOf(state, { includeRetired: false }).find((reg) => reg.gstin !== gstin && reg.state === stateCode);
  if (clash && !existing) return fail('STATE_TAKEN', { stateCode, by: clash.gstin, hint: 'One active registration per state; retire the other first.' });
  return { ok: true, plan: { gstin, next: { gstin, state: stateCode, kind, label, effectiveFrom: existing ? existing.effectiveFrom : effectiveFrom, effectiveTo: '' }, existing } };
}

export function setRegistration(state, args = {}) {
  const planned = planRegistration(state, args);
  if (!planned.ok) return planned;
  state.company = state.company || {};
  state.company.registrations = extras(state).filter((reg) => reg.gstin !== planned.plan.gstin);
  state.company.registrations.push(planned.plan.next);
  return { ok: true, registration: planned.plan.next, updated: Boolean(planned.plan.existing) };
}

export function openDocumentsFor(state, gstin) {
  const wanted = clean(gstin);
  const invoices = (state.invoices || []).filter((inv) => clean(inv.registrationGstin) === wanted && inv.status !== 'cancelled' && outstandingOf(state, inv) > 0.005).map((inv) => inv.id);
  const purchases = (state.purchases || []).filter((bill) => clean(bill.registrationGstin) === wanted && bill.status !== 'cancelled' && billOutstanding(bill) > 0.005).map((bill) => bill.id);
  return { invoices, purchases, count: invoices.length + purchases.length };
}

export function retireRegistration(state, args = {}) {
  const gstin = clean(args.gstin);
  const reg = extras(state).find((item) => item.gstin === gstin);
  if (!reg) return fail(gstin === principalOf(state).gstin ? 'IS_PRINCIPAL' : 'UNKNOWN_REGISTRATION', { gstin });
  if (reg.effectiveTo) return fail('ALREADY_RETIRED', { gstin, effectiveTo: reg.effectiveTo });
  const open = openDocumentsFor(state, gstin);
  if (open.count) return fail('OPEN_DOCUMENTS', { gstin, ...open, hint: 'Settle or cancel the open invoices and bills under this registration first.' });
  const effectiveTo = args.effectiveTo ? postingDate(args.effectiveTo) : localToday();
  if (args.effectiveTo && !effectiveTo) return fail('INVALID_DATE', { effectiveTo: args.effectiveTo });
  if (effectiveTo < reg.effectiveFrom) return fail('BEFORE_START', { effectiveFrom: reg.effectiveFrom });
  reg.effectiveTo = effectiveTo;
  return { ok: true, registration: reg };
}

function recentPeriods(count) {
  const today = localToday();
  const [y, m] = today.slice(0, 7).split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const index = y * 12 + (m - 1) - (count - 1 - i);
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
  });
}

export function listRegistrations(state) {
  const periods = recentPeriods(3);
  const rows = registrationsOf(state).map((reg) => {
    const docs = (state.invoices || []).filter((inv) => docGstin(state, inv) === reg.gstin && inv.status !== 'cancelled');
    const bills = (state.purchases || []).filter((bill) => docGstin(state, bill) === reg.gstin && bill.status !== 'cancelled');
    return {
      ...reg,
      stateName: gstinRules.STATE_CODES?.[reg.state] || reg.state,
      invoices: docs.length,
      purchases: bills.length,
      periods: periods.map((period) => ({
        period,
        invoices: docs.filter((inv) => String(inv.date).slice(0, 7) === period).length,
        purchases: bills.filter((bill) => String(bill.date).slice(0, 7) === period).length,
        gstr1: Boolean(filingFor(state, 'GSTR-1', period, reg.gstin)),
        gstr3b: Boolean(filingFor(state, 'GSTR-3B', period, reg.gstin)),
      })),
      open: openDocumentsFor(state, reg.kind === 'principal' ? '' : reg.gstin).count,
    };
  });
  return { ok: true, data: { registrations: rows, several: rows.filter((r) => !r.effectiveTo).length > 1, kinds: REGISTRATION_KINDS } };
}

export function registrationsWords(data) {
  if (!data.several && data.registrations.length === 1) return `One registration, ${data.registrations[0].gstin || 'no GSTIN yet'}${data.registrations[0].stateName ? ` (${data.registrations[0].stateName})` : ''}. Add a warehouse or branch in another state with "add registration 29AAACN1234F1Z5 as apob".`;
  const lines = [`${data.registrations.length} registrations:`];
  for (const reg of data.registrations) {
    const last = reg.periods.at(-1);
    lines.push(`· ${reg.label} ${reg.gstin} (${reg.stateName})${reg.effectiveTo ? `, retired ${reg.effectiveTo}` : ''}: ${reg.invoices} invoices, ${reg.purchases} bills; ${last.period}: GSTR-1 ${last.gstr1 ? 'filed' : 'not filed'}, GSTR-3B ${last.gstr3b ? 'filed' : 'not filed'}`);
  }
  lines.push('Returns, payments and filings take the registration\'s GSTIN; without one they mean the principal.');
  return lines.join('\n');
}
