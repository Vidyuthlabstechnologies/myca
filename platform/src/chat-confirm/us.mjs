import { planPayrollImport } from '../us-payroll-import.mjs';
import { formatMoneyCurrent } from '../country.mjs';
import { planContractor, planSalesTaxRate } from '../us-sales.mjs';
import { checkSalesTaxAnswer, planNexus, planSalesTaxFiling, planSalesTaxPayment } from '../us-sales-tax.mjs';
import { planSutaRate, planWithholding } from '../us-payroll.mjs';
import { planUsImport } from '../import-us-books.mjs';
import { REVIEW_REASONS, money } from './shared.mjs';

export function salesTaxRatePreview(state, args) {
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

export function contractorPreview(state, args) {
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

export function nexusPreview(state, args) {
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

export function salesTaxReviewAnswerPreview(state, args) {
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

export function salesTaxPaymentPreview(state, args) {
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

export function salesTaxFilingPreview(state, args) {
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

export function sutaRatePreview(state, args) {
  const plan = planSutaRate(state, args);
  if (!plan.ok) {
    const reason = { BAD_STATE: 'The state is a two-letter code.', BAD_RATE: 'The rate is a percentage from 0 to 15.', BAD_WAGE_BASE: 'The wage base is the yearly wages per employee the rate applies to, up to 100,000.', INVALID_DATE: 'That is not a date I can read.' }[plan.error] || plan.error;
    return { blockers: [reason], summary: '', effects: [], figures: {} };
  }
  const r = plan.rate;
  return {
    blockers: [],
    summary: `State unemployment for ${r.state}: ${r.ratePercent}% on the first ${formatMoneyCurrent(r.wageBase)} of each employee's wages, from ${r.from}${plan.was ? ` (was ${plan.was.ratePercent}% up to ${formatMoneyCurrent(plan.was.wageBase)})` : ''}.`,
    effects: ['Payroll months from that date charge it as an employer tax for employees who work in that state.'],
    figures: { state: r.state, ratePercent: r.ratePercent, wageBase: r.wageBase, from: r.from },
  };
}

export function withholdingPreview(state, args) {
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

const PAYROLL_IMPORT_REASONS = { NOT_FOR_COUNTRY: 'Provider payrolls are posted for a US business only.', EMPTY: 'The file is empty.', NO_ROWS: 'No payroll row could be read.', ALREADY_IMPORTED: 'Every payroll in this file is already in the books.' };

export function payrollImportPreview(state, args) {
  const planned = planPayrollImport(state, args);
  if (!planned.ok) {
    const reason = planned.error === 'NO_HEADER' ? `The file needs ${planned.need}.` : planned.error === 'PERIOD_LOCKED' ? `${planned.date} is inside the locked period (through ${state.lockThrough}).` : PAYROLL_IMPORT_REASONS[planned.error] || planned.error;
    return { blockers: [reason], summary: '', effects: [], figures: {} };
  }
  const p = planned.plan;
  const d = (c) => Math.round(c) / 100;
  const dates = p.rows.map((r) => r.checkDate).sort();
  return {
    blockers: [],
    summary: `Post ${p.rows.length} ${p.provider === 'gusto' ? 'Gusto' : p.provider} ${p.rows.length === 1 ? 'payroll' : 'payrolls'} (${dates[0]}${dates.length > 1 ? ` to ${dates.at(-1)}` : ''}): wages ${money(d(p.totals.grossCents))}, employer taxes ${money(d(p.totals.employerTaxesCents))}, net pay ${money(d(p.totals.netCents))}.`,
    effects: [
      `Wages and employer taxes become expenses; the net pay${p.totals.employeeTaxesCents ? ', employee taxes' : ''}${p.totals.employerTaxesCents ? ' and employer taxes' : ''} become payables${p.settle ? ` and ${money(d(p.totals.netCents + p.totals.otherDeductionsCents + p.totals.reimbursementsCents + p.totals.employeeTaxesCents + p.totals.employerTaxesCents))} leaves the bank on the check dates, as the provider debits it` : ''}.`,
      'The provider files the 941, state returns and W-2 for these payrolls, so MyCA leaves them out of its own 941 draft.',
      ...(p.duplicates.length ? [`${p.duplicates.length} already in the books will be skipped.`] : []),
      ...(p.held.length ? [`${p.held.length} rows could not be read and are left out.`] : []),
    ],
    figures: { payrolls: p.rows.length, gross: d(p.totals.grossCents), net: d(p.totals.netCents), employerTaxes: d(p.totals.employerTaxesCents), settle: p.settle },
  };
}

export function usImportPreview(state, args) {
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
