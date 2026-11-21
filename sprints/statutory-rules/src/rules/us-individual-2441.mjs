const D = 100;
const READ_2025 = 'read from the 2025 Form 2441 and its instructions (irs.gov/pub/irs-pdf/f2441.pdf, irs.gov/pub/irs-pdf/i2441.pdf) and Pub. 503 (2025) on 2026-11-21';
const READ_2026 = 'read from the 2026 draft Form 2441 (created 4/30/26, irs.gov/pub/irs-dft/f2441--dft.pdf) and the 2026 draft instructions (irs.gov/pub/irs-dft/i2441--dft.pdf, What\'s New and the line 8 2026 Phaseout Schedule) and checked against the amended text of IRC section 21(a)(2) on law.cornell.edu on 2026-11-21; the final 2026 instructions were not yet published';

const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const both = (amount) => ({ joint: amount * D, other: amount * D });

export const RULES = [
  {
    id: 'us.federal.individual.dependent-care-credit',
    value: {
      onePersonExpenseCents: 3000 * D,
      twoOrMoreExpenseCents: 6000 * D,
      initialBasisPoints: 3500,
      pointBasisPoints: 100,
      phases: [{ startCents: both(15000), stepCents: both(2000), floorBasisPoints: 2000 }],
      deemedMonthlyCents: { one: 250 * D, twoOrMore: 500 * D },
    },
    basis: 'credit_is_the_applicable_percentage_of_employment_related_care_expenses_up_to_the_dollar_limit_for_one_or_two_or_more_qualifying_persons_reduced_by_excluded_benefits_and_limited_to_the_smaller_earned_income_percentage_reduced_one_point_per_step_or_part_of_agi_above_each_start_but_not_below_its_floor',
    ...year(2025),
    act: 'IRC',
    section: '21(a)(2); 21(c); 21(d)(2); 21(e)(2); 21(e)(4)',
    source: `IRC section 21 before Public Law 119-21: thirty-five per cent reduced by one point for each two thousand dollars or part of AGI above fifteen thousand dollars, not below twenty per cent (the Form 2441 line 8 table reaches .20 above forty-three thousand dollars); dollar limit three thousand dollars for one qualifying person and six thousand for two or more, reduced by benefits excluded under section 129; a student or disabled spouse is deemed to earn two hundred fifty dollars a month (five hundred with two or more qualifying persons), for only one spouse in any month; married filing separately only when treated as unmarried under section 21(e)(4) (${READ_2025})`,
    attestations: []
  },
  {
    id: 'us.federal.individual.dependent-care-credit',
    value: {
      onePersonExpenseCents: 3000 * D,
      twoOrMoreExpenseCents: 6000 * D,
      initialBasisPoints: 5000,
      pointBasisPoints: 100,
      phases: [
        { startCents: both(15000), stepCents: both(2000), floorBasisPoints: 3500 },
        { startCents: { joint: 150000 * D, other: 75000 * D }, stepCents: { joint: 4000 * D, other: 2000 * D }, floorBasisPoints: 2000 },
      ],
      deemedMonthlyCents: { one: 250 * D, twoOrMore: 500 * D },
    },
    basis: 'credit_is_the_applicable_percentage_of_employment_related_care_expenses_up_to_the_dollar_limit_for_one_or_two_or_more_qualifying_persons_reduced_by_excluded_benefits_and_limited_to_the_smaller_earned_income_percentage_reduced_one_point_per_step_or_part_of_agi_above_each_start_but_not_below_its_floor',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    act: 'IRC',
    section: '21(a)(2); 21(c); 21(d)(2); 21(e)(2); 21(e)(4)',
    source: `IRC section 21(a)(2) as amended by Public Law 119-21 section 70405 for taxable years beginning after 31 December 2025: fifty per cent reduced (not below thirty-five per cent) by one point for each two thousand dollars or part of AGI above fifteen thousand dollars, then further reduced (not below twenty per cent) by one point for each two thousand dollars (four thousand on a joint return) or part above seventy-five thousand dollars (one hundred fifty thousand joint); the joint figures apply to married filing jointly only; the amounts are not indexed; the dollar limits of three and six thousand dollars and the deemed income of two hundred fifty and five hundred dollars a month are unchanged (${READ_2026})`,
    attestations: []
  },
  {
    id: 'us.federal.individual.dependent-care-exclusion',
    value: { maxCents: 5000 * D, mfsMaxCents: 2500 * D },
    basis: 'dependent_care_assistance_excluded_from_gross_income_up_to_the_annual_maximum_half_for_a_married_person_filing_separately_and_limited_to_the_smaller_earned_income',
    ...year(2025),
    act: 'IRC',
    section: '129(a)(2)(A); 129(b)',
    source: `IRC section 129(a)(2)(A): five thousand dollars, two thousand five hundred dollars for a married individual filing separately; Form 2441 line 21 (${READ_2025})`,
    attestations: []
  },
  {
    id: 'us.federal.individual.dependent-care-exclusion',
    value: { maxCents: 7500 * D, mfsMaxCents: 3750 * D },
    basis: 'dependent_care_assistance_excluded_from_gross_income_up_to_the_annual_maximum_half_for_a_married_person_filing_separately_and_limited_to_the_smaller_earned_income',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    act: 'IRC',
    section: '129(a)(2)(A); 129(b)',
    source: `IRC section 129(a)(2)(A) as amended by Public Law 119-21 section 70404 for taxable years beginning after 31 December 2025: seven thousand five hundred dollars, three thousand seven hundred fifty dollars married filing separately, not indexed, as shown in the section 129 text and amendment note on uscode.house.gov read on 2026-11-21; 2026 draft Form 2441 line 21 (${READ_2026})`,
    attestations: []
  },
];
