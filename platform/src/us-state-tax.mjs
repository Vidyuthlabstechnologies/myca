import { rules } from './sprint-load.mjs';
import { computeForm1040, ageAtYearEnd } from './us-1040.mjs';
import { engineInput } from './us-return.mjs';
import { usStateReturnFor } from './countries/united-states/state-returns.mjs';
import { stateModule } from './countries/united-states/states/index.mjs';

export const US_STATE_TAX_YEARS = Object.freeze(['2025', '2026']);
export const US_STATE_TAX_STATES = Object.freeze(['AZ', 'CO', 'GA', 'IA', 'IL', 'KY', 'LA', 'MI', 'NC']);

const STATE_NAMES = Object.freeze({ AK: 'Alaska', FL: 'Florida', NV: 'Nevada', NH: 'New Hampshire', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', WY: 'Wyoming', WA: 'Washington', IL: 'Illinois', MI: 'Michigan', NC: 'North Carolina', CO: 'Colorado', GA: 'Georgia', KY: 'Kentucky', LA: 'Louisiana', AZ: 'Arizona', IA: 'Iowa' });
const LEFT_OUT = Object.freeze({
  AZ: ['Arizona additions to and subtractions from federal AGI', 'The exemptions for age 65 or over, blindness and other exemptions', 'The increase in the standard deduction for charitable gifts', 'The dependent tax credit and other credits', 'Part-year and nonresident rules (Forms 140PY and 140NR)'],
  IA: ['Net Iowa modifications (Schedule 1), including the retirement income exclusion', 'The alternate tax calculation, which can lower the tax for filers other than single', 'The exemption credits and other credits', 'Iowa lump-sum tax and school district surtax', 'Part-year and nonresident rules (IA 126)'],
  CO: ['Colorado additions to and subtractions from federal taxable income', 'The state sales tax (TABOR) refund and any temporary TABOR rate cut the state declares', 'Child tax and earned income credits', 'Part-year and nonresident rules (DR 0104PN)'],
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

function fromFullReturn(state, taxYear, code) {
  const out = usStateReturnFor(state, { taxYear, state: code });
  if (!out.ok) return null;
  const item = out.data.returns[0];
  if (!item || item.status !== 'computed') return null;
  const usd = (value) => `$${whole(value).toLocaleString('en-US')}`;
  const blocking = (item.checks || []).filter((row) => row.level === 'error').map((row) => row.code);
  const balance = item.refund > 0 ? `a refund of ${usd(item.refund)}` : item.owed > 0 ? `${usd(item.owed)} to pay by ${item.due}` : 'nothing to pay or get back';
  const notes = [item.provisional ? `Some ${taxYear} figures are provisional until ${item.stateName} publishes its ${taxYear} form.` : '', item.unreviewed ? 'The rates and amounts come from dated rules a US CPA has not reviewed yet.' : '', blocking.length ? `It cannot be filed yet: ${blocking.join(', ')}.` : ''].filter(Boolean).join(' ');
  return {
    ok: true,
    data: {
      taxYear,
      state: code,
      stateName: item.stateName,
      kind: 'return',
      returnNeeded: true,
      form: item.form,
      residency: item.residency,
      taxableIncome: item.taxableIncome,
      tax: item.totalTax,
      withheld: item.payments.withheld,
      refund: item.refund,
      owed: item.owed,
      due: item.due,
      blocking,
      why: `From the full state return, Form ${item.form} (${item.residency}): ${item.stateName} tax for ${taxYear} is ${usd(item.totalTax)}, with ${balance}.${notes ? ` ${notes}` : ''} Use us_state_returns for every line.`,
      rulesUsed: item.rulesUsed,
      unreviewed: item.unreviewed,
      provisional: item.provisional,
    },
  };
}

export function usStateTax(state, args = {}) {
  const taxYear = String(args.taxYear || '').trim() || [...US_STATE_TAX_YEARS].reverse().find((year) => state.usReturns?.[year]?.filingStatus) || US_STATE_TAX_YEARS.at(-1);
  const ret = state.usReturns?.[taxYear];
  const code = String(args.state || ret?.address?.state || '').trim().toUpperCase();
  if (US_STATE_TAX_YEARS.includes(taxYear) && ret?.filingStatus && stateModule(code)?.built) {
    const full = fromFullReturn(state, taxYear, code);
    if (full) return full;
  }
  return usStateEstimate(state, args);
}

export function usStateEstimate(state, args = {}) {
  const taxYear = String(args.taxYear || '').trim() || [...US_STATE_TAX_YEARS].reverse().find((year) => state.usReturns?.[year]?.filingStatus) || US_STATE_TAX_YEARS.at(-1);
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
  if (!found.ok) return { ok: false, error: 'STATE_YEAR_NOT_SUPPORTED_YET', state: code, taxYear, rule: `us.state.individual.${code}`, hint: `MyCA has no ${name} figures for ${taxYear} yet.` };
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
      provisional: rule.provisional === true,
    },
  };
}

export function usStateTaxWords(data) {
  const usd = (value) => `$${whole(value).toLocaleString('en-US')}`;
  if (data.kind !== 'estimate') return data.why;
  const parts = [data.standardDeduction ? `the ${usd(data.standardDeduction)} standard deduction` : '', data.exemption ? `${usd(data.exemption)} of exemptions` : ''].filter(Boolean);
  const basis = `${usd(data.startAmount)} of ${data.start}${parts.length ? ` less ${parts.join(' and ')}` : ''}`;
  const balance = data.withheld > 0 ? (data.refund > 0 ? ` Your W-2s show ${usd(data.withheld)} withheld for ${data.stateName}, so about ${usd(data.refund)} would come back.` : ` Your W-2s show ${usd(data.withheld)} withheld for ${data.stateName}, so about ${usd(data.owed)} would be due.`) : '';
  return `${data.stateName} income tax for ${data.taxYear} is about ${usd(data.tax)}: ${basis}, at ${data.ratePercent}%.${balance}\nNot counted, and each can lower it: ${data.leftOut.join('; ')}.\nThis is an estimate; MyCA does not file Form ${data.form} yet.${data.provisional ? ` The ${data.taxYear} figures were announced before ${data.stateName} published its ${data.taxYear} return, so check again when you file.` : ''}${data.unreviewed ? ' The rate and amounts come from dated rules a US CPA has not reviewed yet.' : ''}`;
}
