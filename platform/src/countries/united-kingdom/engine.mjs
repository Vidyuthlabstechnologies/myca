import { appendAuditEvent } from '../../ca-api.mjs';
import { countrySlice, openCountrySlice } from '../kit/index.mjs';
import { gbSelfAssessment, STUDENT_LOAN_PLANS, RESIDENCES } from './self-assessment.mjs';
import { buildVatReturn, vatRegistrationCheck } from './vat.mjs';
import { quarterlyPeriods, mtdItMandate, selfEmploymentCumulative, ukPropertyCumulative, penaltyPoints, latePayment } from './mtd.mjs';
import { checkGbIdentifier, utrValid, ninoValid, vrnValid, normaliseUtr, normaliseNino, normaliseVrn } from './identifiers.mjs';
import { parseTaxYear, gbMoney, monthEndPlus } from './rules.mjs';
import {
  hmrcStatus, startHmrcConnection, finishHmrcConnection, disconnectHmrc, syncHmrc, submitGbVatReturn, submitGbItsaUpdate,
  triggerGbCalculation, submitGbFinalDeclaration,
} from './hmrc-actions.mjs';

const STAGGER_END_MONTHS = Object.freeze({ 1: [3, 6, 9, 12], 2: [1, 4, 7, 10], 3: [2, 5, 8, 11], monthly: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] });
const PROFILE_KEYS = ['name', 'utr', 'nino', 'vrn', 'residence', 'studentLoans', 'calendarQuarters', 'vatStagger', 'vatScheme', 'flatRateBasisPoints'];

function taxpayer(state) {
  return countrySlice(state, 'gbTaxpayer');
}

function lastDay(year, month) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

export function profileProblems(args = {}) {
  const problems = [];
  if (args.utr !== undefined && args.utr !== '' && !utrValid(args.utr)) problems.push({ field: 'utr', why: 'Not a valid 10-digit UTR (its check digit does not match).' });
  if (args.nino !== undefined && args.nino !== '' && !ninoValid(args.nino)) problems.push({ field: 'nino', why: 'Not a valid National Insurance number.' });
  if (args.vrn !== undefined && args.vrn !== '' && !vrnValid(args.vrn)) problems.push({ field: 'vrn', why: 'Not a valid VAT registration number.' });
  if (args.residence !== undefined && !RESIDENCES.includes(args.residence)) problems.push({ field: 'residence', why: `One of ${RESIDENCES.join(', ')}.` });
  if (args.studentLoans !== undefined && (!Array.isArray(args.studentLoans) || args.studentLoans.some((plan) => !STUDENT_LOAN_PLANS.includes(plan)))) problems.push({ field: 'studentLoans', why: `Plans are ${STUDENT_LOAN_PLANS.join(', ')}.` });
  if (args.vatScheme === 'flat-rate' && args.flatRateBasisPoints !== undefined && !(Number.isInteger(args.flatRateBasisPoints) && args.flatRateBasisPoints > 0 && args.flatRateBasisPoints <= 2000)) problems.push({ field: 'flatRateBasisPoints', why: 'A flat rate is between 0.01% and 20% (1 to 2000 basis points).' });
  return problems;
}

function profileFrom(args) {
  const out = {};
  for (const key of PROFILE_KEYS) if (args[key] !== undefined) out[key] = args[key];
  if (out.utr) out.utr = normaliseUtr(out.utr);
  if (out.nino) out.nino = normaliseNino(out.nino);
  if (out.vrn) out.vrn = normaliseVrn(out.vrn);
  if (typeof out.name === 'string') out.name = out.name.trim().slice(0, 160);
  return out;
}

function masked(value) {
  const text = String(value || '');
  return text.length > 4 ? `${'•'.repeat(Math.max(0, text.length - 4))}${text.slice(-4)}` : text;
}

export function gbTaxCalendar(state, args = {}) {
  const year = parseTaxYear(args.taxYear);
  if (!year) return { ok: false, error: 'BAD_TAX_YEAR', hint: 'Give the tax year as 2026-27.' };
  const profile = taxpayer(state);
  const s = year.start;
  const events = [
    { date: `${s + 1}-01-31`, what: `First payment on account for ${year.label}`, kind: 'payment' },
    { date: `${s + 1}-07-31`, what: `Second payment on account for ${year.label}`, kind: 'payment' },
    { date: `${s + 1}-10-05`, what: `Tell HMRC by now if Self Assessment is new for ${year.label}`, kind: 'registration' },
    { date: `${s + 1}-10-31`, what: `Paper tax return for ${year.label}`, kind: 'return' },
    { date: `${s + 2}-01-31`, what: `Online tax return (or MTD final declaration) and balancing payment for ${year.label}`, kind: 'return' },
  ];
  const quarters = quarterlyPeriods(year.label, { calendar: args.calendarQuarters ?? profile.calendarQuarters === true });
  if (quarters.ok) for (const period of quarters.data.periods) events.push({ date: period.dueBy, what: `MTD Income Tax update ${period.quarter} (${period.cumulativeFrom} to ${period.to})`, kind: 'mtd-update' });
  const stagger = String(args.vatStagger || profile.vatStagger || '');
  if (STAGGER_END_MONTHS[stagger]) {
    const months = STAGGER_END_MONTHS[stagger];
    for (let offset = 0; offset < 12; offset += 1) {
      const month = ((3 + offset) % 12) + 1;
      const calendarYear = month >= 4 ? s : s + 1;
      if (!months.includes(month)) continue;
      const end = lastDay(calendarYear, month);
      events.push({ date: monthEndPlus(end, 1, 7), what: `VAT return and payment for the period to ${end}`, kind: 'vat' });
    }
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || a.what.localeCompare(b.what));
  const today = new Date().toISOString().slice(0, 10);
  return { ok: true, data: { taxYear: year.label, events: events.map((event) => ({ ...event, past: event.date < today })), next: events.find((event) => event.date >= today) || null } };
}

function quarterCheck(args) {
  if (args.kind === 'uk-property') return ukPropertyCumulative({ taxYear: args.taxYear, fromDate: args.periodStartDate, toDate: args.periodEndDate, income: args.income, expenses: args.expenses });
  return selfEmploymentCumulative(args);
}

function hmrcPreview(summary, effects, extra = {}) {
  return { blockers: [], summary, effects, figures: {}, ...extra };
}

export const ENGINE = Object.freeze({
  country: 'GB',
  run: Object.freeze({
    connect_gb_hmrc: (state, args = {}) => startHmrcConnection(state, args),
    disconnect_gb_hmrc: (state, args = {}) => disconnectHmrc(state, args),
    finish_gb_hmrc_connection: (state, args = {}) => finishHmrcConnection(state, args),
    gb_hmrc_status: (state) => hmrcStatus(state),
    gb_itsa_quarter_check: (state, args = {}) => quarterCheck(args),
    gb_late_payment: (state, args = {}) => latePayment(args),
    gb_mtd_mandate: (state, args = {}) => mtdItMandate(args),
    gb_mtd_periods: (state, args = {}) => quarterlyPeriods(args.taxYear, { calendar: args.calendarQuarters ?? taxpayer(state).calendarQuarters === true }),
    gb_penalty_points: (state, args = {}) => penaltyPoints(args),
    gb_tax_calendar: (state, args = {}) => gbTaxCalendar(state, args),
    gb_tax_estimate: (state, args = {}) => {
      const profile = taxpayer(state);
      return gbSelfAssessment({ residence: profile.residence, studentLoans: profile.studentLoans, ...args });
    },
    gb_vat_registration: (state, args = {}) => vatRegistrationCheck(args),
    gb_vat_return_check: (state, args = {}) => {
      const profile = taxpayer(state);
      return buildVatReturn({ scheme: profile.vatScheme, flatRateBasisPoints: profile.flatRateBasisPoints, ...args });
    },
    set_gb_taxpayer: (state, args = {}) => {
      const problems = profileProblems(args);
      if (problems.length) return { ok: false, error: 'GB_TAXPAYER_INVALID', problems };
      const update = profileFrom(args);
      const slice = openCountrySlice(state, 'gbTaxpayer');
      const before = { utr: masked(slice.utr), nino: masked(slice.nino), vrn: masked(slice.vrn), residence: slice.residence || '' };
      Object.assign(slice, update, { updatedAt: new Date().toISOString() });
      appendAuditEvent(state, { action: 'gb_taxpayer_set', actorId: args.actorId || 'owner', metadata: { before, after: { utr: masked(slice.utr), nino: masked(slice.nino), vrn: masked(slice.vrn), residence: slice.residence || '' }, fields: Object.keys(update) } });
      return { ok: true, data: { saved: true, name: slice.name || '', utr: masked(slice.utr), nino: masked(slice.nino), vrn: masked(slice.vrn), residence: slice.residence || 'england', studentLoans: slice.studentLoans || [], calendarQuarters: slice.calendarQuarters === true, vatStagger: slice.vatStagger || '', vatScheme: slice.vatScheme || 'standard' } };
    },
    submit_gb_final_declaration: (state, args = {}) => submitGbFinalDeclaration(state, args),
    submit_gb_itsa_update: (state, args = {}) => submitGbItsaUpdate(state, args),
    submit_gb_vat_return: (state, args = {}) => submitGbVatReturn(state, args),
    sync_gb_hmrc: (state, args = {}) => syncHmrc(state, args),
    trigger_gb_itsa_calculation: (state, args = {}) => triggerGbCalculation(state, args),
    validate_gb_identifier: (state, args = {}) => checkGbIdentifier(args.kind, args.value),
  }),
  preview: Object.freeze({
    connect_gb_hmrc: () => hmrcPreview('Get the HMRC sign-in link to give MyCA authority for VAT and Income Tax.', ['Nothing is sent to HMRC until the taxpayer signs in and HMRC sends a code back.', 'MyCA never sees the Government Gateway password.']),
    disconnect_gb_hmrc: () => hmrcPreview('Delete the HMRC tokens MyCA holds.', ['MyCA can no longer read or send anything to HMRC for this business until it is connected again.']),
    finish_gb_hmrc_connection: (state, args = {}) => ({ ...hmrcPreview('Finish connecting MyCA to HMRC.', ['The access tokens are kept encrypted; they last 4 hours and renew for up to 18 months.']), blockers: args.code && args.state ? [] : ['The code and state from HMRC are both needed.'] }),
    set_gb_taxpayer: (state, args = {}) => {
      const problems = profileProblems(args);
      return { blockers: problems.map((problem) => `${problem.field}: ${problem.why}`), summary: `Save the UK taxpayer details${args.name ? ` for ${args.name}` : ''}.`, effects: ['The UK tools use these numbers for every estimate, VAT return and quarterly update.'], figures: {} };
    },
    submit_gb_final_declaration: (state, args = {}) => {
      const calc = countrySlice(state, 'gbHmrcData').calculations?.[String(args.calculationId || '')];
      const blockers = [];
      if (args.declaration !== true) blockers.push('The taxpayer must make the declaration that the return is correct and complete.');
      if (!calc) blockers.push('Ask HMRC for an intent-to-finalise calculation and review it first.');
      else if (calc.calculationType !== 'intent-to-finalise' && calc.calculationType !== 'intent-to-amend') blockers.push('The calculation must be an intent-to-finalise one.');
      return { blockers, summary: `Send the ${args.taxYear || ''} final declaration to HMRC${calc && calc.totalIncomeTaxAndNicsDue !== null && calc.totalIncomeTaxAndNicsDue !== undefined ? `: Income Tax and NICs due ${gbMoney(calc.totalIncomeTaxAndNicsDue)}` : ''}.`, effects: ['This is the tax return. It cannot be undone; an amendment is a new submission within 12 months of the deadline.', 'The balancing payment is due by 31 January.'], figures: calc ? { totalDue: calc.totalIncomeTaxAndNicsDue } : {} };
    },
    submit_gb_itsa_update: (state, args = {}) => {
      const body = args.body || {};
      const end = body.periodDates?.periodEndDate || body.toDate || '?';
      return { blockers: args.businessId ? [] : ['Choose the HMRC business id.'], summary: `Send the cumulative ${args.kind === 'uk-property' ? 'UK property' : 'self-employment'} update for ${args.taxYear || ''} to ${end}.`, effects: ['It replaces any earlier update of this tax year for this business.', 'HMRC uses it for the in-year estimate; the tax is settled at the final declaration.'], figures: {} };
    },
    submit_gb_vat_return: (state, args = {}) => {
      const body = args.body || {};
      const blockers = [];
      if (args.declaration !== true) blockers.push('The business must declare that the return is true and complete.');
      const sent = Object.values(countrySlice(state, 'gbHmrcData').vatReturns || {}).find((entry) => entry.periodKey === body.periodKey);
      if (sent) blockers.push(`The return for period ${body.periodKey} was already sent on ${sent.at.slice(0, 10)}.`);
      const pay = (body.totalVatDue || 0) >= (body.vatReclaimedCurrPeriod || 0);
      return { blockers, summary: `Send the VAT return for period ${body.periodKey || '?'}: ${pay ? 'pay' : 'reclaim'} ${gbMoney(body.netVatDue)}.`, effects: ['HMRC records it straight away and it cannot be changed; correct a mistake on a later return or with form VAT652.', pay ? 'The VAT is due by the same deadline as the return.' : 'HMRC repays the VAT to the bank account it holds.'], figures: { box1: body.vatDueSales, box3: body.totalVatDue, box4: body.vatReclaimedCurrPeriod, box5: body.netVatDue, box6: body.totalValueSalesExVAT, box7: body.totalValuePurchasesExVAT } };
    },
    sync_gb_hmrc: (state, args = {}) => hmrcPreview(`Pull obligations from HMRC${args.taxYear ? ` for ${args.taxYear}` : ''}.`, ['Reads only: nothing is filed. The fraud prevention information HMRC requires is sent with each call.']),
    trigger_gb_itsa_calculation: (state, args = {}) => hmrcPreview(`Ask HMRC for an ${args.calculationType || 'in-year'} calculation for ${args.taxYear || ''}.`, ['HMRC works out the tax from the updates sent so far; nothing is filed.']),
  }),
  words: Object.freeze({
    gb_tax_estimate: (result) => {
      if (!result.ok) return '';
      const d = result.data;
      const tail = d.refundDue ? `a refund of about ${gbMoney(-d.balancingPayment)}` : `${gbMoney(d.balancingPayment)} to pay by ${d.dueBy}`;
      const poa = d.nextYear.paymentOnAccountEach ? ` Payments on account of ${gbMoney(d.nextYear.paymentOnAccountEach)} are due on ${d.nextYear.dueDates.join(' and ')}.` : '';
      return `For ${d.taxYear}, income tax is ${gbMoney(d.incomeTax)}, Class 4 National Insurance ${gbMoney(d.class4.total)}${d.studentLoan.due ? `, student loan ${gbMoney(d.studentLoan.due)}` : ''}${d.capitalGains.tax ? `, capital gains tax ${gbMoney(d.capitalGains.tax)}` : ''}, so ${tail}.${poa}${d.unreviewed ? ' These rates are not yet reviewed by a UK tax adviser.' : ''}`;
    },
    gb_vat_return_check: (result) => (result.ok ? (result.data.ready ? `The VAT return is ready: box 5 ${result.data.direction === 'refund' ? 'reclaims' : 'is'} ${gbMoney(result.data.boxes[5])}, due ${result.data.dueBy || 'one month and seven days after the period ends'}.` : `The VAT return needs ${result.data.problems.length} fixes before HMRC will take it.`) : ''),
    gb_vat_registration: (result) => (result.ok ? result.data.why : ''),
    gb_mtd_mandate: (result) => (result.ok ? result.data.why : ''),
    submit_gb_vat_return: (result) => (result.ok ? `HMRC accepted the VAT return for period ${result.data.periodKey}${result.data.formBundleNumber ? ` (receipt ${result.data.formBundleNumber})` : ''}${result.mock ? ' in the simulator' : ''}.` : ''),
    submit_gb_itsa_update: (result) => (result.ok ? `HMRC took the cumulative update to ${result.data.periodEnd}${result.mock ? ' in the simulator' : ''}.` : ''),
    submit_gb_final_declaration: (result) => (result.ok ? `The ${result.data.taxYear} final declaration is with HMRC${result.mock ? ' (simulator)' : ''}.` : ''),
  }),
});
