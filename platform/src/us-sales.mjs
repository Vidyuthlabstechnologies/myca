import { createAccounts, createTransfers, TRANSFER_FLAGS } from './ledger.mjs';
import { rules } from './sprint-load.mjs';
import { localToday, postingDate } from './dates.mjs';
import { isPeriodLocked } from './period-lock.mjs';
import { ensureParty, ensureVendor } from './invoice.mjs';
import { invoiceTerms, dueDateOf } from './payment-terms.mjs';
import { countryOf, formatMoney } from './country.mjs';

const SALES = 4000;
const PURCHASES = 5000;
const SALES_TAX_PAYABLE = 2110;
const JURISDICTION = /^[A-Z]{2}(?:-[A-Z0-9]{2,20})?$/;
const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const cents = (value) => BigInt(Math.round(Number(value || 0) * 100));

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

export function ensureUsAccounts(ledger) {
  createAccounts(ledger, [{ id: SALES_TAX_PAYABLE, code: String(SALES_TAX_PAYABLE), name: 'Sales tax payable', type: 'liability', flags: 0 }]);
}

export function normalizeJurisdiction(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '-');
}

export function rateFor(state, code, date) {
  const key = normalizeJurisdiction(code);
  const rows = (state.salesTaxRates || []).filter((row) => row.code === key && row.from <= date).sort((a, b) => a.from.localeCompare(b.from));
  return rows.length ? rows[rows.length - 1] : null;
}

export function planSalesTaxRate(state, args = {}) {
  const code = normalizeJurisdiction(args.code);
  if (!JURISDICTION.test(code)) return fail('BAD_JURISDICTION', { code });
  const ratePercent = Number(args.ratePercent);
  if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 20) return fail('BAD_RATE');
  const from = args.from == null || args.from === '' ? localToday() : postingDate(args.from);
  if (!from) return fail('INVALID_DATE', { date: args.from });
  const name = String(args.name || '').trim().slice(0, 80) || code;
  const was = rateFor(state, code, from);
  return { ok: true, rate: { code, name, ratePercent: round2(ratePercent), from }, was };
}

export function setSalesTaxRate(state, args = {}) {
  const plan = planSalesTaxRate(state, args);
  if (!plan.ok) return plan;
  const actor = state.__actor;
  state.salesTaxRates = (state.salesTaxRates || []).filter((row) => !(row.code === plan.rate.code && row.from === plan.rate.from));
  state.salesTaxRates.push({ ...plan.rate, setOn: localToday(), by: String(actor?.userId || args.actorId || '') });
  state.salesTaxRates.sort((a, b) => a.code.localeCompare(b.code) || a.from.localeCompare(b.from));
  return { ok: true, rate: plan.rate, was: plan.was };
}

export function listSalesTaxRates(state) {
  const today = localToday();
  const codes = [...new Set((state.salesTaxRates || []).map((row) => row.code))];
  return { ok: true, data: { rates: codes.map((code) => ({ ...rateFor(state, code, today), history: (state.salesTaxRates || []).filter((row) => row.code === code).length })).filter((row) => row.code) } };
}

function linesOf(input, { needTaxFlag }) {
  const raw = input.lines || [];
  if (!raw.length) return fail('NO_LINES');
  const lines = raw.map((line) => ({
    description: String(line.description || '').trim(),
    qty: Number(line.qty == null || line.qty === '' ? 1 : line.qty),
    rate: Number(line.rate),
    taxable: needTaxFlag ? line.taxable !== false : false,
  }));
  if (lines.some((line) => !Number.isFinite(line.qty) || line.qty <= 0 || !Number.isFinite(line.rate) || line.rate < 0)) return fail('BAD_LINE');
  for (const line of lines) line.subtotal = round2(line.qty * line.rate);
  const subtotal = round2(lines.reduce((sum, line) => sum + line.subtotal, 0));
  if (subtotal <= 0) return fail('ZERO_AMOUNT');
  return { ok: true, lines, subtotal };
}

export function planUsInvoice(state, input = {}) {
  const date = postingDate(input.date);
  if (!date) return fail('INVALID_DATE', { date: input.date });
  if (isPeriodLocked(state, date)) return fail('PERIOD_LOCKED', { date, lockThrough: state.lockThrough });
  if (input.id && idTaken(state.invoices, input.id)) return fail('DUPLICATE_ID', { id: input.id });
  const parsed = linesOf(input, { needTaxFlag: true });
  if (!parsed.ok) return parsed;
  const partyName = String(input.partyName ?? '').trim() || 'Walk-in';
  const terms = invoiceTerms(state, { name: partyName, gstin: '', override: input.paymentTermsDays });
  if (terms.error) return fail(terms.error);
  const taxExempt = input.taxExempt === true;
  const exemptionReason = String(input.exemptionReason || '').trim().slice(0, 120);
  if (taxExempt && !exemptionReason) return fail('EXEMPTION_REASON_REQUIRED');
  const taxableLines = parsed.lines.filter((line) => line.taxable);
  let jurisdiction = '';
  let rate = null;
  if (taxExempt && input.taxJurisdiction) {
    jurisdiction = normalizeJurisdiction(input.taxJurisdiction);
    if (!JURISDICTION.test(jurisdiction)) return fail('BAD_JURISDICTION', { code: jurisdiction });
  }
  if (!taxExempt && taxableLines.length) {
    jurisdiction = normalizeJurisdiction(input.taxJurisdiction);
    if (!jurisdiction) return fail('JURISDICTION_REQUIRED');
    if (!JURISDICTION.test(jurisdiction)) return fail('BAD_JURISDICTION', { code: jurisdiction });
    rate = rateFor(state, jurisdiction, date);
    if (!rate) return fail('RATE_UNKNOWN', { code: jurisdiction, date });
  }
  const lines = parsed.lines.map((line) => {
    const taxed = Boolean(rate) && line.taxable && !taxExempt;
    const tax = taxed ? round2((line.subtotal * rate.ratePercent) / 100) : 0;
    return { ...line, taxRate: taxed ? rate.ratePercent : 0, tax, amount: round2(line.subtotal + tax) };
  });
  const tax = round2(lines.reduce((sum, line) => sum + line.tax, 0));
  const total = round2(parsed.subtotal + tax);
  return { ok: true, plan: { date, partyName, partyAddress: String(input.partyAddress || '').trim(), lines, subtotal: parsed.subtotal, tax, total, jurisdiction, rate, taxExempt, exemptionReason, terms } };
}

export function createUsInvoice(state, input = {}) {
  const planned = planUsInvoice(state, input);
  if (!planned.ok) return planned;
  const { plan } = planned;
  ensureUsAccounts(state.ledger);
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
  const bundle = [{ id: nextTransferId(state), debitAccountId: Number(party.accountId), creditAccountId: SALES, amount: cents(plan.subtotal), flags: linked, invoiceId: id, code: 'SALE', userData: plan.date }];
  if (plan.tax > 0) bundle.push({ id: nextTransferId(state), debitAccountId: Number(party.accountId), creditAccountId: SALES_TAX_PAYABLE, amount: cents(plan.tax), flags: linked, invoiceId: id, code: 'SALES-TAX', userData: plan.date });
  const posted = createTransfers(state.ledger, bundle);
  if (posted.some((result) => !result.ok)) {
    if (assignedSeq) state.invoiceSeq = seqBefore;
    return fail('LEDGER_REJECT', { posted });
  }
  const invoice = {
    id,
    date: plan.date,
    country: 'US',
    partyName: party.name,
    partyGstin: '',
    partyState: '',
    partyAccountId: party.accountId,
    lines: plan.lines.map((line) => ({ description: line.description, hsn: '', qty: line.qty, rate: line.rate, gstRate: 0, taxable: line.taxable ? line.subtotal : 0, nonTaxable: line.taxable ? 0 : line.subtotal, subtotal: line.subtotal, taxRate: line.taxRate, salesTax: line.tax, cgst: 0, sgst: 0, igst: 0, amount: line.amount })),
    taxable: plan.subtotal,
    subtotal: plan.subtotal,
    salesTax: plan.tax,
    taxJurisdiction: plan.jurisdiction,
    taxRate: plan.rate ? plan.rate.ratePercent : 0,
    taxExempt: plan.taxExempt,
    exemptionReason: plan.exemptionReason,
    cgst: 0,
    sgst: 0,
    igst: 0,
    total: plan.total,
    status: 'posted',
    kind: 'sale',
    receipts: [],
    ...(plan.terms.days != null ? { paymentTermsDays: plan.terms.days, dueDate: dueDateOf(plan.date, plan.terms.days) } : {}),
    transferIds: posted.map((result) => result.id),
  };
  state.invoices = state.invoices || [];
  state.invoices.push(invoice);
  return { ok: true, invoice, posted };
}

export function planUsPurchase(state, input = {}) {
  const date = postingDate(input.date);
  if (!date) return fail('INVALID_DATE', { date: input.date });
  if (isPeriodLocked(state, date)) return fail('PERIOD_LOCKED', { date, lockThrough: state.lockThrough });
  if (input.id && idTaken(state.purchases, input.id)) return fail('DUPLICATE_ID', { id: input.id });
  const parsed = linesOf(input, { needTaxFlag: false });
  if (!parsed.ok) return parsed;
  const salesTaxPaid = input.salesTaxPaid == null || input.salesTaxPaid === '' ? 0 : round2(input.salesTaxPaid);
  if (!Number.isFinite(salesTaxPaid) || salesTaxPaid < 0) return fail('BAD_TAX');
  const partyName = String(input.partyName ?? '').trim() || 'Supplier';
  const supplierInvoiceNo = String(input.supplierInvoiceNo ?? '').trim().slice(0, 30);
  return { ok: true, plan: { date, partyName, lines: parsed.lines, subtotal: parsed.subtotal, salesTaxPaid, total: round2(parsed.subtotal + salesTaxPaid), supplierInvoiceNo } };
}

export function createUsPurchase(state, input = {}) {
  const planned = planUsPurchase(state, input);
  if (!planned.ok) return planned;
  const { plan } = planned;
  const vendor = ensureVendor(state, { name: plan.partyName, gstin: '', stateCode: '' });
  const assignedSeq = !input.id;
  const seqBefore = state.billSeq || 0;
  const name = (n) => `BILL-${String(n).padStart(4, '0')}`;
  if (assignedSeq) {
    do state.billSeq = (state.billSeq || 0) + 1;
    while (idTaken(state.purchases, name(state.billSeq)));
  }
  const id = input.id || name(state.billSeq);
  const posted = createTransfers(state.ledger, [
    { id: nextTransferId(state), debitAccountId: PURCHASES, creditAccountId: Number(vendor.accountId), amount: cents(plan.total), flags: TRANSFER_FLAGS.LINKED, invoiceId: id, code: 'PURCHASE', userData: plan.date },
  ]);
  if (posted.some((result) => !result.ok)) {
    if (assignedSeq) state.billSeq = seqBefore;
    return fail('LEDGER_REJECT', { posted });
  }
  const bill = {
    id,
    ...(plan.supplierInvoiceNo ? { supplierInvoiceNo: plan.supplierInvoiceNo } : {}),
    date: plan.date,
    country: 'US',
    partyName: vendor.name,
    partyGstin: '',
    partyState: '',
    partyAccountId: vendor.accountId,
    lines: plan.lines.map((line) => ({ description: line.description, hsn: '', qty: line.qty, rate: line.rate, gstRate: 0, taxable: line.subtotal, subtotal: line.subtotal, cgst: 0, sgst: 0, igst: 0, amount: line.subtotal })),
    taxable: plan.subtotal,
    subtotal: plan.subtotal,
    salesTaxPaid: plan.salesTaxPaid,
    cgst: 0,
    sgst: 0,
    igst: 0,
    total: plan.total,
    status: 'posted',
    kind: 'purchase',
    itcEligible: false,
    transferIds: posted.map((result) => result.id),
  };
  state.purchases = state.purchases || [];
  state.purchases.push(bill);
  return { ok: true, invoice: bill, posted };
}

export function planContractor(state, args = {}) {
  const name = String(args.partyName || '').trim();
  if (!name) return fail('VENDOR_REQUIRED');
  const contractor = args.contractor !== false;
  const entityType = String(args.entityType || '').trim().toLowerCase();
  if (entityType && !['individual', 'sole-proprietor', 'llc', 'partnership', 'c-corp', 's-corp', 'other'].includes(entityType)) return fail('BAD_ENTITY_TYPE', { entityType });
  const tinLast4 = String(args.tinLast4 || '').replace(/\D/g, '');
  if (tinLast4 && tinLast4.length !== 4) return fail('BAD_TIN_LAST4');
  const w9Name = String(args.w9Name || '').trim().slice(0, 120);
  const address = args.address == null ? null : String(args.address).trim().slice(0, 200);
  const email = args.email == null ? null : String(args.email).trim().toLowerCase().slice(0, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('BAD_EMAIL');
  const existing = (state.vendors || []).find((vendor) => vendor.name.toLowerCase() === name.toLowerCase()) || null;
  return { ok: true, contractor: { partyName: existing ? existing.name : name, contractor, entityType, tinLast4, w9Name, w9Received: Boolean(args.w9Received), address, email }, existing };
}

export function setContractor(state, args = {}) {
  const plan = planContractor(state, args);
  if (!plan.ok) return plan;
  const vendor = ensureVendor(state, { name: plan.contractor.partyName, gstin: '', stateCode: '' });
  vendor.contractor = plan.contractor.contractor;
  vendor.w9 = { name: plan.contractor.w9Name, entityType: plan.contractor.entityType, tinLast4: plan.contractor.tinLast4, received: plan.contractor.w9Received, on: localToday() };
  if (plan.contractor.address != null) vendor.address = plan.contractor.address;
  if (plan.contractor.email != null) vendor.email = plan.contractor.email;
  return { ok: true, vendor: { name: vendor.name, contractor: vendor.contractor, w9: vendor.w9, address: vendor.address || '', email: vendor.email || '' } };
}

export function contractorPayments(state, args = {}) {
  const year = String(args.year || localToday().slice(0, 4));
  if (!/^\d{4}$/.test(year)) return fail('INVALID_YEAR');
  const threshold = rules.rule('us.federal.1099-nec.threshold', `${year}-12-31`);
  if (!threshold.ok) return fail('US_RULE_MISSING', { ruleId: 'us.federal.1099-nec.threshold', year });
  const limit = threshold.record.value.amountCents / 100;
  const contractors = (state.vendors || []).filter((vendor) => vendor.contractor);
  const rows = contractors.map((vendor) => {
    const bills = (state.purchases || []).filter((bill) => bill.partyAccountId === vendor.accountId);
    const paid = round2(bills.reduce((sum, bill) => sum + (bill.payments || []).filter((p) => String(p.date).startsWith(year)).reduce((inner, p) => inner + Number(p.amount || 0), 0), 0));
    const expenses = round2((state.expenses || []).filter((expense) => expense.date.startsWith(year) && String(expense.payee || '').trim().toLowerCase() === vendor.name.toLowerCase()).reduce((sum, expense) => sum + Number(expense.amount || 0), 0));
    const total = round2(paid + expenses);
    const corporation = ['c-corp', 's-corp'].includes(vendor.w9?.entityType || '');
    return {
      name: vendor.name,
      entityType: vendor.w9?.entityType || '',
      w9Received: Boolean(vendor.w9?.received),
      tinLast4: vendor.w9?.tinLast4 || '',
      paidOnBills: paid,
      paidAsExpenses: expenses,
      total,
      needs1099: total >= limit && !corporation,
      why: corporation ? 'Payments to a corporation are not reported on 1099-NEC (some exceptions, such as legal services, are not handled).' : total >= limit ? `Paid ${formatMoney({ country: 'US' }, total)} in ${year}, at or above the ${formatMoney({ country: 'US' }, limit)} limit.` : `Paid ${formatMoney({ country: 'US' }, total)} in ${year}, under the ${formatMoney({ country: 'US' }, limit)} limit.`,
    };
  }).sort((a, b) => b.total - a.total);
  return {
    ok: true,
    data: {
      year,
      threshold: limit,
      ruleUsed: `${threshold.record.id}@${threshold.record.effectiveFrom}`,
      unreviewed: !(threshold.record.attestations || []).length,
      contractors: rows,
      needing1099: rows.filter((row) => row.needs1099).length,
      missingW9: rows.filter((row) => row.needs1099 && !row.w9Received).map((row) => row.name),
      notes: [
        'Only payments recorded in MyCA (bill payments and expenses to the contractor by name) are counted.',
        !(threshold.record.attestations || []).length ? 'The threshold comes from MyCA\'s dated rules, which your CPA has not reviewed yet.' : '',
      ].filter(Boolean),
    },
  };
}

export function usDocumentPreview(state, args, kind) {
  const money = (n) => formatMoney(state, n);
  if (kind === 'sale') {
    const planned = planUsInvoice(state, args);
    if (!planned.ok) {
      const reason = {
        INVALID_DATE: `${args.date} is not a date I can read.`,
        PERIOD_LOCKED: `${planned.date} is inside the locked period (through ${state.lockThrough}).`,
        DUPLICATE_ID: `${args.id} already exists in these books.`,
        NO_LINES: 'Say what was sold.',
        BAD_LINE: 'Each line needs a quantity and a price.',
        ZERO_AMOUNT: 'The invoice comes to nothing.',
        EXEMPTION_REASON_REQUIRED: 'Say why this sale is exempt from sales tax (for example a resale certificate on file).',
        JURISDICTION_REQUIRED: 'Say which sales tax applies (the jurisdiction code, for example TX or TX-AUSTIN), or that the sale is exempt and why. I will not guess a rate.',
        BAD_JURISDICTION: `${planned.code} is not a jurisdiction code I can read (for example TX or TX-AUSTIN).`,
        RATE_UNKNOWN: `There is no sales tax rate recorded for ${planned.code} on ${planned.date}. Say "sales tax rate ${planned.code} 8.25%" first; I will not guess one.`,
      }[planned.error] || planned.error;
      return { blockers: [reason], summary: '', effects: [], figures: {} };
    }
    const p = planned.plan;
    const due = p.terms.days != null ? ` Due ${dueDateOf(p.date, p.terms.days)}.` : '';
    return {
      blockers: [],
      summary: `Invoice to ${p.partyName} dated ${p.date}: subtotal ${money(p.subtotal)}, sales tax ${p.taxExempt ? `exempt (${p.exemptionReason})` : p.rate ? `${money(p.tax)} at ${p.rate.ratePercent}% (${p.rate.name})` : 'none'}, total ${money(p.total)}.${due}`,
      effects: [`${p.partyName} owes you ${money(p.total)} more.`, p.tax > 0 ? `${money(p.tax)} is sales tax you hold for ${p.jurisdiction}.` : 'No sales tax is collected on it.'],
      figures: { date: p.date, taxable: p.subtotal, tax: p.tax, total: p.total, jurisdiction: p.jurisdiction },
    };
  }
  const planned = planUsPurchase(state, args);
  if (!planned.ok) {
    const reason = { INVALID_DATE: `${args.date} is not a date I can read.`, PERIOD_LOCKED: `${planned.date} is inside the locked period (through ${state.lockThrough}).`, NO_LINES: 'Say what was bought.', BAD_LINE: 'Each line needs a quantity and a price.', ZERO_AMOUNT: 'The bill comes to nothing.', BAD_TAX: 'The sales tax paid must be zero or more.' }[planned.error] || planned.error;
    return { blockers: [reason], summary: '', effects: [], figures: {} };
  }
  const p = planned.plan;
  return {
    blockers: [],
    summary: `Bill from ${p.partyName} dated ${p.date}: ${money(p.subtotal)}${p.salesTaxPaid > 0 ? ` plus ${money(p.salesTaxPaid)} sales tax` : ''}, total ${money(p.total)}.`,
    effects: [`You owe ${p.partyName} ${money(p.total)} more.`, 'Sales tax paid is part of the cost; there is no input credit.'],
    figures: { date: p.date, taxable: p.subtotal, tax: p.salesTaxPaid, total: p.total },
  };
}

