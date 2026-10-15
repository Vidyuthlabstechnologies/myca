import { gstr3bFor, periodSummary } from './period-summary.mjs';
import { documentsForPeriod, isReturnPeriod, taxByHead } from './return-period.mjs';
import { setOff, interestOn, lateFeeFor } from './gst-setoff.mjs';
import { deadlineRun } from './deadline-run.mjs';
import { filingFor } from './filings.mjs';
import { localToday, postingDate } from './dates.mjs';
import { tcsAvailableFor } from './marketplace-credits.mjs';
import { isPrincipal, scopeKey } from './registrations.mjs';

const HEADS = ['igst', 'cgst', 'sgst'];
const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function nextPeriod(period) {
  const [y, m] = period.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

function lastDayOf(period) {
  const [y, m] = period.split('-').map(Number);
  return `${period}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

function headsOf(state, period, gstin) {
  const docs = documentsForPeriod(state, period, '', gstin);
  if (!docs.ok || !docs.period) return { output: taxByHead(0, 0, 0), credit: taxByHead(0, 0, 0), purchases: 0, sales: 0 };
  const draft = gstr3bFor(state, docs);
  const outward = draft.outward?.totals || {};
  const available = draft.itc?.available || {};
  return {
    output: taxByHead(outward.interIgst, outward.intraCgst, outward.intraSgst),
    credit: taxByHead(available.igst, available.cgst, available.sgst),
    purchases: docs.purchases.length,
    sales: docs.invoices.length + docs.creditNotes.length + (docs.debitNotes || []).length,
  };
}

function addHeads(a, b) {
  return taxByHead(round2(a.igst + b.igst), round2(a.cgst + b.cgst), round2(a.sgst + b.sgst));
}

export function creditOpening(state) {
  const opening = state.gstCreditOpening;
  return opening && typeof opening === 'object' && isReturnPeriod(opening.period) ? opening : null;
}

export function broughtForward(state, period, gstin) {
  const opening = isPrincipal(state, gstin) ? creditOpening(state) : null;
  if (!opening) return { ok: true, credit: taxByHead(0, 0, 0), from: '', known: false };
  if (period < opening.period) return { ok: true, credit: taxByHead(0, 0, 0), from: opening.period, known: false, beforeOpening: true };
  let carried = taxByHead(opening.igst, opening.cgst, opening.sgst);
  for (let month = opening.period; month < period; month = nextPeriod(month)) {
    const heads = headsOf(state, month, gstin);
    const result = setOff({ output: heads.output, credit: addHeads(heads.credit, carried), onDate: lastDayOf(month) });
    if (!result.ok) return result;
    carried = taxByHead(result.carried.igst, result.carried.cgst, result.carried.sgst);
  }
  return { ok: true, credit: carried, from: opening.period, known: true };
}

function dueRow(state, period) {
  const run = deadlineRun(state, { asOfDate: lastDayOf(nextPeriod(period)) });
  return (run.deadlines || []).find((row) => row.clientId === 'SELF' && row.returnType === 'GSTR-3B' && row.period === period) || null;
}

export function paymentFor(state, requested, { payOn, gstin } = {}) {
  const summarised = periodSummary(state, requested, gstin);
  if (!summarised.ok) return summarised;
  const summary = summarised.data;
  const period = summary.period;
  const today = localToday();
  const on = payOn == null || payOn === '' ? today : postingDate(payOn);
  if (!on) return fail('INVALID_DATE', { payOn });
  const forward = broughtForward(state, period, gstin);
  if (!forward.ok) return forward;
  const available = addHeads(summary.inputCredit, forward.credit);
  const result = setOff({ output: summary.outputTax, credit: available, onDate: lastDayOf(period) });
  if (!result.ok) return result;
  const rulesUsed = [result.ruleUsed];
  let unreviewed = !result.attested;
  const tcsAvailable = tcsAvailableFor(state, period, { excludePeriod: period, gstin });
  const tcsUsed = { igst: round2(Math.min(result.cash.igst, tcsAvailable.igst)), cgst: round2(Math.min(result.cash.cgst, tcsAvailable.cgst)), sgst: round2(Math.min(result.cash.sgst, tcsAvailable.sgst)) };
  tcsUsed.total = round2(tcsUsed.igst + tcsUsed.cgst + tcsUsed.sgst);
  const cashAfterTcs = { igst: round2(result.cash.igst - tcsUsed.igst), cgst: round2(result.cash.cgst - tcsUsed.cgst), sgst: round2(result.cash.sgst - tcsUsed.sgst) };
  cashAfterTcs.total = round2(cashAfterTcs.igst + cashAfterTcs.cgst + cashAfterTcs.sgst);
  const nil = summary.salesCount === 0 && summary.creditNoteCount === 0 && summary.purchaseCount === 0 && (summary.debitNoteCount || 0) === 0 && (summary.purchaseNoteCount || 0) === 0;
  const row = dueRow(state, period);
  const filed = filingFor(state, 'GSTR-3B', period);
  let late = null;
  if (row && !filed && on > row.dueDate) {
    const interest = interestOn({ cash: cashAfterTcs.total, dueDate: row.dueDate, payOn: on });
    if (!interest.ok) return interest;
    const fee = lateFeeFor({ returnType: 'GSTR-3B', period, nil, turnover: state.company?.grossTurnoverPrevFy, dueDate: row.dueDate, payOn: on });
    if (!fee.ok) return fee;
    rulesUsed.push(interest.ruleUsed, fee.ruleUsed);
    unreviewed = unreviewed || !interest.attested || !fee.attested;
    late = {
      payOn: on,
      days: interest.days,
      interest: interest.interest,
      interestRatePercent: interest.ratePercent,
      lateFee: fee.lateFee,
      lateFeeCap: fee.cap,
      turnoverAssumedAboveCaps: fee.turnoverAssumedAboveCaps,
      total: round2(cashAfterTcs.total + interest.interest + fee.lateFee),
    };
  }
  return {
    ok: true,
    data: {
      period,
      periods: summary.periods,
      gstin: summary.gstin,
      output: summary.outputTax,
      credit: summary.inputCredit,
      broughtForward: forward.credit,
      broughtForwardKnown: forward.known,
      broughtForwardFrom: forward.from,
      used: result.used,
      creditUsed: result.creditUsed,
      cash: result.cash,
      tcsAvailable,
      tcsUsed,
      cashAfterTcs,
      toPay: cashAfterTcs.total,
      carried: result.carried,
      nil,
      dueDate: row ? row.dueDate : '',
      filed: filed ? { arn: filed.arn, filedOn: filed.filedOn } : null,
      paid: state.gstPayments && typeof state.gstPayments === 'object' && Object.hasOwn(state.gstPayments, scopeKey(state, period, gstin)) ? { date: state.gstPayments[scopeKey(state, period, gstin)].date, cpin: state.gstPayments[scopeKey(state, period, gstin)].cpin, cashTotal: state.gstPayments[scopeKey(state, period, gstin)].cashTotal } : null,
      late,
      rulesUsed,
      unreviewed,
      notes: paymentNotes({ forward, nil, late, unreviewed, tcsUsed }),
    },
  };
}

function paymentNotes({ forward, nil, late, unreviewed, tcsUsed }) {
  const notes = [];
  notes.push('Credit is set off head by head in the order the law sets: IGST credit against IGST first, then CGST and SGST; CGST credit against CGST then IGST; SGST credit against SGST then IGST. CGST credit is never used for SGST, nor SGST credit for CGST.');
  if (!forward.known) {
    notes.push(forward.beforeOpening
      ? 'This month is before the credit balance you set, so no credit is brought forward into it.'
      : 'No credit brought forward from earlier months is counted. Tell MyCA the credit ledger balance from the GST portal at the start of a month, for example "GST credit balance at start of September: IGST 0, CGST 1200, SGST 1200".');
  }
  notes.push(tcsUsed && tcsUsed.total > 0 ? `TCS of ${tcsUsed.total} confirmed by the portal's TDS and TCS credit statement is used from the electronic cash ledger before any new cash. The input credit has not been checked against GSTR-2B.` : 'The input credit has not been checked against GSTR-2B. Cash already in the electronic cash ledger is not counted, except TCS confirmed by the portal statement.');
  if (nil) notes.push('Nothing was sold or bought this month, so this is a nil return.');
  if (late) {
    notes.push(`The due date has passed. If paid on ${late.payOn}, ${late.days} ${late.days === 1 ? 'day' : 'days'} late, interest at ${late.interestRatePercent}% a year on the cash part and the late fee are added.`);
    if (late.turnoverAssumedAboveCaps) notes.push('The late fee cap assumes a turnover above five crore rupees because last year\'s turnover is not set; set it for the exact cap.');
  }
  if (unreviewed) notes.push('The set-off order, interest rate and late fee come from MyCA\'s dated rules, which your CA has not reviewed yet.');
  return notes;
}

export function planCreditOpening(state, args = {}) {
  const period = String(args.period || '').trim();
  if (!isReturnPeriod(period)) return fail('INVALID_PERIOD', { hint: 'Use YYYY-MM, for example 2026-09.' });
  const heads = {};
  for (const head of HEADS) {
    const value = args[head] == null || args[head] === '' ? 0 : Number(args[head]);
    if (!Number.isFinite(value) || value < 0) return fail('BAD_AMOUNT', { head });
    heads[head] = round2(value);
  }
  return { ok: true, opening: { period, ...heads, total: round2(heads.igst + heads.cgst + heads.sgst) }, was: creditOpening(state) };
}

export function setCreditOpening(state, args = {}) {
  const plan = planCreditOpening(state, args);
  if (!plan.ok) return plan;
  const actor = state.__actor;
  state.gstCreditOpening = { period: plan.opening.period, igst: plan.opening.igst, cgst: plan.opening.cgst, sgst: plan.opening.sgst, setOn: localToday(), by: String(actor?.userId || args.actorId || '') };
  return { ok: true, opening: plan.opening, was: plan.was };
}

export function paymentWords(data, money, monthName) {
  const month = monthName ? monthName(data.period) : data.period;
  const lines = [];
  if (data.filed) lines.push(`GSTR-3B for ${month} is recorded as filed on ${data.filed.filedOn}, ARN ${data.filed.arn}.`);
  lines.push(`GST for ${month}: tax on sales ${money(data.output.total)}, input credit ${money(data.credit.total)}${data.broughtForwardKnown && data.broughtForward.total > 0 ? ` plus ${money(data.broughtForward.total)} brought forward` : ''}, credit used ${money(data.creditUsed)}.`);
  if (data.tcsUsed && data.tcsUsed.total > 0) lines.push(`TCS credit used from the cash ledger: ${money(data.tcsUsed.total)}.`);
  lines.push(data.toPay > 0
    ? `To pay in cash: ${money(data.toPay)} (IGST ${money(data.cashAfterTcs ? data.cashAfterTcs.igst : data.cash.igst)}, CGST ${money(data.cashAfterTcs ? data.cashAfterTcs.cgst : data.cash.cgst)}, SGST ${money(data.cashAfterTcs ? data.cashAfterTcs.sgst : data.cash.sgst)}).`
    : 'Nothing to pay in cash.');
  if (data.carried.total > 0) lines.push(`Credit carried forward: ${money(data.carried.total)}.`);
  if (data.dueDate && !data.filed) lines.push(`Due by ${data.dueDate}.`);
  if (data.late) lines.push(`If paid on ${data.late.payOn}, ${data.late.days} ${data.late.days === 1 ? 'day' : 'days'} late: interest ${money(data.late.interest)} and late fee ${money(data.late.lateFee)}, ${money(data.late.total)} in all.`);
  for (const note of data.notes.slice(1)) lines.push(note);
  return lines.join(' ');
}
