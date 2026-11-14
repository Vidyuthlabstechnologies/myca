import { createAccounts, createTransfers, TRANSFER_FLAGS } from '../../ledger.mjs';
import { postingDate, localToday } from '../../dates.mjs';
import { isPeriodLocked } from '../../period-lock.mjs';
import { ensureParty, ensureVendor } from '../../invoice.mjs';
import { invoiceTerms, dueDateOf } from '../../payment-terms.mjs';
import { gbRule, toPence, toPounds, share, isIsoDate } from './rules.mjs';
import { normaliseVrn, vrnValid } from './identifiers.mjs';

const SALES = 4000;
const PURCHASES = 5000;
const VAT_OUTPUT = 2120;
const VAT_INPUT = 1220;

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function nextTransferId(state) {
  state.transferSeq = (state.transferSeq || 100000) + 1;
  return BigInt(state.transferSeq);
}

function idTaken(list, id) {
  return (list || []).some((doc) => doc.id === id);
}

export function ensureGbAccounts(ledger) {
  createAccounts(ledger, [
    { id: VAT_OUTPUT, code: String(VAT_OUTPUT), name: 'VAT output', type: 'liability', flags: 0 },
    { id: VAT_INPUT, code: String(VAT_INPUT), name: 'VAT input', type: 'asset', flags: 0 },
  ]);
}

function registeredForVat(state) {
  const vrn = normaliseVrn(state.countryData?.gbTaxpayer?.vrn || '');
  return vrnValid(vrn) ? vrn : '';
}

function vatCode(line, rates) {
  if (line.supply === 'exempt') return { code: 'exempt', basisPoints: 0 };
  if (line.supply === 'non-gst') return { code: 'outside-scope', basisPoints: 0 };
  if (line.supply === 'nil') return { code: 'zero', basisPoints: 0 };
  const percent = Number(line.gstRate);
  if (!Number.isFinite(percent)) return null;
  const basisPoints = Math.round(percent * 100);
  if (basisPoints === rates.standardBasisPoints) return { code: 'standard', basisPoints };
  if (basisPoints === rates.reducedBasisPoints) return { code: 'reduced', basisPoints };
  if (basisPoints === 0) return { code: 'zero', basisPoints: 0 };
  return null;
}

function planLines(state, input, date, { charging }) {
  const raw = Array.isArray(input.lines) ? input.lines : [];
  if (!raw.length) return fail('NO_LINES');
  const rule = gbRule('gb.vat.rates', date);
  if (!rule) return fail('RULES_MISSING', { missing: ['gb.vat.rates'] });
  const rates = rule.value;
  const lines = [];
  for (const [index, line] of raw.entries()) {
    const qty = Number(line?.qty == null || line?.qty === '' ? 1 : line.qty);
    const rate = Number(line?.rate);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(rate) || rate < 0) return fail('BAD_LINE', { line: index });
    const net = Math.round(qty * rate * 100);
    let code = { code: 'outside-scope', basisPoints: 0 };
    if (charging) {
      if ((line.gstRate == null || line.gstRate === '') && !line.supply) return fail('VAT_RATE_NEEDED', { line: index, hint: `Line ${index + 1} has no VAT rate. Say 20%, 5%, 0%, exempt or outside the scope.` });
      code = vatCode(line, rates);
      if (!code) return fail('BAD_VAT_RATE', { line: index, hint: `UK VAT is ${rates.standardBasisPoints / 100}%, ${rates.reducedBasisPoints / 100}% or 0%, or the supply is exempt or outside the scope.` });
    }
    const vat = share(net, code.basisPoints, 'half-up');
    lines.push({ description: String(line?.description || '').trim(), qty, rate, net, vatCode: code.code, vatPercent: code.basisPoints / 100, vat });
  }
  const net = lines.reduce((sum, line) => sum + line.net, 0);
  if (net <= 0) return fail('ZERO_AMOUNT');
  return { ok: true, lines, net, vat: lines.reduce((sum, line) => sum + line.vat, 0) };
}

export function planGbInvoice(state, input = {}) {
  const date = postingDate(input.date);
  if (!date) return fail('INVALID_DATE', { date: input.date });
  if (isPeriodLocked(state, date)) return fail('PERIOD_LOCKED', { date, lockThrough: state.lockThrough });
  if (input.id && idTaken(state.invoices, input.id)) return fail('DUPLICATE_ID', { id: input.id });
  const vrn = registeredForVat(state);
  const parsed = planLines(state, input, date, { charging: Boolean(vrn) });
  if (!parsed.ok) return parsed;
  const partyName = String(input.partyName ?? '').trim() || 'Customer';
  const terms = invoiceTerms(state, { name: partyName, gstin: '', override: input.paymentTermsDays });
  if (terms.error) return fail(terms.error);
  const notes = vrn ? [] : ['The business has no VAT number saved, so no VAT is charged. Save the VAT number in the UK taxpayer details once registered.'];
  return { ok: true, plan: { date, partyName, partyAddress: String(input.partyAddress || '').trim(), vrn, lines: parsed.lines, net: parsed.net, vat: parsed.vat, total: parsed.net + parsed.vat, terms, notes } };
}

function documentLines(lines) {
  return lines.map((line) => ({ description: line.description, hsn: '', qty: line.qty, rate: line.rate, gstRate: line.vatPercent, vatCode: line.vatCode, vatPercent: line.vatPercent, taxable: toPounds(line.net), subtotal: toPounds(line.net), vat: toPounds(line.vat), cgst: 0, sgst: 0, igst: 0, amount: toPounds(line.net + line.vat) }));
}

export function createGbInvoice(state, input = {}) {
  const planned = planGbInvoice(state, input);
  if (!planned.ok) return planned;
  const { plan } = planned;
  ensureGbAccounts(state.ledger);
  const party = ensureParty(state, { name: plan.partyName, gstin: '', stateCode: '', address: plan.partyAddress });
  const assignedSeq = !input.id;
  const seqBefore = state.invoiceSeq || 0;
  const name = (n) => `INV-${String(n).padStart(4, '0')}`;
  if (assignedSeq) {
    do state.invoiceSeq = (state.invoiceSeq || 0) + 1;
    while (idTaken(state.invoices, name(state.invoiceSeq)));
  }
  const id = input.id || name(state.invoiceSeq);
  const linked = TRANSFER_FLAGS.LINKED;
  const bundle = [{ id: nextTransferId(state), debitAccountId: Number(party.accountId), creditAccountId: SALES, amount: BigInt(plan.net), flags: linked, invoiceId: id, code: 'SALE', userData: plan.date }];
  if (plan.vat > 0) bundle.push({ id: nextTransferId(state), debitAccountId: Number(party.accountId), creditAccountId: VAT_OUTPUT, amount: BigInt(plan.vat), flags: linked, invoiceId: id, code: 'VAT-OUTPUT', userData: plan.date });
  const posted = createTransfers(state.ledger, bundle);
  if (posted.some((result) => !result.ok)) {
    if (assignedSeq) state.invoiceSeq = seqBefore;
    return fail('LEDGER_REJECT', { posted });
  }
  const invoice = {
    id,
    date: plan.date,
    country: 'GB',
    supplierVrn: plan.vrn,
    partyName: party.name,
    partyGstin: '',
    partyState: '',
    partyAccountId: party.accountId,
    lines: documentLines(plan.lines),
    taxable: toPounds(plan.net),
    subtotal: toPounds(plan.net),
    vat: toPounds(plan.vat),
    cgst: 0,
    sgst: 0,
    igst: 0,
    total: toPounds(plan.total),
    status: 'posted',
    kind: 'sale',
    receipts: [],
    ...(plan.terms.days != null ? { paymentTermsDays: plan.terms.days, dueDate: dueDateOf(plan.date, plan.terms.days) } : {}),
    transferIds: posted.map((result) => result.id),
  };
  state.invoices = state.invoices || [];
  state.invoices.push(invoice);
  return { ok: true, invoice, posted, notes: plan.notes };
}

export function planGbPurchase(state, input = {}) {
  const date = postingDate(input.date);
  if (!date) return fail('INVALID_DATE', { date: input.date });
  if (isPeriodLocked(state, date)) return fail('PERIOD_LOCKED', { date, lockThrough: state.lockThrough });
  if (input.id && idTaken(state.purchases, input.id)) return fail('DUPLICATE_ID', { id: input.id });
  const vrn = registeredForVat(state);
  const parsed = planLines(state, input, date, { charging: true });
  if (!parsed.ok) return parsed;
  const partyName = String(input.partyName ?? '').trim() || 'Supplier';
  const supplierInvoiceNo = String(input.supplierInvoiceNo ?? '').trim().slice(0, 30);
  const reclaim = vrn ? parsed.vat : 0;
  const notes = vrn ? [] : ['The business has no VAT number saved, so the VAT paid is part of the cost and is not reclaimed.'];
  return { ok: true, plan: { date, partyName, supplierInvoiceNo, vrn, lines: parsed.lines, net: parsed.net, vat: parsed.vat, reclaim, total: parsed.net + parsed.vat, notes } };
}

export function createGbPurchase(state, input = {}) {
  const planned = planGbPurchase(state, input);
  if (!planned.ok) return planned;
  const { plan } = planned;
  ensureGbAccounts(state.ledger);
  const vendor = ensureVendor(state, { name: plan.partyName, gstin: '', stateCode: '' });
  const assignedSeq = !input.id;
  const seqBefore = state.billSeq || 0;
  const name = (n) => `BILL-${String(n).padStart(4, '0')}`;
  if (assignedSeq) {
    do state.billSeq = (state.billSeq || 0) + 1;
    while (idTaken(state.purchases, name(state.billSeq)));
  }
  const id = input.id || name(state.billSeq);
  const linked = TRANSFER_FLAGS.LINKED;
  const bundle = [{ id: nextTransferId(state), debitAccountId: PURCHASES, creditAccountId: Number(vendor.accountId), amount: BigInt(plan.total - plan.reclaim), flags: linked, invoiceId: id, code: 'PURCHASE', userData: plan.date }];
  if (plan.reclaim > 0) bundle.push({ id: nextTransferId(state), debitAccountId: VAT_INPUT, creditAccountId: Number(vendor.accountId), amount: BigInt(plan.reclaim), flags: linked, invoiceId: id, code: 'VAT-INPUT', userData: plan.date });
  const posted = createTransfers(state.ledger, bundle);
  if (posted.some((result) => !result.ok)) {
    if (assignedSeq) state.billSeq = seqBefore;
    return fail('LEDGER_REJECT', { posted });
  }
  const bill = {
    id,
    ...(plan.supplierInvoiceNo ? { supplierInvoiceNo: plan.supplierInvoiceNo } : {}),
    date: plan.date,
    country: 'GB',
    partyName: vendor.name,
    partyGstin: '',
    partyState: '',
    partyAccountId: vendor.accountId,
    lines: documentLines(plan.lines),
    taxable: toPounds(plan.net),
    subtotal: toPounds(plan.net),
    vat: toPounds(plan.vat),
    vatReclaimed: toPounds(plan.reclaim),
    cgst: 0,
    sgst: 0,
    igst: 0,
    total: toPounds(plan.total),
    status: 'posted',
    kind: 'purchase',
    itcEligible: plan.reclaim > 0,
    transferIds: posted.map((result) => result.id),
  };
  state.purchases = state.purchases || [];
  state.purchases.push(bill);
  return { ok: true, invoice: bill, posted, notes: plan.notes };
}

export function gbDocumentPreview(state, args = {}, kind) {
  const planned = kind === 'sale' ? planGbInvoice(state, args) : planGbPurchase(state, args);
  if (!planned.ok) return { blockers: [planned.hint || words(planned)], summary: '', effects: [], figures: {} };
  const { plan } = planned;
  const money = (pence) => `£${toPounds(pence).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const sale = kind === 'sale';
  return {
    blockers: [],
    summary: `${sale ? 'Invoice' : 'Record a bill from'} ${plan.partyName} for ${money(plan.total)} (${money(plan.net)} plus ${money(plan.vat)} VAT) on ${plan.date}.`,
    effects: [
      ...plan.lines.map((line) => `${line.description || 'Line'}: ${money(line.net)} at ${line.vatCode === 'standard' || line.vatCode === 'reduced' ? `${line.vatPercent}%` : line.vatCode.replace('-', ' ')}`),
      sale ? (plan.vat ? `${money(plan.vat)} goes to VAT output for the VAT return.` : 'No VAT is charged.') : (plan.reclaim ? `${money(plan.reclaim)} VAT is reclaimed on the VAT return.` : 'No VAT is reclaimed.'),
      ...plan.notes,
    ],
    figures: { net: toPounds(plan.net), vat: toPounds(plan.vat), total: toPounds(plan.total) },
  };
}

function words(out) {
  return {
    INVALID_DATE: 'That date cannot be read.',
    PERIOD_LOCKED: `That date is inside the locked period (through ${out.lockThrough}).`,
    DUPLICATE_ID: `${out.id} already exists in these books.`,
    NO_LINES: 'Add at least one line.',
    BAD_LINE: `Line ${Number(out.line) + 1} needs a quantity above zero and a price.`,
    ZERO_AMOUNT: 'The total is zero.',
  }[out.error] || out.error;
}

export function vatLinesFromBooks(state, { from, to }) {
  if (!isIsoDate(from) || !isIsoDate(to) || to < from) return fail('BAD_PERIOD', { hint: 'Give from and to as the first and last day of the VAT period.' });
  const inPeriod = (doc) => doc.country === 'GB' && doc.status !== 'cancelled' && doc.date >= from && doc.date <= to;
  const toLine = (line) => ({ net: line.subtotal ?? line.taxable ?? 0, vat: line.vat ?? 0, rate: line.vatCode || 'standard' });
  const sales = (state.invoices || []).filter(inPeriod).flatMap((doc) => doc.lines.map(toLine));
  const purchases = (state.purchases || []).filter(inPeriod).flatMap((doc) => doc.lines.map((line) => ({ ...toLine(line), vat: doc.vatReclaimed === 0 ? 0 : line.vat ?? 0 })));
  const skipped = [...(state.invoices || []), ...(state.purchases || [])].filter((doc) => doc.date >= from && doc.date <= to && doc.country !== 'GB' && doc.status !== 'cancelled').length;
  return { ok: true, sales, purchases, documents: (state.invoices || []).filter(inPeriod).length + (state.purchases || []).filter(inPeriod).length, skipped, today: localToday() };
}
