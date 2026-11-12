import { planInvoiceTemplate } from '../invoice-template.mjs';
import { salaryPrivate } from '../employees.mjs';
import { creditedAgainst, outstandingOf, planCreditNote } from '../credit-notes.mjs';
import { planDebitNote, planPurchaseNote } from '../debit-notes.mjs';
import { dueDateOf, invoiceTerms, planTerms, termsLabel } from '../payment-terms.mjs';
import { everyWords, findRecurring, planRecurring } from '../recurring.mjs';
import { SALES_DOCUMENT_KINDS, checkConvert, findQuote, invoiceArgsFromQuote, kindOf, kindTitle, planQuote } from '../quotes.mjs';
import { gstSplit, partyStateOf } from '../chart.mjs';
import { localToday, postingDate } from '../dates.mjs';
import { isPeriodLocked } from '../period-lock.mjs';
import { lastGstRateFor, lastHsnFor, planPayment } from '../invoice.mjs';
import { planTds, tdsWords, wantsTds } from '../tds-deduction.mjs';
import { ewayBillNeed, planTransport, transportWords } from '../eway-bill.mjs';
import { countryOf, formatMoneyCurrent } from '../country.mjs';
import { usDocumentPreview } from '../us-sales.mjs';
import { planSupplierNote } from '../supplier-notes.mjs';
import { regArg } from '../registrations.mjs';
import { gstin as gstinRules } from '../sprint-load.mjs';
import { planAmendment } from '../invoice-amendments.mjs';
import { PAYMENT_REASONS, TDS_REASONS, money, stateCodeOf } from './shared.mjs';

export function amendmentPreview(state, args) {
  const planned = planAmendment(state, args);
  if (!planned.ok) {
    const reason = { INVOICE_NOT_FOUND: `There is no invoice ${planned.invoiceId}.`, NOT_FILED: planned.hint, AMENDMENT_PERIOD_FILED: planned.hint, REASON_REQUIRED: 'Say why the invoice is being amended.', NOTHING_CHANGED: 'Nothing on the invoice would change.', INVALID_GSTIN: `${planned.partyGstin} is not a GSTIN.`, PERIOD_LOCKED: `The books are locked through ${planned.lockThrough}.`, DATE_BEFORE_INVOICE: 'An amendment cannot be dated before the invoice.', INVOICE_CANCELLED: 'That invoice is cancelled.' }[planned.error] || planned.error;
    return { blockers: [reason], summary: '', effects: [], figures: {} };
  }
  const p = planned.plan;
  const gstinChange = p.before.partyGstin !== p.after.partyGstin ? ` Buyer GSTIN ${p.before.partyGstin || 'none'} → ${p.after.partyGstin || 'none'}.` : '';
  return {
    blockers: [],
    summary: `Amend ${p.invoice.id} (${p.originalPeriod}, filed) for ${p.reason}: total ${formatMoneyCurrent(p.before.total)} → ${formatMoneyCurrent(p.after.total)}.${gstinChange}`,
    effects: [`The difference of ${formatMoneyCurrent(Math.abs(p.delta.total))} is posted ${p.delta.total >= 0 ? 'to' : 'off'} ${p.invoice.partyName}'s account dated ${p.date}.`, `It goes into GSTR-1 for ${p.period} as an amendment with the original number and date; the ${p.originalPeriod} return is unchanged.`],
    figures: { invoiceId: p.invoice.id, before: p.before.total, after: p.after.total, delta: p.delta.total, period: p.period },
  };
}

const GST_START = '2017-07-01';

const GSTIN_PROBLEM_WORDS = {
  INVALID_LENGTH: 'it is not 15 characters',
  INVALID_STATE: 'the first two digits are not a state code',
  INVALID_PAN: 'the PAN inside it is not a PAN',
  INVALID_ENTITY_CHAR: 'the 14th character is not allowed',
  CHECK_DIGIT_MISMATCH: 'the last character (the check digit) is wrong',
};

function gstinProblemWords(errors) {
  const words = (errors || []).map((e) => GSTIN_PROBLEM_WORDS[e.code] || String(e.message || e.code || '').toLowerCase()).filter(Boolean);
  return words.length ? words.join(' and ') : 'it does not check out';
}

function plusYear(iso) {
  return `${Number(iso.slice(0, 4)) + 1}${iso.slice(4)}`;
}

export function documentPreview(state, args, kind) {
  if (countryOf(state) === 'US') return usDocumentPreview(state, args, kind);
  const company = state.company || {};
  const date = postingDate(args.date);
  const blockers = [];
  if (company.setupNeeded) blockers.push('Set up the business first: its name and GSTIN, or its state if it is not registered.');
  if (!date) blockers.push(`${args.date} is not a date I can read.`);
  else if (isPeriodLocked(state, date)) blockers.push(`${date} is inside the locked period (through ${state.lockThrough}).`);
  const sale = kind === 'sale';
  const list = sale ? state.invoices : state.purchases;
  if (args.id && (list || []).some((d) => d.id === args.id)) blockers.push(`${args.id} already exists in these books.`);

  const exportSale = sale && args.exportSale && typeof args.exportSale === 'object' ? args.exportSale : null;
  const fx = exportSale ? Number(String(exportSale.currency || 'INR').toUpperCase() === 'INR' ? 1 : exportSale.exchangeRate) : 1;
  if (exportSale && !(fx > 0)) blockers.push('An export needs the exchange rate: rupees per unit of the currency.');
  if (exportSale && String(args.partyGstin || '').trim()) blockers.push('An export goes to a buyer outside India, who has no GSTIN.');
  const regd = regArg(state, args.registrationGstin);
  if (!regd.ok) blockers.push(`${args.registrationGstin} is not a registration of this business.`);
  const ownState = regd.ok ? regd.registration.state : company.state;
  const pos = exportSale
    ? '96'
    : sale
      ? (stateCodeOf(args.partyState) || partyStateOf(args.partyGstin) || ownState)
      : ownState;
  const supplier = sale ? ownState : (partyStateOf(args.partyGstin) || stateCodeOf(args.partyState) || ownState);
  const saidGstin = String(args.partyGstin || '').trim().toUpperCase();
  if (saidGstin && !exportSale) {
    const checked = gstinRules.validateGstin(saidGstin);
    if (!checked.ok) blockers.push(`${saidGstin} is not a valid GSTIN: ${gstinProblemWords(checked.errors)}. Check it with the ${sale ? 'buyer' : 'supplier'}.`);
  }
  if (date && date < GST_START) blockers.push(`${date} is before GST began on 1 July 2017.`);
  if (date && date > plusYear(localToday())) blockers.push(`${date} is more than a year ahead.`);
  const unrated = (args.lines || []).findIndex((l) => l.gstRate == null || l.gstRate === '');
  if (unrated >= 0) {
    const last = lastGstRateFor(state, { name: args.partyName, gstin: args.partyGstin }, kind);
    const line = (args.lines || []).length > 1 ? `Line ${unrated + 1} has` : 'This has';
    blockers.push(`${line} no GST rate, and I will not guess one.${last ? ` ${last.from} on ${last.date} was at ${last.gstRate}%.` : ''} Say the rate, or 0% if none applies.`);
  }
  const lines = (args.lines || []).map((l) => {
    const qty = Number(l.qty == null || l.qty === '' ? 1 : l.qty);
    const rate = exportSale ? Math.round(Number(l.rate) * (fx > 0 ? fx : 0) * 100) / 100 : Number(l.rate);
    const gstRate = Number(l.gstRate == null || l.gstRate === '' ? 0 : l.gstRate);
    const taxable = Math.round(qty * rate * 100) / 100;
    const split = exportSale && !exportSale.withTax ? { cgst: 0, sgst: 0, igst: 0 } : gstSplit({ taxable, rate: gstRate, supplierState: supplier, partyState: pos });
    return { ...split, taxable, gstRate, qty, rate };
  });
  const sum = (key) => Math.round(lines.reduce((s, l) => s + (l[key] || 0), 0) * 100) / 100;
  const taxable = sum('taxable');
  const tax = Math.round((sum('cgst') + sum('sgst') + sum('igst')) * 100) / 100;
  if (!(taxable > 0)) blockers.push('It comes to nothing, so there is nothing to post.');
  const party = args.partyName || (sale ? 'Walk-in' : 'Supplier');
  const heads = exportSale && !exportSale.withTax ? 'no IGST (zero-rated under LUT or bond)' : sum('igst') > 0 ? `IGST ${money(sum('igst'))}` : `CGST ${money(sum('cgst'))} + SGST ${money(sum('sgst'))}`;
  const exportWords = exportSale ? `Export invoice (${String(exportSale.currency || 'INR').toUpperCase()}${fx > 0 && fx !== 1 ? ` at ${fx}` : ''}) to` : 'Invoice to';
  const terms = sale ? invoiceTerms(state, { name: party, gstin: args.partyGstin, override: args.paymentTermsDays }) : { days: null };
  if (terms.error) blockers.push('Terms are a whole number of days from 0 to 365.');
  const due = sale && terms.days != null && date ? ` Due ${dueDateOf(date, terms.days)} (${termsLabel(terms.days)}${terms.source === 'customer' ? `, ${party}'s usual terms` : ''}).` : '';
  let tds = null;
  if (!sale && wantsTds(args) && date && !blockers.length) {
    const planned = planTds(state, args, { date, basis: taxable, payable: taxable + tax, payee: party, beforeGst: true });
    if (planned.ok) tds = planned.tds;
    else blockers.push((TDS_REASONS[planned.error] || (() => planned.error))(planned));
  }
  return {
    blockers,
    summary: sale
      ? `${exportWords} ${party}${args.partyGstin ? ` (${args.partyGstin})` : ''} dated ${date || '?'}: taxable ${money(taxable)}, ${heads}, total ${money(taxable + tax)}. Place of supply ${exportSale ? 'outside India (96)' : gstinRules.STATE_CODES?.[pos] || pos || '?'}.${due}`
      : `Purchase bill from ${party}${args.partyGstin ? ` (${args.partyGstin})` : ''} dated ${date || '?'}: taxable ${money(taxable)}, ${heads}, total ${money(taxable + tax)}. Input credit ${args.itcEligible === false ? 'blocked (s.17(5)) and added to cost' : money(tax)}.`,
    effects: sale
      ? [`${party} owes you ${money(taxable + tax)} more.`, exportSale ? `It goes into GSTR-1 table 6A${date ? ` for ${date.slice(0, 7)}` : ''} as ${exportSale.withTax ? 'WPAY' : 'WOPAY'}.` : args.partyGstin && (args.lines || []).some((l) => Number(l.gstRate) > 0 && !/^\d{4,8}$/.test(String(l.hsn ?? '').trim())) ? missingHsnWords(state, args) : `It goes into your GSTR-1${date ? ` for ${date.slice(0, 7)}` : ''}.`]
      : [`You owe ${party} ${money(taxable + tax - (tds?.tds || 0))} more.`, args.itcEligible === false ? 'The GST on it cannot be claimed, so it is part of the cost.' : 'It is checked against your GSTR-2B when you add one.', ...(tds ? [tdsWords(tds, taxable + tax - tds.tds, `you owe ${party}`)] : [])],
    figures: { date, taxable, tax, total: Math.round((taxable + tax) * 100) / 100, placeOfSupply: pos, ...(tds ? { tds: tds.tds, tdsSection: tds.section, tdsRate: tds.rate } : {}) },
  };
}

function missingHsnWords(state, args) {
  const last = lastHsnFor(state, { name: args.partyName, gstin: args.partyGstin });
  const hint = last ? ` ${last.from} on ${last.date} to this buyer used HSN ${last.hsn}; say "HSN ${last.hsn}" if it is the same goods.` : ' Say the code, for example "HSN 5208", in the message to include it.';
  return `It has no HSN code, so GSTR-1 leaves it out until one is added; its tax still counts in GSTR-3B.${hint}`;
}

export function receiptPreview(state, args) {
  const inv = (state.invoices || []).find((i) => i.id === args.invoiceId);
  if (!inv) return { blockers: [`${args.invoiceId} is not in these books.`], summary: `No invoice ${args.invoiceId}.`, effects: [], figures: {} };
  const due = outstandingOf(state, inv);
  const amount = args.amount == null || args.amount === '' ? due : Number(args.amount);
  const date = args.date == null || args.date === '' ? inv.date : postingDate(args.date);
  const blockers = [];
  if (!date) blockers.push(`${args.date} is not a date I can read.`);
  else if (isPeriodLocked(state, date)) blockers.push(`${date} is inside the locked period (through ${state.lockThrough}).`);
  if (inv.status === 'cancelled') blockers.push(`${inv.id} is cancelled, so nothing can be received against it.`);
  else if (due <= 0.01) blockers.push(`${inv.id} is already fully received or credited (${money(inv.total)}).`);
  else if (amount > due + 0.01) blockers.push(`${money(amount)} is more than the ${money(due)} outstanding on ${inv.id}.`);
  else if (!(amount >= 0.01)) blockers.push('A receipt has to be a positive amount.');
  return {
    blockers,
    summary: `Receipt of ${money(amount)} against ${inv.id} (${inv.partyName}) by ${args.mode === 'cash' ? 'cash' : 'bank'} on ${date || '?'}. Outstanding is ${money(due)} of ${money(inv.total)}.`,
    effects: [`${money(amount)} goes into your ${args.mode === 'cash' ? 'cash' : 'bank'}.`, `${inv.id} becomes ${amount >= due - 0.01 ? 'paid' : 'partly paid'}.`],
    figures: { amount, due, date },
  };
}

export function paymentPreview(state, args) {
  const plan = planPayment(state, args);
  if (!plan.ok) {
    const bill = (state.purchases || []).find((item) => item.id === args.billId);
    const detail = plan.error === 'OVERPAYMENT' ? ` ${money(plan.due)} is owed on ${args.billId}.`
      : plan.error === 'INSUFFICIENT_CASH' ? ` Cash in hand is ${money(plan.inHand)}.`
        : plan.error === 'BILL_PAID' ? ` ${args.billId} was ${money(plan.total)}.` : '';
    return { blockers: [`${PAYMENT_REASONS[plan.error] || plan.error}${detail}`], summary: bill ? `Payment against ${bill.id} to ${bill.partyName}.` : `No bill ${args.billId}.`, effects: [], figures: {} };
  }
  const { bill, amount, date, mode, due, remaining } = plan;
  const label = bill.supplierInvoiceNo ? `${bill.id} (their bill ${bill.supplierInvoiceNo})` : bill.id;
  return {
    blockers: [],
    summary: `Pay ${bill.partyName} ${money(amount)} against ${label} from ${mode === 'cash' ? 'cash' : 'the bank'} on ${date}. ${money(due)} is owed on ${money(bill.total)}.`,
    effects: [`${money(amount)} goes out of your ${mode === 'cash' ? 'cash' : 'bank'}.`, remaining > 0.005 ? `${bill.id} stays partly paid, with ${money(remaining)} still owed.` : `${bill.id} becomes paid.`],
    figures: { amount, due, remaining, date },
  };
}

const CREDIT_NOTE_REASONS = {
  INVOICE_NOT_FOUND: (p, args) => `${args.invoiceId} is not an invoice in these books.`,
  INVOICE_CANCELLED: (p, args) => `${args.invoiceId} is already cancelled.`,
  INVALID_DATE: (p, args) => `${args.date} is not a date I can read.`,
  BEFORE_INVOICE: (p) => `A credit note cannot be dated before the invoice (${p.invoiceDate}).`,
  PERIOD_LOCKED: (p, args, state) => `${p.date} is inside the locked period (through ${state.lockThrough}).`,
  REASON_REQUIRED: () => 'Say why: goods returned, price reduced, or cancelled.',
  FULLY_CREDITED: (p) => `${p.invoiceId} is already credited in full.`,
  BAD_AMOUNT: () => 'The amount must be a positive number.',
  EXCEEDS_INVOICE: (p) => `Only ${money(p.room)} of ${p.invoiceId} is left to credit.`,
  PARTLY_CREDITED: (p) => `${p.invoiceId} already has a credit note; issue one for the rest instead of cancelling.`,
};

export function creditNotePreview(state, args, cancel = false) {
  const invoiceId = String(args.invoiceId || '').trim().toUpperCase();
  if (cancel && creditedAgainst(state, invoiceId) > 0) {
    return { blockers: [CREDIT_NOTE_REASONS.PARTLY_CREDITED({ invoiceId })], summary: '', effects: [], figures: {} };
  }
  const planned = planCreditNote(state, cancel ? { invoiceId, date: args.date, reason: args.reason || 'Invoice cancelled' } : args);
  if (!planned.ok) {
    const explain = CREDIT_NOTE_REASONS[planned.error];
    return { blockers: [explain ? explain(planned, args, state) : planned.error], summary: '', effects: [], figures: {} };
  }
  const { plan } = planned;
  const heads = [plan.cgst > 0 ? `CGST ${money(plan.cgst)}` : '', plan.sgst > 0 ? `SGST ${money(plan.sgst)}` : '', plan.igst > 0 ? `IGST ${money(plan.igst)}` : ''].filter(Boolean).join(' + ');
  const what = cancel ? `Cancel ${plan.invoice.id} (${plan.invoice.partyName}) by a credit note for its full ${money(plan.total)}` : `Credit note of ${money(plan.total)} against ${plan.invoice.id} (${plan.invoice.partyName})${plan.full ? ', the whole invoice' : ''}`;
  const refund = plan.refundDue > 0 ? ` ${plan.invoice.partyName} has paid ${money(plan.received)}, so ${money(plan.refundDue)} becomes due back to them.` : '';
  return {
    blockers: [],
    summary: `${what} dated ${plan.date}: taxable ${money(plan.taxable)}${heads ? `, ${heads}` : ''}. Reason: ${plan.reason}.${refund}`,
    effects: ['The customer owes you that much less, or is owed it back if they have already paid.', 'The invoice stays as it was; the credit note goes into the GSTR-1 for its own month.'],
    figures: { invoiceId: plan.invoice.id, date: plan.date, taxable: plan.taxable, cgst: plan.cgst, sgst: plan.sgst, igst: plan.igst, total: plan.total, refundDue: plan.refundDue, cancels: cancel },
  };
}

const DEBIT_NOTE_REASONS = {
  ...CREDIT_NOTE_REASONS,
  BILL_NOT_FOUND: (p, args) => `${args.billId} is not a bill in these books.`,
  BEFORE_INVOICE: (p) => `A debit note cannot be dated before the document it is against (${p.invoiceDate}).`,
  REASON_REQUIRED: () => 'Say why: price revised, extra charge, goods returned, or short supply.',
  BAD_AMOUNT: () => 'Say the amount of the note as a positive number.',
  FULLY_NOTED: (p) => `${p.billId} is already reduced to nothing by earlier notes.`,
  EXCEEDS_BILL: (p) => `Only ${money(p.room)} of ${p.billId} is left to reduce.`,
};

export function debitNotePreview(state, args) {
  const planned = planDebitNote(state, args);
  if (!planned.ok) {
    const explain = DEBIT_NOTE_REASONS[planned.error];
    return { blockers: [explain ? explain(planned, args, state) : planned.error], summary: '', effects: [], figures: {} };
  }
  const { plan } = planned;
  const heads = [plan.cgst > 0 ? `CGST ${money(plan.cgst)}` : '', plan.sgst > 0 ? `SGST ${money(plan.sgst)}` : '', plan.igst > 0 ? `IGST ${money(plan.igst)}` : ''].filter(Boolean).join(' + ');
  return {
    blockers: [],
    summary: `Debit note of ${money(plan.total)} against ${plan.invoice.id} (${plan.invoice.partyName}) dated ${plan.date}: taxable ${money(plan.taxable)}${heads ? `, ${heads}` : ''}. Reason: ${plan.reason}.`,
    effects: ['The customer owes you that much more.', 'The invoice stays as it was; the debit note goes into the GSTR-1 for its own month and adds to that month\'s tax on sales.'],
    figures: { invoiceId: plan.invoice.id, date: plan.date, taxable: plan.taxable, cgst: plan.cgst, sgst: plan.sgst, igst: plan.igst, total: plan.total },
  };
}

export function purchaseNotePreview(state, args) {
  const planned = planPurchaseNote(state, args);
  if (!planned.ok) {
    const explain = DEBIT_NOTE_REASONS[planned.error];
    return { blockers: [explain ? explain(planned, args, state) : planned.error], summary: '', effects: [], figures: {} };
  }
  const { plan } = planned;
  const heads = [plan.cgst > 0 ? `CGST ${money(plan.cgst)}` : '', plan.sgst > 0 ? `SGST ${money(plan.sgst)}` : '', plan.igst > 0 ? `IGST ${money(plan.igst)}` : ''].filter(Boolean).join(' + ');
  const refund = plan.refundDue > 0 ? ` You have paid ${money(plan.paid)} on it, so ${money(plan.refundDue)} becomes due back to you.` : '';
  return {
    blockers: [],
    summary: `Debit note to ${plan.bill.partyName} of ${money(plan.total)} against ${plan.bill.id}${plan.full ? ', the whole bill' : ''} dated ${plan.date}: taxable ${money(plan.taxable)}${heads ? `, ${heads}` : ''}. Reason: ${plan.reason}.${refund}`,
    effects: ['You owe the supplier that much less, or are owed it back if you have already paid.', plan.itcEligible && heads ? 'The input credit on that part is reversed in the month of the note.' : 'The bill stays as it was.'],
    figures: { billId: plan.bill.id, date: plan.date, taxable: plan.taxable, cgst: plan.cgst, sgst: plan.sgst, igst: plan.igst, total: plan.total, refundDue: plan.refundDue },
  };
}

export function supplierNotePreview(state, args) {
  const planned = planSupplierNote(state, args);
  if (!planned.ok) {
    const explain = DEBIT_NOTE_REASONS[planned.error] || { NOTE_ON_NOTE: (p) => `${p.billId} is itself a supplier's debit note; record the new one against ${p.noteOf}.`, SUPPLIER_NUMBER_TOO_LONG: () => 'The supplier\'s note number is up to 16 characters.' }[planned.error];
    return { blockers: [explain ? explain(planned, args, state) : planned.error], summary: '', effects: [], figures: {} };
  }
  const { plan } = planned;
  const heads = [plan.cgst > 0 ? `CGST ${money(plan.cgst)}` : '', plan.sgst > 0 ? `SGST ${money(plan.sgst)}` : '', plan.igst > 0 ? `IGST ${money(plan.igst)}` : ''].filter(Boolean).join(' + ');
  return {
    blockers: [],
    summary: `${plan.bill.partyName}'s debit note${plan.supplierNoteNo ? ` ${plan.supplierNoteNo}` : ''} of ${money(plan.total)} on ${plan.bill.id} dated ${plan.date}: taxable ${money(plan.taxable)}${heads ? `, ${heads}` : ''}. Reason: ${plan.reason}.${plan.alreadyAdded > 0 ? ` ${money(plan.alreadyAdded)} was already added to this bill by earlier notes.` : ''}`,
    effects: ['You owe the supplier that much more; the bill itself is unchanged.', plan.itcEligible && heads ? 'The input credit on it counts in the month of the note, as a document of its own for GSTR-2B.' : 'The whole amount is cost; no input credit is taken.'],
    figures: { billId: plan.bill.id, date: plan.date, taxable: plan.taxable, cgst: plan.cgst, sgst: plan.sgst, igst: plan.igst, total: plan.total },
  };
}

export function invoiceTemplatePreview(state, args) {
  if (salaryPrivate(state)) return { blockers: ['Only the owner can change how invoices look and which bank account they show.'], summary: 'Invoice design is owner-only.', effects: [], figures: {} };
  const planned = planInvoiceTemplate(state, args);
  if (!planned.ok) return { blockers: [planned.hint || planned.error], summary: 'The invoice design change could not be read.', effects: [], figures: {} };
  const { changed, next } = planned.plan;
  const bank = next.bank || {};
  return {
    blockers: [],
    summary: `Invoice design: ${changed.join(', ')} ${changed.length === 1 ? 'changes' : 'change'}.${changed.includes('bank details') ? ` Invoices will show ${bank.account ? `account ${bank.account}` : ''}${bank.ifsc ? ` IFSC ${bank.ifsc}` : ''}${bank.upi ? ` UPI ${bank.upi}` : ''}.` : ''}`,
    effects: ['Applies to every invoice and quote PDF from now, including ones already raised.'],
    figures: { changed },
  };
}

export function invoiceNumberingPreview(state, args) {
  if (salaryPrivate(state)) return { blockers: ['Only the owner can change invoice numbering.'], summary: 'Invoice numbering is owner-only.', effects: [], figures: {} };
  const mode = String(args.mode || '').trim().toLowerCase();
  if (!['continuous', 'yearly'].includes(mode)) return { blockers: ['Say continuous or yearly.'], summary: 'Numbering mode not understood.', effects: [], figures: {} };
  const before = state.company?.invoiceNumbering || 'continuous';
  return {
    blockers: before === mode ? [`Invoices are already numbered ${mode === 'yearly' ? 'per financial year' : 'in one continuous series'}.`] : [],
    summary: `Invoice numbering: ${mode === 'yearly' ? 'one series per financial year (INV-26270001 is the first of 2026-27)' : 'one continuous series (INV-0001 onwards)'}.`,
    effects: ['Existing invoices keep their numbers; only new ones follow the new series.'],
    figures: { before, after: mode },
  };
}

const TRANSPORT_REASONS = {
  INVOICE_NOT_FOUND: (p) => `${p.invoiceId} is not an invoice in these books.`,
  INVOICE_CANCELLED: (p) => `${p.invoiceId} is cancelled.`,
  BAD_MODE: () => 'The mode is road, rail, air or ship.',
  VEHICLE_REQUIRED: () => 'Say the vehicle number for movement by road, for example MH12AB1234.',
  BAD_VEHICLE: (p) => `${p.vehicleNo} is not a vehicle number I can read (for example MH12AB1234).`,
  BAD_DISTANCE: () => 'Say the distance as whole kilometres, from 1 to 4000.',
  BAD_TRANSPORTER_ID: (p) => `${p.transporterId} is not a 15-character transporter id (GSTIN or TRANSIN).`,
  DOC_REQUIRED: (p) => `For movement by ${p.mode}, say the transport document number.`,
};

export function transportPreview(state, args) {
  const planned = planTransport(state, args);
  if (!planned.ok) {
    const reason = TRANSPORT_REASONS[planned.error];
    return { blockers: [reason ? reason(planned) : planned.error], summary: '', effects: [], figures: {} };
  }
  const need = ewayBillNeed(state, planned.invoice);
  return {
    blockers: [],
    summary: `Transport for ${planned.invoice.id} (${planned.invoice.partyName}): ${transportWords(planned.transport)}${planned.was ? ' (replaces the earlier details)' : ''}.`,
    effects: [need.needed ? `${need.why} The e-way bill can then be generated through the action gate.` : `${need.why} The details are kept with the invoice.`, 'No figure changes.'],
    figures: { invoiceId: planned.invoice.id, ...planned.transport },
  };
}

export function termsPreview(state, args) {
  const planned = planTerms(state, args);
  if (!planned.ok) {
    const reason = { CUSTOMER_REQUIRED: 'Say which customer.', BAD_TERMS: 'Terms are a whole number of days from 0 to 365.' }[planned.error] || planned.error;
    return { blockers: [reason], summary: '', effects: [], figures: {} };
  }
  const { plan } = planned;
  const was = plan.before == null ? '' : ` (was ${termsLabel(plan.before)})`;
  return {
    blockers: [],
    summary: `${plan.name}: ${termsLabel(plan.days)}${was}.`,
    effects: [plan.known ? 'New invoices to them get a due date from this. Invoices already raised keep theirs.' : 'There is no invoice to this customer yet; the terms apply from the first one.'],
    figures: { days: plan.days },
  };
}

const QUOTE_REASONS = {
  INVALID_DATE: 'That is not a date I can read.',
  CUSTOMER_REQUIRED: 'Say who the quote is for.',
  BAD_VALIDITY: 'A quote is valid for 1 to 365 days.',
  NO_LINES: 'Add what is being quoted.',
  RATE_REQUIRED: 'Give the GST rate for each item; MyCA does not assume one.',
  BAD_LINE: 'Each item needs a quantity above zero and a price.',
  RATE_NOT_IN_FORCE: 'That GST rate is not one in force on the quote date.',
  ZERO_AMOUNT: 'The quote comes to nothing.',
  QUOTE_NOT_FOUND: 'That quote is not in these books.',
  ALREADY_INVOICED: 'That quote has already been invoiced.',
  QUOTE_DECLINED: 'That quote was declined. Make a new quote or an invoice instead.',
  BAD_OUTCOME: 'A quote or proforma is accepted or declined, a sales order is cancelled, and a delivery challan is returned or cancelled.',
  BAD_KIND: 'MyCA makes quotes, proforma invoices, sales orders and delivery challans.',
  BAD_CHALLAN_REASON: 'A delivery challan is for job work, supply on approval, line sales, an exhibition, own use or other.',
  ALREADY_CLOSED: 'That document is already closed.',
  CHALLAN_NOT_A_SALE: 'Goods sent for job work are not a sale, so this challan does not become an invoice. Mark it returned when the goods come back.',
  JURISDICTION_REQUIRED: 'Say which sales tax applies (the jurisdiction code, for example TX or TX-AUSTIN), or that the sale is exempt and why. I will not guess a rate.',
  EXEMPTION_REASON_REQUIRED: 'Say why this sale is exempt from sales tax (for example a resale certificate on file).',
  RATE_UNKNOWN: 'There is no sales tax rate recorded for that jurisdiction on the quote date. Record it first, for example "sales tax rate TX 8.25%"; I will not guess one.',
};

const RECURRING_REASONS = {
  BAD_KIND: 'An invoice, a bill or an expense can repeat.',
  BAD_EVERY: 'It can repeat every week, month, quarter, six months or year.',
  INVALID_DATE: 'That is not a date I can read.',
  END_BEFORE_START: 'The last date is before the first one.',
  SUPPLIER_REQUIRED: 'Say who the bill is from.',
  CUSTOMER_REQUIRED: 'Say who the invoice is for.',
  NO_LINES: 'Add what is being billed.',
  RATE_REQUIRED: 'Give the GST rate; MyCA does not assume one.',
  BAD_LINE: 'Each item needs a quantity above zero and a price.',
  RATE_NOT_IN_FORCE: 'That GST rate is not one in force on the first date.',
  ZERO_AMOUNT: 'It comes to nothing.',
  BAD_AMOUNT: 'Give the amount.',
  RECURRING_NOT_FOUND: 'That repeating entry is not in these books.',
  ALREADY_STOPPED: 'That repeating entry has already stopped.',
};

export function recurringPreview(state, args) {
  const planned = planRecurring(state, args);
  if (!planned.ok) return { blockers: [RECURRING_REASONS[planned.error] || QUOTE_REASONS[planned.error] || planned.error], summary: '', effects: [], figures: {} };
  const { plan } = planned;
  const what = { invoice: `Invoice to ${plan.party}`, bill: `Bill from ${plan.party}`, expense: `Expense${plan.party ? ` ${plan.party}` : ''}` }[plan.kind];
  return {
    blockers: [],
    summary: `${what} for ${money(plan.amount)}, ${everyWords(plan.every)} from ${plan.startDate}${plan.endDate ? ` until ${plan.endDate}` : ''}. Next dates: ${plan.next.join(', ')}.`,
    effects: ['Each one is posted to your books on its date by the daily run, exactly like one entered by hand. Stop it at any time; what was already posted stays.'],
    figures: { amount: plan.amount, startDate: plan.startDate },
  };
}

export function stopRecurringPreview(state, args) {
  const schedule = findRecurring(state, args.id);
  if (!schedule) return { blockers: [RECURRING_REASONS.RECURRING_NOT_FOUND], summary: '', effects: [], figures: {} };
  if (schedule.status !== 'active') return { blockers: [RECURRING_REASONS.ALREADY_STOPPED], summary: '', effects: [], figures: {} };
  return { blockers: [], summary: `Stop ${schedule.id} (${schedule.party}, ${everyWords(schedule.every)}).`, effects: ['Nothing more is made from it. Entries already posted stay.'], figures: {} };
}

const CHALLAN_REASON_WORDS = { 'job-work': 'goods sent for job work', approval: 'supply on approval', 'line-sale': 'line sale', exhibition: 'for an exhibition', 'own-use': 'own use', other: 'other' };

export function quotePreview(state, args) {
  const planned = planQuote(state, args);
  if (!planned.ok) return { blockers: [QUOTE_REASONS[planned.error] || planned.error], summary: '', effects: [], figures: {} };
  const { plan } = planned;
  const heads = plan.igst > 0 ? `IGST ${money(plan.igst)}` : `CGST ${money(plan.cgst)} + SGST ${money(plan.sgst)}`;
  return {
    blockers: [],
    summary: `${kindTitle(plan)} to ${plan.partyName}${plan.partyGstin ? ` (${plan.partyGstin})` : ''} dated ${plan.date}${plan.reason ? ` (${CHALLAN_REASON_WORDS[plan.reason]})` : ''}: taxable ${money(plan.taxable)}, ${heads}, total ${money(plan.total)}.${plan.kind === 'quote' || plan.kind === 'proforma' ? ` Valid until ${plan.validUntil}.` : ''}`,
    effects: ['Nothing is posted to your books and it is in no return until it becomes an invoice.'],
    figures: { total: plan.total, validUntil: plan.validUntil },
  };
}

export function markQuotePreview(state, args) {
  const quote = findQuote(state, args.id);
  if (!quote) return { blockers: [QUOTE_REASONS.QUOTE_NOT_FOUND], summary: '', effects: [], figures: {} };
  if (quote.status === 'invoiced') return { blockers: [QUOTE_REASONS.ALREADY_INVOICED], summary: '', effects: [], figures: {} };
  if (['cancelled', 'returned'].includes(quote.status)) return { blockers: [QUOTE_REASONS.ALREADY_CLOSED], summary: '', effects: [], figures: {} };
  if (!SALES_DOCUMENT_KINDS[kindOf(quote)].outcomes.includes(String(args.outcome || ''))) return { blockers: [QUOTE_REASONS.BAD_OUTCOME], summary: '', effects: [], figures: {} };
  return { blockers: [], summary: `${quote.id} to ${quote.partyName}: ${args.outcome}.`, effects: [], figures: {} };
}

export function convertPreview(state, args) {
  const checked = checkConvert(state, args);
  if (!checked.ok) return { blockers: [QUOTE_REASONS[checked.error] || checked.error], summary: '', effects: [], figures: {} };
  const invoice = documentPreview(state, invoiceArgsFromQuote(checked.quote, args), 'sale');
  const note = checked.expired ? ` The quote expired on ${checked.quote.validUntil}.` : '';
  return { ...invoice, summary: `From ${kindTitle(checked.quote).toLowerCase()} ${checked.quote.id}: ${invoice.summary}${note}` };
}

function countSkips(skipped = []) {
  const counts = {};
  for (const s of skipped) counts[s.reason] = (counts[s.reason] || 0) + 1;
  return Object.entries(counts).map(([reason, n]) => `${n} ${reason}`).join(', ');
}

export function irnPreview(state, args, cancel) {
  const inv = (state.invoices || []).find((i) => i.id === args.invoiceId);
  const what = cancel ? 'Cancel the IRN for' : 'Send';
  return {
    blockers: inv ? [] : [`${args.invoiceId} is not in these books.`],
    summary: `${what} ${args.invoiceId}${inv ? ` (${inv.partyName}, ${money(inv.total)})` : ''} to the e-invoice portal.`,
    effects: [
      'Nothing leaves this machine unless live calls are switched on.',
      'A live call still needs a CA approval bound to this exact payload, made by someone other than the requester.',
    ],
    figures: { invoiceId: args.invoiceId },
  };
}
