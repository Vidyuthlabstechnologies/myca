import { appendAuditEvent } from '../../ca-api.mjs';
import { countrySlice, openCountrySlice } from '../kit/index.mjs';
import { emirateOf, fail, isIsoDate } from './common.mjs';
import { checkTrn, checkTin } from './trn.mjs';
import { vatReturn, vatRegistrationCheck } from './vat.mjs';
import { corporateTaxEstimate } from './corporate-tax.mjs';
import { uaeDeadlines } from './deadlines.mjs';
import { penaltyEstimate } from './penalties.mjs';
import { buildPintAe } from './einvoice.mjs';
import { sendThroughAsp, issuedEinvoices, aspMode } from './asp.mjs';

const PROFILE_FIELDS = ['name', 'nameAr', 'trn', 'tin', 'legalId', 'legalIdType', 'emirate', 'city', 'addressLine', 'freeZone', 'freeZoneName', 'financialYearEnd', 'vatPeriod'];
const YEAR_END = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function savedProfile(state) {
  const slice = countrySlice(state, 'aeProfile');
  return slice && slice.business ? slice.business : null;
}

function withSeller(state, args) {
  const profile = savedProfile(state);
  const seller = args.seller || (profile ? { ...profile, legalIdType: profile.legalIdType || 'TL', country: 'AE' } : undefined);
  return { ...args, seller };
}

function profileFrom(args) {
  const out = Object.fromEntries(PROFILE_FIELDS.filter((key) => args[key] !== undefined && args[key] !== null && args[key] !== '').map((key) => [key, typeof args[key] === 'string' ? args[key].trim() : args[key]]));
  if (out.trn) out.trn = out.trn.replace(/[\s-]/g, '');
  const emirate = emirateOf(out.emirate);
  if (emirate) out.emirate = emirate.code;
  return out;
}

function profileProblems(profile) {
  const problems = [];
  if (!profile.name) problems.push({ field: 'name', why: 'The legal name on the trade licence is required.' });
  if (!emirateOf(profile.emirate)) problems.push({ field: 'emirate', why: 'Choose the emirate: AUH, DXB, SHJ, AJM, UAQ, RAK or FUJ.' });
  if (profile.trn) {
    const trn = checkTrn(profile.trn);
    if (!trn.valid) problems.push({ field: 'trn', why: trn.why });
  }
  if (profile.tin && !checkTin(profile.tin).valid) problems.push({ field: 'tin', why: 'A TIN is 10 digits, the first 10 of the TRN.' });
  if (profile.trn && profile.tin && checkTrn(profile.trn).tin !== profile.tin) problems.push({ field: 'tin', why: 'The TIN must be the first 10 digits of the TRN.' });
  if (profile.financialYearEnd && !YEAR_END.test(profile.financialYearEnd)) problems.push({ field: 'financialYearEnd', why: 'Write the financial year end as MM-DD, for example 12-31.' });
  if (profile.freeZone === true && !profile.freeZoneName) problems.push({ field: 'freeZoneName', why: 'Name the free zone (for example DMCC, JAFZA, IFZA).' });
  return problems;
}

function aed(value) {
  return `AED ${Number(value || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function einvoice(state, args) {
  if (args.issueDate !== undefined && !isIsoDate(args.issueDate)) return buildPintAe(withSeller(state, args));
  return buildPintAe(withSeller(state, { issueDate: new Date().toISOString().slice(0, 10), ...args }));
}

export const ENGINE = Object.freeze({
  country: 'AE',
  run: Object.freeze({
    ae_business_profile: (state) => {
      const business = savedProfile(state);
      return { ok: true, data: { saved: Boolean(business), business: business || null, updatedAt: countrySlice(state, 'aeProfile').updatedAt || null } };
    },
    ae_ct_estimate: (state, args = {}) => corporateTaxEstimate(args),
    ae_deadlines: (state, args = {}) => uaeDeadlines(args),
    ae_einvoice_check: (state, args = {}) => {
      const built = einvoice(state, args);
      if (!built.ok) return built;
      return { ok: true, data: { ready: true, mode: aspMode(), totals: built.totals, document: built.document, warnings: built.warnings, xml: built.xml } };
    },
    ae_einvoice_list: (state) => ({ ok: true, data: { mode: aspMode(), einvoices: issuedEinvoices(state).sort((a, b) => (a.sentAt < b.sentAt ? 1 : -1)) } }),
    ae_penalty_estimate: (state, args = {}) => penaltyEstimate(args),
    ae_vat_registration: (state, args = {}) => vatRegistrationCheck(args),
    ae_vat_return: (state, args = {}) => vatReturn(args),
    issue_ae_einvoice: (state, args = {}) => {
      const built = einvoice(state, args);
      if (!built.ok) return built;
      return sendThroughAsp(state, { document: built.document, xml: built.xml, totals: built.totals, actorId: args.actorId || 'owner' });
    },
    set_ae_business_profile: (state, args = {}) => {
      const profile = profileFrom(args);
      const problems = profileProblems(profile);
      if (problems.length) return fail('BUSINESS_PROFILE_INCOMPLETE', { problems });
      const slice = openCountrySlice(state, 'aeProfile');
      const before = slice.business ? { name: slice.business.name, trn: slice.business.trn || null } : null;
      slice.business = profile;
      slice.updatedAt = new Date().toISOString();
      appendAuditEvent(state, { action: 'ae_business_profile_set', actorId: args.actorId || 'owner', metadata: { before, after: { name: profile.name, trn: profile.trn || null, emirate: profile.emirate, freeZone: profile.freeZone === true } } });
      return { ok: true, data: { saved: true, business: profile } };
    },
    validate_ae_trn: (state, args = {}) => ({ ok: true, data: checkTrn(args.trn) }),
  }),
  preview: Object.freeze({
    issue_ae_einvoice: (state, args = {}) => {
      const built = einvoice(state, args);
      if (!built.ok) return { blockers: (built.problems || [{ field: built.error, why: built.hint || 'Not ready.' }]).map((problem) => `${problem.field}: ${problem.why}`), summary: `E-invoice ${args.number || ''} is not ready.`, effects: [], figures: {} };
      const sandbox = aspMode() !== 'live';
      return {
        blockers: sandbox ? [] : ['No Accredited Service Provider is connected yet; live e-invoices cannot be sent.'],
        summary: `${sandbox ? 'Record (sandbox)' : 'Send'} ${built.document.type === 'credit-note' ? 'credit note' : 'e-invoice'} ${built.document.number} for ${aed(built.totals.payableAed)}${built.totals.currency === 'AED' ? '' : ` (${built.totals.currency} ${built.totals.payable.toFixed(2)})`}.`,
        effects: sandbox ? ['Checked against PINT AE and saved with a UUID; nothing is sent to the FTA.'] : ['The ASP delivers it to the buyer and reports the tax data to the FTA.', 'An issued e-invoice is corrected only by a credit note.'],
        figures: { net: built.totals.net, tax: built.totals.tax, payable: built.totals.payable },
      };
    },
    set_ae_business_profile: (state, args = {}) => {
      const profile = profileFrom(args);
      const problems = profileProblems(profile);
      return { blockers: problems.map((problem) => `${problem.field}: ${problem.why}`), summary: `Save ${profile.name || 'the business'}${profile.trn ? ` (TRN ${profile.trn})` : ''} as the UAE business profile.`, effects: ['VAT returns, corporate tax estimates and e-invoices use these details.'], figures: {} };
    },
  }),
  words: Object.freeze({
    ae_vat_return: (result) => {
      if (!result.ok) return '';
      const d = result.data;
      return d.refund
        ? `VAT 201 for ${d.period}: output tax ${aed(d.totalDue)}, recoverable ${aed(d.totalRecoverable)}, so ${aed(-d.payable)} is refundable or carried forward. File on EmaraTax by ${d.due}.`
        : `VAT 201 for ${d.period}: output tax ${aed(d.totalDue)}, recoverable ${aed(d.totalRecoverable)}, ${aed(d.payable)} to pay by ${d.due} on EmaraTax.`;
    },
    ae_ct_estimate: (result) => {
      if (!result.ok) return '';
      const d = result.data;
      if (d.relief === 'small-business-relief') return `With Small Business Relief the corporate tax for ${d.periodStart} to ${d.periodEnd} is AED 0. The return is still due by ${d.due}.`;
      return `Taxable income is ${aed(d.taxableIncome)} and corporate tax is ${aed(d.payable)}, due by ${d.due}. These figures are not yet reviewed by a UAE registered tax agent.`;
    },
    ae_einvoice_check: (result) => (result.ok ? `The e-invoice is ready: ${aed(result.data.totals.taxAed)} VAT and ${aed(result.data.totals.payableAed)} payable.` : `The e-invoice needs ${(result.problems || []).length} fixes before it can be issued.`),
    validate_ae_trn: (result) => (result.ok ? (result.data.valid ? `TRN ${result.data.trn} has the right format; its TIN is ${result.data.tin}.` : result.data.why) : ''),
  }),
});
