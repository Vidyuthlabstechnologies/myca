import { appendAuditEvent } from '../../ca-api.mjs';
import { countrySlice, openCountrySlice } from '../kit/index.mjs';
import { malaysiaIncomeTax } from './income-tax.mjs';
import { serviceTaxRate, salesTaxRate, sstReturn, sstRegistrationCheck } from './sst.mjs';
import { buildMyInvoisDocument, documentProblems, isTinFormat } from './myinvois-document.mjs';

const PROFILE_FIELDS = ['name', 'tin', 'idType', 'idValue', 'sst', 'ttx', 'msic', 'phone', 'email', 'address'];
const GATE_PENDING = Object.freeze({ ok: false, error: 'GATE_ACTION_PENDING', hint: 'Sending to LHDN MyInvois waits for the MyInvois actions in the action gate. Use my_einvoice_check to prepare the document meanwhile.' });

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

function einvoiceInput(state, args) {
  const stamp = now();
  return { issueDate: stamp.issueDate, issueTime: stamp.issueTime, ...withSupplier(state, args) };
}

function profileFrom(args) {
  return Object.fromEntries(PROFILE_FIELDS.filter((key) => args[key] !== undefined).map((key) => [key, args[key]]));
}

function profileCheck(profile) {
  const probe = { number: 'CHECK', issueDate: '2026-01-01', issueTime: '00:00:00Z', supplier: profile, buyer: { name: 'General Public', tin: 'EI00000000010', address: { city: 'NA', state: '17' } }, lines: [{ description: 'check', classification: '022', unitPrice: 0, taxType: '06' }] };
  return documentProblems(probe).filter((problem) => problem.field.startsWith('supplier.'));
}

function money(value) {
  return `RM${Number(value || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
    my_sst_return: (state, args = {}) => sstReturn(args.lines || [], args.period),
    my_einvoice_check: (state, args = {}) => {
      const built = buildMyInvoisDocument(einvoiceInput(state, args));
      if (!built.ok) return built;
      return { ok: true, data: { ready: true, totals: built.totals, document: built.document } };
    },
    my_einvoice_status: () => GATE_PENDING,
    validate_my_tin: (state, args = {}) => {
      if (!isTinFormat(args.tin)) return { ok: true, data: { tin: String(args.tin || ''), format: false, lhdn: 'not checked', why: 'Not in an LHDN TIN format (IG for individuals, C, CS, D, E, F, FA, PT, TA, TC, TN, TR, TP, J or LE for others).' } };
      return { ok: true, data: { tin: String(args.tin).toUpperCase(), format: true, lhdn: 'pending', hint: GATE_PENDING.hint } };
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
      const built = buildMyInvoisDocument(einvoiceInput(state, args));
      if (!built.ok) return built;
      return { ...GATE_PENDING, totals: built.totals };
    },
    cancel_my_einvoice: () => GATE_PENDING,
  }),
  preview: Object.freeze({
    set_my_einvoice_profile: (state, args = {}) => {
      const problems = profileCheck(profileFrom(args));
      return { blockers: problems.map((problem) => `${problem.field}: ${problem.why}`), summary: `Save ${args.name || 'the business'} (TIN ${args.tin || '?'}) as the supplier on every e-invoice.`, effects: ['Every new e-invoice uses these supplier details.'], figures: {} };
    },
    issue_my_einvoice: (state, args = {}) => {
      const built = buildMyInvoisDocument(einvoiceInput(state, args));
      if (!built.ok) return { blockers: built.problems.map((problem) => `${problem.field}: ${problem.why}`), summary: `E-invoice ${args.number || ''} is not ready.`, effects: [], figures: {} };
      return { blockers: [GATE_PENDING.hint], summary: `Send e-invoice ${args.number} for ${money(built.totals.payable)} to LHDN MyInvois.`, effects: ['LHDN validates it and gives it a UUID and a QR link for the buyer.', 'A validated e-invoice can only be cancelled within 72 hours.'], figures: { net: built.totals.net, tax: built.totals.tax, payable: built.totals.payable } };
    },
    cancel_my_einvoice: (state, args = {}) => ({ blockers: [GATE_PENDING.hint], summary: `Cancel e-invoice ${args.uuid || ''} at LHDN.`, effects: ['The buyer sees it as cancelled; issue a new e-invoice if one is still owed.'], figures: {} }),
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
  }),
});
