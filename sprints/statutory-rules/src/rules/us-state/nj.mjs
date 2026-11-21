const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const D = 100;
const NJ1040_2025 = 'New Jersey Division of Taxation, 2025 Form NJ-1040 and NJ-1040 Instructions (nj.gov/treasury/taxation/pdf/current/1040.pdf and 1040i.pdf), read 2026-11-21';
const NJ1040NR_2025 = 'New Jersey Division of Taxation, 2025 Form NJ-1040NR and Instructions (nj.gov/treasury/taxation/pdf/current/1040nr.pdf and 1040nri.pdf), read 2026-11-21';
const STATUTE_2026 = 'the amounts are fixed in the New Jersey Gross Income Tax Act and are not indexed; the only individual gross income tax changes enacted for 2026 are the child tax credit increase (S4531/A5329) and the alternative business calculation limits (A5323), signed June 30, 2026 (EY Tax News 2026-1456, taxnews.ey.com/news/2026-1456, read 2026-11-21), and the FY2026 budget added only a qualified small business stock exemption (NJ Treasury news 2025-07-02, nj.gov/treasury/news/2025/07022025.shtml, read 2026-11-21); the 2026 NJ-1040 is not published as of 2026-11-21';

const TABLE_A = [
  { overCents: 0, rateBp: 140 },
  { overCents: 20000 * D, rateBp: 175 },
  { overCents: 35000 * D, rateBp: 350 },
  { overCents: 40000 * D, rateBp: 552.5 },
  { overCents: 75000 * D, rateBp: 637 },
  { overCents: 500000 * D, rateBp: 897 },
  { overCents: 1000000 * D, rateBp: 1075 },
];
const TABLE_B = [
  { overCents: 0, rateBp: 140 },
  { overCents: 20000 * D, rateBp: 175 },
  { overCents: 50000 * D, rateBp: 245 },
  { overCents: 70000 * D, rateBp: 350 },
  { overCents: 80000 * D, rateBp: 552.5 },
  { overCents: 150000 * D, rateBp: 637 },
  { overCents: 500000 * D, rateBp: 897 },
  { overCents: 1000000 * D, rateBp: 1075 },
];

const CTC_2025 = [{ upTo: 30000, amount: 1000 }, { upTo: 40000, amount: 800 }, { upTo: 50000, amount: 600 }, { upTo: 60000, amount: 400 }, { upTo: 80000, amount: 200 }];
const CTC_2026 = [{ upTo: 30000, amount: 1250 }, { upTo: 40000, amount: 1000 }, { upTo: 50000, amount: 750 }, { upTo: 60000, amount: 500 }, { upTo: 80000, amount: 250 }];

export const RULES = [
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.nj.income-tax',
    value: { brackets: { single: TABLE_A, mfs: TABLE_A, mfj: TABLE_B, hoh: TABLE_B, qss: TABLE_B }, taxTableBelow: 100000, taxTableBand: 50 },
    basis: 'graduated_rates_table_a_single_and_separate_table_b_joint_head_of_household_and_surviving_spouse_tax_table_below_100000_in_50_dollar_bands_taxed_at_the_band_midpoint',
    ...year(y),
    act: 'New Jersey Gross Income Tax Act (N.J.S.A. 54A)',
    section: '54A:2-1',
    source: y === 2025 ? `${NJ1040_2025}, Tax Rate Schedules page 63 (Table A: over $0 .014, $20,000 .0175, $35,000 .035, $40,000 .05525, $75,000 .0637, $500,000 .0897, $1,000,000 .1075; Table B: over $0 .014, $20,000 .0175, $50,000 .0245, $70,000 .035, $80,000 .05525, $150,000 .0637, $500,000 .0897, $1,000,000 .1075) and Tax Table page 54 ("Use this table if your New Jersey taxable income on line 42 is less than $100,000"; rows are $50 wide and the $39,850-$39,900 joint row of $628 is the schedule tax at the $39,875 midpoint)` : `The rate schedules are unchanged for 2026: ${STATUTE_2026}`,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.nj.exemptions',
    value: { regular: 1000, senior: 1000, seniorAge: 65, blindOrDisabled: 1000, veteran: 6000, dependent: 1500, collegeStudent: 1000, collegeStudentUnderAge: 22 },
    basis: 'personal_exemptions_1000_each_filer_1000_more_at_65_and_for_blind_or_disabled_6000_per_veteran_1500_per_dependent_1000_per_full_time_college_dependent_under_22',
    ...year(y),
    act: 'New Jersey Gross Income Tax Act (N.J.S.A. 54A)',
    section: '54A:3-1',
    source: y === 2025 ? `${NJ1040_2025}, Lines 6-12: "$1,000 exemption for yourself and your spouse", Senior 65+ $1,000, Blind/Disabled $1,000, Veteran "$6,000 exemption", Qualified Dependent Children and Other Dependents "$1,500 exemption", Dependents Attending Colleges "additional $1,000 ... under age 22"` : STATUTE_2026,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.nj.retirement-exclusion',
    value: {
      ageMinimum: 62,
      incomeLimit: 150000,
      fullAmountUpTo: 100000,
      maximum: { mfj: 100000, single: 75000, hoh: 75000, qss: 75000, mfs: 50000 },
      tiers: [
        { upTo: 125000, basisPoints: { mfj: 5000, single: 3750, hoh: 3750, qss: 3750, mfs: 2500 } },
        { upTo: 150000, basisPoints: { mfj: 2500, single: 1875, hoh: 1875, qss: 1875, mfs: 1250 } },
      ],
      earnedIncomeLimit: 3000,
    },
    basis: 'pension_exclusion_at_62_or_blind_or_disabled_up_to_100000_joint_75000_single_50000_separate_when_income_is_100000_or_less_then_a_share_of_the_pension_up_to_150000_and_the_unused_part_against_other_income_when_earned_income_is_3000_or_less',
    ...year(y),
    act: 'New Jersey Gross Income Tax Act (N.J.S.A. 54A)',
    section: '54A:6-10; 54A:6-15',
    source: y === 2025 ? `${NJ1040_2025}, Line 28a chart (Married/CU couple $100,000, 50% of line 20a, 25% of line 20a; Single/Head of household/Qualifying widow(er) $75,000, 37.5%, 18.75%; Married separate $50,000, 25%, 12.5%; "Your income on line 27 is $150,000 or less") and Worksheet D (same maximums with percentages of line 27; "Is the amount on line 8 MORE than $3,000?"; age 62 or older)` : STATUTE_2026,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.nj.deductions',
    value: { medicalFloorBasisPoints: 200, njbestMaximum: 10000, njclassMaximum: 2500, tuitionMaximum: 10000, collegeAffordabilityIncomeLimit: 200000 },
    basis: 'medical_expenses_above_2_percent_of_nj_gross_income_plus_self_employed_health_insurance_njbest_up_to_10000_njclass_up_to_2500_nj_tuition_up_to_10000_when_gross_income_is_200000_or_less',
    ...year(y),
    act: 'New Jersey Gross Income Tax Act (N.J.S.A. 54A)',
    section: '54A:3-3; 54A:3-12; 54A:3-13; 54A:3-14',
    source: y === 2025 ? `${NJ1040_2025}, Worksheet F ("Enter line 29 ... x .02"; self-employed health insurance deduction) and Lines 37a-37c ("If your gross income was $200,000 or less", NJBEST "up to $10,000", NJCLASS "up to $2,500", tuition "up to $10,000")` : STATUTE_2026,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.nj.property-tax',
    value: { rentBasisPoints: 1800, deductionMaximum: 15000, deductionMaximumSeparateSameHome: 7500, credit: 50, creditSeparateSameHome: 25, filingThreshold: { single: 10000, mfs: 10000, mfj: 20000, hoh: 20000, qss: 20000 } },
    basis: 'property_tax_deduction_up_to_15000_or_a_50_refundable_credit_whichever_saves_more_with_tenants_counting_18_percent_of_rent_only_above_the_filing_threshold',
    ...year(y),
    act: 'New Jersey Gross Income Tax Act (N.J.S.A. 54A)',
    section: '54A:3A-15 to 54A:3A-20',
    source: y === 2025 ? `${NJ1040_2025}, Line 40a ("Enter 18% of the rent paid"), Line 41 ("Property Tax Deduction of up to $15,000 ($7,500 if you and your spouse file separate returns but maintained the same main home)"), Worksheet H line 8 ("$50 or more ($25 ...)"), Line 56 ("enter $50 ($25 if married, filing separately)"), eligibility "Your income on line 29 is more than the filing threshold" ($10,000 single or separate, $20,000 otherwise, page 3)` : STATUTE_2026,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.nj.credits',
    value: { eitcBasisPoints: 4000, eitcNoChildAmount: 260, childTaxCreditMaxAge: 5, childTaxCredit: y === 2025 ? CTC_2025 : CTC_2026 },
    basis: 'nj_eitc_40_percent_of_federal_eic_nj_child_tax_credit_per_dependent_aged_5_or_under_by_taxable_income_up_to_80000_not_for_separate_returns',
    ...year(y),
    act: y === 2025 ? 'New Jersey Gross Income Tax Act (N.J.S.A. 54A)' : 'New Jersey Gross Income Tax Act (N.J.S.A. 54A) as amended by S4531/A5329 (2026)',
    section: '54A:4-7; 54A:4-17.1',
    source: y === 2025 ? `${NJ1040_2025}, Line 58 ("The NJEITC is 40% of the federal EIC"; "enter $260 on line 58" for filers 18 or older with no qualifying child who miss only the federal age test) and Line 65 ("If your taxable income is $80,000 or less ... each dependent who is age 5 or younger": $30,000 or less $1,000; to $40,000 $800; to $50,000 $600; to $60,000 $400; to $80,000 $200; not for married filing separately)` : 'The 2026 child tax credit is the temporary 25% increase for tax years 2026 to 2028 enacted by S4531/A5329, signed June 30, 2026: $1,250 at $30,000 or less, $1,000 to $40,000, $750 to $50,000, $500 to $60,000, $250 to $80,000 (EY Tax News 2026-1456, taxnews.ey.com/news/2026-1456-new-jersey-enacted-budget-bills-include-corporate-and-individual-tax-changes-including-a-temporary-cap-on-net-operating-loss-deductions, read 2026-11-21); the 40% NJEITC and the $260 amount are unchanged by statute',
    attestations: []
  })),
  {
    id: 'us.state-return.nj.shared-responsibility',
    value: { adultCents: 69500, childCents: 34750, flatCapCents: 208500, monthlyAdultCents: 5792, monthlyChildCents: 2896, incomeBasisPoints: 250, perPersonCapCents: 490800, maxPersons: 5, threshold: { single: 10000, mfs: 10000, mfj: 20000, hoh: 20000, qss: 20000 } },
    basis: 'shared_responsibility_payment_greater_of_a_flat_amount_per_uncovered_person_and_2_5_percent_of_household_income_over_the_threshold_capped_by_the_bronze_plan_amount_per_household_member',
    ...year(2025),
    act: 'New Jersey Health Insurance Market Preservation Act (P.L.2018, c.31)',
    section: 'N.J.S.A. 54A:11-1 to 54A:11-6',
    source: `${NJ1040_2025}, Worksheet L: Part I line 7 "Multiply the amount on line 6 by 2.5% (0.025)", Part II "x $695.00", "x $347.50", "Enter the lessor of line 3 or $2,085", "1 person - $4,908 ... 5+ people - $24,540"; Part III "$57.92" and "$28.96" per month`,
    attestations: []
  },
  {
    id: 'us.state-return.nj.shared-responsibility',
    value: { adultCents: 69500, childCents: 34750, flatCapCents: 208500, monthlyAdultCents: 5792, monthlyChildCents: 2896, incomeBasisPoints: 250, perPersonCapCents: 490800, maxPersons: 5, threshold: { single: 10000, mfs: 10000, mfj: 20000, hoh: 20000, qss: 20000 }, provisional: true },
    basis: 'shared_responsibility_payment_greater_of_a_flat_amount_per_uncovered_person_and_2_5_percent_of_household_income_over_the_threshold_capped_by_the_bronze_plan_amount_per_household_member',
    ...year(2026),
    act: 'New Jersey Health Insurance Market Preservation Act (P.L.2018, c.31)',
    section: 'N.J.S.A. 54A:11-1 to 54A:11-6',
    source: 'The flat amounts and the bronze plan caps are reset each year from the federal penalty amounts and the statewide average bronze premium; New Jersey has not published the 2026 Worksheet L amounts as of 2026-11-21, so the 2025 amounts are carried and the record is provisional',
    attestations: []
  },
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.nj.nonresident',
    value: { incomePercentagePlaces: 4 },
    basis: 'nonresident_tax_is_the_tax_on_income_from_everywhere_times_new_jersey_source_gross_income_over_gross_income_from_everywhere',
    ...year(y),
    act: 'New Jersey Gross Income Tax Act (N.J.S.A. 54A)',
    section: '54A:2-1.1',
    source: y === 2025 ? `${NJ1040NR_2025}, Line 41 "Divide the amount on line 29, column B by the amount on line 29, column A. Carry your result to four decimal places"; Line 42 "Multiply the amount on line 40 by the income percentage on line 41"; Line 28a column B "pension, annuity, and IRA withdrawal income is not taxable to nonresidents"` : STATUTE_2026,
    attestations: []
  }))
];
