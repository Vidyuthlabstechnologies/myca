const D = 100;
const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const READ = 'read on the agency page on 2026-11-15; the statute text and the full form instructions not re-read for this record';

export const RULES = [
  {
    id: 'us.state.individual.no-wage-income-tax',
    value: { states: ['AK', 'FL', 'NV', 'NH', 'SD', 'TN', 'TX', 'WY'], capitalGainsOnly: ['WA'] },
    basis: 'states_that_levy_no_individual_income_tax_and_states_that_tax_only_capital_gains_of_high_earners',
    ...year(2025),
    act: 'State revenue codes',
    section: 'none levied',
    source: `Tax Foundation, State Individual Income Tax Rates and Brackets 2025, taxfoundation.org/data/all/state/state-income-tax-rates: "Eight states, including New Hampshire, which repealed its interest and dividends tax in 2025, levy no individual income tax" and "Washington only taxes capital gains income" (a secondary summary, ${READ})`,
    attestations: []
  },
  {
    id: 'us.state.individual.IL',
    value: { form: 'IL-1040', start: 'federal_agi', rateBasisPoints: 495, exemptionCents: 2850 * D, seniorOrBlindExtraCents: 1000 * D, exemptionAgiLimitCents: { joint: 500000 * D, other: 250000 * D }, standardDeductionCents: null },
    basis: 'flat_rate_on_federal_agi_less_an_exemption_per_person_with_an_extra_amount_at_65_or_blind_and_no_exemption_above_the_federal_agi_limit',
    ...year(2025),
    act: 'Illinois Income Tax Act (35 ILCS 5)',
    section: '201(b)(5.4); 204',
    source: `Illinois Department of Revenue, What's New for 2025 (tax.illinois.gov/forms/incometax/currentyear/individual/il-1040-instr/what-is-new.html): rate 4.95 percent, personal exemption $2,850; question 851 (tax.illinois.gov/questionsandanswers/answer.851.html): $1,000 more at 65 or legally blind, none above federal AGI of $250,000 or $500,000 on a joint return (${READ}; the act sections are cited from memory of the statute layout)`,
    attestations: []
  },
  {
    id: 'us.state.individual.MI',
    value: { form: 'MI-1040', start: 'federal_agi', rateBasisPoints: 425, exemptionCents: 5800 * D, seniorOrBlindExtraCents: 0, exemptionAgiLimitCents: null, standardDeductionCents: null },
    basis: 'flat_rate_on_federal_agi_less_a_personal_exemption_for_each_person_on_the_return',
    ...year(2025),
    act: 'Michigan Income Tax Act (1967 PA 281)',
    section: '30; 51',
    source: `Michigan Department of Treasury, Tax Year 2025 Information (michigan.gov/taxes/iit/tax-guidance/tax-year-info/tax-year-2025-guidance): tax rate 4.25%, personal exemption amount $5,800 (${READ}; the act sections are cited from memory of the statute layout)`,
    attestations: []
  },
  {
    id: 'us.state.individual.NC',
    value: { form: 'D-400', start: 'federal_agi', rateBasisPoints: 425, exemptionCents: 0, seniorOrBlindExtraCents: 0, exemptionAgiLimitCents: null, standardDeductionCents: { single: 12750 * D, mfj: 25500 * D, mfs: 12750 * D, hoh: 19125 * D, qss: 25500 * D } },
    basis: 'flat_rate_on_federal_agi_less_the_north_carolina_standard_deduction_by_filing_status_married_separate_amount_assumes_the_spouse_does_not_itemize',
    ...year(2025),
    act: 'N.C. Gen. Stat.',
    section: '105-153.7; 105-153.5',
    source: `North Carolina Department of Revenue, Tax Rate Schedules (ncdor.gov/taxes-forms/individual-income-tax/tax-rate-schedules): "For Taxable Years beginning in 2025, the North Carolina individual income tax rate is 4.25%"; North Carolina Standard Deduction or North Carolina Itemized Deductions page: $12,750 single, $25,500 married filing jointly or surviving spouse, $19,125 head of household for tax year 2025 (${READ})`,
    attestations: []
  },
];
