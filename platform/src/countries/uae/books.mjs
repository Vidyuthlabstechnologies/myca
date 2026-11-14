import { createAccounts, createTransfers, TRANSFER_FLAGS } from '../../ledger.mjs';
import { postingDate } from '../../dates.mjs';
import { isPeriodLocked } from '../../period-lock.mjs';
import { ensureParty, ensureVendor } from '../../invoice.mjs';
import { invoiceTerms, dueDateOf } from '../../payment-terms.mjs';
import { countrySlice } from '../kit/index.mjs';
import { emirateOf, fail, toFils, toDirhams, ruleOn, percentOf } from './common.mjs';
import { checkTrn } from './trn.mjs';
import { SUPPLY_TREATMENTS, EXPENSE_TREATMENTS, parseVatPeriod } from './vat.mjs';

const SALES = 4000;
const PURCHASES = 5000;
export const VAT_INPUT = 1220;
export const VAT_OUTPUT = 2120;
const FULL_RECOVERY = 10000;
const SELF_ACCOUNTED = new Set(['reverse-charge', 'import', 'import-adjustment']);
const CURRENCY = /^[A-Z]{3}$/;

export function ensureAeAccounts(ledger) {
  createAccounts(ledger, [
    { id: VAT_INPUT, code: String(VAT_INPUT), name: 'VAT input recoverable', type: 'asset', flags: 0 },
    { id: VAT_OUTPUT, code: String(VAT_OUTPUT), name: 'VAT output payable', type: 'liability', flags: 0 },
  ]);
}

function nextTransferId(state) {
  state.transferSeq = (state.transferSeq || 100000) + 1;
  return BigInt(state.transferSeq);
}

function idTaken(list, id) {
  return (list || []).some((doc) => doc.id === id);
}

function profileOf(state) {
  const slice = countrySlice(state, 'aeProfile');
  return slice && slice.business ? slice.business : null;
}

function standardRate(date) {
  const rule = ruleOn('ae.vat.rate', date);
  return rule ? rule.value.standardBasisPoints : null;
}

function currencyOf(input) {
  const currency = String(input.currency || 'AED').trim().toUpperCase();
  if (!CURRENCY.test(currency)) return fail('BAD_CURRENCY', { currency });
  if (currency === 'AED') return { ok: true, currency, exchangeRate: 1 };
  const exchangeRate = Number(input.exchangeRate);
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) return fail('EXCHANGE_RATE_REQUIRED', { currency });
  return { ok: true, currency, exchangeRate };
}

function trnOf(value) {
  const text = String(value || '').replace(/[\s-]/g, '');
  if (!text) return { ok: true, trn: '' };
  const checked = checkTrn(text);
  return checked.valid ? { ok: true, trn: checked.trn } : fail('BAD_TRN', { trn: text, hint: checked.why });
}

function baseLines(input, treatments, fx) {
  const raw = Array.isArray(input.lines) ? input.lines : [];
  if (!raw.length) return fail('NO_LINES');
  const problems = [];
  const lines = raw.map((line, at) => {
    const item = line && typeof line === 'object' ? line : {};
    const qty = Number(item.qty === undefined || item.qty === null || item.qty === '' ? 1 : item.qty);
    const rate = Number(item.rate);
    const treatment = String(item.treatment || 'standard');
    if (!Number.isFinite(qty) || qty <= 0) problems.push({ line: at, field: 'qty', why: 'The quantity is a number above zero.' });
    if (!Number.isFinite(rate) || rate < 0) problems.push({ line: at, field: 'rate', why: 'The price is a number, zero or more.' });
    if (!treatments.includes(treatment)) problems.push({ line: at, field: 'treatment', why: `The VAT treatment is one of ${treatments.join(', ')}.` });
    const amount = Math.round(qty * rate * 100) / 100;
    return { item, at, description: String(item.description || '').trim().slice(0, 200), qty, rate, treatment, amount, net: toFils(amount * fx) || 0 };
  });
  if (problems.length) return fail('BAD_LINES', { problems });
  return { ok: true, lines };
}

function common(state, input, list) {
  const date = postingDate(input.date);
  if (!date) return fail('INVALID_DATE', { date: input.date });
  if (isPeriodLocked(state, date)) return fail('PERIOD_LOCKED', { date, lockThrough: state.lockThrough });
  if (input.id && idTaken(list, input.id)) return fail('DUPLICATE_ID', { id: input.id });
  const rate = standardRate(date);
  if (rate === null) return fail('RULE_NOT_IN_FORCE', { ruleId: 'ae.vat.rate', date, hint: 'UAE VAT started on 1 January 2018.' });
  const money = currencyOf(input);
  if (!money.ok) return money;
  return { ok: true, date, rate, money };
}

export function planAeInvoice(state, input = {}) {
  const base = common(state, input, state.invoices);
  if (!base.ok) return base;
  const { date, rate, money } = base;
  const parsed = baseLines(input, SUPPLY_TREATMENTS, money.exchangeRate);
  if (!parsed.ok) return parsed;
  const profile = profileOf(state);
  const emirate = emirateOf(input.emirate) || emirateOf(profile && profile.emirate);
  if (input.emirate && !emirateOf(input.emirate)) return fail('BAD_EMIRATE', { emirate: input.emirate });
  if (!emirate && parsed.lines.some((line) => line.treatment === 'standard')) return fail('EMIRATE_REQUIRED', { hint: 'Say which emirate the sale was made from, or save the business profile with its emirate.' });
  const buyer = trnOf(input.buyerTrn);
  if (!buyer.ok) return buyer;
  const lines = parsed.lines.map((line) => {
    const vat = line.treatment === 'standard' ? percentOf(line.net, rate) : 0;
    return { description: line.description, qty: line.qty, rate: line.rate, treatment: line.treatment, net: line.net, vat };
  });
  const net = lines.reduce((sum, line) => sum + line.net, 0);
  const vat = lines.reduce((sum, line) => sum + line.vat, 0);
  if (net <= 0) return fail('ZERO_AMOUNT');
  const partyName = String(input.partyName ?? '').trim() || 'Walk-in';
  const terms = invoiceTerms(state, { name: partyName, gstin: '', override: input.paymentTermsDays });
  if (terms.error) return fail(terms.error);
  const warnings = [];
  if (!profile || !profile.trn) warnings.push('The business profile has no TRN yet, so this is not a tax invoice until the TRN is added.');
  if (vat > 0 && net + vat > 1000000 && !buyer.trn) warnings.push('A tax invoice above AED 10,000 should carry the buyer\'s details; add the buyer TRN if they are registered.');
  return {
    ok: true,
    plan: { date, partyName, partyAddress: String(input.partyAddress || '').trim().slice(0, 200), buyerTrn: buyer.trn, emirate: emirate ? emirate.code : '', currency: money.currency, exchangeRate: money.exchangeRate, lines, net, vat, total: net + vat, terms, warnings },
  };
}

function sequenced(state, list, key, prefix, given) {
  if (given) return { id: given, undo: () => {} };
  const before = state[key] || 0;
  const name = (n) => `${prefix}-${String(n).padStart(4, '0')}`;
  do state[key] = (state[key] || 0) + 1;
  while (idTaken(list, name(state[key])));
  return { id: name(state[key]), undo: () => { state[key] = before; } };
}

function post(state, bundle, undo) {
  const transfers = bundle.filter((entry) => entry.amount > 0).map((entry, at, all) => ({ ...entry, id: nextTransferId(state), amount: BigInt(entry.amount), flags: at < all.length - 1 ? TRANSFER_FLAGS.LINKED : 0 }));
  const seqBefore = state.transferSeq - transfers.length;
  const posted = createTransfers(state.ledger, transfers);
  if (posted.some((result) => !result.ok)) {
    state.transferSeq = seqBefore;
    undo();
    return fail('LEDGER_REJECT', { posted });
  }
  return { ok: true, posted };
}

export function createAeInvoice(state, input = {}) {
  const planned = planAeInvoice(state, input);
  if (!planned.ok) return planned;
  const { plan } = planned;
  ensureAeAccounts(state.ledger);
  const party = ensureParty(state, { name: plan.partyName, gstin: '', stateCode: '', address: plan.partyAddress });
  const { id, undo } = sequenced(state, state.invoices, 'invoiceSeq', 'INV', input.id);
  const account = Number(party.accountId);
  const done = post(state, [
    { debitAccountId: account, creditAccountId: SALES, amount: plan.net, invoiceId: id, code: 'SALE', userData: plan.date },
    { debitAccountId: account, creditAccountId: VAT_OUTPUT, amount: plan.vat, invoiceId: id, code: 'AE-VAT-OUT', userData: plan.date },
  ], undo);
  if (!done.ok) return done;
  if (plan.buyerTrn) party.trn = plan.buyerTrn;
  const invoice = {
    id,
    date: plan.date,
    country: 'AE',
    partyName: party.name,
    partyGstin: '',
    partyTrn: plan.buyerTrn,
    partyState: '',
    partyAccountId: party.accountId,
    emirate: plan.emirate,
    currency: plan.currency,
    exchangeRate: plan.exchangeRate,
    lines: plan.lines.map((line) => ({ description: line.description, hsn: '', qty: line.qty, rate: line.rate, treatment: line.treatment, gstRate: 0, taxable: toDirhams(line.net), subtotal: toDirhams(line.net), vat: toDirhams(line.vat), cgst: 0, sgst: 0, igst: 0, amount: toDirhams(line.net + line.vat) })),
    taxable: toDirhams(plan.net),
    subtotal: toDirhams(plan.net),
    vat: toDirhams(plan.vat),
    cgst: 0,
    sgst: 0,
    igst: 0,
    total: toDirhams(plan.total),
    status: 'posted',
    kind: 'sale',
    receipts: [],
    ...(plan.terms.days != null ? { paymentTermsDays: plan.terms.days, dueDate: dueDateOf(plan.date, plan.terms.days) } : {}),
    transferIds: done.posted.map((result) => result.id),
  };
  state.invoices = state.invoices || [];
  state.invoices.push(invoice);
  return { ok: true, invoice, posted: done.posted, warnings: plan.warnings };
}

function recoveryOf(item) {
  if (item.blocked === true) return 0;
  if (item.recoveryBasisPoints === undefined || item.recoveryBasisPoints === null || item.recoveryBasisPoints === '') return FULL_RECOVERY;
  const bp = Number(item.recoveryBasisPoints);
  return Number.isInteger(bp) && bp >= 0 && bp <= FULL_RECOVERY ? bp : null;
}

export function planAePurchase(state, input = {}) {
  const base = common(state, input, state.purchases);
  if (!base.ok) return base;
  const { date, rate, money } = base;
  const parsed = baseLines(input, EXPENSE_TREATMENTS, money.exchangeRate);
  if (!parsed.ok) return parsed;
  const supplier = trnOf(input.supplierTrn);
  if (!supplier.ok) return supplier;
  const problems = [];
  const warnings = [];
  const lines = parsed.lines.map((line) => {
    const recovery = recoveryOf(line.item);
    if (recovery === null) problems.push({ line: line.at, field: 'recoveryBasisPoints', why: 'The recoverable share is a whole number of basis points from 0 to 10000.' });
    const expected = line.treatment === 'standard' || SELF_ACCOUNTED.has(line.treatment) ? percentOf(line.net, rate) : 0;
    let vat = expected;
    if (line.treatment === 'standard' && line.item.vat !== undefined && line.item.vat !== null && line.item.vat !== '') {
      const given = toFils(Number(line.item.vat) * money.exchangeRate);
      if (given === null || given < 0) problems.push({ line: line.at, field: 'vat', why: 'The VAT on the bill is a number, zero or more.' });
      else {
        if (Math.abs(given - expected) > 1 + Math.ceil(line.net / 1000000)) warnings.push(`Line ${line.at + 1}: VAT of AED ${toDirhams(given).toFixed(2)} is not 5% of AED ${toDirhams(line.net).toFixed(2)}; the bill figure is used.`);
        vat = given;
      }
    }
    const recoverable = percentOf(vat, recovery ?? FULL_RECOVERY);
    return { description: line.description, qty: line.qty, rate: line.rate, treatment: line.treatment, net: line.net, vat, recoverable, blocked: line.item.blocked === true, recoveryBasisPoints: recovery ?? FULL_RECOVERY, selfAccounted: SELF_ACCOUNTED.has(line.treatment) };
  });
  if (problems.length) return fail('BAD_LINES', { problems });
  const net = lines.reduce((sum, line) => sum + line.net, 0);
  if (net <= 0) return fail('ZERO_AMOUNT');
  const sum = (pick) => lines.reduce((total, line) => total + pick(line), 0);
  const paidVat = sum((line) => (line.selfAccounted ? 0 : line.vat));
  const selfVat = sum((line) => (line.selfAccounted ? line.vat : 0));
  const recoverablePaid = sum((line) => (line.selfAccounted ? 0 : line.recoverable));
  const recoverableSelf = sum((line) => (line.selfAccounted ? line.recoverable : 0));
  if (paidVat > 0 && !supplier.trn) warnings.push('VAT is recovered only with a tax invoice that shows the supplier\'s TRN; add it.');
  if (lines.some((line) => line.blocked)) warnings.push('Blocked input VAT (entertainment, private motor vehicles) is booked as cost and not recovered.');
  return {
    ok: true,
    plan: { date, partyName: String(input.partyName ?? '').trim() || 'Supplier', supplierTrn: supplier.trn, supplierInvoiceNo: String(input.supplierInvoiceNo ?? '').trim().slice(0, 30), currency: money.currency, exchangeRate: money.exchangeRate, lines, net, paidVat, selfVat, recoverablePaid, recoverableSelf, total: net + paidVat, warnings },
  };
}

export function createAePurchase(state, input = {}) {
  const planned = planAePurchase(state, input);
  if (!planned.ok) return planned;
  const { plan } = planned;
  ensureAeAccounts(state.ledger);
  const vendor = ensureVendor(state, { name: plan.partyName, gstin: '', stateCode: '' });
  const { id, undo } = sequenced(state, state.purchases, 'billSeq', 'BILL', input.id);
  const account = Number(vendor.accountId);
  const done = post(state, [
    { debitAccountId: PURCHASES, creditAccountId: account, amount: plan.net + plan.paidVat - plan.recoverablePaid, invoiceId: id, code: 'PURCHASE', userData: plan.date },
    { debitAccountId: VAT_INPUT, creditAccountId: account, amount: plan.recoverablePaid, invoiceId: id, code: 'AE-VAT-IN', userData: plan.date },
    { debitAccountId: VAT_INPUT, creditAccountId: VAT_OUTPUT, amount: plan.recoverableSelf, invoiceId: id, code: 'AE-VAT-RC', userData: plan.date },
    { debitAccountId: PURCHASES, creditAccountId: VAT_OUTPUT, amount: plan.selfVat - plan.recoverableSelf, invoiceId: id, code: 'AE-VAT-RC-COST', userData: plan.date },
  ], undo);
  if (!done.ok) return done;
  if (plan.supplierTrn) vendor.trn = plan.supplierTrn;
  const bill = {
    id,
    ...(plan.supplierInvoiceNo ? { supplierInvoiceNo: plan.supplierInvoiceNo } : {}),
    date: plan.date,
    country: 'AE',
    partyName: vendor.name,
    partyGstin: '',
    partyTrn: plan.supplierTrn,
    partyState: '',
    partyAccountId: vendor.accountId,
    currency: plan.currency,
    exchangeRate: plan.exchangeRate,
    lines: plan.lines.map((line) => ({ description: line.description, hsn: '', qty: line.qty, rate: line.rate, treatment: line.treatment, gstRate: 0, taxable: toDirhams(line.net), subtotal: toDirhams(line.net), vat: toDirhams(line.vat), recoverableVat: toDirhams(line.recoverable), blocked: line.blocked, recoveryBasisPoints: line.recoveryBasisPoints, cgst: 0, sgst: 0, igst: 0, amount: toDirhams(line.net + (line.selfAccounted ? 0 : line.vat)) })),
    taxable: toDirhams(plan.net),
    subtotal: toDirhams(plan.net),
    vat: toDirhams(plan.paidVat),
    selfAccountedVat: toDirhams(plan.selfVat),
    recoverableVat: toDirhams(plan.recoverablePaid + plan.recoverableSelf),
    cgst: 0,
    sgst: 0,
    igst: 0,
    total: toDirhams(plan.total),
    status: 'posted',
    kind: 'purchase',
    itcEligible: false,
    transferIds: done.posted.map((result) => result.id),
  };
  state.purchases = state.purchases || [];
  state.purchases.push(bill);
  return { ok: true, invoice: bill, posted: done.posted, warnings: plan.warnings };
}

function creditedOn(state, invoiceId) {
  return (state.creditNotes || []).filter((note) => note.invoiceId === invoiceId).reduce((sum, note) => sum + toFils(note.total), 0);
}

export function planAeCreditNote(state, args = {}) {
  const invoiceId = String(args.invoiceId || '').trim().toUpperCase();
  const invoice = (state.invoices || []).find((item) => item.id === invoiceId);
  if (!invoice) return fail('INVOICE_NOT_FOUND', { invoiceId });
  if (invoice.country !== 'AE') return fail('NOT_A_UAE_INVOICE', { invoiceId });
  if (invoice.status === 'cancelled') return fail('INVOICE_CANCELLED', { invoiceId });
  const date = postingDate(args.date);
  if (!date) return fail('INVALID_DATE', { date: args.date });
  if (date < invoice.date) return fail('CREDIT_BEFORE_INVOICE', { invoiceId, date, invoiceDate: invoice.date });
  if (isPeriodLocked(state, date)) return fail('PERIOD_LOCKED', { date, lockThrough: state.lockThrough });
  const total = toFils(invoice.total);
  const room = total - creditedOn(state, invoiceId);
  if (room <= 0) return fail('ALREADY_CREDITED', { invoiceId });
  const wanted = args.amount === undefined || args.amount === null || args.amount === '' ? room : toFils(args.amount);
  if (wanted === null || wanted <= 0) return fail('BAD_AMOUNT');
  if (wanted > room) return fail('MORE_THAN_INVOICE', { invoiceId, room: toDirhams(room) });
  const reason = String(args.reason || '').trim().slice(0, 200);
  if (!reason) return fail('REASON_REQUIRED', { hint: 'Say why the invoice is reduced, for example goods returned or a price agreed lower.' });
  const source = invoice.lines.map((line) => ({ treatment: line.treatment || 'standard', net: toFils(line.subtotal), vat: toFils(line.vat || 0) }));
  let netLeft = 0;
  let vatLeft = 0;
  const lines = source.map((line) => {
    const net = Math.round((line.net * wanted) / total);
    const vat = Math.round((line.vat * wanted) / total);
    netLeft += net;
    vatLeft += vat;
    return { treatment: line.treatment, net, vat };
  });
  const drift = wanted - netLeft - vatLeft;
  if (drift && lines.length) lines[lines.length - 1].net += drift;
  const net = lines.reduce((sum, line) => sum + line.net, 0);
  const vat = lines.reduce((sum, line) => sum + line.vat, 0);
  return { ok: true, plan: { invoice, date, reason, lines, net, vat, total: wanted, full: wanted === room && room === total } };
}

export function createAeCreditNote(state, args = {}) {
  const planned = planAeCreditNote(state, args);
  if (!planned.ok) return planned;
  const { plan } = planned;
  const { invoice } = plan;
  ensureAeAccounts(state.ledger);
  const { id, undo } = sequenced(state, state.creditNotes, 'creditNoteSeq', 'CN', null);
  const account = Number(invoice.partyAccountId);
  const done = post(state, [
    { debitAccountId: SALES, creditAccountId: account, amount: plan.net, invoiceId: id, code: 'CREDIT_NOTE', userData: plan.date },
    { debitAccountId: VAT_OUTPUT, creditAccountId: account, amount: plan.vat, invoiceId: id, code: 'AE-CN-VAT', userData: plan.date },
  ], undo);
  if (!done.ok) return done;
  const note = {
    id,
    date: plan.date,
    invoiceId: invoice.id,
    invoiceDate: invoice.date,
    partyName: invoice.partyName,
    partyAccountId: invoice.partyAccountId,
    country: 'AE',
    emirate: invoice.emirate,
    reason: plan.reason,
    cancels: plan.full,
    lines: plan.lines.map((line) => ({ treatment: line.treatment, taxable: toDirhams(line.net), vat: toDirhams(line.vat) })),
    taxable: toDirhams(plan.net),
    vat: toDirhams(plan.vat),
    cgst: 0,
    sgst: 0,
    igst: 0,
    salesTax: 0,
    total: toDirhams(plan.total),
    transferIds: done.posted.map((result) => result.id),
  };
  state.creditNotes = state.creditNotes || [];
  state.creditNotes.push(note);
  invoice.creditNoteIds = [...(invoice.creditNoteIds || []), id];
  const received = (invoice.receipts || []).reduce((sum, receipt) => sum + toFils(receipt.amount || 0), 0);
  if (note.cancels) invoice.status = 'cancelled';
  else if (creditedOn(state, invoice.id) + received >= toFils(invoice.total)) invoice.status = 'settled';
  return { ok: true, creditNote: note, invoice, posted: done.posted };
}

export function aeVatLines(state, args = {}) {
  const period = parseVatPeriod(args.period);
  if (!period.ok) return period;
  const inside = (doc) => doc && doc.country === 'AE' && doc.date >= period.start && doc.date <= period.end;
  const lines = [];
  const counts = { invoices: 0, creditNotes: 0, purchases: 0 };
  for (const invoice of (state.invoices || []).filter(inside)) {
    counts.invoices += 1;
    for (const line of invoice.lines || []) lines.push({ kind: 'supply', treatment: line.treatment || 'standard', emirate: invoice.emirate, net: line.subtotal, vat: line.vat || 0, date: invoice.date, source: invoice.id });
  }
  for (const note of (state.creditNotes || []).filter(inside)) {
    counts.creditNotes += 1;
    for (const line of note.lines || []) lines.push({ kind: 'supply', treatment: line.treatment || 'standard', emirate: note.emirate, net: -line.taxable, vat: -(line.vat || 0), date: note.date, source: note.id });
  }
  for (const bill of (state.purchases || []).filter(inside)) {
    counts.purchases += 1;
    for (const line of bill.lines || []) {
      const out = { kind: 'expense', treatment: line.treatment || 'standard', net: line.subtotal, vat: line.vat || 0, date: bill.date, source: bill.id };
      if (line.blocked) out.blocked = true;
      else if (line.recoveryBasisPoints !== undefined && line.recoveryBasisPoints !== FULL_RECOVERY) out.recoveryBasisPoints = line.recoveryBasisPoints;
      lines.push(out);
    }
  }
  const otherBooks = ['invoices', 'purchases', 'expenses'].reduce((sum, key) => sum + (state[key] || []).filter((doc) => doc && doc.country !== 'AE' && doc.date >= period.start && doc.date <= period.end).length, 0);
  const warnings = [];
  if (otherBooks) warnings.push(`${otherBooks} entr${otherBooks === 1 ? 'y' : 'ies'} in ${period.label} were not made as UAE sales or purchases and carry no VAT treatment, so they are left out. Re-enter them as UAE documents or add them as lines.`);
  return { ok: true, data: { period: period.label, start: period.start, end: period.end, lines, counts, warnings } };
}
