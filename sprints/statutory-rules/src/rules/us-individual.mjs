const D = 100;
const RP_2025 = 'Rev. Proc. 2024-40 as modified by Public Law 119-21 (One Big Beautiful Bill Act, enacted 4 July 2025)';
const RP_2026 = 'Rev. Proc. 2025-32 (inflation adjustments for 2026, including the Public Law 119-21 amendments)';
const NOT_REREAD = 'figures as stated in published IRS guidance and secondary summaries read on 2026-11-11; the revenue procedure text not re-read for this record';

const bands = (tops) => {
  const rates = [1000, 1200, 2200, 2400, 3200, 3500, 3700];
  let from = 0;
  return rates.map((basisPoints, index) => {
    const to = index < tops.length ? tops[index] * D : null;
    const band = { fromCents: from, toCents: to, basisPoints };
    from = to;
    return band;
  });
};

const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });

const eitcRow = (creditBasisPoints, earnedIncome, phaseOutBasisPoints, startOther, startJoint) => ({ creditBasisPoints, earnedIncomeAmountCents: earnedIncome * D, phaseOutBasisPoints, phaseOutStartCents: { other: startOther * D, joint: startJoint * D } });

export const RULES = [
  {
    id: 'us.federal.individual.brackets',
    value: {
      single: bands([11925, 48475, 103350, 197300, 250525, 626350]),
      mfj: bands([23850, 96950, 206700, 394600, 501050, 751600]),
      mfs: bands([11925, 48475, 103350, 197300, 250525, 375800]),
      hoh: bands([17000, 64850, 103350, 197300, 250500, 626350]),
    },
    basis: 'ordinary_income_tax_rate_bands_on_taxable_income_by_filing_status_qualifying_surviving_spouse_uses_mfj',
    ...year(2025),
    act: 'IRC',
    section: '1(j); 1(f)',
    source: `IRC section 1(j) rate schedules made permanent by Public Law 119-21 section 70101, inflation-adjusted for 2025 by ${RP_2025} (${NOT_REREAD})`,
    attestations: []
  },
  {
    id: 'us.federal.individual.brackets',
    value: {
      single: bands([12400, 50400, 105700, 201775, 256225, 640600]),
      mfj: bands([24800, 100800, 211400, 403550, 512450, 768700]),
      mfs: bands([12400, 50400, 105700, 201775, 256225, 384350]),
      hoh: bands([17700, 67450, 105700, 201750, 256200, 640600]),
    },
    basis: 'ordinary_income_tax_rate_bands_on_taxable_income_by_filing_status_qualifying_surviving_spouse_uses_mfj',
    ...year(2026),
    act: 'IRC',
    section: '1(j); 1(f)',
    source: `IRC section 1(j) as made permanent by Public Law 119-21 section 70101; ${RP_2026} section 4.01 (${NOT_REREAD})`,
    attestations: []
  },
  {
    id: 'us.federal.individual.standard-deduction',
    value: { basicCents: { single: 15750 * D, mfj: 31500 * D, mfs: 15750 * D, hoh: 23625 * D, qss: 31500 * D }, additionalMarriedCents: 1600 * D, additionalUnmarriedCents: 2000 * D, dependentMinimumCents: 1350 * D, dependentEarnedIncomeAddCents: 450 * D },
    basis: 'basic_standard_deduction_by_filing_status_plus_an_additional_amount_for_each_of_age_65_and_blindness_dependents_limited_to_the_greater_of_the_minimum_or_earned_income_plus_the_add_amount',
    ...year(2025),
    act: 'IRC',
    section: '63(c)',
    source: `IRC section 63(c)(7) as amended by Public Law 119-21 section 70102 (fifteen thousand seven hundred fifty dollars single, thirty-one thousand five hundred joint, twenty-three thousand six hundred twenty-five head of household for 2025); additional and dependent amounts from ${RP_2025} (${NOT_REREAD})`,
    attestations: []
  },
  {
    id: 'us.federal.individual.standard-deduction',
    value: { basicCents: { single: 16100 * D, mfj: 32200 * D, mfs: 16100 * D, hoh: 24150 * D, qss: 32200 * D }, additionalMarriedCents: 1650 * D, additionalUnmarriedCents: 2050 * D, dependentMinimumCents: 1350 * D, dependentEarnedIncomeAddCents: 450 * D },
    basis: 'basic_standard_deduction_by_filing_status_plus_an_additional_amount_for_each_of_age_65_and_blindness_dependents_limited_to_the_greater_of_the_minimum_or_earned_income_plus_the_add_amount',
    ...year(2026),
    act: 'IRC',
    section: '63(c)',
    source: `IRC section 63(c) as amended by Public Law 119-21; ${RP_2026} section 4.15 (${NOT_REREAD})`,
    attestations: []
  },
  {
    id: 'us.federal.individual.capital-gains-rates',
    value: { zeroRateMaxCents: { single: 48350 * D, mfj: 96700 * D, mfs: 48350 * D, hoh: 64750 * D, qss: 96700 * D }, fifteenRateMaxCents: { single: 533400 * D, mfj: 600050 * D, mfs: 300000 * D, hoh: 566700 * D, qss: 600050 * D }, lowBasisPoints: 0, middleBasisPoints: 1500, highBasisPoints: 2000 },
    basis: 'net_capital_gain_and_qualified_dividends_taxed_at_zero_fifteen_and_twenty_percent_with_the_band_tops_measured_on_taxable_income',
    ...year(2025),
    act: 'IRC',
    section: '1(h); 1(j)(5)',
    source: `IRC section 1(h) and 1(j)(5); maximum zero and fifteen per cent rate amounts from ${RP_2025} (${NOT_REREAD}). Unrecaptured section 1250 gain and collectibles are not encoded`,
    attestations: []
  },
  {
    id: 'us.federal.individual.capital-gains-rates',
    value: { zeroRateMaxCents: { single: 49450 * D, mfj: 98900 * D, mfs: 49450 * D, hoh: 66200 * D, qss: 98900 * D }, fifteenRateMaxCents: { single: 545500 * D, mfj: 613700 * D, mfs: 306850 * D, hoh: 579600 * D, qss: 613700 * D }, lowBasisPoints: 0, middleBasisPoints: 1500, highBasisPoints: 2000 },
    basis: 'net_capital_gain_and_qualified_dividends_taxed_at_zero_fifteen_and_twenty_percent_with_the_band_tops_measured_on_taxable_income',
    ...year(2026),
    act: 'IRC',
    section: '1(h); 1(j)(5)',
    source: `IRC section 1(h) and 1(j)(5); ${RP_2026} section 4.03 (${NOT_REREAD})`,
    attestations: []
  },
  {
    id: 'us.federal.individual.capital-loss-limit',
    value: { maxCents: 3000 * D, mfsMaxCents: 1500 * D },
    basis: 'net_capital_loss_allowed_against_ordinary_income_each_year_the_rest_carried_forward',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    act: 'IRC',
    section: '1211(b); 1212(b)',
    source: `IRC section 1211(b): losses allowed to the extent of gains plus the lower of three thousand dollars (one thousand five hundred married filing separately) or the excess loss; 1212(b) carryover. Not indexed. Registry coverage starts 1 January 2020 (${NOT_REREAD})`,
    attestations: []
  },
  {
    id: 'us.federal.individual.child-tax-credit',
    value: { perChildCents: 2200 * D, otherDependentCents: 500 * D, refundablePerChildCents: 1700 * D, earnedIncomeFloorCents: 2500 * D, refundableBasisPoints: 1500, phaseOutStartCents: { mfj: 400000 * D, other: 200000 * D }, phaseOutPerThousandCents: 50 * D },
    basis: 'credit_per_qualifying_child_under_17_and_per_other_dependent_reduced_by_the_step_for_each_thousand_or_part_of_modified_agi_above_the_start_refundable_part_limited_per_child_and_to_a_percent_of_earned_income_above_the_floor',
    ...year(2025),
    act: 'IRC',
    section: '24(h)',
    source: `IRC section 24(h) as amended by Public Law 119-21 section 70104: two thousand two hundred dollars per qualifying child from 2025, five hundred dollars per other dependent, phase-out from four hundred thousand dollars joint and two hundred thousand otherwise at fifty dollars per thousand; refundable portion one thousand seven hundred dollars for 2025 (${RP_2025}) at fifteen per cent of earned income above two thousand five hundred dollars (${NOT_REREAD})`,
    attestations: []
  },
  {
    id: 'us.federal.individual.child-tax-credit',
    value: { perChildCents: 2200 * D, otherDependentCents: 500 * D, refundablePerChildCents: 1700 * D, earnedIncomeFloorCents: 2500 * D, refundableBasisPoints: 1500, phaseOutStartCents: { mfj: 400000 * D, other: 200000 * D }, phaseOutPerThousandCents: 50 * D },
    basis: 'credit_per_qualifying_child_under_17_and_per_other_dependent_reduced_by_the_step_for_each_thousand_or_part_of_modified_agi_above_the_start_refundable_part_limited_per_child_and_to_a_percent_of_earned_income_above_the_floor',
    ...year(2026),
    act: 'IRC',
    section: '24(h)',
    source: `IRC section 24(h) as amended by Public Law 119-21 section 70104; ${RP_2026}: maximum credit two thousand two hundred dollars, refundable base amount one thousand seven hundred dollars (${NOT_REREAD})`,
    attestations: []
  },
  {
    id: 'us.federal.individual.eitc',
    value: {
      byChildren: [eitcRow(765, 8490, 765, 10620, 17730), eitcRow(3400, 12730, 1598, 23350, 30470), eitcRow(4000, 17880, 2106, 23350, 30470), eitcRow(4500, 17880, 2106, 23350, 30470)],
      investmentIncomeLimitCents: 11950 * D,
      noChildMinAge: 25,
      noChildMaxAge: 64,
      bandCents: 50 * D,
    },
    basis: 'credit_percent_of_earned_income_up_to_the_earned_income_amount_less_the_phase_out_percent_of_the_greater_of_agi_or_earned_income_above_the_start_by_number_of_qualifying_children_capped_at_three',
    ...year(2025),
    act: 'IRC',
    section: '32(b); 32(i); 32(j)',
    source: `IRC section 32(b) credit and phase-out percentages; earned income amounts, phase-out thresholds and the investment income limit from ${RP_2025} (maximum credits six hundred forty-nine, four thousand three hundred twenty-eight, seven thousand one hundred fifty-two and eight thousand forty-six dollars) (${NOT_REREAD}). The IRS EIC table works in fifty-dollar bands, encoded as bandCents`,
    attestations: []
  },
  {
    id: 'us.federal.individual.eitc',
    value: {
      byChildren: [eitcRow(765, 8680, 765, 10860, 18140), eitcRow(3400, 13020, 1598, 23890, 31160), eitcRow(4000, 18290, 2106, 23890, 31160), eitcRow(4500, 18290, 2106, 23890, 31160)],
      investmentIncomeLimitCents: 12200 * D,
      noChildMinAge: 25,
      noChildMaxAge: 64,
      bandCents: 50 * D,
    },
    basis: 'credit_percent_of_earned_income_up_to_the_earned_income_amount_less_the_phase_out_percent_of_the_greater_of_agi_or_earned_income_above_the_start_by_number_of_qualifying_children_capped_at_three',
    ...year(2026),
    act: 'IRC',
    section: '32(b); 32(i); 32(j)',
    source: `IRC section 32; ${RP_2026} section 4.06 (maximum credits six hundred sixty-four, four thousand four hundred twenty-seven, seven thousand three hundred sixteen and eight thousand two hundred thirty-one dollars; investment income limit twelve thousand two hundred dollars) (${NOT_REREAD})`,
    attestations: []
  },
  {
    id: 'us.federal.individual.education-credits',
    value: { aotcFullCents: 2000 * D, aotcQuarterCents: 2000 * D, aotcRefundableBasisPoints: 4000, aotcMaxYears: 4, llcBasisPoints: 2000, llcExpenseCapCents: 10000 * D, phaseOutCents: { mfj: { from: 160000 * D, to: 180000 * D }, other: { from: 80000 * D, to: 90000 * D } }, mfsAllowed: false },
    basis: 'american_opportunity_credit_of_all_the_first_and_a_quarter_of_the_next_qualified_expenses_per_student_forty_percent_refundable_lifetime_learning_credit_twenty_percent_of_expenses_per_return_both_phased_out_on_modified_agi',
    effectiveFrom: '2021-01-01',
    effectiveTo: null,
    act: 'IRC',
    section: '25A(b); 25A(c); 25A(d); 25A(i)',
    source: `IRC section 25A: American opportunity credit one hundred per cent of the first two thousand dollars and twenty-five per cent of the next two thousand of qualified expenses per eligible student, forty per cent refundable (25A(i)); lifetime learning credit twenty per cent of up to ten thousand dollars per return; both phased out between eighty and ninety thousand dollars of modified AGI (one hundred sixty and one hundred eighty thousand joint), unindexed since the Taxpayer Certainty and Disaster Tax Relief Act of 2020; no credit married filing separately (25A(g)(6)) (${NOT_REREAD})`,
    attestations: []
  },
  {
    id: 'us.federal.individual.salt-cap',
    value: { capCents: 40000 * D, mfsCapCents: 20000 * D, phaseDownStartCents: 500000 * D, mfsPhaseDownStartCents: 250000 * D, phaseDownBasisPoints: 3000, floorCents: 10000 * D, mfsFloorCents: 5000 * D },
    basis: 'itemized_state_and_local_tax_deduction_cap_reduced_by_a_percent_of_modified_agi_above_the_start_but_not_below_the_floor',
    ...year(2025),
    act: 'IRC',
    section: '164(b)(6)(B); 164(b)(7)',
    source: `IRC section 164(b)(6)(B) and 164(b)(7) as amended by Public Law 119-21 section 70120: forty thousand dollar cap for 2025 (twenty thousand married filing separately), reduced by thirty per cent of modified AGI above five hundred thousand dollars, never below ten thousand dollars (${NOT_REREAD})`,
    attestations: []
  },
  {
    id: 'us.federal.individual.salt-cap',
    value: { capCents: 40400 * D, mfsCapCents: 20200 * D, phaseDownStartCents: 505000 * D, mfsPhaseDownStartCents: 252500 * D, phaseDownBasisPoints: 3000, floorCents: 10000 * D, mfsFloorCents: 5000 * D },
    basis: 'itemized_state_and_local_tax_deduction_cap_reduced_by_a_percent_of_modified_agi_above_the_start_but_not_below_the_floor',
    ...year(2026),
    act: 'IRC',
    section: '164(b)(6)(B); 164(b)(7)',
    source: `IRC section 164(b)(6)(B) and 164(b)(7) as amended by Public Law 119-21 section 70120: cap and threshold rise by one per cent a year from 2026 (forty thousand four hundred and five hundred five thousand dollars) (${NOT_REREAD})`,
    attestations: []
  },
  {
    id: 'us.federal.individual.medical-floor',
    value: { basisPoints: 750 },
    basis: 'itemized_medical_and_dental_expenses_deductible_above_this_percent_of_agi',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    act: 'IRC',
    section: '213(a)',
    source: `IRC section 213(a) as amended by the Taxpayer Certainty and Disaster Tax Relief Act of 2020 (7.5 per cent made permanent). Registry coverage starts 1 January 2020 (${NOT_REREAD})`,
    attestations: []
  },
  {
    id: 'us.federal.individual.charitable',
    value: { cashAgiLimitBasisPoints: 6000, nonItemizerCents: { mfj: 0, other: 0 }, itemizedFloorBasisPoints: 0 },
    basis: 'cash_gifts_to_public_charities_deductible_up_to_a_percent_of_agi_non_itemizer_deduction_and_agi_floor_for_itemizers',
    effectiveFrom: '2020-01-01',
    effectiveTo: '2025-12-31',
    act: 'IRC',
    section: '170(b)(1)(G)',
    source: `IRC section 170(b)(1)(G): cash contributions to public charities up to sixty per cent of AGI (made permanent by Public Law 119-21 section 70425); no deduction for non-itemizers after 2021 (${NOT_REREAD}). Thirty and twenty per cent limits for property and private foundations are not encoded`,
    attestations: []
  },
  {
    id: 'us.federal.individual.charitable',
    value: { cashAgiLimitBasisPoints: 6000, nonItemizerCents: { mfj: 2000 * D, other: 1000 * D }, itemizedFloorBasisPoints: 50 },
    basis: 'cash_gifts_to_public_charities_deductible_up_to_a_percent_of_agi_non_itemizer_deduction_and_agi_floor_for_itemizers',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    act: 'IRC',
    section: '170(b)(1)(G); 170(p); 170(b)(1)(I)',
    source: `IRC section 170(p) added by Public Law 119-21 section 70424: non-itemizers deduct cash gifts to public charities up to one thousand dollars (two thousand joint) from 2026; section 170(b)(1)(I) added by section 70425: itemized charitable gifts count only above 0.5 per cent of the contribution base (${NOT_REREAD})`,
    attestations: []
  },
  {
    id: 'us.federal.individual.niit',
    value: { basisPoints: 380, thresholdCents: { mfj: 250000 * D, qss: 250000 * D, mfs: 125000 * D, single: 200000 * D, hoh: 200000 * D } },
    basis: 'net_investment_income_tax_on_the_lesser_of_net_investment_income_or_modified_agi_above_the_unindexed_threshold',
    effectiveFrom: '2013-01-01',
    effectiveTo: null,
    act: 'IRC',
    section: '1411',
    source: `IRC section 1411: 3.8 per cent of the lesser of net investment income or modified AGI over two hundred fifty thousand dollars (joint and surviving spouse), one hundred twenty-five thousand (separate) or two hundred thousand (others); not indexed (${NOT_REREAD})`,
    attestations: []
  },
  {
    id: 'us.federal.individual.social-security-benefits',
    value: { baseCents: { mfj: 32000 * D, mfs: 0, other: 25000 * D }, adjustedBaseCents: { mfj: 44000 * D, mfs: 0, other: 34000 * D }, firstBasisPoints: 5000, secondBasisPoints: 8500 },
    basis: 'taxable_part_of_social_security_benefits_half_above_the_base_amount_and_eighty_five_percent_above_the_adjusted_base_amount_of_provisional_income_mfs_living_together_base_zero',
    effectiveFrom: '1994-01-01',
    effectiveTo: null,
    act: 'IRC',
    section: '86',
    source: `IRC section 86(a), (b) and (c): base amounts twenty-five thousand dollars (thirty-two thousand joint, zero for a married person filing separately who lived with the spouse), adjusted base amounts thirty-four and forty-four thousand; unindexed since 1994 (${NOT_REREAD})`,
    attestations: []
  },
  {
    id: 'us.federal.individual.student-loan-interest',
    value: { maxCents: 2500 * D, phaseOutCents: { mfj: { from: 170000 * D, to: 200000 * D }, other: { from: 85000 * D, to: 100000 * D } }, mfsAllowed: false },
    basis: 'student_loan_interest_deduction_up_to_the_maximum_reduced_pro_rata_across_the_modified_agi_phase_out_range',
    ...year(2025),
    act: 'IRC',
    section: '221',
    source: `IRC section 221; phase-out range from ${RP_2025} (${NOT_REREAD})`,
    attestations: []
  },
  {
    id: 'us.federal.individual.student-loan-interest',
    value: { maxCents: 2500 * D, phaseOutCents: { mfj: { from: 175000 * D, to: 205000 * D }, other: { from: 85000 * D, to: 100000 * D } }, mfsAllowed: false },
    basis: 'student_loan_interest_deduction_up_to_the_maximum_reduced_pro_rata_across_the_modified_agi_phase_out_range',
    ...year(2026),
    act: 'IRC',
    section: '221',
    source: `IRC section 221; ${RP_2026} section 4.24 (${NOT_REREAD})`,
    attestations: []
  },
  {
    id: 'us.federal.individual.senior-deduction',
    value: { perPersonCents: 6000 * D, minAge: 65, phaseOutStartCents: { mfj: 150000 * D, other: 75000 * D }, phaseOutBasisPoints: 600, mfsAllowed: false },
    basis: 'deduction_for_each_taxpayer_or_spouse_aged_65_or_over_reduced_by_a_percent_of_modified_agi_above_the_start',
    effectiveFrom: '2025-01-01',
    effectiveTo: '2028-12-31',
    act: 'IRC',
    section: '151(d)(5)(C)',
    source: `IRC section 151(d)(5)(C) added by Public Law 119-21 section 70103: six thousand dollars for each individual aged sixty-five or over, reduced by six per cent of modified AGI over seventy-five thousand dollars (one hundred fifty thousand joint), a valid SSN needed, joint return needed if married, for 2025 to 2028; taken on Schedule 1-A whether or not the taxpayer itemizes (${NOT_REREAD})`,
    attestations: []
  },
  {
    id: 'us.federal.individual.tips-deduction',
    value: { maxCents: 25000 * D, phaseOutStartCents: { mfj: 300000 * D, other: 150000 * D }, phaseOutPerThousandCents: 100 * D, mfsAllowed: false },
    basis: 'deduction_for_qualified_tips_up_to_the_maximum_per_return_reduced_by_the_step_per_thousand_of_modified_agi_above_the_start',
    effectiveFrom: '2025-01-01',
    effectiveTo: '2028-12-31',
    act: 'IRC',
    section: '224',
    source: `IRC section 224 added by Public Law 119-21 section 70201: qualified tips up to twenty-five thousand dollars, reduced by one hundred dollars per thousand of modified AGI over one hundred fifty thousand (three hundred thousand joint), for 2025 to 2028 (${NOT_REREAD}). Whether an occupation customarily receives tips is the taxpayer's statement`,
    attestations: []
  },
  {
    id: 'us.federal.individual.overtime-deduction',
    value: { maxCents: { mfj: 25000 * D, other: 12500 * D }, phaseOutStartCents: { mfj: 300000 * D, other: 150000 * D }, phaseOutPerThousandCents: 100 * D, mfsAllowed: false },
    basis: 'deduction_for_the_premium_part_of_qualified_overtime_up_to_the_maximum_reduced_by_the_step_per_thousand_of_modified_agi_above_the_start',
    effectiveFrom: '2025-01-01',
    effectiveTo: '2028-12-31',
    act: 'IRC',
    section: '225',
    source: `IRC section 225 added by Public Law 119-21 section 70202: the premium part of FLSA overtime up to twelve thousand five hundred dollars (twenty-five thousand joint), reduced by one hundred dollars per thousand of modified AGI over one hundred fifty thousand (three hundred thousand joint), for 2025 to 2028 (${NOT_REREAD})`,
    attestations: []
  },
  {
    id: 'us.federal.individual.car-loan-interest',
    value: { maxCents: 10000 * D, phaseOutStartCents: { mfj: 200000 * D, other: 100000 * D }, phaseOutPerThousandCents: 200 * D },
    basis: 'deduction_for_interest_on_a_loan_for_a_new_us_assembled_personal_vehicle_up_to_the_maximum_reduced_by_the_step_per_thousand_of_modified_agi_above_the_start',
    effectiveFrom: '2025-01-01',
    effectiveTo: '2028-12-31',
    act: 'IRC',
    section: '163(h)(4)',
    source: `IRC section 163(h)(4) added by Public Law 119-21 section 70203: up to ten thousand dollars of interest on a loan taken after 2024 for a new personal vehicle with final assembly in the United States, reduced by two hundred dollars per thousand of modified AGI over one hundred thousand (two hundred thousand joint), for 2025 to 2028 (${NOT_REREAD})`,
    attestations: []
  },
  {
    id: 'us.federal.individual.qbi',
    value: { basisPoints: 2000, thresholdCents: { mfj: 394600 * D, qss: 394600 * D, mfs: 197300 * D, single: 197300 * D, hoh: 197300 * D } },
    basis: 'qualified_business_income_deduction_simplified_computation_available_at_or_below_the_taxable_income_threshold',
    ...year(2025),
    act: 'IRC',
    section: '199A',
    source: `IRC section 199A made permanent by Public Law 119-21 section 70105; threshold amounts from ${RP_2025} (${NOT_REREAD}). Above the threshold, the wage and property limits and specified service rules apply and are not encoded`,
    attestations: []
  },
  {
    id: 'us.federal.individual.qbi',
    value: { basisPoints: 2000, thresholdCents: { mfj: 403500 * D, qss: 403500 * D, mfs: 201775 * D, single: 201750 * D, hoh: 201750 * D } },
    basis: 'qualified_business_income_deduction_simplified_computation_available_at_or_below_the_taxable_income_threshold',
    ...year(2026),
    act: 'IRC',
    section: '199A',
    source: `IRC section 199A as amended by Public Law 119-21 section 70105; ${RP_2026} section 4.26 (${NOT_REREAD}). The minimum deduction for active QBI of at least one thousand dollars from 2026 is not encoded`,
    attestations: []
  },
  {
    id: 'us.federal.individual.return-due',
    value: { month: 4, day: 15 },
    basis: 'individual_income_tax_return_due_day_of_the_year_after_the_tax_year_for_a_calendar_year_filer',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    act: 'IRC',
    section: '6072(a)',
    source: `IRC section 6072(a): the fifteenth day of the fourth month after the end of the tax year; the weekend and holiday shift under section 7503 and the automatic six-month extension on Form 4868 are not encoded (${NOT_REREAD})`,
    attestations: []
  },
  {
    id: 'us.federal.individual.foreign-tax-election',
    value: { maxCents: { mfj: 600 * D, other: 300 * D } },
    basis: 'foreign_tax_credit_claimed_without_form_1116_when_all_foreign_income_is_passive_and_reported_on_a_payee_statement_and_the_tax_is_at_or_below_this_amount',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    act: 'IRC',
    section: '904(j)',
    source: `IRC section 904(j): an individual whose creditable foreign taxes are three hundred dollars or less (six hundred joint), all on qualified passive income reported on a payee statement, may elect out of the limitation and claim the credit without Form 1116 (${NOT_REREAD})`,
    attestations: []
  },
  {
    id: 'us.federal.individual.estimated-tax-penalty',
    value: { minimumUnderpaymentCents: 1000 * D, currentYearBasisPoints: 9000, priorYearBasisPoints: 10000, highIncomePriorYearBasisPoints: 11000, highIncomeAgiCents: { mfs: 75000 * D, other: 150000 * D } },
    basis: 'no_underpayment_penalty_when_the_balance_due_after_withholding_is_under_the_minimum_or_payments_reach_the_current_year_or_prior_year_share_of_tax',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    act: 'IRC',
    section: '6654(d)(1), 6654(e)(1)',
    source: `IRC section 6654: no addition to tax when the tax shown less withholding is under one thousand dollars; otherwise the required annual payment is the lesser of ninety percent of this year's tax and one hundred percent of last year's tax, one hundred ten percent when last year's AGI exceeded one hundred fifty thousand dollars (seventy-five thousand married filing separately); the annualized method and waivers are not encoded (${NOT_REREAD})`,
    attestations: []
  },
  {
    id: 'us.federal.individual.educator-expenses',
    value: { maxPerEducatorCents: 300 * D },
    basis: 'above_the_line_deduction_for_unreimbursed_classroom_expenses_of_an_eligible_educator',
    ...year(2025),
    act: 'IRC',
    section: '62(a)(2)(D)',
    source: `IRC section 62(a)(2)(D); three hundred dollars per eligible educator for 2025 (${RP_2025}) (${NOT_REREAD})`,
    attestations: []
  },
  {
    id: 'us.federal.individual.educator-expenses',
    value: { maxPerEducatorCents: 350 * D },
    basis: 'above_the_line_deduction_for_unreimbursed_classroom_expenses_of_an_eligible_educator',
    ...year(2026),
    act: 'IRC',
    section: '62(a)(2)(D)',
    source: `IRC section 62(a)(2)(D); ${RP_2026}: three hundred fifty dollars (${NOT_REREAD})`,
    attestations: []
  },
];
