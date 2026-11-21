const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const INSTR_2025 = 'Massachusetts Department of Revenue, 2025 Form 1 Massachusetts Resident Income Tax Return, 2025 Form 1 Instructions and Schedules B, D, X, Y and CB (mass.gov/doc/2025-form-1-massachusetts-resident-income-tax-return, mass.gov/doc/2025-form-1-instructions; copies at taxsim.nber.org/historical_state_tax_forms/MA/2025/) and 2025 Form 1-NR/PY with its instructions (mass.gov/doc/2025-form-1-nrpy-massachusetts-nonresidentpart-year-tax-return, mass.gov/doc/2025-form-1-nrpy-instructions), read 2026-11-21';
const STATUTE_2026 = 'M.G.L. c. 62, sections 2, 3, 4, 5 and 6 (malegislature.gov/Laws/GeneralLaws/PartI/TitleIX/Chapter62), read 2026-11-21: the 5.0%, 8.5% and 12% rates, the exemptions, the $2,000 retirement contribution, $4,000 rent, $750 commuter and college savings limits, No Tax Status and the Limited Income Credit, the 40% earned income credit and the $440 Child and Family Tax Credit are fixed amounts in the statute with no indexing; the DOR draft 2026 Form 1 (DRAFT AS OF NOVEMBER 18, 2026, mass.gov) prints the same amounts';

const INCOME_TAX = {
  partBRateBp: 500,
  shortTermRateBp: 850,
  collectiblesRateBp: 1200,
  collectiblesDeductionBp: 5000,
  longTermRateBp: 500,
  taxTable: { upTo: 24000, band: 50, minimumIncome: 10, firstBandTax: 1 },
  personalExemption: { single: 4400, mfs: 4400, hoh: 6800, mfj: 8800 },
  dependentExemption: 1000,
  ageExemption: 700,
  blindExemption: 2200,
  ficaDeductionMaximum: 2000,
  rentShareBp: 5000,
  rentMaximum: { single: 4000, hoh: 4000, mfj: 4000, mfs: 2000 },
  commuterFloor: 150,
  commuterMaximum: 750,
  studentLoanMaximum: 2500,
  collegeTuitionAgiShareBp: 2500,
  collegeSavingsMaximum: { single: 1000, mfs: 1000, hoh: 1000, mfj: 2000 },
  lossAgainstInterestMaximum: 2000,
};

const LOW_INCOME = {
  noTaxStatus: { single: 8000, hoh: 14400, mfj: 16400 },
  noTaxStatusPerDependent: { single: 0, hoh: 1000, mfj: 1000 },
  limitedIncomeCredit: { single: 14000, hoh: 25200, mfj: 28700 },
  limitedIncomeCreditPerDependent: { single: 0, hoh: 1750, mfj: 1750 },
  limitedIncomeCreditRateBp: 1000,
};

const CREDITS = { eitcBasisPoints: 4000, childAndFamilyCredit: 440, childAndFamilyUnderAge: 13, childAndFamilySeniorAge: 65 };

const CIRCUIT_BREAKER = { maximumCredit: 2820, incomeLimit: { single: 75000, hoh: 94000, mfj: 112000 }, assessedValueLimit: 1298000, incomeThresholdBp: 1000, rentShareBp: 2500, waterSewerShareBp: 5000 };

const SOURCE_2025 = (lines) => `${INSTR_2025}: ${lines}`;

export const RULES = [
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ma.income-tax',
    value: INCOME_TAX,
    basis: 'part_b_income_less_deductions_and_exemptions_at_5_percent_tax_table_up_to_24000_short_term_gains_8_5_percent_collectibles_12_percent_on_the_half_remaining_long_term_gains_5_percent',
    ...year(y),
    act: 'Massachusetts General Laws chapter 62',
    section: '2; 3(B)(a)(9), (10), (11), (13); 3(B)(b); 4',
    source: y === 2025 ? SOURCE_2025('Form 1 lines 2a to 2g (exemptions $4,400 single or separate, $6,800 head of household, $8,800 joint, $1,000 per dependent, $700 age 65, $2,200 blindness), line 11 (not more than $2,000 each), line 14 (half the rent, $4,000 or $2,000 separate), line 22 (tax table below $24,000, $50 bands, $0 under $10, otherwise .05), line 23 (.085 and .12), Schedule Y lines 10 ($2,500), 11 (25% of Massachusetts AGI), 15 ($150 floor, $750 each) and 18a ($1,000, $2,000 joint), Schedule B line 20 and the line 32 worksheet ($2,000), the line 27 worksheet (50% of collectibles gain) and Schedule D line 22 (.05)') : STATUTE_2026,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ma.low-income',
    value: LOW_INCOME,
    basis: 'no_tax_status_at_or_below_the_threshold_on_the_massachusetts_agi_worksheet_limited_income_credit_is_the_tax_less_10_percent_of_agi_over_the_no_tax_threshold',
    ...year(y),
    act: 'Massachusetts General Laws chapter 62',
    section: '5; 6(b)',
    source: y === 2025 ? SOURCE_2025('No Tax Status ($8,000 single, $14,400 head of household, $16,400 joint, plus $1,000 per dependent), Limited Income Credit ($14,000 single, $25,200 head of household plus $1,750 per dependent, $28,700 joint plus $1,750 per dependent) and the line 29 worksheet (10% of the amount over the No Tax Status figure); not for married filing separately') : STATUTE_2026,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ma.credits',
    value: CREDITS,
    basis: 'earned_income_credit_40_percent_of_the_federal_eic_child_and_family_tax_credit_440_per_dependent_under_13_or_65_and_over_or_disabled',
    ...year(y),
    act: 'Massachusetts General Laws chapter 62',
    section: '6(h); 6(x)',
    source: y === 2025 ? SOURCE_2025('line 43 ("a refundable credit equal to 40% of the federal amount") and line 46 ("a credit of $440 for an individual who is (1) under the age of 13 ... or (3) a dependent who is age 65 or over"), not for married filing separately; Form 1-NR/PY lines 47 and 50 for part-year residents, who multiply by the line 3 ratio') : STATUTE_2026,
    attestations: []
  })),
  {
    id: 'us.state-return.ma.surtax',
    value: { rateBp: 400, threshold: 1083150 },
    basis: 'four_percent_surtax_on_taxable_income_above_the_indexed_threshold',
    ...year(2025),
    act: 'Massachusetts Constitution, Article XLIV as amended by Article CXXI; M.G.L. c. 62, section 4(d)',
    section: '4(d)',
    source: SOURCE_2025('Form 1 line 28b and the Schedule 4% Surtax ("the portion of their annual taxable income exceeding $1,083,150")'),
    attestations: []
  },
  {
    id: 'us.state-return.ma.surtax',
    value: { rateBp: 400, threshold: 1107750 },
    basis: 'four_percent_surtax_on_taxable_income_above_the_indexed_threshold',
    ...year(2026),
    act: 'Massachusetts Constitution, Article XLIV as amended by Article CXXI; M.G.L. c. 62, section 4(d)',
    section: '4(d)',
    source: 'Massachusetts Department of Revenue, "4% Surtax on Taxable Income Over $1 Million" (mass.gov/info-details/4-surtax-on-taxable-income-over-1-million), which gives the indexed threshold of $1,107,750 for tax year 2026, read 2026-11-21',
    attestations: []
  },
  {
    id: 'us.state-return.ma.circuit-breaker',
    value: CIRCUIT_BREAKER,
    basis: 'senior_circuit_breaker_credit_real_estate_tax_plus_half_of_water_and_sewer_or_25_percent_of_rent_above_10_percent_of_total_income_up_to_the_maximum',
    ...year(2025),
    act: 'Massachusetts General Laws chapter 62',
    section: '6(k)',
    source: SOURCE_2025('line 44 ("The maximum credit allowed is $2,820 for the tax year beginning January 1, 2025") and Schedule CB lines 1 to 21 (assessed value not over $1,298,000, total income not over $75,000 single, $94,000 head of household, $112,000 joint, 50% of water and sewer, rent divided by 4, threshold 10% of income), and the mass.gov Senior Circuit Breaker Tax Credit page'),
    attestations: []
  },
  {
    id: 'us.state-return.ma.circuit-breaker',
    value: { ...CIRCUIT_BREAKER, provisional: true },
    basis: 'senior_circuit_breaker_credit_real_estate_tax_plus_half_of_water_and_sewer_or_25_percent_of_rent_above_10_percent_of_total_income_up_to_the_maximum',
    ...year(2026),
    act: 'Massachusetts General Laws chapter 62',
    section: '6(k)',
    source: 'M.G.L. c. 62, section 6(k) indexes the Senior Circuit Breaker maximum credit, income limits and assessed value limit every year; as of 2026-11-21 the Department of Revenue has not published the 2026 amounts (the mass.gov Senior Circuit Breaker Tax Credit page and the draft 2026 Form 1 read 2026-11-21 give the 2025 figures), so the 2025 amounts are carried and the record is provisional until replaced',
    attestations: []
  },
];
