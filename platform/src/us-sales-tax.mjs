import { createHash } from 'node:crypto';
import { localToday, postingDate } from './dates.mjs';
import { isPeriodLocked } from './period-lock.mjs';
import { createTransfers, paise } from './ledger.mjs';
import { rules } from './sprint-load.mjs';
import { formatMoney } from './country.mjs';
import { ensureUsAccounts, rateFor } from './us-sales.mjs';
import { filingFor } from './filings.mjs';

const SALES_TAX_PAYABLE = 2110;
const CASH = 1001;
const BANK = 1002;
const STATE_CODE = /^[A-Z]{2}$/;
const CONFIRMATION = /^[A-Z0-9][A-Z0-9-]{2,39}$/;
export const SALES_TAX_FREQUENCIES = ['monthly', 'quarterly', 'annual'];
export const SALES_TAX_REVIEW_ANSWERS = ['correct', 'wrong', 'approve'];
const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function stateCodeOf(value) {
  return String(value || '').trim().toUpperCase();
}

function nexusList(state) {
  return Array.isArray(state.salesTaxNexus) ? state.salesTaxNexus : [];
}

export function nexusFor(state, code) {
  return nexusList(state).find((row) => row.state === stateCodeOf(code)) || null;
}

function lastDay(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function iso(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function periodContaining(frequency, date) {
  const [y, m] = String(date).slice(0, 7).split('-').map(Number);
  if (frequency === 'monthly') return `${y}-${String(m).padStart(2, '0')}`;
  if (frequency === 'quarterly') return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
  return String(y);
}

export function rangeOf(frequency, period) {
  const text = String(period || '').trim().toUpperCase();
  if (frequency === 'monthly') {
    const found = text.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
    if (!found) return null;
    const [y, m] = [Number(found[1]), Number(found[2])];
    return { from: iso(y, m, 1), to: iso(y, m, lastDay(y, m)), endMonth: m, endYear: y };
  }
  if (frequency === 'quarterly') {
    const found = text.match(/^(\d{4})-Q([1-4])$/);
    if (!found) return null;
    const y = Number(found[1]);
    const q = Number(found[2]);
    const endMonth = q * 3;
    return { from: iso(y, endMonth - 2, 1), to: iso(y, endMonth, lastDay(y, endMonth)), endMonth, endYear: y };
  }
  const found = text.match(/^(\d{4})$/);
  if (!found) return null;
  const y = Number(found[1]);
  return { from: iso(y, 1, 1), to: iso(y, 12, 31), endMonth: 12, endYear: y };
}

function previousPeriod(frequency, period) {
  const range = rangeOf(frequency, period);
  const before = new Date(Date.UTC(Number(range.from.slice(0, 4)), Number(range.from.slice(5, 7)) - 1, 1) - 1);
  return periodContaining(frequency, before.toISOString().slice(0, 10));
}

export function periodsOf(frequency, from, today) {
  const out = [];
  let period = periodContaining(frequency, today);
  if (rangeOf(frequency, period).to > today) period = previousPeriod(frequency, period);
  const first = periodContaining(frequency, from || today);
  for (let guard = 0; guard < 120 && period >= first; guard += 1) {
    out.unshift(period);
    period = previousPeriod(frequency, period);
  }
  return out;
}

function dueDateFor(stateCode, range, nexus = null) {
  const nextMonth = range.endMonth === 12 ? 1 : range.endMonth + 1;
  const nextYear = range.endMonth === 12 ? range.endYear + 1 : range.endYear;
  const found = rules.rule(`us.salestax.due.${stateCode}`, range.to);
  if (found && found.record) {
    const value = found.record.value || {};
    const day = value.lastDayOfMonthAfter ? lastDay(nextYear, nextMonth) : Number(value.dayOfMonthAfter || 0);
    if (day) return { dueDate: iso(nextYear, nextMonth, day), ruleUsed: `${found.record.id}@${found.record.effectiveFrom}`, unreviewed: !(found.record.attestations || []).length, ownerEntered: false };
  }
  if (nexus && nexus.dueDay) {
    const day = nexus.dueDay === 'last' ? lastDay(nextYear, nextMonth) : Number(nexus.dueDay);
    return { dueDate: iso(nextYear, nextMonth, day), ruleUsed: '', unreviewed: false, ownerEntered: true };
  }
  return { dueDate: '', ruleUsed: '', unreviewed: false, ownerEntered: false };
}

export function planNexus(state, args = {}) {
  const code = stateCodeOf(args.state);
  if (!STATE_CODE.test(code)) return fail('BAD_STATE', { state: code });
  const frequency = String(args.frequency || '').trim().toLowerCase().replace(/ly$/, '').replace(/^month$/, 'monthly').replace(/^quarter$/, 'quarterly');
  if (!SALES_TAX_FREQUENCIES.includes(frequency)) return fail('BAD_FREQUENCY', { frequency: args.frequency });
  const from = args.from == null || args.from === '' ? localToday() : postingDate(args.from);
  if (!from) return fail('INVALID_DATE', { date: args.from });
  const permitNo = String(args.permitNo || '').trim().slice(0, 40);
  const dueDayRaw = args.dueDay == null || args.dueDay === '' ? '' : String(args.dueDay).trim().toLowerCase();
  const dueDay = dueDayRaw === '' ? '' : dueDayRaw === 'last' ? 'last' : Number(dueDayRaw);
  if (dueDay !== '' && dueDay !== 'last' && !(Number.isInteger(dueDay) && dueDay >= 1 && dueDay <= 28)) return fail('BAD_DUE_DAY', { dueDay: args.dueDay });
  const was = nexusFor(state, code);
  return { ok: true, nexus: { state: code, frequency, from, permitNo, dueDay, setOn: localToday(), by: String(state?.__actor?.userId || '') }, was };
}

export function setNexus(state, args = {}) {
  const planned = planNexus(state, args);
  if (!planned.ok) return planned;
  state.salesTaxNexus = nexusList(state).filter((row) => row.state !== planned.nexus.state);
  state.salesTaxNexus.push(planned.nexus);
  state.salesTaxNexus.sort((a, b) => a.state.localeCompare(b.state));
  return { ok: true, nexus: planned.nexus, was: planned.was };
}

export function listNexus(state) {
  return { ok: true, data: { states: nexusList(state).map((row) => ({ ...row })) } };
}

function paymentsFor(state, code, period) {
  return (state.salesTaxPayments || []).filter((row) => row.state === code && row.period === period);
}

export function salesTaxReturn(state, args = {}) {
  const code = stateCodeOf(args.state);
  const nexus = nexusFor(state, code);
  if (!nexus) {
    if (!STATE_CODE.test(code)) return fail('BAD_STATE', { state: code });
    return fail('NO_NEXUS', { state: code, known: nexusList(state).map((row) => row.state) });
  }
  const today = localToday();
  const periods = periodsOf(nexus.frequency, nexus.from, today);
  const requested = String(args.period || '').trim().toUpperCase();
  const period = requested || periods[periods.length - 1] || periodContaining(nexus.frequency, today);
  const range = rangeOf(nexus.frequency, period);
  if (!range) return fail('BAD_PERIOD', { period: requested, frequency: nexus.frequency });
  const rows = (state.invoices || []).filter((inv) => inv.country === 'US' && inv.status !== 'cancelled' && inv.date >= range.from && inv.date <= range.to);
  const inState = rows.filter((inv) => String(inv.taxJurisdiction || '').slice(0, 2) === code);
  const unassigned = rows.filter((inv) => !inv.taxJurisdiction && inv.taxExempt);
  const byCode = new Map();
  let gross = 0;
  let exempt = 0;
  let nonTaxable = 0;
  let taxable = 0;
  let tax = 0;
  for (const inv of inState) {
    gross = round2(gross + Number(inv.subtotal || inv.taxable || 0));
    if (inv.taxExempt) {
      exempt = round2(exempt + Number(inv.subtotal || 0));
      continue;
    }
    for (const line of inv.lines || []) {
      if (Number(line.taxRate || 0) > 0) {
        taxable = round2(taxable + Number(line.taxable || 0));
        tax = round2(tax + Number(line.salesTax || 0));
        const key = `${inv.taxJurisdiction}@${line.taxRate}`;
        const row = byCode.get(key) || { code: inv.taxJurisdiction, name: rateFor(state, inv.taxJurisdiction, inv.date)?.name || inv.taxJurisdiction, ratePercent: Number(line.taxRate), taxable: 0, tax: 0, invoices: new Set() };
        row.taxable = round2(row.taxable + Number(line.taxable || 0));
        row.tax = round2(row.tax + Number(line.salesTax || 0));
        row.invoices.add(inv.id);
        byCode.set(key, row);
      } else {
        nonTaxable = round2(nonTaxable + Number(line.nonTaxable ?? line.subtotal ?? 0));
      }
    }
  }
  const byJurisdiction = [...byCode.values()].map((row) => ({ ...row, invoices: row.invoices.size })).sort((a, b) => a.code.localeCompare(b.code) || a.ratePercent - b.ratePercent);
  const paid = round2(paymentsFor(state, code, period).reduce((sum, row) => sum + row.amount, 0));
  const due = dueDateFor(code, range, nexus);
  const returnType = `SALES_TAX_${code}`;
  const filing = filingFor(state, returnType, period);
  const basis = { code, period, from: range.from, to: range.to, invoices: inState.map((inv) => inv.id).sort(), gross, exempt, nonTaxable, taxable, tax, byJurisdiction, paid };
  const draftHash = createHash('sha256').update(JSON.stringify(basis)).digest('hex');
  const review = state.salesTaxReviews && typeof state.salesTaxReviews === 'object' && Object.hasOwn(state.salesTaxReviews, `${code}:${period}`) ? state.salesTaxReviews[`${code}:${period}`] : null;
  const notes = [];
  if (!due.dueDate) notes.push(`The due date for ${code} is not in MyCA's rules yet; your CPA sets it, or say "I collect sales tax in ${code}, ${nexus.frequency}, due on the 20th" to record the day.`);
  else if (due.ownerEntered) notes.push(`The due date is the day you entered for ${code}, not a rule MyCA holds.`);
  else if (due.unreviewed) notes.push('The due date comes from a dated rule your CPA has not reviewed yet.');
  if (unassigned.length) notes.push(`${unassigned.length === 1 ? '1 exempt invoice has' : `${unassigned.length} exempt invoices have`} no jurisdiction, so ${unassigned.length === 1 ? 'it is' : 'they are'} not on any state's return.`);
  if (range.to > today) notes.push('This period has not ended yet.');
  return {
    ok: true,
    data: {
      state: code,
      returnType,
      frequency: nexus.frequency,
      permitNo: nexus.permitNo,
      period,
      periods,
      from: range.from,
      to: range.to,
      ended: range.to <= today,
      dueDate: due.dueDate,
      ruleUsed: due.ruleUsed,
      unreviewed: due.unreviewed,
      invoices: inState.length,
      grossSales: gross,
      exemptSales: exempt,
      nonTaxableSales: nonTaxable,
      taxableSales: taxable,
      taxCollected: tax,
      byJurisdiction,
      paid,
      toPay: round2(Math.max(0, tax - paid)),
      filed: filing ? { confirmation: filing.arn, filedOn: filing.filedOn, late: filing.late } : null,
      approved: Boolean(review && review.draftHash === draftHash && review.approval),
      draftHash,
      empty: !inState.length,
      notes,
    },
  };
}

function stepsFor(state, draft) {
  const money = (n) => formatMoney(state, n);
  const label = `${draft.state} ${draft.period}`;
  return [
    {
      id: 'sales',
      title: `Sales in ${draft.state} for ${draft.period}`,
      lines: [
        { label: `Gross sales on ${draft.invoices === 1 ? '1 invoice' : `${draft.invoices} invoices`}`, amount: draft.grossSales },
        ...(draft.exemptSales > 0 ? [{ label: 'Exempt sales (certificate on file)', amount: draft.exemptSales }] : []),
        ...(draft.nonTaxableSales > 0 ? [{ label: 'Non-taxable lines', amount: draft.nonTaxableSales }] : []),
        { label: 'Taxable sales', amount: draft.taxableSales, strong: true },
      ],
      note: `Every figure comes from the invoices dated ${draft.from} to ${draft.to} whose sales tax jurisdiction is in ${draft.state}.`,
      question: 'Is this information correct?',
      yes: 'Yes, correct',
      no: 'Something is wrong',
    },
    {
      id: 'tax',
      title: `Sales tax collected for ${label}`,
      lines: [
        ...draft.byJurisdiction.map((row) => ({ label: `${row.name} (${row.code}) at ${row.ratePercent}% on ${money(row.taxable)}`, amount: row.tax })),
        { label: 'Tax collected', amount: draft.taxCollected, strong: true },
        ...(draft.paid > 0 ? [{ label: 'Already paid for this period', amount: draft.paid }] : []),
        { label: 'To pay with the return', amount: draft.toPay },
      ],
      note: 'The rates are the ones you recorded for each jurisdiction, applied on each invoice date. MyCA never guesses a rate.',
      question: 'Is this information correct?',
      yes: 'Yes, correct',
      no: 'Something is wrong',
    },
    {
      id: 'approve',
      title: `Approve the ${label} sales tax return`,
      lines: [
        { label: 'Taxable sales', amount: draft.taxableSales },
        { label: 'Tax collected', amount: draft.taxCollected },
        { label: 'To pay', amount: draft.toPay, strong: true },
      ],
      note: `Approving records that you checked these figures; it files nothing and moves no money.${draft.dueDate ? ` The return is due by ${draft.dueDate}.` : ` ${draft.notes[0] || ''}`}`,
      question: 'Approve these figures for the return?',
      yes: 'Approve',
      no: 'Not yet',
    },
  ];
}

function recordFor(state, code, period) {
  const all = state.salesTaxReviews && typeof state.salesTaxReviews === 'object' ? state.salesTaxReviews : {};
  const key = `${code}:${period}`;
  return Object.hasOwn(all, key) ? all[key] : null;
}

export function salesTaxReviewOf(state, args = {}) {
  const drafted = salesTaxReturn(state, args);
  if (!drafted.ok) return drafted;
  const draft = drafted.data;
  const record = recordFor(state, draft.state, draft.period);
  const current = record && record.draftHash === draft.draftHash ? record : null;
  const changed = Boolean(record && !current && Object.keys(record.answers || {}).length);
  const steps = stepsFor(state, draft).map((step) => {
    const answer = current?.answers?.[step.id] || null;
    return { ...step, status: answer ? (answer.answer === 'wrong' ? 'wrong' : 'confirmed') : 'open', answer };
  });
  const blockedBy = (step) => steps.slice(0, steps.indexOf(step)).find((before) => before.status !== 'confirmed') || null;
  const next = steps.find((step) => step.status !== 'confirmed') || null;
  return {
    ok: true,
    data: {
      state: draft.state,
      period: draft.period,
      periods: draft.periods,
      month: `${draft.state} ${draft.period}`,
      kind: 'sales-tax',
      draftHash: draft.draftHash,
      empty: draft.empty,
      changed,
      steps: steps.map((step) => ({ ...step, waitingFor: blockedBy(step)?.id || null })),
      next: next ? next.id : null,
      approved: Boolean(current?.approval),
      approval: current?.approval || null,
      taxCollected: draft.taxCollected,
      toPay: draft.toPay,
      dueDate: draft.dueDate,
      filed: draft.filed,
    },
  };
}

function actorOf(state, args) {
  const actor = state && state.__actor;
  return { userId: String(actor?.userId || args.actorId || ''), role: String(actor?.role || args.role || '') };
}

export function checkSalesTaxAnswer(state, args = {}) {
  const review = salesTaxReviewOf(state, args);
  if (!review.ok) return review;
  const data = review.data;
  if (args.draftHash !== data.draftHash) return fail('DRAFT_CHANGED', { period: data.period });
  if (!SALES_TAX_REVIEW_ANSWERS.includes(args.answer)) return fail('UNKNOWN_ANSWER');
  const step = data.steps.find((item) => item.id === args.step);
  if (!step) return fail('UNKNOWN_STEP', { step: args.step });
  if (step.waitingFor) return fail('STEP_NOT_READY', { step: step.id, waitingFor: step.waitingFor });
  if (data.empty) return fail('NOTHING_TO_REVIEW', { period: data.period });
  const isApproval = step.id === 'approve';
  const fits = isApproval ? ['approve', 'wrong'] : ['correct', 'wrong'];
  if (!fits.includes(args.answer)) return fail('ANSWER_DOES_NOT_FIT', { step: step.id });
  const actor = actorOf(state, args);
  if (isApproval && args.answer === 'approve' && actor.role && actor.role !== 'admin') return fail('OWNER_APPROVES', { role: actor.role });
  return { ok: true, review: data, step, actor };
}

export function answerSalesTaxReview(state, args = {}) {
  const checked = checkSalesTaxAnswer(state, args);
  if (!checked.ok) return checked;
  const { review, step, actor } = checked;
  state.salesTaxReviews = state.salesTaxReviews && typeof state.salesTaxReviews === 'object' ? state.salesTaxReviews : {};
  const existing = recordFor(state, review.state, review.period);
  const record = existing && existing.draftHash === review.draftHash ? existing : { draftHash: review.draftHash, answers: {}, approval: null };
  const on = localToday();
  const note = String(args.note || '').trim().slice(0, 500);
  record.answers[step.id] = { answer: args.answer, by: actor.userId, on, ...(note ? { note } : {}) };
  if (step.id === 'approve' && args.answer === 'approve') record.approval = { by: actor.userId, on, draftHash: review.draftHash };
  state.salesTaxReviews[`${review.state}:${review.period}`] = record;
  const after = salesTaxReviewOf(state, { state: review.state, period: review.period }).data;
  return { ok: true, state: review.state, period: review.period, step: step.id, answer: args.answer, next: after.next, approved: after.approved, review: after };
}

export function planSalesTaxPayment(state, args = {}) {
  const drafted = salesTaxReturn(state, args);
  if (!drafted.ok) return drafted;
  const draft = drafted.data;
  const date = args.date == null || args.date === '' ? localToday() : postingDate(args.date);
  if (!date) return fail('INVALID_DATE', { date: args.date });
  if (date > localToday()) return fail('FUTURE_DATE', { date });
  if (isPeriodLocked(state, date)) return fail('PERIOD_LOCKED', { date, lockThrough: state.lockThrough });
  if (draft.toPay <= 0.005) return fail('NOTHING_DUE', { state: draft.state, period: draft.period });
  const amount = args.amount == null || args.amount === '' ? draft.toPay : round2(args.amount);
  if (!(amount > 0)) return fail('BAD_AMOUNT');
  if (amount > draft.toPay + 0.005) return fail('MORE_THAN_DUE', { due: draft.toPay });
  const mode = args.mode === 'cash' ? 'cash' : 'bank';
  const reference = String(args.reference || '').trim().slice(0, 40);
  return { ok: true, payment: { state: draft.state, period: draft.period, date, amount, mode, reference }, draft };
}

function nextTransferId(state) {
  state.transferSeq = (state.transferSeq || 100000) + 1;
  return BigInt(state.transferSeq);
}

export function recordSalesTaxPayment(state, args = {}) {
  const planned = planSalesTaxPayment(state, args);
  if (!planned.ok) return planned;
  const { payment } = planned;
  ensureUsAccounts(state.ledger);
  const id = `STP-${String((state.salesTaxPayments || []).length + 1).padStart(4, '0')}`;
  const posted = createTransfers(state.ledger, [
    { id: nextTransferId(state), debitAccountId: SALES_TAX_PAYABLE, creditAccountId: payment.mode === 'cash' ? CASH : BANK, amount: paise(payment.amount), code: 'SALES-TAX-PAYMENT', userData: payment.date, invoiceId: id },
  ]);
  if (posted.some((result) => !result.ok)) return fail('LEDGER_REJECT', { posted });
  const record = { id, ...payment, transferIds: posted.map((result) => result.id) };
  state.salesTaxPayments = state.salesTaxPayments || [];
  state.salesTaxPayments.push(record);
  return { ok: true, payment: record, left: round2(planned.draft.toPay - payment.amount) };
}

export function planSalesTaxFiling(state, args = {}) {
  const drafted = salesTaxReturn(state, args);
  if (!drafted.ok) return drafted;
  const draft = drafted.data;
  const confirmation = String(args.confirmation || '').replace(/\s+/g, '').toUpperCase();
  if (!CONFIRMATION.test(confirmation)) return fail('BAD_CONFIRMATION', { confirmation });
  const today = localToday();
  const filedOn = args.filedOn == null || args.filedOn === '' ? today : postingDate(args.filedOn);
  if (!filedOn) return fail('INVALID_DATE', { date: args.filedOn });
  if (filedOn > today) return fail('FUTURE_DATE', { date: filedOn });
  if (!draft.ended) return fail('PERIOD_NOT_ENDED', { period: draft.period, to: draft.to });
  if (draft.filed) return fail('ALREADY_RECORDED', { returnType: draft.returnType, period: draft.period, arn: draft.filed.confirmation, filedOn: draft.filed.filedOn });
  if ((state.filings || []).some((item) => item.arn === confirmation)) return fail('ARN_USED', { arn: confirmation });
  const filedBy = String(args.filedBy || '').trim().slice(0, 60);
  return {
    ok: true,
    filing: { returnType: draft.returnType, period: draft.period, label: `Sales tax return ${draft.state}`, arn: confirmation, filedOn, dueDate: draft.dueDate, late: Boolean(draft.dueDate) && filedOn > draft.dueDate, filedBy, source: 'recorded', taxCollected: draft.taxCollected, approved: draft.approved },
    draft,
  };
}

export function recordSalesTaxFiling(state, args = {}) {
  const planned = planSalesTaxFiling(state, args);
  if (!planned.ok) return planned;
  state.filings = state.filings || [];
  state.filings.push(planned.filing);
  return { ok: true, filing: planned.filing };
}

export function salesTaxOverview(state) {
  const today = localToday();
  const states = nexusList(state).map((nexus) => {
    const latest = salesTaxReturn(state, { state: nexus.state });
    const current = salesTaxReturn(state, { state: nexus.state, period: periodContaining(nexus.frequency, today) });
    const last = latest.ok ? latest.data : null;
    const now = current.ok ? current.data : null;
    const overdue = Boolean(last && last.dueDate && !last.filed && last.dueDate < today);
    return {
      state: nexus.state,
      frequency: nexus.frequency,
      permitNo: nexus.permitNo,
      lastPeriod: last ? { period: last.period, taxCollected: last.taxCollected, toPay: last.toPay, dueDate: last.dueDate, filed: last.filed, approved: last.approved, empty: last.empty, ended: last.ended } : null,
      currentPeriod: now ? { period: now.period, taxCollected: now.taxCollected, invoices: now.invoices } : null,
      overdue,
      notes: last ? last.notes : [],
    };
  });
  return { ok: true, data: { states, overdue: states.filter((row) => row.overdue).length, hasNexus: states.length > 0 } };
}
