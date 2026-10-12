import { createHash } from 'node:crypto';
import { localToday } from './dates.mjs';
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

export function draftHashOf(summary, payment = null) {
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

function stepsFor(summary, payment) {
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
    ],
    note: 'This is the credit shown on your bills. It has not been checked against GSTR-2B, so a supplier who has not filed can still reduce it.',
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

function recordFor(state, period) {
  const all = state.gstReviews && typeof state.gstReviews === 'object' ? state.gstReviews : {};
  return Object.hasOwn(all, period) ? all[period] : null;
}

export function reviewOf(state, period) {
  const summarised = periodSummary(state, period);
  if (!summarised.ok) return summarised;
  const summary = summarised.data;
  const paid = paymentFor(state, summary.period);
  const payment = paid.ok ? paid.data : null;
  const draftHash = draftHashOf(summary, payment);
  const record = recordFor(state, summary.period);
  const current = record && record.draftHash === draftHash ? record : null;
  const changed = Boolean(record && !current && Object.keys(record.answers || {}).length);
  const steps = stepsFor(summary, payment).map((step) => {
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
      month: monthName(summary.period),
      draftHash,
      empty: summary.salesCount === 0 && summary.purchaseCount === 0 && (summary.creditNotes?.count || 0) === 0 && (summary.debitNoteCount || 0) === 0 && (summary.purchaseNoteCount || 0) === 0,
      toPay: payment ? payment.toPay : null,
      changed,
      steps: steps.map((step) => ({ ...step, waitingFor: blockedBy(step)?.id || null })),
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
  const review = reviewOf(state, args.period);
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
  const existing = recordFor(state, review.period);
  const record = existing && existing.draftHash === review.draftHash ? existing : { draftHash: review.draftHash, answers: {}, approval: null };
  const on = localToday();
  const note = String(args.note || '').trim().slice(0, 500);
  record.answers[step.id] = { answer: args.answer, by: actor.userId, on, ...(note ? { note } : {}) };
  if (step.id === 'approve' && args.answer === 'approve') record.approval = { by: actor.userId, on, draftHash: review.draftHash };
  state.gstReviews[review.period] = record;
  const after = reviewOf(state, review.period).data;
  return { ok: true, period: review.period, step: step.id, answer: args.answer, next: after.next, approved: after.approved, review: after };
}

export function stepText(review, stepId, money) {
  const step = review.steps.find((item) => item.id === stepId);
  if (!step) return '';
  const lines = step.lines.map((line) => (line.amount == null ? `· ${line.label}` : `· ${line.label}: ${money(line.amount)}`));
  return [step.title, ...lines, step.note, step.question].join('\n');
}
