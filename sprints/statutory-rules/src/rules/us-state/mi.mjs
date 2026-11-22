const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const COPY = 'michigan.gov refuses automated downloads, so the identical Treasury PDF was read from the NBER TAXSIM state form archive (taxsim.nber.org/historical_state_tax_forms/MI/2025/)';
const BOOK_2025 = `Michigan Department of Treasury, 2025 MI-1040 Individual Income Tax instruction book (michigan.gov/taxes/-/media/Project/Websites/taxes/Forms/IIT/TY2025/MI-1040-Book.pdf), ${COPY}, read 2026-11-21`;
const FORM_2025 = `Michigan Department of Treasury, 2025 Form MI-1040 (Rev. 06-25) and Schedule 1 (Form 3423, Rev. 04-25) (michigan.gov/taxes/-/media/Project/Websites/taxes/Forms/IIT/TY2025/MI-1040.pdf and Schedule-1.pdf), ${COPY}, read 2026-11-21`;
const F4884_2025 = `Michigan Department of Treasury, 2025 Form 4884 (Rev. 05-25) and Form 4884 instructions with Worksheets 3.1 to 3.3 (michigan.gov/taxes/-/media/Project/Websites/taxes/Forms/IIT/TY2025/4884.pdf and 4884-Instr.pdf), ${COPY}, read 2026-11-21`;
const CR_2025 = `Michigan Department of Treasury, 2025 MI-1040CR (Rev. 04-25) and MI-1040CR instructions, Tables 2, A and B and Worksheets 4 and 5 (michigan.gov/taxes/-/media/Project/Websites/taxes/Forms/IIT/TY2025/MI-1040CR.pdf and MI-1040CR-Instr.pdf), ${COPY}, read 2026-11-21`;
const RATE_2026 = 'Michigan Department of Treasury taxpayer notice "4.25% Income Tax Rate for Individuals and Fiduciaries in 2026 Tax Year" (michigan.gov/treasury/reference/taxpayer-notices/2026/04/15/425-income-tax-rate-for-individuals-and-fiduciaries-in-2026-tax-year): general fund revenue fell 1.56% while inflation rose 2.70%, so the MCL 206.51(1)(c) reduction does not apply and "the rate in effect under Section 51 for the 2026 tax year is 4.25%", read 2026-11-21';
const EXEMPTION_2026 = 'Michigan Department of Treasury, Calendar Year Tax Information (michigan.gov/taxes/business-taxes/withholding/calendar-year-tax-information): "2026: Withholding Rate 4.25%, Personal Exemption $5,900", read 2026-11-21';
const NOT_PUBLISHED_2026 = 'Michigan Treasury has not published the 2026 MI-1040 forms or instructions as of 2026-11-21; Revenue Administrative Bulletin 2026-1 (michigan.gov/taxes/rep-legal/rab/2026-revenue-administrative-bulletins/revenue-administrative-bulletin-2026-1, read 2026-11-21) gives no 2026 dollar figure for the indexed amounts, so the 2025 amounts are carried and the record is marked provisional';

export const RULES = [
  {
    id: 'us.state-return.mi.income-tax',
    value: { rateBasisPoints: 425, personalExemption: 5800 },
    basis: 'flat_rate_on_taxable_income_after_the_personal_and_dependent_exemption_allowance',
    ...year(2025),
    act: 'Michigan Income Tax Act of 1967 (1967 PA 281)',
    section: 'MCL 206.51(1)(b) and (c); 206.30(2)',
    source: `${BOOK_2025}, General Information: "The income tax rate for 2025 is 4.25 percent" and "the personal and stillbirth exemption allowances are $5,800"; ${FORM_2025}, line 9a ($5,800) and line 17 ("Multiply line 16 by 4.25%")`,
    attestations: []
  },
  {
    id: 'us.state-return.mi.income-tax',
    value: { rateBasisPoints: 425, personalExemption: 5900 },
    basis: 'flat_rate_on_taxable_income_after_the_personal_and_dependent_exemption_allowance',
    ...year(2026),
    act: 'Michigan Income Tax Act of 1967 (1967 PA 281)',
    section: 'MCL 206.51(1)(b) and (c); 206.30(2)',
    source: `${RATE_2026}; ${EXEMPTION_2026}`,
    attestations: []
  },
  {
    id: 'us.state-return.mi.special-exemptions',
    value: { specialExemption: 3400, disabledVeteranExemption: 500, stillbirthExemption: 5800, dependentOfAnotherExemption: 1500 },
    basis: 'additional_exemptions_for_deaf_blind_or_disabled_people_qualified_disabled_veterans_and_stillbirths_and_the_fixed_allowance_for_a_filer_claimed_as_a_dependent',
    ...year(2025),
    act: 'Michigan Income Tax Act of 1967 (1967 PA 281)',
    section: 'MCL 206.30(2), (3)',
    source: `${BOOK_2025}, Line 9: special exemption $3,400, qualified disabled veterans $500, stillbirth $5,800, and line 9e "enter $1,500" when someone else can claim you; ${FORM_2025}, lines 9b to 9e`,
    attestations: []
  },
  {
    id: 'us.state-return.mi.special-exemptions',
    value: { specialExemption: 3400, disabledVeteranExemption: 500, stillbirthExemption: 5900, dependentOfAnotherExemption: 1500, provisional: true },
    basis: 'additional_exemptions_for_deaf_blind_or_disabled_people_qualified_disabled_veterans_and_stillbirths_and_the_fixed_allowance_for_a_filer_claimed_as_a_dependent',
    ...year(2026),
    act: 'Michigan Income Tax Act of 1967 (1967 PA 281)',
    section: 'MCL 206.30(2), (3)',
    source: `${NOT_PUBLISHED_2026}. The stillbirth allowance follows the personal exemption, which Treasury gives as $5,900 for 2026 (${EXEMPTION_2026}); the indexed special exemption is carried at the 2025 $3,400`,
    attestations: []
  },
  {
    id: 'us.state-return.mi.retirement',
    value: { retirementLimit: { single: 65897, joint: 131794 }, phaseInBasisPoints: 7500, phaseInBornFrom: 1946, phaseInBornThrough: 1966, tier2BornFrom: 1946, tier2BornThrough: 1952, tier3BornFrom: '1953-01-01', tier3BornThrough: '1959-01-01', standardDeduction: { single: 20000, joint: 40000 }, standardDeductionAge: 67, socialSecurityReducesTier3: true, seniorInvestmentLimit: { single: 14688, joint: 29376 }, seniorInvestmentBornBefore: 1946 },
    basis: 'retirement_and_pension_subtraction_by_year_of_birth_with_the_2023_phase_in_michigan_standard_deduction_tiers_and_the_senior_interest_dividend_and_capital_gain_deduction',
    ...year(2025),
    act: 'Michigan Income Tax Act of 1967 (1967 PA 281), as amended by 2023 PA 4',
    section: 'MCL 206.30(1)(f), (9) and (10)',
    source: `${F4884_2025}: Section A line 9 "$65,897 if single or $131,794 if filing jointly", Worksheet 3.3 "Multiply line 3 by 75%" (Section D, born 1946 through 1966, maximum $49,423 / $98,846); ${BOOK_2025}, Schedule 1 lines 25, 26 and 28 and Worksheet 2 (Tier 2 born 1946 through 1952, Tier 3 born January 1, 1953 through January 1, 1959 and age 67, $20,000 / $40,000, reduced on Tier 3 by taxable Social Security and the exemptions on lines 9a and 9d; senior deduction limited to $14,688 / $29,376 for those born before 1946)`,
    attestations: []
  },
  {
    id: 'us.state-return.mi.retirement',
    value: { retirementLimit: { single: 65897, joint: 131794 }, phaseInBasisPoints: 10000, phaseInBornFrom: 1946, phaseInBornThrough: null, tier2BornFrom: 1946, tier2BornThrough: 1952, tier3BornFrom: '1953-01-01', tier3BornThrough: '1959-01-01', standardDeduction: { single: 20000, joint: 40000 }, standardDeductionAge: 67, socialSecurityReducesTier3: false, seniorInvestmentLimit: { single: 14688, joint: 29376 }, seniorInvestmentBornBefore: 1946, provisional: true },
    basis: 'retirement_and_pension_subtraction_for_every_year_of_birth_up_to_the_indexed_limit_michigan_standard_deduction_tiers_and_the_senior_interest_dividend_and_capital_gain_deduction',
    ...year(2026),
    act: 'Michigan Income Tax Act of 1967 (1967 PA 281), as amended by 2023 PA 4 and 2025 PA 24',
    section: 'MCL 206.30(1)(f), (9) and (10)',
    source: `Revenue Administrative Bulletin 2026-1: for 2026, "regardless of year of birth, taxpayers may deduct combined public and private retirement benefits" up to the inflation-adjusted private limit (no 2026 dollar figure given); Michigan Treasury taxpayer notice "Social Security Taxation Changes in Public Act 24 of 2025" (michigan.gov/treasury/reference/taxpayer-notices/2025/11/17/social-security-taxation-changes-in-public-act-24-of-2025, read 2026-11-21): for 2026 through 2028 the standard deduction is no longer offset by the Social Security subtraction. ${NOT_PUBLISHED_2026}; the $65,897 / $131,794 limit and the $14,688 / $29,376 senior limit are 2025 amounts`,
    attestations: []
  },
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.mi.credits',
    value: { eitcBasisPoints: 3000, organDonationMaximum: 10000 },
    basis: 'michigan_earned_income_credit_is_30_percent_of_the_federal_credit_and_the_organ_donation_credit_is_capped',
    ...year(y),
    act: 'Michigan Income Tax Act of 1967 (1967 PA 281), as amended by 2023 PA 4',
    section: 'MCL 206.272(1)(d); MI-1040 line 20 organ donation credit',
    source: `Michigan Legislature, MCL 206.272 (legislature.mi.gov/Laws/MCL?objectName=mcl-206-272): "(d) For tax years that begin after December 31, 2022, 30%", read 2026-11-21; ${BOOK_2025}, line 28 ("30 percent of the taxpayer's federal credit") and line 20 (organ donation expenses "or $10,000, whichever is less")${y === 2026 ? '; both amounts are fixed in the statute, not indexed' : ''}`,
    attestations: []
  })),
  {
    id: 'us.state-return.mi.adjustments',
    value: { educationSavingsLimit: { single: 5000, joint: 10000 }, ableLimit: { single: 5000, joint: 10000 }, combinedLimit: { single: 10000, joint: 20000 }, tipsAndOvertimeSubtraction: false },
    basis: 'schedule_1_limits_for_michigan_529_and_able_contributions_and_whether_the_tips_and_overtime_subtraction_applies',
    ...year(2025),
    act: 'Michigan Income Tax Act of 1967 (1967 PA 281)',
    section: 'MCL 206.30(1)',
    source: `${BOOK_2025}, Schedule 1 line 17 (MESP and MAP "$5,000 for a single return or $10,000 for a joint return", MiABLE the same, total "$10,000 ... or $20,000"); Michigan Treasury taxpayer notice "New Deductions for Qualified Overtime Compensation and Qualified Tips" (michigan.gov/treasury/reference/taxpayer-notices/2026/01/06/new-deductions-for-qualified-overtime-compensation-and-qualified-tips, read 2026-11-21): the deductions "are not available for tax year 2025"`,
    attestations: []
  },
  {
    id: 'us.state-return.mi.adjustments',
    value: { educationSavingsLimit: { single: 5000, joint: 10000 }, ableLimit: { single: 5000, joint: 10000 }, combinedLimit: { single: 10000, joint: 20000 }, tipsAndOvertimeSubtraction: true },
    basis: 'schedule_1_limits_for_michigan_529_and_able_contributions_and_whether_the_tips_and_overtime_subtraction_applies',
    ...year(2026),
    act: 'Michigan Income Tax Act of 1967 (1967 PA 281), as amended by 2025 PA 24',
    section: 'MCL 206.30(1)(x) and (1)(ee)',
    source: `Michigan Treasury taxpayer notice "New Deductions for Qualified Overtime Compensation and Qualified Tips" (2026-01-06, read 2026-11-21): for 2026 to 2028 residents deduct the qualified tips and overtime deducted on the federal return and nonresidents the part for services in Michigan (statutory, final). The 529 and ABLE limits are fixed in MCL 206.30(1)(x) ("not to exceed a total deduction of $5,000.00 for a single return or $10,000.00 for a joint return per tax year"; legislature.mi.gov/Laws/MCL?objectName=mcl-206-30, read 2026-11-21) and are not indexed, so the record is not provisional`,
    attestations: []
  },
  {
    id: 'us.state-return.mi.homestead-credit',
    value: { taxableValueMaximum: 165400, householdResourcesMaximum: 71500, phaseOutFrom: 62500, phaseOutStep: 1000, phaseOutStepBasisPoints: 1000, maximumCredit: 1900, rentBasisPoints: 2300, generalNonRefundableBasisPoints: 320, otherClaimantsNonRefundable: [{ upTo: 3000, basisPoints: 0 }, { upTo: 4000, basisPoints: 100 }, { upTo: 5000, basisPoints: 200 }, { upTo: 6000, basisPoints: 300 }, { upTo: null, basisPoints: 320 }], seniorShare: [{ upTo: 21000, basisPoints: 10000 }, { upTo: 22000, basisPoints: 9600 }, { upTo: 23000, basisPoints: 9200 }, { upTo: 24000, basisPoints: 8800 }, { upTo: 25000, basisPoints: 8400 }, { upTo: 26000, basisPoints: 8000 }, { upTo: 27000, basisPoints: 7600 }, { upTo: 28000, basisPoints: 7200 }, { upTo: 29000, basisPoints: 6800 }, { upTo: 30000, basisPoints: 6400 }, { upTo: null, basisPoints: 6000 }], generalShareBasisPoints: 6000, seniorRenterBasisPoints: 4000, seniorAge: 65 },
    basis: 'homestead_property_tax_credit_property_tax_or_23_percent_of_rent_above_a_share_of_total_household_resources_with_the_claimant_share_phase_out_and_cap',
    ...year(2025),
    act: 'Michigan Income Tax Act of 1967 (1967 PA 281), as amended by 2023 PA 4',
    section: 'MCL 206.508; 206.520',
    source: `${CR_2025}: line 9 taxable value $165,400, line 12 rent times 23%, line 33 limit $71,500, Table 2 (3.2%; 0% to 3% for other claimants up to $6,000), Table A senior percentages, line 41 60%, maximum credit $1,900, Table B 10% less for each $1,000 or part above $62,500, Worksheet 5 (40% of total household resources)`,
    attestations: []
  },
  {
    id: 'us.state-return.mi.homestead-credit',
    value: { taxableValueMaximum: 165400, householdResourcesMaximum: 71500, phaseOutFrom: 62500, phaseOutStep: 1000, phaseOutStepBasisPoints: 1000, maximumCredit: 1900, rentBasisPoints: 2300, generalNonRefundableBasisPoints: 320, otherClaimantsNonRefundable: [{ upTo: 3000, basisPoints: 0 }, { upTo: 4000, basisPoints: 100 }, { upTo: 5000, basisPoints: 200 }, { upTo: 6000, basisPoints: 300 }, { upTo: null, basisPoints: 320 }], seniorShare: [{ upTo: 21000, basisPoints: 10000 }, { upTo: 22000, basisPoints: 9600 }, { upTo: 23000, basisPoints: 9200 }, { upTo: 24000, basisPoints: 8800 }, { upTo: 25000, basisPoints: 8400 }, { upTo: 26000, basisPoints: 8000 }, { upTo: 27000, basisPoints: 7600 }, { upTo: 28000, basisPoints: 7200 }, { upTo: 29000, basisPoints: 6800 }, { upTo: 30000, basisPoints: 6400 }, { upTo: null, basisPoints: 6000 }], generalShareBasisPoints: 6000, seniorRenterBasisPoints: 4000, seniorAge: 65, provisional: true },
    basis: 'homestead_property_tax_credit_property_tax_or_23_percent_of_rent_above_a_share_of_total_household_resources_with_the_claimant_share_phase_out_and_cap',
    ...year(2026),
    act: 'Michigan Income Tax Act of 1967 (1967 PA 281), as amended by 2023 PA 4',
    section: 'MCL 206.508; 206.520',
    source: `${NOT_PUBLISHED_2026}; the taxable value limit, household resources limit, phase-out start and maximum credit are indexed each year and the 2026 MI-1040CR is not out`,
    attestations: []
  }
];
