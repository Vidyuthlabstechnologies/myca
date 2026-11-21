const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const D = 100;
const WI = 'https://www.revenue.wi.gov';
const READ = 'read 2026-11-21';
const INSTR_2025 = `Wisconsin Department of Revenue, 2025 Form 1 Instructions I-111 (${WI}/TaxForms2025/2025-Form1-Inst.pdf): New in 2025, lines 8, 10, 12 to 18 and 30, the 2025 Standard Deduction Table (pages 35 to 37), the 2025 Tax Table (pages 38 to 43, checked row by row against the rate schedule at the row midpoint) and the Tax Computation Worksheet (page 44); 2025 Form 1 (${WI}/TaxForms2025/2025-Form1.pdf) Schedules 1 and 2; 2025 Form 1NPR and instructions (${WI}/TaxForms2025/2025-Form1NPR.pdf, 2025-Form1NPR-Inst.pdf) lines 1 to 52; 2025 Schedule SB and instructions (${WI}/TaxForms2025/2025-ScheduleSB-Inst.pdf) lines 1 to 5, 16 and 17; 2025 Schedule AD and Schedule WD; 2025 Form 1-ES instructions (standard deduction and rate schedules); ${READ}`;
const ES_2026 = `Wisconsin Department of Revenue, 2026 Form 1-ES instructions (${WI}/TaxForms2026/2026-Form1-ES-Inst.pdf, laws enacted as of January 16, 2026): 2026 standard deduction schedules and 2026 tax rate schedules; 2026 Form 1 (${WI}/TaxForms2026/2026-Form1.pdf) line layout, exemptions of $700 and $250, Schedule 1 (5 percent) and Schedule 2 ($16,000, 3 percent, $480); ${READ}`;
const PROVISIONAL_2026 = 'The 2026 Form 1 and Form 1NPR instructions, with the 2026 Standard Deduction Table, Tax Table and the indexed dependent standard deduction amounts, are not published as of 2026-11-21. The brackets and standard deduction schedules are the published 2026 Form 1-ES figures and are applied with the 2025 table construction (row midpoints); the dependent standard deduction amounts and the Form 1NPR line numbers are carried from 2025. Marked provisional until the 2026 instructions are published';

const brackets = (rows) => rows.map(([over, rateBp]) => ({ overCents: over * D, rateBp }));

const TAX = {
  2025: {
    brackets: {
      single: brackets([[0, 350], [14680, 440], [50480, 530], [323290, 765]]),
      mfj: brackets([[0, 350], [19580, 440], [67300, 530], [431060, 765]]),
      mfs: brackets([[0, 350], [9790, 440], [33650, 530], [215530, 765]]),
    },
    tableBelow: 100000,
    standard: {
      single: { base: 13560, start: 19550, rate: 0.12 },
      mfj: { base: 25110, start: 28210, rate: 0.19778 },
      mfs: { base: 11930, start: 13390, rate: 0.19778 },
      hoh: { base: 17520, start: 19550, rate: 0.22515, singleFrom: 57210 },
    },
    standardTable: { firstRowEnd: 13390, rowStep: 500, lastRowEnd: 155169 },
    dependentStandard: { earnedAdd: 450, minimum: 1350 },
    exemption: { personal: 700, senior: 250 },
    unemployment: { mfj: 18000, single: 12000, mfsApart: 12000, mfsTogether: 0 },
    capitalGainExclusionBp: 3000,
    retirement: { age: 67, perPerson: 24000 },
    smallRetirement: { age: 65, amount: 5000, agiBelow: { mfj: 30000, other: 15000 } },
    lines: { itemized: '13', school: '16', schoolRent: '16a', schoolOwner: '16b', married: '18', otherState: '20', creditsTotal: '21', netTax: '22', useTax: '23', donations: '24', total: '27', withheld: '28', estimated: '29', eitc: '30' },
  },
  2026: {
    brackets: {
      single: brackets([[0, 350], [15110, 440], [51950, 530], [332720, 765]]),
      mfj: brackets([[0, 350], [20150, 440], [69260, 530], [443630, 765]]),
      mfs: brackets([[0, 350], [10080, 440], [34630, 530], [221820, 765]]),
    },
    tableBelow: 100000,
    standard: {
      single: { base: 13960, start: 20120, rate: 0.12 },
      mfj: { base: 25840, start: 29040, rate: 0.19778 },
      mfs: { base: 12280, start: 13780, rate: 0.19778 },
      hoh: { base: 18030, start: 20120, rate: 0.22515, singleFrom: 58827 },
    },
    standardTable: { firstRowEnd: 13780, rowStep: 500, lastRowEnd: 159690 },
    dependentStandard: { earnedAdd: 450, minimum: 1350 },
    exemption: { personal: 700, senior: 250 },
    unemployment: { mfj: 18000, single: 12000, mfsApart: 12000, mfsTogether: 0 },
    capitalGainExclusionBp: 3000,
    retirement: { age: 67, perPerson: 24000 },
    smallRetirement: { age: 65, amount: 5000, agiBelow: { mfj: 30000, other: 15000 } },
    lines: { itemized: '13', school: '17', schoolRent: '17a', schoolOwner: '17b', married: '19', otherState: '21', creditsTotal: '22', netTax: '23', useTax: '24', donations: '25', total: '28', withheld: '29', estimated: '30', eitc: '31' },
    provisional: true,
  },
};

const CREDITS = {
  itemizedCredit: { rateBp: 500, medicalFloorBp: 750 },
  schoolPropertyTax: { heatIncludedBp: 2000, heatNotIncludedBp: 2500, rateBp: 1200, max: 300, maxSeparate: 150, rentRowStep: 100, propertyRowStep: 25 },
  marriedCouple: { rateBp: 300, cap: 16000 },
  eitcBp: { 1: 400, 2: 1100, 3: 3400 },
};

export const RULES = [
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.wi.income-tax',
    value: TAX[y],
    basis: 'four_bracket_tax_on_wisconsin_taxable_income_wisconsin_income_less_the_sliding_scale_standard_deduction_and_exemptions_tax_table_at_the_row_midpoint_below_100000_nonresidents_and_part_year_residents_prorate_the_tax_by_wisconsin_income_over_federal_income',
    ...year(y),
    act: 'Wisconsin Statutes chapter 71',
    section: '71.06(1q); 71.05(6), (22) and (23); 71.04',
    source: y === 2025 ? INSTR_2025 : `${ES_2026}. ${PROVISIONAL_2026}`,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.wi.credits',
    value: CREDITS,
    basis: 'itemized_deduction_credit_5_percent_school_property_tax_credit_12_percent_of_rent_constituting_property_tax_or_property_tax_up_to_300_married_couple_credit_3_percent_of_up_to_16000_earned_income_eitc_4_11_34_percent_of_federal_by_children',
    ...year(y),
    act: 'Wisconsin Statutes chapter 71',
    section: '71.07(5)(b), (6), (9) and (9e)',
    source: y === 2025 ? INSTR_2025 : `${ES_2026}; the school property tax credit rates and the earned income credit percentages are statutory and unchanged for 2026 (2026 Form 1 lines 17 and 31)`,
    attestations: []
  })),
];
