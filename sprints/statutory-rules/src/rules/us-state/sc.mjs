const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const BOOK_2025 = 'South Carolina Department of Revenue, 2025 SC1040 Individual Income Tax Instructions (SC1040 Book, dor.sc.gov/sites/dor/files/forms/IITPacket_2025.pdf), read 2026-11-21';
const TT_2025 = 'South Carolina Department of Revenue, 2025 SC1040TT Tax Tables and Tax Rate Schedule (in the SC1040 Book, dor.sc.gov/sites/dor/files/forms/IITPacket_2025.pdf), read 2026-11-21';
const NR_2025 = 'South Carolina Department of Revenue, 2025 Schedule NR and Schedule NR Instructions (dor.sc.gov/sites/dor/files/forms/SchNRInst_2025.pdf), read 2026-11-21';
const TC_2025 = 'South Carolina Department of Revenue, 2025 SC1040TC and TC-60 (in the SC1040 Book, dor.sc.gov/sites/dor/files/forms/IITPacket_2025.pdf), read 2026-11-21';
const IL_26_4 = 'South Carolina Department of Revenue, SC Information Letter #26-4 (Revised), South Carolina Internal Revenue Code Conformity Update, January 30, 2026 (dor.sc.gov/sites/dor/files/policies/IL26-4(revised).pdf), read 2026-11-21';
const INSTR_2026 = 'South Carolina Department of Revenue, 2026 SC1040 Instructions (dor.sc.gov/sites/dor/files/SoftwareDeveloperForms/SC1040Inst.pdf), New for 2026 and lines 4, 10, 11 and 12, read 2026-11-21';
const TT_2026 = 'South Carolina Department of Revenue, 2026 SC1040TT Tax Tables (Revised 6/17/26) and 2026 Tax Rate Schedule (dor.sc.gov/sites/dor/files/SoftwareDeveloperForms/SC1040TT.pdf), read 2026-11-21';
const ADJ_2026 = 'South Carolina Department of Revenue, 2026 Schedule ADJ and 2026 Schedule NR (dor.sc.gov/sites/dor/files/SoftwareDeveloperForms/SCH_ADJ.pdf and SCHNR.pdf) with the 2026 SC1040 Instructions, read 2026-11-21';

export const RULES = [
  {
    id: 'us.state-return.sc.income-tax',
    value: { startsFrom: 'federal-taxable-income', brackets: [{ overCents: 0, rateBp: 0 }, { overCents: 356000, rateBp: 300 }, { overCents: 1783000, rateBp: 600 }], tableBelow: 100000, tableBands: [{ from: 0, width: 50 }, { from: 7000, width: 100 }], scheduleRateBp: 600, scheduleSubtract: 642 },
    basis: 'tax_table_below_100000_at_the_midpoint_of_each_50_or_100_dollar_band_and_rate_schedule_of_6_percent_less_642_at_100000_or_more',
    ...year(2025),
    act: 'South Carolina Code of Laws Title 12 Chapter 6',
    section: '12-6-510',
    source: `${TT_2025}: the 2025 tax table (0% to $3,560, 3% to $17,830, 6% above, figured on the middle of each $50 band below $7,000 and each $100 band to $100,000) and the 2025 Tax Rate Schedule for $100,000 or more: "Multiply the amount on line 5 by 6%; Subtract $642"`,
    attestations: []
  },
  {
    id: 'us.state-return.sc.income-tax',
    value: { startsFrom: 'federal-agi', brackets: [{ overCents: 0, rateBp: 199 }, { overCents: 3000000, rateBp: 521 }], tableBelow: 100000, tableBands: [{ from: 0, width: 50 }, { from: 7000, width: 100 }], scheduleRateBp: 521, scheduleSubtract: 966 },
    basis: 'tax_table_below_100000_at_the_midpoint_of_each_band_and_rate_schedule_of_5_21_percent_less_966_at_100000_or_more',
    ...year(2026),
    act: 'South Carolina Act 110 of 2026',
    section: '12-6-510',
    source: `${TT_2026}: 1.99% to $30,000 and 5.21% above, and "Multiply the amount on line 7 by 5.21%; Subtract $966" for $100,000 or more; ${INSTR_2026} ("brackets were reduced to two brackets with a top marginal tax rate of 5.21% for the 2026 tax year")`,
    attestations: []
  },
  {
    id: 'us.state-return.sc.deductions',
    value: { dependentExemption: 4930, retirementUnder65: 3000, retirement65: 10000, age65Deduction: 15000, capitalGainBasisPoints: 4400, saltLimit: { mfs: 20000, other: 40000 }, unadoptedStandardIncrease: { single: 750, mfs: 750, hoh: 1125, mfj: 1500, qss: 1500 } },
    basis: 'dependent_exemption_retirement_and_age_65_deductions_44_percent_capital_gain_state_tax_addback_and_addback_of_federal_deductions_south_carolina_has_not_adopted',
    ...year(2025),
    act: 'South Carolina Code of Laws Title 12 Chapter 6',
    section: '12-6-40; 12-6-1140; 12-6-1150; 12-6-1170; 12-6-1160',
    source: `${BOOK_2025}: dependent exemption "$4,930", retirement deduction "up to $3,000" under 65 and "$10,000" at 65 or older, age 65 and older deduction "$15,000", 44% of net long-term capital gain, state tax addback worksheet with the "$40,000 ($20,000 if Married Filing Separately)" limit, and line e addback of the section 199A deduction; ${IL_26_4}: South Carolina conforms to the IRC as amended through December 31, 2024 and taxpayers adjust for the OBBBA standard deduction increase ("$750 for Single and Married Filing Separately, $1,125 for Head of Household, and $1,500 for Married Filing Jointly and Qualifying Surviving Spouse"), the senior deduction, tips, overtime and car loan interest`,
    attestations: []
  },
  {
    id: 'us.state-return.sc.deductions',
    value: { dependentExemption: 5040, retirementUnder65: 3000, retirement65: 10000, age65Deduction: 15000, capitalGainBasisPoints: 4400, pollWorkerMaximum: 2500, sciad: { amount: { single: 15000, mfs: 15000, hoh: 22500, mfj: 30000, qss: 30000 }, phaseStart: { single: 40000, mfs: 40000, hoh: 60000, mfj: 80000, qss: 80000 }, phaseRange: { single: 55000, mfs: 55000, hoh: 82500, mfj: 110000, qss: 110000 }, roundDownTo: 10 } },
    basis: 'south_carolina_income_adjusted_deduction_phased_out_by_the_fraction_of_federal_agi_over_the_numerator_rounded_down_to_10_plus_schedule_adj_subtractions',
    ...year(2026),
    act: 'South Carolina Act 110 of 2026',
    section: '12-6-1140; 12-6-1160; 12-6-1170',
    source: `${INSTR_2026}: SCIAD worksheet table (Single and Married Filing Separately 15,000 / 40,000 / 55,000; Married Filing Jointly and Qualifying Surviving Spouse 30,000 / 80,000 / 110,000; Head of Household 22,500 / 60,000 / 82,500), "Round down to the nearest $10", dependent exemption "$5,040", retirement deduction "$3,000 or $10,000", age 65 and older deduction "$15,000"; ${ADJ_2026} (44% of net capital gains on line m, poll worker pay on line u)`,
    attestations: []
  },
  {
    id: 'us.state-return.sc.credits',
    value: { childCareBasisPoints: 700, childCareMaximum: { one: 210, twoOrMore: 420 }, twoWageEarnerBasisPoints: 70, twoWageEarnerLimit: 50000, eitcBasisPoints: 12500, eitcMaximum: null },
    basis: 'child_care_credit_7_percent_of_federal_expenses_two_wage_earner_credit_0_7_percent_of_up_to_50000_and_eitc_125_percent_of_federal',
    ...year(2025),
    act: 'South Carolina Code of Laws Title 12 Chapter 6',
    section: '12-6-3380; 12-6-3330; 12-6-3632; 12-6-3400',
    source: `${BOOK_2025}: child and dependent care credit "7% of the federal child and dependent care expense", "maximum credit allowed is $210 for one child or $420 for two or more children", Two Wage Earner Credit ".007 of the lesser of $50,000 or the South Carolina qualified earned income"; ${TC_2025}: TC-60 South Carolina EITC of 125% of the federal earned income credit for full-year residents; ${NR_2025}: the SC1040TC credit for taxes paid to another state`,
    attestations: []
  },
  {
    id: 'us.state-return.sc.credits',
    value: { childCareBasisPoints: 700, childCareMaximum: { one: 210, twoOrMore: 420 }, twoWageEarnerBasisPoints: 70, twoWageEarnerLimit: 50000, eitcBasisPoints: 12500, eitcMaximum: 200 },
    basis: 'child_care_credit_7_percent_two_wage_earner_credit_0_7_percent_of_up_to_50000_and_eitc_125_percent_of_federal_limited_to_200',
    ...year(2026),
    act: 'South Carolina Act 110 of 2026',
    section: '12-6-3380; 12-6-3330; 12-6-3632',
    source: `${INSTR_2026}: "The South Carolina Earned Income Tax Credit (EITC) is 125% of the federal Earned Income Tax Credit, limited to $200", child care credit 7% with "maximum credit allowed is $210 for one child or $420 for two or more children", Two Wage Earner Credit ".007 of the lesser of $50,000"`,
    attestations: []
  }
];
