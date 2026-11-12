const CENT = 1;
const DOLLAR = 100 * CENT;
const NOT_REREAD_IRS = 'figures as stated in published IRS and SSA guidance read on 2026-10-13; the Code text and Publication 15 not re-read for this record';

export const RULES = [
  {
    id: 'us.federal.1099-nec.threshold',
    value: { amountCents: 600 * DOLLAR },
    basis: 'calendar_year_payments_for_services_to_a_non_employee_at_or_above',
    effectiveFrom: '2020-01-01',
    effectiveTo: '2025-12-31',
    act: 'IRC',
    section: '6041(a); 6041A(a)',
    source: 'Internal Revenue Code section 6041(a) and 6041A(a): payments of six hundred dollars or more in a calendar year to a person for services in the course of a trade or business are reported; Form 1099-NEC reinstated for 2020 by the Taxpayer First Act (IRS Form 1099-NEC instructions 2020 to 2025). Registry coverage starts 1 January 2020; the figure was in force long before',
    attestations: []
  },
  {
    id: 'us.federal.1099-nec.threshold',
    value: { amountCents: 2000 * DOLLAR },
    basis: 'calendar_year_payments_for_services_to_a_non_employee_at_or_above',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    act: 'IRC',
    section: '6041(a); 6041A(a) as amended',
    source: 'Public Law 119-21 (One Big Beautiful Bill Act, enacted 4 July 2025) section 70433 raising the reporting threshold in sections 6041(a) and 6041A(a) from six hundred to two thousand dollars for payments made after 31 December 2025, indexed for inflation after 2026 (indexing not encoded); figure as stated in published 2026 guidance on 2026-10-13, the enacted text not re-read for this record',
    attestations: []
  },
  {
    id: 'us.federal.fica.social-security',
    value: { employeeBasisPoints: 620, employerBasisPoints: 620, wageBaseCents: 176100 * DOLLAR },
    basis: 'percent_of_wages_each_side_as_basis_points_up_to_the_calendar_year_wage_base',
    effectiveFrom: '2025-01-01',
    effectiveTo: '2025-12-31',
    act: 'IRC',
    section: '3101(a); 3111(a); 3121(a)(1)',
    source: `Social Security Administration 2025 cost-of-living announcement: contribution and benefit base one hundred seventy-six thousand one hundred dollars; rates of 6.2 per cent each for employee and employer under IRC sections 3101(a) and 3111(a) (${NOT_REREAD_IRS})`,
    attestations: []
  },
  {
    id: 'us.federal.fica.social-security',
    value: { employeeBasisPoints: 620, employerBasisPoints: 620, wageBaseCents: 184500 * DOLLAR },
    basis: 'percent_of_wages_each_side_as_basis_points_up_to_the_calendar_year_wage_base',
    effectiveFrom: '2026-01-01',
    effectiveTo: '2026-12-31',
    act: 'IRC',
    section: '3101(a); 3111(a); 3121(a)(1)',
    source: `Social Security Administration 2026 cost-of-living announcement (October 2025): contribution and benefit base one hundred eighty-four thousand five hundred dollars; rates unchanged at 6.2 per cent each side (${NOT_REREAD_IRS})`,
    attestations: []
  },
  {
    id: 'us.federal.fica.social-security',
    value: { employeeBasisPoints: 620, employerBasisPoints: 620, wageBaseCents: 192300 * DOLLAR },
    basis: 'percent_of_wages_each_side_as_basis_points_up_to_the_calendar_year_wage_base',
    effectiveFrom: '2027-01-01',
    effectiveTo: '2027-12-31',
    act: 'IRC',
    section: '3101(a); 3111(a); 3121(a)(1)',
    source: 'Social Security Administration, "Cost-of-Living Increase and Other Determinations for 2027", Federal Register Vol. 91 No. 205, page 67380, 26 October 2026 (document 2026-21796): the OASDI contribution and benefit base is one hundred ninety-two thousand three hundred dollars for remuneration paid in 2027; rates unchanged at 6.2 per cent each side under IRC section 3101(a) and 3111(a) (notice read from govinfo.gov on 2026-11-12)',
    attestations: []
  },
  {
    id: 'us.federal.fica.medicare',
    value: { employeeBasisPoints: 145, employerBasisPoints: 145, additionalEmployeeBasisPoints: 90, additionalAboveCents: 200000 * DOLLAR },
    basis: 'percent_of_all_wages_each_side_as_basis_points_plus_the_employee_only_additional_rate_on_wages_above_the_threshold_withheld_from_the_employer_paying_them',
    effectiveFrom: '2013-01-01',
    effectiveTo: null,
    act: 'IRC',
    section: '3101(b); 3111(b)',
    source: `IRC section 3101(b)(1) and 3111(b): 1.45 per cent each side on all wages with no wage base; section 3101(b)(2) Additional Medicare Tax of 0.9 per cent on wages above two hundred thousand dollars withheld by the employer once wages paid by that employer in the year pass the threshold, from 1 January 2013 (${NOT_REREAD_IRS})`,
    attestations: []
  },
  {
    id: 'us.federal.futa',
    value: { basisPoints: 600, creditBasisPoints: 540, wageBaseCents: 7000 * DOLLAR },
    basis: 'employer_only_percent_of_the_first_wage_base_dollars_paid_to_each_employee_in_a_calendar_year_less_the_maximum_state_credit',
    effectiveFrom: '2011-07-01',
    effectiveTo: null,
    act: 'FUTA',
    section: 'IRC 3301; 3302; 3306(b)(1)',
    source: `IRC section 3301: 6.0 per cent from 1 July 2011 after the 0.2 per cent surtax lapsed; section 3302 credit of up to 5.4 per cent for state unemployment contributions paid on time (credit reduction states not encoded); section 3306(b)(1) wage base seven thousand dollars (${NOT_REREAD_IRS})`,
    attestations: []
  },
  {
    id: 'us.federal.form941.due',
    value: { lastDayOfMonthAfterQuarter: true },
    basis: 'employer_quarterly_federal_tax_return_due_on_the_last_day_of_the_month_after_the_quarter',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    act: 'IRC',
    section: '6071; Treas. Reg. 31.6071(a)-1(a)(1)',
    source: `Treasury Regulation section 31.6071(a)-1(a)(1): Form 941 is due on or before the last day of the first calendar month following the quarter; the ten extra days for employers who deposited in full and on time are not encoded (${NOT_REREAD_IRS}). Registry coverage starts 1 January 2020`,
    attestations: []
  },
  {
    id: 'us.federal.w2.due',
    value: { month: 1, day: 31 },
    basis: 'forms_w2_to_employees_and_the_ssa_and_forms_1099_nec_to_payees_and_the_irs_due_by_this_day_of_the_following_year',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    act: 'IRC',
    section: '6071(c); 6051(a)',
    source: `IRC section 6071(c) as amended by the PATH Act 2015: Forms W-2 and 1099-NEC (non-employee compensation) are filed by 31 January of the following year; section 6051(a) statements to employees by the same day (${NOT_REREAD_IRS}). Registry coverage starts 1 January 2020`,
    attestations: []
  },
  {
    id: 'us.federal.estimated-tax.due',
    value: { installments: [{ month: 4, day: 15, covers: 'income from 1 January to 31 March' }, { month: 6, day: 15, covers: 'income from 1 April to 31 May' }, { month: 9, day: 15, covers: 'income from 1 June to 31 August' }, { month: 1, day: 15, nextYear: true, covers: 'income from 1 September to 31 December' }] },
    basis: 'individual_estimated_tax_instalment_due_dates_for_a_calendar_year_taxpayer',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    act: 'IRC',
    section: '6654(c)(2)',
    source: `IRC section 6654(c)(2): instalments due 15 April, 15 June and 15 September of the taxable year and 15 January of the following year; the weekend and holiday shift under section 7503 is not encoded (${NOT_REREAD_IRS}). Registry coverage starts 1 January 2020`,
    attestations: []
  },
  {
    id: 'us.federal.se-tax',
    value: { netEarningsBasisPoints: 9235, socialSecurityBasisPoints: 1240, medicareBasisPoints: 290, additionalMedicareBasisPoints: 90, additionalMedicareThresholdCents: { single: 200000 * DOLLAR, head_of_household: 200000 * DOLLAR, married_joint: 250000 * DOLLAR, married_separate: 125000 * DOLLAR }, minimumNetEarningsCents: 400 * DOLLAR, halfDeductible: true },
    basis: 'self_employment_tax_on_net_earnings_after_the_seven_point_six_five_percent_reduction_social_security_part_up_to_the_wage_base',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    act: 'IRC',
    section: '1401(a); 1401(b); 1402(a)(12); 1402(b)(2); 164(f)',
    source: `Internal Revenue Code section 1401(a) 12.4 per cent old-age, survivors and disability part and 1401(b)(1) 2.9 per cent hospital insurance part of net earnings from self-employment; 1401(b)(2) additional 0.9 per cent above two hundred thousand dollars (single, head of household), two hundred fifty thousand (joint) and one hundred twenty-five thousand (married filing separately); 1402(a)(12) reduces net earnings by 7.65 per cent; 1402(b)(2) no tax when net earnings are under four hundred dollars; 164(f) one half deductible. The rates have not changed since 1990 and registry coverage starts 1 January 2020; the Social Security wage base comes from us.federal.fica.social-security (${NOT_REREAD_IRS})`,
    attestations: []
  },
];
