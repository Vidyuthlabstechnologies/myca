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
  {
    id: 'us.state.individual.CO',
    value: { form: 'DR 0104', start: 'federal_taxable_income', rateBasisPoints: 440, exemptionCents: 0, seniorOrBlindExtraCents: 0, exemptionAgiLimitCents: null, standardDeductionCents: null },
    basis: 'flat_rate_on_federal_taxable_income_before_colorado_additions_and_subtractions',
    ...year(2025),
    act: 'Colo. Rev. Stat.',
    section: '39-22-104',
    source: `Colorado Department of Revenue, 2025 Colorado Individual Income Tax Filing Guide, Book 104 (tax.colorado.gov/sites/default/files/documents/Book104_2025.pdf): line 1 "Enter your federal taxable income from your federal income tax form 1040 ... line 15"; line 13 "The income tax rate is currently 4.4%" (${READ}; the statute section is cited from memory of the statute layout)`,
    attestations: []
  },
  {
    id: 'us.state.individual.GA',
    value: { form: '500', start: 'federal_agi', rateBasisPoints: 519, exemptionCents: 0, dependentExemptionCents: 4000 * D, seniorOrBlindExtraCents: 0, exemptionAgiLimitCents: null, standardDeductionCents: { single: 12000 * D, mfj: 24000 * D, mfs: 12000 * D, hoh: 12000 * D, qss: 12000 * D } },
    basis: 'flat_rate_on_federal_agi_less_the_georgia_standard_deduction_by_filing_status_and_an_exemption_for_each_dependent',
    ...year(2025),
    act: 'O.C.G.A.',
    section: '48-7-20; 48-7-26; 48-7-27',
    source: `Georgia Department of Revenue, 2025 IT-511 Individual Income Tax Booklet (dor.georgia.gov/document/document/2025-it-511-individual-income-tax-booklet/download): "Effective January 1, 2025, the income tax rate is 5.19%"; standard deduction $24,000 married filing jointly and $12,000 for every other status; line 14 "Multiply the number of dependents on Line 7c by $4,000"; line 8 starts from federal adjusted gross income (${READ}; the code sections are cited from memory of the statute layout)`,
    attestations: []
  },
  {
    id: 'us.state.individual.KY',
    value: { form: '740', start: 'federal_agi', rateBasisPoints: 400, exemptionCents: 0, seniorOrBlindExtraCents: 0, exemptionAgiLimitCents: null, standardDeductionCents: { single: 3270 * D, mfj: 3270 * D, mfs: 3270 * D, hoh: 3270 * D, qss: 3270 * D } },
    basis: 'flat_rate_on_federal_agi_less_one_kentucky_standard_deduction_per_return',
    ...year(2025),
    act: 'Ky. Rev. Stat.',
    section: '141.020; 141.081',
    source: `Kentucky Department of Revenue, 2025 Form 740 packet instructions (revenue.ky.gov/Forms/740%20Packet%20Instructions.pdf): "For 2025, the tax rate for individual income tax is 4%"; "For 2025, the standard deduction is $3,270"; "If filing a joint return, only one $3,270 standard deduction is allowed"; the return begins with federal adjusted gross income (${READ})`,
    attestations: []
  },
  {
    id: 'us.state.individual.LA',
    value: { form: 'IT-540', start: 'federal_agi', rateBasisPoints: 300, exemptionCents: 0, seniorOrBlindExtraCents: 0, exemptionAgiLimitCents: null, standardDeductionCents: { single: 12500 * D, mfj: 25000 * D, mfs: 12500 * D, hoh: 25000 * D, qss: 25000 * D } },
    basis: 'flat_rate_on_federal_agi_less_the_louisiana_standard_deduction_by_filing_status',
    ...year(2025),
    act: 'La. Rev. Stat.',
    section: '47:32; 47:294',
    source: `Louisiana Department of Revenue, income tax reform questions (revenue.louisiana.gov/tax-education-and-faqs/faqs/income-tax-reform): "For taxable periods beginning on or after January 1, 2025, the individual income tax rate is a flat 3%"; standard deduction $12,500 for single and married filing separately and 200% of that for married filing jointly, qualifying surviving spouse and head of household (${READ}; that the return starts from federal adjusted gross income is from the IT-540 layout and was not re-read; the statute sections are cited from memory of the statute layout)`,
    attestations: []
  },
  {
    id: 'us.state.individual.no-wage-income-tax',
    value: { states: ['AK', 'FL', 'NV', 'NH', 'SD', 'TN', 'TX', 'WY'], capitalGainsOnly: ['WA'] },
    basis: 'states_that_levy_no_individual_income_tax_and_states_that_tax_only_capital_gains_of_high_earners',
    ...year(2026),
    act: 'State revenue codes',
    section: 'none levied',
    source: 'Tax Foundation, State Individual Income Tax Rates and Brackets 2026 (taxfoundation.org/data/all/state/state-income-tax-rates-2026): eight states, including New Hampshire, levy no individual income tax (Alaska, Florida, Nevada, New Hampshire, South Dakota, Tennessee, Texas, Wyoming) and "Washington taxes capital gains income only" (a secondary summary, not each state code; read on 2026-11-15; the 2026 return and its instructions are not published yet, so the form lines are assumed unchanged from 2025)',
    attestations: []
  },
  {
    id: 'us.state.individual.IL',
    value: { provisional: true, form: 'IL-1040', start: 'federal_agi', rateBasisPoints: 495, exemptionCents: 2925 * D, seniorOrBlindExtraCents: 1000 * D, exemptionAgiLimitCents: { joint: 500000 * D, other: 250000 * D }, standardDeductionCents: null },
    basis: 'flat_rate_on_federal_agi_less_an_exemption_per_person_with_an_extra_amount_at_65_or_blind_and_no_exemption_above_the_federal_agi_limit',
    ...year(2026),
    act: 'Illinois Income Tax Act (35 ILCS 5)',
    section: '201(b)(5.4); 204',
    source: 'Illinois Department of Revenue, Informational Bulletin FY 2026-15, What\'s New for Illinois Income Taxes (tax.illinois.gov/research/publications/bulletins/fy-2026-15.html): "The personal exemption amount for tax year 2026 will increase to $2,925"; the 4.95% rate, the $1,000 at 65 or blind and the $250,000 and $500,000 federal AGI limits are carried from the 2025 record, no change announced (read on 2026-11-15; the 2026 return and its instructions are not published yet, so the form lines are assumed unchanged from 2025)',
    attestations: []
  },
  {
    id: 'us.state.individual.MI',
    value: { provisional: true, form: 'MI-1040', start: 'federal_agi', rateBasisPoints: 425, exemptionCents: 5900 * D, seniorOrBlindExtraCents: 0, exemptionAgiLimitCents: null, standardDeductionCents: null },
    basis: 'flat_rate_on_federal_agi_less_a_personal_exemption_for_each_person_on_the_return',
    ...year(2026),
    act: 'Michigan Income Tax Act (1967 PA 281)',
    section: '30; 51',
    source: 'Michigan Department of Treasury, Calendar Year Tax Information (michigan.gov/taxes/business-taxes/withholding/calendar-year-tax-information), 2026 row: "Withholding Rate: 4.25% Personal Exemption: $5,900" (a withholding page; the 2026 MI-1040 is not published; read on 2026-11-15; the 2026 return and its instructions are not published yet, so the form lines are assumed unchanged from 2025)',
    attestations: []
  },
  {
    id: 'us.state.individual.NC',
    value: { provisional: true, form: 'D-400', start: 'federal_agi', rateBasisPoints: 399, exemptionCents: 0, seniorOrBlindExtraCents: 0, exemptionAgiLimitCents: null, standardDeductionCents: { single: 12750 * D, mfj: 25500 * D, mfs: 12750 * D, hoh: 19125 * D, qss: 25500 * D } },
    basis: 'flat_rate_on_federal_agi_less_the_north_carolina_standard_deduction_by_filing_status_married_separate_amount_assumes_the_spouse_does_not_itemize',
    ...year(2026),
    act: 'N.C. Gen. Stat.',
    section: '105-153.7; 105-153.5',
    source: 'North Carolina Department of Revenue staff presentation, Individual Income and Pass-Through Entity Update, November 2025 (ncacpa.org/wp-content/uploads/2025/11/8D_Donna-Powell-William-Young_FINAL_-Individual-Income-and-PTE-Update-Session-Presentation-Final2.pdf): "For tax year 2026, the individual income tax rate is 3.99%"; standard deduction $25,500 married filing jointly or surviving spouse, $19,125 head of household, $12,750 single or married filing separately (the slide gives the amounts without a year; read on 2026-11-15; the 2026 return and its instructions are not published yet, so the form lines are assumed unchanged from 2025)',
    attestations: []
  },
  {
    id: 'us.state.individual.CO',
    value: { provisional: true, form: 'DR 0104', start: 'federal_taxable_income', rateBasisPoints: 440, exemptionCents: 0, seniorOrBlindExtraCents: 0, exemptionAgiLimitCents: null, standardDeductionCents: null },
    basis: 'flat_rate_on_federal_taxable_income_before_colorado_additions_and_subtractions',
    ...year(2026),
    act: 'Colo. Rev. Stat.',
    section: '39-22-104',
    source: 'Tax Foundation, State Individual Income Tax Rates and Brackets 2026 (taxfoundation.org/data/all/state/state-income-tax-rates-2026): Colorado flat 4.40% as of 1 January 2026, starting from federal taxable income; a temporary TABOR rate reduction for 2026, if the state declares one, is not reflected (a secondary summary; the Colorado Department of Revenue page for 2026 was not found; read on 2026-11-15; the 2026 return and its instructions are not published yet, so the form lines are assumed unchanged from 2025)',
    attestations: []
  },
  {
    id: 'us.state.individual.GA',
    value: { provisional: true, form: '500', start: 'federal_agi', rateBasisPoints: 499, exemptionCents: 0, dependentExemptionCents: 5000 * D, seniorOrBlindExtraCents: 0, exemptionAgiLimitCents: null, standardDeductionCents: { single: 15000 * D, mfj: 30000 * D, mfs: 15000 * D, hoh: 15000 * D, qss: 15000 * D } },
    basis: 'flat_rate_on_federal_agi_less_the_georgia_standard_deduction_by_filing_status_and_an_exemption_for_each_dependent',
    ...year(2026),
    act: 'O.C.G.A.',
    section: '48-7-20; 48-7-26; 48-7-27',
    source: 'Employees\' Retirement System of Georgia, Georgia Income Tax Rate Changes (ers.ga.gov/node/1589), on House Bill 463 of 2026: "The Georgia income tax rate has been reduced from 5.19% to 4.99%", standard deduction $30,000 married filing jointly and $15,000 for single, head of household and married filing separately, "The dependent deduction has raised from $4,000 to $5,000"; EY Tax News 2026-1294 on the Department of Revenue\'s revised Employer\'s Withholding Tax Guide (June 2026): effective retroactive to 1 January 2026 (the Department of Revenue guide itself was not read; a qualifying surviving spouse is given the $15,000 amount as in 2025; read on 2026-11-15; the 2026 return and its instructions are not published yet, so the form lines are assumed unchanged from 2025)',
    attestations: []
  },
  {
    id: 'us.state.individual.KY',
    value: { provisional: true, form: '740', start: 'federal_agi', rateBasisPoints: 350, exemptionCents: 0, seniorOrBlindExtraCents: 0, exemptionAgiLimitCents: null, standardDeductionCents: { single: 3360 * D, mfj: 3360 * D, mfs: 3360 * D, hoh: 3360 * D, qss: 3360 * D } },
    basis: 'flat_rate_on_federal_agi_less_one_kentucky_standard_deduction_per_return',
    ...year(2026),
    act: 'Ky. Rev. Stat.',
    section: '141.020; 141.081',
    source: 'Kentucky Department of Revenue, 2026 Withholding Tax Formula (revenue.ky.gov/Forms/2026%20Withholding%20Formula.pdf): "2026 Kentucky Tax Rate: 3.5% of taxable income" and "2026 Kentucky Standard Deduction: $3,360"; news release of 4 September 2025: "the standard deduction for 2026 is $3,360, an increase of $90" (revenue.ky.gov/News/Pages/Kentucky-DOR-Announces-2026-Standard-Deduction.aspx) (read on 2026-11-15; the 2026 return and its instructions are not published yet, so the form lines are assumed unchanged from 2025)',
    attestations: []
  },
  {
    id: 'us.state.individual.LA',
    value: { provisional: true, form: 'IT-540', start: 'federal_agi', rateBasisPoints: 300, exemptionCents: 0, seniorOrBlindExtraCents: 0, exemptionAgiLimitCents: null, standardDeductionCents: { single: 12875 * D, mfj: 25750 * D, mfs: 12875 * D, hoh: 25750 * D, qss: 25750 * D } },
    basis: 'flat_rate_on_federal_agi_less_the_louisiana_standard_deduction_by_filing_status',
    ...year(2026),
    act: 'La. Rev. Stat.',
    section: '47:32; 47:294',
    source: 'Louisiana Department of Revenue, Revenue Information Bulletin 26-005, Updated Withholding Tables (dam.ldr.la.gov/lawspolicies/RIB 26-005-Updated Withholding Tables.pdf): "a standard deduction of $12,875 was used for single and married-filing-separately taxpayers" and "$25,750 for married-filing-jointly, qualifying surviving spouse, and head-of-household taxpayers", with the warning that "The official 2026 standard deduction amounts may be slightly different"; Tax Foundation 2026 table shows the same amounts and the flat 3.00% rate (read on 2026-11-15; the 2026 return and its instructions are not published yet, so the form lines are assumed unchanged from 2025)',
    attestations: []
  },
];
