const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const BOOKLET_2025 = 'Nebraska Department of Revenue, 2025 Nebraska Individual Income Tax Booklet (revenue.nebraska.gov/sites/default/files/doc/tax-forms/2025/f_Individual_Income_Tax_Booklet.pdf) with Form 1040N (f_1040N.pdf) and Schedules I, II and III (f_1040N_Schs.pdf), read 2026-11-21';
const SCHEDULE_2025 = 'Nebraska Department of Revenue, 2025 Nebraska Tax Calculation Schedule for Individual Income Tax, 8-460-2025 (revenue.nebraska.gov/sites/default/files/doc/tax-forms/2025/2025_Tax_Calculation_Schedule.pdf), read 2026-11-21';
const SCHEDULE_2026 = 'Nebraska Department of Revenue, 2026 Nebraska Tax Calculation Schedule for Individual Income Tax, 8-460-2026 draft of 2026-08-17 (revenue.nebraska.gov/sites/default/files/doc/tax-forms/drafts/2026_tax_calculation_schedule.pdf) and the 2026 Form 1040N-ES booklet 8-014-2025 Rev. 11-2025 (revenue.nebraska.gov/sites/default/files/doc/tax-forms/2025/f_1040N-ES.pdf: standard deduction $8,850 single, $17,700 joint, $12,950 head of household, $8,850 separate; additional $2,050 unmarried and $1,700 married or surviving spouse for 65 or older or blind; "$176 for each Nebraska personal exemption"; "the tax year 2026 individual income tax rates for the third and fourth brackets are at the same rate of 4.55% per Neb. Rev. Stat. § 77-2715.03(2)(c)(v)"), read 2026-11-21';
const FORM_2441N = 'Nebraska Department of Revenue, 2025 Form 2441N Nebraska Child and Dependent Care Expenses, 8-618-2025 (revenue.nebraska.gov/sites/default/files/doc/tax-forms/2025/f_2441N.pdf), lines 7-11 federal and state decimal tables, read 2026-11-21';

const band = (dollars, rateBp) => ({ overCents: dollars * 100, rateBp });

export const RULES = [
  {
    id: 'us.state-return.ne.income-tax',
    value: {
      brackets: {
        single: [band(0, 246), band(4030, 351), band(24120, 501), band(38870, 520)],
        mfs: [band(0, 246), band(4030, 351), band(24120, 501), band(38870, 520)],
        mfj: [band(0, 246), band(8040, 351), band(48250, 501), band(77730, 520)],
        hoh: [band(0, 246), band(7510, 351), band(38590, 501), band(57630, 520)],
      },
      standardDeduction: { single: 8600, mfs: 8600, mfj: 17200, hoh: 12600 },
      additionalStandardDeduction: { unmarried: 2000, married: 1650 },
      personalExemptionCredit: 171,
      otherTaxBasisPoints: 2960,
      collegeSavingsMaximum: { mfs: 5000, other: 10000 },
      federalLiabilityAdjustmentLimit: 5000,
    },
    basis: 'graduated_rates_on_nebraska_taxable_income_federal_agi_less_the_nebraska_standard_or_federal_itemized_deduction_without_state_income_taxes_plus_and_minus_schedule_i_adjustments_with_a_personal_exemption_credit',
    ...year(2025),
    act: 'Nebraska Revenue Act of 1967, income tax (Neb. Rev. Stat. 77-2714 to 77-27,135)',
    section: '77-2715.03; Form 1040N lines 6, 15, 16, 18 and 35; Schedule I line 20',
    source: `${SCHEDULE_2025}: single and separate 2.46% to $4,030, 3.51% to $24,120, 5.01% to $38,870, 5.20% above; joint and surviving spouse $8,040, $48,250, $77,730; head of household $7,510, $38,590, $57,630. ${BOOKLET_2025}: Line 6 Nebraska Standard Deduction Chart ($8,600 single, $17,200 joint, $12,600 head of household, $8,600 separate; $2,000 per box for single and head of household and $1,650 per box for married and surviving spouse), Line 18 "$171 credit for each Nebraska personal exemption", Line 16 "The Nebraska other tax is 29.6% of the federal other tax", Line 35 Federal Tax Liability Worksheet "$5,000 or more", Schedule I line 20 Nebraska College Savings Program deduction`,
    attestations: []
  },
  {
    id: 'us.state-return.ne.income-tax',
    value: {
      brackets: {
        single: [band(0, 246), band(4130, 351), band(24760, 455), band(39900, 455)],
        mfs: [band(0, 246), band(4130, 351), band(24760, 455), band(39900, 455)],
        mfj: [band(0, 246), band(8250, 351), band(49530, 455), band(79800, 455)],
        hoh: [band(0, 246), band(7700, 351), band(39620, 455), band(59160, 455)],
      },
      standardDeduction: { single: 8850, mfs: 8850, mfj: 17700, hoh: 12950 },
      additionalStandardDeduction: { unmarried: 2050, married: 1700 },
      personalExemptionCredit: 176,
      otherTaxBasisPoints: 2960,
      collegeSavingsMaximum: { mfs: 5000, other: 10000 },
      federalLiabilityAdjustmentLimit: 5000,
    },
    basis: 'graduated_rates_on_nebraska_taxable_income_federal_agi_less_the_nebraska_standard_or_federal_itemized_deduction_without_state_income_taxes_plus_and_minus_schedule_i_adjustments_with_a_personal_exemption_credit',
    ...year(2026),
    act: 'Nebraska Revenue Act of 1967, income tax (Neb. Rev. Stat. 77-2714 to 77-27,135)',
    section: '77-2715.03(2)(c)(v); Form 1040N lines 6, 15, 16, 18 and 35; Schedule I line 20',
    source: `${SCHEDULE_2026}; the 29.6% other tax and the $10,000 college savings limit are statutory and unchanged`,
    attestations: []
  },
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ne.credits',
    value: { eitcBasisPoints: 1000, childCareNonrefundableBasisPoints: 2500, childCareRefundableAgiLimit: 29000 },
    basis: 'nebraska_eitc_is_10_percent_of_the_federal_eic_for_residents_and_part_year_residents_and_the_nonrefundable_child_care_credit_is_25_percent_of_the_federal_credit_above_29000_of_agi',
    ...year(y),
    act: 'Nebraska Revenue Act of 1967, income tax (Neb. Rev. Stat. 77-2714 to 77-27,135)',
    section: 'Form 1040N lines 23, 42 and 44',
    source: `${BOOKLET_2025}: Line 44 "a state credit equal to 10% of the federal credit", Line 23 "Resident taxpayers with AGI greater than $29,000 ... Multiply the amount on line 2 of Schedule 3, Federal Form 1040 by 25%", Line 42 refundable credit for AGI of $29,000 or less${y === 2026 ? '; the same credits are listed for 2026 in the 2026 Form 1040N-ES booklet (revenue.nebraska.gov/sites/default/files/doc/tax-forms/2025/f_1040N-ES.pdf), read 2026-11-21, and no change to the percentages was found' : ''}`,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ne.child-care-refundable',
    value: {
      federalDecimal: [{ agiNotOver: 15000, basisPoints: 3500 }, { agiNotOver: 17000, basisPoints: 3400 }, { agiNotOver: 19000, basisPoints: 3300 }, { agiNotOver: 21000, basisPoints: 3200 }, { agiNotOver: 23000, basisPoints: 3100 }, { agiNotOver: 25000, basisPoints: 3000 }, { agiNotOver: 27000, basisPoints: 2900 }, { agiNotOver: 29000, basisPoints: 2800 }],
      stateDecimal: [{ agiNotOver: 22000, basisPoints: 10000 }, { agiNotOver: 23000, basisPoints: 9000 }, { agiNotOver: 24000, basisPoints: 8000 }, { agiNotOver: 25000, basisPoints: 7000 }, { agiNotOver: 26000, basisPoints: 6000 }, { agiNotOver: 27000, basisPoints: 5000 }, { agiNotOver: 28000, basisPoints: 4000 }, { agiNotOver: 29000, basisPoints: 3000 }],
      ...(y === 2026 ? { provisional: true } : {}),
    },
    basis: 'refundable_child_care_credit_for_agi_up_to_29000_is_form_2441_line_6_expenses_times_the_federal_decimal_times_the_state_decimal',
    ...year(y),
    act: 'Nebraska Revenue Act of 1967, income tax (Neb. Rev. Stat. 77-2714 to 77-27,135)',
    section: 'Form 2441N lines 6 to 12',
    source: y === 2025 ? FORM_2441N : 'Nebraska had not published the 2026 Form 2441N as of 2026-11-21; the 2025 decimal tables are carried and marked provisional',
    attestations: []
  })),
];
