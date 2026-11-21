const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const PIT1_2025 = 'New Mexico Taxation and Revenue Department, 2025 PIT-1 Personal Income Tax Return Instructions (realfile.tax.newmexico.gov/2025pit-1-ins.pdf) with the 2025 PIT-1 form (realfile.tax.newmexico.gov/2025pit-1.pdf), read 2026-11-21';
const TRT_2025 = 'New Mexico Taxation and Revenue Department, 2025 Tax Rate Table PIT-TRT (realfile.tax.newmexico.gov/2025trt.pdf), $100 rows to $100,000 and the schedule above $100,000 (single $4,356 plus 4.9% over $100,000 and $9,746 plus 5.9% over $210,000; joint, head of household and surviving spouse $4,087 and $14,622 plus 5.9% over $315,000; separate $4,492 and $7,310 plus 5.9% over $157,500), read 2026-11-21';
const HB252 = 'New Mexico House Bill 252 (2024 regular session, Laws 2024), Section 1 amending Section 7-2-7 NMSA 1978 (nmlegis.gov/sessions/24%20Regular/bills/house/HB0252.PDF), effective January 1, 2025, read 2026-11-21';
const ADJ_2025 = 'New Mexico Taxation and Revenue Department, 2025 PIT-ADJ Schedule of Additions, Deductions and Exemptions and its instructions (realfile.tax.newmexico.gov/2025pit-adj.pdf and 2025pit-adj-ins.pdf), read 2026-11-21';
const RC_2025 = 'New Mexico Taxation and Revenue Department, 2025 PIT-RC Rebate and Credit Schedule and its instructions (realfile.tax.newmexico.gov/2025pit-rc.pdf and 2025pit-rc-ins.pdf), read 2026-11-21';
const PROVISIONAL_2026 = 'New Mexico had not published the 2026 PIT-1, PIT-ADJ, PIT-RC instructions or the 2026 tax rate table as of 2026-11-21; the 2025 figures are carried and marked provisional until the Department publishes the 2026 amounts (the child income tax credit is indexed, and the rate table above $100,000 has differed from the Section 7-2-7 base amounts by $2)';

const band = (dollars, rateBp) => ({ overCents: dollars * 100, rateBp });
const JOINT = [band(0, 150), band(8000, 320), band(25000, 430), band(50000, 470), band(100000, 490), band(315000, 590)];

const INCOME_TAX = {
  brackets: {
    mfj: JOINT,
    hoh: JOINT,
    single: [band(0, 150), band(5500, 320), band(16500, 430), band(33500, 470), band(66500, 490), band(210000, 590)],
    mfs: [band(0, 150), band(4000, 320), band(12500, 430), band(25000, 470), band(50000, 490), band(157500, 590)],
  },
  table: { notOver: 100000, step: 100, firstRows: [{ over: 0, notOver: 60 }, { over: 60, notOver: 100 }] },
  aboveTable: {
    single: [{ over: 100000, base: 4356, rateBp: 490 }, { over: 210000, base: 9746, rateBp: 590 }],
    mfj: [{ over: 100000, base: 4087, rateBp: 490 }, { over: 315000, base: 14622, rateBp: 590 }],
    hoh: [{ over: 100000, base: 4087, rateBp: 490 }, { over: 315000, base: 14622, rateBp: 590 }],
    mfs: [{ over: 100000, base: 4492, rateBp: 490 }, { over: 157500, base: 7310, rateBp: 590 }],
  },
};

const EXEMPTIONS = {
  dependentDeduction: 4000,
  lowMiddle: { agiLimit: { single: 36667, mfs: 27500, mfj: 55000, hoh: 55000 }, base: { single: 20000, mfs: 15000, mfj: 30000, hoh: 30000 }, rateBp: { single: 1500, mfs: 2000, mfj: 1000, hoh: 1000 }, maximum: 2500 },
  seniorOrBlind: {
    mfj: [30000, 33000, 36000, 39000, 42000, 45000, 48000, 51000].map((agiNotOver, index) => ({ agiNotOver, amount: 8000 - index * 1000 })),
    hoh: [30000, 33000, 36000, 39000, 42000, 45000, 48000, 51000].map((agiNotOver, index) => ({ agiNotOver, amount: 8000 - index * 1000 })),
    single: [18000, 19500, 21000, 22500, 24000, 25500, 27000, 28500].map((agiNotOver, index) => ({ agiNotOver, amount: 8000 - index * 1000 })),
    mfs: [15000, 16500, 18000, 19500, 21000, 22500, 24000, 25500].map((agiNotOver, index) => ({ agiNotOver, amount: 8000 - index * 1000 })),
  },
  socialSecurityAgiLimit: { single: 100000, mfs: 75000, mfj: 150000, hoh: 150000 },
  capitalGainMaximum: 2500,
  armedForcesRetirementMaximum: 30000,
  medical65: { expenseThreshold: 28000, exemption: 3000 },
  teacherSuppliesMaximum: 1000,
};

const LICTR = [
  [1000, 224, 298, 373, 448, 522, 597], [1500, 252, 362, 465, 580, 655, 775], [2500, 252, 362, 465, 580, 655, 810], [7500, 252, 362, 465, 580, 655, 839],
  [8000, 235, 356, 448, 568, 660, 839], [9000, 212, 327, 431, 551, 660, 804], [10000, 195, 287, 390, 488, 586, 764], [11500, 166, 241, 316, 413, 511, 689],
  [13000, 149, 212, 270, 339, 419, 551], [14500, 132, 195, 252, 316, 362, 448], [16500, 120, 178, 212, 270, 327, 385], [18000, 114, 149, 189, 241, 287, 344],
  [19500, 103, 132, 166, 206, 252, 298], [21000, 91, 120, 160, 189, 212, 264], [23000, 91, 120, 160, 189, 212, 264], [24500, 86, 114, 137, 166, 195, 224],
  [26000, 74, 103, 132, 160, 178, 206], [27500, 63, 91, 120, 149, 160, 195], [29500, 57, 86, 114, 132, 149, 178], [31000, 45, 63, 91, 114, 132, 149],
  [32500, 40, 57, 74, 91, 114, 120], [34000, 28, 45, 57, 74, 91, 103], [36000, 17, 40, 45, 63, 74, 86],
].map(([mgiNotOver, ...byExemptions]) => ({ mgiNotOver, byExemptions }));

const MAX_LIABILITY = [[1000, 20], [2000, 25], [3000, 30], [4000, 35], [5000, 40], [6000, 45], [7000, 50], [8000, 55], [9000, 60], [10000, 75], [11000, 90], [12000, 105], [13000, 120], [14000, 135], [15000, 150], [16000, 180]].map(([mgiNotOver, liability]) => ({ mgiNotOver, liability }));

const CREDITS = {
  workingFamiliesBasisPoints: 2500,
  childIncomeTaxCredit: [{ agiNotOver: 25000, perChild: 637 }, { agiNotOver: 50000, perChild: 424 }, { agiNotOver: 75000, perChild: 212 }, { agiNotOver: 100000, perChild: 106 }, { agiNotOver: 200000, perChild: 79 }, { agiNotOver: 350000, perChild: 53 }, { agiNotOver: null, perChild: 26 }],
  lowIncomeRebate: { mgiLimit: 36000, table: LICTR },
  propertyTaxRebate: { mgiLimit: 16000, age: 65, rentBasisPoints: 600, maximum: 250, mfsMaximum: 125, maximumLiability: MAX_LIABILITY },
  medicalCredit65: { expenseThreshold: 28000, credit: 2800 },
};

export const RULES = [
  {
    id: 'us.state-return.nm.income-tax',
    value: INCOME_TAX,
    basis: 'graduated_rates_of_section_7_2_7_applied_through_the_department_rate_table_at_the_midpoint_of_each_100_dollar_row_up_to_100000_and_the_published_schedule_above',
    ...year(2025),
    act: 'Section 7-2-7 NMSA 1978 as amended by Laws 2024, HB 252',
    section: '7-2-7(A) to (C)',
    source: `${HB252}: joint, head of household and surviving spouse 1.5% to $8,000, 3.2% to $25,000, 4.3% to $50,000, 4.7% to $100,000, 4.9% to $315,000, 5.9% above; single $5,500, $16,500, $33,500, $66,500, $210,000; separate $4,000, $12,500, $25,000, $50,000, $157,500. ${TRT_2025}; ${PIT1_2025}, Line 18 "Use the rate tables" and PIT-B line 13`,
    attestations: []
  },
  { id: 'us.state-return.nm.income-tax', value: { ...INCOME_TAX, provisional: true }, basis: 'graduated_rates_of_section_7_2_7_applied_through_the_department_rate_table_at_the_midpoint_of_each_100_dollar_row_up_to_100000_and_the_published_schedule_above', ...year(2026), act: 'Section 7-2-7 NMSA 1978 as amended by Laws 2024, HB 252', section: '7-2-7(A) to (C)', source: `${HB252} (rates apply to taxable years beginning on or after January 1, 2025); ${PROVISIONAL_2026}`, attestations: [] },
  {
    id: 'us.state-return.nm.exemptions',
    value: EXEMPTIONS,
    basis: 'new_mexico_dependent_deduction_low_and_middle_income_exemption_and_pit_adj_exemptions_for_age_65_or_blind_social_security_capital_gains_armed_forces_retirement_medical_expenses_and_teacher_supplies',
    ...year(2025),
    act: 'New Mexico Income Tax Act, Chapter 7, Article 2 NMSA 1978',
    section: 'PIT-1 lines 13 and 14; PIT-ADJ lines 13, 16, 18, 24, 25 and 27',
    source: `${PIT1_2025}: Line 13 worksheet ($4,000 for each dependent after the first, head of household or joint filers), Line 14 New Mexico Low- and Middle-Income Tax Exemption Worksheet ($36,667 single, $27,500 separate, $55,000 joint, surviving spouse or head of household; $20,000/$15,000/$30,000 bases; 0.15/0.20/0.10 rates; $2,500 per exemption). ${ADJ_2025}: Line 13 Table 1 ($8,000 for each taxpayer 65 or older or blind, falling by $1,000 per band to $51,000 joint, $28,500 single, $25,500 separate), Line 16 net capital gains deduction "not to exceed $2,500", Line 18 $3,000 exemption for medical expenses of $28,000 or more at 65 or older, Line 24 armed forces retirement $30,000 per retiree, Line 25 Table 2 Social Security thresholds ($100,000 single, $75,000 separate, $150,000 joint, head of household, surviving spouse), Line 27 Table 3 school supplies $1,000 for 2025`,
    attestations: []
  },
  { id: 'us.state-return.nm.exemptions', value: { ...EXEMPTIONS, provisional: true }, basis: 'new_mexico_dependent_deduction_low_and_middle_income_exemption_and_pit_adj_exemptions_for_age_65_or_blind_social_security_capital_gains_armed_forces_retirement_medical_expenses_and_teacher_supplies', ...year(2026), act: 'New Mexico Income Tax Act, Chapter 7, Article 2 NMSA 1978', section: 'PIT-1 lines 13 and 14; PIT-ADJ lines 13, 16, 18, 24, 25 and 27', source: PROVISIONAL_2026, attestations: [] },
  {
    id: 'us.state-return.nm.credits',
    value: CREDITS,
    basis: 'working_families_tax_credit_of_25_percent_of_the_federal_eic_child_income_tax_credit_per_qualifying_child_by_agi_and_pit_rc_rebates_by_modified_gross_income',
    ...year(2025),
    act: 'New Mexico Income Tax Act, Chapter 7, Article 2 NMSA 1978',
    section: 'PIT-1 line 25; PIT-RC lines 14, 17, 23 and 25',
    source: `${PIT1_2025}: Line 25 "Multiply the amount on line 25a by 0.25 (25%)". ${RC_2025}: Table 1 2025 Low-Income Comprehensive Tax Rebate Table (modified gross income to $36,000 by number of exemptions), Section 3 property tax rebate for persons 65 or older (modified gross income $16,000 or less, rent times 0.06, Table 2 maximum property tax liability, rebate not more than $250 or $125 separate), Line 23 $2,800 refundable medical care credit for $28,000 or more of expenses, Table 4 2025 Child Income Tax Credit Income Table ($637, $424, $212, $106, $79, $53, $26 per qualifying child)`,
    attestations: []
  },
  { id: 'us.state-return.nm.credits', value: { ...CREDITS, provisional: true }, basis: 'working_families_tax_credit_of_25_percent_of_the_federal_eic_child_income_tax_credit_per_qualifying_child_by_agi_and_pit_rc_rebates_by_modified_gross_income', ...year(2026), act: 'New Mexico Income Tax Act, Chapter 7, Article 2 NMSA 1978', section: 'PIT-1 line 25; PIT-RC lines 14, 17, 23 and 25', source: PROVISIONAL_2026, attestations: [] },
];
