const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });

const BOOK_2025 = 'Missouri Department of Revenue, 2025 Form MO-1040 Individual Income Tax Return Instructions with Forms MO-A, MO-CR, MO-NRI and MO-WFTC (dor.mo.gov/forms/MO-1040%20Instructions_2025.pdf), read 2026-11-21';
const FORM_2025 = 'Missouri Department of Revenue, 2025 Form MO-1040 (dor.mo.gov/forms/MO-1040%20Print%20Only_2025.pdf), read 2026-11-21';
const WITHHOLDING_2026 = 'Missouri Department of Revenue, Form 4282 Missouri Employer\'s Tax Guide (Revised 03-2026), 2026 Missouri Withholding Tax Formula (dor.mo.gov/forms/4282_2026.pdf), read 2026-11-21';
const NOT_PUBLISHED_2026 = 'Missouri has not published the 2026 Form MO-1040 instructions as of 2026-11-21; the 2025 figures are carried until it does, so the record is marked provisional';

const CHART_2025 = [
  { overCents: 0, rateBp: 0, baseCents: 0 },
  { overCents: 131300, rateBp: 200, baseCents: 0 },
  { overCents: 262600, rateBp: 250, baseCents: 2600 },
  { overCents: 393900, rateBp: 300, baseCents: 5900 },
  { overCents: 525200, rateBp: 350, baseCents: 9800 },
  { overCents: 656500, rateBp: 400, baseCents: 14400 },
  { overCents: 787800, rateBp: 450, baseCents: 19700 },
  { overCents: 919100, rateBp: 470, baseCents: 25600 },
];
const CHART_2026 = [
  { overCents: 0, rateBp: 0, baseCents: 0 },
  { overCents: 134800, rateBp: 200, baseCents: 0 },
  { overCents: 269600, rateBp: 250, baseCents: 2700 },
  { overCents: 404400, rateBp: 300, baseCents: 6100 },
  { overCents: 539200, rateBp: 350, baseCents: 10100 },
  { overCents: 674000, rateBp: 400, baseCents: 14800 },
  { overCents: 808800, rateBp: 450, baseCents: 20200 },
  { overCents: 943600, rateBp: 470, baseCents: 26300 },
];

const DEDUCTIONS = {
  federalTaxPercentages: [{ notOver: 25000, percent: 35 }, { notOver: 50000, percent: 25 }, { notOver: 100000, percent: 15 }, { notOver: 125000, percent: 5 }],
  federalTaxCap: { mfj: 10000, other: 5000 },
  headOfHouseholdExemption: 1400,
  socialSecurityTaxCap: 10918,
  saltWorksheetThreshold: { mfs: 20000, other: 40000 },
  saltWorksheetAgi: { mfs: 250000, other: 500000 },
  plan529Maximum: { mfj: 16000, other: 8000 },
};
const PENSION = { publicPensionMaximum: 47633, privatePensionMaximum: 6000, privatePensionThreshold: { mfj: 32000, mfs: 16000, other: 25000 }, socialSecurityAge: 62 };
const MODIFICATIONS = { capitalGainSubtractionPercent: 100, businessIncomeDeductionBasisPoints: 2000 };
const CREDITS = { workingFamilyBasisPoints: 2000, workingFamilyInvestmentIncomeLimit: 4400, workingFamilyStatuses: ['single', 'hoh', 'qss', 'mfj'] };

export const RULES = [
  {
    id: 'us.state-return.mo.income-tax',
    value: { chart: CHART_2025 },
    basis: 'tax_rate_chart_base_plus_percent_of_excess_computed_separately_for_each_spouse_rounded_to_whole_dollar',
    ...year(2025),
    act: 'Missouri Revised Statutes',
    section: 'RSMo 143.011',
    source: `${BOOK_2025}, 2025 Tax Chart Section A: "$0 to $1,313 ... $0", "Over $1,313 but not over $2,626 ... 2.0% of the excess over $1,313", "$26 plus 2.5% of the excess over $2,626", "$59 plus 3.0%" over $3,939, "$98 plus 3.5%" over $5,252, "$144 plus 4.0%" over $6,565, "$197 plus 4.5%" over $7,878, "Over $9,191 ... $256 plus 4.7% of the excess over $9,191"; "A separate tax must be computed for you and your spouse"; Example A $12,000 gives $388`,
    attestations: []
  },
  {
    id: 'us.state-return.mo.income-tax',
    value: { chart: CHART_2026, provisional: true },
    basis: 'tax_rate_chart_base_plus_percent_of_excess_computed_separately_for_each_spouse_rounded_to_whole_dollar',
    ...year(2026),
    act: 'Missouri Revised Statutes',
    section: 'RSMo 143.011',
    source: `${WITHHOLDING_2026}: brackets $0 to $1,348.00 at 0.00%, then 2.00%, 2.50%, 3.00%, 3.50%, 4.00%, 4.50% in $1,348 steps, "9,436.01 and over" at 4.70%, worked example with per-bracket amounts $27, $34, $40, $47, $54, $61 totalling $263 at $9,436. The 2026 MO-1040 tax chart is not published as of 2026-11-21; the chart bases are the cumulative rounded bracket amounts of the withholding formula, so the record is marked provisional`,
    attestations: []
  },
  {
    id: 'us.state-return.mo.deductions',
    value: DEDUCTIONS,
    basis: 'federal_income_tax_deduction_by_missouri_agi_percentage_capped_hoh_exemption_mo_a_part_2_itemized_and_529_subtraction',
    ...year(2025),
    act: 'Missouri Revised Statutes',
    section: 'RSMo 143.171; RSMo 143.131; RSMo 143.141; RSMo 143.161; RSMo 166.435',
    source: `${BOOK_2025}, Line 12 federal tax percentage ($25,000 or less 35%, $25,001 to $50,000 25%, $50,001 to $100,000 15%, $100,001 to $125,000 5%, $125,001 or more 0%); Line 13 "may not exceed $5,000" or "$10,000" for married filing combined; Line 15 "$1,400" for head of household and qualifying widow(er); MO-A Part 2 lines 2-3 social security tax "cannot exceed $10,918", Part 2 worksheet when Schedule A line 5d exceeds $40,000 ($20,000 married filing separately) or federal AGI exceeds $500,000 ($250,000); MO-A line 12 529 contributions "$8,000 for single individuals or $16,000 for married couples filing a combined return"; ${FORM_2025}`,
    attestations: []
  },
  {
    id: 'us.state-return.mo.deductions',
    value: { ...DEDUCTIONS, provisional: true },
    basis: 'federal_income_tax_deduction_by_missouri_agi_percentage_capped_hoh_exemption_mo_a_part_2_itemized_and_529_subtraction',
    ...year(2026),
    act: 'Missouri Revised Statutes',
    section: 'RSMo 143.171; RSMo 143.131; RSMo 143.141; RSMo 143.161; RSMo 166.435',
    source: `${NOT_PUBLISHED_2026}; the social security tax cap on MO-A Part 2 follows the 2026 social security wage base and is the figure most likely to change`,
    attestations: []
  },
  {
    id: 'us.state-return.mo.pension',
    value: PENSION,
    basis: 'mo_a_part_3_public_pension_up_to_maximum_social_security_benefit_private_pension_6000_reduced_above_income_threshold_social_security_at_62_or_disability',
    ...year(2025),
    act: 'Missouri Revised Statutes',
    section: 'RSMo 143.124',
    source: `${BOOK_2025}, MO-A Part 3 Section A line 2 "Amount from Line 1 or $47,633 (maximum social security benefit), whichever is less"; Section B line 4 "Married Filing Combined (joint federal) - $32,000", "Single, Head of Household, and Qualifying Widow(er) - $25,000", "Married Filing Separate - $16,000", line 7 "Amounts from Line 6Y and 6S or $6,000, whichever is less"; Section C "you must be 62 years of age by December 31 ... Age limit does not apply to social security disability deduction"`,
    attestations: []
  },
  {
    id: 'us.state-return.mo.pension',
    value: { ...PENSION, provisional: true },
    basis: 'mo_a_part_3_public_pension_up_to_maximum_social_security_benefit_private_pension_6000_reduced_above_income_threshold_social_security_at_62_or_disability',
    ...year(2026),
    act: 'Missouri Revised Statutes',
    section: 'RSMo 143.124',
    source: `${NOT_PUBLISHED_2026}; the public pension limit is the 2026 maximum social security benefit, which the 2026 instructions will state`,
    attestations: []
  },
  {
    id: 'us.state-return.mo.modifications',
    value: MODIFICATIONS,
    basis: 'mo_a_part_1_capital_gain_subtraction_100_percent_and_business_income_deduction_20_percent_of_missouri_source',
    ...year(2025),
    act: 'Missouri Revised Statutes as amended by 2025 House Bill 594',
    section: 'RSMo 143.121; RSMo 143.022',
    source: `${BOOK_2025}, MO-A Line 18 "a subtraction from your federal adjusted gross income for 100 percent of your federally reported capital gains", "If the amount reported on your Federal Form 1040 or 1040-SR, Line 7a was negative, enter $0"; Line 17 "a subtraction from federal adjusted gross income in the amount of 20 percent for Missouri-source business income"`,
    attestations: []
  },
  {
    id: 'us.state-return.mo.modifications',
    value: MODIFICATIONS,
    basis: 'mo_a_part_1_capital_gain_subtraction_100_percent_and_business_income_deduction_20_percent_of_missouri_source',
    ...year(2026),
    act: 'Missouri Revised Statutes as amended by 2025 House Bill 594',
    section: 'RSMo 143.121; RSMo 143.022',
    source: `The capital gain subtraction (RSMo 143.121 as amended by 2025 HB 594, for tax years beginning on or after January 1, 2025) and the 20 percent business income deduction (RSMo 143.022) are statutory and continue for 2026; figures as in ${BOOK_2025}`,
    attestations: []
  },
  {
    id: 'us.state-return.mo.credits',
    value: CREDITS,
    basis: 'mo_wftc_20_percent_of_federal_eic_for_residents_single_hoh_qss_or_combined_with_investment_income_limit_capped_at_tax',
    ...year(2025),
    act: 'Missouri Revised Statutes',
    section: 'RSMo 143.177; RSMo 143.081',
    source: `${BOOK_2025}, Information to Complete Form MO-WFTC: "equal to 20% of your Federal Earned Income Credit for tax year 2025", "resident individual with a filing status of single, head of household, qualifying widow(er), or married filing combined", "Your investment income cannot exceed $4,400"; MO-WFTC lines 7-10 (smaller of 20% of EIC or line 36 minus lines 42 and 43); Form MO-CR lines 1-11 and Form MO-NRI Part C (whole percent rounding, exact below 0.5 percent)`,
    attestations: []
  },
  {
    id: 'us.state-return.mo.credits',
    value: { ...CREDITS, provisional: true },
    basis: 'mo_wftc_20_percent_of_federal_eic_for_residents_single_hoh_qss_or_combined_with_investment_income_limit_capped_at_tax',
    ...year(2026),
    act: 'Missouri Revised Statutes',
    section: 'RSMo 143.177; RSMo 143.081',
    source: `${NOT_PUBLISHED_2026}; the 20 percent rate is the statutory maximum under RSMo 143.177, the $4,400 investment income limit is the figure the 2026 MO-WFTC may change`,
    attestations: []
  }
];
