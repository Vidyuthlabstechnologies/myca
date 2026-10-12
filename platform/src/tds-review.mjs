import { localToday } from './dates.mjs';
import { tdsReturnDraft } from './tds-return.mjs';

export const TDS_REVIEW_ANSWERS = ['correct', 'wrong', 'approve'];
const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

function stepsFor(draft) {
  const quarter = draft.quarter;
  const steps = [];
  steps.push({
    id: 'deductees',
    title: `TDS deducted in ${quarter}`,
    lines: [
      ...draft.deductees.map((row) => ({ label: `${row.payee || row.pan}${row.pan ? ` (${row.pan})` : ' (no PAN)'}, ${row.section}, ${row.count === 1 ? '1 payment' : `${row.count} payments`} of ${money(row.basis)} at ${row.rate}%`, amount: row.tds })),
      ...draft.sections.map((row) => ({ label: `${row.section}: ${row.deductees === 1 ? '1 deductee' : `${row.deductees} deductees`}`, amount: row.tds })),
      { label: 'TDS deducted', amount: round2(draft.deducted), strong: true },
    ],
    note: `Every figure comes from the bills and expenses dated in ${draft.months.join(', ')} that carried a TDS section.${draft.unreviewed ? ' The TDS rates and limits come from MyCA\'s dated rules, which your CA has not reviewed yet.' : ''}`,
    question: 'Is this information correct?',
    yes: 'Yes, correct',
    no: 'Something is wrong',
  });
  steps.push({
    id: 'challans',
    title: `Challans for ${quarter}`,
    lines: [
      ...draft.challans.map((row) => ({ label: `${row.challan} paid on ${row.date}${row.covers < row.amount ? `, ${money(row.covers)} of ${money(row.amount)} for this quarter` : ''}`, amount: row.covers })),
      { label: 'Deposited for this quarter', amount: round2(draft.deposited), strong: true },
      ...(draft.shortfall > 0 ? [{ label: 'Still to deposit before filing', amount: round2(draft.shortfall) }] : []),
    ],
    note: draft.challans.length
      ? 'Deposits are matched to deductions in date order. A challan that also covers an earlier quarter shows only the part for this one.'
      : 'No deposit covers this quarter yet. Record the challan when it is paid; the statement cannot be filed before the TDS is deposited.',
    question: 'Is this information correct?',
    yes: 'Yes, correct',
    no: 'Something is wrong',
  });
  steps.push({
    id: 'approve',
    title: `Approve the ${quarter} TDS statement`,
    lines: [
      { label: 'TDS deducted', amount: round2(draft.deducted) },
      { label: 'Deposited for this quarter', amount: round2(draft.deposited) },
      ...(draft.shortfall > 0 ? [{ label: 'Still to deposit', amount: round2(draft.shortfall), strong: true }] : []),
    ],
    note: `${draft.form ? `This is the quarterly statement for payments other than salary (Form ${draft.form}). ` : ''}Approving records that you checked these figures; it files nothing and moves no money.${draft.dueDate ? ` It is due by ${draft.dueDate}.` : ''}`,
    question: 'Approve these figures for the statement?',
    yes: 'Approve',
    no: 'Not yet',
  });
  return steps;
}

function money(amount) {
  return `₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function recordFor(state, quarter) {
  const all = state.tdsReviews && typeof state.tdsReviews === 'object' ? state.tdsReviews : {};
  return Object.hasOwn(all, quarter) ? all[quarter] : null;
}

export function tdsReviewOf(state, quarter) {
  const drafted = tdsReturnDraft(state, quarter);
  if (!drafted.ok) return drafted;
  const draft = drafted.data;
  const record = recordFor(state, draft.quarter);
  const current = record && record.draftHash === draft.draftHash ? record : null;
  const changed = Boolean(record && !current && Object.keys(record.answers || {}).length);
  const steps = stepsFor(draft).map((step) => {
    const answer = current?.answers?.[step.id] || null;
    return { ...step, status: answer ? (answer.answer === 'wrong' ? 'wrong' : 'confirmed') : 'open', answer };
  });
  const blockedBy = (step) => steps.slice(0, steps.indexOf(step)).find((before) => before.status !== 'confirmed') || null;
  const next = steps.find((step) => step.status !== 'confirmed') || null;
  return {
    ok: true,
    data: {
      period: draft.quarter,
      periods: draft.quarters,
      month: draft.quarter,
      draftHash: draft.draftHash,
      empty: draft.empty,
      changed,
      steps: steps.map((step) => ({ ...step, waitingFor: blockedBy(step)?.id || null })),
      next: next ? next.id : null,
      approved: Boolean(current?.approval),
      approval: current?.approval || null,
      deducted: draft.deducted,
      deposited: draft.deposited,
      shortfall: draft.shortfall,
      dueDate: draft.dueDate,
      filed: draft.filed,
      form: draft.form,
    },
  };
}

function actorOf(state, args) {
  const actor = state && state.__actor;
  return { userId: String(actor?.userId || args.actorId || ''), role: String(actor?.role || args.role || '') };
}

export function checkTdsAnswer(state, args = {}) {
  const review = tdsReviewOf(state, args.period);
  if (!review.ok) return review;
  const data = review.data;
  if (args.draftHash !== data.draftHash) return { ok: false, error: 'DRAFT_CHANGED', period: data.period };
  if (!TDS_REVIEW_ANSWERS.includes(args.answer)) return { ok: false, error: 'UNKNOWN_ANSWER' };
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

export function answerTdsReview(state, args = {}) {
  const checked = checkTdsAnswer(state, args);
  if (!checked.ok) return checked;
  const { review, step, actor } = checked;
  state.tdsReviews = state.tdsReviews && typeof state.tdsReviews === 'object' ? state.tdsReviews : {};
  const existing = recordFor(state, review.period);
  const record = existing && existing.draftHash === review.draftHash ? existing : { draftHash: review.draftHash, answers: {}, approval: null };
  const on = localToday();
  const note = String(args.note || '').trim().slice(0, 500);
  record.answers[step.id] = { answer: args.answer, by: actor.userId, on, ...(note ? { note } : {}) };
  if (step.id === 'approve' && args.answer === 'approve') record.approval = { by: actor.userId, on, draftHash: review.draftHash };
  state.tdsReviews[review.period] = record;
  const after = tdsReviewOf(state, review.period).data;
  return { ok: true, period: review.period, step: step.id, answer: args.answer, next: after.next, approved: after.approved, review: after };
}
