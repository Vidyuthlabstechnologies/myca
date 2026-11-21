const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const D = 100;
const MN = 'https://www.revenue.state.mn.us/sites/default/files';
const READ = 'read 2026-11-21';
const SRC = {
  2025: {
    m1: `Minnesota Department of Revenue, 2025 Form M1 Instructions (${MN}/2026-10/m1-inst-25.pdf, updated 12/5/2025), What's new, lines 4 and 5 worksheets, 2025 Tax Tables and Tax Rate Schedules on page 39, ${READ}`,
    m1m: `Minnesota Department of Revenue, 2025 Schedule M1M and instructions (${MN}/2026-07/m1m-25.pdf), lines 11, 12 (Worksheet for line 12), 13 and 14, ${READ}`,
    m1sa: `Minnesota Department of Revenue, 2025 Schedule M1SA (${MN}/2025-10/m1sa-25-grid.pdf, final draft 10/15/25) lines 1 to 27, ${READ}; the line 26 phaseout follows the 2025 Form M1 instructions (itemized deductions reduced above $238,950, $119,475 married filing separately, limited to 20 percent above $1,083,150) with the Worksheet A/B steps of the 2026 Schedule M1SA instructions`,
    m1r: `Minnesota Department of Revenue, 2025 Schedule M1R and instructions (${MN}/2026-07/m1r-25.pdf), ${READ}`,
    cwfc: `Minnesota Department of Revenue, 2025 Schedule M1CWFC and instructions (${MN}/2026-07/m1cwfc-25.pdf) and 2025 Schedule M1DQC (${MN}/2026-01/m1dqc-25.pdf), ${READ}`,
    ma: `Minnesota Department of Revenue, 2025 Schedule M1MA and instructions (${MN}/2026-07/m1ma-25.pdf), Table for Line 8 checked cell by cell against lines 9 to 19 at the band midpoints, ${READ}`,
    ed: `Minnesota Department of Revenue, 2025 Schedule M1ED and instructions (${MN}/2026-07/m1ed-25.pdf), ${READ}`,
    rent: `Minnesota Department of Revenue, 2025 Schedule M1RENT and instructions (${MN}/2026-07/m1rent-25.pdf) and the Renter's Credit Table and Renter's Worksheet in the 2025 Form M1 instructions (pages 27 to 31), table checked cell by cell against the worksheet at the band midpoints, ${READ}`,
    nr: `Minnesota Department of Revenue, 2025 Schedule M1NR and instructions (${MN}/2026-07/m1nr-25.pdf) and 2025 Schedule M1CR (${MN}/2026-07/m1cr-25.pdf), ${READ}`,
  },
  2026: {
    m1: `Minnesota Department of Revenue, 2026 Form M1 Instructions (${MN}/2026-10/m1-inst-26.pdf) and 2026 Form M1 final draft 10/1/26 (${MN}/2026-10/m1-26.pdf), What's new, lines 4 and 5 worksheets, 2026 Tax Tables and Tax Rate Schedules on page 39 (the second married filing separately bracket is printed as 96,470 in one column; 96,740, half of the joint 193,480, is used because the printed base tax 6,225.25 equals 1,302.73 + 6.80 percent of 96,740 - 24,350), ${READ}`,
    m1m: `Minnesota Department of Revenue, 2026 Schedule M1M and instructions (${MN}/2026-11/m1m-26.pdf), lines 13, 14 (Worksheet for line 14), 15 and 16, ${READ}`,
    m1sa: `Minnesota Department of Revenue, 2026 Schedule M1SA and instructions final draft 11/4/26 (${MN}/2026-11/m1sa-26.pdf), lines 1 to 29 and Worksheets A and B for line 28, ${READ}`,
    m1r: `Minnesota Department of Revenue, 2026 Schedule M1R and instructions (${MN}/2026-10/m1r-26.pdf), ${READ}`,
    cwfc: `Minnesota Department of Revenue, 2026 Schedule M1CWFC and instructions (${MN}/2026-10/m1cwfc-26.pdf) and 2026 Schedule M1DQC (${MN}/2026-10/m1dqc-26.pdf), ${READ}`,
    ma: `Minnesota Department of Revenue, 2026 Schedule M1MA and instructions (${MN}/2026-10/m1ma-26.pdf), Table for Line 8 checked cell by cell against lines 9 to 19 at the band midpoints, ${READ}`,
    ed: `Minnesota Department of Revenue, 2026 Schedule M1ED and instructions (${MN}/2026-10/m1ed-26.pdf), ${READ}`,
    rent: `Minnesota Department of Revenue, 2026 Schedule M1RENT and instructions (${MN}/2026-10/m1rent-26.pdf) and the Renter's Credit Table and Renter's Worksheet in the 2026 Form M1 instructions, table checked cell by cell against the worksheet at the band midpoints, ${READ}`,
    nr: `Minnesota Department of Revenue, 2026 Schedule M1NR (${MN}/2026-11/m1nr-26.pdf) and 2026 Schedule M1CR (${MN}/2026-10/m1cr-26.pdf), ${READ}`,
  },
};

const brackets = (rows) => rows.map(([over, rateBp]) => ({ overCents: over * D, rateBp }));

const FIGURES = {
  2025: {
    brackets: {
      single: brackets([[0, 535], [32570, 680], [106990, 785], [198630, 985]]),
      mfj: brackets([[0, 535], [47620, 680], [189180, 785], [330410, 985]]),
      mfs: brackets([[0, 535], [23810, 680], [94590, 785], [165205, 985]]),
      hoh: brackets([[0, 535], [40100, 680], [161130, 785], [264050, 985]]),
    },
    tableBelow: 86800,
    standard: { single: 14950, mfj: 29900, qss: 29900, mfs: 14950, hoh: 22500 },
    additionalPerBox: { married: 1550, unmarried: 2000 },
    dependentStandard: { minimum: 1250, earnedAdd: 350 },
    phaseout: { start: { other: 238950, mfs: 119475 }, upper: { other: 330300, mfs: 165150 }, lowRateBp: 300, highRateBp: 1000, maxReductionBp: 8000, fullAt: 1083150 },
    exemption: { amount: 5200, start: { mfj: 358550, qss: 358550, hoh: 298800, single: 239050, mfs: 179275 }, step: { other: 2500, mfs: 1250 }, stepRateBp: 200, maxExcess: { other: 122500, mfs: 61250 } },
    itemized: { medicalFloorBp: 1000, taxesCap: { other: 10000, mfs: 5000 }, employeeFloorBp: 200, charityFloorBp: 0 },
    socialSecurity: { start: { mfj: 108320, qss: 108320, single: 84490, hoh: 84490, mfs: 54160 }, step: { other: 4000, mfs: 2000 }, stepRateBp: 1000, altBase: { mfj: 88630, qss: 88630, single: 69250, hoh: 69250, mfs: 44315 }, altRateBp: 2000, altMax: { mfj: 5840, qss: 5840, single: 4560, hoh: 4560, mfs: 2920 } },
    charitySubtraction: { floor: 500, rateBp: 5000, agiFloorBp: 0 },
    k12Subtraction: { perChildLower: 1625, perChildUpper: 2500, computerMax: 200 },
    senior: { base: { mfj: 12000, qss: 9600, single: 9600, hoh: 9600, mfs: 6000 }, agiFloor: { both: 18000, one: 14500, mfs: 9000 }, rateBp: 5000 },
    filingThreshold: 14950,
    m1mLines: { muni: '1', additions: '10', charity: '11', socialSecurity: '12', k12: '13', usBonds: '14', senior: '16', militaryPension: '25', subtractions: '40' },
    m1saLines: { total: '25', limitation: '26', result: '27', layout: 2025 },
  },
  2026: {
    brackets: {
      single: brackets([[0, 535], [33310, 680], [109430, 785], [203150, 985]]),
      mfj: brackets([[0, 535], [48700, 680], [193480, 785], [337930, 985]]),
      mfs: brackets([[0, 535], [24350, 680], [96740, 785], [168965, 985]]),
      hoh: brackets([[0, 535], [41010, 680], [164800, 785], [270060, 985]]),
    },
    tableBelow: 90000,
    standard: { single: 15300, mfj: 30600, qss: 30600, mfs: 15300, hoh: 23000 },
    additionalPerBox: { married: 1600, unmarried: 2000 },
    dependentStandard: { minimum: 1300, earnedAdd: 350 },
    phaseout: { start: { other: 244400, mfs: 122200 }, upper: { other: 337800, mfs: 168900 }, lowRateBp: 300, highRateBp: 1000, maxReductionBp: 8000, fullAt: 1107750 },
    exemption: { amount: 5300, start: { mfj: 366700, qss: 366700, hoh: 305600, single: 244500, mfs: 183350 }, step: { other: 2500, mfs: 1250 }, stepRateBp: 200, maxExcess: { other: 122500, mfs: 61250 } },
    itemized: { medicalFloorBp: 1000, taxesCap: { other: 10000, mfs: 5000 }, employeeFloorBp: 200, charityFloorBp: 100 },
    socialSecurity: { start: { mfj: 110780, qss: 110780, single: 86410, hoh: 86410, mfs: 55390 }, step: { other: 4000, mfs: 2000 }, stepRateBp: 1000, altBase: { mfj: 88630, qss: 88630, single: 69250, hoh: 69250, mfs: 44315 }, altRateBp: 2000, altMax: { mfj: 5840, qss: 5840, single: 4560, hoh: 4560, mfs: 2920 } },
    charitySubtraction: { floor: 500, rateBp: 5000, agiFloorBp: 100 },
    k12Subtraction: { perChildLower: 1625, perChildUpper: 2500, computerMax: 200 },
    senior: { base: { mfj: 12000, qss: 9600, single: 9600, hoh: 9600, mfs: 6000 }, agiFloor: { both: 18000, one: 14500, mfs: 9000 }, rateBp: 5000 },
    filingThreshold: 15300,
    m1mLines: { muni: '1', additions: '12', charity: '13', socialSecurity: '14', k12: '15', usBonds: '16', senior: '18', militaryPension: '27', subtractions: '43' },
    m1saLines: { total: '27', limitation: '28', result: '29', layout: 2026 },
  },
};

const CREDITS = {
  2025: {
    cwfc: { earnedCap: 9480, wfcRateBp: 400, olderChild: [0, 1000, 2270, 2710], perChild: 1750, phaseStart: { mfj: 37910, other: 31950 }, rateBp: 1200, olderOnlyRateBp: 900, investmentLimit: 11950 },
    marriage: { minLesser: 31000, minTaxable: 48000, tableBelow: 123000, rowStart: 31000, rowStep: 2000, colStart: 48000, colStep: 20000, colCount: 15, halfStandard: 14950, cap: 1851 },
    k12: { perChild: 1500, phaseStart: 75820, oneChildRateBp: 2500, moreRateBp: 5000, expenseRateBp: 7500, computerMax: 200 },
    renter: {
      rentRateBp: 1700, seniorSubtraction: 5200, dependentSubtraction: [0, 7280, 14040, 20280, 26000, 31200], rentStep: 25, tableBelow: 2500,
      rows: [0, 2210, 4430, 6670, 8860, 11070, 13290, 15530, 17730, 19960, 22160, 24360, 26600, 28820, 31030, 33240, 35450, 37690, 39890, 42110, 44320, 46540, 48760, 50970, 53180, 55400, 57620, 59840, 62060, 64260, 66480, 68720, 70920, 73140, 75350, 77570],
      bands: [[0, 100, 9500, 2720], [6670, 100, 9000, 2720], [8860, 110, 9000, 2640], [11070, 120, 9000, 2580], [15530, 130, 8500, 2500], [19960, 140, 8500, 2440], [22160, 140, 8000, 2380], [24360, 150, 8000, 2300], [28820, 160, 8000, 2240], [31030, 170, 7500, 2240], [33240, 180, 7500, 2240], [37690, 190, 7000, 2240], [39890, 200, 7000, 2240], [46540, 200, 6500, 2240], [53180, 200, 6000, 2240], [62060, 200, 5500, 2040], [64260, 200, 5500, 1830], [66480, 200, 5500, 1550], [68720, 200, 5000, 1360], [70920, 200, 5000, 1220], [73140, 200, 5000, 680], [75350, 200, 5000, 270]],
      notEligibleFrom: 77570,
    },
  },
  2026: {
    cwfc: { earnedCap: 9690, wfcRateBp: 400, olderChild: [0, 1020, 2330, 2770], perChild: 1800, phaseStart: { mfj: 38770, other: 32680 }, rateBp: 1200, olderOnlyRateBp: 900, investmentLimit: 12200 },
    marriage: { minLesser: 31000, minTaxable: 49000, tableBelow: 125000, rowStart: 31000, rowStep: 1000, colStart: 49000, colStep: 10000, colCount: 30, halfStandard: 15300, cap: 1894 },
    k12: { perChild: 1500, phaseStart: 77550, oneChildRateBp: 2500, moreRateBp: 5000, expenseRateBp: 7500, computerMax: 200 },
    renter: {
      rentRateBp: 1700, seniorSubtraction: 5300, dependentSubtraction: [0, 7420, 14310, 20670, 26500, 31800], rentStep: 25, tableBelow: 2500,
      rows: [0, 2260, 4540, 6820, 9060, 11320, 13600, 15880, 18130, 20410, 22670, 24920, 27200, 29470, 31740, 34000, 36260, 38540, 40800, 43070, 45330, 47590, 49870, 52130, 54390, 56660, 58930, 61200, 63470, 65720, 68000, 70280, 72530, 74810, 77070, 79330],
      bands: [[0, 100, 9500, 2780], [6820, 100, 9000, 2780], [9060, 110, 9000, 2700], [11320, 120, 9000, 2640], [15880, 130, 8500, 2560], [20410, 140, 8500, 2490], [22670, 140, 8000, 2430], [24920, 150, 8000, 2360], [29470, 160, 8000, 2290], [31740, 170, 7500, 2290], [34000, 180, 7500, 2290], [38540, 190, 7000, 2290], [40800, 200, 7000, 2290], [47590, 200, 6500, 2290], [54390, 200, 6000, 2290], [63470, 200, 5500, 2080], [65720, 200, 5500, 1870], [68000, 200, 5500, 1590], [70280, 200, 5000, 1390], [72530, 200, 5000, 1250], [74810, 200, 5000, 690], [77070, 200, 5000, 270]],
      notEligibleFrom: 79330,
    },
  },
};

export const RULES = [2025, 2026].flatMap((y) => [
  {
    id: 'us.state-return.mn.income-tax',
    value: FIGURES[y],
    basis: 'four_bracket_tax_on_minnesota_taxable_income_federal_agi_plus_m1m_additions_less_the_standard_or_m1sa_itemized_deduction_with_the_high_income_phaseout_less_dependent_exemptions_with_their_phaseout_less_the_state_refund_and_m1m_subtractions_tax_table_at_the_band_midpoint_below_the_table_limit',
    ...year(y),
    act: 'Minnesota Statutes chapter 290',
    section: '290.06 subd. 2c; 290.0121; 290.0122; 290.0123; 290.0132',
    source: `${SRC[y].m1}; ${SRC[y].m1m}; ${SRC[y].m1sa}; ${SRC[y].m1r}; ${SRC[y].nr}`,
    attestations: []
  },
  {
    id: 'us.state-return.mn.credits',
    value: CREDITS[y],
    basis: 'child_and_working_family_credit_with_its_phaseout_marriage_credit_from_the_single_and_joint_rate_schedules_k12_education_credit_75_percent_of_expenses_with_its_phaseout_and_renters_credit_from_17_percent_of_rent_against_household_income',
    ...year(y),
    act: 'Minnesota Statutes chapter 290',
    section: '290.0661; 290.0671; 290.0674; 290.0693; 290.0675',
    source: `${SRC[y].cwfc}; ${SRC[y].ma}; ${SRC[y].ed}; ${SRC[y].rent}`,
    attestations: []
  },
]);
