import { regArg, scopeKey } from './registrations.mjs';
import { createHash } from 'node:crypto';
import { localToday } from './dates.mjs';
import { gstCorrectionDeadline, gstCorrectionDeadlineWhy } from './credit-notes.mjs';
import { creditAtRisk } from './gstr2b-check.mjs';
import { OPEN_STATUSES } from './exceptions.mjs';
import { periodSummary } from './period-summary.mjs';
import { paymentFor } from './gst-payment.mjs';

export const REVIEW_ANSWERS = ['correct', 'wrong', 'approve'];

const HELD_WORDS = {
  INVALID_GSTIN: 'the buyer GSTIN is not valid',
  RATE_NOT_IN_FORCE: 'the GST rate is not one in force on that date',
  INVALID_RATE: 'the GST rate is not one in force on that date',
  MISSING_PLACE_OF_SUPPLY: 'the place of supply is missing',
};

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

function monthName(period) {
  const [year, month] = String(period).split('-').map(Number);
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return month >= 1 && month <= 12 ? `${names[month - 1]} ${year}` : period;
}

function heldWhy(code) {
  return HELD_WORDS[code] || String(code || '').toLowerCase().replace(/_/g, ' ');
}

export function twoBPosition(state, period, gstin) {
  const found = creditAtRisk(state, { period, gstin });
  if (!found.ok) return null;
  const data = found.data;
  return { loaded: Boolean(data.statement), inBooks: round2(data.creditInBooks), atRisk: round2(data.creditAtRisk), bills: data.risks.length, suppliers: (data.bySupplier || []).slice(0, 3).map((row) => row.supplier).filter(Boolean) };
}

const REVERSAL_CODES = new Set(['RULE_37_REVERSAL', 'RULE_37A_REVERSAL']);

export function openReversals(state) {
  const rows = (Array.isArray(state.exceptions) ? state.exceptions : []).filter((entry) => REVERSAL_CODES.has(entry.code) && OPEN_STATUSES.has(entry.status));
  const amount = round2(rows.reduce((sum, entry) => sum + Number(entry.moneyAtRisk || 0), 0));
  return { count: rows.length, amount, invoices: rows.map((entry) => String(entry.evidence?.invoiceNo || '')).filter(Boolean).slice(0, 5) };
}

export function reversalNote(open) {
  if (!open || !open.count) return '';
  const which = open.invoices.length ? ` (${open.invoices.join(', ')}${open.count > open.invoices.length ? ' and more' : ''})` : '';
  return `${open.count === 1 ? '1 credit reversal' : `${open.count} credit reversals`} worth ₹${open.amount}${which} ${open.count === 1 ? 'is' : 'are'} open in your exceptions list. This return does not make ${open.count === 1 ? 'it' : 'them'}: enter ${open.count === 1 ? 'it' : 'them'} in table 4(B) of GSTR-3B on the portal before you file, or resolve ${open.count === 1 ? 'it' : 'them'} first.`;
}

export function twoBNote(position) {
  if (!position || !(position.inBooks > 0)) return '';
  if (!position.loaded) return 'It has not been checked against GSTR-2B, because no 2B has been added for this month. A supplier who has not filed can still reduce it, and credit claimed without it can bring interest and a notice. Add the 2B before you file.';
  if (!(position.atRisk > 0)) return 'It matches the GSTR-2B you added.';
  const who = position.suppliers.length ? ` Suppliers to chase: ${position.suppliers.join(', ')}.` : '';
  return `${position.bills === 1 ? '1 bill' : `${position.bills} bills`} with ₹${position.atRisk} of credit ${position.bills === 1 ? 'is' : 'are'} not confirmed by the GSTR-2B you added. Claiming credit the 2B does not show can bring interest and a notice.${who}`;
}

export function draftHashOf(summary, payment = null, twoB = null, reversals = null) {
  const held = (summary.gstr1.held || []).map((item) => `${item.inum}:${item.code}`).sort();
  const basis = {
    broughtForward: payment ? payment.broughtForward : null,
    toPay: payment ? payment.toPay : null,
    period: summary.period,
    file: summary.gstr1.hash || '',
    salesCount: summary.salesCount,
    purchaseCount: summary.purchaseCount,
    taxableSales: summary.taxableSales,
    outputTax: summary.outputTax,
    inputCredit: summary.inputCredit,
    creditNotes: summary.creditNotes,
    debitNotes: summary.debitNotes || null,
    purchaseNotes: summary.purchaseNotes || null,
    held,
    twoB: twoB ? { loaded: twoB.loaded, atRisk: twoB.atRisk, bills: twoB.bills } : null,
    reversals: reversals && reversals.count ? { count: reversals.count, amount: reversals.amount } : null,
  };
  return createHash('sha256').update(JSON.stringify(basis)).digest('hex');
}

function heads(tax) {
  return [
    { label: 'IGST', amount: round2(tax.igst) },
    { label: 'CGST', amount: round2(tax.cgst) },
    { label: 'SGST', amount: round2(tax.sgst) },
  ];
}

function payLines(payment) {
  const lines = [
    { label: 'Tax on sales', amount: round2(payment.output.total) },
    { label: 'Input credit this month', amount: round2(payment.credit.total) },
  ];
  if (payment.broughtForwardKnown) lines.push({ label: `Credit brought forward from before ${monthName(payment.period)}`, amount: round2(payment.broughtForward.total) });
  lines.push({ label: 'Credit used', amount: round2(-payment.creditUsed) });
  for (const head of heads(payment.cash)) lines.push({ label: `${head.label} to pay`, amount: head.amount });
  lines.push({ label: 'To pay in cash', amount: round2(payment.toPay), strong: true });
  if (payment.carried.total > 0) lines.push({ label: 'Credit carried forward', amount: round2(payment.carried.total) });
  if (payment.late) {
    lines.push({ label: `Interest if paid on ${payment.late.payOn}, ${payment.late.days} ${payment.late.days === 1 ? 'day' : 'days'} late`, amount: round2(payment.late.interest) });
    lines.push({ label: 'Late fee', amount: round2(payment.late.lateFee) });
    lines.push({ label: `Total if paid on ${payment.late.payOn}`, amount: round2(payment.late.total), strong: true });
  }
  return lines;
}

function stepsFor(summary, payment, limit = null, twoB = null, reversals = null) {
  const month = monthName(summary.period);
  const file = summary.gstr1;
  const steps = [];
  if ((file.held || []).length) {
    steps.push({
      id: 'held',
      title: `Invoices that cannot go in the ${month} return`,
      lines: file.held.map((item) => ({ label: `${item.inum}: ${heldWhy(item.code)}` })),
      note: 'Fix them and they come back into the return. Otherwise they stay out of this return and remain in your books.',
      question: 'Leave these out of this return?',
      yes: 'Leave them out',
      no: 'I will fix them',
    });
  }
  const notes = summary.creditNotes || { count: 0, total: 0 };
  const debits = summary.debitNotes || { count: 0, total: 0 };
  const purchaseNotes = summary.purchaseNotes || { count: 0, total: 0 };
  steps.push({
    id: 'sales',
    title: `Sales in ${month}`,
    lines: [
      { label: summary.salesCount === 1 ? '1 sale, value before tax' : `${summary.salesCount} sales, value before tax, after credit notes`, amount: round2(summary.taxableSales) },
      ...(notes.count ? [{ label: notes.count === 1 ? '1 credit note, including tax' : `${notes.count} credit notes, including tax`, amount: round2(-notes.total) }] : []),
      ...(debits.count ? [{ label: debits.count === 1 ? '1 debit note, including tax' : `${debits.count} debit notes, including tax`, amount: round2(debits.total) }] : []),
      ...heads(summary.outputTax).map((head) => ({ label: `${head.label} on sales`, amount: head.amount })),
      { label: 'Tax on sales', amount: round2(summary.outputTax.total), strong: true },
      { label: `In the GSTR-1 file: ${file.b2b} to registered buyers, ${file.b2cl} large to unregistered, ${file.b2cs} summary ${file.b2cs === 1 ? 'row' : 'rows'}${file.cdnr || file.cdnur ? `, ${file.cdnr + file.cdnur} credit ${file.cdnr + file.cdnur === 1 ? 'note' : 'notes'}` : ''}` },
    ],
    note: 'Every figure comes from the invoices dated in this month.',
    question: 'Is this information correct?',
    yes: 'Yes, correct',
    no: 'Something is wrong',
  });
  steps.push({
    id: 'credit',
    title: `Purchases and input credit in ${month}`,
    lines: [
      { label: summary.purchaseCount === 1 ? '1 purchase bill' : `${summary.purchaseCount} purchase bills` },
      ...(purchaseNotes.count ? [{ label: purchaseNotes.count === 1 ? '1 debit note to a supplier, credit reversed' : `${purchaseNotes.count} debit notes to suppliers, credit reversed`, amount: round2(-(purchaseNotes.cgst + purchaseNotes.sgst + purchaseNotes.igst)) }] : []),
      ...heads(summary.inputCredit).map((head) => ({ label: `${head.label} credit`, amount: head.amount })),
      { label: 'Input credit', amount: round2(summary.inputCredit.total), strong: true },
      ...(twoB && twoB.inBooks > 0 && twoB.loaded && twoB.atRisk > 0 ? [{ label: 'Credit the GSTR-2B does not confirm', amount: twoB.atRisk }] : []),
      ...(reversals && reversals.count ? [{ label: 'Credit reversals still open, not in this return', amount: reversals.amount }] : []),
    ],
    note: ['This is the credit shown on your bills.', twoB && twoB.inBooks > 0 ? twoBNote(twoB) : 'It has not been checked against GSTR-2B, so a supplier who has not filed can still reduce it.', limit ? itcLimitNote(limit, summary.inputCredit.total) : '', reversalNote(reversals)].filter(Boolean).join(' '),
    ...(reversals && reversals.count ? { reversalsOpen: reversals.count } : {}),
    ...(twoB && twoB.inBooks > 0 && (!twoB.loaded || twoB.atRisk > 0) ? { creditAtRisk: twoB.loaded ? twoB.atRisk : null, twoBMissing: !twoB.loaded } : {}),
    ...(limit && limit.passed && summary.inputCredit.total > 0 ? { timeBarred: true } : {}),
    question: 'Is this information correct?',
    yes: 'Yes, correct',
    no: 'Something is wrong',
  });
  if (payment) {
    steps.push({
      id: 'pay',
      title: `Amount to pay for ${month}`,
      lines: payLines(payment),
      note: payment.notes.join(' '),
      question: 'Is this information correct?',
      yes: 'Yes, correct',
      no: 'Something is wrong',
    });
  }
  steps.push({
    id: 'approve',
    title: `Approve the ${month} return`,
    lines: [
      { label: 'Tax on sales', amount: round2(summary.outputTax.total) },
      { label: 'Input credit', amount: round2(summary.inputCredit.total) },
      ...(payment ? [{ label: 'To pay in cash', amount: round2(payment.toPay), strong: true }] : []),
    ],
    note: payment
      ? 'Approving records that you checked these figures and the amount to pay; it does not file anything and moves no money.'
      : 'The amount to pay could not be worked out for this month, so none is shown. Approving records that you checked these figures; it does not file anything.',
    question: 'Approve these figures for the return?',
    yes: 'Approve',
    no: 'Not yet',
  });
  return steps;
}

function recordFor(state, period, gstin) {
  const all = state.gstReviews && typeof state.gstReviews === 'object' ? state.gstReviews : {};
  const key = scopeKey(state, period, gstin);
  return Object.hasOwn(all, key) ? all[key] : null;
}

const DAY_MS = 86400000;

export function itcTimeLimit(state, period, gstin, today = localToday()) {
  const firstDay = `${String(period || '').slice(0, 7)}-01`;
  const given = { ruleId: 'gst.itc.time-limit', onDate: firstDay < '2022-10-01' ? today : firstDay };
  const last = gstCorrectionDeadline(firstDay, { state, gstin, ...given });
  const daysLeft = Math.round((Date.parse(`${last}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
  return { last, daysLeft, passed: daysLeft < 0, why: gstCorrectionDeadlineWhy(firstDay, last, given) };
}

export function itcLimitNote(limit, credit) {
  if (!(credit > 0)) return '';
  if (limit.passed) return `Time limit: credit on bills of this financial year could be taken only until ${limit.why} (section 16(4)). That date has passed, so this credit may be disallowed. Check with your CA before you claim it.`;
  if (limit.daysLeft <= 45) return `Time limit: claim this credit by ${limit.why} (section 16(4)); after that it is lost${limit.daysLeft <= 7 ? `, and that is ${limit.daysLeft === 0 ? 'today' : limit.daysLeft === 1 ? 'tomorrow' : `in ${limit.daysLeft} days`}` : ''}.`;
  return '';
}

export function reviewOf(state, period, gstin) {
  const regd = regArg(state, gstin);
  if (!regd.ok) return regd;
  const summarised = periodSummary(state, period, regd.gstin);
  if (!summarised.ok) return summarised;
  const summary = summarised.data;
  const paid = paymentFor(state, summary.period, { gstin: regd.gstin });
  const payment = paid.ok ? paid.data : null;
  const twoB = twoBPosition(state, summary.period, regd.gstin);
  const reversals = openReversals(state);
  const draftHash = draftHashOf(summary, payment, twoB, reversals);
  const record = recordFor(state, summary.period, regd.gstin);
  const current = record && record.draftHash === draftHash ? record : null;
  const changed = Boolean(record && !current && Object.keys(record.answers || {}).length);
  const limit = itcTimeLimit(state, summary.period, regd.gstin);
  const steps = stepsFor(summary, payment, limit, twoB, reversals).map((step) => {
    const answer = current?.answers?.[step.id] || null;
    return { ...step, status: answer ? (answer.answer === 'wrong' ? 'wrong' : 'confirmed') : 'open', answer };
  });
  const blockedBy = (step) => steps.slice(0, steps.indexOf(step)).find((before) => before.status !== 'confirmed') || null;
  const next = steps.find((step) => step.status !== 'confirmed') || null;
  return {
    ok: true,
    data: {
      period: summary.period,
      periods: summary.periods,
      gstin: regd.gstin,
      month: monthName(summary.period),
      draftHash,
      empty: summary.salesCount === 0 && summary.purchaseCount === 0 && (summary.creditNotes?.count || 0) === 0 && (summary.debitNoteCount || 0) === 0 && (summary.purchaseNoteCount || 0) === 0,
      toPay: payment ? payment.toPay : null,
      changed,
      steps: steps.map((step) => ({ ...step, waitingFor: blockedBy(step)?.id || null })),
      itcLimit: limit,
      twoB,
      reversals,
      next: next ? next.id : null,
      approved: Boolean(current?.approval),
      approval: current?.approval || null,
    },
  };
}

function actorOf(state, args) {
  const actor = state && state.__actor;
  return {
    userId: String(actor?.userId || args.actorId || ''),
    role: String(actor?.role || args.role || ''),
  };
}

export function checkAnswer(state, args = {}) {
  const review = reviewOf(state, args.period, args.gstin);
  if (!review.ok) return review;
  const data = review.data;
  if (args.draftHash !== data.draftHash) return { ok: false, error: 'DRAFT_CHANGED', period: data.period };
  if (!REVIEW_ANSWERS.includes(args.answer)) return { ok: false, error: 'UNKNOWN_ANSWER' };
  const step = data.steps.find((item) => item.id === args.step);
  if (!step) return { ok: false, error: 'UNKNOWN_STEP', step: args.step };
  if (step.waitingFor) return { ok: false, error: 'STEP_NOT_READY', step: step.id, waitingFor: step.waitingFor };
  if (data.empty) return { ok: false, error: 'NOTHING_TO_REVIEW', period: data.period };
  const isApproval = step.id === 'approve';
  const fits = isApproval ? ['approve', 'wrong'] : ['correct', 'wrong'];
  if (!fits.includes(args.answer)) return { ok: false, error: 'ANSWER_DOES_NOT_FIT', step: step.id };
  const actor = actorOf(state, args);
  if (isApproval && args.answer === 'approve' && actor.role && actor.role !== 'admin') return { ok: false, error: 'OWNER_APPROVES', role: actor.role };
  return { ok: true, review: data, step, actor };
}

export function answerReview(state, args = {}) {
  const checked = checkAnswer(state, args);
  if (!checked.ok) return checked;
  const { review, step, actor } = checked;
  state.gstReviews = state.gstReviews && typeof state.gstReviews === 'object' ? state.gstReviews : {};
  const existing = recordFor(state, review.period, review.gstin);
  const record = existing && existing.draftHash === review.draftHash ? existing : { draftHash: review.draftHash, answers: {}, approval: null };
  const on = localToday();
  const note = String(args.note || '').trim().slice(0, 500);
  record.answers[step.id] = { answer: args.answer, by: actor.userId, on, ...(note ? { note } : {}) };
  if (step.id === 'approve' && args.answer === 'approve') record.approval = { by: actor.userId, on, draftHash: review.draftHash };
  state.gstReviews[scopeKey(state, review.period, review.gstin)] = record;
  const after = reviewOf(state, review.period, review.gstin).data;
  return { ok: true, period: review.period, step: step.id, answer: args.answer, next: after.next, approved: after.approved, review: after };
}

export function stepText(review, stepId, money) {
  const step = review.steps.find((item) => item.id === stepId);
  if (!step) return '';
  const lines = step.lines.map((line) => (line.amount == null ? `· ${line.label}` : `· ${line.label}: ${money(line.amount)}`));
  return [step.title, ...lines, step.note, step.question].join('\n');
}
