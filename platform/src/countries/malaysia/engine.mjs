import { appendAuditEvent } from '../../ca-api.mjs';
import { countrySlice, openCountrySlice } from '../kit/index.mjs';
import { malaysiaIncomeTax } from './income-tax.mjs';
import { serviceTaxRate, salesTaxRate, sstReturn, sstRegistrationCheck } from './sst.mjs';
import { buildMyInvoisDocument, documentProblems, isTinFormat } from './myinvois-document.mjs';
import { submitMyInvois, cancelMyInvois, readMyInvoisSubmission, readMyInvoisDocument, rejectMyInvois, listReceivedMyInvois, listIssuedMyInvois, checkMyTin, simulateReceivedMyInvois, myInvoisMode } from './myinvois-actions.mjs';
import { consolidatedInput, selfBilledInput, einvoiceRequired } from './myinvois-special.mjs';
import { lookupCodes } from './lhdn-codes.mjs';
import { nricShapeError } from '../../my-identity.mjs';

const PROFILE_FIELDS = ['name', 'tin', 'idType', 'idValue', 'sst', 'ttx', 'msic', 'phone', 'email', 'address'];
const ID_SHAPES = Object.freeze({
  BRN: /^(?:\d{12}|\d{6,7}-?[A-Z])$/,
  PASSPORT: /^[A-Z0-9]{5,20}$/,
  ARMY: /^[A-Z0-9]{5,20}$/,
});

const CONSOLIDATED_ELSEWHERE = Object.freeze({ ok: false, error: 'USE_CONSOLIDATED_TOOL', hint: 'Issue the month\'s consolidated e-invoice with issue_my_consolidated_einvoice, which checks the 7-day window, excluded activities and the RM10,000 limit.' });

function supplierProfile(state) {
  const saved = countrySlice(state, 'myEinvoiceProfile');
  return saved && saved.supplier ? saved.supplier : null;
}

function withSupplier(state, args) {
  return { ...args, supplier: args.supplier || supplierProfile(state) || undefined };
}

function now() {
  const iso = new Date().toISOString();
  return { issueDate: iso.slice(0, 10), issueTime: `${iso.slice(11, 19)}Z` };
}

function stamped(input) {
  const stamp = now();
  return { issueDate: stamp.issueDate, issueTime: stamp.issueTime, ...input };
}

function einvoiceInput(state, args) {
  return stamped(withSupplier(state, args));
}

function profileFrom(args) {
  return Object.fromEntries(PROFILE_FIELDS.filter((key) => args[key] !== undefined).map((key) => [key, args[key]]));
}

function profileCheck(profile) {
  const probe = { number: 'CHECK', issueDate: '2026-01-01', issueTime: '00:00:00Z', supplier: profile, buyer: { name: 'General Public', tin: 'EI00000000010', address: { city: 'NA', state: '17' } }, lines: [{ description: 'check', classification: '022', unitPrice: 0, taxType: '06' }] };
  return documentProblems(probe).filter((problem) => problem.field.startsWith('supplier.'));
}

function money(value, currency = 'MYR') {
  const amount = Number(value || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === 'MYR' ? `RM${amount}` : `${currency} ${amount}`;
}

function blockersOf(out) {
  if (out.problems && out.problems.length) return out.problems.map((problem) => `${problem.field}: ${problem.why}`);
  return [out.why || out.hint || out.error];
}

function idShapeError(idType, idValue) {
  const type = String(idType || 'BRN').toUpperCase();
  const value = String(idValue || '').trim().toUpperCase();
  if (!value) return 'ID_VALUE_REQUIRED';
  if (type === 'NRIC') return nricShapeError(value);
  const shape = ID_SHAPES[type];
  if (!shape) return 'BAD_ID_TYPE';
  return shape.test(value) ? null : `${type}_BAD_FORMAT`;
}

function consolidatedBuild(state, args) {
  const prepared = consolidatedInput(state, args);
  if (!prepared.ok) return prepared;
  const built = buildMyInvoisDocument(stamped(prepared.input));
  if (!built.ok) return built;
  return { ...prepared, built };
}

function selfBilledBuild(state, args) {
  const prepared = selfBilledInput(state, args);
  if (!prepared.ok) return prepared;
  const built = buildMyInvoisDocument(stamped({ ...prepared.input, ...(args.issueDate ? { issueDate: args.issueDate } : {}), ...(args.issueTime ? { issueTime: args.issueTime } : {}) }));
  if (!built.ok) return built;
  return { ...prepared, built };
}

function issueSummary(label, number, totals) {
  const foreign = totals.currency && totals.currency !== 'MYR';
  return `Send ${label} ${number} for ${money(totals.payable, totals.currency)}${foreign ? ` (${money(totals.payableMyr)} at ${totals.exchangeRate})` : ''} to LHDN MyInvois.`;
}

function where() {
  const mode = myInvoisMode();
  if (mode === 'sandbox') return 'This goes to the built-in MyInvois sandbox; nothing reaches LHDN.';
  if (mode === 'mock') return 'Mock mode: nothing leaves.';
  if (mode === 'live') return 'This goes to LHDN production and needs the accountant\'s approval.';
  return 'This goes to the LHDN preprod sandbox.';
}

export const ENGINE = Object.freeze({
  country: 'MY',
  run: Object.freeze({
    my_tax_estimate: (state, args = {}) => malaysiaIncomeTax(args),
    my_sst_rate: (state, args = {}) => {
      const out = args.kind === 'sales' ? salesTaxRate(args.rateBasisPoints, args.date) : serviceTaxRate(args.category, args.date);
      if (!out.ok) return out;
      return { ok: true, data: { kind: out.kind, percent: out.basisPoints === undefined ? null : out.basisPoints / 100, flat: out.amountSen ? out.amountSen / 100 : null, ruleId: out.record.id, effectiveFrom: out.record.effectiveFrom, unreviewed: !(out.record.attestations || []).length } };
    },
    my_sst_registration: (state, args = {}) => sstRegistrationCheck(args),
    my_sst_return: (state, args = {}) => sstReturn(args.lines ?? null, args.period),
    my_lhdn_codes: (state, args = {}) => lookupCodes(args),
    my_einvoice_required: (state, args = {}) => einvoiceRequired(args),
    my_einvoice_check: (state, args = {}) => {
      const built = buildMyInvoisDocument(einvoiceInput(state, args));
      if (!built.ok) return built;
      return { ok: true, data: { ready: true, totals: built.totals, document: built.document } };
    },
    my_einvoice_status: (state, args = {}) => readMyInvoisSubmission(state, args),
    my_einvoice_details: (state, args = {}) => readMyInvoisDocument(state, args),
    my_einvoices: (state, args = {}) => listIssuedMyInvois(state, args),
    my_received_einvoices: (state, args = {}) => listReceivedMyInvois(state, args),
    validate_my_tin: (state, args = {}) => {
      if (!isTinFormat(args.tin)) return { ok: true, data: { tin: String(args.tin || ''), format: false, lhdn: 'not checked', why: 'Not in an LHDN TIN format (IG for individuals, C, CS, D, E, F, FA, PT, TA, TC, TN, TR, TP, J or LE for others).' } };
      const idError = idShapeError(args.idType, args.idValue);
      if (idError) return { ok: true, data: { tin: String(args.tin).trim().toUpperCase(), format: true, idFormat: false, idError, lhdn: 'not checked', why: `The ${String(args.idType || 'BRN').toUpperCase()} number is not in its format (BRN: 12 digits; MyKad: 12 digits as YYMMDD-PB-###G).` } };
      return checkMyTin(state, args);
    },
    set_my_einvoice_profile: (state, args = {}) => {
      const profile = profileFrom(args);
      const problems = profileCheck(profile);
      if (problems.length) return { ok: false, error: 'EINVOICE_PROFILE_INCOMPLETE', problems };
      const slice = openCountrySlice(state, 'myEinvoiceProfile');
      const before = slice.supplier ? { tin: slice.supplier.tin, name: slice.supplier.name } : null;
      slice.supplier = profile;
      slice.updatedAt = new Date().toISOString();
      appendAuditEvent(state, { action: 'my_einvoice_profile_set', actorId: args.actorId || 'owner', metadata: { before, after: { tin: profile.tin, name: profile.name, msic: profile.msic } } });
      return { ok: true, data: { saved: true, supplier: { name: profile.name, tin: profile.tin, msic: profile.msic } } };
    },
    issue_my_einvoice: (state, args = {}) => {
      if (args.consolidated) return CONSOLIDATED_ELSEWHERE;
      const input = einvoiceInput(state, args);
      const built = buildMyInvoisDocument(input);
      if (!built.ok) return built;
      return submitMyInvois(state, { ...args, type: input.type || 'invoice', kind: input.consolidated ? 'consolidated' : 'invoice', issueDate: input.issueDate, supplier: input.supplier, buyer: input.buyer, document: built.document, totals: built.totals });
    },
    issue_my_consolidated_einvoice: async (state, args = {}) => {
      const prepared = consolidatedBuild(state, args);
      if (!prepared.ok) return prepared;
      const out = await submitMyInvois(state, { ...args, number: prepared.input.number, type: 'invoice', kind: 'consolidated', issueDate: now().issueDate, supplier: prepared.input.supplier, buyer: prepared.input.buyer, period: prepared.period, document: prepared.built.document, totals: prepared.built.totals });
      if (prepared.late && out.ok) appendAuditEvent(state, { action: 'my_einvoice_consolidated_late', actorId: args.actorId || 'owner', metadata: { number: prepared.input.number, month: args.month, due: prepared.due, reason: String(args.lateReason || '') } });
      return out.ok ? { ...out, data: { ...out.data, late: prepared.late, due: prepared.due } } : out;
    },
    issue_my_self_billed_einvoice: (state, args = {}) => {
      const prepared = selfBilledBuild(state, args);
      if (!prepared.ok) return prepared;
      return submitMyInvois(state, { ...args, number: prepared.input.number, type: prepared.input.type, kind: 'self-billed', issueDate: prepared.input.issueDate || now().issueDate, supplier: prepared.input.supplier, buyer: prepared.input.buyer, original: prepared.input.original, document: prepared.built.document, totals: prepared.built.totals });
    },
    cancel_my_einvoice: (state, args = {}) => cancelMyInvois(state, args),
    reject_my_einvoice: (state, args = {}) => rejectMyInvois(state, args),
    simulate_my_received_einvoice: (state, args = {}) => simulateReceivedMyInvois(state, args),
  }),
  preview: Object.freeze({
    set_my_einvoice_profile: (state, args = {}) => {
      const problems = profileCheck(profileFrom(args));
      return { blockers: problems.map((problem) => `${problem.field}: ${problem.why}`), summary: `Save ${args.name || 'the business'} (TIN ${args.tin || '?'}) as the supplier on every e-invoice.`, effects: ['Every new e-invoice uses these supplier details.'], figures: {} };
    },
    issue_my_einvoice: (state, args = {}) => {
      if (args.consolidated) return { blockers: [CONSOLIDATED_ELSEWHERE.hint], summary: 'Use the consolidated e-invoice tool.', effects: [], figures: {} };
      const built = buildMyInvoisDocument(einvoiceInput(state, args));
      if (!built.ok) return { blockers: built.problems.map((problem) => `${problem.field}: ${problem.why}`), summary: `E-invoice ${args.number || ''} is not ready.`, effects: [], figures: {} };
      return { blockers: [], summary: issueSummary('e-invoice', args.number, built.totals), effects: ['LHDN validates it and gives it a UUID and a QR link for the buyer.', 'A validated e-invoice can only be cancelled within 72 hours.', where()], figures: { net: built.totals.net, tax: built.totals.tax, payable: built.totals.payable, payableMyr: built.totals.payableMyr } };
    },
    issue_my_consolidated_einvoice: (state, args = {}) => {
      const prepared = consolidatedBuild(state, args);
      if (!prepared.ok) return { blockers: blockersOf(prepared), summary: `The consolidated e-invoice for ${args.month || 'the month'} is not ready.`, effects: [], figures: {} };
      const effects = ['One e-invoice to the general public (TIN EI00000000010) for the month\'s receipts, classification 004.', `LHDN expects it by ${prepared.due}.`, where()];
      if (prepared.late) effects.unshift(`This is late: it was due by ${prepared.due}. The late submission is recorded in the audit trail.`);
      return { blockers: [], summary: issueSummary('consolidated e-invoice', prepared.input.number, prepared.built.totals), effects, figures: { net: prepared.built.totals.net, tax: prepared.built.totals.tax, payable: prepared.built.totals.payable } };
    },
    issue_my_self_billed_einvoice: (state, args = {}) => {
      const prepared = selfBilledBuild(state, args);
      if (!prepared.ok) return { blockers: blockersOf(prepared), summary: `Self-billed e-invoice ${args.number || ''} is not ready.`, effects: [], figures: {} };
      const effects = ['The business issues it as the buyer, on behalf of the supplier named.', where()];
      if (prepared.foreign) effects.unshift('The foreign supplier gets the general foreign-supplier TIN EI00000000030.');
      return { blockers: [], summary: issueSummary('self-billed e-invoice', prepared.input.number, prepared.built.totals), effects, figures: { net: prepared.built.totals.net, tax: prepared.built.totals.tax, payable: prepared.built.totals.payable, payableMyr: prepared.built.totals.payableMyr } };
    },
    cancel_my_einvoice: (state, args = {}) => ({ blockers: String(args.reason || '').trim() ? [] : ['Give the reason for cancelling.'], summary: `Cancel e-invoice ${args.uuid || ''} at LHDN.`, effects: ['The buyer sees it as cancelled; issue a new e-invoice if one is still owed.', where()], figures: {} }),
    reject_my_einvoice: (state, args = {}) => ({ blockers: String(args.reason || '').trim() ? [] : ['Give the reason for rejecting.'], summary: `Ask the supplier to cancel e-invoice ${args.uuid || ''}.`, effects: ['LHDN tells the supplier; the e-invoice stays valid until the supplier cancels it.', 'A received e-invoice can be rejected once, within 72 hours of validation.', where()], figures: {} }),
    simulate_my_received_einvoice: (state, args = {}) => ({ blockers: myInvoisMode() === 'sandbox' ? [] : ['Only in the built-in MyInvois sandbox.'], summary: `Pretend supplier ${args.supplier?.name || ''} sent e-invoice ${args.number || ''} to the business.`, effects: ['Sandbox only: it shows up in my_received_einvoices so rejection can be tried.'], figures: {} }),
  }),
  words: Object.freeze({
    my_tax_estimate: (result) => {
      if (!result.ok) return '';
      const d = result.data;
      const tail = d.outcome === 'to pay' ? `${money(d.balance)} still to pay after PCB` : d.outcome === 'refund due' ? `a refund of ${money(-d.balance)}` : 'nothing more to pay';
      return `For year of assessment ${d.yearOfAssessment}, chargeable income is ${money(d.chargeableIncome)} and tax is ${money(d.taxPayable)}, so ${tail}. These figures are not yet reviewed by a Malaysian tax agent.`;
    },
    my_sst_return: (result) => (result.ok ? `SST-02 for ${result.data.period}: sales tax ${money(result.data.salesTax)}, service tax ${money(result.data.serviceTax)}, total ${money(result.data.totalTax)}, due ${result.data.due}.` : ''),
    my_einvoice_check: (result) => (result.ok ? `The e-invoice is ready: ${money(result.data.totals.net)} before tax, ${money(result.data.totals.tax)} tax, ${money(result.data.totals.payable)} payable.` : `The e-invoice needs ${(result.problems || []).length} fixes before LHDN will accept it.`),
    my_einvoice_required: (result) => (result.ok ? `${result.data.required ? 'E-invoicing applies.' : result.data.exempt ? 'Exempt from e-invoicing.' : `E-invoicing starts on ${result.data.startsFrom}.`} ${result.data.why}` : ''),
    my_einvoices: (result) => (result.ok ? `${result.data.total} e-invoice${result.data.total === 1 ? '' : 's'} issued from the book.` : ''),
  }),
});
