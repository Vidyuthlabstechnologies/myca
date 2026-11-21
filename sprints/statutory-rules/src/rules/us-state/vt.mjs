const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const DOCS = 'tax.vermont.gov/sites/tax/files/documents';
const READ = 'read 2026-11-21';
const BOOKLET_2025 = `Vermont Department of Taxes, 2025 Vermont Income Tax Return Booklet with tax tables and rate schedules (${DOCS}/Income-Booklet-2025.pdf), 2025 Rate Schedules (${DOCS}/TaxRateSched-2025.pdf) and 2025 Form IN-111 Instructions (${DOCS}/IN-111-Instr-2025.pdf)`;
const IN112_2025 = `2025 Schedule IN-112 and instructions (${DOCS}/IN-112-2025.pdf, ${DOCS}/IN-112-Instr-2025.pdf)`;
const IN153_2025 = `2025 Schedule IN-153 and instructions (${DOCS}/IN-153-2025.pdf, ${DOCS}/IN-153-Instr-2025.pdf)`;
const IN119_2025 = `2025 Schedule IN-119 and instructions (${DOCS}/IN-119-2025.pdf, ${DOCS}/IN-119-Instr-2025.pdf)`;
const ACT_71 = 'Act 71 of 2025 (S.51), legislature.vermont.gov/Documents/2026/Docs/ACTS/ACT071/ACT071%20As%20Enacted.pdf, effective for taxable years beginning on and after January 1, 2025';
const NOT_YET = 'Vermont has not published the 2026 rate schedules, tax tables, standard deduction or personal exemption as of 2026-11-21 (the 2026 withholding guide GB-1210-2026 and Form IN-114 for 2026 give no return amounts); these figures are indexed each year, so the 2025 figures are carried and the record is provisional';

const SINGLE = [{ overCents: 0, rateBp: 335 }, { overCents: 4940000, rateBp: 660 }, { overCents: 7500000, rateBp: 660 }, { overCents: 11970000, rateBp: 760 }, { overCents: 24970000, rateBp: 875 }];
const MFS = [{ overCents: 0, rateBp: 335 }, { overCents: 4125000, rateBp: 660 }, { overCents: 7500000, rateBp: 660 }, { overCents: 9972500, rateBp: 760 }, { overCents: 15200000, rateBp: 875 }];
const MFJ = [{ overCents: 0, rateBp: 335 }, { overCents: 7500000, rateBp: 335 }, { overCents: 8250000, rateBp: 660 }, { overCents: 19945000, rateBp: 760 }, { overCents: 30400000, rateBp: 875 }];
const HOH = [{ overCents: 0, rateBp: 335 }, { overCents: 6620000, rateBp: 660 }, { overCents: 7500000, rateBp: 660 }, { overCents: 17100000, rateBp: 760 }, { overCents: 27685000, rateBp: 875 }];

const INCOME_TAX_2025 = {
  brackets: { single: SINGLE, mfs: MFS, mfj: MFJ, hoh: HOH },
  scheduleBase: { single: [0, 1655, 3345, 6295, 16175], mfs: [0, 1382, 3609, 5241, 9214], mfj: [0, 2513, 2764, 10482, 18428], hoh: [0, 2218, 2799, 9135, 17179] },
  table: { below: 75000, width: 100, firstRows: [{ below: 100, tax: 0 }] },
  standardDeduction: { single: 7650, mfs: 7650, hoh: 11450, mfj: 15300 },
  additionalStandard: 1250,
  exemption: 5300,
  minimumTax: { agiOver: 150000, rateBp: 300 }
};

export const RULES = [
  {
    id: 'us.state-return.vt.income-tax',
    value: INCOME_TAX_2025,
    basis: 'vermont_tax_on_taxable_income_from_the_tax_tables_below_75000_or_the_rate_schedules_after_standard_deduction_and_5300_exemptions_with_3_percent_minimum_tax_above_150000_agi',
    ...year(2025),
    act: 'Vermont Statutes Title 32 Chapter 151',
    section: '5811(21); 5822',
    source: `${BOOKLET_2025}: single "0 49,400 0.00 3.35%", "49,400 75,000 1,655.00 6.60%", then 75,000 / 3,345, 119,700 / 6,295 at 7.60%, 249,700 / 16,175 at 8.75%; married filing separately 41,250 / 1,382, 75,000 / 3,609, 99,725 / 5,241, 152,000 / 9,214; joint 75,000 / 2,513 at 3.35%, 82,500 / 2,764 at 6.60%, 199,450 / 10,482, 304,000 / 18,428; head of household 66,200 / 2,218, 75,000 / 2,799, 171,000 / 9,135, 276,850 / 17,179; "TAXABLE INCOME UNDER $75,000 USE THE TAX TABLES" in $100 rows (first row 0-100 tax 0); standard deduction 7,650 / 15,300 / 7,650 / 11,450 plus $1,250 per federal box; exemption "Multiply Line 5d by $5,300"; minimum tax "3% of your federal AGI less interest from U.S. obligations" when AGI is greater than $150,000; ${READ}`,
    attestations: []
  },
  {
    id: 'us.state-return.vt.income-tax',
    value: { ...INCOME_TAX_2025, provisional: true },
    basis: 'vermont_tax_on_taxable_income_from_the_tax_tables_below_75000_or_the_rate_schedules_after_standard_deduction_and_5300_exemptions_with_3_percent_minimum_tax_above_150000_agi',
    ...year(2026),
    act: 'Vermont Statutes Title 32 Chapter 151',
    section: '5811(21); 5822',
    source: `${NOT_YET}; ${READ}`,
    attestations: []
  },
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.vt.subtractions',
    value: {
      retirement: { joint: { full: 70000, none: 80000 }, other: { full: 55000, none: 65000 }, range: 10000, pensionMaximum: 10000 },
      military: { full: 125000, none: 175000, range: 50000 },
      capitalGains: { flatMaximum: 5000, taxableIncomeBp: 4000 },
      studentLoan: { jointAgiLimit: 200000, otherAgiLimit: 120000 }
    },
    basis: 'vermont_social_security_or_10000_pension_exemption_full_below_55000_or_70000_joint_partial_to_65000_or_80000_military_retirement_to_175000_flat_5000_capital_gains_exclusion_up_to_40_percent_of_federal_taxable_income',
    ...year(y),
    act: 'Vermont Statutes Title 32 Chapter 151',
    section: '5811(21)(B); 5830e',
    source: `${IN112_2025}, Retirement Income Exemption Worksheet (full exemption if AGI is less than $55,000, or $70,000 joint, none at $65,000 / $80,000, "Divide Line 6 by $10,000 ... round to the second decimal place", pension "or $10,000, whichever is less"), Military Retirement Income Exemption Worksheet (full at AGI of $125,000 or less, "Phaseout Threshold 175,000", "Divide Line 6 by $50,000") and line 16c student loan interest AGI limits of $200,000 joint and $120,000 other; ${IN153_2025}: "The general exclusion amount for tax year 2025 is $5,000", limited to "40% of federal taxable income"; the thresholds are fixed dollar amounts in 32 V.S.A. § 5830e as amended by ${ACT_71} and are not indexed, so they apply unchanged in 2026; ${READ}`,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.vt.credits',
    value: {
      childCareBp: 7200,
      childTaxCredit: { amount: 1000, maximumAge: 6, phaseoutStart: 125000, step: 1000, reduction: 20 },
      eitcWithChildBp: 3800,
      veteran: { amount: 250, fullUpTo: 25000, per: 100, reduction: 5 },
      charitable: { rateBp: 500, maximum: 1000 },
      vheip: { rateBp: 1000, perBeneficiary: 2500, jointPerBeneficiary: 5000 },
      federalTaxAdjustmentBp: 2400,
      childCareContributionBp: 11
    },
    basis: 'vermont_refundable_child_care_72_percent_child_tax_credit_1000_eitc_38_or_100_percent_veteran_250_credits_and_charitable_vheip_credits',
    ...year(y),
    act: 'Vermont Statutes Title 32 Chapter 151',
    section: '5825a; 5828b; 5830f; 5830g',
    source: `${IN112_2025} Part II: child and dependent care credit "MULTIPLY Line 1 by 72% (0.72)", child tax credit "$1,000" per child "born 2019 through 2025" reduced by $20 per $1,000 of AGI over $125,000, EITC "MULTIPLY Line 6 by 38% (0.38). If Line 5 is zero, enter the amount from Line 6", veteran credit $250 less $5 per $100 of AGI over $25,000; Form IN-111 Instructions lines 11 to 13 (5% of the first $20,000 of charitable contributions) and line 21 (child care contribution 0.11% of self-employment income); ${IN119_2025}: 24% of federal tax on qualified plans and VHEIP credit "10% of the first $2,500 of contributions per beneficiary ... $5,000" joint; these amounts are set in statute (${ACT_71}) and are not indexed, so they apply unchanged in 2026; ${READ}`,
    attestations: []
  }))
];
