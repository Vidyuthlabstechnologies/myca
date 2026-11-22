const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const IA = 'https://revenue.iowa.gov/media';
const READ = 'read 2026-11-21';
const SRC_2025 = `Iowa Department of Revenue, 2025 IA 1040 (41-001, ${IA}/4400/download) Steps 3 to 6 and Schedule 1; 2025 IA 1040 Expanded Instructions (${IA}/4435/download) Who Must File, Step 3, lines 1 to 25 and Schedule 1 lines 1 to 7; 2025 Iowa Alternate Tax Worksheet (41-145, ${IA}/4386/download); 2025 Iowa Income Tax Reduction Worksheet (41-146, ${IA}/4387/download); 2025 IA 126 (41-126, ${IA}/4385/download) lines 1 to 34; 2025 IA 130 (41-130, ${IA}/4383/download) lines 1 to 27; Iowa Counties, School District Numbers, Surtax Rates for 2025 (41-027, ${IA}/4382/download); ${READ}`;
const SRC_2026 = `Iowa Code section 422.5A (single 3.8 percent rate for tax years beginning on or after January 1, 2025, as enacted by 2024 Iowa Acts, Senate File 2442) and the 2026 IA 1040ES Iowa Individual Estimated Income Tax Instructions (45-009, ${IA}/2725/download): 3.8 percent rate, low-income exemption amounts of $9,000, $13,500, $24,000 and $32,000, and the April 30, 2027 filing date; ${READ}`;
const PROVISIONAL_2026 = 'The 2026 IA 1040, its expanded instructions and the 2026 Alternate Tax Worksheet are not published as of 2026-11-21. The 3.8 percent rate and the low-income exemption amounts are statutory and published in the 2026 IA 1040ES; the alternate tax rate (4.3 percent), the exemption credit amounts and the line numbers are carried from 2025 and are marked provisional until the 2026 forms are published';

const TAX = {
  2025: {
    rateBp: 380,
    alternate: { rateBp: 430, threshold: 13500, thresholdSenior: 32000 },
    reduction: { threshold: 9000, thresholdSenior: 24000 },
    lowIncome: { single: 9000, singleSenior: 24000, dependentBelow: 5000, other: 13500, otherSenior: 32000, mfsOwn: 9000, mfsCombined: 13500 },
    seniorAge: 65,
    exemptionCredit: { personal: 40, seniorOrBlind: 20, dependent: 40 },
    retirementExclusionAge: 55,
    nonresidentMinimum: 1000,
  },
  2026: {
    rateBp: 380,
    alternate: { rateBp: 430, threshold: 13500, thresholdSenior: 32000 },
    reduction: { threshold: 9000, thresholdSenior: 24000 },
    lowIncome: { single: 9000, singleSenior: 24000, dependentBelow: 5000, other: 13500, otherSenior: 32000, mfsOwn: 9000, mfsCombined: 13500 },
    seniorAge: 65,
    exemptionCredit: { personal: 40, seniorOrBlind: 20, dependent: 40 },
    retirementExclusionAge: 55,
    nonresidentMinimum: 1000,
    provisional: true,
  },
};

const CREDITS = {
  tuitionTextbook: { rateBp: 2500, perDependentMax: 2000 },
  eitcBp: 1500,
};

export const RULES = [
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ia.income-tax',
    value: TAX[y],
    basis: 'flat_3_8_percent_tax_on_iowa_taxable_income_federal_taxable_income_plus_iowa_modifications_with_low_income_exemption_alternate_tax_and_single_tax_reduction_exemption_credits_and_ia_126_credit_for_nonresidents',
    ...year(y),
    act: 'Iowa Code chapter 422',
    section: '422.5, 422.5A, 422.7, 422.12 and 422.12B',
    source: y === 2025 ? SRC_2025 : `${SRC_2026}. ${PROVISIONAL_2026}`,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ia.credits',
    value: CREDITS,
    basis: 'tuition_and_textbook_credit_25_percent_of_up_to_2000_per_dependent_iowa_earned_income_tax_credit_15_percent_of_federal_prorated_by_the_ia_126_percentage',
    ...year(y),
    act: 'Iowa Code chapter 422',
    section: '422.12(2) and 422.12B',
    source: y === 2025 ? SRC_2025 : `${SRC_2026}; the tuition and textbook credit and the 15 percent earned income tax credit are set by Iowa Code sections 422.12 and 422.12B and are unchanged for 2026`,
    attestations: []
  })),
];
