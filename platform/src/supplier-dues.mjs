import { localToday, postingDate } from './dates.mjs';
import { customerKey, validTerms } from './payment-terms.mjs';
import { salaryPrivate } from './employees.mjs';
import { rule, RULES } from '../../sprints/statutory-rules/src/index.mjs';

const UDYAM = /^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$/;
const REGIME_RULES = ['msme.payment-days', 'msme.deduction-on-payment'];
const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

function billOutstanding(bill) {
  const paid = (bill.payments || []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  return Math.round((Number(bill.total || 0) - Number(bill.notedTotal || 0) - (Number(bill.tds?.amount || 0) - Number(bill.tds?.reversed || 0)) - paid) * 100) / 100;
}

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

export function supplierTerms(state, supplier) {
  const all = state.supplierTerms && typeof state.supplierTerms === 'object' ? state.supplierTerms : {};
  const byGstin = customerKey({ gstin: supplier.gstin });
  if (byGstin && Object.hasOwn(all, byGstin)) return all[byGstin];
  const byName = customerKey({ name: supplier.name });
  if (byName && Object.hasOwn(all, byName)) return all[byName];
  return null;
}

function knownSupplier(state, { name, gstin }) {
  const tax = String(gstin || '').trim().toUpperCase();
  const plain = String(name || '').trim().toLowerCase();
  return (state.purchases || []).find((bill) => (tax && String(bill.partyGstin || '').toUpperCase() === tax) || (!tax && String(bill.partyName || '').trim().toLowerCase() === plain)) || null;
}

export function msmeDays(onDate, { agreedDays = null } = {}) {
  const found = rule('msme.payment-days', onDate);
  if (!found.ok) return null;
  const max = found.value.withAgreementMaxDays;
  const days = agreedDays == null ? found.value.withoutAgreementDays : Math.min(agreedDays, max);
  return { days, max, rulesUsed: [`msme.payment-days@${onDate}`], attested: (found.record.attestations || []).length > 0 };
}

function scopesOf(id, onDate) {
  const found = rule(id, onDate);
  return found.ok ? [found.value] : RULES.filter((record) => record.id === id).map((record) => record.value);
}

export function msmeCovered(category, onDate) {
  const kind = String(category || '').trim().toLowerCase();
  if (!kind) return true;
  return REGIME_RULES.every((id) => scopesOf(id, onDate).every((scope) => !Array.isArray(scope.appliesTo) || scope.appliesTo.includes(kind)));
}

export function planSupplierTerms(state, args = {}) {
  if (salaryPrivate(state)) return fail('OWNER_ONLY', { hint: 'Only the owner can mark a supplier as an MSME.' });
  const name = String(args.partyName || '').trim();
  const gstin = String(args.partyGstin || '').trim().toUpperCase();
  if (!name && !gstin) return fail('SUPPLIER_REQUIRED');
  const known = knownSupplier(state, { name, gstin });
  const display = known ? known.partyName : name;
  const before = supplierTerms(state, { name: display, gstin: gstin || known?.partyGstin || '' });
  const udyamGiven = String(args.udyam || '').trim().toUpperCase().replace(/\s+/g, '');
  if (udyamGiven && !UDYAM.test(udyamGiven)) return fail('BAD_UDYAM', { udyam: udyamGiven, hint: 'UDYAM-XX-00-0000000' });
  const udyam = udyamGiven || (args.msme === false ? '' : String(before?.udyam || ''));
  const msme = args.msme == null ? (udyamGiven ? true : Boolean(before?.msme)) : Boolean(args.msme);
  const daysGiven = validTerms(args.days);
  if (daysGiven === undefined) return fail('BAD_TERMS');
  const days = daysGiven == null ? (before?.days ?? null) : daysGiven;
  const categoryGiven = args.category == null || args.category === '' ? '' : String(args.category).toLowerCase();
  if (categoryGiven && !['micro', 'small', 'medium'].includes(categoryGiven)) return fail('BAD_CATEGORY', { category: categoryGiven });
  const category = categoryGiven || (msme ? String(before?.category || '') : '');
  const covered = msme && msmeCovered(category, localToday());
  if (covered && days != null) {
    const limit = msmeDays(localToday(), { agreedDays: days });
    if (limit && days > limit.max) return fail('TERMS_EXCEED_MSMED', { days, max: limit.max, hint: `An MSME supplier must be paid within ${limit.max} days even with a written agreement.` });
  }
  const key = customerKey({ name: display, gstin: gstin || known?.partyGstin || '' });
  if (!key) return fail('SUPPLIER_REQUIRED');
  return { ok: true, plan: { key, name: display, gstin: gstin || String(known?.partyGstin || '').toUpperCase(), msme, covered, udyam, category, days, before, known: Boolean(known) } };
}

function withAccountMasked(record) {
  const bank = record && typeof record === 'object' && !Array.isArray(record) && record.bank && typeof record.bank === 'object' ? record.bank : null;
  const account = bank ? String(bank.account || '') : '';
  return account ? { ...record, bank: { ...bank, account: `xxxx${account.slice(-4)}` } } : record;
}

export function setSupplierTerms(state, args = {}) {
  const planned = planSupplierTerms(state, args);
  if (!planned.ok) return planned;
  const { plan } = planned;
  const kept = plan.before && typeof plan.before === 'object' && !Array.isArray(plan.before) ? plan.before : {};
  state.supplierTerms = state.supplierTerms && typeof state.supplierTerms === 'object' ? state.supplierTerms : {};
  state.supplierTerms[plan.key] = { ...kept, msme: plan.msme, udyam: plan.udyam, category: plan.category, days: plan.days };
  return { ok: true, supplier: plan.name, gstin: plan.gstin, msme: plan.msme, covered: plan.covered, udyam: plan.udyam, category: plan.category, days: plan.days, before: withAccountMasked(plan.before) };
}

const MSME_REMINDER_SOURCE = /^msme:(.+):\d{4}-\d{2}-\d{2}$/;

export function completeMsmeReminders(state, { billId = '', today = localToday() } = {}) {
  const wanted = String(billId || '');
  const completed = [];
  let bills = null;
  for (const reminder of state.reminders || []) {
    if (!reminder || typeof reminder !== 'object' || reminder.done) continue;
    const found = MSME_REMINDER_SOURCE.exec(String(reminder.source || ''));
    if (!found || (wanted && found[1] !== wanted)) continue;
    bills = bills || new Map((state.purchases || []).map((bill) => [bill.id, bill]));
    const bill = bills.get(found[1]);
    if (bill && bill.status !== 'cancelled' && round2(billOutstanding(bill)) > 0.005) continue;
    reminder.done = { on: today, by: 'automation' };
    completed.push(reminder.id);
  }
  return completed;
}

export function billPayBy(state, bill) {
  const terms = supplierTerms(state, { name: bill.partyName, gstin: bill.partyGstin });
  if (!terms) return null;
  const date = postingDate(bill.date);
  if (!date) return null;
  if (terms.msme && msmeCovered(terms.category, date)) {
    const limit = msmeDays(date, { agreedDays: terms.days });
    if (!limit) return null;
    return { payBy: addDays(date, limit.days), days: limit.days, msme: true, statutory: true, rulesUsed: limit.rulesUsed, unreviewed: !limit.attested };
  }
  if (terms.days == null) return null;
  return { payBy: addDays(date, terms.days), days: terms.days, msme: false, statutory: false, rulesUsed: [], unreviewed: false };
}

export function supplierDues(state, args = {}) {
  const today = postingDate(args.asOf) || localToday();
  const rows = [];
  for (const bill of state.purchases || []) {
    if (bill.status === 'cancelled') continue;
    const outstanding = round2(billOutstanding(bill));
    if (outstanding <= 0.005) continue;
    const due = billPayBy(state, bill);
    if (!due) continue;
    const daysLeft = daysBetween(today, due.payBy);
    rows.push({
      billId: bill.id,
      supplier: bill.partyName,
      gstin: bill.partyGstin || '',
      date: bill.date,
      total: round2(bill.total),
      outstanding,
      payBy: due.payBy,
      daysLeft,
      overdue: daysLeft < 0,
      msme: due.msme,
      rulesUsed: due.rulesUsed,
      unreviewed: due.unreviewed,
    });
  }
  rows.sort((a, b) => a.payBy.localeCompare(b.payBy) || a.billId.localeCompare(b.billId));
  const msmeRows = rows.filter((row) => row.msme);
  const deduction = rule('msme.deduction-on-payment', today);
  return {
    ok: true,
    data: {
      asOf: today,
      bills: rows,
      msme: {
        count: msmeRows.length,
        outstanding: round2(msmeRows.reduce((sum, row) => sum + row.outstanding, 0)),
        overdue: msmeRows.filter((row) => row.overdue).length,
        overdueOutstanding: round2(msmeRows.filter((row) => row.overdue).reduce((sum, row) => sum + row.outstanding, 0)),
        rule: deduction.ok ? `${deduction.record.act} s.${deduction.record.section}` : '',
        rulesUsed: deduction.ok ? [`msme.deduction-on-payment@${today}`] : [],
        unreviewed: deduction.ok ? (deduction.record.attestations || []).length === 0 : true,
      },
      note: msmeRows.length
        ? 'A bill to a micro or small enterprise paid after its MSMED time limit is not deductible this year; it is deducted in the year it is paid. The limit is counted from the day the goods or services were accepted.'
        : 'No supplier is marked as an MSME. Say "<supplier> is MSME" or give their Udyam number so their bills carry the statutory payment date.',
    },
  };
}
