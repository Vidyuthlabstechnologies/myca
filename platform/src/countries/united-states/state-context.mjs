import { computeForm1040, ageAtYearEnd, dependentFlags } from '../../us-1040.mjs';
import { engineInput } from '../../us-return.mjs';
import { whole, positive, sum, check, yesNo } from './state-kit.mjs';

export const INCOME_KEYS = Object.freeze(['wages', 'taxableInterest', 'usObligationInterest', 'ordinaryDividends', 'qualifiedDividends', 'capitalGain', 'iraTaxable', 'pensionTaxable', 'socialSecurityTaxable', 'unemployment', 'stateRefundTaxable', 'businessIncome', 'otherIncome', 'adjustments']);

const DAY = 86400000;
const dayNumber = (iso) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY);
export const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

export function daysIn(taxYear) {
  return dayNumber(`${taxYear}-12-31`) - dayNumber(`${taxYear}-01-01`) + 1;
}

export function periodDays(taxYear, from, to) {
  const start = isIsoDate(from) ? from : `${taxYear}-01-01`;
  const end = isIsoDate(to) ? to : `${taxYear}-12-31`;
  return Math.max(0, dayNumber(end) - dayNumber(start) + 1);
}

function formsOf(input, kind) {
  return (input.forms || []).filter((form) => form.kind === kind);
}

const field = (form, key) => positive(form.fields?.[key]);

function person(raw, taxYear, role) {
  if (!raw) return null;
  return { role, age: ageAtYearEnd(raw.dateOfBirth, taxYear, { dayBefore: true }), blind: Boolean(raw.blind), canBeClaimedAsDependent: Boolean(raw.canBeClaimedAsDependent), dateOfBirth: raw.dateOfBirth || '' };
}

export function federalIncome(federal, input) {
  const lines = federal.lines;
  const schedule1 = federal.schedules?.[1] || {};
  const ints = formsOf(input, '1099-INT');
  const divs = formsOf(input, '1099-DIV');
  return {
    wages: whole(lines['1z']),
    taxableInterest: whole(lines['2b']),
    usObligationInterest: sum(ints, (form) => field(form, 'treasuryInterest')),
    taxExemptInterest: whole(lines['2a']),
    exemptInterestDividends: sum(divs, (form) => field(form, 'exemptInterestDividends')),
    ordinaryDividends: whole(lines['3b']),
    qualifiedDividends: whole(lines['3a']),
    capitalGain: whole(lines['7']),
    capitalGainDistributions: sum(divs, (form) => field(form, 'capitalGainDistributions')),
    iraTaxable: whole(lines['4b']),
    pensionTaxable: whole(lines['5b']),
    socialSecurityBenefits: whole(lines['6a']),
    socialSecurityTaxable: whole(lines['6b']),
    unemployment: whole(schedule1['7']),
    stateRefundTaxable: whole(schedule1['1']),
    businessIncome: whole(schedule1['3']),
    otherIncome: whole(schedule1['9']),
    adjustments: whole(lines['10']),
    adjustmentItems: { educator: whole(schedule1['11']), hsa: whole(schedule1['13']), seTaxDeduction: whole(schedule1['15']), seRetirement: whole(schedule1['16']), seHealth: whole(schedule1['17']), earlyWithdrawal: whole(schedule1['18']), ira: whole(schedule1['20']), studentLoan: whole(schedule1['21']) },
    totalIncome: whole(lines['9']),
    agi: whole(lines['11']),
  };
}

export function itemizedParts(federal, input) {
  const answers = input.answers || {};
  const w2s = formsOf(input, 'W-2');
  const scheduleA = federal.schedules?.A || null;
  return {
    federalItemized: Boolean(federal.summary.itemized),
    federalAllowed: whole(federal.summary.itemizedTotal),
    medicalPaid: positive(answers.medicalExpenses),
    stateIncomeTaxes: sum(w2s, (form) => field(form, 'stateWithheld') + field(form, 'localWithheld')) + positive(answers.stateEstimatedPayments) + positive(answers.priorYearStateTaxPaid),
    generalSalesTax: yesNo(answers.useSalesTax) ? positive(answers.generalSalesTax) : 0,
    realEstateTaxes: sum(formsOf(input, '1098'), (form) => field(form, 'propertyTax')) + positive(answers.realEstateTaxes),
    personalPropertyTaxes: positive(answers.personalPropertyTaxes),
    mortgageInterest: sum(formsOf(input, '1098'), (form) => field(form, 'mortgageInterest') + field(form, 'pointsPaid')) + positive(answers.otherMortgageInterest),
    charityCash: positive(answers.charityCash),
    charityNonCash: positive(answers.charityNonCash),
    otherItemized: positive(answers.otherItemizedDeductions),
    federalScheduleA: scheduleA,
  };
}

export function w2States(input) {
  const rows = [];
  for (const form of formsOf(input, 'W-2')) {
    const code = String(form.fields?.state || '').trim().toUpperCase();
    rows.push({ formId: form.id, owner: form.owner === 'spouse' ? 'spouse' : 'taxpayer', payer: form.payer || '', state: /^[A-Z]{2}$/.test(code) ? code : '', wages: field(form, 'wages'), stateWages: form.fields?.stateWages === undefined || form.fields?.stateWages === null || form.fields?.stateWages === '' ? null : field(form, 'stateWages'), stateWithheld: field(form, 'stateWithheld'), localWithheld: field(form, 'localWithheld') });
  }
  return rows;
}

export function buildStateContext(state, taxYear) {
  const ret = state.usReturns?.[taxYear];
  if (!ret || !ret.filingStatus) return { ok: false, error: 'US_RETURN_NOT_STARTED', taxYear, hint: `Start the ${taxYear} federal return first; every state return starts from it.` };
  const input = engineInput(state, ret);
  const computed = computeForm1040(input, taxYear);
  if (!computed.ok) return computed;
  const federal = computed.data;
  const dependents = (input.dependents || []).map((item) => ({ ...dependentFlags(item, taxYear), relationship: item.relationship || '', months: Number(item.months ?? 12), student: Boolean(item.student), disabled: Boolean(item.disabled) }));
  const filers = [person(input.taxpayer, taxYear, 'taxpayer'), input.filingStatus === 'mfj' ? person(input.spouse, taxYear, 'spouse') : null].filter(Boolean);
  return {
    ok: true,
    ctx: Object.freeze({
      taxYear,
      filingStatus: input.filingStatus,
      homeState: String(ret.address?.state || '').toUpperCase(),
      address: ret.address || null,
      filers,
      spouse: input.spouse ? person(input.spouse, taxYear, 'spouse') : null,
      dependents,
      federal,
      income: federalIncome(federal, input),
      itemized: itemizedParts(federal, input),
      w2: w2States(input),
      forms: input.forms || [],
      answers: input.answers || {},
      daysInYear: daysIn(taxYear),
    }),
  };
}

export function sourcedIncome(ctx, filing) {
  const checks = [];
  const income = ctx.income;
  const given = filing.income || {};
  const has = (key) => given[key] !== undefined && given[key] !== null && given[key] !== '';
  const w2Rows = ctx.w2.filter((row) => row.state === filing.state);
  const w2Wages = sum(w2Rows, (row) => (row.stateWages === null ? row.wages : row.stateWages));
  if (filing.residency === 'full-year') {
    return { sourced: Object.fromEntries(INCOME_KEYS.map((key) => [key, income[key]])), share: 1, checks, method: 'full-year' };
  }
  const share = filing.residency === 'part-year' ? Math.min(1, filing.residentDays / ctx.daysInYear) : 0;
  const sourced = {};
  let prorated = false;
  for (const key of INCOME_KEYS) {
    if (has(key)) {
      sourced[key] = whole(given[key]);
      continue;
    }
    if (key === 'wages') {
      sourced.wages = filing.residency === 'part-year' && !w2Rows.length ? Math.round(income.wages * share) : Math.min(w2Wages, Math.max(income.wages, w2Wages));
      if (filing.residency === 'part-year' && !w2Rows.length && income.wages) prorated = true;
      continue;
    }
    if (filing.residency === 'nonresident') {
      sourced[key] = 0;
      if (key === 'businessIncome' && income.businessIncome) checks.push(check('warning', 'NONRESIDENT_BUSINESS_INCOME', `You have self-employment income; only the part earned in ${filing.stateName} is taxed there, and none is counted until you say how much.`, `Give the ${filing.stateName} part of your business income in your state residency answers.`));
      continue;
    }
    sourced[key] = Math.round(whole(income[key]) * share);
    if (income[key]) prorated = true;
  }
  if (prorated) checks.push(check('warning', 'PRORATED_BY_DAYS', `Income other than ${filing.stateName} W-2 wages was split by the ${filing.residentDays} days you lived in ${filing.stateName}. The return needs what you actually received while a resident.`, 'Give the amounts received while a resident in your state residency answers.'));
  return { sourced, share, checks, method: filing.residency };
}

export function sourcedAgi(sourced) {
  return INCOME_KEYS.filter((key) => key !== 'adjustments' && key !== 'qualifiedDividends' && key !== 'usObligationInterest').reduce((total, key) => total + whole(sourced[key]), 0) - whole(sourced.adjustments);
}
