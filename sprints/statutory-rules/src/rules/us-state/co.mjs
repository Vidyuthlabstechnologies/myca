const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const BOOK_2025 = 'Colorado Department of Revenue, 2025 Colorado Individual Income Tax Filing Guide, Book 104 (tax.colorado.gov/sites/default/files/documents/Book104_2025.pdf), with forms DR 0104, DR 0104AD, DR 0104PN and DR 0104CR (DR0104_2025.pdf, DR0104AD_2025.pdf, DR0104PN_2025.pdf, DR0104CR_2025.pdf), read 2026-11-21';
const PROVISIONAL_2026 = 'Colorado has not published the 2026 Book 104, tax table or 2026 DR 0104 schedules as of 2026-11-21; the 2025 figures are carried and the record is marked provisional until the Department publishes the 2026 forms';
const FATC_SINGLE = [15000, 20000, 25000, 30000, 35000, 40000, 45000, 50000, 55000, 60000, 65000, 70000, 75000, 80000, 85000];
const FATC_JOINT = [26000, 31000, 36000, 41000, 46000, 51000, 56000, 61000, 66000, 71000, 76000, 81000, 86000, 91000, 96000];

export const RULES = [
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.co.income-tax',
    value: { rateBasisPoints: 440 },
    basis: 'flat_rate_on_colorado_taxable_income_with_no_temporary_tabor_rate_reduction',
    ...year(y),
    act: 'Colorado Revised Statutes Title 39 Article 22',
    section: '39-22-104(1.7)',
    source: y === 2025 ? `${BOOK_2025}: line 13 "The income tax rate is currently 4.4%", "2025 Colorado Income Tax Table with tax rate of 4.4%"` : 'Colorado State Controller TABOR certification reported in the Office of the State Auditor Schedule of TABOR Revenue FY26 (content.leg.colorado.gov/sites/default/files/documents/audits/2657p-schedule-of-tabor-revenue-fy26-accessible.pdf, read 2026-11-21): "Fiscal Year 2026 revenue is under the Excess State Revenues Cap by $275,083,885; therefore, there is no TABOR refund for Fiscal Year 2026", so the temporary TABOR income tax rate reduction does not apply and the 39-22-104(1.7) rate of 4.4 percent stands; Legislative Council June 2026 forecast (content.leg.colorado.gov/sites/default/files/june-2026-forecast-for-posting-accessible_0.pdf, read 2026-11-21) "the income tax rate reduction mechanism will not be triggered in tax years 2026 or 2027"',
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.co.tax-table',
    value: { firstRows: [0, 10, 30, 50, 75, 100], rowWidth: 100, tableUpTo: 50000, ...(y === 2026 ? { provisional: true } : {}) },
    basis: 'full_year_residents_below_50000_use_the_tax_table_whose_rows_are_taxed_at_the_midpoint_above_that_taxable_income_times_the_rate',
    ...year(y),
    act: 'Colorado Revised Statutes Title 39 Article 22',
    section: '39-22-104',
    source: y === 2025 ? `${BOOK_2025}: Colorado Income Tax Table rows $0-$10, $10-$30, $30-$50, $50-$75, $75-$100 and then $100 rows to $50,000 (each row's tax is 4.4 percent of the row midpoint, for example $5,100-$5,200 tax $227 and $49,900-$50,000 tax $2,198), and "Worksheet for taxable incomes over $50,000 ... Multiply by 4.4%"` : PROVISIONAL_2026,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.co.addbacks',
    value: { deductionAddback: { agiOver: 300000, allowance: { mfj: 16000, other: 12000 } }, qbiAddback: { agiOver: { mfj: 1000000, other: 500000 } }, ...(y === 2026 ? { provisional: true } : {}) },
    basis: 'add_back_federal_standard_or_itemized_deduction_above_12000_or_16000_joint_when_federal_agi_exceeds_300000_less_state_income_tax_already_added_back_and_the_qbi_deduction_when_agi_exceeds_500000_or_1000000_joint',
    ...year(y),
    act: 'Colorado Revised Statutes Title 39 Article 22',
    section: '39-22-104(3)',
    source: y === 2025 ? `${BOOK_2025}: line 3 qualified business income deduction addback "adjusted gross income is greater than $500,000 ($1,000,000 if filing jointly)"; line 4 "federal adjusted gross income ... exceeds $300,000" and deductions on line 12e exceed $12,000 (single, separate, head of household) or $16,000 (joint), reduced by the state income tax added back on line 2` : PROVISIONAL_2026,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.co.subtractions',
    value: { pension: { age65: 24000, age55: 20000 }, socialSecurity: { age55AgiLimit: { mfj: 95000, other: 75000 }, cap: 20000 }, charityFloor: 500, collegeInvestPerBeneficiary: { mfj: 38100, other: 25400 }, ...(y === 2026 ? { provisional: true } : {}) },
    basis: 'pension_annuity_subtraction_24000_at_65_or_20000_at_55_less_the_social_security_subtraction_social_security_subtraction_full_at_65_and_at_55_to_64_when_agi_is_within_the_limit_otherwise_20000_charitable_subtraction_above_500_for_non_itemizers_collegeinvest_limit_per_beneficiary',
    ...year(y),
    act: 'Colorado Revised Statutes Title 39 Article 22',
    section: '39-22-104(4)',
    source: y === 2025 ? `${BOOK_2025}: DR 0104AD line 3 (65 or older the entire taxable benefits; 55 to 64 the entire amount when single AGI does not exceed $75,000 or joint $95,000, otherwise limited to $20,000), line 4 ("Age 65 or older ... $24,000 minus any amount entered on line 3", "At least 55 ... $20,000 minus any amount entered on line 3"), line 10 "Per-Beneficiary Limits for the 2025 tax year: Single Filers: $25,400, Joint Filers: $38,100", line 12 "Colorado adjustment $500"` : PROVISIONAL_2026,
    attestations: []
  })),
  {
    id: 'us.state-return.co.eitc',
    value: { basisPoints: 5000 },
    basis: 'colorado_earned_income_tax_credit_is_a_percentage_of_the_federal_eitc_prorated_for_part_year_residents',
    ...year(2025),
    act: 'Colorado Revised Statutes Title 39 Article 22 (H.B. 24-1134)',
    section: '39-22-123.5',
    source: `${BOOK_2025}: DR 0104CR line 5 "COEITC, multiply line 4 by 50% (0.50)", line 6 part-year residents multiply by DR 0104PN line 34 percentage not over 100%`,
    attestations: []
  },
  {
    id: 'us.state-return.co.eitc',
    value: { basisPoints: 2500 },
    basis: 'colorado_earned_income_tax_credit_is_a_percentage_of_the_federal_eitc_prorated_for_part_year_residents',
    ...year(2026),
    act: 'Colorado Revised Statutes Title 39 Article 22 (H.B. 24-1134)',
    section: '39-22-123.5',
    source: 'Colorado Department of Revenue, Child Tax Credit and Earned Income Tax Credit page (tax.colorado.gov/CTC-EITC, read 2026-11-21): "The credit was 50% of the federal EITC amount for Tax Years 2024 and 2025, but will be reduced to 25% in Tax Year 2026"; Legislative Council June 2026 forecast: "Based on the December 2025 OSPB forecast, both credits will be unavailable for tax year 2026" (the H.B. 24-1134 expansion)',
    attestations: []
  },
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.co.child-tax-credit',
    value: { underAge: 6, tiers: { other: [{ upTo: 26000, perChild: 1200 }, { upTo: 51000, perChild: 600 }, { upTo: 77000, perChild: 200 }], mfj: [{ upTo: 36000, perChild: 1200 }, { upTo: 61000, perChild: 600 }, { upTo: 87000, perChild: 200 }] }, ...(y === 2026 ? { provisional: true } : {}) },
    basis: 'colorado_child_tax_credit_per_child_under_6_by_federal_agi_tier_single_head_of_household_and_separate_filers_use_the_single_tiers_prorated_for_part_year_residents',
    ...year(y),
    act: 'Colorado Revised Statutes Title 39 Article 22',
    section: '39-22-129',
    source: y === 2025 ? 'Colorado Department of Revenue, 2025 DR 0104CN Colorado Child Tax Credit (tax.colorado.gov/sites/default/files/documents/DR_0104CN_2025.pdf, read 2026-11-21): Regular Child Tax Credit Table $26,000 or less ($36,000 joint) $1,200; $26,001 to $51,000 ($36,001 to $61,000) $600; $51,001 to $77,000 ($61,001 to $87,000) $200; Income Tax Topics: Child Tax Credit (ITT_Child_Tax_Credit_Jan_2026.pdf, read 2026-11-21)' : `${PROVISIONAL_2026}; the per-child amounts are fixed by statute but the income tiers are indexed and the 2026 DR 0104CN is not published`,
    attestations: []
  })),
  {
    id: 'us.state-return.co.family-affordability',
    value: { underAge: 17, youngUnderAge: 6, limits: { other: FATC_SINGLE, mfj: FATC_JOINT }, youngPerChild: [3273, 3048, 2823, 2598, 2373, 2148, 1923, 1698, 1473, 1248, 1023, 798, 573, 348, 123], olderPerChild: [2455, 2286, 2117, 1949, 1780, 1611, 1442, 1274, 1105, 936, 767, 598, 430, 261, 92] },
    basis: 'family_affordability_tax_credit_per_qualifying_child_under_17_by_federal_agi_tier_higher_for_children_5_and_under_prorated_for_part_year_residents',
    ...year(2025),
    act: 'Colorado Revised Statutes Title 39 Article 22 (H.B. 24-1311)',
    section: '39-22-130',
    source: 'Colorado Department of Revenue, 2025 DR 0104CN (DR_0104CN_2025.pdf, read 2026-11-21): Age 5 and Under Family Affordability Tax Credit Table ($15,000 or less single, $26,000 or less joint, $3,273 ... $80,001 to $85,000, $91,001 to $96,000, $123) and Age 6 to 16 table ($2,455 ... $92), none above $85,000 or $96,000 joint',
    attestations: []
  },
  {
    id: 'us.state-return.co.family-affordability',
    value: { underAge: 17, youngUnderAge: 6, limits: { other: [], mfj: [] }, youngPerChild: [], olderPerChild: [], notAllowed: true },
    basis: 'family_affordability_tax_credit_not_allowed_for_tax_year_2026',
    ...year(2026),
    act: 'Colorado Revised Statutes Title 39 Article 22 (H.B. 24-1311)',
    section: '39-22-130',
    source: 'Colorado Department of Revenue, Income Tax Topics: Family Affordability Tax Credit, revised November 2026 (tax.colorado.gov/sites/default/files/2026-11/ITT_Family_Affordability_Tax_Credit_Nov_2026.pdf, read 2026-11-21): "The family affordability tax credit is not allowed for tax year 2026"',
    attestations: []
  },
  {
    id: 'us.state-return.co.tabor-refund',
    value: { agiUpTo: [52000, 105000, 168000, 233000, 299000], single: [19, 25, 29, 35, 37, 59], joint: [38, 50, 58, 70, 74, 118], minimumAge: 18 },
    basis: 'six_tier_tabor_state_sales_tax_refund_for_full_year_residents_by_modified_agi_joint_filers_get_the_joint_amount',
    ...year(2025),
    act: 'Colorado Constitution Article X Section 20 and Colorado Revised Statutes Title 39 Article 22',
    section: 'Article 22 Part 20 (TABOR refund mechanisms)',
    source: `${BOOK_2025}: DR 0104 line 38 Modified AGI Tiers for TABOR State Sales Tax Refund ($52,000 or less, $52,001-$105,000, $105,001-$168,000, $168,001-$233,000, $233,001-$299,000, $299,001 or more; single $19, $25, $29, $35, $37, $59; joint $38, $50, $58, $70, $74, $118), full-year residents born before 2007 or under 18 with a tax liability or Colorado wage withholding`,
    attestations: []
  },
  {
    id: 'us.state-return.co.tabor-refund',
    value: { agiUpTo: [], single: [], joint: [], minimumAge: 18, none: true },
    basis: 'no_tabor_state_sales_tax_refund_for_tax_year_2026',
    ...year(2026),
    act: 'Colorado Constitution Article X Section 20',
    section: 'Article 22 Part 20 (TABOR refund mechanisms)',
    source: 'Office of the State Auditor, Schedule of TABOR Revenue FY26 (content.leg.colorado.gov/sites/default/files/documents/audits/2657p-schedule-of-tabor-revenue-fy26-accessible.pdf, read 2026-11-21): "The State Controller reported on September 8, 2026 that Fiscal Year 2026 revenue is under the Excess State Revenues Cap by $275,083,885; therefore, there is no TABOR refund for Fiscal Year 2026"',
    attestations: []
  }
];
