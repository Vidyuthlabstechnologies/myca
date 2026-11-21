const D = 100;
const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const band = (over, rateBp, base) => ({ overCents: over * D, rateBp, baseCents: Math.round(base * D) });
const tier = (over, base, benefit) => ({ overTaxable: over, applicableOver: over, recaptureBase: base, incrementalBenefit: benefit });

const IT201I = 'New York State Department of Taxation and Finance, 2025 Form IT-201-I, Instructions for Form IT-201 (www.tax.ny.gov/pdf/2025/inc/it201i_2025.pdf), read 2026-11-21';
const IT203I = 'New York State Department of Taxation and Finance, 2025 Form IT-203-I (www.tax.ny.gov/pdf/2025/inc/it203i_2025.pdf), read 2026-11-21';
const TABLES = 'New York State Department of Taxation and Finance, 2025 tax tables for Form IT-201 (www.tax.ny.gov/pit/file/tax-tables/it201i-2025.htm), read 2026-11-21';
const TAX601 = 'New York Tax Law section 601 as published by the New York State Senate (www.nysenate.gov/legislation/laws/TAX/601, revision of 2025-07-11, as amended by Chapter 59 of the Laws of 2025, Part A), read 2026-11-21';
const TAX606 = 'New York Tax Law section 606 as published by the New York State Senate (www.nysenate.gov/legislation/laws/TAX/606, revision of 2026-10-23), read 2026-11-21';
const W2026 = 'New York State Department of Taxation and Finance, Publications NYS-50-T-NYS, NYS-50-T-NYC and NYS-50-T-Y (1/26), withholding tables effective January 1, 2026 (www.tax.ny.gov/pdf/publications/withholding/), read 2026-11-21';
const NOT_PUBLISHED_2026 = 'The 2026 Forms IT-201, IT-203, IT-196 and their instructions and tax tables were not published by the Department of Taxation and Finance as of 2026-11-21';

const NYS_2025 = {
  mfj: [band(0, 400, 0), band(17150, 450, 686), band(23600, 525, 976), band(27900, 550, 1202), band(161550, 600, 8553), band(323200, 685, 18252), band(2155350, 965, 143754), band(5000000, 1030, 418263), band(25000000, 1090, 2478263)],
  single: [band(0, 400, 0), band(8500, 450, 340), band(11700, 525, 484), band(13900, 550, 600), band(80650, 600, 4271), band(215400, 685, 12356), band(1077550, 965, 71413), band(5000000, 1030, 449929), band(25000000, 1090, 2509929)],
  hoh: [band(0, 400, 0), band(12800, 450, 512), band(17650, 525, 730), band(20900, 550, 901), band(107650, 600, 5672), band(269300, 685, 15371), band(1616450, 965, 107651), band(5000000, 1030, 434163), band(25000000, 1090, 2494163)],
};
const NYS_2026 = {
  mfj: [band(0, 390, 0), band(17150, 440, 669), band(23600, 515, 953), band(27900, 540, 1174), band(161550, 590, 8391), band(323200, 685, 17928), band(2155350, 965, 143430), band(5000000, 1030, 417939), band(25000000, 1090, 2477939)],
  single: [band(0, 390, 0), band(8500, 440, 332), band(11700, 515, 473), band(13900, 540, 586), band(80650, 590, 4191), band(215400, 685, 12141), band(1077550, 965, 71198), band(5000000, 1030, 449714), band(25000000, 1090, 2509714)],
  hoh: [band(0, 390, 0), band(12800, 440, 499), band(17650, 515, 712), band(20900, 540, 879), band(107650, 590, 5564), band(269300, 685, 15101), band(1616450, 965, 107381), band(5000000, 1030, 433894), band(25000000, 1090, 2493894)],
};
const RECAPTURE_2025 = {
  startAgi: 107650, phaseIn: 50000, topAgi: 25000000, topRateBp: 1090,
  flat: { mfj: { upToTaxable: 161550, rateBp: 550 }, single: { upToTaxable: 215400, rateBp: 600 }, hoh: { upToTaxable: 269300, rateBp: 600 } },
  tiers: {
    mfj: [tier(161550, 333, 807), tier(323200, 1140, 2747), tier(2155350, 3887, 60350), tier(5000000, 64237, 32500)],
    single: [tier(215400, 568, 1831), tier(1077550, 2399, 30172), tier(5000000, 32571, 32500)],
    hoh: [tier(269300, 787, 2289), tier(1616450, 3076, 45261), tier(5000000, 48337, 32500)],
  },
};
const RECAPTURE_2026 = {
  startAgi: 107650, phaseIn: 50000, topAgi: 25000000, topRateBp: 1090,
  flat: { mfj: { upToTaxable: 161550, rateBp: 540 }, single: { upToTaxable: 215400, rateBp: 590 }, hoh: { upToTaxable: 269300, rateBp: 590 } },
  tiers: {
    mfj: [tier(161550, 333, 807), tier(323200, 1140, 3071), tier(2155350, 4211, 60350), tier(5000000, 64561, 32500)],
    single: [tier(215400, 567, 2047), tier(1077550, 2614, 30172), tier(5000000, 32786, 32500)],
    hoh: [tier(269300, 787, 2559), tier(1616450, 3346, 45260), tier(5000000, 48606, 32500)],
  },
};

const NYC_SCHEDULE = {
  mfj: [band(0, 307.8, 0), band(21600, 376.2, 665), band(45000, 381.9, 1545), band(90000, 387.6, 3264)],
  single: [band(0, 307.8, 0), band(12000, 376.2, 369), band(25000, 381.9, 858), band(50000, 387.6, 1813)],
  hoh: [band(0, 307.8, 0), band(14400, 376.2, 443), band(30000, 381.9, 1030), band(60000, 387.6, 2176)],
};

const tableShape = (firstRows, bases) => ({ belowTaxable: 65000, maxNyAgi: 107650, firstRows, rowWidth: 50, method: 'tax_at_the_midpoint_of_each_row_by_the_rate_schedule_rounded_to_the_dollar', bases });
const NYS_TABLE_2025 = tableShape([[0, 13], [13, 25], [25, 50]], {
  mfj: [0, 68600, 97625, 120200].map((cents, index) => ({ overCents: [0, 1715000, 2360000, 2790000][index], baseCents: cents })),
  single: [0, 34000, 48400, 60000].map((cents, index) => ({ overCents: [0, 850000, 1170000, 1390000][index], baseCents: cents })),
  hoh: [0, 51200, 73000, 90100].map((cents, index) => ({ overCents: [0, 1280000, 1765000, 2090000][index], baseCents: cents })),
});
const NYS_TABLE_2026 = tableShape([[0, 13], [13, 25], [25, 50]], {
  mfj: [0, 66900, 95300, 117400].map((cents, index) => ({ overCents: [0, 1715000, 2360000, 2790000][index], baseCents: cents })),
  single: [0, 33200, 47300, 58600].map((cents, index) => ({ overCents: [0, 850000, 1170000, 1390000][index], baseCents: cents })),
  hoh: [0, 49900, 71200, 87900].map((cents, index) => ({ overCents: [0, 1280000, 1765000, 2090000][index], baseCents: cents })),
  provisional: true,
});
const NYC_TABLE = (provisional) => ({ ...tableShape([[0, 18], [18, 25], [25, 50]], null), ...(provisional ? { provisional: true } : {}) });

const HOUSEHOLD = {
  single: [{ upTo: 5000, credit: 75 }, { upTo: 6000, credit: 60 }, { upTo: 7000, credit: 50 }, { upTo: 20000, credit: 45 }, { upTo: 25000, credit: 40 }, { upTo: 28000, credit: 20 }],
  family: [
    { upTo: 5000, byCount: [90, 105, 120, 135, 150, 165, 180], eachOver7: 15 },
    { upTo: 6000, byCount: [75, 90, 105, 120, 135, 150, 165], eachOver7: 15 },
    { upTo: 7000, byCount: [65, 80, 95, 110, 125, 140, 155], eachOver7: 15 },
    { upTo: 20000, byCount: [60, 75, 90, 105, 120, 135, 150], eachOver7: 15 },
    { upTo: 22000, byCount: [60, 70, 80, 90, 100, 110, 120], eachOver7: 10 },
    { upTo: 25000, byCount: [50, 60, 70, 80, 90, 100, 110], eachOver7: 10 },
    { upTo: 28000, byCount: [40, 45, 50, 55, 60, 65, 70], eachOver7: 5 },
    { upTo: 32000, byCount: [20, 25, 30, 35, 40, 45, 50], eachOver7: 5 },
  ],
  mfs: [
    { upTo: 5000, byCount: [45, 53, 60, 68, 75, 83, 90], eachOver7: 8 },
    { upTo: 6000, byCount: [38, 45, 53, 60, 68, 75, 83], eachOver7: 8 },
    { upTo: 7000, byCount: [33, 40, 48, 55, 63, 70, 78], eachOver7: 8 },
    { upTo: 20000, byCount: [30, 38, 45, 53, 60, 68, 75], eachOver7: 8 },
    { upTo: 22000, byCount: [30, 35, 40, 45, 50, 55, 60], eachOver7: 5 },
    { upTo: 25000, byCount: [25, 30, 35, 40, 45, 50, 55], eachOver7: 5 },
    { upTo: 28000, byCount: [20, 23, 25, 28, 30, 33, 35], eachOver7: 3 },
    { upTo: 32000, byCount: [10, 13, 15, 18, 20, 23, 25], eachOver7: 3 },
  ],
};
const NYC_HOUSEHOLD = {
  single: [{ upTo: 10000, credit: 15 }, { upTo: 12500, credit: 10 }],
  family: [{ upTo: 15000, perPerson: 30 }, { upTo: 17500, perPerson: 25 }, { upTo: 20000, perPerson: 15 }, { upTo: 22500, perPerson: 10 }],
  mfs: [
    { upTo: 15000, byCount: [15, 30, 45, 60, 75, 90, 105], eachOver7: 15 },
    { upTo: 17500, byCount: [13, 25, 38, 50, 63, 75, 88], eachOver7: 13 },
    { upTo: 20000, byCount: [8, 15, 23, 30, 38, 45, 53], eachOver7: 8 },
    { upTo: 22500, byCount: [5, 10, 15, 20, 25, 30, 35], eachOver7: 5 },
  ],
};
const NYC_CREDITS = {
  schoolFixedCents: { single: 6250, mfs: 6250, hoh: 6250, mfj: 12500, qss: 12500 },
  schoolFixedIncomeLimit: 250000,
  schoolRateReduction: { incomeLimit: 500000, lowRateMillionths: 1710, highRateMillionths: 2280, breakpoint: { mfj: 21600, qss: 21600, single: 12000, mfs: 12000, hoh: 14400 }, baseAtBreakpoint: { mfj: 37, qss: 37, single: 21, mfs: 21, hoh: 25 } },
  eic: [
    { from: 0, under: 5000, rate: 0.30 },
    { from: 5000, under: 7500, rate: 0.30, slopeFrom: 4999 },
    { from: 7500, under: 15000, rate: 0.25 },
    { from: 15000, under: 17500, rate: 0.25, slopeFrom: 14999 },
    { from: 17500, under: 20000, rate: 0.20 },
    { from: 20000, under: 22500, rate: 0.20, slopeFrom: 19999 },
    { from: 22500, under: 40000, rate: 0.15 },
    { from: 40000, under: 42500, rate: 0.15, slopeFrom: 39999 },
    { from: 42500, under: null, rate: 0.10 },
  ],
  eicSlopePerDollar: 0.00002,
};
const ELIMINATION_2025 = {
  phaseOut: 5000,
  investmentIncomeLimit: 10000,
  thresholds: {
    joint: [36789, 46350, 54545, 61071, 68403, 75204, 91902],
    other: [31503, 36824, 46512, 53711, 59928, 65712, 74565, 88361],
  },
};

export const RULES = [
  {
    id: 'us.state-return.ny.tax-rates',
    value: { schedules: NYS_2025, recapture: RECAPTURE_2025 },
    basis: 'new_york_state_tax_by_the_rate_schedule_base_plus_rate_on_the_excess_with_the_tax_table_benefit_recapture_worksheets_above_new_york_agi_of_107650',
    ...year(2025),
    act: 'New York Tax Law',
    section: '601(a), (b), (c) and the 2023-2025 table benefit recapture subsection',
    source: `${IT201I}, New York State tax rate schedule (page 33) and Tax computation worksheets 1 to 16 (pages 34 to 39); recapture bases and incremental benefits agree with ${TAX601} for taxable years 2023 to 2025`,
    attestations: []
  },
  {
    id: 'us.state-return.ny.tax-rates',
    value: { schedules: NYS_2026, recapture: RECAPTURE_2026 },
    basis: 'new_york_state_tax_by_the_rate_schedule_enacted_for_2026_with_the_2026_table_benefit_recapture_bases_and_incremental_benefits',
    ...year(2026),
    act: 'New York Tax Law, as amended by Chapter 59 of the Laws of 2025, Part A',
    section: '601(a)(1)(B)(vii), (b)(1)(B)(vii), (c)(1)(B)(vii) and the 2026 table benefit recapture subsection',
    source: `${TAX601}: "For taxable years beginning after two thousand twenty-five and before two thousand twenty-seven" schedules (3.90%, 4.40%, 5.15%, 5.40%, 5.90%, then 6.85%, 9.65%, 10.30%, 10.90%) and the recapture subsection "for taxable years beginning on or after two thousand twenty-six and before two thousand twenty-seven" (recapture bases, incremental benefits and the 5.40 percent joint and 5.90 percent other flat rates below the first tier); ${W2026} confirm the 2026 rate reductions under Chapter 59 of the Laws of 2025 (Part A). A rate change enacted by statute, not provisional`,
    attestations: []
  },
  {
    id: 'us.state-return.ny.tax-table',
    value: NYS_TABLE_2025,
    basis: 'new_york_state_tax_table_below_65000_of_taxable_income_when_new_york_agi_is_107650_or_less_rows_of_50_dollars_taxed_at_the_row_midpoint',
    ...year(2025),
    act: 'New York Tax Law',
    section: '601',
    source: `${TABLES}: rows $0-$13, $13-$25, $25-$50 and then $50 wide to $65,000; every one of the 1,302 rows in each status column was reproduced by taxing the row midpoint by the rate schedule and rounding to the dollar, with the joint column using a base of $976.25 (not the rounded $976) for the 5.25% band, which the published table requires`,
    attestations: []
  },
  {
    id: 'us.state-return.ny.tax-table',
    value: NYS_TABLE_2026,
    basis: 'new_york_state_tax_table_below_65000_of_taxable_income_rows_of_50_dollars_taxed_at_the_row_midpoint_by_the_2026_schedule',
    ...year(2026),
    act: 'New York Tax Law, as amended by Chapter 59 of the Laws of 2025, Part A',
    section: '601',
    source: `${NOT_PUBLISHED_2026}; the 2025 table construction (midpoint of $50 rows, ${TABLES}) is applied to the enacted 2026 rate schedule (${TAX601}) with its statutory bases until the Department publishes the 2026 table, so the record is provisional`,
    attestations: []
  },
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ny.deductions',
    value: { standard: { single: 8000, singleDependent: 3100, mfj: 16050, mfs: 8000, hoh: 11200, qss: 16050 }, dependentExemption: 1000, ...(y === 2026 ? { provisional: true } : {}) },
    basis: 'new_york_standard_deduction_by_filing_status_3100_for_a_single_filer_who_can_be_claimed_as_a_dependent_and_1000_for_each_dependent',
    ...year(y),
    act: 'New York Tax Law',
    section: '614; 616',
    source: y === 2025 ? `${IT201I}, New York State standard deduction table and line 36 ("The value of each New York State dependent exemption is $1,000")` : `${NOT_PUBLISHED_2026}; the 2025 amounts (${IT201I}) are carried. Section 614 as published (revision of 2018-04-27, read 2026-11-21) states $7,500/$15,000/$10,500 before the indexing the Department applies, so the 2026 amounts stay provisional until the 2026 instructions are out`,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ny.itemized',
    value: { medicalFloorBp: 1000, miscFloorBp: 200, limitation: { federalAgiOver: { single: 340700, mfj: 408850, qss: 408850, hoh: 374800, mfs: 204400 }, rateBp: 300, maxReductionBp: 8000 }, adjustment: { start: 100000, worksheet3Over: { single: 100000, mfs: 100000, hoh: 150000, mfj: 200000, qss: 200000 }, phaseIn: 50000, rateBp: 2500, worksheet4Over: 475000, halfAbove: 525000, charityOnlyAbove: 1000000, charityHalfBp: 5000, charityQuarterAbove: 10000000, charityQuarterBp: 2500 }, ...(y === 2026 ? { provisional: true } : {}) },
    basis: 'new_york_itemized_deduction_form_it196_medical_above_10_percent_no_state_income_tax_overall_limitation_and_the_high_income_itemized_deduction_adjustment',
    ...year(y),
    act: 'New York Tax Law',
    section: '615',
    source: y === 2025 ? 'New York State Department of Taxation and Finance, 2025 Form IT-196 and IT-196-I (www.tax.ny.gov/pdf/2025/inc/it196_2025_fill_in.pdf and it196i_2025.pdf): line 3 (10% of federal AGI), lines 25 to 28 (2% floor), Line 40 Total itemized deductions worksheet ($408,850 joint, $374,800 head of household, $340,700 single, $204,400 separate; 3% and 80%), line 41 (state and local income taxes removed), line 46 Worksheets 3 and 4 and line 47 (50% and 25% of charitable gifts above $1,000,000 and $10,000,000), read 2026-11-21' : `${NOT_PUBLISHED_2026}; the 2025 Form IT-196 amounts are carried, and the line 40 thresholds are indexed each year, so the record is provisional`,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ny.modifications',
    value: { pensionExclusion: 20000, pensionExclusionAgeMonths: 714, college529Limit: { joint: 10000, other: 5000 } },
    basis: 'pension_and_annuity_exclusion_up_to_20000_per_person_from_age_59_and_a_half_and_the_new_york_529_contribution_subtraction_up_to_5000_or_10000_joint',
    ...year(y),
    act: 'New York Tax Law',
    section: '612(c)(3-a); 612(c)(32)',
    source: `${IT201I}, line 29 (pension and annuity income exclusion, "not more than $20,000", for those 59½ before January 1) and Line 30 worksheet (contributions up to $5,000, $10,000 for married taxpayers filing a joint return); fixed dollar amounts in Tax Law section 612(c)(3-a) and (32) as published by the New York State Senate (www.nysenate.gov/legislation/laws/TAX/612, revision of 2026-09-04: "not in excess of twenty thousand dollars", "shall not exceed ten thousand dollars" for joint returns), read 2026-11-21, not indexed`,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ny.household-credit',
    value: HOUSEHOLD,
    basis: 'new_york_state_household_credit_tables_1_to_3_by_federal_agi_and_household_size',
    ...year(y),
    act: 'New York Tax Law',
    section: '606(b)',
    source: `${IT201I}, New York State household credit tables 1, 2 and 3 (page 12); the amounts are fixed in ${TAX606}, subsection (b), not indexed`,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ny.credits',
    value: {
      eicBp: 3000,
      escc: { underFour: 1000, fourToSixteen: y === 2025 ? 330 : 500, threshold: { mfj: 110000, single: 75000, hoh: 75000, qss: 75000, mfs: 55000 }, reductionBp: 165 },
      collegeTuition: { perStudentCap: 10000, smallLimit: 5000, smallCredit: 200, rateBp: 400 },
    },
    basis: 'new_york_eic_30_percent_of_federal_eic_less_the_household_credit_empire_state_child_credit_per_child_by_age_less_16_50_per_1000_of_federal_agi_over_the_threshold_college_tuition_credit',
    ...year(y),
    act: y === 2025 ? 'New York Tax Law' : 'New York Tax Law, as amended by Chapter 59 of the Laws of 2025',
    section: '606(c-1)(1-a); 606(d); 606(t)',
    source: `${TAX606}: (c-1)(1-a)(${y === 2025 ? 'A' : 'B'}) "one thousand dollars times the number of qualifying children of the taxpayer aged three or younger" and "${y === 2025 ? 'three hundred thirty' : 'five hundred'} dollars" for those aged four to sixteen, (C) reduced by $16.50 for each $1,000 of federal AGI over $110,000 joint, $75,000 single, head of household or surviving spouse, $55,000 separate; (d) thirty percent of the federal earned income credit less the household credit${y === 2025 ? `; Form IT-213 (2025) lines 1 to 9 and Form IT-215 (2025) lines 10 to 16; Form IT-272 (2025) lines 3 to 7 (credit is the lesser of $200 or the expenses below $5,000, otherwise 4%, expenses capped at $10,000 a student), read 2026-11-21` : '; the college tuition credit amounts are fixed in section 606(t)'}`,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ny.nyc',
    value: { schedules: NYC_SCHEDULE, household: NYC_HOUSEHOLD, ...NYC_CREDITS },
    basis: 'new_york_city_resident_tax_rate_schedule_household_credit_school_tax_credits_and_city_earned_income_credit',
    ...year(y),
    act: 'New York Tax Law, Article 30 (New York City personal income tax)',
    section: '1304; 1304-B; 1310',
    source: y === 2025 ? `${IT201I}, New York City tax rate schedule (page 40), New York City household credit tables 4 to 6, line 69 school tax credit tables (statutory $62.50 and $125, rounded), line 69a rate reduction calculation, and Form IT-215-I (2025) NYC EIC rate table and worksheet (www.tax.ny.gov/pdf/2025/inc/it215i_2025.pdf), read 2026-11-21` : `Tax Law section 1304(a) base rates (2.7%, 3.3%, 3.35%, 3.4%, www.nysenate.gov/legislation/laws/TAX/1304, revision of 2026-06-12) and section 1304-B additional tax of 14 percent authorised for years before 2030 (www.nysenate.gov/legislation/laws/TAX/1304-B), read 2026-11-21, give the same 3.078% to 3.876% rates for 2026; ${W2026} lists no change to the city rates; the credits are fixed amounts in section 1310 carried from the 2025 instructions`,
    attestations: []
  })),
  {
    id: 'us.state-return.ny.nyc-table',
    value: NYC_TABLE(false),
    basis: 'new_york_city_tax_table_below_65000_of_city_taxable_income_rows_of_50_dollars_taxed_at_the_row_midpoint',
    ...year(2025),
    act: 'New York Tax Law, Article 30',
    section: '1304',
    source: `${TABLES}, New York City Tax Table: rows $0-$18, $18-$25, $25-$50 and then $50 wide to $65,000; all 1,302 rows in each status column reproduced by taxing the row midpoint by the city rate schedule with its published bases and rounding to the dollar`,
    attestations: []
  },
  {
    id: 'us.state-return.ny.nyc-table',
    value: NYC_TABLE(true),
    basis: 'new_york_city_tax_table_below_65000_of_city_taxable_income_rows_of_50_dollars_taxed_at_the_row_midpoint',
    ...year(2026),
    act: 'New York Tax Law, Article 30',
    section: '1304',
    source: `${NOT_PUBLISHED_2026}; the 2025 city table construction is carried, so the record is provisional`,
    attestations: []
  },
  {
    id: 'us.state-return.ny.nyc-elimination',
    value: ELIMINATION_2025,
    basis: 'new_york_city_income_tax_elimination_credit_for_filers_with_a_dependent_below_the_income_threshold_phased_out_over_5000',
    ...year(2025),
    act: 'New York Tax Law',
    section: '1310(h)',
    source: 'New York State Department of Taxation and Finance, 2025 Form IT-270 and IT-270-I, New York City Income Tax Elimination Credit (www.tax.ny.gov/pdf/2025/inc/it270i_2025.pdf), Part 1 and the line 2 income thresholds table, read 2026-11-21',
    attestations: []
  },
  {
    id: 'us.state-return.ny.nyc-elimination',
    value: { ...ELIMINATION_2025, provisional: true },
    basis: 'new_york_city_income_tax_elimination_credit_for_filers_with_a_dependent_below_the_income_threshold_phased_out_over_5000',
    ...year(2026),
    act: 'New York Tax Law',
    section: '1310(h)',
    source: `${NOT_PUBLISHED_2026}; the 2026 Form IT-270 income thresholds are not published and are carried from 2025, so the record is provisional`,
    attestations: []
  },
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ny.yonkers',
    value: { residentSurchargeBp: 1675, nonresidentEarningsBp: 50 },
    basis: 'yonkers_resident_income_tax_surcharge_of_16_75_percent_of_net_new_york_state_tax',
    ...year(y),
    act: 'New York Tax Law, Article 30-A; City of Yonkers local law',
    section: '1321',
    source: y === 2025 ? `${IT201I}, Yonkers worksheet line n ("Yonkers resident tax rate (16.75%)") and Form IT-360.1 (2025) line 76` : `${W2026}: NYS-50-T-Y (1/26) multiplies by 16.75% (0.1675) for Yonkers residents and states "The Yonkers nonresident earnings tax rate has not changed"`,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ny.mctmt',
    value: { thresholdPerPerson: 50000, zone1Bp: 60, zone2Bp: 34, ...(y === 2026 ? { provisional: true } : {}) },
    basis: 'metropolitan_commuter_transportation_mobility_tax_on_self_employment_earnings_allocated_to_a_zone_above_50000_per_person',
    ...year(y),
    act: 'New York Tax Law, Article 23',
    section: '801',
    source: `${IT201I}, lines 54a to 54e (Zone 1 0.60%, Zone 2 0.34%, $50,000 a zone per individual); ${IT203I}, lines 52b to 52f; ${y === 2026 ? `${NOT_PUBLISHED_2026}; the 2025 rates are carried and Tax Law section 801 was not re-read, so the record is provisional` : 'Tax Law section 801 not re-read for this record'}`,
    attestations: []
  })),
];
