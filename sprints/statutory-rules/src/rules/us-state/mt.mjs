const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const FORM2_2025 = 'Montana Department of Revenue, 2025 Montana Individual Income Tax Return Form 2 (2025v3, 12/2025) with Schedules I, II, III, IV and 2EC and the 2025 Form 2 Instructions (revenue.mt.gov/files/Forms/Montana-Individual-Income-Tax-Return-Form-2/), read 2026-11-21';
const PUB1_2026 = 'Montana Department of Revenue, 2026 Montana Publication 1, A Guide to Montana Tax Withholding and Estimated Payments (V1 September 2025, revenue.mt.gov), read 2026-11-21';
const PROVISIONAL_2026 = 'Montana has not published the 2026 Form 2 Schedule 2EC as of 2026-11-21, so the 2025 exclusion, cap and tables are carried and the record is marked provisional until the Department publishes it';

const ordinary = (single, joint, hoh, top) => ({
  single: [{ overCents: 0, rateBp: 470 }, { overCents: single * 100, rateBp: top }],
  mfs: [{ overCents: 0, rateBp: 470 }, { overCents: single * 100, rateBp: top }],
  mfj: [{ overCents: 0, rateBp: 470 }, { overCents: joint * 100, rateBp: top }],
  qss: [{ overCents: 0, rateBp: 470 }, { overCents: joint * 100, rateBp: top }],
  hoh: [{ overCents: 0, rateBp: 470 }, { overCents: hoh * 100, rateBp: top }],
});
const threshold = (single, joint, hoh) => ({ single, mfs: single, mfj: joint, qss: joint, hoh });

const ELDERLY = {
  minimumAge: 62,
  minimumResidentMonths: 9,
  incomeLimit: 45000,
  exclusion: 12600,
  reduction: [{ from: 0, rate: 0 }, { from: 2000, rate: 0.006 }, { from: 3000, rate: 0.016 }, { from: 4000, rate: 0.024 }, { from: 5000, rate: 0.028 }, { from: 6000, rate: 0.032 }, { from: 7000, rate: 0.035 }, { from: 8000, rate: 0.039 }, { from: 9000, rate: 0.042 }, { from: 10000, rate: 0.045 }, { from: 11000, rate: 0.048 }, { from: 12000, rate: 0.05 }],
  rentShareBp: 1500,
  maximum: 1150,
  multiplier: [{ from: 0, rate: 1 }, { from: 35000, rate: 0.4 }, { from: 37501, rate: 0.3 }, { from: 40001, rate: 0.2 }, { from: 42501, rate: 0.1 }, { from: 45000, rate: 0 }],
};

export const RULES = [
  {
    id: 'us.state-return.mt.income-tax',
    value: { ordinary: ordinary(21100, 42200, 31700, 590), capitalGain: { threshold: threshold(21100, 42200, 31700), lowRateBp: 300, highRateBp: 410 } },
    basis: 'montana_taxable_income_ordinary_brackets_with_separate_net_long_term_capital_gains_rates_stacked_on_ordinary_income',
    ...year(2025),
    act: 'Montana Code Annotated 15-30-2103 as amended by Senate Bill 399 (2021) and House Bill 337 (2025)',
    section: '15-30-2103',
    source: `${FORM2_2025}: Form 2 page 2 tax lines 1 to 13 (4.7% up to $21,100 single or married filing separately, $42,200 married filing jointly or qualifying surviving spouse, $31,700 head of household, 5.9% above; net long-term capital gains 3% up to the line 5 amount less ordinary income and 4.1% above)`,
    attestations: []
  },
  {
    id: 'us.state-return.mt.income-tax',
    value: { ordinary: ordinary(47500, 95000, 71250, 565), capitalGain: { threshold: threshold(47500, 95000, 71250), lowRateBp: 300, highRateBp: 410 } },
    basis: 'montana_taxable_income_ordinary_brackets_with_separate_net_long_term_capital_gains_rates_stacked_on_ordinary_income',
    ...year(2026),
    act: 'Montana Code Annotated 15-30-2103 as amended by House Bill 337 (2025)',
    section: '15-30-2103',
    source: `${PUB1_2026}: Montana Ordinary Tax Tables (4.7% up to $47,500 single or married filing separately, $95,000 married filing jointly or qualifying surviving spouse, $71,250 head of household, 5.65% above) and Montana Tax Rates (net long-term capital gains 3% up to the first bracket and 4.1% above, the same filing status amounts)`,
    attestations: []
  },
  {
    id: 'us.state-return.mt.subtractions',
    value: { seniorSubtraction: 5660, seniorAge: 65, college529Maximum: { mfj: 9000, other: 4500 }, ableMaximum: { mfj: 6000, other: 3000 } },
    basis: 'montana_subtraction_for_each_taxpayer_65_or_older_and_family_education_savings_and_able_account_deposit_limits',
    ...year(2025),
    act: 'Montana Code Annotated 15-30-2120; 15-62-207; 15-62-208; 53-25-118',
    section: '15-30-2120(3)',
    source: `${FORM2_2025}: Form 2 page 1 line 6 ($5,660 subtraction for taxpayers 65 and older), Schedule I lines 16 (529 deposits up to $4,500, $9,000 if filing jointly) and 17 (ABLE deposits up to $3,000, $6,000 if filing jointly)`,
    attestations: []
  },
  {
    id: 'us.state-return.mt.subtractions',
    value: { seniorSubtraction: 5660, seniorAge: 65, college529Maximum: { mfj: 9000, other: 4500 }, ableMaximum: { mfj: 6000, other: 3000 } },
    basis: 'montana_subtraction_for_each_taxpayer_65_or_older_and_family_education_savings_and_able_account_deposit_limits',
    ...year(2026),
    act: 'Montana Code Annotated 15-30-2120; 15-62-207; 15-62-208; 53-25-118',
    section: '15-30-2120(3)',
    source: `${PUB1_2026}: Montana Subtractions ("A subtraction of $5,660 for taxpayers 65 and older"; 529 plan $4,500 per individual or $9,000 if married filing jointly; ABLE $3,000 per individual or $6,000 if married filing jointly)`,
    attestations: []
  },
  {
    id: 'us.state-return.mt.credits',
    value: { eitcRateBp: 1000 },
    basis: 'montana_earned_income_credit_as_a_share_of_the_federal_earned_income_credit_for_residents',
    ...year(2025),
    act: 'Montana Code Annotated 15-30-2318',
    section: '15-30-2318',
    source: `${FORM2_2025}: Form 2 page 1 line 15 (multiply federal EIC by 10%) and Worksheet A for part-year residents`,
    attestations: []
  },
  {
    id: 'us.state-return.mt.credits',
    value: { eitcRateBp: 2000 },
    basis: 'montana_earned_income_credit_as_a_share_of_the_federal_earned_income_credit_for_residents',
    ...year(2026),
    act: 'Montana Code Annotated 15-30-2318 as amended by House Bill 337 (2025)',
    section: '15-30-2318',
    source: `${PUB1_2026}: What's New (the Montana earned income tax credit increases to 20% of the federal earned income tax credit)`,
    attestations: []
  },
  {
    id: 'us.state-return.mt.elderly-credit',
    value: ELDERLY,
    basis: 'schedule_2ec_property_tax_or_15_percent_of_rent_less_net_household_income_capped_and_scaled_by_gross_household_income',
    ...year(2025),
    act: 'Montana Code Annotated 15-30-2337 to 15-30-2341',
    section: '15-30-2338; 15-30-2340',
    source: `${FORM2_2025}: Schedule 2EC attestation (age 62, nine months resident, gross household income under $45,000), line 19 standard exclusion $12,600, Household Income Reduction Table, line 25 (rent times 15%), line 28 ($1,150), Credit Multiplier Table`,
    attestations: []
  },
  {
    id: 'us.state-return.mt.elderly-credit',
    value: { ...ELDERLY, provisional: true },
    basis: 'schedule_2ec_property_tax_or_15_percent_of_rent_less_net_household_income_capped_and_scaled_by_gross_household_income',
    ...year(2026),
    act: 'Montana Code Annotated 15-30-2337 to 15-30-2341',
    section: '15-30-2338; 15-30-2340',
    source: `${FORM2_2025} for the 2025 amounts; ${PROVISIONAL_2026}`,
    attestations: []
  }
];
