import { rules } from '../../sprint-load.mjs';
import { countrySlice } from '../kit/index.mjs';
import { SPECIAL_TINS, SELF_BILLED_TYPES, isRealDate } from './myinvois-document.mjs';

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DAY_MS = 86400000;
const MALAYSIA_OFFSET_MS = 8 * 3600000;
const MAX_SEN = 1e15;

export const GENERAL_PUBLIC_BUYER = Object.freeze({
  name: 'General Public',
  tin: SPECIAL_TINS['general-public'],
  idType: 'BRN',
  idValue: 'NA',
  address: Object.freeze({ lines: Object.freeze(['NA']), city: 'NA', state: '17', country: 'MYS' }),
});

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function iso(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function malaysiaToday(nowMs = Date.now()) {
  return iso(nowMs + MALAYSIA_OFFSET_MS);
}

function profile(state) {
  const saved = countrySlice(state, 'myEinvoiceProfile');
  return saved && saved.supplier ? saved.supplier : null;
}

export function consolidationWindow(month, today) {
  const found = String(month || '').match(MONTH);
  if (!found) return fail('BAD_MONTH', { hint: 'Give the month the receipts belong to, as 2026-10.' });
  const year = Number(found[1]);
  const monthNumber = Number(found[2]);
  const from = `${month}-01`;
  const to = iso(Date.UTC(year, monthNumber, 0));
  const record = rules.rule('my.einvoice.consolidation', to);
  if (!record.ok) return fail('RULE_NOT_IN_FORCE', { ruleId: 'my.einvoice.consolidation', date: to });
  const due = iso(Date.parse(`${to}T00:00:00Z`) + record.record.value.submitWithinDaysAfterMonthEnd * DAY_MS);
  return { ok: true, from, to, due, today, ended: today > to, late: today > due, record: record.record };
}

export function consolidatedInput(state, args = {}, nowMs = Date.now()) {
  const today = malaysiaToday(nowMs);
  const window = consolidationWindow(args.month, today);
  if (!window.ok) return window;
  const rule = window.record.value;
  if (!window.ended) return fail('CONSOLIDATION_MONTH_NOT_ENDED', { month: args.month, from: window.from, to: window.to, hint: `A consolidated e-invoice for ${args.month} is issued after the month ends, by ${window.due}.` });
  if (window.late && args.acknowledgeLate !== true) return fail('CONSOLIDATION_WINDOW_CLOSED', { month: args.month, due: window.due, today, why: `LHDN expects the consolidated e-invoice within ${rule.submitWithinDaysAfterMonthEnd} days after the month ends (by ${window.due}).`, hint: 'Send it now with acknowledgeLate: true and record why it is late; the late submission stays visible in the audit trail.' });
  const activity = String(args.activity || '').trim();
  if (activity && (rule.excludedActivities || []).includes(activity)) return fail('CONSOLIDATION_NOT_ALLOWED', { activity, why: `LHDN does not allow ${activity} transactions in a consolidated e-invoice; issue an e-invoice for each sale.`, ruleId: window.record.id });
  const supplier = profile(state);
  if (!supplier) return fail('EINVOICE_PROFILE_MISSING', { hint: 'Save the business\'s MyInvois details with set_my_einvoice_profile first.' });
  const lines = Array.isArray(args.lines) ? args.lines : [];
  if (!lines.length) return fail('EINVOICE_FIELDS_MISSING', { problems: [{ field: 'lines', why: 'at least one line of receipts' }] });
  const problems = [];
  const built = lines.map((line, index) => {
    if (!line || typeof line !== 'object') { problems.push({ field: `lines[${index}]`, why: 'a line object' }); return {}; }
    const amount = line.amount ?? line.unitPrice;
    if (!(typeof amount === 'number' && Number.isFinite(amount) && amount >= 0 && amount * 100 <= MAX_SEN)) problems.push({ field: `lines[${index}].amount`, why: 'the total of the receipts before tax, zero or more' });
    if (line.transactions !== undefined && !(Number.isInteger(line.transactions) && line.transactions >= 1)) problems.push({ field: `lines[${index}].transactions`, why: 'how many receipts the line sums, a whole number from 1' });
    const receipts = String(line.receipts || '').trim();
    return {
      description: [String(line.description || 'Sales to the general public').trim(), receipts ? `receipts ${receipts}` : ''].filter(Boolean).join(', '),
      classification: rule.classification,
      quantity: 1,
      unitPrice: amount,
      taxType: line.taxType || '06',
      ...(line.taxRateBasisPoints !== undefined ? { taxRateBasisPoints: line.taxRateBasisPoints } : {}),
      ...(line.exemptionReason ? { exemptionReason: line.exemptionReason } : {}),
      ...(line.transactions !== undefined ? { transactions: line.transactions } : {}),
      ...(line.largestTransaction !== undefined ? { largestTransaction: line.largestTransaction } : {}),
    };
  });
  if (problems.length) return fail('EINVOICE_FIELDS_MISSING', { problems });
  const [year, month] = args.month.split('-');
  return {
    ok: true,
    late: window.late,
    due: window.due,
    period: { from: window.from, to: window.to, frequency: rule.frequency },
    input: {
      type: 'invoice',
      number: String(args.number || `CONS-${year}${month}`),
      consolidated: true,
      supplier,
      buyer: GENERAL_PUBLIC_BUYER,
      lines: built,
      period: { from: window.from, to: window.to, frequency: rule.frequency },
      ...(args.paymentMethod ? { paymentMethod: args.paymentMethod } : {}),
    },
  };
}

export function selfBilledInput(state, args = {}) {
  const type = String(args.type || 'self-billed-invoice');
  if (!SELF_BILLED_TYPES.includes(type)) return fail('BAD_TYPE', { type, allowed: SELF_BILLED_TYPES });
  const buyer = profile(state);
  if (!buyer) return fail('EINVOICE_PROFILE_MISSING', { hint: 'Save the business\'s MyInvois details with set_my_einvoice_profile first; on a self-billed e-invoice the business is the buyer that issues it.' });
  const given = args.supplier && typeof args.supplier === 'object' ? args.supplier : null;
  if (!given) return fail('EINVOICE_FIELDS_MISSING', { problems: [{ field: 'supplier', why: 'the supplier the business pays: a foreign supplier, an agent, a dealer or an individual' }] });
  const country = String(given.address?.country || 'MYS').toUpperCase();
  const foreign = country !== 'MYS';
  const supplier = {
    ...given,
    tin: given.tin ? String(given.tin).trim().toUpperCase() : (foreign ? SPECIAL_TINS['foreign-supplier'] : ''),
    msic: given.msic || '00000',
    idType: given.idType || (foreign ? 'PASSPORT' : 'BRN'),
    idValue: given.idValue || (foreign ? 'NA' : ''),
    address: { ...(given.address || {}), country, ...(foreign && !given.address?.state ? { state: '17' } : {}) },
  };
  return {
    ok: true,
    foreign,
    input: {
      type,
      number: args.number,
      supplier,
      buyer,
      lines: args.lines,
      ...(args.currency ? { currency: args.currency } : {}),
      ...(args.exchangeRate !== undefined ? { exchangeRate: args.exchangeRate } : {}),
      ...(args.original ? { original: args.original } : {}),
      ...(args.paymentMethod ? { paymentMethod: args.paymentMethod } : {}),
    },
  };
}

export function einvoiceRequired({ annualTurnover, date, relatedCompanyTurnover } = {}) {
  if (!isRealDate(date)) return fail('BAD_DATE', { date });
  const amountOk = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value * 100 <= MAX_SEN;
  if (!amountOk(annualTurnover)) return fail('BAD_AMOUNT', { field: 'annualTurnover', hint: 'Annual turnover in ringgit, zero or more.' });
  if (relatedCompanyTurnover !== undefined && relatedCompanyTurnover !== null && !amountOk(relatedCompanyTurnover)) return fail('BAD_AMOUNT', { field: 'relatedCompanyTurnover' });
  const found = rules.rule('my.einvoice.mandate', date);
  if (!found.ok) return fail('RULE_NOT_IN_FORCE', { ruleId: 'my.einvoice.mandate', date });
  const value = found.record.value;
  const turnoverSen = Math.round(annualTurnover * 100);
  const relatedSen = relatedCompanyTurnover === undefined || relatedCompanyTurnover === null ? null : Math.round(relatedCompanyTurnover * 100);
  const relatedBlocks = relatedSen !== null && value.exemptionLostWhenRelatedCompanyAtOrAboveSen !== undefined && relatedSen >= value.exemptionLostWhenRelatedCompanyAtOrAboveSen;
  const exempt = turnoverSen < value.exemptBelowSen && !relatedBlocks;
  const phase = [...value.phases].sort((a, b) => b.turnoverAboveSen - a.turnoverAboveSen).find((entry) => turnoverSen > entry.turnoverAboveSen) || value.phases.at(-1);
  const required = !exempt && date >= phase.from;
  return {
    ok: true,
    data: {
      required,
      exempt,
      exemptBelow: value.exemptBelowSen / 100,
      startsFrom: exempt ? null : phase.from,
      ...(relatedBlocks ? { why: 'A related, holding or shareholder company has turnover of RM3 million or more, so the small-business exemption does not apply.' } : exempt ? { why: `Annual turnover below RM${(value.exemptBelowSen / 100).toLocaleString('en-MY')} is exempt from e-invoicing.` } : { why: `E-invoicing applies from ${phase.from} for this turnover.` }),
      ruleId: found.record.id,
      effectiveFrom: found.record.effectiveFrom,
      source: found.record.source,
      unreviewed: !(found.record.attestations || []).length,
    },
  };
}
