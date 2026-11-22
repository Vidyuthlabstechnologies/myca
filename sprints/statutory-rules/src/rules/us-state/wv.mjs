const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const BOOKLET_2025 = 'West Virginia Tax Division, 2025 Personal Income Tax Forms & Instructions, Form IT-140 with Schedules M, A, E, FTC-1, HEPTC-1 and the Tax Credit Recap Schedule (tax.wv.gov/Documents/PIT/2025/it140.PersonalIncomeTaxFormsAndInstructions.2025.pdf), and the 2025 Tax Table (tax.wv.gov/Documents/PIT/2025/it140.TaxTable.2025.pdf), read 2026-11-21';
const SB392 = 'W. Va. Code 11-21-4j as enacted by 2026 Enrolled Committee Substitute for Senate Bill 392 (code.wvlegislature.gov/11-21-4J/), rate tables for taxable years beginning on and after January 1, 2026, read 2026-11-21';
const CODE_2026 = 'W. Va. Code 11-21-10 (low-income earned income exclusion), 11-21-12(b)(9) and (c)(5) and (c)(8)(E) (senior $8,000 modification, $2,000 public retirement limit, 100 percent social security modification for taxable years beginning on and after January 1, 2026) and 11-21-16 ($2,000 per exemption) (code.wvlegislature.gov), read 2026-11-21; these amounts are fixed by statute and not indexed';
const PROVISIONAL_2026 = 'The West Virginia Tax Division has not published the 2026 IT-140 booklet as of 2026-11-21. The 2026 Family Tax Credit tables (indexed to the federal poverty guidelines under W. Va. Code 11-21-22), the 2026 Homestead Excess Property Tax Credit income guidelines (300 percent of the poverty guideline under W. Va. Code 11-21-23) and the 2026 Tax Table are not published, so the 2025 figures are carried and the record is provisional until the 2026 booklet is published';

const bands = (top) => top.map(([over, rateBp]) => ({ overCents: over * 100, rateBp }));

const RATES = {
  2025: { other: bands([[0, 222], [10000, 296], [25000, 333], [40000, 444], [60000, 482]]), mfs: bands([[0, 222], [5000, 296], [12500, 333], [20000, 444], [30000, 482]]) },
  2026: { other: bands([[0, 211], [10000, 281], [25000, 316], [40000, 422], [60000, 458]]), mfs: bands([[0, 211], [5000, 281], [12500, 316], [20000, 422], [30000, 458]]) },
};

export const RULES = [
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.wv.income-tax',
    value: { rateSchedule: RATES[y], tableBelow: 100000, tableNotForMfs: true },
    basis: 'rate_schedule_i_for_single_head_of_household_joint_and_widower_and_rate_schedule_ii_for_married_filing_separately_tax_table_below_100000_except_married_filing_separately',
    ...year(y),
    act: y === 2025 ? 'W. Va. Code 11-21-4i' : 'W. Va. Code 11-21-4j (2026 S.B. 392)',
    section: y === 2025 ? '11-21-4i; IT-140 line 8 instructions; 2025 Tax Rate Schedules' : '11-21-4j',
    source: y === 2025 ? `${BOOKLET_2025}: 2025 Tax Rate Schedules page 35 (Rate Schedule I: less than $10,000 2.22%; $222.00 plus 2.96% over $10,000; $666.00 plus 3.33% over $25,000; $1,165.50 plus 4.44% over $40,000; $2,053.50 plus 4.82% over $60,000; Rate Schedule II at half the income levels) and Line 8 instructions (Tax Table below $100,000; married filing separately must use Rate Schedule II)` : `${SB392}: 2.11%, 2.81%, 3.16%, 4.22% and 4.58% at the same income levels; the rates are statutory, so they are not provisional`,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.wv.tax-table',
    value: { rows: [{ fromDollars: 0, width: 25 }, { fromDollars: 100, width: 100 }, { fromDollars: 25000, width: 60 }, { fromDollars: 40000, width: 50 }], rounding: 'midpoint_half_up', ...(y === 2026 ? { provisional: true } : {}) },
    basis: 'tax_table_amount_is_the_rate_schedule_tax_on_the_midpoint_of_the_table_row_rounded_to_the_nearest_dollar_rows_25_wide_below_100_100_wide_to_25000_60_wide_to_40000_50_wide_to_100000',
    ...year(y),
    act: 'W. Va. Code 11-21-4i and 11-21-4j',
    section: 'IT-140 line 8; 2025 West Virginia Tax Table',
    source: y === 2025 ? `${BOOKLET_2025}: 2025 West Virginia Tax Table pages 36-42; every one of the 1,702 rows from $25 to $100,000 was checked to equal Rate Schedule I applied to the row midpoint and rounded to the nearest dollar` : `${PROVISIONAL_2026}; the 2026 table is expected to follow the same rows applied to the 2026 rates in W. Va. Code 11-21-4j`,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.wv.deductions',
    value: { exemption: 2000, zeroExemptionAllowance: 500, lowIncomeExclusion: { mfs: 5000, other: 10000 }, lowIncomeAgiLimit: { mfs: 5000, other: 10000 }, socialSecurity: { agiLimit: { mfj: 100000, other: 50000 }, atOrBelowBasisPoints: 10000, aboveBasisPoints: y === 2025 ? 6500 : 10000 }, publicRetirementLimit: 2000, seniorModification: 8000, seniorAge: 65 },
    basis: 'west_virginia_exemptions_low_income_earned_income_exclusion_and_schedule_m_social_security_public_retirement_and_senior_modifications',
    ...year(y),
    act: 'W. Va. Code 11-21-10, 11-21-12 and 11-21-16',
    section: '11-21-10; 11-21-12(b)(9); 11-21-12(c)(5); 11-21-12(c)(8); 11-21-16',
    source: y === 2025 ? `${BOOKLET_2025}: Exemptions ($2,000 per exemption, $500 if box e is zero), Low-Income Earned Income Exclusion Worksheet ($10,000; $5,000 married filing separately), Schedule M line 33 (combined $2,000), line 34 (100% at or below $50,000 or $100,000 joint; 65% above for 2025) and line 47 ($8,000, age 65)` : CODE_2026,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.wv.credits',
    value: {
      familyCredit: { joint: { fullUpTo: [15650, 21150, 26650, 32150, 37650, 43150, 48650, 54150], bandWidth: 300 }, mfs: { fullUpTo: [7825, 10575, 13325, 16075, 18825, 21575, 24325, 27075], bandWidth: 150 }, stepBasisPoints: 1000, bands: 10 },
      childCareBasisPoints: 5000,
      homesteadExcess: { agiLimit: [46950, 63450, 79950, 96450], perAdditionalPerson: 16500, incomeBasisPoints: 400, maximum: 1000 },
      ...(y === 2026 ? { provisional: true } : {})
    },
    basis: 'family_tax_credit_percent_by_family_size_and_modified_agi_child_and_dependent_care_credit_half_of_federal_and_homestead_excess_property_tax_credit_above_4_percent_of_income_up_to_1000',
    ...year(y),
    act: 'W. Va. Code 11-21-22, 11-21-23 and 11-21-26',
    section: '11-21-22; 11-21-23; 11-21-26',
    source: y === 2025 ? `${BOOKLET_2025}: 2025 Family Tax Credit Tables page 12 (Table 1: 100% up to $15,650 for one member and $5,500 more per member, falling 10 points every $300; Table 2 for married filing separately at half the amounts and $150 steps), Important Information for 2025 (Child and Dependent Care Expenses Credit is 50% of the federal Form 2441 credit), Schedule HEPTC-1 (income guidelines $46,950, $63,450, $79,950, $96,450 plus $16,500 each; credit is property tax over 4% of income up to $1,000)` : PROVISIONAL_2026,
    attestations: []
  })),
];
