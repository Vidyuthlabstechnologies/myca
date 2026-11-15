import { rules } from './sprint-load.mjs';
import { computeForm1040, ageAtYearEnd } from './us-1040.mjs';
import { engineInput } from './us-return.mjs';
import { localToday } from './dates.mjs';

export const US_STATE_TAX_YEARS = Object.freeze(['2025']);
export const US_STATE_TAX_STATES = Object.freeze(['CO', 'GA', 'IL', 'KY', 'LA', 'MI', 'NC']);

const STATE_NAMES = Object.freeze({ AK: 'Alaska', FL: 'Florida', NV: 'Nevada', NH: 'New Hampshire', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', WY: 'Wyoming', WA: 'Washington', IL: 'Illinois', MI: 'Michigan', NC: 'North Carolina', CO: 'Colorado', GA: 'Georgia', KY: 'Kentucky', LA: 'Louisiana' });
const LEFT_OUT = Object.freeze({
  CO: ['Colorado additions to and subtractions from federal taxable income', 'The state sales tax (TABOR) refund, child tax and earned income credits', 'Part-year and nonresident rules (DR 0104PN)'],
  GA: ['Georgia adjustments to federal AGI, including the retirement income exclusion', 'Georgia itemized deductions', 'Low income and other credits', 'Part-year and nonresident rules (Schedule 3)'],
  KY: ['Kentucky additions and subtractions (Schedule M), including the pension exclusion', 'Kentucky itemized deductions and the family size tax credit', 'A second standard deduction when spouses file separately on a combined return', 'Local occupational taxes', 'Part-year and nonresident rules (Form 740-NP)'],
  LA: ['Louisiana additions and subtractions, including retirement and Social Security exclusions', 'Louisiana credits', 'Part-year and nonresident rules (IT-540B)'],
  IL: ['Subtractions for retirement income and Social Security', 'Illinois additions to income', 'Property tax, K-12 education, earned income and child tax credits', 'Part-year and nonresident rules (Schedule NR)'],
  MI: ['Retirement and pension subtraction and other Schedule 1 subtractions', 'City income taxes', 'Homestead property tax, home heating and earned income credits', 'Part-year and nonresident rules (Schedule NR)'],
  NC: ['The child deduction', 'North Carolina additions and other deductions from federal AGI, including Social Security benefits', 'North Carolina itemized deductions', 'Part-year and nonresident rules (D-400 Schedule PN)'],
});
const dollars = (cents) => Math.round(Number(cents || 0) / 100);
const whole = (value) => (Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0);

function people(input, taxYear) {
  const joint = input.filingStatus === 'mfj';
  const list = [input.taxpayer || {}, ...(joint && input.spouse ? [input.spouse] : [])];
  const extra = list.filter((person) => Boolean(person.blind) || (ageAtYearEnd(person.dateOfBirth, taxYear) ?? 0) >= 65).length;
  return { filers: list.length, dependents: (input.dependents || []).length, extra };
}

function withheldFor(input, code) {
  return (input.forms || []).filter((form) => form.kind === 'W-2' && String(form.fields?.state || '').toUpperCase() === code).reduce((total, form) => total + whole(form.fields?.stateWithheld), 0);
}

export function usStateTax(state, args = {}) {
  const taxYear = String(args.taxYear || '').trim() || localToday().slice(0, 4);
  if (!US_STATE_TAX_YEARS.includes(taxYear)) return { ok: false, error: 'TAX_YEAR_NOT_SUPPORTED', supported: US_STATE_TAX_YEARS };
  const ret = state.usReturns?.[taxYear];
  if (!ret || !ret.filingStatus) return { ok: false, error: 'US_RETURN_NOT_STARTED', taxYear, hint: `Start the ${taxYear} federal return first; the state figure starts from it.` };
  const code = String(args.state || ret.address?.state || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return { ok: false, error: 'STATE_REQUIRED', hint: 'Give the two-letter state you lived in, or add your address to the return.' };
  const onDate = `${taxYear}-12-31`;
  const none = rules.rule('us.state.individual.no-wage-income-tax', onDate);
  if (!none.ok) return { ok: false, error: 'RULE_NOT_FOUND', rule: 'us.state.individual.no-wage-income-tax' };
  const name = STATE_NAMES[code] || code;
  const noneUnreviewed = (none.record.attestations || []).length === 0;
  if (none.value.states.includes(code)) {
    return { ok: true, data: { taxYear, state: code, stateName: name, kind: 'no-income-tax', returnNeeded: false, tax: 0, why: `${name} levies no individual income tax, so there is no state income tax return for ${taxYear}.`, rulesUsed: [none.record.id], unreviewed: noneUnreviewed } };
  }
  if (none.value.capitalGainsOnly.includes(code)) {
    return { ok: true, data: { taxYear, state: code, stateName: name, kind: 'capital-gains-only', returnNeeded: null, tax: null, why: `${name} does not tax wages or business income. It taxes only large long-term capital gains, and MyCA does not work that out yet.`, rulesUsed: [none.record.id], unreviewed: noneUnreviewed } };
  }
  if (!US_STATE_TAX_STATES.includes(code)) return { ok: false, error: 'STATE_NOT_SUPPORTED_YET', state: code, supported: [...US_STATE_TAX_STATES, ...none.value.states], hint: `MyCA does not work out ${name} income tax yet.` };
  const found = rules.rule(`us.state.individual.${code}`, onDate);
  if (!found.ok) return { ok: false, error: 'RULE_NOT_FOUND', rule: `us.state.individual.${code}` };
  const rule = found.value;
  const input = engineInput(state, ret);
  const federal = computeForm1040(input, taxYear);
  if (!federal.ok) return federal;
  const agi = whole(federal.data.summary.agi);
  const fromTaxable = rule.start === 'federal_taxable_income';
  const startAmount = fromTaxable ? whole(federal.data.summary.taxableIncome) : agi;
  const count = people(input, taxYear);
  const limit = rule.exemptionAgiLimitCents ? dollars(input.filingStatus === 'mfj' ? rule.exemptionAgiLimitCents.joint : rule.exemptionAgiLimitCents.other) : null;
  const exemptionsAllowed = limit === null || agi <= limit;
  const exemption = exemptionsAllowed ? (count.filers + count.dependents) * dollars(rule.exemptionCents) + count.dependents * dollars(rule.dependentExemptionCents) + count.extra * dollars(rule.seniorOrBlindExtraCents) : 0;
  const standardDeduction = rule.standardDeductionCents ? dollars(rule.standardDeductionCents[input.filingStatus]) : 0;
  const taxable = Math.max(0, startAmount - exemption - standardDeduction);
  const tax = Math.round((taxable * rule.rateBasisPoints) / 10000);
  const withheld = withheldFor(input, code);
  return {
    ok: true,
    data: {
      taxYear,
      state: code,
      stateName: name,
      kind: 'estimate',
      returnNeeded: true,
      form: rule.form,
      federalAgi: agi,
      start: fromTaxable ? 'federal taxable income' : 'federal AGI',
      startAmount,
      exemption,
      exemptionsCounted: exemptionsAllowed ? count.filers + count.dependents : 0,
      standardDeduction,
      taxableIncome: taxable,
      ratePercent: rule.rateBasisPoints / 100,
      tax,
      withheld,
      refund: Math.max(0, withheld - tax),
      owed: Math.max(0, tax - withheld),
      leftOut: LEFT_OUT[code],
      why: `An estimate for a full-year ${name} resident: ${fromTaxable ? 'federal taxable income' : `federal adjusted gross income, less the ${[standardDeduction ? 'state standard deduction' : '', exemption ? 'state exemptions' : ''].filter(Boolean).join(' and ') || 'state deductions (none apply)'}`}, at ${rule.rateBasisPoints / 100}%. MyCA does not prepare or file Form ${rule.form} yet.`,
      rulesUsed: [found.record.id],
      unreviewed: (found.record.attestations || []).length === 0,
    },
  };
}

export function usStateTaxWords(data) {
  const usd = (value) => `$${whole(value).toLocaleString('en-US')}`;
  if (data.kind !== 'estimate') return data.why;
  const parts = [data.standardDeduction ? `the ${usd(data.standardDeduction)} standard deduction` : '', data.exemption ? `${usd(data.exemption)} of exemptions` : ''].filter(Boolean);
  const basis = `${usd(data.startAmount)} of ${data.start}${parts.length ? ` less ${parts.join(' and ')}` : ''}`;
  const balance = data.withheld > 0 ? (data.refund > 0 ? ` Your W-2s show ${usd(data.withheld)} withheld for ${data.stateName}, so about ${usd(data.refund)} would come back.` : ` Your W-2s show ${usd(data.withheld)} withheld for ${data.stateName}, so about ${usd(data.owed)} would be due.`) : '';
  return `${data.stateName} income tax for ${data.taxYear} is about ${usd(data.tax)}: ${basis}, at ${data.ratePercent}%.${balance}\nNot counted, and each can lower it: ${data.leftOut.join('; ')}.\nThis is an estimate; MyCA does not file Form ${data.form} yet.${data.unreviewed ? ' The rate and amounts come from dated rules a US CPA has not reviewed yet.' : ''}`;
}
