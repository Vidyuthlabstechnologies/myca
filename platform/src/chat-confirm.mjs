/**
 * Nothing a chat message says reaches the books until the user confirms it.
 *
 * A planned tool that writes books, or talks to a government API, is turned into
 * a preview: the figures the engines computed, the accounts that will move, and
 * anything that would stop the posting. The preview is held against a one-use
 * token until the next message confirms or discards it.
 */
import { randomBytes } from 'node:crypto';
import { planExpense } from './expenses.mjs';
import { planCreditNote, creditedAgainst, outstandingOf } from './credit-notes.mjs';
import { planDebitNote, planPurchaseNote } from './debit-notes.mjs';
import { checkAnswer, reviewOf, stepText } from './gst-review.mjs';
import { parse2bFile } from './gstr2b-check.mjs';
import { planReminder, findReminder, whenWords } from './reminders.mjs';
import { planCashReading } from './cash-forecast.mjs';
import { planTerms, termsLabel, invoiceTerms, dueDateOf } from './payment-terms.mjs';
import { planAsk, planReply } from './ca-requests.mjs';
import { planQuote, findQuote, checkConvert, invoiceArgsFromQuote } from './quotes.mjs';
import { isReturnPeriod } from './return-period.mjs';
import { gstSplit, partyStateOf } from './chart.mjs';
import { postingDate } from './dates.mjs';
import { isPeriodLocked } from './period-lock.mjs';
import { lastGstRateFor, planPayment } from './invoice.mjs';
import { planFiling } from './filings.mjs';
import { planSupplierReminder } from './supplier-reminders.mjs';
import { planEmployee, planSalaryChange, planLeaving } from './employees.mjs';
import { planDeductor, planTds, planTdsDeposit, tdsWords, wantsTds } from './tds-deduction.mjs';
import { planCreditOpening } from './gst-payment.mjs';
import { checkTdsAnswer } from './tds-review.mjs';
import { planTransport, transportWords, ewayBillNeed } from './eway-bill.mjs';
import { planApproval, planSalaryPayment, payrollWords } from './payroll.mjs';
import { setCurrentCountry, formatMoneyCurrent, countryOf } from './country.mjs';
import { usDocumentPreview, planSalesTaxRate, planContractor } from './us-sales.mjs';
import { planNexus, checkSalesTaxAnswer, planSalesTaxPayment, planSalesTaxFiling } from './us-sales-tax.mjs';
import { planGstPayment } from './gst-pay-record.mjs';
import { planWithholding } from './us-payroll.mjs';
import { planUsImport } from './import-us-books.mjs';
import { planSupplierNote } from './supplier-notes.mjs';
import { planPosImport } from './import-pos.mjs';
import { filingRows } from './deadline-run.mjs';
import { tally, bank, gstin as gstinRules } from './sprint-load.mjs';
import { parseZohoBooksCsv } from './import-zoho.mjs';
import { tallyXmlToDayBookCsv } from './tally-xml.mjs';

export const CONFIRM_TOOLS = new Set([
  'create_invoice', 'create_purchase', 'record_receipt', 'record_payment', 'record_filing', 'record_supplier_reminder', 'add_employee', 'change_salary', 'end_employment', 'approve_payroll', 'record_salary_payment', 'set_tds_deductor', 'record_tds_deposit', 'tds_review_answer', 'set_gst_credit_opening', 'record_gst_payment', 'post_expense', 'set_expense_head', 'create_credit_note', 'create_debit_note', 'create_purchase_note', 'record_supplier_debit_note', 'cancel_invoice', 'gst_review_answer', 'import_gstr2b', 'add_reminder', 'complete_reminder', 'set_cash_balance', 'set_payment_terms', 'set_party_address', 'set_transport', 'set_sales_tax_rate', 'set_contractor', 'set_sales_tax_nexus', 'sales_tax_review_answer', 'record_sales_tax_payment', 'record_sales_tax_filing', 'set_withholding', 'import_us_invoices', 'import_pos_sales', 'ask_ca', 'reply_ca', 'close_ca', 'create_quote', 'mark_quote', 'convert_quote',
  'import_tally', 'import_tally_xml', 'import_zoho', 'import_bank',
  'govt_generate_irn', 'govt_nic_cancel_irn',
  'exception_decide',
]);

const PENDING_TTL_MS = 10 * 60 * 1000;
const CONFIRM_RE = /^\s*(y|yes|yeah|yep|ok|okay|confirm|confirmed|post it|post|go ahead|do it|proceed|haan|ha|sahi)\b[\s!.]*$/i;
const CANCEL_RE = /^\s*(n|no|nope|cancel|discard|stop|don'?t|do not|abort|nahi|nahin)\b[\s!.]*$/i;

function money(n) {
  return formatMoneyCurrent(Number(n) || 0);
}

function stateCodeOf(value) {
  const s = String(value == null ? '' : value).trim();
  return /^\d{1,2}$/.test(s) ? s.padStart(2, '0') : '';
}

function salesTaxRatePreview(state, args) {
  const plan = planSalesTaxRate(state, args);
  if (!plan.ok) {
    const reason = { BAD_JURISDICTION: `${plan.code || 'That'} is not a jurisdiction code I can read (for example TX or TX-AUSTIN).`, BAD_RATE: 'The rate is a percentage from 0 to 20.', INVALID_DATE: 'That is not a date I can read.' }[plan.error] || plan.error;
    return { blockers: [reason], summary: '', effects: [], figures: {} };
  }
  return {
    blockers: [],
    summary: `Sales tax for ${plan.rate.name}${plan.rate.name !== plan.rate.code ? ` (${plan.rate.code})` : ''}: ${plan.rate.ratePercent}% from ${plan.rate.from}${plan.was ? ` (was ${plan.was.ratePercent}% from ${plan.was.from})` : ''}.`,
    effects: ['Invoices to this jurisdiction dated on or after that day use this rate. Invoices already made keep theirs.'],
    figures: { code: plan.rate.code, ratePercent: plan.rate.ratePercent, from: plan.rate.from },
  };
}

function contractorPreview(state, args) {
  const plan = planContractor(state, args);
  if (!plan.ok) {
    const reason = { VENDOR_REQUIRED: 'Say which supplier.', BAD_ENTITY_TYPE: 'The entity type is individual, sole-proprietor, llc, partnership, c-corp, s-corp or other.', BAD_TIN_LAST4: 'Give only the last four digits of the TIN.' }[plan.error] || plan.error;
    return { blockers: [reason], summary: '', effects: [], figures: {} };
  }
  const c = plan.contractor;
  return {
    blockers: [],
    summary: `${c.partyName}: ${c.contractor ? 'a contractor' : 'not a contractor'}${c.entityType ? `, ${c.entityType}` : ''}${c.w9Received ? ', W-9 received' : ', W-9 not yet received'}${c.tinLast4 ? `, TIN ending ${c.tinLast4}` : ''}.`,
    effects: [c.contractor ? 'Payments to them count towards a 1099-NEC for the year.' : 'Payments to them are no longer counted towards a 1099-NEC.', 'Only the last four digits of a TIN are kept here.'],
    figures: { partyName: c.partyName, contractor: c.contractor },
  };
}

const SALES_TAX_REASONS = {
  BAD_STATE: (p) => `${p.state || 'That'} is not a two-letter state code.`,
  BAD_FREQUENCY: () => 'The filing frequency is monthly, quarterly or annual.',
  NO_NEXUS: (p) => `You have not said that you collect sales tax in ${p.state}. Say "I collect sales tax in ${p.state}, quarterly" first.`,
  BAD_PERIOD: (p) => `${p.period} is not a ${p.frequency} period (for example ${p.frequency === 'monthly' ? '2026-09' : p.frequency === 'quarterly' ? '2026-Q3' : '2026'}).`,
  INVALID_DATE: () => 'That is not a date I can read.',
  FUTURE_DATE: () => 'That date has not come yet.',
  PERIOD_LOCKED: (p) => `That date is in a locked period (through ${p.lockThrough}).`,
  NOTHING_DUE: (p) => `Nothing is left to pay for ${p.state} ${p.period}.`,
  BAD_AMOUNT: () => 'The amount must be more than zero.',
  MORE_THAN_DUE: (p) => `That is more than is left to pay (${formatMoneyCurrent(p.due)}).`,
  BAD_CONFIRMATION: () => 'The confirmation number is 3 to 40 letters, digits or dashes.',
  PERIOD_NOT_ENDED: (p) => `${p.period} has not ended yet (it runs to ${p.to}).`,
  ALREADY_RECORDED: (p) => `${p.period} is already recorded as filed (${p.arn} on ${p.filedOn}).`,
  ARN_USED: (p) => `Confirmation ${p.arn} is already recorded against another return.`,
};

function salesTaxBlocked(plan) {
  const reason = SALES_TAX_REASONS[plan.error] || REVIEW_REASONS[plan.error];
  return { blockers: [reason ? (typeof reason === 'function' ? reason(plan) : reason) : plan.error], summary: '', effects: [], figures: {} };
}

function nexusPreview(state, args) {
  const plan = planNexus(state, args);
  if (!plan.ok) return salesTaxBlocked(plan);
  const n = plan.nexus;
  return {
    blockers: [],
    summary: `You collect sales tax in ${n.state} and file ${n.frequency} from ${n.from}${n.permitNo ? `, permit ${n.permitNo}` : ''}${plan.was ? ` (was ${plan.was.frequency} from ${plan.was.from})` : ''}.`,
    effects: ['Returns for that state are drafted from your invoices by period. Nothing is filed by MyCA.'],
    figures: { state: n.state, frequency: n.frequency, from: n.from },
  };
}

function salesTaxReviewAnswerPreview(state, args) {
  const checked = checkSalesTaxAnswer(state, args);
  if (!checked.ok) return salesTaxBlocked(checked);
  const { review, step } = checked;
  const answered = {
    correct: `You are confirming: ${step.title}.`,
    wrong: `You are marking ${step.title.toLowerCase()} as not right${args.note ? `: ${args.note}` : ''}. Fix the entries, then review again.`,
    approve: `You are approving the ${review.month} sales tax return. Nothing is filed.`,
  }[args.answer];
  return {
    blockers: [],
    summary: `${step.title}: ${step.lines.map((line) => `${line.label} ${formatMoneyCurrent(line.amount)}`).join('; ')}.`,
    effects: [answered],
    figures: { state: review.state, period: review.period, step: step.id, answer: args.answer, draftHash: review.draftHash },
  };
}

function salesTaxPaymentPreview(state, args) {
  const plan = planSalesTaxPayment(state, args);
  if (!plan.ok) return salesTaxBlocked(plan);
  const p = plan.payment;
  const left = Math.round((plan.draft.toPay - p.amount) * 100) / 100;
  return {
    blockers: [],
    summary: `Sales tax payment to ${p.state} for ${p.period}: ${formatMoneyCurrent(p.amount)} on ${p.date} from ${p.mode === 'cash' ? 'cash' : 'the bank'}${p.reference ? `, reference ${p.reference}` : ''}.`,
    effects: [`${formatMoneyCurrent(p.amount)} goes out of your ${p.mode === 'cash' ? 'cash' : 'bank'} and reduces sales tax payable.`, left > 0.005 ? `${formatMoneyCurrent(left)} is still to pay for this period.` : 'Nothing is left to pay for this period.'],
    figures: { state: p.state, period: p.period, amount: p.amount, date: p.date, left },
  };
}

function salesTaxFilingPreview(state, args) {
  const plan = planSalesTaxFiling(state, args);
  if (!plan.ok) return salesTaxBlocked(plan);
  const f = plan.filing;
  return {
    blockers: [],
    summary: `Record the ${plan.draft.state} sales tax return for ${f.period} as filed on ${f.filedOn}, confirmation ${f.arn}${f.filedBy ? ` by ${f.filedBy}` : ''}.`,
    effects: [f.late ? `It was due by ${f.dueDate}, so this is late.` : f.dueDate ? `It was due by ${f.dueDate}.` : 'No due date is in the rules for this state.', plan.draft.approved ? 'The figures were approved in the review.' : 'The figures were not approved in the review; the record is kept anyway.', 'MyCA files nothing; this only records what you did.'],
    figures: { state: plan.draft.state, period: f.period, confirmation: f.arn, filedOn: f.filedOn, late: f.late },
  };
}

function gstPaymentPreview(state, args) {
  const plan = planGstPayment(state, args);
  if (!plan.ok) {
    const reason = { INVALID_PERIOD: 'Say the month as YYYY-MM, for example 2026-09.', INVALID_DATE: 'That is not a date I can read.', FUTURE_DATE: 'That date has not come yet.', PERIOD_LOCKED: `That date is in a locked period (through ${plan.lockThrough}).`, ALREADY_RECORDED: `The GST payment for ${plan.period} is already recorded (paid ${plan.paidOn}).`, BAD_CPIN: 'A CPIN is the fourteen-digit challan number from the GST portal.', NOTHING_DUE: `Nothing is due for ${plan.period}: no tax to pay and no credit to set off.` }[plan.error] || plan.error;
    return { blockers: [reason], summary: '', effects: [], figures: {} };
  }
  const p = plan.payment;
  const heads = ['igst', 'cgst', 'sgst'].filter((h) => p.cash[h] > 0).map((h) => `${h.toUpperCase()} ${money(p.cash[h])}`).join(' + ');
  return {
    blockers: [],
    summary: `GST for ${p.period} paid on ${p.date}${p.cpin ? `, CPIN ${p.cpin}` : ''}: ${money(p.cash.total)} in cash${heads ? ` (${heads})` : ''}${p.interest > 0 ? `, interest ${money(p.interest)}` : ''}${p.lateFee > 0 ? `, late fee ${money(p.lateFee)}` : ''}; ${money(p.creditUsed)} of input credit set off.`,
    effects: [`${money(p.cashTotal)} goes out of your ${p.mode === 'cash' ? 'cash' : 'bank'}.`, 'Output tax is cleared by the credit set off and the cash paid; the credit used leaves the input credit accounts.', ...(p.unreviewed ? ['The set-off order, interest and late fee come from dated rules your CA has not reviewed yet.'] : [])],
    figures: { period: p.period, date: p.date, cash: p.cash, interest: p.interest, lateFee: p.lateFee, creditUsed: p.creditUsed, cashTotal: p.cashTotal },
  };
}

function withholdingPreview(state, args) {
  const plan = planWithholding(state, args);
  if (!plan.ok) {
    const reason = { SALARIES_PRIVATE: 'Only the owner can see or change employees and salaries.', EMPLOYEE_NOT_FOUND: 'That employee is not in these books.', BAD_AMOUNT: 'Withholding is an amount of zero or more a month.', BAD_STATE: 'The work state is a two-letter code.' }[plan.error] || plan.error;
    return { blockers: [reason], summary: '', effects: [], figures: {} };
  }
  const w = plan.withholding;
  return {
    blockers: [],
    summary: `${plan.employee.name}: federal withholding ${formatMoneyCurrent(w.federalWithholding)} a month${w.stateWithholding > 0 ? `, state withholding ${formatMoneyCurrent(w.stateWithholding)}` : ''}${w.workState ? `, works in ${w.workState}` : ''}.`,
    effects: ['Payroll months from now on withhold these amounts. MyCA does not work them out from the W-4; they are what you entered.'],
    figures: { id: plan.employee.id, federalWithholding: w.federalWithholding, stateWithholding: w.stateWithholding },
  };
}

function documentPreview(state, args, kind) {
  if (countryOf(state) === 'US') return usDocumentPreview(state, args, kind);
  const company = state.company || {};
  const date = postingDate(args.date);
  const blockers = [];
  if (!date) blockers.push(`${args.date} is not a date I can read.`);
  else if (isPeriodLocked(state, date)) blockers.push(`${date} is inside the locked period (through ${state.lockThrough}).`);
  const sale = kind === 'sale';
  const list = sale ? state.invoices : state.purchases;
  if (args.id && (list || []).some((d) => d.id === args.id)) blockers.push(`${args.id} already exists in these books.`);

  const pos = sale
    ? (stateCodeOf(args.partyState) || partyStateOf(args.partyGstin) || company.state)
    : company.state;
  const supplier = sale ? company.state : (partyStateOf(args.partyGstin) || stateCodeOf(args.partyState) || company.state);
  const unrated = (args.lines || []).findIndex((l) => l.gstRate == null || l.gstRate === '');
  if (unrated >= 0) {
    const last = lastGstRateFor(state, { name: args.partyName, gstin: args.partyGstin }, kind);
    const line = (args.lines || []).length > 1 ? `Line ${unrated + 1} has` : 'This has';
    blockers.push(`${line} no GST rate, and I will not guess one.${last ? ` ${last.from} on ${last.date} was at ${last.gstRate}%.` : ''} Say the rate, or 0% if none applies.`);
  }
  const lines = (args.lines || []).map((l) => {
    const qty = Number(l.qty == null || l.qty === '' ? 1 : l.qty);
    const rate = Number(l.rate);
    const gstRate = Number(l.gstRate == null || l.gstRate === '' ? 0 : l.gstRate);
    const taxable = Math.round(qty * rate * 100) / 100;
    return { ...gstSplit({ taxable, rate: gstRate, supplierState: supplier, partyState: pos }), taxable, gstRate, qty, rate };
  });
  const sum = (key) => Math.round(lines.reduce((s, l) => s + (l[key] || 0), 0) * 100) / 100;
  const taxable = sum('taxable');
  const tax = Math.round((sum('cgst') + sum('sgst') + sum('igst')) * 100) / 100;
  const party = args.partyName || (sale ? 'Walk-in' : 'Supplier');
  const heads = sum('igst') > 0 ? `IGST ${money(sum('igst'))}` : `CGST ${money(sum('cgst'))} + SGST ${money(sum('sgst'))}`;
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
      ? `Invoice to ${party}${args.partyGstin ? ` (${args.partyGstin})` : ''} dated ${date || '?'}: taxable ${money(taxable)}, ${heads}, total ${money(taxable + tax)}. Place of supply ${gstinRules.STATE_CODES?.[pos] || pos || '?'}.${due}`
      : `Purchase bill from ${party}${args.partyGstin ? ` (${args.partyGstin})` : ''} dated ${date || '?'}: taxable ${money(taxable)}, ${heads}, total ${money(taxable + tax)}. Input credit ${args.itcEligible === false ? 'blocked (s.17(5)) and added to cost' : money(tax)}.`,
    effects: sale
      ? [`${party} owes you ${money(taxable + tax)} more.`, `It goes into your GSTR-1${date ? ` for ${date.slice(0, 7)}` : ''}.`]
      : [`You owe ${party} ${money(taxable + tax - (tds?.tds || 0))} more.`, args.itcEligible === false ? 'The GST on it cannot be claimed, so it is part of the cost.' : 'It is checked against your GSTR-2B when you add one.', ...(tds ? [tdsWords(tds, taxable + tax - tds.tds, `you owe ${party}`)] : [])],
    figures: { date, taxable, tax, total: Math.round((taxable + tax) * 100) / 100, placeOfSupply: pos, ...(tds ? { tds: tds.tds, tdsSection: tds.section, tdsRate: tds.rate } : {}) },
  };
}

function receiptPreview(state, args) {
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
  else if (!(amount > 0)) blockers.push('A receipt has to be a positive amount.');
  return {
    blockers,
    summary: `Receipt of ${money(amount)} against ${inv.id} (${inv.partyName}) by ${args.mode === 'cash' ? 'cash' : 'bank'} on ${date || '?'}. Outstanding is ${money(due)} of ${money(inv.total)}.`,
    effects: [`${money(amount)} goes into your ${args.mode === 'cash' ? 'cash' : 'bank'}.`, `${inv.id} becomes ${amount >= due - 0.01 ? 'paid' : 'partly paid'}.`],
    figures: { amount, due, date },
  };
}

const PAYMENT_REASONS = {
  BILL_NOT_FOUND: 'That bill is not in these books.',
  INVALID_DATE: 'That is not a date I can read.',
  BEFORE_BILL: 'A payment cannot be dated before the bill.',
  PERIOD_LOCKED: 'That date is inside the locked period.',
  PARTY_NOT_FOUND: 'The supplier on that bill is missing from these books.',
  BILL_PAID: 'That bill is already fully paid.',
  BAD_AMOUNT: 'A payment has to be a positive amount.',
  OVERPAYMENT: 'That is more than is still owed on the bill.',
  INSUFFICIENT_CASH: 'There is not that much cash in hand. Pay from the bank, or record the cash first.',
};

function paymentPreview(state, args) {
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

const FILING_REASONS = {
  RETURN_REQUIRED: () => 'Say which return and which period, for example "filed GSTR-1 for September, ARN AA2909261234567".',
  BAD_ARN: () => 'An acknowledgement number (ARN) is 10 to 20 letters and digits, as printed on the acknowledgement.',
  INVALID_DATE: () => 'That is not a date I can read.',
  FUTURE_DATE: () => 'A filing date cannot be in the future.',
  UNKNOWN_RETURN: (p) => `MyCA does not list ${p.returnType} for ${p.period} for this business${!p.registered && /^GSTR/.test(p.returnType) ? ', which has no GSTIN in MyCA' : ''}.${p.known?.length ? ` Recent ones: ${p.known.join(', ')}.` : ''}`,
  DEPOSIT_NOT_A_FILING: () => 'A TDS deposit is recorded with its challan, not an ARN. Say "deposited TDS, challan" followed by the reference.',
  ALREADY_RECORDED: (p) => `${p.returnType} for ${p.period} is already recorded as filed on ${p.filedOn} (ARN ${p.arn}).`,
  ARN_USED: (p) => `ARN ${p.arn} is already recorded against another return.`,
};

const SUPPLIER_REMINDER_REASONS = {
  INVALID_PERIOD: () => 'That is not a month I can read.',
  NO_STATEMENT: (p) => `No GSTR-2B has been added for ${p.period}, so MyCA cannot tell what the supplier reported. Add the 2B first.`,
  NOTHING_TO_ASK: () => 'Nothing from this supplier is at risk for that month.',
  OWN_GAPS_ONLY: (p) => `The bills from ${p.supplier} that are at risk are missing their supplier bill number in your books (${p.billIds.join(', ')}). Add the numbers; there is nothing to ask the supplier yet.`,
  EMPTY_MESSAGE: () => 'The message is empty.',
  MESSAGE_TOO_LONG: (p) => `The message is longer than ${p.max} characters.`,
};

function supplierReminderPreview(state, args) {
  const plan = planSupplierReminder(state, args);
  if (!plan.ok) {
    const reason = SUPPLIER_REMINDER_REASONS[plan.error];
    return { blockers: [reason ? reason(plan) : plan.error], summary: '', effects: [], figures: {} };
  }
  const d = plan.draft;
  return {
    blockers: [],
    summary: `Send a reminder to ${d.supplier} about ${d.bills.length === 1 ? '1 bill' : `${d.bills.length} bills`} for ${d.period}, with ${money(d.credit)} of your input credit waiting on them.${d.timesSent ? ` You last reminded them on ${d.lastSent}.` : ''}`,
    effects: ['It goes from your own phone: your WhatsApp, email or another app you pick. MyCA sends nothing itself.', 'The message and the day are kept with the books.'],
    figures: { supplier: d.supplier, period: d.period, bills: d.bills.length, credit: d.credit, edited: plan.edited, timesSent: d.timesSent },
  };
}

export const TDS_REASONS = {
  NOT_A_DEDUCTOR: () => 'This business is not set up to deduct TDS. Say "we deduct TDS, TAN" followed by your TAN first.',
  BAD_TDS_SECTION: () => 'MyCA handles TDS under 194A (interest), 194C (contractors), 194I (rent) and 194J (professional or technical fees).',
  TDS_CATEGORY_REQUIRED: () => 'Under 194J, say whether it is for professional services, technical services or director remuneration; the rate differs.',
  TDS_ASSET_REQUIRED: () => 'Under 194I, say whether the rent is for land, building or furniture, or for plant and machinery; the rate differs.',
  PAN_REQUIRED: () => 'Give the payee\'s PAN. MyCA does not yet have the rule for a payee without a PAN, so it will not guess the rate.',
  BAD_PAN: () => 'That PAN is not in the right form: five letters, four digits and a letter.',
  TDS_RULE_MISSING: () => 'MyCA has no TDS rule in force for that section on that date, so it will not work out a deduction.',
  BAD_TAN: () => 'A TAN is four letters, five digits and a letter.',
  INVALID_DATE: () => 'That is not a date I can read.',
  FUTURE_DATE: () => 'A deposit date cannot be in the future.',
  PERIOD_LOCKED: (p) => `${p.date} is inside the locked period (through ${p.lockThrough}).`,
  BAD_CHALLAN: () => 'Give the challan reference as printed (the CIN, or the BSR code and serial number).',
  CHALLAN_USED: (p) => `Challan ${p.challan} is already recorded.`,
  NOTHING_DUE: () => 'There is no TDS waiting to be deposited.',
  BAD_AMOUNT: () => 'The amount must be a positive number.',
  MORE_THAN_DUE: (p) => `That is more than the ${money(p.due)} of TDS still to deposit.`,
};

function tdsBlocked(plan) {
  const reason = TDS_REASONS[plan.error];
  return { blockers: [reason ? reason(plan) : plan.error], summary: '', effects: [], figures: {} };
}

const CREDIT_OPENING_REASONS = {
  INVALID_PERIOD: () => 'Say the month as YYYY-MM, for example 2026-09.',
  BAD_AMOUNT: (plan) => `The ${String(plan.head || '').toUpperCase()} balance must be a number of rupees, zero or more.`,
};

function creditOpeningPreview(state, args) {
  const plan = planCreditOpening(state, args);
  if (!plan.ok) {
    const reason = CREDIT_OPENING_REASONS[plan.error];
    return { blockers: [reason ? reason(plan) : plan.error], summary: '', effects: [], figures: {} };
  }
  const o = plan.opening;
  return {
    blockers: [],
    summary: `GST credit balance at the start of ${o.period}: IGST ${money(o.igst)}, CGST ${money(o.cgst)}, SGST ${money(o.sgst)}, ${money(o.total)} in all${plan.was ? ` (replaces the balance set for ${plan.was.period})` : ''}.`,
    effects: ["From that month on, the amount to pay counts this credit brought forward, set off before the month's own credit."],
    figures: { period: o.period, igst: o.igst, cgst: o.cgst, sgst: o.sgst },
  };
}

function deductorPreview(state, args) {
  const plan = planDeductor(state, args);
  if (!plan.ok) return tdsBlocked(plan);
  return {
    blockers: [],
    summary: `This business deducts TDS, TAN ${plan.tan}${plan.was && plan.was !== plan.tan ? ` (was ${plan.was})` : ''}.`,
    effects: ['Bills and expenses can then carry a TDS section, and TDS deposits and statements show in your deadlines.'],
    figures: { tan: plan.tan },
  };
}

function tdsDepositPreview(state, args) {
  const plan = planTdsDeposit(state, args);
  if (!plan.ok) return tdsBlocked(plan);
  const d = plan.deposit;
  return {
    blockers: [],
    summary: `TDS deposit of ${money(d.amount)} on ${d.date}, challan ${d.challan}, from ${d.mode === 'cash' ? 'cash' : 'the bank'}.`,
    effects: [`${money(d.amount)} goes out of your ${d.mode === 'cash' ? 'cash' : 'bank'}.`, plan.due - d.amount > 0.005 ? `${money(plan.due - d.amount)} of TDS is still to deposit.` : 'Nothing is left to deposit.'],
    figures: { amount: d.amount, date: d.date, challan: d.challan, left: Math.round((plan.due - d.amount) * 100) / 100 },
  };
}

const EMPLOYEE_REASONS = {
  SALARIES_PRIVATE: () => 'Only the owner can see or change employees and salaries.',
  NAME_REQUIRED: () => 'Give the employee\'s name.',
  INVALID_DATE: () => 'That is not a date I can read.',
  SALARY_REQUIRED: () => 'Give the monthly salary, in one amount or in parts.',
  TOO_MANY_COMPONENTS: (p) => `A salary can have at most ${p.max} parts.`,
  BAD_COMPONENT: () => 'Each part of the salary needs a name of up to 40 letters.',
  DUPLICATE_COMPONENT: (p) => `${p.name} is listed twice.`,
  BAD_AMOUNT: (p) => `${p.name} needs an amount of zero or more.`,
  ZERO_SALARY: () => 'The monthly salary comes to nothing.',
  BAD_PAN: () => 'A PAN is five letters, four digits and a letter.',
  BAD_UAN: () => 'A UAN is 12 digits.',
  BAD_STATE: () => 'Give the state as its two-digit GST code.',
  BAD_REGIME: () => 'The tax regime is new or old.',
  ALREADY_EMPLOYED: (p) => `${p.name} is already on the list as ${p.id}.`,
  EMPLOYEE_NOT_FOUND: (p) => `${p.id} is not on the list of employees.`,
  BEFORE_JOINING: (p) => `That is before they joined on ${p.joinedOn}.`,
  AFTER_LEAVING: (p) => `That is after they left on ${p.leftOn}.`,
  ALREADY_LEFT: (p) => `They are already recorded as having left on ${p.leftOn}.`,
};

function employeeBlocked(plan) {
  const reason = EMPLOYEE_REASONS[plan.error];
  return { blockers: [reason ? reason(plan) : plan.error], summary: '', effects: [], figures: {} };
}

function partsOf(components) {
  return components.map((item) => `${item.name} ${money(item.amount)}`).join(' + ');
}

const NO_PAYROLL = 'Nothing is posted to the books and no payroll is run. Deductions are not worked out yet.';

const PAYROLL_REASONS = {
  SALARIES_PRIVATE: () => 'Only the owner runs payroll.',
  INVALID_PERIOD: () => 'Say the month as YYYY-MM, for example 2026-10.',
  ALREADY_APPROVED: (p) => `Payroll for ${p.period} is already approved.`,
  NO_EMPLOYEES: (p) => `No employee was employed in ${p.period}.`,
  PERIOD_LOCKED: (p, args, state) => `${p.date} is inside the locked period (through ${state.lockThrough}).`,
  DRAFT_CHANGED: () => 'The payroll changed after you saw it. Look at it again before approving.',
  PAYROLL_RULE_MISSING: (p) => `The rule ${p.ruleId} is not in force for that month, so MyCA will not guess.`,
  NOT_APPROVED: (p) => `Payroll for ${p.period} is not approved yet.`,
  ALREADY_PAID: (p) => `Salaries for ${p.period} were recorded as paid on ${p.paidOn}.`,
  INVALID_DATE: (p) => `${p.date} is not a date I can read.`,
  FUTURE_DATE: () => 'The payment date cannot be in the future.',
  BEFORE_PERIOD: (p) => `Salaries for ${p.period} cannot be paid before that month starts.`,
  INSUFFICIENT_CASH: (p) => `There is not that much cash in hand (${money(p.inHand)}).`,
};

function payrollBlocked(plan, args, state) {
  const reason = PAYROLL_REASONS[plan.error];
  return { blockers: [reason ? reason(plan, args, state) : plan.error], summary: '', effects: [], figures: {} };
}

function payrollApprovalPreview(state, args) {
  const planned = planApproval(state, args);
  if (!planned.ok) return payrollBlocked(planned, args, state);
  const d = planned.data;
  return {
    blockers: [],
    summary: payrollWords({ ...d, status: 'draft' }, money),
    effects: [`Posts ${money(d.totals.gross)} of salaries, ${money(d.totals.net)} as salaries payable, and each deduction as payable; records ${money(d.totals.tds)} of salary TDS. Pays nothing.`],
    figures: { period: d.period, employees: d.employees, gross: d.totals.gross, net: d.totals.net, employerCost: d.totals.employerCost, draftHash: d.draftHash },
  };
}

function salaryPaymentPreview(state, args) {
  const planned = planSalaryPayment(state, args);
  if (!planned.ok) return payrollBlocked(planned, args, state);
  return {
    blockers: [],
    summary: `Salaries for ${planned.run.month}: ${money(planned.amount)} paid from ${planned.mode === 'cash' ? 'cash' : 'the bank'} on ${planned.date}.`,
    effects: ['Clears salaries payable. The deductions stay payable until deposited.'],
    figures: { period: planned.run.period, amount: planned.amount, date: planned.date, mode: planned.mode },
  };
}

function employeePreview(state, args) {
  const plan = planEmployee(state, args);
  if (!plan.ok) return employeeBlocked(plan);
  const e = plan.employee;
  const pay = e.salary[0];
  const flags = [e.pfMember ? 'in provident fund' : '', e.esiMember ? 'in state insurance' : '', e.taxRegime ? `${e.taxRegime} tax regime` : ''].filter(Boolean);
  return {
    blockers: [],
    summary: `Add ${e.name}${e.designation ? `, ${e.designation},` : ''} joined ${e.joinedOn}, at ${money(pay.monthly)} a month${pay.components.length > 1 ? ` (${partsOf(pay.components)})` : ''}.${flags.length ? ` ${flags.join(', ')}.` : ''}`,
    effects: [NO_PAYROLL, 'Only the owner sees salaries.'],
    figures: { monthly: pay.monthly, joinedOn: e.joinedOn },
  };
}

function salaryChangePreview(state, args) {
  const plan = planSalaryChange(state, args);
  if (!plan.ok) return employeeBlocked(plan);
  return {
    blockers: [],
    summary: `${plan.employee.name}: ${money(plan.row.monthly)} a month from ${plan.row.from}${plan.before ? `, was ${money(plan.before.monthly)}` : ''}.`,
    effects: ['Earlier months keep the salary they had.', NO_PAYROLL],
    figures: { monthly: plan.row.monthly, from: plan.row.from, was: plan.before?.monthly ?? null },
  };
}

function leavingPreview(state, args) {
  const plan = planLeaving(state, args);
  if (!plan.ok) return employeeBlocked(plan);
  return {
    blockers: [],
    summary: `${plan.employee.name} left; last day ${plan.leftOn}.`,
    effects: ['Their record and salary history are kept.', 'No final settlement is worked out.'],
    figures: { leftOn: plan.leftOn },
  };
}

function filingPreview(state, args) {
  const plan = planFiling(state, args, filingRows(state, args.filedOn));
  if (!plan.ok) {
    const reason = FILING_REASONS[plan.error];
    return { blockers: [reason ? reason(plan) : plan.error], summary: '', effects: [], figures: {} };
  }
  const f = plan.filing;
  return {
    blockers: [],
    summary: `Record ${f.label} for ${f.period} as filed on ${f.filedOn}, ARN ${f.arn}${f.filedBy ? `, by ${f.filedBy}` : ''}. It was due on ${f.dueDate}.${f.late ? ' That is after the due date.' : ''}`,
    effects: ['MyCA files nothing; this records a filing already made.', 'The return stops showing as due, and the ARN is kept with the books.'],
    figures: { returnType: f.returnType, period: f.period, arn: f.arn, filedOn: f.filedOn, dueDate: f.dueDate, late: f.late },
  };
}

function expensePreview(state, args) {
  const planned = planExpense(state, args);
  if (!planned.ok) {
    const reason = {
      INVALID_DATE: `${args.date} is not a date I can read.`,
      PERIOD_LOCKED: `${planned.date} is inside the locked period (through ${state.lockThrough}).`,
      BAD_AMOUNT: 'The amount must be a positive number.',
      BAD_RATE: 'The GST rate must be between 0 and 28.',
      BAD_MODE: 'Paid from must be bank or cash.',
      INSUFFICIENT_CASH: `Cash in hand is ${money(planned.inHand)} and this is ${money(planned.amount)}. Record where the cash came from first, or pay it from bank.`,
      BAD_GSTIN: 'That supplier GSTIN is not 15 characters.',
      UNKNOWN_HEAD: `${args.head} is not an expense head.`,
    }[planned.error] || (TDS_REASONS[planned.error] ? TDS_REASONS[planned.error](planned) : planned.error);
    return { blockers: [reason], summary: '', effects: [], figures: {} };
  }
  const { plan } = planned;
  const what = plan.description || plan.payee || 'Expense';
  return {
    blockers: [],
    summary: `${plan.tag.headName}: ${what} ${money(plan.amount)} paid from ${plan.mode} on ${plan.date}. ${plan.creditNote}`,
    effects: [plan.tag.why, `${money(plan.amount - (plan.tds?.tds || 0))} goes out of your ${plan.mode === 'cash' ? 'cash' : 'bank'}${plan.inputCredit ? ', with the GST in it counted as input credit' : ''}.`, ...(plan.tds ? [tdsWords(plan.tds, plan.amount - plan.tds.tds, `pay ${plan.payee || 'them'}`)] : [])],
    figures: { date: plan.date, head: plan.tag.head, headName: plan.tag.headName, tagSource: plan.tag.source, taxable: plan.taxable, gstRate: plan.gstRate, inputCredit: plan.inputCredit, amount: plan.amount, mode: plan.mode, ...(plan.tds ? { tds: plan.tds.tds, tdsSection: plan.tds.section, tdsRate: plan.tds.rate } : {}) },
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

function creditNotePreview(state, args, cancel = false) {
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

function debitNotePreview(state, args) {
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

function purchaseNotePreview(state, args) {
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

function supplierNotePreview(state, args) {
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

const REVIEW_REASONS = {
  DRAFT_CHANGED: 'Your books for this month changed after you saw these figures. Review again to see the current ones.',
  STEP_NOT_READY: 'An earlier step of this review is not confirmed yet.',
  NOTHING_TO_REVIEW: 'There is nothing dated in this month to review.',
  OWNER_APPROVES: 'Only the owner approves the return.',
  ANSWER_DOES_NOT_FIT: 'That answer does not fit this step.',
  UNKNOWN_STEP: 'That is not a step of the review.',
  INVALID_PERIOD: 'That is not a month I can read.',
};

function reviewAnswerPreview(state, args) {
  const checked = checkAnswer(state, args);
  if (!checked.ok) return { blockers: [REVIEW_REASONS[checked.error] || checked.error], summary: '', effects: [], figures: {} };
  const { review, step } = checked;
  const answered = {
    correct: `You are confirming: ${step.title}.`,
    wrong: `You are marking ${step.title.toLowerCase()} as not right${args.note ? `: ${args.note}` : ''}. Fix the entries, then review again.`,
    approve: `You are approving the ${review.month} figures. Nothing is filed.`,
  }[args.answer];
  return {
    blockers: [],
    summary: stepText(review, step.id, money),
    effects: [answered],
    figures: { period: review.period, step: step.id, answer: args.answer, draftHash: review.draftHash },
  };
}

function tdsReviewAnswerPreview(state, args) {
  const checked = checkTdsAnswer(state, args);
  if (!checked.ok) return { blockers: [REVIEW_REASONS[checked.error] || checked.error], summary: '', effects: [], figures: {} };
  const { review, step } = checked;
  const answered = {
    correct: `You are confirming: ${step.title}.`,
    wrong: `You are marking ${step.title.toLowerCase()} as not right${args.note ? `: ${args.note}` : ''}. Fix the entries, then review again.`,
    approve: `You are approving the ${review.period}${review.kind === 'salary' ? ' salary' : ''} TDS statement. Nothing is filed.`,
  }[args.answer];
  return {
    blockers: [],
    summary: stepText(review, step.id, money),
    effects: [answered],
    figures: { period: review.period, form: review.kind, step: step.id, answer: args.answer, draftHash: review.draftHash },
  };
}

function gstr2bPreview(state, args) {
  if (!isReturnPeriod(args.period)) return { blockers: ['Say which month this 2B is for.'], summary: '', effects: [], figures: {} };
  const { rows, errors } = parse2bFile(args.csv);
  if (!rows.length) return { blockers: ['No GSTR-2B rows could be read from this file. Use the CSV downloaded from the GST portal.'], summary: '', effects: [], figures: {} };
  const suppliers = new Set(rows.map((row) => row.supplierGstin)).size;
  const replaces = state.gstr2b && Object.hasOwn(state.gstr2b, args.period);
  return {
    blockers: [],
    summary: `GSTR-2B for ${args.period}: ${rows.length} ${rows.length === 1 ? 'entry' : 'entries'} from ${suppliers} ${suppliers === 1 ? 'supplier' : 'suppliers'}${errors.length ? `; ${errors.length} ${errors.length === 1 ? 'row' : 'rows'} could not be read and will be left out` : ''}.${replaces ? ' This replaces the 2B already added for that month.' : ''}`,
    effects: ['Nothing is posted to your books. Your purchase bills are checked against it.'],
    figures: { period: args.period, rows: rows.length, suppliers, skipped: errors.length },
  };
}

const REMINDER_REASONS = {
  TEXT_REQUIRED: () => 'Say what to remind you about.',
  TEXT_TOO_LONG: () => 'Keep the reminder under 200 characters.',
  INVALID_DATE: (p) => `${p.due} is not a date I can read.`,
  DATE_PASSED: (p) => `${p.due} has already passed.`,
  INVOICE_NOT_FOUND: (p) => `${p.invoiceId} is not an invoice in these books.`,
  BILL_NOT_FOUND: (p) => `${p.billId} is not a bill in these books.`,
};

function reminderPreview(state, args) {
  const planned = planReminder(state, args);
  if (!planned.ok) return { blockers: [(REMINDER_REASONS[planned.error] || (() => planned.error))(planned)], summary: '', effects: [], figures: {} };
  const { plan } = planned;
  const about = plan.about ? ` (${plan.about.id || plan.about.name}${plan.about.kind === 'invoice' || plan.about.kind === 'bill' ? `, ${plan.about.name}` : ''})` : '';
  return {
    blockers: [],
    summary: `Remind you ${whenWords(plan.inDays, plan.due)}: ${plan.text}${about}.`,
    effects: ['It shows on Home on that day. Nothing is sent to anyone.'],
    figures: { due: plan.due, inDays: plan.inDays },
  };
}

function completeReminderPreview(state, args) {
  const reminder = findReminder(state, args.id);
  if (!reminder) return { blockers: [`${args.id} is not a reminder here.`], summary: '', effects: [], figures: {} };
  if (reminder.done) return { blockers: [`${reminder.id} is already done.`], summary: '', effects: [], figures: {} };
  return { blockers: [], summary: `Mark done: ${reminder.text}.`, effects: [], figures: { id: reminder.id } };
}

function cashReadingPreview(state, args) {
  const planned = planCashReading(state, args);
  if (!planned.ok) {
    const reason = {
      INVALID_DATE: `${args.on} is not a date I can read.`,
      FUTURE_DATE: 'A balance can only be given for today or a day that has passed.',
      BALANCE_REQUIRED: 'Give the bank balance, the cash in hand, or both.',
      BAD_AMOUNT: 'The balance must be a number; cash in hand cannot be negative.',
    }[planned.error] || planned.error;
    return { blockers: [reason], summary: '', effects: [], figures: {} };
  }
  const { plan } = planned;
  return {
    blockers: [],
    summary: `On ${plan.on}: bank ${money(plan.bank)}, cash in hand ${money(plan.cash)}. MyCA had recorded bank ${money(plan.recordedBank)} and cash ${money(plan.recordedCash)}.`,
    effects: ['The cash forecast starts from these figures. Nothing is posted to your books.'],
    figures: { on: plan.on, bank: plan.bank, cash: plan.cash },
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

function transportPreview(state, args) {
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

function addressPreview(state, args) {
  const name = String(args.partyName || '').trim();
  const address = String(args.address || '').trim();
  if (!name) return { blockers: ['Say which customer.'], summary: '', effects: [], figures: {} };
  if (!address) return { blockers: ['Say the address.'], summary: '', effects: [], figures: {} };
  const known = (state.parties || []).find((p) => p.name.toLowerCase() === name.toLowerCase());
  return {
    blockers: [],
    summary: `${name}: address ${address}${known?.address ? ` (was ${known.address})` : ''}.`,
    effects: ['It prints on their invoices from now on. Invoices already made are not changed.'],
    figures: { partyName: name, address },
  };
}

function termsPreview(state, args) {
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

const CA_REASONS = {
  NOTE_REQUIRED: 'Write what you want to ask.',
  NOTE_TOO_LONG: 'Keep it under 1,000 characters.',
  TEXT_REQUIRED: 'Write a reply.',
  TEXT_TOO_LONG: 'Keep it under 1,000 characters.',
  UNKNOWN_SUBJECT: 'That is not something MyCA can attach.',
  SUBJECT_NOT_FOUND: 'That is not in these books.',
  REQUEST_NOT_FOUND: 'That question is not here.',
  REQUEST_CLOSED: 'That question is closed.',
};

function askPreview(state, args) {
  const planned = planAsk(state, args);
  if (!planned.ok) return { blockers: [CA_REASONS[planned.error] || planned.error], summary: '', effects: [], figures: {} };
  const { plan } = planned;
  return {
    blockers: [],
    summary: `Ask your CA about ${plan.title}: "${plan.note}"`,
    effects: [
      plan.context.facts.length ? `MyCA attaches: ${plan.context.facts.join('; ')}.` : 'Nothing is attached.',
      'Your CA sees it in MyCA once you have invited them. Nothing is sent outside MyCA.',
    ],
    figures: { title: plan.title },
  };
}

function replyPreview(state, args) {
  const planned = planReply(state, args);
  if (!planned.ok) return { blockers: [CA_REASONS[planned.error] || planned.error], summary: '', effects: [], figures: {} };
  return { blockers: [], summary: `Reply on ${planned.request.title}: "${planned.text}"`, effects: [], figures: {} };
}

function closePreview(state, args) {
  const request = (state.caRequests || []).find((item) => item.id === String(args.id || '').toUpperCase());
  if (!request) return { blockers: [CA_REASONS.REQUEST_NOT_FOUND], summary: '', effects: [], figures: {} };
  if (request.status === 'closed') return { blockers: [CA_REASONS.REQUEST_CLOSED], summary: '', effects: [], figures: {} };
  return { blockers: [], summary: `Close the question: ${request.title}.`, effects: [], figures: {} };
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
  BAD_OUTCOME: 'A quote is accepted or declined.',
};

function quotePreview(state, args) {
  const planned = planQuote(state, args);
  if (!planned.ok) return { blockers: [QUOTE_REASONS[planned.error] || planned.error], summary: '', effects: [], figures: {} };
  const { plan } = planned;
  const heads = plan.igst > 0 ? `IGST ${money(plan.igst)}` : `CGST ${money(plan.cgst)} + SGST ${money(plan.sgst)}`;
  return {
    blockers: [],
    summary: `Quote to ${plan.partyName}${plan.partyGstin ? ` (${plan.partyGstin})` : ''} dated ${plan.date}: taxable ${money(plan.taxable)}, ${heads}, total ${money(plan.total)}. Valid until ${plan.validUntil}.`,
    effects: ['Nothing is posted to your books and it is in no return until it becomes an invoice.'],
    figures: { total: plan.total, validUntil: plan.validUntil },
  };
}

function markQuotePreview(state, args) {
  const quote = findQuote(state, args.id);
  if (!quote) return { blockers: [QUOTE_REASONS.QUOTE_NOT_FOUND], summary: '', effects: [], figures: {} };
  if (quote.status === 'invoiced') return { blockers: [QUOTE_REASONS.ALREADY_INVOICED], summary: '', effects: [], figures: {} };
  return { blockers: [], summary: `${quote.id} to ${quote.partyName}: ${args.outcome}.`, effects: [], figures: {} };
}

function convertPreview(state, args) {
  const checked = checkConvert(state, args);
  if (!checked.ok) return { blockers: [QUOTE_REASONS[checked.error] || checked.error], summary: '', effects: [], figures: {} };
  const invoice = documentPreview(state, invoiceArgsFromQuote(checked.quote, args), 'sale');
  const note = checked.expired ? ` The quote expired on ${checked.quote.validUntil}.` : '';
  return { ...invoice, summary: `From quote ${checked.quote.id}: ${invoice.summary}${note}` };
}

function countSkips(skipped = []) {
  const counts = {};
  for (const s of skipped) counts[s.reason] = (counts[s.reason] || 0) + 1;
  return Object.entries(counts).map(([reason, n]) => `${n} ${reason}`).join(', ');
}

function tallyPreview(state, args, csv, label) {
  const parsed = tally.ingest({ type: 'csv', content: csv }, { fileLabel: label });
  const rows = (parsed.rows || []).filter((r) => !r._blocking);
  const already = new Set([...(state.invoices || []), ...(state.purchases || [])].map((d) => d.id));
  const seen = rows.filter((r) => already.has(`TALLY-${r.voucherNo}`) || [...already].some((id) => id.endsWith(`-${r.voucherNo}`))).length;
  return {
    blockers: [],
    summary: `${label}: ${(parsed.rows || []).length} rows parsed, ${rows.length} postable${seen ? `, about ${seen} already in these books and will be skipped` : ''}. Vouchers with no readable GST rate are held back rather than taxed at a guess.`,
    effects: ['Sales and purchase vouchers post as invoices and bills; receipts and payments post to the ledger.', 'Rows already imported are skipped, so importing the same file twice changes nothing.'],
    figures: { rows: (parsed.rows || []).length, postable: rows.length },
  };
}

function bankPreview(state, args) {
  const parsed = bank.ingest({ type: args.type || 'csv', content: args.content }, { fileLabel: args.fileName || 'bank' });
  const rows = (parsed.rows || []).filter((r) => !r._blocking && r.type !== 'balance-only');
  return {
    blockers: [],
    summary: `Bank statement: ${(parsed.rows || []).length} rows parsed, ${rows.length} postable${parsed.ok === false ? ' (the running balance does not tie — check the statement)' : ''}.`,
    effects: ['Each row posts against bank with the classified account.', 'Rows already imported are recognised and skipped.'],
    figures: { rows: (parsed.rows || []).length, postable: rows.length, tied: parsed.ok !== false },
  };
}

function zohoPreview(state, args) {
  const parsed = parseZohoBooksCsv(args.csv);
  const existing = new Set((state.invoices || []).map((i) => i.id));
  const dup = parsed.invoices.filter((i) => existing.has(i.id)).length;
  const noRate = parsed.invoices.filter((i) => i.lines.some((l) => l.gstRate == null)).length;
  return {
    blockers: parsed.meta?.error ? [`The file could not be read: ${parsed.meta.error}.`] : [],
    summary: `Zoho Books: ${parsed.invoices.length} invoices parsed${dup ? `, ${dup} already booked` : ''}${noRate ? `, ${noRate} with no tax rate and so held back` : ''}.`,
    effects: ['Each new invoice posts to the ledger and GSTR-1.'],
    figures: { invoices: parsed.invoices.length, duplicates: dup, missingRate: noRate },
  };
}

function usImportPreview(state, args) {
  const plan = planUsImport(state, args);
  if (!plan.ok) return { blockers: [`The file could not be read: ${plan.error}.`], summary: '', effects: [], figures: {} };
  const reasons = {};
  for (const row of plan.skipped) reasons[row.reason] = (reasons[row.reason] || 0) + 1;
  const words = { exists: 'already booked', jurisdiction_missing: 'with no sales tax jurisdiction (say "import xero tax TX" to apply one)', tax_differs: 'whose sales tax differs from the recorded rate', RATE_UNKNOWN: 'with no rate recorded for their jurisdiction', INVALID_DATE: 'with a date I cannot read', PERIOD_LOCKED: 'in a locked period' };
  const held = Object.entries(reasons).map(([reason, count]) => `${count} ${words[reason] || reason}`);
  const source = plan.parsed.source === 'xero' ? 'Xero' : plan.parsed.source === 'quickbooks' ? 'QuickBooks' : 'Invoice file';
  const total = plan.ready.reduce((sum, item) => sum + item.total, 0);
  return {
    blockers: [],
    summary: `${source}: ${plan.parsed.count} invoices read, ${plan.ready.length} ready to post${plan.ready.length ? ` totalling ${formatMoneyCurrent(total)}` : ''}${held.length ? `; held back: ${held.join('; ')}` : ''}.`,
    effects: ['Each ready invoice posts with sales tax from the rate you recorded for its jurisdiction; the file\'s own tax figure is only checked against it.', 'Held-back invoices are listed by number so you can fix the rate or the file and import again.'],
    figures: { invoices: plan.parsed.count, ready: plan.ready.length, heldBack: plan.skipped.length },
  };
}

function posImportPreview(state, args) {
  const plan = planPosImport(state, args);
  if (!plan.ok) return { blockers: [plan.error === 'NO_HEADER' ? `The file needs ${plan.parsed.need}.` : `The file could not be read: ${plan.error}.`], summary: '', effects: [], figures: {} };
  const reasons = {};
  for (const row of plan.skipped) reasons[row.reason] = (reasons[row.reason] || 0) + 1;
  const words = { exists: 'already imported', tax_differs: 'whose GST in the file differs from the rate', RATE_REQUIRED: 'rows with no GST rate', INVALID_DATE: 'rows with a date I cannot read', BAD_AMOUNT: 'rows with an amount I cannot read', PERIOD_LOCKED: 'in a locked period' };
  const held = Object.entries(reasons).map(([reason, count]) => `${count} ${words[reason] || reason}`);
  const total = plan.ready.reduce((sum, item) => sum + item.taxable + item.tax, 0);
  return {
    blockers: [],
    summary: `Counter sales: ${plan.parsed.count === 1 ? '1 day' : `${plan.parsed.count} days`} read, ${plan.ready.length} ready to post${plan.ready.length ? ` totalling ${money(total)}` : ''}${held.length ? `; held back: ${held.join('; ')}` : ''}.`,
    effects: ['Each day posts as one walk-in invoice with a line per GST rate, so GSTR-1 shows it under B2CS by rate.', 'Nothing is matched to a customer; these are counter sales to unregistered buyers.'],
    figures: { days: plan.parsed.count, ready: plan.ready.length, heldBack: plan.skipped.length },
  };
}

function xmlPreview(state, args) {
  const converted = tallyXmlToDayBookCsv(args.xml);
  if (!converted.ok) return { blockers: [converted.error], summary: 'The XML could not be read.', effects: [], figures: {} };
  return tallyPreview(state, args, converted.csv, `Tally XML (${converted.count} vouchers)`);
}

function irnPreview(state, args, cancel) {
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

const DECISION_WORD = { waive: 'Waive', resolve: 'Resolve', assign: 'Assign', reopen: 'Reopen' };

function exceptionPreview(state, args) {
  const entry = (state.exceptions || []).find((e) => e.id === args.id);
  if (!entry) return { blockers: [`${args.id} is not in the queue.`], summary: '', effects: [], figures: {} };
  const reason = String(args.note || '').trim();
  const blockers = [];
  if ((args.decision === 'waive' || args.decision === 'resolve') && !reason) {
    blockers.push('Say why, in a note; the reason is part of the audit trail.');
  }
  if (args.decision === 'assign' && !String(args.owner || '').trim()) blockers.push('Name the person it is assigned to.');
  return {
    blockers,
    summary: `${DECISION_WORD[args.decision] || args.decision} ${entry.id}: ${entry.title} (${entry.severity}, ${money(entry.moneyAtRisk)} at risk).`,
    effects: args.decision === 'waive'
      ? ['The exception stays in the books as waived, with your reason and your name against it.', 'It will not come back to the open queue while it is still detected.']
      : ['The queue is updated and the decision is written to the audit trail.'],
    figures: { severity: entry.severity, moneyAtRisk: entry.moneyAtRisk },
  };
}

const PREVIEWERS = {
  create_invoice: (state, args) => documentPreview(state, args, 'sale'),
  create_purchase: (state, args) => documentPreview(state, args, 'purchase'),
  record_receipt: receiptPreview,
  record_payment: paymentPreview,
  record_filing: filingPreview,
  record_supplier_reminder: supplierReminderPreview,
  add_employee: employeePreview,
  approve_payroll: payrollApprovalPreview,
  record_salary_payment: salaryPaymentPreview,
  set_tds_deductor: deductorPreview,
  set_gst_credit_opening: creditOpeningPreview,
  record_gst_payment: gstPaymentPreview,
  record_tds_deposit: tdsDepositPreview,
  change_salary: salaryChangePreview,
  end_employment: leavingPreview,
  post_expense: expensePreview,
  create_credit_note: creditNotePreview,
  create_debit_note: debitNotePreview,
  create_purchase_note: purchaseNotePreview,
  record_supplier_debit_note: supplierNotePreview,
  cancel_invoice: (state, args) => creditNotePreview(state, args, true),
  gst_review_answer: reviewAnswerPreview,
  tds_review_answer: tdsReviewAnswerPreview,
  import_gstr2b: gstr2bPreview,
  add_reminder: reminderPreview,
  complete_reminder: completeReminderPreview,
  set_cash_balance: cashReadingPreview,
  set_payment_terms: termsPreview,
  set_party_address: addressPreview,
  set_sales_tax_rate: salesTaxRatePreview,
  set_contractor: contractorPreview,
  set_sales_tax_nexus: nexusPreview,
  set_withholding: withholdingPreview,
  sales_tax_review_answer: salesTaxReviewAnswerPreview,
  record_sales_tax_payment: salesTaxPaymentPreview,
  record_sales_tax_filing: salesTaxFilingPreview,
  set_transport: transportPreview,
  ask_ca: askPreview,
  create_quote: quotePreview,
  mark_quote: markQuotePreview,
  convert_quote: convertPreview,
  reply_ca: replyPreview,
  close_ca: closePreview,
  import_tally: (state, args) => tallyPreview(state, args, args.csv, args.fileName || 'Tally Day Book'),
  import_tally_xml: xmlPreview,
  import_zoho: zohoPreview,
  import_us_invoices: usImportPreview,
  import_pos_sales: posImportPreview,
  import_bank: bankPreview,
  govt_generate_irn: (state, args) => irnPreview(state, args, false),
  govt_nic_cancel_irn: (state, args) => irnPreview(state, args, true),
  exception_decide: exceptionPreview,
};

const PERSISTED_PENDING_LIMIT = 64 * 1024;

// A preview has to outlive the request that made it, so it is saved with the books.
// One that carries a whole file is too big to keep there and stays in memory only.
export function persistablePending(pending) {
  if (!pending || typeof pending !== 'object') return null;
  return JSON.stringify(pending).length > PERSISTED_PENDING_LIMIT ? null : pending;
}

export function restoredPending(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.token !== 'string' || typeof raw.name !== 'string') return null;
  if (!CONFIRM_TOOLS.has(raw.name)) return null;
  return raw;
}

export function restoredConfirmation(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.token !== 'string') return null;
  return { token: raw.token, tool: String(raw.tool || ''), reply: String(raw.reply || ''), posted: raw.posted === true };
}

export function needsConfirmation(name) {
  return CONFIRM_TOOLS.has(name);
}

export function previewOf(state, name, args = {}) {
  setCurrentCountry(state);
  const build = PREVIEWERS[name];
  if (!build) return { blockers: [], summary: `Run ${name}.`, effects: [], figures: {} };
  try {
    return build(state, args);
  } catch (err) {
    return { blockers: [`I could not work out what this would do: ${String(err.message || err)}`], summary: `Run ${name}.`, effects: [], figures: {} };
  }
}

export function openPending(state, plan, preview, now = Date.now()) {
  const pending = {
    token: randomBytes(6).toString('hex'),
    name: plan.name,
    args: plan.args,
    clearsPendingFile: Boolean(plan.clearsPendingFile),
    summary: preview.summary,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + PENDING_TTL_MS).toISOString(),
  };
  state.pendingChatAction = pending;
  return pending;
}

export function clearPending(state) {
  state.pendingChatAction = null;
}

export function confirmationIntent(text) {
  const raw = String(text == null ? '' : text).trim();
  if (CONFIRM_RE.test(raw)) return 'confirm';
  if (CANCEL_RE.test(raw)) return 'cancel';
  const token = raw.match(/^\s*(?:confirm|post)\s+([0-9a-f]{12})\s*$/i);
  if (token) return { token: token[1].toLowerCase() };
  return null;
}

// A pending action is single use and expires, so a stray "yes" much later posts nothing.
export function takePending(state, intent, now = Date.now()) {
  const pending = state.pendingChatAction;
  if (!pending) return { ok: false, error: 'NOTHING_PENDING' };
  clearPending(state);
  if (Date.parse(pending.expiresAt) <= now) return { ok: false, error: 'EXPIRED', pending };
  if (typeof intent === 'object' && intent.token && intent.token !== pending.token) return { ok: false, error: 'TOKEN_MISMATCH', pending };
  return { ok: true, pending };
}

export function previewReply(preview, pending) {
  const lines = [preview.summary];
  for (const effect of preview.effects || []) lines.push(`· ${effect}`);
  lines.push('');
  lines.push(`Nothing is posted yet. Reply "yes" to post it, "no" to discard, or "confirm ${pending.token}".`);
  return lines.join('\n');
}

export function blockedReply(preview) {
  return [`I did not post anything, because:`, ...preview.blockers.map((b) => `· ${b}`)].join('\n');
}
