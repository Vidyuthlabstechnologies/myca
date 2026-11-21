const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const PA40_2025 = 'Pennsylvania Department of Revenue, 2025 PA-40 Instructions Booklet PA-40 IN 04-25 (pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40in.pdf) and 2025 Form PA-40 (2025_pa-40.pdf in the same folder), read 2026-11-21';
const SP_2025 = 'Pennsylvania Department of Revenue, 2025 PA-40 Schedule SP Special Tax Forgiveness and its instructions PA-40 SP IN 04-25 (pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40sp.pdf), Eligibility Income Tables 1 and 2, read 2026-11-21';
const O_2025 = 'Pennsylvania Department of Revenue, 2025 PA-40 Schedule O Other Deductions and instructions PA-40 O IN 04-25 (pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40o.pdf), read 2026-11-21';
const BUDGET_2026 = 'no Pennsylvania personal income tax change for 2026 was enacted in the 2026-27 budget (CBIZ, Pennsylvania budget delivers few tax law changes, cbiz.com/insights/article/pennsylvania-budget-delivers-few-tax-law-changes-but-local-sales-tax-sourcing-gets-a-major-reset, read 2026-11-21); the 2026 PA-40 booklet is not published as of 2026-11-21';

export const RULES = [
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.pa.income-tax',
    value: { rateBasisPoints: 307 },
    basis: 'flat_rate_on_adjusted_pa_taxable_income_the_sum_of_the_positive_income_classes_less_schedule_o_deductions',
    ...year(y),
    act: 'Tax Reform Code of 1971 (72 P.S. 7101 et seq.), Article III',
    section: '302; 303',
    source: y === 2025 ? `${PA40_2025}: "The state income tax rate for 2025 is 3.07 percent (0.0307)"; Line 9 "Add only the positive income amounts from Lines 1c, 2, 3, 4, 5, 6, 7, and 8"; Line 12 "Multiply Line 11 by 3.07 percent"` : `The 3.07 percent rate is fixed by 72 P.S. 7302 and is not indexed; ${BUDGET_2026}`,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.pa.tax-forgiveness',
    value: { unmarriedBase: 6500, marriedBase: 13000, perDependent: 9500, step: 250, steps: 10 },
    basis: 'schedule_sp_forgiveness_100_percent_up_to_6500_unmarried_or_13000_married_plus_9500_per_dependent_child_then_10_points_less_for_each_250_of_eligibility_income_down_to_10_percent',
    ...year(y),
    act: 'Tax Reform Code of 1971 (72 P.S. 7101 et seq.), Article III',
    section: '304',
    source: y === 2025 ? `${SP_2025}: Table 1 unmarried "$6,500 ... $8,750" for 100% to 10% with each dependent child adding $9,500 (1 child $16,000); Table 2 married "$13,000 ... $15,250" with 1 child $22,500; Line 16 "Multiply Line 14 by the decimal on Line 15"` : `The eligibility income amounts are set by 72 P.S. 7304 and are not indexed; ${BUDGET_2026}`,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.pa.deductions',
    value: { tuitionPerBeneficiary: 19000, ablePerContributor: 19000, studentLoanInterestMaximum: 2500 },
    basis: 'schedule_o_529_contributions_up_to_the_federal_annual_gift_exclusion_per_beneficiary_per_taxpayer_able_contributions_up_to_the_exclusion_hsa_and_msa_as_allowed_federally_student_loan_interest_up_to_2500',
    ...year(y),
    act: 'Tax Reform Code of 1971 (72 P.S. 7101 et seq.), Article III',
    section: '303(a.6); 303(a.7); 303(a.8)',
    source: y === 2025 ? `${O_2025}: "(Limit $19,000 per beneficiary, per taxpayer-spouse.)"; Student Loan Interest "up to $2,500 per taxable year"; ${PA40_2025}, Line 10: "The current annual federal gift tax exclusion amount is $19,000"` : `The 529 and ABLE limits follow the federal annual gift exclusion, which IRS Rev. Proc. 2025-32 keeps at $19,000 for 2026 (irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill: "For tax year 2026, the annual exclusion for gifts remains at $19,000", read 2026-11-21); the $2,500 student loan interest limit is statutory; ${BUDGET_2026}`,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.pa.wptc',
    value: { eitcBasisPoints: 1000 },
    basis: 'working_pennsylvanians_tax_credit_is_a_refundable_credit_of_10_percent_of_the_federal_earned_income_credit_calculated_and_applied_by_the_department',
    ...year(y),
    act: 'Act 45 of 2025 (HB 416), Tax Reform Code of 1971',
    section: 'Working Pennsylvanians Tax Credit',
    source: `Pennsylvania Department of Revenue, Working Pennsylvanians Tax Credit page (pa.gov/agencies/revenue/resources/tax-types-and-information/personal-income-tax/working-pennsylvanians-tax-credit): "The state credit equals 10 percent of your federal credit", refundable, calculated automatically by the department from the federal EITC; WPTC flyer "Effective Beginning Tax Year 2025 ... Equals 10% of the federal EITC amount, up to a maximum of $805" (senatorhughes.com/wp-content/uploads/2026/02/WorkingPennsylvaniaTaxCredit.pdf); Act 45 of 2025 signed November 12, 2025 (EY Tax News 2025-2403), all read 2026-11-21${y === 2026 ? `; the credit is permanent law with no 2026 change and ${BUDGET_2026}` : ''}`,
    attestations: []
  }))
];
