const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const FILES = 'tax.ri.gov/sites/g/files/xkgbur541/files';
const READ = 'read 2026-11-21';
const INSTR_2025 = `Rhode Island Division of Taxation, 2025 RI-1040 Resident Instructions (${FILES}/2025-12/2025%201040R%20Instructions%20122025.pdf) and 2025 RI-1040NR Instructions (${FILES}/2025-12/2025%201040NR%20Instructions%20122025.pdf)`;
const RATES_2025 = `2025 Tax Rate Schedule and Worksheets (${FILES}/2026-01/2025%20Tax%20Rate%20and%20Worksheets.pdf) and 2025 RI Tax Tables (${FILES}/2025-10/2025%20RI%20Tax%20Tables_Full_d.pdf)`;
const ADV_2025_22 = `ADV 2025-22, Inflation-adjusted amounts set for Tax Year 2026, November 3, 2025 (${FILES}/2025-11/ADV_2025_22_Inflation_Adjustments.pdf)`;
const H_2025 = '2025 Form RI-1040H Property Tax Relief Claim (taxsim.nber.org/historical_state_tax_forms/RI/2025/2025%201040H_w.pdf, the Division\'s 2025 form)';
const NOT_YET = 'Rhode Island has not published the 2026 RI-1040 instructions or the 2026 Social Security, pension and RI-1040H amounts as of 2026-11-21';

const TABLE = { below: 100000, width: 50, firstRows: [{ below: 50, tax: 0 }] };
const PERCENTS = [0.8, 0.6, 0.4, 0.2];

const INCOME_TAX_2025 = {
  brackets: [{ overCents: 0, rateBp: 375 }, { overCents: 7990000, rateBp: 475 }, { overCents: 18165000, rateBp: 599 }],
  table: TABLE,
  standardDeduction: { single: 10900, mfs: 10900, hoh: 16350, mfj: 21800 },
  exemption: 5100,
  phaseout: { start: 254250, width: 29000, increment: 7250, percentages: PERCENTS }
};
const INCOME_TAX_2026 = {
  brackets: [{ overCents: 0, rateBp: 375 }, { overCents: 8205000, rateBp: 475 }, { overCents: 18645000, rateBp: 599 }],
  table: TABLE,
  standardDeduction: { single: 11200, mfs: 11200, hoh: 16800, mfj: 22400 },
  exemption: 5250,
  phaseout: { start: 261000, width: 29800, increment: 7450, percentages: PERCENTS }
};
const MODIFICATIONS_2025 = {
  retirementAgiLimit: { single: 107000, mfs: 107000, hoh: 107000, mfj: 133750 },
  retirementBornOnOrBefore: '1959-03-01',
  pensionMaximum: 50000,
  college529: { other: 500, joint: 1000 }
};
const RELIEF_2025 = {
  incomeLimit: 40730,
  maximum: 700,
  rentBp: 2000,
  percentages: [{ upTo: 6990, onePersonBp: 300, twoOrMoreBp: 300 }, { upTo: 10480, onePersonBp: 400, twoOrMoreBp: 400 }, { upTo: 13970, onePersonBp: 500, twoOrMoreBp: 500 }, { upTo: 17460, onePersonBp: 600, twoOrMoreBp: 500 }, { upTo: 40730, onePersonBp: 600, twoOrMoreBp: 600 }]
};

export const RULES = [
  {
    id: 'us.state-return.ri.income-tax',
    value: INCOME_TAX_2025,
    basis: 'rhode_island_uniform_rate_schedule_tax_table_below_100000_standard_deduction_and_exemptions_phased_out_by_20_percent_per_increment_above_the_threshold',
    ...year(2025),
    act: 'Rhode Island General Laws Title 44 Chapter 30',
    section: '44-30-2.6',
    source: `${RATES_2025}: "Over 0 But not over 79,900 3.75%", "79,900 181,650 2,996.25 + 4.75%", "181,650 7,829.38 + 5.99%", tax table for taxable income under $100,000 in $50 rows (first row 0-50 tax 0), standard deduction $10,900 single and separate, $21,800 joint and qualifying widow(er), $16,350 head of household, exemptions "$5,100 by the total number of exemptions", phaseout above $254,250 "If the result is more than $29,000 ... zero", "Divide line 5 by $7,250" rounded up, 0.8000 / 0.6000 / 0.4000 / 0.2000; ${READ}`,
    attestations: []
  },
  {
    id: 'us.state-return.ri.income-tax',
    value: INCOME_TAX_2026,
    basis: 'rhode_island_uniform_rate_schedule_tax_table_below_100000_standard_deduction_and_exemptions_phased_out_by_20_percent_per_increment_above_the_threshold',
    ...year(2026),
    act: 'Rhode Island General Laws Title 44 Chapter 30',
    section: '44-30-2.6',
    source: `${ADV_2025_22}: 2026 standard deduction $11,200 single and separate, $22,400 joint, $16,800 head of household, exemption $5,250, phase-out range "$261,000 to $290,800", increment "$7,450 for 2026", 2026 schedule 3.75% to $82,050, "3,076.88 + 4.75%" to $186,450, "8,035.88 + 5.99%" above; the $100,000 tax table rule is the Division's standing method; ${READ}`,
    attestations: []
  },
  {
    id: 'us.state-return.ri.modifications',
    value: MODIFICATIONS_2025,
    basis: 'rhode_island_social_security_and_up_to_50000_pension_modifications_for_filers_at_full_retirement_age_below_the_agi_limit_and_529_subtraction_up_to_500_or_1000_joint',
    ...year(2025),
    act: 'Rhode Island General Laws Title 44 Chapter 30',
    section: '44-30-12(b)(1), (c)(1), (c)(4), (c)(8), (c)(9), (c)(11)',
    source: `${INSTR_2025}, Schedule M lines 1g, 1s, 1t and 1v: Social Security and pension modifications for a taxpayer "born on or before March 1, 1959" with federal AGI of at most "Single $107,000 Married Joint $133,750 ... Married Separate $107,000 Head of Household $107,000", pension "Enter the amount from line 2 or $50,000, whichever is less", 529 "$500, $1,000 if a joint return"; ${ADV_2025_22}, same 2025 limits. Publication 2026-01 (${FILES}/2026-02/PUB_2026-01_Retirement_Income_Guide.pdf) prints $133,500 for joint filers; the instructions and the advisory give $133,750, which is used; ${READ}`,
    attestations: []
  },
  {
    id: 'us.state-return.ri.modifications',
    value: { ...MODIFICATIONS_2025, provisional: true },
    basis: 'rhode_island_social_security_and_up_to_50000_pension_modifications_for_filers_at_full_retirement_age_below_the_agi_limit_and_529_subtraction_up_to_500_or_1000_joint',
    ...year(2026),
    act: 'Rhode Island General Laws Title 44 Chapter 30',
    section: '44-30-12(b)(1), (c)(1), (c)(4), (c)(8), (c)(9), (c)(11)',
    source: `${NOT_YET}; the Social Security and pension AGI limits are indexed each year and the full-retirement-age birth date moves forward, so the 2025 figures are carried and the record is provisional. The $50,000 pension cap and the 529 limits are statutory; ${READ}`,
    attestations: []
  },
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ri.credits',
    value: { eitcBp: 1600, childCareBp: 2500 },
    basis: 'rhode_island_refundable_eic_16_percent_of_federal_and_credit_of_25_percent_of_the_federal_child_and_dependent_care_credit',
    ...year(y),
    act: 'Rhode Island General Laws Title 44 Chapter 30',
    section: '44-30-2.6',
    source: `${INSTR_2025}: Schedule I "Multiply line 20 by 25%" of the federal child and dependent care credit, and the earned income credit worksheet "Multiply line 39 by 16%" (line 40), refundable on line 14d; both percentages are set in statute and unchanged for 2026; ${READ}`,
    attestations: []
  })),
  {
    id: 'us.state-return.ri.property-tax-relief',
    value: RELIEF_2025,
    basis: 'rhode_island_property_tax_relief_credit_property_tax_or_20_percent_of_rent_less_a_percentage_of_household_income_up_to_the_maximum',
    ...year(2025),
    act: 'Rhode Island General Laws Title 44 Chapter 33',
    section: '44-33-9',
    source: `${H_2025}: household income "$40,730 or less", "Line 5 or $700.00, whichever is LESS", "Multiply the amount on line 7 by twenty (20) percent", percentage table less than $6,991 3%/3%, $6,991-$10,480 4%/4%, $10,481-$13,970 5%/5%, $13,971-$17,460 6%/5%, $17,461-$40,730 6%/6%; ${ADV_2025_22}, same 2025 ranges and $700 maximum; ${READ}`,
    attestations: []
  },
  {
    id: 'us.state-return.ri.property-tax-relief',
    value: { ...RELIEF_2025, provisional: true },
    basis: 'rhode_island_property_tax_relief_credit_property_tax_or_20_percent_of_rent_less_a_percentage_of_household_income_up_to_the_maximum',
    ...year(2026),
    act: 'Rhode Island General Laws Title 44 Chapter 33',
    section: '44-33-9',
    source: `${NOT_YET}; the RI-1040H income ranges and maximum credit are indexed each year, so the 2025 amounts are carried and the record is provisional; ${READ}`,
    attestations: []
  }
];
