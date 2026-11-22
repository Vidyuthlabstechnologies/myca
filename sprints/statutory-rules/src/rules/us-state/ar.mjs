const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const DFA = 'https://www.dfa.arkansas.gov/wp-content/uploads';
const INSTR_2025 = `Arkansas Department of Finance and Administration, 2025 AR1000F and AR1000NR Instructions (${DFA}/2025_AR1000F_and_AR1000NR_Instructions.pdf), read 2026-11-21`;
const BRACKETS_2025 = `Arkansas DFA, 2025 Indexed Tax Brackets (${DFA}/2025_TaxBrackets.pdf) and 2025 Tax Tables (${DFA}/2025_TaxTables.pdf), read 2026-11-21`;
const ACT_2026 = 'Act 1 of the 2026 First Extraordinary Session (House Bill 1001, approved 5/6/26), amending Ark. Code 26-51-201(a)(4) (arkleg.state.ar.us/ACTS/2026S1/Public/ACT1.pdf), read 2026-11-21';
const UNPUBLISHED_2026 = 'Arkansas DFA has not published the 2026 indexed tax brackets, tax tables, low income tables, standard deduction, personal tax credit or AR1000F instructions as of 2026-11-21 (the Withholding Tax Formula effective 01/01/2026 on dfa.arkansas.gov, read 2026-11-21, predates Act 1 and still shows 3.9% and a $2,470 standard deduction); Ark. Code 26-51-201(d) requires the tables to be adjusted annually for inflation, so the 2025 indexed amounts are carried and the record is provisional';

const regular2025 = [
  { from: 0, rateBp: 0, minusCents: 0 },
  { from: 5600, rateBp: 200, minusCents: 11198 },
  { from: 11200, rateBp: 300, minusCents: 22397 },
  { from: 16000, rateBp: 340, minusCents: 28797 },
  { from: 26400, rateBp: 390, minusCents: 41996 },
  ...Array.from({ length: 32 }, (_, i) => ({ from: 94701 + 100 * i, rateBp: 390, minusCents: 39930 - 1000 * i }))
];
const regular2026 = [
  { from: 0, rateBp: 0, minusCents: 0 },
  { from: 5600, rateBp: 200, minusCents: 11198 },
  { from: 11200, rateBp: 300, minusCents: 22397 },
  { from: 16000, rateBp: 340, minusCents: 28797 },
  { from: 26400, rateBp: 370, minusCents: 36716 },
  ...Array.from({ length: 30 }, (_, i) => ({ from: 94701 + 100 * i, rateBp: 370, minusCents: 36990 - 1000 * i }))
];

const lowIncome = {
  single: { zeroThrough: 14643, firstRowTo: 14700, max: 17500, taxes: [29, 33, 40, 47, 54, 61, 68, 75, 82, 89, 96, 103, 110, 117, 124, 131, 138, 145, 152, 159, 166, 173, 180, 187, 194, 201, 208, 215, 222] },
  hohUpToOneDependent: { zeroThrough: 20820, firstRowTo: 20900, max: 25300, taxes: [67, 77, 86, 95, 105, 114, 124, 133, 142, 152, 161, 171, 180, 189, 199, 208, 218, 227, 236, 246, 255, 265, 274, 283, 293, 302, 312, 321, 330, 340, 349, 359, 368, 377, 387, 396, 406, 415, 424, 434, 443, 453, 462, 471, 481] },
  hohTwoOrMoreDependents: { zeroThrough: 24818, firstRowTo: 24900, max: 29000, taxes: [94, 107, 119, 132, 144, 156, 169, 181, 194, 206, 218, 231, 243, 256, 268, 280, 293, 305, 318, 330, 342, 355, 367, 380, 392, 404, 417, 429, 442, 454, 466, 479, 491, 504, 516, 528, 541, 553, 566, 578, 590, 603] },
  mfjUpToOneDependent: { zeroThrough: 24695, firstRowTo: 24700, max: 29000, taxes: [77, 87, 98, 108, 118, 129, 139, 150, 160, 170, 181, 191, 202, 212, 222, 233, 243, 254, 264, 274, 285, 295, 306, 316, 326, 337, 347, 358, 368, 378, 389, 399, 410, 420, 430, 441, 451, 462, 472, 482, 493, 503, 514, 524] },
  mfjTwoOrMoreDependents: { zeroThrough: 29722, firstRowTo: 29800, max: 36100, taxes: [111, 122, 132, 143, 153, 163, 174, 184, 195, 205, 215, 226, 236, 247, 257, 267, 278, 289, 300, 311, 322, 333, 343, 354, 365, 376, 387, 398, 409, 420, 431, 442, 452, 463, 474, 485, 496, 507, 518, 529, 540, 551, 561, 572, 583, 594, 605, 616, 627, 638, 649, 660, 670, 681, 692, 703, 714, 725, 736, 747, 758, 769, 779, 790] }
};

const careDecimals = [{ upTo: 15000, bp: 3500 }, ...Array.from({ length: 14 }, (_, i) => ({ upTo: 17000 + 2000 * i, bp: 3400 - 100 * i }))];

export const RULES = [
  {
    id: 'us.state-return.ar.income-tax',
    value: { bands: regular2025, rowWidth: 100, shiftedRowsFrom: 75001, tableMax: 100000, over: { above: 100000, base: 3809, rateBp: 390 } },
    basis: 'arkansas_regular_tax_table_tax_at_row_midpoint_times_rate_less_minus_adjustment_rows_of_100_from_75001_shifted_by_one_dollar_above_100000_base_plus_rate_on_excess',
    ...year(2025),
    act: 'Arkansas Income Tax Act of 1929, as amended by Act 1 of the 2024 Second Extraordinary Session',
    section: 'Ark. Code 26-51-201(a)(3), (d)',
    source: `${BRACKETS_2025}: 2025 Indexed Tax Brackets $0-$5,599 0.00%, $5,600-$11,199 2.00% minus $111.98, $11,200-$15,999 3.00% minus $223.97, $16,000-$26,399 3.40% minus $287.97, $26,400-$94,700 3.90% minus $419.96, $94,701-$94,800 minus $399.30 decreasing $10 per $100 to $97,701-$97,800 minus $99.30, $97,801 and over minus $89.30; "For $100,001 and over, $3,809 + 3.9% of the excess over $100,000"; "The calculations in the table are made at the midpoint of each income level"`,
    attestations: []
  },
  {
    id: 'us.state-return.ar.income-tax',
    value: { bands: regular2026, rowWidth: 100, shiftedRowsFrom: 75001, tableMax: 100000, over: { above: 100000, base: 3618, rateBp: 370 }, provisional: true },
    basis: 'arkansas_regular_tax_table_top_rate_3_7_percent_from_2026_bracket_limits_and_table_layout_carried_from_2025_until_indexed',
    ...year(2026),
    act: 'Act 1 of the 2026 First Extraordinary Session (House Bill 1001)',
    section: 'Ark. Code 26-51-201(a)(4), (a)(5), (d)',
    source: `${ACT_2026}: (A) $0-$5,599 0%, $5,600-$11,199 2%, $11,200-$15,999 3%, $16,000-$26,399 3.4%, $26,400-$94,700 3.7%; (B) above $94,700 2% to $4,700 and 3.7% above; (C) bracket adjustment $290 at $94,701-$94,800 decreasing $10 per $100 to $10 at $97,501-$97,600 and $0 from $97,601. Minus adjustments derived from those tables ($367.16 for the 3.7% bracket, $79.90 plus the bracket adjustment above $94,700, base $3,618 at $100,000); ${UNPUBLISHED_2026}`,
    attestations: []
  },
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ar.standard-deduction',
    value: { single: 2470, mfj: 4940, hoh: 2470, mfs: 2470, qss: 2470, ...(y === 2026 ? { provisional: true } : {}) },
    basis: 'arkansas_standard_deduction_by_filing_status_inflation_indexed',
    ...year(y),
    act: 'Arkansas Income Tax Act of 1929',
    section: 'Ark. Code Title 26, Chapter 51 (standard deduction, indexed under 26-51-201(d))',
    source: y === 2025 ? `${INSTR_2025}: Standard Deduction single $2,470, married filing joint $4,940, head of household $2,470, married filing separately $2,470 each, surviving spouse $2,470` : UNPUBLISHED_2026,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ar.personal-credit',
    value: { perCredit: 29, ...(y === 2026 ? { provisional: true } : {}) },
    basis: 'arkansas_personal_tax_credit_per_filer_head_of_household_65_or_older_65_special_blind_deaf_and_dependent',
    ...year(y),
    act: 'Arkansas Income Tax Act of 1929',
    section: 'Ark. Code Title 26, Chapter 51 (personal tax credits)',
    source: y === 2025 ? `${INSTR_2025}: line 7A "Multiply the number by $29", additional credits for head of household or surviving spouse, age 65 or over on January 1, 2026, deaf, blind, and "Any taxpayer age 65 or over not claiming a retirement income exemption on line 18 is eligible for an additional $29"; line 7B dependents times $29` : UNPUBLISHED_2026,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ar.low-income-tables',
    value: { ...lowIncome, ...(y === 2026 ? { provisional: true } : {}) },
    basis: 'arkansas_low_income_tax_tables_by_filing_status_and_dependents_looked_up_on_adjusted_gross_income_standard_deduction_built_in',
    ...year(y),
    act: 'Arkansas Income Tax Act of 1929',
    section: 'Ark. Code Title 26, Chapter 51 (low income tax tables); 26-51-201(d)',
    source: y === 2025 ? `${INSTR_2025}: 2025 Low Income Tax Tables (pages 24-25) single 0-$14,643 tax 0, $14,644-$14,700 $29, $100 rows to $17,500; head of household or surviving spouse with 1 or no dependents to $25,300, with 2 or more to $29,000; married filing joint with 1 or no dependents to $29,000, with 2 or more to $36,100; qualifications: married couples must file jointly, no exemption for military compensation, military retirement or employment related pension income, no itemized deductions` : UNPUBLISHED_2026,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ar.income-exclusions',
    value: { retirementPerPerson: 6000, longTermGainShareBp: 5000, gainCap: 10000000, lossLimit: { other: 3000, mfs: 1500 }, earlyWithdrawalTaxBp: 1000 },
    basis: 'arkansas_6000_retirement_exclusion_per_person_50_percent_of_net_long_term_capital_gain_taxed_up_to_10_million_capital_loss_limit_10_percent_of_federal_additional_tax_on_early_distributions',
    ...year(y),
    act: 'Arkansas Income Tax Act of 1929',
    section: 'Ark. Code 26-51-307(f); Title 26, Chapter 51 (capital gains; additional tax on early distributions)',
    source: y === 2025 ? `${INSTR_2025}: lines 17, 18A, 18B "You are entitled to a $6,000 exemption from the taxable amount", "Retirees cannot claim both the military retirement exemption and the $6,000 exemption" unless under $6,000; line 32 "Enter ten percent (10%) of the federal amount from Part I of federal Form 5329"; Arkansas DFA 2025 AR1000D (${DFA}/2025_AR1000D_CapitalGains.pdf), read 2026-11-21: "only 50% of the net long-term capital gain is taxed. 100% of the short-term capital gain is taxed", net capital gain over $10,000,000 exempt, loss limited to $3,000 ($1,500 per taxpayer for filing status 4 or 5)` : 'Arkansas statute sets these amounts without an inflation adjustment and Act 1 of the 2026 First Extraordinary Session did not change them (arkleg.state.ar.us/ACTS/2026S1/Public/ACT1.pdf, read 2026-11-21), so the 2025 amounts apply',
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ar.credits',
    value: {
      childCare: { decimals: careDecimals, lowestBp: 2000, shareBp: 2000 },
      qualifiedIndividuals: { fullThrough: 26500, full: 60, stepPerHundred: 5, zeroFrom: 27601 },
      ...(y === 2026 ? { provisional: true } : {})
    },
    basis: 'arkansas_child_care_credit_20_percent_of_the_federal_rate_table_credit_on_form_2441_expenses_additional_tax_credit_for_qualified_individuals_by_net_taxable_income_doubled_for_joint_returns',
    ...year(y),
    act: 'Arkansas Income Tax Act of 1929',
    section: 'Ark. Code Title 26, Chapter 51 (child care credit; additional tax credit for qualified individuals)',
    source: y === 2025 ? `Arkansas DFA, 2025 AR2441 (${DFA}/2025_AR2441_Child_andDependentCareExpenses.pdf) and AR2441 Instructions (${DFA}/2025_AR2441_Instructions.pdf): line 8 decimal .35 up to $15,000 falling .01 for each $2,000 to .20 over $43,000, line 10 "Multiply line 9 by .20"; 2025 Additional Tax Credit for Qualified Individuals Worksheet (${DFA}/2025_Final_AdditionalTaxCreditforQualifiedIndividuals_FI.pdf): $60 for net income $0-$26,500 falling $5 per $100 to $5 at $27,501-$27,600 and $0 from $27,601, "Double the credit" for filing status 2; AR1000TC Instructions (${DFA}/2025_AR1000TC_Instructions.pdf), all read 2026-11-21` : `The child care percentages are fixed in statute; the qualified individuals credit income ranges for 2026 are not yet published. ${UNPUBLISHED_2026}`,
    attestations: []
  }))
];
