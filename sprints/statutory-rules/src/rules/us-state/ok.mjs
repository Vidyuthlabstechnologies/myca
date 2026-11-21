const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const PACKET_2025 = 'Oklahoma Tax Commission, 2025 Form 511 Resident Individual Income Tax Forms and Instructions packet with Schedules 511-A to 511-G, Form 538-S and the 2025 Income Tax Table (oklahoma.gov/content/dam/ok/en/tax/documents/forms/individuals/current/511-Pkt.pdf), the 2025 Form 511-NR packet (…/current/511-NR-Pkt.pdf) and 2025 Form 511-TX (…/current/511-TX.pdf), read 2026-11-21';
const PACKET_2026 = 'Oklahoma Tax Commission, 2026 Form 511 and Form 511-NR software developer packets marked Final (oklahoma.gov/content/dam/ok/en/tax/documents/forms/software-developers/Dev511-Pkt-26.pdf and Dev511-NR-Pkt-26.pdf) and the Developer Drafts and Finals list (…/software-developers/DeveloperDraftsFinals.pdf), read 2026-11-21';

const band = (rows) => rows.map(([over, rateBp]) => ({ overCents: over * 100, rateBp }));

const TAX = {
  2025: {
    single: band([[0, 25], [1000, 75], [2500, 175], [3750, 275], [4900, 375], [7200, 475]]),
    joint: band([[0, 25], [2000, 75], [5000, 175], [7500, 275], [9800, 375], [14400, 475]]),
    tableBelow: 100000,
    above: { single: 4562, joint: 4373, over: 100000, rateBp: 475 },
  },
  2026: {
    single: band([[0, 0], [3750, 250], [4900, 350], [7200, 450]]),
    joint: band([[0, 0], [7500, 250], [9800, 350], [14400, 450]]),
    tableBelow: 95000,
    above: { single: 4060, joint: 3845, over: 95000, rateBp: 450 },
  },
};

export const RULES = [
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ok.income-tax',
    value: { brackets: { single: TAX[y].single, mfs: TAX[y].single, mfj: TAX[y].joint, hoh: TAX[y].joint, qss: TAX[y].joint }, tableBelow: TAX[y].tableBelow, tableRowWidth: 50, rounding: 'midpoint_half_up', aboveTable: { base: { single: TAX[y].above.single, mfs: TAX[y].above.single, mfj: TAX[y].above.joint, hoh: TAX[y].above.joint, qss: TAX[y].above.joint }, over: TAX[y].above.over, rateBp: TAX[y].above.rateBp } },
    basis: 'oklahoma_tax_table_below_the_threshold_on_the_midpoint_of_each_50_dollar_row_and_the_tax_computation_worksheet_above_it_single_and_separate_column_and_joint_head_of_household_and_surviving_spouse_column',
    ...year(y),
    act: '68 O.S. 2355(B)',
    section: y === 2025 ? '68 O.S. 2355(B)(1)(a) and (2)(a); Form 511 line 14' : '68 O.S. 2355(B) as amended by 2025 H.B. 2764 for tax years beginning 2026; Form 511 line 14',
    source: y === 2025 ? `${PACKET_2025}: 2025 Oklahoma Income Tax Table pages 30-35 (use if taxable income is less than $100,000; "$4,562 plus 0.0475 over $100,000" for single or married filing separate and "$4,373 plus 0.0475 over $100,000" for married filing joint, head of household or qualified widow(er)); every one of the 2,000 rows was checked to equal the 0.25%, 0.75%, 1.75%, 2.75%, 3.75% and 4.75% brackets applied to the row midpoint and rounded to the nearest dollar` : `${PACKET_2026}: "The top individual income tax rate decreased to 4.5%. The tax tables have been revised"; 2026 Oklahoma Income Tax Table (use if taxable income is less than $95,000; "$4,060 plus 0.045 over $95,000" and "$3,845 plus 0.045 over $95,000"); every one of the 1,825 rows was checked to equal 0%, 2.5%, 3.5% and 4.5% brackets at $3,750, $4,900 and $7,200 (doubled for joint) applied to the row midpoint`,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ok.deductions',
    value: {
      standard: { single: 6350, mfs: 6350, hoh: 9350, mfj: 12700, qss: 12700 },
      itemizedLimit: 17000,
      exemption: 1000,
      specialExemptionAge: 65,
      specialExemptionAgiLimit: { single: 15000, mfj: 25000, mfs: 12500, hoh: 19000, qss: 25000 },
      retirementExclusionLimit: 10000,
      collegeSavingsLimit: { mfj: 20000, other: 10000 },
    },
    basis: 'oklahoma_standard_or_limited_itemized_deduction_1000_dollar_exemptions_special_exemption_retirement_exclusions_and_529_deduction',
    ...year(y),
    act: '68 O.S. 2358',
    section: '68 O.S. 2358(A)(5)(c) and (A)(10), 2358(B), 2358(E)(1) and (E)(10); Schedules 511-A, 511-C and 511-D',
    source: `${y === 2025 ? PACKET_2025 : PACKET_2026}: line 10 instructions (standard deduction $6,350 single or married filing separate, $9,350 head of household, $12,700 married filing joint or qualifying surviving spouse; itemized deductions "limited to, and may not exceed, $17,000" except charitable contributions and medical expenses), line 11 ($1,000 for each exemption), Special exemption (65 or older with line 1 of $15,000 single, $25,000 joint, $12,500 separate, $19,000 head of household or less), Schedule 511-A lines 5 and 6 (retirement benefits up to $10,000 each individual) and Schedule 511-C line 3 (529 contributions up to $10,000, $20,000 on a joint return)`,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ok.credits',
    value: {
      childCredit: { agiLimit: 100000, careBasisPoints: 2000, childTaxBasisPoints: 500 },
      earnedIncomeBasisPoints: 500,
      salesTaxRelief: { perExemption: 40, incomeLimit: 20000, raisedIncomeLimit: 50000 },
    },
    basis: 'child_care_or_child_tax_credit_greater_of_20_percent_or_5_percent_earned_income_credit_5_percent_and_sales_tax_relief_40_dollars_per_exemption',
    ...year(y),
    act: '68 O.S. 2357(A)(1), 2357(D), 2357.43 and 5011',
    section: 'Schedules 511-F and 511-G; Schedules 511-NR-E and 511-NR-F; Form 538-S line 15',
    source: `${y === 2025 ? PACKET_2025 : PACKET_2026}: Schedule 511-F ("greater of 20% of the credit for child care expenses ... or 5% of the child tax credit", no credit if Federal AGI is greater than $100,000, prorated by Oklahoma AGI to Federal AGI), Schedule 511-G (5% of the federal earned income credit under the 2020 requirements, prorated), line 25 and Form 538-S (household income not over $20,000, or $50,000 with a dependent, age 65 or a disability; $40 per exemption)`,
    attestations: []
  })),
];
