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
  const flatRate = Boolean(vrn) && state.countryData?.gbTaxpayer?.vatScheme === 'flat-rate';
  const reclaim = vrn && !flatRate ? parsed.vat : 0;
  const notes = !vrn ? ['The business has no VAT number saved, so the VAT paid is part of the cost and is not reclaimed.'] : flatRate ? ['The business uses the Flat Rate Scheme, so the VAT paid is part of the cost and is not reclaimed. A capital asset over the scheme limit is the exception: claim it on the VAT return.'] : [];
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
  const counted = (doc) => doc.status !== 'cancelled' || (doc.creditNoteIds || []).length > 0;
  const inPeriod = (doc) => doc.country === 'GB' && counted(doc) && doc.date >= from && doc.date <= to;
  const toLine = (line) => ({ net: line.subtotal ?? line.taxable ?? 0, vat: line.vat ?? 0, rate: line.vatCode || 'standard' });
  const sales = [
    ...(state.invoices || []).filter(inPeriod).flatMap((doc) => doc.lines.map(toLine)),
    ...(state.creditNotes || []).filter((note) => note.country === 'GB' && note.date >= from && note.date <= to).flatMap((note) => note.lines.map((line) => { const out = toLine(line); return { ...out, net: -Number(out.net || 0), vat: -Number(out.vat || 0) }; })),
  ];
  const purchases = (state.purchases || []).filter(inPeriod).flatMap((doc) => doc.lines.map((line) => ({ ...toLine(line), vat: doc.vatReclaimed === 0 ? 0 : line.vat ?? 0 })));
  const skipped = [...(state.invoices || []), ...(state.purchases || [])].filter((doc) => doc.date >= from && doc.date <= to && doc.country !== 'GB' && doc.status !== 'cancelled').length;
  return { ok: true, sales, purchases, documents: (state.invoices || []).filter(inPeriod).length + (state.purchases || []).filter(inPeriod).length, creditNotes: (state.creditNotes || []).filter((note) => note.country === 'GB' && note.date >= from && note.date <= to).length, skipped, today: localToday() };
}

function creditedOn(state, invoiceId) {
  return (state.creditNotes || []).filter((note) => note.invoiceId === invoiceId).reduce((sum, note) => sum + toPence(note.total), 0);
}

function receivedOn(invoice) {
  return (invoice.receipts || []).reduce((sum, receipt) => sum + toPence(receipt.amount), 0);
}

function nextCreditNoteId(state) {
  state.creditNoteSeq = Number(state.creditNoteSeq || 0);
  const taken = new Set((state.creditNotes || []).map((note) => note.id));
  let id;
  do {
    state.creditNoteSeq += 1;
    id = `CN-${String(state.creditNoteSeq).padStart(4, '0')}`;
  } while (taken.has(id));
  return id;
}

export function planGbCreditNote(state, args = {}) {
  const invoiceId = String(args.invoiceId || '').trim().toUpperCase();
  const invoice = (state.invoices || []).find((item) => item.id === invoiceId);
  if (!invoice) return fail('INVOICE_NOT_FOUND', { invoiceId, hint: `${invoiceId || 'That'} is not an invoice in these books.` });
  if (invoice.country !== 'GB') return fail('NOT_A_UK_INVOICE', { invoiceId, hint: `${invoiceId} was not made in the UK edition, so it cannot get a UK credit note.` });
  if (invoice.status === 'cancelled') return fail('INVOICE_CANCELLED', { invoiceId, hint: `${invoiceId} is already cancelled.` });
  const date = postingDate(args.date);
  if (!date) return fail('INVALID_DATE', { date: args.date, hint: 'That date cannot be read.' });
  if (date < invoice.date) return fail('BEFORE_INVOICE', { date, invoiceDate: invoice.date, hint: `A credit note cannot be dated before the invoice (${invoice.date}).` });
  if (isPeriodLocked(state, date)) return fail('PERIOD_LOCKED', { date, lockThrough: state.lockThrough, hint: `That date is inside the locked period (through ${state.lockThrough}).` });
  const reason = String(args.reason || '').trim();
  if (!reason) return fail('REASON_REQUIRED', { hint: 'Say why: goods returned, price reduced, or the invoice was wrong.' });
  const totalPence = toPence(invoice.total);
  const already = creditedOn(state, invoiceId);
  const room = totalPence - already;
  if (room <= 0) return fail('FULLY_CREDITED', { invoiceId, hint: `${invoiceId} is already credited in full.` });
  let wanted;
  if (args.amount === undefined || args.amount === null || args.amount === '') wanted = room;
  else {
    const amount = Number(args.amount);
    if (!Number.isFinite(amount) || amount <= 0) return fail('BAD_AMOUNT', { hint: 'Give the credit as an amount above zero, including VAT.' });
    wanted = toPence(amount);
  }
  if (wanted > room) return fail('EXCEEDS_INVOICE', { invoiceId, room: toPounds(room), hint: `Only £${toPounds(room).toFixed(2)} of ${invoiceId} is left to credit.` });
  const full = wanted === totalPence;
  const sourceLines = invoice.lines || [];
  const lines = sourceLines.map((line) => {
    const gross = toPence(line.amount);
    const net = full ? toPence(line.subtotal ?? line.taxable) : Math.round(toPence(line.subtotal ?? line.taxable) * wanted / totalPence);
    const vat = full ? toPence(line.vat) : Math.round(toPence(line.vat) * wanted / totalPence);
    return { description: line.description, qty: line.qty, rate: line.rate, gstRate: line.vatPercent ?? 0, vatCode: line.vatCode || 'outside-scope', vatPercent: line.vatPercent ?? 0, net, vat, gross };
  });
  const drift = wanted - lines.reduce((sum, line) => sum + line.net + line.vat, 0);
  if (lines.length && drift) lines[lines.length - 1].net += drift;
  const net = lines.reduce((sum, line) => sum + line.net, 0);
  const vat = lines.reduce((sum, line) => sum + line.vat, 0);
  const refundDue = Math.max(0, Math.min(receivedOn(invoice), receivedOn(invoice) + already + wanted - totalPence));
  return { ok: true, plan: { invoice, date, reason, full, lines, net, vat, total: net + vat, refundDue, cancel: Boolean(args.cancel) && full } };
}

export function createGbCreditNote(state, args = {}) {
  const planned = planGbCreditNote(state, args);
  if (!planned.ok) return planned;
  const { plan } = planned;
  const { invoice } = plan;
  const party = (state.parties || []).find((entry) => (invoice.partyAccountId ? entry.accountId === invoice.partyAccountId : entry.name === invoice.partyName));
  if (!party) return fail('PARTY_NOT_FOUND');
  ensureGbAccounts(state.ledger);
  const seqBefore = state.transferSeq;
  const noteSeqBefore = state.creditNoteSeq;
  const id = nextCreditNoteId(state);
  const linked = TRANSFER_FLAGS.LINKED;
  const bundle = [{ id: nextTransferId(state), debitAccountId: SALES, creditAccountId: Number(party.accountId), amount: BigInt(plan.net), flags: linked, invoiceId: id, code: 'CREDIT_NOTE', userData: plan.date }];
  if (plan.vat > 0) bundle.push({ id: nextTransferId(state), debitAccountId: VAT_OUTPUT, creditAccountId: Number(party.accountId), amount: BigInt(plan.vat), flags: linked, invoiceId: id, code: 'CN-VAT', userData: plan.date });
  const posted = createTransfers(state.ledger, bundle);
  if (posted.some((result) => !result.ok)) {
    state.transferSeq = seqBefore;
    state.creditNoteSeq = noteSeqBefore;
    return fail('LEDGER_REJECT', { posted });
  }
  const note = {
    id,
    date: plan.date,
    country: 'GB',
    invoiceId: invoice.id,
    invoiceDate: invoice.date,
    partyName: invoice.partyName,
    partyGstin: '',
    partyState: '',
    partyAccountId: party.accountId,
    supplierVrn: invoice.supplierVrn || '',
    reason: plan.reason,
    cancels: plan.cancel,
    lines: plan.lines.map((line) => ({ description: line.description, hsn: '', qty: line.qty, rate: line.rate, gstRate: line.gstRate, vatCode: line.vatCode, vatPercent: line.vatPercent, taxable: toPounds(line.net), subtotal: toPounds(line.net), vat: toPounds(line.vat), cgst: 0, sgst: 0, igst: 0, amount: toPounds(line.net + line.vat) })),
    taxable: toPounds(plan.net),
    subtotal: toPounds(plan.net),
    vat: toPounds(plan.vat),
    cgst: 0,
    sgst: 0,
    igst: 0,
    total: toPounds(plan.total),
    transferIds: posted.map((result) => result.id),
  };
  state.creditNotes = state.creditNotes || [];
  state.creditNotes.push(note);
  invoice.creditNoteIds = [...(invoice.creditNoteIds || []), id];
  if (note.cancels) invoice.status = 'cancelled';
  else if (toPence(invoice.total) - creditedOn(state, invoice.id) - receivedOn(invoice) <= 0 && invoice.status !== 'paid') invoice.status = 'settled';
  return { ok: true, creditNote: note, invoice, posted, refundDue: toPounds(plan.refundDue) };
}

export function cancelGbInvoice(state, args = {}) {
  const invoiceId = String(args.invoiceId || '').trim().toUpperCase();
  if (creditedOn(state, invoiceId) > 0) return fail('PARTLY_CREDITED', { invoiceId, hint: 'Issue a credit note for the rest instead.' });
  return createGbCreditNote(state, { invoiceId, date: args.date, reason: args.reason || 'Invoice cancelled', cancel: true });
}

export function gbCreditNotePreview(state, args = {}, cancel = false) {
  const invoiceId = String(args.invoiceId || '').trim().toUpperCase();
  if (cancel && creditedOn(state, invoiceId) > 0) return { blockers: ['Part of this invoice is already credited. Issue a credit note for the rest instead.'], summary: '', effects: [], figures: {} };
  const planned = planGbCreditNote(state, cancel ? { invoiceId, date: args.date, reason: args.reason || 'Invoice cancelled', cancel: true } : args);
  if (!planned.ok) return { blockers: [planned.hint || planned.error], summary: '', effects: [], figures: {} };
  const { plan } = planned;
  const money = (pence) => `£${toPounds(pence).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const what = cancel ? `Cancel ${plan.invoice.id} (${plan.invoice.partyName}) with a credit note for its full ${money(plan.total)}` : `Credit note of ${money(plan.total)} against ${plan.invoice.id} (${plan.invoice.partyName})${plan.full ? ', the whole invoice' : ''}`;
  return {
    blockers: [],
    summary: `${what} dated ${plan.date}: ${money(plan.net)} plus ${money(plan.vat)} VAT. Reason: ${plan.reason}.`,
    effects: [
      'The customer owes you that much less, or is owed it back if they have already paid.',
      plan.vat > 0 ? `${money(plan.vat)} comes off the VAT due on the return for the period that includes ${plan.date}.` : 'No VAT changes.',
      ...(plan.refundDue > 0 ? [`${plan.invoice.partyName} has already paid, so ${money(plan.refundDue)} becomes due back to them.`] : []),
    ],
    figures: { invoiceId: plan.invoice.id, date: plan.date, net: toPounds(plan.net), vat: toPounds(plan.vat), total: toPounds(plan.total), refundDue: toPounds(plan.refundDue), cancels: cancel },
  };
}
