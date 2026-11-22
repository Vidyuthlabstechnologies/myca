const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const BOOK_2025 = 'Alabama Department of Revenue, 2025 Form 40 Booklet (Form 40 and instructions, www.revenue.alabama.gov/wp-content/uploads/2026/01/25f40bk.pdf), read 2026-11-21';
const NR_2025 = 'Alabama Department of Revenue, 2025 Form 40NR Booklet and 2025 Form 40NR Standard Deduction Chart (www.revenue.alabama.gov/wp-content/uploads/2026/01/25f40nrbk.pdf and 25stddeduction40nr.pdf), read 2026-11-21';
const STATUTE_2026 = 'Code of Alabama 1975 sections 40-18-5, 40-18-15 and 40-18-19 fix these amounts in dollars with no inflation adjustment, so they apply unchanged in 2026 (the 2025 Form 40 Booklet, www.revenue.alabama.gov/wp-content/uploads/2026/01/25f40bk.pdf, read 2026-11-21, prints the same statutory amounts); Alabama has not published the 2026 Form 40 as of 2026-11-21';
const HB527 = 'Alabama Act 2026 (HB527 Enrolled, alison.legislature.state.al.us/files/pdf/SearchableInstruments/2026RS/HB527-enr.pdf), amending Code of Alabama 1975 section 40-18-15(a)(29): "For tax years beginning on and after January 1, 2026, and ending December 31, 2028, qualified overtime compensation received during the taxable year, not to exceed one thousand dollars ($1,000) per taxpayer", allowed "regardless of whether the taxpayer itemizes", read 2026-11-21';

const incomeTax = {
  brackets: { other: [{ overCents: 0, rateBp: 200 }, { overCents: 50000, rateBp: 400 }, { overCents: 300000, rateBp: 500 }], mfj: [{ overCents: 0, rateBp: 200 }, { overCents: 100000, rateBp: 400 }, { overCents: 600000, rateBp: 500 }] },
  tableBelow: 100000,
  tableBands: [{ from: 0, width: 50 }, { from: 100, width: 100 }],
  tableOverrides: [{ from: 0, to: 50, tax: 0 }, { from: 50, to: 100, tax: 1 }],
  over100000Base: { other: 4958, mfj: 4918 },
  over100000RateBp: 500,
};

const deductions = {
  personalExemption: { single: 1500, mfs: 1500, hoh: 3000, mfj: 3000, qss: 3000 },
  standardDeduction: {
    single: { maximum: 3000, start: 25500, step: 500, reduction: 25, minimum: 2500 },
    hoh: { maximum: 5200, start: 25500, step: 500, reduction: 135, minimum: 2500 },
    mfj: { maximum: 8500, start: 25500, step: 500, reduction: 175, minimum: 5000 },
    qss: { maximum: 8500, start: 25500, step: 500, reduction: 175, minimum: 5000 },
    mfs: { maximum: 4250, start: 12750, step: 250, reduction: 88, minimum: 2500 },
  },
  dependentExemption: [{ upTo: 50000, amount: 1000 }, { upTo: 100000, amount: 500 }, { upTo: null, amount: 300 }],
  medicalFloorBasisPoints: 400,
  miscFloorBasisPoints: 200,
  vehicleInterest: { maximum: 10000, phaseStart: { mfj: 200000, other: 100000 }, perThousand: 200 },
  collegeSavingsMaximum: { mfj: 10000, other: 5000 },
  retirementExclusion: { age: 65, amount: 6000 },
};

export const RULES = [
  {
    id: 'us.state-return.al.income-tax',
    value: incomeTax,
    basis: 'tax_table_at_the_midpoint_of_each_band_below_100000_and_5_percent_of_the_excess_over_100000_plus_the_printed_base_above',
    ...year(2025),
    act: 'Code of Alabama 1975',
    section: '40-18-5',
    source: `${BOOK_2025}: 2% on the first $500 ($1,000 joint), 4% to $3,000 ($6,000 joint), 5% above; 2025 tax table ($0 for 0-50 and $1 for 50-100 in both columns, then $100 bands to $100,000) and the over $100,000 worksheet "Multiply line 3 by .05" plus "4,958.00" (single, married filing separately, head of family) or "4,918.00" (married filing jointly)`,
    attestations: []
  },
  {
    id: 'us.state-return.al.income-tax',
    value: incomeTax,
    basis: 'tax_table_at_the_midpoint_of_each_band_below_100000_and_5_percent_of_the_excess_over_100000_plus_the_printed_base_above',
    ...year(2026),
    act: 'Code of Alabama 1975',
    section: '40-18-5',
    source: STATUTE_2026,
    attestations: []
  },
  {
    id: 'us.state-return.al.deductions',
    value: deductions,
    basis: 'personal_exemption_by_status_standard_deduction_reduced_for_each_step_of_agi_dependent_exemption_by_agi_and_schedule_a_floors',
    ...year(2025),
    act: 'Code of Alabama 1975',
    section: '40-18-15; 40-18-19',
    source: `${BOOK_2025}: personal exemption "$1,500" single and married filing separately, "$3,000" married filing jointly and head of family; Standard Deduction chart (married filing joint $8,500 to $25,999 falling $175 per $500 to $5,000; married filing separate $4,250 to $12,999 falling $88 per $250 to $2,500; head of family $5,200 falling $135 per $500 to $2,500; single $3,000 falling $25 per $500 to $2,500); dependent exemption $1,000 / $500 / $300 by AGI to $50,000 / $100,000 / over; Schedule A medical over 4% of AGI and miscellaneous over 2%; qualified vehicle loan interest worksheet ($10,000 less $200 per $1,000 over $100,000, $200,000 joint); CollegeCounts deduction up to $5,000 ($10,000 joint); Schedule RS retirement exclusion "up to $6,000" per taxpayer 65 or older; ${NR_2025} for the same amounts on Form 40NR`,
    attestations: []
  },
  {
    id: 'us.state-return.al.deductions',
    value: { ...deductions, overtimeMaximum: 1000 },
    basis: 'personal_exemption_by_status_standard_deduction_reduced_for_each_step_of_agi_dependent_exemption_by_agi_schedule_a_floors_and_overtime_deduction',
    ...year(2026),
    act: 'Code of Alabama 1975; Alabama Act 2026 (HB527)',
    section: '40-18-15(a)(29); 40-18-15(b); 40-18-19',
    source: `${STATUTE_2026}; ${HB527}`,
    attestations: []
  }
];
