const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const INSTR_2025 = 'Connecticut Department of Revenue Services, 2025 Form CT-1040 Instructions (Rev. 12/25) (portal.ct.gov/-/media/drs/forms/2025/income/2025-ct-1040-instructions_1225.pdf) and 2025 Form CT-1040NR/PY Instructions (Rev. 12/25) (portal.ct.gov/-/media/drs/forms/2025/income/2025-ct-1040-nrpy-instructions_1225.pdf), read 2026-11-21';
const STATUTE_2026 = 'Conn. Gen. Stat. chapter 229 as revised to January 1, 2025 (cga.ct.gov/2025/pub/chap_229.htm) and the 2026 Supplement (cga.ct.gov/2026/sup/chap_229.htm), read 2026-11-21: the 2026 Supplement amends only sections 12-701 (first-time homebuyer savings account modifications from 2026), 12-704e, 12-704j, 12-704k, 12-705, 12-724b and 12-743, so the rate schedule (12-700(a)(10), applicable to taxable years commencing on or after January 1, 2024), the exemption (12-702), the personal credit (12-703), the property tax credit (12-704c) and the pension, IRA and Social Security modifications (12-701(a)(20)(B)) apply unchanged to 2026; none of these amounts is indexed. DRS has not published the 2026 CT-1040 instructions as of 2026-11-21';

const brackets = {
  single: [{ overCents: 0, rateBp: 200 }, { overCents: 1000000, rateBp: 450 }, { overCents: 5000000, rateBp: 550 }, { overCents: 10000000, rateBp: 600 }, { overCents: 20000000, rateBp: 650 }, { overCents: 25000000, rateBp: 690 }, { overCents: 50000000, rateBp: 699 }],
  mfj: [{ overCents: 0, rateBp: 200 }, { overCents: 2000000, rateBp: 450 }, { overCents: 10000000, rateBp: 550 }, { overCents: 20000000, rateBp: 600 }, { overCents: 40000000, rateBp: 650 }, { overCents: 50000000, rateBp: 690 }, { overCents: 100000000, rateBp: 699 }],
  hoh: [{ overCents: 0, rateBp: 200 }, { overCents: 1600000, rateBp: 450 }, { overCents: 8000000, rateBp: 550 }, { overCents: 16000000, rateBp: 600 }, { overCents: 32000000, rateBp: 650 }, { overCents: 40000000, rateBp: 690 }, { overCents: 80000000, rateBp: 699 }],
};
brackets.mfs = brackets.single;

const personalCredit = (rows) => rows.map(([overAgi, decimal]) => ({ overAgi, bp: Math.round(decimal * 10000) }));

const INCOME_TAX = {
  noTaxAtOrBelow: { single: 15000, mfj: 24000, mfs: 12000, hoh: 19000 },
  exemption: { single: { amount: 15000, phaseOutOver: 30000 }, mfj: { amount: 24000, phaseOutOver: 48000 }, mfs: { amount: 12000, phaseOutOver: 24000 }, hoh: { amount: 19000, phaseOutOver: 38000 } },
  exemptionReductionPerStep: 1000,
  exemptionStep: 1000,
  brackets,
  phaseOutAddBack: { single: { over: 56500, step: 5000, perStep: 25, maximum: 250 }, mfj: { over: 100500, step: 5000, perStep: 50, maximum: 500 }, mfs: { over: 50250, step: 2500, perStep: 25, maximum: 250 }, hoh: { over: 78500, step: 4000, perStep: 40, maximum: 400 } },
  recapture: {
    single: [{ over: 105000, step: 5000, perStep: 25, maximum: 250 }, { over: 200000, step: 5000, perStep: 90, maximum: 2700 }, { over: 500000, step: 5000, perStep: 50, maximum: 450 }],
    mfs: [{ over: 105000, step: 5000, perStep: 25, maximum: 250 }, { over: 200000, step: 5000, perStep: 90, maximum: 2700 }, { over: 500000, step: 5000, perStep: 50, maximum: 450 }],
    mfj: [{ over: 210000, step: 10000, perStep: 50, maximum: 500 }, { over: 400000, step: 10000, perStep: 180, maximum: 5400 }, { over: 1000000, step: 10000, perStep: 100, maximum: 900 }],
    hoh: [{ over: 168000, step: 8000, perStep: 40, maximum: 400 }, { over: 320000, step: 8000, perStep: 140, maximum: 4200 }, { over: 800000, step: 8000, perStep: 80, maximum: 720 }],
  },
  personalCredit: {
    single: personalCredit([[15000, 0.75], [18800, 0.7], [19300, 0.65], [19800, 0.6], [20300, 0.55], [20800, 0.5], [21300, 0.45], [21800, 0.4], [22300, 0.35], [25000, 0.3], [25500, 0.25], [26000, 0.2], [26500, 0.15], [31300, 0.14], [31800, 0.13], [32300, 0.12], [32800, 0.11], [33300, 0.1], [60000, 0.09], [60500, 0.08], [61000, 0.07], [61500, 0.06], [62000, 0.05], [62500, 0.04], [63000, 0.03], [63500, 0.02], [64000, 0.01], [64500, 0]]),
    mfj: personalCredit([[24000, 0.75], [30000, 0.7], [30500, 0.65], [31000, 0.6], [31500, 0.55], [32000, 0.5], [32500, 0.45], [33000, 0.4], [33500, 0.35], [40000, 0.3], [40500, 0.25], [41000, 0.2], [41500, 0.15], [50000, 0.14], [50500, 0.13], [51000, 0.12], [51500, 0.11], [52000, 0.1], [96000, 0.09], [96500, 0.08], [97000, 0.07], [97500, 0.06], [98000, 0.05], [98500, 0.04], [99000, 0.03], [99500, 0.02], [100000, 0.01], [100500, 0]]),
    mfs: personalCredit([[12000, 0.75], [15000, 0.7], [15500, 0.65], [16000, 0.6], [16500, 0.55], [17000, 0.5], [17500, 0.45], [18000, 0.4], [18500, 0.35], [20000, 0.3], [20500, 0.25], [21000, 0.2], [21500, 0.15], [25000, 0.14], [25500, 0.13], [26000, 0.12], [26500, 0.11], [27000, 0.1], [48000, 0.09], [48500, 0.08], [49000, 0.07], [49500, 0.06], [50000, 0.05], [50500, 0.04], [51000, 0.03], [51500, 0.02], [52000, 0.01], [52500, 0]]),
    hoh: personalCredit([[19000, 0.75], [24000, 0.7], [24500, 0.65], [25000, 0.6], [25500, 0.55], [26000, 0.5], [26500, 0.45], [27000, 0.4], [27500, 0.35], [34000, 0.3], [34500, 0.25], [35000, 0.2], [35500, 0.15], [44000, 0.14], [44500, 0.13], [45000, 0.12], [45500, 0.11], [46000, 0.1], [74000, 0.09], [74500, 0.08], [75000, 0.07], [75500, 0.06], [76000, 0.05], [76500, 0.04], [77000, 0.03], [77500, 0.02], [78000, 0.01], [78500, 0]]),
  },
};

const MODIFICATIONS = {
  socialSecurityFullyExemptBelow: { single: 75000, mfs: 75000, mfj: 100000, qss: 100000, hoh: 100000 },
  socialSecurityTaxableShareBp: 2500,
  pensionPhaseOut: {
    other: [{ fromAgi: 0, bp: 10000 }, { fromAgi: 75000, bp: 8500 }, { fromAgi: 77500, bp: 7000 }, { fromAgi: 80000, bp: 5500 }, { fromAgi: 82500, bp: 4000 }, { fromAgi: 85000, bp: 2500 }, { fromAgi: 87500, bp: 1000 }, { fromAgi: 90000, bp: 500 }, { fromAgi: 95000, bp: 250 }, { fromAgi: 100000, bp: 0 }],
    mfj: [{ fromAgi: 0, bp: 10000 }, { fromAgi: 100000, bp: 8500 }, { fromAgi: 105000, bp: 7000 }, { fromAgi: 110000, bp: 5500 }, { fromAgi: 115000, bp: 4000 }, { fromAgi: 120000, bp: 2500 }, { fromAgi: 125000, bp: 1000 }, { fromAgi: 130000, bp: 500 }, { fromAgi: 140000, bp: 250 }, { fromAgi: 150000, bp: 0 }],
  },
  iraShareBp: 7500,
  teachersRetirementShareBp: 5000,
  chetMaximum: { single: 5000, mfs: 5000, hoh: 5000, mfj: 10000, qss: 10000 },
  ableMaximum: { single: 5000, mfs: 5000, hoh: 5000, mfj: 10000, qss: 10000 },
};

const CREDITS = {
  propertyTaxMaximum: 300,
  propertyTaxPhaseOut: { single: { over: 49500, step: 10000 }, mfj: { over: 70500, step: 10000 }, qss: { over: 70500, step: 10000 }, mfs: { over: 35250, step: 5000 }, hoh: { over: 54500, step: 10000 } },
  propertyTaxReductionBpPerStep: 1500,
  motorVehicles: { single: 1, mfs: 1, hoh: 1, mfj: 2, qss: 2 },
  eitcBasisPoints: 4000,
  eitcChildBonus: 250,
};

export const RULES = [2025, 2026].flatMap((y) => [
  {
    id: 'us.state-return.ct.income-tax',
    value: INCOME_TAX,
    basis: 'tax_calculation_schedule_exemption_from_table_a_initial_tax_from_table_b_plus_two_percent_phase_out_add_back_table_c_plus_recapture_table_d_less_personal_tax_credit_table_e_all_on_connecticut_agi_or_line_7_for_nonresidents',
    ...year(y),
    act: 'Connecticut General Statutes chapter 229',
    section: '12-700(a)(10); 12-702; 12-703',
    source: y === 2025 ? `${INSTR_2025}: Line 6 no-tax amounts ($12,000 MFS, $15,000 single, $19,000 HOH, $24,000 MFJ/QSS), Tax Calculation Schedule and Tables A to E (pages 19 to 23); Table C and D steps derived from the printed rows (for example single: $25 per $5,000 over $56,500 up to $250; recapture $25 per $5,000 over $105,000 up to $250, $90 per $5,000 over $200,000 up to $2,950 in all, $50 per $5,000 over $500,000 up to $3,400 in all)` : STATUTE_2026,
    attestations: []
  },
  {
    id: 'us.state-return.ct.modifications',
    value: MODIFICATIONS,
    basis: 'schedule_1_social_security_adjustment_worksheet_pension_and_annuity_phase_out_table_75_percent_of_ira_distributions_50_percent_teachers_retirement_chet_and_able_maximums',
    ...year(y),
    act: 'Connecticut General Statutes chapter 229',
    section: '12-701(a)(20)(B)(x), (xxi), (xxii), (xxviii), (xxix), (xiii), (xxxiv); 12-701a',
    source: y === 2025 ? `${INSTR_2025}: Line 41 and the Social Security Benefit Adjustment Worksheet (fully exempt below $75,000 single/MFS and $100,000 MFJ/QSS/HOH; otherwise 25% of the lesser of worksheet lines 1 and 9), Line 48b and the Pension and Annuity Worksheet and Phase-Out Table (page 24; 75% of IRA distributions), Line 45 (50% of Teachers' Retirement), Line 48 CHET and Line 48d ABLE ($5,000, $10,000 joint)` : STATUTE_2026,
    attestations: []
  },
  {
    id: 'us.state-return.ct.credits',
    value: CREDITS,
    basis: 'schedule_3_property_tax_credit_up_to_300_reduced_15_percent_per_step_of_connecticut_agi_over_the_threshold_one_vehicle_or_two_for_joint_and_ct_eitc_40_percent_of_federal_eic_plus_250_with_a_qualifying_child',
    ...year(y),
    act: 'Connecticut General Statutes chapter 229',
    section: '12-704c; 12-704e',
    source: y === 2025 ? `${INSTR_2025}: Schedule 3 Lines 60 to 68 and the Property Tax Credit Table (page 27), Line 20a and Schedule CT-EITC Lines 9 and 15a ("the CT EITC is 40% (.40) of the federal EIC", "enter $250"); 12-704e(b) as amended by P.A. 25-168 section 371 adds the $250 for taxable years commencing on and after January 1, 2025` : STATUTE_2026,
    attestations: []
  },
]);
