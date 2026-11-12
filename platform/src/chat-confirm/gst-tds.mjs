import { checkAnswer, stepText } from '../gst-review.mjs';
import { keyTooLongErrors, parse2bFile } from '../gstr2b-check.mjs';
import { IMS_DECISION_WORDS, IMS_SELECTS, pinImsRows, planImsDecision } from '../ims.mjs';
import { isReturnPeriod } from '../return-period.mjs';
import { planBillTds } from '../invoice.mjs';
import { planFiling } from '../filings.mjs';
import { planDeductor, planTdsDeposit, tdsWords } from '../tds-deduction.mjs';
import { planCreditOpening } from '../gst-payment.mjs';
import { checkTdsAnswer } from '../tds-review.mjs';
import { countryOf, formatMoneyCurrent } from '../country.mjs';
import { planGstPayment } from '../gst-pay-record.mjs';
import { planYearClose } from '../year-close.mjs';
import { plan26asCredits, planTcsStatement, sectionWords } from '../marketplace-credits.mjs';
import { planTdsWithheld } from '../tds-credits.mjs';
import { openDocumentsFor, planRegistration, registrationByGstin } from '../registrations.mjs';
import { filingRows } from '../deadline-run.mjs';
import { REVIEW_REASONS, TDS_REASONS, money } from './shared.mjs';

export function yearClosePreview(state, args) {
  const plan = planYearClose(state, args);
  if (!plan.ok) {
    const reason = { BAD_YEAR: plan.hint || 'Say the year to close.', YEAR_NOT_ENDED: `${plan.year} has not ended yet (it runs to ${plan.to}).`, ALREADY_CLOSED: `${plan.year} was closed on ${plan.closedOn}.`, NOTHING_TO_CLOSE: `There is no income or expense in ${plan.year} to close.` }[plan.error] || plan.error;
    return { blockers: [reason], summary: '', effects: [], figures: {} };
  }
  const p = plan.plan;
  return {
    blockers: [],
    summary: `Close ${p.year} (${p.from} to ${p.to}): income ${formatMoneyCurrent(p.income)}, expenses ${formatMoneyCurrent(p.expenses)}, ${p.profit >= 0 ? 'profit' : 'loss'} ${formatMoneyCurrent(Math.abs(p.profit))} moved to capital across ${p.rows.length === 1 ? '1 account' : `${p.rows.length} accounts`}.`,
    effects: ['The closing entries are new entries dated the last day of the year; nothing already posted changes.', `The books lock through ${p.lockThrough}; nothing can be dated on or before it afterwards.`],
    figures: { year: p.year, income: p.income, expenses: p.expenses, profit: p.profit, lockThrough: p.lockThrough },
  };
}

export function gstPaymentPreview(state, args) {
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

function tdsBlocked(plan) {
  const reason = TDS_REASONS[plan.error];
  return { blockers: [reason ? reason(plan) : plan.error], summary: '', effects: [], figures: {} };
}

const CREDIT_OPENING_REASONS = {
  INVALID_PERIOD: () => 'Say the month as YYYY-MM, for example 2026-09.',
  BAD_AMOUNT: (plan) => `The ${String(plan.head || '').toUpperCase()} balance must be a number of rupees, zero or more.`,
};

export function creditOpeningPreview(state, args) {
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

export function deductorPreview(state, args) {
  const plan = planDeductor(state, args);
  if (!plan.ok) return tdsBlocked(plan);
  return {
    blockers: [],
    summary: `This business deducts TDS, TAN ${plan.tan}${plan.was && plan.was !== plan.tan ? ` (was ${plan.was})` : ''}.`,
    effects: ['Bills and expenses can then carry a TDS section, and TDS deposits and statements show in your deadlines.'],
    figures: { tan: plan.tan },
  };
}

export function tdsDepositPreview(state, args) {
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

export function filingPreview(state, args) {
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

export function reviewAnswerPreview(state, args) {
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

export function tdsReviewAnswerPreview(state, args) {
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

export function gstr2bPreview(state, args) {
  if (!isReturnPeriod(args.period)) return { blockers: ['Say which month this 2B is for.'], summary: '', effects: [], figures: {} };
  const { rows, errors } = parse2bFile(args.csv);
  if (!rows.length) return { blockers: ['No GSTR-2B rows could be read from this file. Use the CSV downloaded from the GST portal.'], summary: '', effects: [], figures: {} };
  const suppliers = new Set(rows.map((row) => row.supplierGstin)).size;
  const replaces = state.gstr2b && Object.hasOwn(state.gstr2b, args.period);
  return {
    blockers: [],
    summary: `GSTR-2B for ${args.period}: ${rows.length} ${rows.length === 1 ? 'entry' : 'entries'} from ${suppliers} ${suppliers === 1 ? 'supplier' : 'suppliers'}${errors.length ? `; ${errors.length} ${errors.length === 1 ? 'row' : 'rows'} could not be read and will be left out` : ''}.${replaces ? ' This replaces the 2B already added for that month.' : ''}`,
    effects: ['Nothing is posted to your books. Your purchase bills are checked against it.', ...keyTooLongErrors(errors).map((error) => error.message)],
    figures: { period: args.period, rows: rows.length, suppliers, skipped: errors.length },
  };
}

function imsNoRowsWords(plan) {
  return `Say which invoices, for example "accept all matched in IMS for ${plan.period}" or "reject all undecided in IMS for ${plan.period}".`;
}

function imsLeftWords(left, args) {
  const select = String(args.select ?? '').trim();
  const noun = IMS_SELECTS.includes(select) && select !== 'all' ? `${select} invoice` : 'invoice';
  return left === 1 ? `1 more ${noun} is left; ask again after this to do it.` : `${left} more ${noun}s are left; ask again after this to do them.`;
}

const IMS_REASONS = {
  INVALID_PERIOD: 'Say the month as YYYY-MM, for example 2026-10.',
  NO_STATEMENT: 'Add the GSTR-2B for that month first.',
  BAD_DECISION: 'Say accept, reject or pending.',
  NO_ROWS: imsNoRowsWords,
  NO_MATCH: (plan) => plan.hint || 'No invoice matches what you asked for, so nothing was marked.',
  ROW_NOT_FOUND: 'One of those invoices is not in the GSTR-2B for that month.',
  TOO_MANY_ROWS: 'IMS takes up to 500 invoices in one go; pick fewer, or decide in parts.',
  NOTE_TOO_LONG: 'Keep the note to 200 characters or fewer.',
};

export function imsPreview(state, args) {
  if (countryOf(state) !== 'IN') return { blockers: ['IMS is part of the GST portal, so it is for businesses in India.'], summary: '', effects: [], figures: {} };
  const plan = planImsDecision(state, args);
  if (!plan.ok) {
    const reason = IMS_REASONS[plan.error];
    return { blockers: [typeof reason === 'function' ? reason(plan) : reason || plan.error], summary: '', effects: [], figures: {} };
  }
  const pinned = pinImsRows(args, plan);
  const word = IMS_DECISION_WORDS[plan.decision];
  const count = plan.rows.length;
  const one = [plan.rows[0].supplierName, plan.rows[0].invoiceNo].filter(Boolean).join(' ') || 'this invoice';
  const replaced = plan.decision === 'clear' ? 0 : plan.rows.filter((row) => {
    const held = state.imsDecisions?.[row.key]?.decision;
    return held && held !== plan.decision;
  }).length;
  const effects = ['Nothing is posted. Take the same decisions on the GST portal\'s IMS; the Excel sheet lists them.'];
  if (replaced) effects.push(count === 1 ? 'It already has a different decision, which this replaces.' : `${replaced} of them already ${replaced === 1 ? 'has' : 'have'} a different decision, which this replaces.`);
  if (plan.left) effects.push(imsLeftWords(plan.left, args));
  return {
    blockers: [],
    summary: count === 1 ? `Mark ${one} as ${word} in IMS for ${plan.period}.` : `Mark ${count} invoices in IMS for ${plan.period} as ${word} (credit ${money(plan.credit)}).`,
    effects,
    figures: { count, credit: plan.credit },
    pinned,
  };
}

export function registrationPreview(state, args) {
  const planned = planRegistration(state, args);
  if (!planned.ok) {
    const reason = { BAD_GSTIN: 'That is not a valid GSTIN.', PRINCIPAL_REQUIRED: 'Set the company GSTIN first.', IS_PRINCIPAL: 'That is the principal GSTIN already.', DIFFERENT_PAN: 'That GSTIN carries a different PAN, so it is not a registration of this business.', BAD_STATE: 'The state code in the GSTIN is not one MyCA knows.', BAD_KIND: 'The kind is apob, warehouse or branch.', STATE_TAKEN: `There is already an active registration in that state (${planned.by}).`, INVALID_DATE: 'That is not a date I can read.' }[planned.error] || planned.error;
    return { blockers: [reason], summary: '', effects: [], figures: {} };
  }
  const { plan } = planned;
  return {
    blockers: [],
    summary: `${plan.existing ? 'Update' : 'Add'} ${plan.next.label} ${plan.next.gstin} (${plan.next.kind}, state ${plan.next.state}) from ${plan.next.effectiveFrom}.`,
    effects: ['Invoices and bills can be raised under it; its returns and filings are tracked by its GSTIN.', 'Marketplace orders shipped from its state post under it.'],
    figures: { gstin: plan.next.gstin },
  };
}

export function retireRegistrationPreview(state, args) {
  const gstin = String(args.gstin || '').replace(/\s+/g, '').toUpperCase();
  const reg = registrationByGstin(state, gstin);
  if (!reg || reg.kind === 'principal') return { blockers: [reg ? 'That is the principal GSTIN; change it on the company.' : `${gstin} is not a registration of this business.`], summary: '', effects: [], figures: {} };
  if (reg.effectiveTo) return { blockers: [`${gstin} is already retired from ${reg.effectiveTo}.`], summary: '', effects: [], figures: {} };
  const open = openDocumentsFor(state, gstin);
  if (open.count) return { blockers: [`${gstin} still has ${open.count === 1 ? '1 open document' : `${open.count} open documents`} (${[...open.invoices, ...open.purchases].slice(0, 6).join(', ')}); settle or cancel them first.`], summary: '', effects: [], figures: {} };
  return { blockers: [], summary: `Retire ${reg.label} ${gstin}${args.effectiveTo ? ` from ${args.effectiveTo}` : ' from today'}.`, effects: ['No new document can be raised under it; its past documents and returns stay.'], figures: {} };
}

export function tcsStatementPreview(state, args) {
  const planned = planTcsStatement(state, args);
  if (!planned.ok) return { blockers: [planned.error === 'NO_HEADER' ? `The statement needs ${planned.parsed.need}.` : 'The statement has no TCS rows I can read.'], summary: '', effects: [], figures: {} };
  const dup = planned.skipped.filter((row) => row.reason === 'exists').length;
  const unknown = planned.ready.filter((row) => row.unknownOperator).length;
  return {
    blockers: planned.ready.length ? [] : [dup ? 'Every row is already recorded.' : 'No row could be read.'],
    summary: `TCS statement: ${planned.ready.length === 1 ? '1 month' : `${planned.ready.length} operator-months`} totalling ${money(planned.total)}${dup ? `; ${dup} already recorded` : ''}${unknown ? `; ${unknown} from an operator GSTIN not yet tied to a channel` : ''}.`,
    effects: ['Each confirmed month is TCS in your electronic cash ledger; the next GST payment uses it before new cash.', 'Months where a marketplace deducted more in settlements than it reported become exceptions to raise with the marketplace.'],
    figures: { rows: planned.ready.length, total: planned.total },
  };
}

export function rowsCounted(count) {
  return count === 1 ? '1 row' : `${count} rows`;
}

export function credits26asPreview(state, args) {
  const planned = plan26asCredits(state, args);
  if (!planned.ok) return { blockers: [planned.error === 'NO_HEADER' ? `The file needs ${planned.parsed.need}.` : `No row with a readable section could be read${planned.parsed?.otherSections ? ` (${rowsCounted(planned.parsed.otherSections)} had no section I can read)` : ''}.`], summary: '', effects: [], figures: {} };
  const dup = planned.skipped.filter((row) => row.reason === 'exists').length;
  return {
    blockers: planned.ready.length ? [] : [dup ? 'Every row is already recorded.' : 'No row could be read.'],
    summary: `Form 26AS: ${planned.ready.length === 1 ? '1 entry' : `${planned.ready.length} entries`} totalling ${money(planned.total)}${planned.ready.length ? ` (${sectionWords(planned.bySection)})` : ''}${planned.otherSections ? `; ${rowsCounted(planned.otherSections)} with no readable section left out` : ''}${dup ? `; ${dup} already recorded` : ''}.`,
    effects: ['The TDS is credit against your income tax for the year. Say "check 26AS against the books" to see what is missing from your books; quarters where a marketplace deducted more under 194-O in settlements than 26AS shows become exceptions.'],
    figures: { rows: planned.ready.length, total: planned.total },
  };
}

const TDS_WITHHELD_REASONS = {
  INVOICE_NOT_FOUND: 'That invoice is not in these books.',
  INVOICE_CANCELLED: 'That invoice is cancelled, so no TDS can be recorded against it.',
  INVALID_DATE: 'That is not a date I can read.',
  PERIOD_LOCKED: 'That date is inside the locked period.',
  BAD_AMOUNT: 'TDS has to be a positive amount.',
  BAD_SECTION: 'Say which TDS section the customer deducted under, like 194C or 194J.',
  BAD_TAN: 'A TAN looks like MUMA12345B.',
  OVERPAYMENT: 'That is more than is still owed on the invoice.',
  PARTY_NOT_FOUND: 'The customer on that invoice is missing from these books.',
};

export function tdsWithheldPreview(state, args) {
  if (countryOf(state) !== 'IN') return { blockers: ['TDS withheld by customers is for India books.'], summary: '', effects: [], figures: {} };
  const plan = planTdsWithheld(state, args);
  if (!plan.ok) {
    const invoice = (state.invoices || []).find((item) => item.id === String(args.invoiceId || '').trim().toUpperCase());
    const detail = plan.error === 'OVERPAYMENT' ? ` ${money(plan.due)} is owed on ${plan.invoiceId}.` : plan.error === 'PERIOD_LOCKED' ? ` It would be dated ${plan.dateWords}.` : '';
    return { blockers: [`${TDS_WITHHELD_REASONS[plan.error] || plan.error}${detail}`], summary: invoice ? `TDS withheld by ${invoice.partyName} on ${invoice.id}.` : `No invoice ${args.invoiceId}.`, effects: [], figures: {} };
  }
  const { invoice, amount, section, remaining, dateWords } = plan;
  return {
    blockers: [],
    summary: `TDS of ${money(amount)} withheld by ${invoice.partyName} on ${invoice.id} (section ${section}), dated ${dateWords}`,
    effects: ['The invoice settles by that amount; the credit sits in TDS receivable (1160) until Form 26AS confirms it.'],
    figures: { amount, remaining },
  };
}

const BILL_TDS_REASONS = {
  BILL_NOT_FOUND: (p) => `${p.billId || 'That bill'} is not in these books.`,
  BILL_CANCELLED: (p) => `${p.billId} is cancelled, so no TDS can be added to it.`,
  BILL_HAS_TDS: (p) => `${p.billId} already carries TDS of ${money(p.amount)} under ${p.section}.`,
  BILL_PAID: (p) => `${p.billId} is already paid in full, so there is nothing left to hold back. Deduct the TDS from the next payment to this supplier instead.`,
  PERIOD_LOCKED: (p) => `${p.billId} is dated ${p.date}, inside the locked period (through ${p.lockThrough}).`,
};

export function billTdsPreview(state, args) {
  if (countryOf(state) !== 'IN') return { blockers: ['TDS on supplier bills is for India books.'], summary: '', effects: [], figures: {} };
  const plan = planBillTds(state, args);
  if (!plan.ok) {
    const words = BILL_TDS_REASONS[plan.error] || TDS_REASONS[plan.error] || (() => plan.error);
    return { blockers: [words(plan)], summary: `TDS on ${plan.billId || args.billId}.`, effects: [], figures: {} };
  }
  const { bill, tds, unpaid } = plan;
  const left = Math.round((unpaid - tds.tds) * 100) / 100;
  return {
    blockers: [],
    summary: `TDS under ${tds.section} on ${bill.id} from ${bill.partyName}, dated ${bill.date}, taxable ${money(bill.taxable)}`,
    effects: [tdsWords(tds, left, `you owe ${bill.partyName}`), ...(tds.tds > 0 ? ['The supplier is owed that much less, and it sits in TDS payable until you deposit it.'] : ['It is still counted towards the yearly limit for this supplier.'])],
    figures: { tds: tds.tds, remaining: left },
  };
}

const DECISION_WORD = { waive: 'Waive', resolve: 'Resolve', assign: 'Assign', reopen: 'Reopen' };

export function exceptionPreview(state, args) {
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
