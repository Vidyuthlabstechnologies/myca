const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const RES_2025 = 'Comptroller of Maryland, 2025 Maryland Resident Income Tax Return Instructions (www.marylandcomptroller.gov/content/dam/mdcomp/tax/instructions/2025/resident-booklet.pdf)';
const NONRES_2025 = 'Comptroller of Maryland, 2025 Maryland Nonresident Income Tax Return Instructions (www.marylandcomptroller.gov/content/dam/mdcomp/tax/instructions/2025/nonresident-booklet.pdf) and Form 505NR';
const CR_2025 = 'Comptroller of Maryland, 2025 Form 502CR and instructions (www.marylandcomptroller.gov/content/dam/mdcomp/tax/forms/2025/502cr.pdf)';
const ALERT_2025 = 'Comptroller of Maryland Tax Alert, Changes to Standard and Itemized Deductions and to State and Local Income Tax Rates from the 2025 Legislative Session (www.marylandcomptroller.gov/content/dam/mdcomp/tax/legal-publications/alerts/tax-alert-changes-to-standard-and-itemized-deductions-and-to-state-and-local-income-tax-rates-from-the-2025-legislative-session.pdf)';
const WH_2026 = 'Comptroller of Maryland, 2026 Maryland State and Local Withholding Information memo (www.marylandcomptroller.gov/content/dam/mdcomp/md/state-payroll/memos/2026/2026-maryland-state-and-local-withholding-information.pdf) and Payroll Changes Effective January 1, 2026 (www.marylandcomptroller.gov/content/dam/mdcomp/md/state-payroll/memos/2026/payroll-changes-effective-january-1-2026.pdf)';
const GUIDE_2026 = 'Comptroller of Maryland, 2026 Employer Withholding Guide (www.marylandcomptroller.gov/content/dam/mdcomp/tax/instructions/withholding/2026/withholding-guide.pdf)';
const READ = 'read 2026-11-21';

const SCHEDULE_I = [
  { overCents: 0, rateBp: 200 }, { overCents: 100000, rateBp: 300 }, { overCents: 200000, rateBp: 400 }, { overCents: 300000, rateBp: 475 },
  { overCents: 10000000, rateBp: 500 }, { overCents: 12500000, rateBp: 525 }, { overCents: 15000000, rateBp: 550 }, { overCents: 25000000, rateBp: 575 },
  { overCents: 50000000, rateBp: 625 }, { overCents: 100000000, rateBp: 650 }
];
const SCHEDULE_II = [
  { overCents: 0, rateBp: 200 }, { overCents: 100000, rateBp: 300 }, { overCents: 200000, rateBp: 400 }, { overCents: 300000, rateBp: 475 },
  { overCents: 15000000, rateBp: 500 }, { overCents: 17500000, rateBp: 525 }, { overCents: 22500000, rateBp: 550 }, { overCents: 30000000, rateBp: 575 },
  { overCents: 60000000, rateBp: 625 }, { overCents: 120000000, rateBp: 650 }
];

const INCOME_TAX = {
  scheduleI: SCHEDULE_I,
  scheduleII: SCHEDULE_II,
  tableBelow: 100000,
  personalExemption: 3200,
  exemptionByAgi: { other: [{ agiUpTo: 100000, amount: 3200 }, { agiUpTo: 125000, amount: 1600 }, { agiUpTo: 150000, amount: 800 }], joint: [{ agiUpTo: 150000, amount: 3200 }, { agiUpTo: 175000, amount: 1600 }, { agiUpTo: 200000, amount: 800 }] },
  ageOrBlindExemption: 1000,
  itemizedPhaseout: { over: { other: 200000, mfs: 100000 }, rateBp: 750 },
  incomeTaxDeductionCap: { other: 40000, mfs: 20000 },
  capitalGainSurtax: { agiOver: 350000, rateBp: 200 },
  specialNonresidentRateBp: 225
};

const LOCAL_2025 = {
  'baltimore-city': 320, allegany: 303, 'baltimore-county': 320, calvert: 320, caroline: 320, carroll: 303, cecil: 274, charles: 303, dorchester: 330, garrett: 265, harford: 306, howard: 320, kent: 320, montgomery: 320, 'prince-georges': 320, 'queen-annes': 320, 'st-marys': 320, somerset: 320, talbot: 240, washington: 295, wicomico: 320, worcester: 225
};
const LOCAL_2026 = { ...LOCAL_2025, allegany: 320, kent: 330 };
const ANNE_ARUNDEL = { other: [{ overCents: 0, rateBp: 270 }, { overCents: 5000000, rateBp: 294 }, { overCents: 40000000, rateBp: 320 }], joint: [{ overCents: 0, rateBp: 270 }, { overCents: 7500000, rateBp: 294 }, { overCents: 48000000, rateBp: 320 }], eicRateBp: 270 };
const FREDERICK = { other: [{ upTo: 25000, rateBp: 225 }, { upTo: 50000, rateBp: 275 }, { upTo: 150000, rateBp: 296 }, { upTo: null, rateBp: 320 }], joint: [{ upTo: 25000, rateBp: 225 }, { upTo: 100000, rateBp: 275 }, { upTo: 250000, rateBp: 296 }, { upTo: null, rateBp: 320 }] };

export const RULES = [
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.md.income-tax',
    value: INCOME_TAX,
    basis: 'graduated_state_rate_schedules_i_and_ii_with_the_tax_table_below_100000_exemptions_reduced_by_federal_agi_itemized_phaseout_capital_gain_surtax_and_special_nonresident_tax',
    ...year(y),
    act: 'Maryland Code, Tax-General Article; Budget Reconciliation and Financing Act of 2025 (Chapter 604, Acts of 2025)',
    section: '10-105; 10-106.1; 10-211; 10-217; 10-218',
    source: y === 2025
      ? `${RES_2025}, Instructions 10, 14 and 17 (Tax Rate Schedules I and II, "You must use the tax tables if your taxable income is less than $100,000", Exemption Amount Chart 10A, Itemized Deduction Phaseout Worksheet 14A at 7.5% over $200,000 or $100,000 married filing separately, 2% additional tax on net capital gain when federal AGI is more than $350,000); ${NONRES_2025} (special nonresident tax 0.0225); ${ALERT_2025}; ${READ}`
      : `The rate brackets, exemption amounts, itemized phaseout and capital gain surtax are fixed in the Tax-General Article as amended by Chapter 604, Acts of 2025 for tax years after 2024 and are not indexed; ${WH_2026} state the state rates are unchanged for 2026 and the personal exemption remains $3,200; ${READ}`,
    attestations: []
  })),
  {
    id: 'us.state-return.md.standard-deduction',
    value: { other: 3350, joint: 6700 },
    basis: 'flat_standard_deduction_single_married_separate_and_dependent_other_and_joint_head_of_household_and_surviving_spouse_joint',
    ...year(2025),
    act: 'Maryland Code, Tax-General Article; Chapter 604, Acts of 2025',
    section: '10-217',
    source: `${RES_2025}, Instruction 16 and ${ALERT_2025}: standard deduction of $3,350 for single, married filing separately and dependent filers and $6,700 for joint, head of household and qualifying surviving spouse filers; ${READ}`,
    attestations: []
  },
  {
    id: 'us.state-return.md.standard-deduction',
    value: { other: 3400, joint: 6800, provisional: true },
    basis: 'flat_standard_deduction_single_married_separate_and_dependent_other_and_joint_head_of_household_and_surviving_spouse_joint',
    ...year(2026),
    act: 'Maryland Code, Tax-General Article; Chapter 604, Acts of 2025',
    section: '10-217',
    source: `${GUIDE_2026} states "Standard Deduction is $3,400" for 2026 withholding (${READ}); the 2026 Form 502 instructions are not published as of 2026-11-21 and the $6,800 joint figure is double the single figure as in 2025 rather than a published amount, so the record is provisional until the Comptroller publishes the 2026 indexed deduction`,
    attestations: []
  },
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.md.subtractions',
    value: { pensionExclusionMax: 41200, pensionAge: 65, childCareLimit: { one: 3000, twoOrMore: 6000 }, twoIncomeMax: 1200, ...(y === 2026 ? { provisional: true } : {}) },
    basis: 'pension_exclusion_for_filers_65_or_older_reduced_by_social_security_child_care_expense_subtraction_and_two_income_married_subtraction',
    ...year(y),
    act: 'Maryland Code, Tax-General Article',
    section: '10-207; 10-208; 10-209',
    source: y === 2025
      ? `${RES_2025}, Instruction 13: Pension Exclusion Computation Worksheet 13A maximum allowable exclusion $41,200 less total Social Security and Railroad Retirement benefits, Line 9 child and dependent care expenses limited to $3,000 ($6,000 for two or more dependents), Two-Income Married Couple Subtraction Worksheet 13D limited to $1,200; ${READ}`
      : 'The pension exclusion maximum is indexed each year to the Social Security maximum annual benefit and the Comptroller has not published the 2026 amount as of 2026-11-21; the 2025 maximum of $41,200 is carried, with the statutory child care and two-income limits, so the record is provisional',
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.md.credits',
    value: {
      eicHalfBp: 5000, eicFullBp: 10000, refundableEicBp: 4500, povertyCreditBp: 500, localEicMultiplier: 10,
      seniorCredit: { age: 65, single: { agiUpTo: 100000, amount: 1000 }, joint: { agiUpTo: 150000, both: 1750, one: 1000 } },
      childTaxCredit: { perChild: 500, agiThreshold: 15000, reductionPer: 50, reductionStep: 1000, underAge: 6, disabledUnderAge: 17 }
    },
    basis: 'state_eic_half_of_federal_or_full_for_childless_single_refundable_eic_45_percent_poverty_credit_5_percent_of_earned_income_local_eic_ten_times_local_rate_senior_credit_and_refundable_child_tax_credit',
    ...year(y),
    act: 'Maryland Code, Tax-General Article',
    section: '10-704; 10-709; 10-751; 10-753',
    source: y === 2025
      ? `${RES_2025}, Instructions 18, 19 and 21 (Worksheets 18A, 18A.1, 18B, 19B, 19C and 21A: 50% of the federal EIC, or 100% for single, head of household or surviving spouse filers without a qualifying child, refundable credit 45% of the federal EIC less the Maryland tax, poverty level credit 5% of earned income, local EIC rate = local tax rate x 10); ${CR_2025}, Part M senior tax credit ($1,000 at federal AGI up to $100,000; $1,750 joint, head of household or surviving spouse up to $150,000, $1,000 if only one joint spouse is 65) and Part CC line 8 child tax credit ($500 per child under 6, or under 17 with a disability, reduced by $50 for each $1,000 or fraction of federal AGI above $15,000); ${READ}`
      : `The percentages and amounts are fixed in Tax-General sections 10-704, 10-709, 10-751 and 10-753 and are not indexed. Tax-General 10-704 as published by the General Assembly (mgaleg.maryland.gov, ${READ}) keeps the refundable credit at 45% of the federal EIC; a 2026 payroll memo describes 50%, which MyCA does not use until the 2026 Form 502 instructions confirm it`,
    attestations: []
  })),
  {
    id: 'us.state-return.md.poverty-levels',
    value: { base: 15650, perPerson: 5500 },
    basis: 'poverty_income_guideline_for_one_person_plus_an_amount_for_each_additional_person_in_the_household',
    ...year(2025),
    act: 'Maryland Code, Tax-General Article',
    section: '10-709',
    source: `${RES_2025}, State Poverty Level Credit Worksheet 18B poverty income table: 1 person $15,650, 2 $21,150, 3 $26,650, 4 $32,150, 5 $37,650, 6 $43,150, 7 $48,650, 8 $54,150, add $5,500 for each additional person; ${READ}`,
    attestations: []
  },
  {
    id: 'us.state-return.md.poverty-levels',
    value: { base: 15650, perPerson: 5500, provisional: true },
    basis: 'poverty_income_guideline_for_one_person_plus_an_amount_for_each_additional_person_in_the_household',
    ...year(2026),
    act: 'Maryland Code, Tax-General Article',
    section: '10-709',
    source: 'The 2026 Form 502 instructions with the 2026 poverty income table are not published as of 2026-11-21; the 2025 table is carried and the record is provisional',
    attestations: []
  },
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.md.local-tax',
    value: { flatRatesBp: y === 2025 ? LOCAL_2025 : LOCAL_2026, anneArundel: ANNE_ARUNDEL, frederick: FREDERICK },
    basis: 'county_and_baltimore_city_income_tax_on_maryland_taxable_net_income_flat_rate_or_anne_arundel_graduated_or_frederick_rate_by_income_level',
    ...year(y),
    act: 'Maryland Code, Tax-General Article; county ordinances setting the local rate',
    section: '10-103; 10-106',
    source: y === 2025
      ? `${RES_2025}, Instruction 19 local tax rate chart for 2025 (Baltimore City .0320, Allegany .0303, Baltimore County .0320, Calvert .0320, Caroline .0320, Carroll .0303, Cecil .0274, Charles .0303, Dorchester .0330, Garrett .0265, Harford .0306, Howard .0320, Kent .0320, Montgomery .0320, Prince George's .0320, Queen Anne's .0320, St. Mary's .0320, Somerset .0320, Talbot .0240, Washington .0295, Wicomico .0320, Worcester .0225; Anne Arundel .0270 to $50,000, .0294 to $400,000, .0320 above ($75,000 and $480,000 joint); Frederick .0225, .0275, .0296 or .0320 on all taxable net income by income level) and ${ALERT_2025}; ${READ}`
      : `${WH_2026}: 2026 local rates are the 2025 rates except Allegany .0320 and Kent .0330, with the Anne Arundel and Frederick rate tables unchanged; ${READ}`,
    attestations: []
  }))
];
