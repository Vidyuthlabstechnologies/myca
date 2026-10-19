import { localToday } from './dates.mjs';
import { csvRows } from './text-safe.mjs';
import { salaryPrivate } from './employees.mjs';
import { supplierTerms, planSupplierTerms } from './supplier-dues.mjs';
import { paymentRun } from './payment-run.mjs';

const ACCOUNT = /^\d{6,20}$/;
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const UPI = /^[a-z0-9._-]{2,64}@[a-z]{2,32}$/i;

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function masked(account) {
  const text = String(account || '');
  return text ? `xxxx${text.slice(-4)}` : '';
}

export function planSupplierBank(state, args = {}) {
  if (salaryPrivate(state)) return fail('OWNER_ONLY', { hint: 'Only the owner can record where a supplier is paid.' });
  const terms = planSupplierTerms(state, { partyName: args.partyName, partyGstin: args.partyGstin });
  if (!terms.ok) return terms;
  const { plan } = terms;
  const account = String(args.account || '').replace(/\s/g, '');
  const ifsc = String(args.ifsc || '').trim().toUpperCase();
  const upi = String(args.upi || '').trim().toLowerCase();
  const holder = String(args.holder || '').trim().slice(0, 80);
  if (!account && !upi) return fail('BANK_DETAILS_REQUIRED', { hint: 'Give an account number with its IFSC, or a UPI id.' });
  if (account && !ACCOUNT.test(account)) return fail('BAD_ACCOUNT', { hint: 'An account number is 6 to 20 digits.' });
  if (account && !IFSC.test(ifsc)) return fail('BAD_IFSC', { ifsc, hint: 'An IFSC is four letters, a zero and six characters, for example HDFC0001234.' });
  if (upi && !UPI.test(upi)) return fail('BAD_UPI', { upi, hint: 'A UPI id looks like name@bank.' });
  const before = supplierTerms(state, { name: plan.name, gstin: plan.gstin })?.bank || null;
  const changed = Boolean(before && (before.account !== account || before.ifsc !== ifsc || before.upi !== upi));
  return { ok: true, plan: { key: plan.key, name: plan.name, gstin: plan.gstin, known: plan.known, bank: { account, ifsc, upi, holder }, before, changed } };
}

export function setSupplierBank(state, args = {}) {
  const planned = planSupplierBank(state, args);
  if (!planned.ok) return planned;
  const { plan } = planned;
  state.supplierTerms = state.supplierTerms && typeof state.supplierTerms === 'object' ? state.supplierTerms : {};
  const existing = state.supplierTerms[plan.key] || { msme: false, udyam: '', category: '', days: null };
  const by = String(state?.__actor?.userId || args.actorId || '').slice(0, 80);
  state.supplierTerms[plan.key] = { ...existing, bank: { ...plan.bank, recordedOn: localToday(), recordedBy: by, ...(plan.changed ? { changedFrom: { account: masked(plan.before.account), ifsc: plan.before.ifsc, upi: plan.before.upi } } : {}) } };
  return { ok: true, supplier: plan.name, gstin: plan.gstin, bank: { account: masked(plan.bank.account), ifsc: plan.bank.ifsc, upi: plan.bank.upi, holder: plan.bank.holder }, changed: plan.changed };
}

export function supplierPayoutFile(state, args = {}) {
  if (salaryPrivate(state)) return fail('OWNER_ONLY');
  const run = paymentRun(state, args).data;
  const wanted = Array.isArray(args.billIds) && args.billIds.length ? new Set(args.billIds.map((id) => String(id).toUpperCase())) : null;
  const rows = [...run.proposed, ...run.consider].filter((r) => !wanted || wanted.has(r.billId));
  const bySupplier = new Map();
  for (const row of rows) {
    const key = `${row.supplier}|${row.gstin}`;
    const entry = bySupplier.get(key) || { supplier: row.supplier, gstin: row.gstin, amount: 0, bills: [] };
    entry.amount = Math.round((entry.amount + row.outstanding) * 100) / 100;
    entry.bills.push(row.supplierInvoiceNo || row.billId);
    bySupplier.set(key, entry);
  }
  const ready = [];
  const missing = [];
  for (const entry of bySupplier.values()) {
    const bank = supplierTerms(state, { name: entry.supplier, gstin: entry.gstin })?.bank || null;
    if (!bank || (!bank.account && !bank.upi)) { missing.push({ supplier: entry.supplier, amount: entry.amount, bills: entry.bills }); continue; }
    ready.push({ supplier: entry.supplier, holder: bank.holder || entry.supplier, account: bank.account, ifsc: bank.ifsc, upi: bank.upi, amount: entry.amount, bills: entry.bills, recentlyChanged: Boolean(bank.changedFrom) });
  }
  const header = ['Beneficiary name', 'Account number', 'IFSC', 'UPI', 'Amount', 'Narration'];
  const csv = csvRows([header, ...ready.map((r) => [r.holder, r.account, r.ifsc, r.upi, r.amount.toFixed(2), `MyCA ${r.bills.join(' ')}`.slice(0, 50)])]);
  return {
    ok: true,
    data: {
      asOf: run.asOf,
      ready,
      missing,
      total: Math.round(ready.reduce((s, r) => s + r.amount, 0) * 100) / 100,
      csv,
      fileName: `supplier-payouts-${run.asOf}.csv`,
      note: 'Upload the file in your bank\'s bulk NEFT or IMPS screen and approve it there; MyCA moves no money. Record the payments with "pay the proposed bills" once the bank confirms.',
      warning: ready.some((r) => r.recentlyChanged) ? 'A supplier\'s bank details were changed recently; confirm them on the phone number you have on file before paying.' : '',
    },
  };
}

export function supplierPayoutWords(d, money) {
  if (!d.ready.length && !d.missing.length) return 'Nothing is proposed for payment, so there is no payout file.';
  const lines = [];
  if (d.ready.length) lines.push(`${d.fileName}: ${d.ready.length === 1 ? '1 supplier' : `${d.ready.length} suppliers`}, ${money(d.total)}: ${d.ready.map((r) => `${r.supplier} ${money(r.amount)} to ${r.upi || `${masked(r.account)} at ${r.ifsc}`}${r.recentlyChanged ? ' (bank details changed recently)' : ''}`).join('; ')}.`);
  if (d.missing.length) lines.push(`No bank details on record for ${d.missing.map((m) => `${m.supplier} (${money(m.amount)})`).join(', ')}. Say "${d.missing[0].supplier} is paid to account 1234567890 IFSC HDFC0001234" to record them.`);
  if (d.warning) lines.push(d.warning);
  lines.push(d.note);
  return lines.join('\n');
}
