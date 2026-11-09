import { localToday, postingDate } from './dates.mjs';
import { rule } from '../../sprints/statutory-rules/src/index.mjs';
import { incomeTax } from './sprint-load.mjs';
import { createAccounts, createTransfers } from './ledger.mjs';
import { marketplaceCredits } from './marketplace-credits.mjs';
import { tdsWithheldInFy } from './tds-credits.mjs';
import { salaryPrivate } from './employees.mjs';
import { isPeriodLocked } from './period-lock.mjs';

export const ADVANCE_TAX_ACCOUNT = { id: 1300, code: '1300', name: 'Advance tax paid', type: 'asset', flags: 0 };
const INDIVIDUAL_TYPES = new Set(['', 'individual', 'proprietorship', 'proprietor', 'sole proprietor', 'sole proprietorship', 'huf']);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function fyOf(today) {
  const [y, m] = today.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return { label: `${start}-${String((start + 1) % 100).padStart(2, '0')}`, start, from: `${start}-04-01`, to: `${start + 1}-03-31` };
}

function monthsElapsed(fy, today) {
  const [y, m] = today.split('-').map(Number);
  const [, d] = [0, Number(today.slice(8, 10))];
  const months = (y - fy.start) * 12 + (m - 4) + 1;
  return Math.max(1, Math.min(12, d >= 28 ? months : months - 1 || 1));
}

function inFy(date, fy) {
  return date >= fy.from && date <= fy.to;
}

function sum(rows, pick) {
  return round2(rows.reduce((s, row) => s + Number(pick(row) || 0), 0));
}

function profitToDate(state, fy, today) {
  const upTo = (doc) => doc.date && inFy(doc.date, fy) && doc.date <= today;
  const sales = sum((state.invoices || []).filter((d) => d.status !== 'cancelled' && upTo(d)), (d) => d.taxable ?? d.total);
  const creditNotes = sum((state.creditNotes || []).filter(upTo), (d) => d.taxable ?? d.total);
  const purchases = sum((state.purchases || []).filter((d) => d.status !== 'cancelled' && upTo(d)), (d) => d.taxable ?? d.total);
  const expenses = sum((state.expenses || []).filter(upTo), (d) => d.taxable ?? d.amount);
  let payroll = 0;
  let payrollHidden = false;
  if (salaryPrivate(state)) payrollHidden = (state.employees || []).length > 0;
  else {
    for (const run of Object.values(state.payrollRuns || {})) {
      if (run && run.status === 'approved' && inFy(`${run.period}-01`, fy)) payroll = round2(payroll + Number(run.totals?.grossPaise || 0) / 100);
    }
  }
  return { sales: round2(sales - creditNotes), purchases, expenses, payroll, payrollHidden, profit: round2(sales - creditNotes - purchases - expenses - payroll) };
}

export function creditsToDate(state, fy, today) {
  const statements = (state.tdsCreditStatements || []).filter((row) => row.date && inFy(row.date, fy) && row.date <= today);
  const tds26as = sum(statements, (row) => row.taxDeducted);
  const marketplace = marketplaceCredits(state, { fy: fy.label }).data;
  const tds194o = round2(Number(marketplace?.totals?.tdsRecorded || 0));
  const tdsWithheld = tdsWithheldInFy(state, fy, today);
  const known = tds26as > 0 ? tds26as : round2(tds194o + tdsWithheld);
  const source = tds26as > 0 ? 'Form 26AS as imported'
    : tds194o > 0 && tdsWithheld > 0 ? 'TDS withheld by customers and 194-O seen in settlements (26AS not imported)'
      : tdsWithheld > 0 ? 'TDS withheld by customers (26AS not imported)'
        : tds194o > 0 ? 'TDS 194-O seen in marketplace settlements (26AS not imported)' : 'no TDS credit on record';
  return { tds26as, tds194o, tdsWithheld, credits: known, source };
}

function instalmentsFor(fy, presumptive) {
  const found = rule(presumptive ? 'due-date.income-tax.advance-tax.presumptive' : 'due-date.income-tax.advance-tax', fy.from);
  if (!found.ok) return { ok: false, error: 'RULE_MISSING', ruleId: presumptive ? 'due-date.income-tax.advance-tax.presumptive' : 'due-date.income-tax.advance-tax' };
  const rows = found.value.instalments.map((item) => {
    const year = item.month >= 4 ? fy.start : fy.start + 1;
    return { dueDate: `${year}-${String(item.month).padStart(2, '0')}-${String(item.day).padStart(2, '0')}`, cumulativePercent: item.cumulativePercent };
  });
  return { ok: true, rows, record: found.record, attested: (found.record?.attestations || []).length > 0, ruleId: presumptive ? 'due-date.income-tax.advance-tax.presumptive' : 'due-date.income-tax.advance-tax' };
}

export function advanceTax(state, args = {}) {
  const today = postingDate(args.asOf) || localToday();
  const entity = String(state.company?.entityType || '').trim().toLowerCase();
  if (!INDIVIDUAL_TYPES.has(entity)) return { ok: false, error: 'NOT_AN_INDIVIDUAL', entityType: state.company?.entityType };
  const fy = fyOf(today);
  const regime = args.regime === 'old' ? 'old' : 'new';
  const presumptive = args.presumptive === true;
  const elapsed = monthsElapsed(fy, today);
  const toDate = profitToDate(state, fy, today);
  const otherIncome = round2(Math.max(0, Number(args.otherIncome) || 0));
  const annualised = round2((toDate.profit * 12) / elapsed);
  const taxableIncome = round2(Math.max(0, annualised + otherIncome));
  const computed = incomeTax.computeIncomeTax({ fy: fy.label, regime, otherIncomePaise: Math.round(taxableIncome * 100), residentIndividual: true });
  if (computed.error) return { ok: false, error: computed.error, ruleId: computed.ruleId };
  const tax = round2(computed.taxPayablePaise / 100);
  const credits = creditsToDate(state, fy, today);
  const net = round2(Math.max(0, tax - credits.credits));
  const schedule = instalmentsFor(fy, presumptive);
  if (!schedule.ok) return schedule;
  const payments = (state.advanceTaxPayments || []).filter((p) => p.fy === fy.label);
  const paid = sum(payments, (p) => p.amount);
  let paidSoFar = paid;
  const instalments = schedule.rows.map((row) => {
    const cumulative = round2((net * row.cumulativePercent) / 100);
    const dueNow = round2(Math.max(0, cumulative - paidSoFar));
    const status = row.dueDate < today ? (dueNow > 0 ? 'missed' : 'met') : 'ahead';
    const out = { dueDate: row.dueDate, cumulativePercent: row.cumulativePercent, cumulative, dueNow, status };
    if (row.dueDate < today) paidSoFar = Math.max(paidSoFar, cumulative);
    return out;
  });
  const next = instalments.find((i) => i.status === 'ahead') || null;
  const missed = instalments.filter((i) => i.status === 'missed');
  const notBelowThreshold = net >= 10000;
  return {
    ok: true,
    data: {
      forCA: true,
      fy: fy.label,
      asOf: today,
      regime,
      presumptive,
      monthsElapsed: elapsed,
      toDate,
      annualisedProfit: annualised,
      otherIncome,
      taxableIncome,
      tax,
      credits,
      net,
      paid,
      instalments,
      next,
      missed,
      liable: notBelowThreshold,
      interest: missed.length ? 'Interest under sections 234B and 234C may apply to the shortfall; MyCA does not compute it.' : '',
      assumptions: [
        `Profit to date is sales less credit notes, purchases, expenses${toDate.payrollHidden ? '' : ' and approved payroll'} dated in ${fy.label} up to ${today}, before depreciation and any adjustment your CA makes${toDate.payrollHidden ? '; payroll is left out because only the owner sees it' : ''}.`,
        `The year is taken as ${elapsed} ${elapsed === 1 ? 'month' : 'months'} elapsed and the profit scaled to twelve; a seasonal business should say its expected year instead.`,
        `Tax under the ${regime} regime for a resident individual below sixty, from MyCA's dated rules${schedule.attested ? '' : ' (not yet reviewed by your CA)'}.`,
        `TDS credit: ${credits.source}.`,
        presumptive ? 'Presumptive income under section 58(2): the whole amount by 15 March.' : 'Instalments of 15, 45, 75 and 100 percent by 15 June, 15 September, 15 December and 15 March.',
        notBelowThreshold ? '' : 'Advance tax is not payable when the net amount is under ₹10,000; the figures are shown for planning.',
      ].filter(Boolean),
      rulesUsed: [schedule.ruleId],
    },
  };
}

export function planAdvanceTaxPayment(state, args = {}) {
  const amount = round2(Number(args.amount));
  if (!(amount > 0)) return { ok: false, error: 'BAD_AMOUNT' };
  const date = args.date == null || args.date === '' ? localToday() : postingDate(args.date);
  if (!date) return { ok: false, error: 'INVALID_DATE', date: args.date };
  if (date > localToday()) return { ok: false, error: 'FUTURE_DATE', date };
  if (isPeriodLocked(state, date)) return { ok: false, error: 'PERIOD_LOCKED', date, lockThrough: state.lockThrough };
  const challan = String(args.challan || '').trim().toUpperCase().slice(0, 30);
  const fy = fyOf(date);
  const mode = args.mode === 'cash' ? 'cash' : 'bank';
  const estimate = advanceTax(state, { asOf: date, regime: args.regime, presumptive: args.presumptive });
  return { ok: true, plan: { amount, date, challan, fy: fy.label, mode, estimate: estimate.ok ? estimate.data : null } };
}

export function recordAdvanceTaxPayment(state, args = {}) {
  const planned = planAdvanceTaxPayment(state, args);
  if (!planned.ok) return planned;
  const { plan } = planned;
  createAccounts(state.ledger, [ADVANCE_TAX_ACCOUNT]);
  state.transferSeq = (state.transferSeq || 100000) + 1;
  const posted = createTransfers(state.ledger, [{ id: BigInt(state.transferSeq), debitAccountId: ADVANCE_TAX_ACCOUNT.id, creditAccountId: plan.mode === 'cash' ? 1001 : 1002, amount: BigInt(Math.round(plan.amount * 100)), code: 'ADVANCE-TAX', userData: plan.date }]);
  if (posted.some((r) => !r.ok)) return { ok: false, error: 'LEDGER_REJECT', posted };
  state.advanceTaxPayments = Array.isArray(state.advanceTaxPayments) ? state.advanceTaxPayments : [];
  const payment = { id: `ADV-${String(state.advanceTaxPayments.length + 1).padStart(4, '0')}`, fy: plan.fy, amount: plan.amount, date: plan.date, challan: plan.challan, mode: plan.mode, transferId: String(state.transferSeq) };
  state.advanceTaxPayments.push(payment);
  return { ok: true, payment };
}

export function advanceTaxWords(d, money) {
  const longDate = (iso) => { const [y, m, day] = iso.split('-').map(Number); return `${day} ${MONTHS[m - 1]} ${y}`; };
  const lines = [`For your CA to confirm. Advance tax for ${d.fy} as of ${longDate(d.asOf)}, ${d.regime} regime${d.presumptive ? ', presumptive' : ''}.`];
  lines.push(`Profit so far ${money(d.toDate.profit)} over ${d.monthsElapsed} ${d.monthsElapsed === 1 ? 'month' : 'months'} (sales ${money(d.toDate.sales)}, purchases ${money(d.toDate.purchases)}, expenses ${money(d.toDate.expenses)}${d.toDate.payrollHidden ? '' : `, payroll ${money(d.toDate.payroll)}`}); scaled to the year ${money(d.annualisedProfit)}${d.otherIncome ? ` plus other income ${money(d.otherIncome)}` : ''}.`);
  lines.push(`Tax on ${money(d.taxableIncome)}: ${money(d.tax)}; less TDS credit ${money(d.credits.credits)}; net ${money(d.net)}; paid so far ${money(d.paid)}.`);
  if (!d.liable) lines.push('Under ₹10,000 net, so no advance tax is due; keep an eye on it as the year goes.');
  for (const i of d.instalments) lines.push(`· ${longDate(i.dueDate)} (${i.cumulativePercent}% cumulative, ${money(i.cumulative)}): ${i.status === 'met' ? 'met' : i.status === 'missed' ? `missed, ${money(i.dueNow)} short` : i.dueNow > 0 ? `${money(i.dueNow)} to pay by then` : 'nothing more to pay'}.`);
  if (d.interest) lines.push(d.interest);
  if (d.next && d.next.dueNow > 0 && d.liable) lines.push(`Set aside ${money(d.next.dueNow)} by ${longDate(d.next.dueDate)}. Say "paid advance tax ${d.next.dueNow} challan <CIN>" once it is paid.`);
  lines.push(`Assumptions: ${d.assumptions.join(' ')}`);
  return lines.join('\n');
}
