const D = 100;
const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const limits = (selfOnly, family) => ({ selfOnlyCents: selfOnly * D, familyCents: family * D, catchUpCents: 1000 * D, catchUpAge: 55 });
const CATCH_UP = 'The $1,000 additional contribution at age 55 (IRC section 223(b)(3)(B)) is fixed by statute and not indexed';
const BASIS = 'hsa_annual_deduction_limit_for_self_only_and_family_hdhp_coverage_before_proration_by_eligible_months_plus_the_fixed_catch_up_contribution_from_age_55';

export const RULES = [
  {
    id: 'us.federal.individual.hsa-limits',
    value: limits(4300, 8550),
    basis: BASIS,
    ...year(2025),
    act: 'IRC',
    section: '223(b)(2), 223(b)(3), 223(g)',
    source: `Rev. Proc. 2024-25 section 2.01(1), read from irs.gov/pub/irs-drop/rp-24-25.pdf on 2026-11-21: $4,300 self-only and $8,550 family for calendar year 2025. Confirmed in the 2025 Instructions for Form 8889 (Figuring Your HSA Deduction and the Line 3 Limitation Chart, $5,300 and $9,550 with the catch-up), irs.gov/pub/irs-prior/i8889--2025.pdf, read on 2026-11-21. ${CATCH_UP}`,
    attestations: []
  },
  {
    id: 'us.federal.individual.hsa-limits',
    value: limits(4400, 8750),
    basis: BASIS,
    ...year(2026),
    act: 'IRC',
    section: '223(b)(2), 223(b)(3), 223(g)',
    source: `Rev. Proc. 2025-19 section 2.01(1), read from irs.gov/pub/irs-drop/rp-25-19.pdf on 2026-11-21: $4,400 self-only and $8,750 family for calendar year 2026. Confirmed on line 3 of the 2026 Form 8889 (created 4/30/26), irs.gov/pub/irs-pdf/f8889.pdf, read on 2026-11-21. ${CATCH_UP}`,
    attestations: []
  },
  {
    id: 'us.federal.individual.hsa-limits',
    value: limits(4500, 9000),
    basis: BASIS,
    ...year(2027),
    act: 'IRC',
    section: '223(b)(2), 223(b)(3), 223(g)',
    source: `Rev. Proc. 2026-24 section 3.01(1), read from irs.gov/pub/irs-drop/rp-26-24.pdf on 2026-11-21: $4,500 self-only and $9,000 family for calendar year 2027. The 2027 Form 8889 is not yet published. ${CATCH_UP}`,
    attestations: []
  },
  {
    id: 'us.federal.individual.hsa-additional-taxes',
    value: { nonQualifiedDistributionBasisPoints: 2000, exceptionAge: 65, testingPeriodBasisPoints: 1000 },
    basis: 'additional_tax_as_basis_points_on_hsa_distributions_not_used_for_qualified_medical_expenses_unless_after_death_disability_or_age_65_and_on_income_from_failing_the_last_month_rule_testing_period',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    act: 'IRC',
    section: '223(f)(4), 223(b)(8)(B)',
    source: 'IRC section 223(f)(4)(A): 20 percent additional tax on HSA distributions included in gross income; 223(f)(4)(B) and (C): not applied to distributions after the account beneficiary dies, becomes disabled or reaches the Medicare eligibility age of section 1811 of the Social Security Act (65). IRC section 223(b)(8)(B): an amount included in income for failing to remain an eligible individual during the testing period after using the last-month rule is increased by 10 percent, except on death or disability. Not indexed. Checked against Form 8889 lines 17b and 21 and the 2025 Instructions for Form 8889 (Exceptions to the Additional 20% Tax, Part III), irs.gov/pub/irs-prior/i8889--2025.pdf, read on 2026-11-21. Registry coverage starts 1 January 2020',
    attestations: []
  },
];
