const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const N11_2025 = 'Hawaii Department of Taxation, 2025 Form N-11 (Rev. 2025) and Instructions, Form N-15 (Rev. 2025) and Instructions, Schedule X, Form N-311 and Form N-356 Instructions (tax.hawaii.gov/forms/a1_b1_1indiv/), read 2026-11-21';
const ACT46 = 'Hawaii Act 46, Session Laws of Hawaii 2024 (House Bill 2404), amending HRS 235-2.4 and 235-51, read 2026-11-21';
const ANN26 = 'Hawaii Department of Taxation Announcement No. 2026-06 of 2026-07-31 on Act 35 (House Bill 2329, C.D.1) conforming chapter 235 to the Internal Revenue Code as of December 31, 2025 (tax.hawaii.gov/legal/announcements/), read 2026-11-21';
const PROVISIONAL_2026 = 'Hawaii has not published the 2026 Form N-11, N-311, N-356 or Schedule X as of 2026-11-21, so the 2025 amounts are carried and the record is marked provisional until the Department publishes them';

const schedule = (thresholds) => [0, ...thresholds].map((over, index) => ({ overCents: over * 100, rateBp: [140, 320, 550, 640, 680, 720, 760, 790, 825, 900, 1000, 1100][index] }));
const SINGLE = [9600, 14400, 19200, 24000, 36000, 48000, 125000, 175000, 225000, 275000, 325000];
const JOINT = SINGLE.map((amount) => amount * 2);
const HOH = [14400, 21600, 28800, 36000, 54000, 72000, 187500, 262500, 337500, 412500, 487500];
const BRACKETS = { single: schedule(SINGLE), mfs: schedule(SINGLE), mfj: schedule(JOINT), qss: schedule(JOINT), hoh: schedule(HOH) };
const TAX = { brackets: BRACKETS, tableBelow: 100000, tableBand: 50, capitalGain: { rateBp: 725, threshold: { single: 24000, mfs: 24000, hoh: 36000, mfj: 48000, qss: 48000 } } };

const ITEMIZED = { medicalFloorBp: 750, incomeTaxAgiLimit: { single: 100000, mfs: 100000, hoh: 150000, mfj: 200000, qss: 200000 }, overallLimitation: { threshold: { mfs: 83400, other: 166800 }, excessBp: 300, maxShareBp: 8000 } };

const CREDITS = {
  foodExcise: {
    single: [{ below: 15000, amount: 220 }, { below: 20000, amount: 200 }, { below: 25000, amount: 170 }, { below: 30000, amount: 140 }, { below: 40000, amount: 110 }],
    other: [{ below: 15000, amount: 220 }, { below: 20000, amount: 200 }, { below: 25000, amount: 170 }, { below: 30000, amount: 140 }, { below: 40000, amount: 110 }, { below: 50000, amount: 90 }, { below: 60000, amount: 70 }],
  },
  renters: { agiBelow: 30000, rentOver: 1000, perExemption: 50 },
  care: { limitOne: 10000, limitTwoOrMore: 20000, rates: [{ upTo: 25000, rate: 0.25 }, { upTo: 30000, rate: 0.24 }, { upTo: 35000, rate: 0.23 }, { upTo: 40000, rate: 0.22 }, { upTo: 45000, rate: 0.21 }, { upTo: 50000, rate: 0.2 }, { upTo: null, rate: 0.15 }] },
  presenceMonths: 9,
};

export const RULES = [
  {
    id: 'us.state-return.hi.income-tax',
    value: TAX,
    basis: 'hawaii_tax_table_on_the_50_dollar_band_midpoint_below_100000_and_rate_schedules_above_with_the_725_basis_point_alternative_tax_on_net_capital_gain',
    ...year(2025),
    act: 'Hawaii Revised Statutes 235-51 as amended by Act 46, SLH 2024',
    section: '235-51(a) to (c); 235-51(f)',
    source: `${ACT46}: rate schedules "In the case of any taxable year beginning after December 31, 2024"; ${N11_2025}: Line 27 (Tax Table required if taxable income is less than $100,000; Tax Rate Schedules at $100,000 or more), Tax on Capital Gains Worksheet (7.25%, not used at or under $24,000 single or married filing separately, $36,000 head of household, $48,000 married filing jointly)`,
    attestations: []
  },
  {
    id: 'us.state-return.hi.income-tax',
    value: TAX,
    basis: 'hawaii_tax_table_on_the_50_dollar_band_midpoint_below_100000_and_rate_schedules_above_with_the_725_basis_point_alternative_tax_on_net_capital_gain',
    ...year(2026),
    act: 'Hawaii Revised Statutes 235-51 as amended by Act 46, SLH 2024',
    section: '235-51(a) to (c); 235-51(f)',
    source: `${ACT46}: the rate schedules for taxable years beginning after December 31, 2024 apply until the schedules for taxable years beginning after December 31, 2026, so 2026 keeps the 2025 brackets; the 7.25% capital gains rate in 235-51(f) is unchanged; the Tax Table method follows ${N11_2025}`,
    attestations: []
  },
  {
    id: 'us.state-return.hi.deductions',
    value: { standard: { single: 4400, mfs: 4400, mfj: 8800, qss: 8800, hoh: 6424 }, dependentMinimum: 500, exemption: 1144, itemized: { ...ITEMIZED, charityFloorBp: 0 } },
    basis: 'hawaii_standard_deduction_or_itemized_deductions_with_the_state_income_tax_agi_limits_and_overall_limitation_plus_1144_dollar_exemptions',
    ...year(2025),
    act: 'Hawaii Revised Statutes 235-2.4 as amended by Act 46, SLH 2024; 235-54',
    section: '235-2.4(b), (c), (j); 235-54(a)',
    source: `${N11_2025}: Line 23 standard deduction ($4,400 single or married filing separately, $8,800 married filing jointly or qualifying surviving spouse, $6,424 head of household; dependents the greater of $500 or earned income), Line 25 ($1,144 per exemption), Worksheet A-1 (7.5% of Hawaii AGI), Worksheet A-2 (income taxes only if federal AGI is less than $100,000 single or married filing separately, $150,000 head of household, $200,000 married filing jointly), Total Itemized Deductions Worksheet ($166,800, $83,400 married filing separately; 80% and 3%)`,
    attestations: []
  },
  {
    id: 'us.state-return.hi.deductions',
    value: { standard: { single: 8000, mfs: 8000, mfj: 16000, qss: 16000, hoh: 12000 }, dependentMinimum: 500, exemption: 1144, itemized: { ...ITEMIZED, charityFloorBp: 50 } },
    basis: 'hawaii_standard_deduction_or_itemized_deductions_with_the_state_income_tax_agi_limits_and_overall_limitation_plus_1144_dollar_exemptions',
    ...year(2026),
    act: 'Hawaii Revised Statutes 235-2.4 as amended by Act 46, SLH 2024 and Act 35, SLH 2026; 235-54',
    section: '235-2.4(b), (c), (j); 235-54(a)',
    source: `${ACT46}: HRS 235-2.4(c)(2)(F) "For taxable years beginning after December 31, 2025" ($16,000 joint or surviving spouse, $12,000 head of household, $8,000 single or married filing separately); the $1,144 exemption in HRS 235-54(a) is unchanged; ${ANN26}: Hawaii conforms to IRC 170 as amended, which imposes the 0.5% charitable deduction floor for itemizers`,
    attestations: []
  },
  {
    id: 'us.state-return.hi.subtractions',
    value: { militaryReserveMaximum: 8636 },
    basis: 'first_part_of_military_reserve_or_hawaii_national_guard_duty_pay_excluded_from_hawaii_income',
    ...year(2025),
    act: 'Hawaii Revised Statutes 235-7(a)(10)',
    section: '235-7(a)(10)',
    source: `${N11_2025}: Line 15 "First $8,636 of military reserve or Hawaii national guard duty pay"`,
    attestations: []
  },
  {
    id: 'us.state-return.hi.subtractions',
    value: { militaryReserveMaximum: 8636, provisional: true },
    basis: 'first_part_of_military_reserve_or_hawaii_national_guard_duty_pay_excluded_from_hawaii_income',
    ...year(2026),
    act: 'Hawaii Revised Statutes 235-7(a)(10)',
    section: '235-7(a)(10)',
    source: `${PROVISIONAL_2026} (the $8,636 exclusion is carried from the 2025 form)`,
    attestations: []
  },
  {
    id: 'us.state-return.hi.eitc',
    value: { rateBp: 4000 },
    basis: 'refundable_hawaii_earned_income_tax_credit_as_a_share_of_the_federal_credit_prorated_by_hawaii_agi_for_nonresidents',
    ...year(2025),
    act: 'Hawaii Revised Statutes 235-55.75',
    section: '235-55.75',
    source: `${N11_2025}: Form N-356 line 3 (multiply the federal earned income credit by 40%) and line 6 (Hawaii AGI over federal AGI, computed to 3 decimal places and rounded to 2)`,
    attestations: []
  },
  {
    id: 'us.state-return.hi.eitc',
    value: { rateBp: 4000, provisional: true },
    basis: 'refundable_hawaii_earned_income_tax_credit_as_a_share_of_the_federal_credit_prorated_by_hawaii_agi_for_nonresidents',
    ...year(2026),
    act: 'Hawaii Revised Statutes 235-55.75',
    section: '235-55.75',
    source: `${N11_2025} for the 40% rate; ${ANN26} lists no 2026 change to the credit; ${PROVISIONAL_2026}`,
    attestations: []
  },
  {
    id: 'us.state-return.hi.refundable-credits',
    value: CREDITS,
    basis: 'food_excise_tax_credit_per_qualified_exemption_low_income_renters_credit_and_child_and_dependent_care_credit_by_agi',
    ...year(2025),
    act: 'Hawaii Revised Statutes 235-55.85; 235-55.7; 235-55.6',
    section: '235-55.85; 235-55.7; 235-55.6',
    source: `${N11_2025}: Form N-311 lines 1 and 7 (federal AGI under $40,000 single or $60,000 other, $220 to $70 per qualified exemption present in Hawaii more than nine months), Schedule X Part I (Hawaii AGI under $30,000, rent over $1,000, $50 per exemption with one more for each qualified exemption 65 or older), Schedule X Part II lines 17 and 27 ($10,000 or $20,000; .25 to .15 by AGI)`,
    attestations: []
  },
  {
    id: 'us.state-return.hi.refundable-credits',
    value: { ...CREDITS, provisional: true },
    basis: 'food_excise_tax_credit_per_qualified_exemption_low_income_renters_credit_and_child_and_dependent_care_credit_by_agi',
    ...year(2026),
    act: 'Hawaii Revised Statutes 235-55.85; 235-55.7; 235-55.6',
    section: '235-55.85; 235-55.7; 235-55.6',
    source: `${N11_2025} for the 2025 amounts; ${PROVISIONAL_2026}`,
    attestations: []
  }
];
