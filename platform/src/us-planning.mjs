import { computeForm1040, FILING_STATUSES, SUPPORTED_YEARS, US_FORMS_SUPPORTED, US_FORMS_COMING } from './us-1040.mjs';
import { engineInput } from './us-return.mjs';
import { rules } from './sprint-load.mjs';
import { localToday } from './dates.mjs';

const amount = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) / 100 : 0;
};
const ofBasis = (value, basisPoints) => Math.round((value * basisPoints) / 10000);
const fromCents = (cents) => Math.round(Number(cents || 0) / 100);
const line = (data, key) => Number(data.lines[key] || 0);

function planningYear(value) {
  const year = String(value || '').trim() || localToday().slice(0, 4);
  return SUPPORTED_YEARS.includes(year) ? year : null;
}

function baseInput(state, taxYear, args) {
  const ret = state.usReturns?.[taxYear];
  if (ret && ret.filingStatus) return { ok: true, input: engineInput(state, ret), fromReturn: true };
  if (!FILING_STATUSES.includes(args.filingStatus)) return { ok: false, error: 'US_RETURN_NOT_STARTED', taxYear, hint: `Start the ${taxYear} return with a filing status, or pass filingStatus.` };
  const person = (firstName) => ({ firstName, lastName: '', dateOfBirth: `${Number(taxYear) - 40}-07-01` });
  return { ok: true, input: { filingStatus: args.filingStatus, taxpayer: person('Estimate'), spouse: args.filingStatus === 'mfj' ? person('Spouse') : null, dependents: [], forms: [], businesses: [], answers: {} }, fromReturn: false };
}

function netTax(data) {
  return Math.max(0, line(data, '24') - line(data, '27') - line(data, '28') - line(data, '29'));
}

function safeHarbor(taxYear, data, answers) {
  const found = rules.rule('us.federal.individual.estimated-tax-penalty', `${taxYear}-12-31`);
  if (!found.ok) return null;
  const rule = found.value;
  const tax = netTax(data);
  const current = ofBasis(tax, rule.currentYearBasisPoints);
  const given = answers.priorYearTax !== undefined && answers.priorYearTax !== '' && answers.priorYearTax !== null;
  const highIncome = given && amount(answers.priorYearAgi) > fromCents(data.filingStatus === 'mfs' ? rule.highIncomeAgiCents.mfs : rule.highIncomeAgiCents.other);
  const prior = given ? ofBasis(Math.round(amount(answers.priorYearTax)), highIncome ? rule.highIncomePriorYearBasisPoints : rule.priorYearBasisPoints) : null;
  const usePrior = prior !== null && prior < current;
  return {
    requiredAnnualPayment: usePrior ? prior : current,
    basis: usePrior ? (highIncome ? 'prior_year_110_percent' : 'prior_year_100_percent') : 'current_year_90_percent',
    minimumUnderpayment: fromCents(rule.minimumUnderpaymentCents),
    priorYearTaxGiven: given,
    ruleUsed: `${found.record.id}@${found.record.effectiveFrom}`,
    unreviewed: !(found.record.attestations || []).some((item) => item.verdict === 'verified'),
  };
}

export function usSupportedForms() {
  return { ok: true, data: { supported: [...US_FORMS_SUPPORTED], coming: [...US_FORMS_COMING], years: [...SUPPORTED_YEARS] } };
}

export function usWithholdingCheck(state, args = {}) {
  const taxYear = planningYear(args.taxYear);
  if (!taxYear) return { ok: false, error: 'TAX_YEAR_NOT_SUPPORTED', supported: SUPPORTED_YEARS };
  const periodsLeft = Math.max(0, Math.min(366, Number.parseInt(args.periodsLeft ?? 0, 10) || 0));
  const base = baseInput(state, taxYear, args);
  if (!base.ok) return base;
  const wages = amount(args.ytdWages) + amount(args.payPerPeriod) * periodsLeft;
  const withheld = amount(args.ytdWithheld) + amount(args.withheldPerPeriod) * periodsLeft;
  const input = structuredClone(base.input);
  input.forms = (input.forms || []).filter((form) => !(form.kind === 'W-2' && form.owner !== 'spouse'));
  if (wages > 0) input.forms.push({ kind: 'W-2', owner: 'taxpayer', payer: 'Employer (projected)', fields: { wages, federalWithheld: withheld, socialSecurityWages: wages, medicareWages: wages } });
  input.answers = { ...input.answers, otherIncome: amount(input.answers?.otherIncome) + amount(args.otherIncome) };
  const result = computeForm1040(input, taxYear);
  if (!result.ok) return result;
  const data = result.data;
  const projectedTax = netTax(data);
  const projectedWithholding = line(data, '25d');
  const estimated = line(data, '26');
  const gap = projectedTax - projectedWithholding - estimated;
  const harbor = safeHarbor(taxYear, data, input.answers);
  const shortOfHarbor = harbor ? Math.max(0, harbor.requiredAnnualPayment - projectedWithholding - estimated) : 0;
  return {
    ok: true,
    data: {
      taxYear,
      filingStatus: data.filingStatus,
      projectedWages: Math.round(wages),
      projectedTax,
      projectedWithholding,
      estimatedPayments: estimated,
      gap,
      extraPerPaycheck: periodsLeft > 0 ? Math.ceil(Math.max(0, gap) / periodsLeft) : null,
      safeHarbor: harbor ? { ...harbor, met: shortOfHarbor === 0 || gap < harbor.minimumUnderpayment, shortBy: shortOfHarbor, extraPerPaycheckToMeet: periodsLeft > 0 ? Math.ceil(shortOfHarbor / periodsLeft) : null } : null,
      fromReturn: base.fromReturn,
      unsupported: data.unsupported,
      rulesUsed: data.rulesUsed,
      unreviewed: data.unreviewed,
      notes: [
        'Your own W-2 wages for the year are taken as the year-to-date figures plus the same pay for each period left; the spouse\'s forms and other entries on the return stay as entered.',
        'Put extraPerPaycheck on Form W-4 line 4(c) to close the gap, or extraPerPaycheckToMeet to just avoid an underpayment penalty.',
        ...(harbor && !harbor.priorYearTaxGiven ? ['Last year\'s tax was not given, so the safe harbor uses 90% of this year\'s tax.'] : []),
      ],
    },
  };
}

function installments(taxYear) {
  const found = rules.rule('us.federal.estimated-tax.due', `${taxYear}-01-01`);
  if (!found.ok) return null;
  return {
    ruleUsed: `${found.record.id}@${found.record.effectiveFrom}`,
    dates: found.record.value.installments.map((item) => `${item.nextYear ? Number(taxYear) + 1 : taxYear}-${String(item.month).padStart(2, '0')}-${String(item.day).padStart(2, '0')}`),
  };
}

export function usEstimatedPayments(state, args = {}) {
  const taxYear = planningYear(args.taxYear);
  if (!taxYear) return { ok: false, error: 'TAX_YEAR_NOT_SUPPORTED', supported: SUPPORTED_YEARS };
  const due = installments(taxYear);
  if (!due) return { ok: false, error: 'RULE_NOT_IN_FORCE', ruleId: 'us.federal.estimated-tax.due', taxYear };
  const base = baseInput(state, taxYear, args);
  if (!base.ok) return base;
  const side = amount(args.expectedSideIncome);
  const input = structuredClone(base.input);
  if (side > 0) input.businesses = [...(input.businesses || []), { id: 'side-income', name: 'Side income (expected)', owner: 'taxpayer', source: 'estimate', grossReceipts: side, totalExpenses: 0 }];
  const paidSoFar = amount(input.answers?.estimatedTaxPayments) + amount(input.answers?.priorYearOverpaymentApplied);
  const result = computeForm1040(input, taxYear);
  if (!result.ok) return result;
  const data = result.data;
  const tax = netTax(data);
  const withholding = line(data, '25d');
  const harbor = safeHarbor(taxYear, data, input.answers || {});
  const underMinimum = !harbor || tax - withholding < harbor.minimumUnderpayment;
  const annual = underMinimum ? 0 : Math.max(0, harbor.requiredAnnualPayment - withholding);
  const remaining = Math.max(0, annual - paidSoFar);
  const today = localToday();
  const open = due.dates.filter((date) => date >= today).length;
  let left = remaining;
  let seen = 0;
  const quarters = due.dates.map((date, index) => {
    const past = date < today;
    let value = 0;
    if (!past && open) {
      seen += 1;
      value = seen === open ? left : Math.round(remaining / open);
      left -= value;
    }
    return { installment: index + 1, due: date, amount: value, past };
  });
  return {
    ok: true,
    data: {
      taxYear,
      filingStatus: data.filingStatus,
      expectedSideIncome: side,
      projectedTax: tax,
      withholding,
      requiredAnnualPayment: annual,
      paidSoFar,
      quarters,
      safeHarborBasis: underMinimum ? 'under_minimum' : harbor.basis,
      fromReturn: base.fromReturn,
      unsupported: data.unsupported,
      rulesUsed: [...data.rulesUsed, due.ruleUsed],
      unreviewed: data.unreviewed,
      notes: [
        'Side income is taken as net profit with self-employment tax; business expenses lower it.',
        underMinimum ? 'The tax left after withholding is under the minimum, so no estimated payments are needed to avoid the penalty.' : 'What is still owed is spread evenly over the instalments not yet due.',
        'Dates move to the next business day when they fall on a weekend or legal holiday; that shift is not applied here.',
        ...(harbor && !harbor.priorYearTaxGiven ? ['Last year\'s tax was not given, so the amount uses 90% of this year\'s tax; paying 100% of last year\'s tax (110% above $150,000 AGI) may be less.'] : []),
      ],
    },
  };
}

export function usPlanningWords(name, data) {
  const usd = (value) => `$${Math.round(Number(value || 0)).toLocaleString('en-US')}`;
  if (name === 'us_withholding_check') return data.gap > 0 ? `At this pace you would owe about ${usd(data.gap)} for ${data.taxYear}. ${data.extraPerPaycheck ? `Withholding an extra ${usd(data.extraPerPaycheck)} a paycheck (W-4 line 4(c)) closes it.` : ''}` : `Your withholding covers the projected ${data.taxYear} tax of ${usd(data.projectedTax)}, with about ${usd(-data.gap)} to spare.`;
  if (name === 'us_estimated_payments') return data.requiredAnnualPayment ? `Pay ${data.quarters.filter((item) => item.amount).map((item) => `${usd(item.amount)} by ${item.due}`).join(', ')} to avoid an underpayment penalty for ${data.taxYear}.` : `No estimated payments are needed for ${data.taxYear}.`;
  if (name === 'us_supported_forms') return `MyCA prepares ${data.supported.join(', ')}. Coming: ${data.coming.join(', ')}.`;
  return '';
}
