const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const FILES = 'www.maine.gov/revenue/sites/maine.gov.revenue/files/inline-files';
const READ = 'read 2026-11-21';
const INSTR_2025 = `Maine Revenue Services, 2025 Form 1040ME general instructions and tax table (${FILES}/25_1040me_gen_instr_w_cover_pg.pdf) and 2025 Form 1040ME (${FILES}/25_1040ME_fillable.pdf)`;
const RATES_2025 = `Maine Revenue Services, 2025 Individual Income Tax Rates (${FILES}/ind_tax_rate_sched_2025.pdf)`;
const SCH2_2025 = `2025 Form 1040ME Schedule 2 (${FILES}/25_1040me_sch_2_fillable.pdf)`;
const PHASE_2025 = `Phaseout of Itemized/Standard Deductions Worksheet (${FILES}/25_item_stand_%20ded_phaseout_wksht.pdf) and the Worksheet for Phaseout of Personal Exemption in the 2025 Form 1040ME instructions`;
const SCH1S_2025 = `2025 Form 1040ME Schedule 1S and Worksheet for Pension Income Deduction (${FILES}/25_1040me_sch_1s_fillable.pdf)`;
const CREDIT_DOCS_2025 = `2025 Dependent Exemption Tax Credit Worksheet (${FILES}/25_dependent_exemption_tx_cr_fillable.pdf), Earned Income Tax Credit Worksheet (${FILES}/25_earned_income_cred_fillable.pdf), Child Care Credit Worksheet (${FILES}/25_child_care_tx_cr_fillable.pdf) and Schedule PTFC/STFC with instructions (${FILES}/25_1040me_sch_ptfc_fillable.pdf)`;
const RATES_2026 = 'Maine Revenue Services, 2026 Individual Income Tax Rates, revised May 20, 2026 (www.maine.gov/revenue/sites/maine.gov.revenue/files/2026-05/ind_tax_rate_sched_2026_rev.pdf), and Maine Tax Alert August 2026 Vol. 36 Issue 10 on the 2% surcharge and standard deduction (P.L. 2025, ch. 650)';
const ES_2026 = `2026 Form 1040ES-ME Estimated Tax Worksheet, revised July 2026 (${FILES}/26_1040es_fillable.pdf)`;
const NOT_YET = 'Maine has not published the 2026 Form 1040ME, its worksheets or Schedule PTFC/STFC as of 2026-11-21';

const SINGLE_2025 = [{ overCents: 0, rateBp: 580 }, { overCents: 2680000, rateBp: 675 }, { overCents: 6345000, rateBp: 715 }];
const HOH_2025 = [{ overCents: 0, rateBp: 580 }, { overCents: 4020000, rateBp: 675 }, { overCents: 9515000, rateBp: 715 }];
const MFJ_2025 = [{ overCents: 0, rateBp: 580 }, { overCents: 5360000, rateBp: 675 }, { overCents: 12690000, rateBp: 715 }];
const SINGLE_2026 = [{ overCents: 0, rateBp: 580 }, { overCents: 2740000, rateBp: 675 }, { overCents: 6485000, rateBp: 715 }];
const HOH_2026 = [{ overCents: 0, rateBp: 580 }, { overCents: 4110000, rateBp: 675 }, { overCents: 9730000, rateBp: 715 }];
const MFJ_2026 = [{ overCents: 0, rateBp: 580 }, { overCents: 5485000, rateBp: 675 }, { overCents: 12975000, rateBp: 715 }];
const TABLE = { below: 52000, width: 100, firstRows: [{ below: 50, tax: 0 }, { below: 100, tax: 3 }] };

const PHASEOUTS_2025 = {
  deduction: { start: { single: 100000, mfs: 100000, hoh: 150000, mfj: 200050 }, range: { single: 75000, mfs: 75000, hoh: 112500, mfj: 150000 } },
  exemption: { start: { single: 333450, mfs: 200050, hoh: 366750, mfj: 400100 }, range: { single: 125000, mfs: 62500, hoh: 125000, mfj: 125000 } }
};

const CREDITS_2025 = {
  detc: { olderAmount: 305, youngAmount: 610, youngUnder: 6, phaseoutStart: { single: 100000, hoh: 125000, mfj: 150000, mfs: 75000 }, step: 500, stepReduction: 20 },
  eitcWithChildBp: 2500,
  eitcNoChildBp: 5000,
  childCareBp: 2500,
  star5ChildCareBp: 5000,
  childCareRefundableMaximum: 500,
  ptfc: { rentBp: 1500, incomeBp: 400, benefitBase: { single: [2550, 2550, 2550], hoh: [3300, 3300, 4050], mfj: [3300, 4050, 4050] }, olderBenefitBase: 4100, maximum: 1000, olderMaximum: 2000 },
  stfc: {
    single: { upTo: 25450, width: 500, step: 10, columnStarts: [0], base: [155] },
    hoh: { upTo: 38200, width: 750, step: 15, columnStarts: [0, 2, 3], base: [215, 250, 280] },
    mfj: { upTo: 50950, width: 1000, step: 20, columnStarts: [0, 1, 2], base: [215, 250, 280] }
  }
};

export const RULES = [
  {
    id: 'us.state-return.me.income-tax',
    value: {
      brackets: { single: SINGLE_2025, hoh: HOH_2025, mfj: MFJ_2025 },
      scheduleBase: { single: [0, 1554, 4028], hoh: [0, 2332, 6041], mfj: [0, 3109, 8057] },
      table: TABLE,
      standardDeduction: { single: 15000, mfs: 15000, hoh: 22500, mfj: 30000 },
      additionalStandard: { married: 1600, unmarried: 2000 },
      exemption: 5150,
      itemizedCap: 36300
    },
    basis: 'maine_tax_on_line_19_from_the_tax_table_below_52000_or_the_rate_schedule_after_the_standard_or_capped_itemized_deduction_and_5150_per_exemption',
    ...year(2025),
    act: 'Maine Revised Statutes Title 36 (Taxation)',
    section: '5111(1-F), (2-F), (3-F); 5124-C; 5125; 5126-A; 5403',
    source: `${RATES_2025}: single "Less than $26,800 5.8%", "$1,554 plus 6.75% of excess over $26,800", "$4,028 plus 7.15% of excess over $63,450", head of household $40,200 / $2,332 / $95,150 / $6,041, joint $53,600 / $3,109 / $126,900 / $8,057; ${INSTR_2025}: tax table for line 19 below $52,000 in $100 rows (first rows 0-50 tax 0 and 50-100 tax 3), standard deduction $15,000 / $22,500 / $30,000, additional $1,600 married or $2,000 unmarried per box, exemption $5,150; ${SCH2_2025}: line 5 maximum itemized deduction $36,300 plus medical; ${READ}`,
    attestations: []
  },
  {
    id: 'us.state-return.me.income-tax',
    value: {
      brackets: { single: SINGLE_2026, hoh: HOH_2026, mfj: MFJ_2026 },
      scheduleBase: { single: [0, 1589, 4117], hoh: [0, 2384, 6178], mfj: [0, 3181, 8237] },
      table: TABLE,
      standardDeduction: { single: 15700, mfs: 15700, hoh: 23550, mfj: 31400 },
      additionalStandard: { married: 1650, unmarried: 2050 },
      exemption: 5300,
      itemizedCap: 37100,
      surcharge: { over: { single: 1000000, mfs: 750000, hoh: 1500000, mfj: 1500000 }, rateBp: 200 }
    },
    basis: 'maine_2026_rate_schedule_standard_deduction_exemption_and_2_percent_surcharge_on_taxable_income_over_1000000_single_750000_separate_1500000_joint_or_head_of_household',
    ...year(2026),
    act: 'Maine Revised Statutes Title 36 (Taxation); P.L. 2025, ch. 650',
    section: '5111(1-F), (2-F), (3-F), (7); 5124-C; 5125; 5126-A; 5403',
    source: `${RATES_2026}: single "Less than $27,400", "$1,589 plus 6.75% of excess over $27,400", "$4,117 plus 7.15% of excess over $64,850", head of household $41,100 / $2,384 / $97,300 / $6,178, joint $54,850 / $3,181 / $129,750 / $8,237, "Personal Exemption: $5,300", standard deduction $15,700 / $23,550 / $31,400 / $15,700, additional $1,650 married or $2,050 unmarried, surcharge "2% on the portion of the taxpayer's Maine taxable income greater than $1,000,000 if filing single, $750,000 if married filing separate; or $1,500,000 if married filing jointly or head of household"; ${ES_2026}: itemized deduction maximum $37,100; the tax table rule ($100 rows below $52,000) is assumed to continue; ${READ}`,
    attestations: []
  },
  {
    id: 'us.state-return.me.phaseouts',
    value: PHASEOUTS_2025,
    basis: 'maine_standard_or_itemized_deduction_and_personal_exemption_reduced_by_the_ratio_of_maine_agi_over_the_threshold_to_the_phaseout_range_to_four_decimals',
    ...year(2025),
    act: 'Maine Revised Statutes Title 36 (Taxation)',
    section: '5124-C(2); 5125(7); 5126-A(2)',
    source: `${PHASE_2025}: deduction reduced when Maine AGI is more than $100,000 single or separate, $150,000 head of household, $200,050 joint, range $75,000 / $112,500 / $150,000; exemption reduced above $333,450 single, $366,750 head of household, $400,100 joint, $200,050 separate, range $125,000 ($62,500 separate); ${READ}`,
    attestations: []
  },
  {
    id: 'us.state-return.me.phaseouts',
    value: {
      deduction: { start: { single: 102250, mfs: 102250, hoh: 150000, mfj: 200050 }, range: PHASEOUTS_2025.deduction.range },
      exemption: { start: { single: 341000, mfs: 200050, hoh: 366750, mfj: 400100 }, range: PHASEOUTS_2025.exemption.range },
      provisional: true
    },
    basis: 'maine_standard_or_itemized_deduction_and_personal_exemption_reduced_by_the_ratio_of_maine_agi_over_the_threshold_to_the_phaseout_range_to_four_decimals',
    ...year(2026),
    act: 'Maine Revised Statutes Title 36 (Taxation)',
    section: '5124-C(2); 5125(7); 5126-A(2)',
    source: `${ES_2026}: "If your Maine adjusted gross income is over $102,250" (deduction phaseout) and "over $341,000" (exemption phaseout) for a single filer. ${NOT_YET}; the head of household, joint and separate thresholds and the phaseout ranges are carried from 2025 and the record is provisional until the 2026 worksheets are published; ${READ}`,
    attestations: []
  },
  {
    id: 'us.state-return.me.subtractions',
    value: { pensionMaximum: 48216, pensionPhaseout: { start: { single: 125000, mfs: 125000, hoh: 187500, mfj: 250000 }, range: { single: 100000, mfs: 50000, hoh: 100000, mfj: 100000 } }, college529: { perBeneficiary: 1000, agiLimit: { single: 100000, mfs: 100000, hoh: 200000, mfj: 200000 } } },
    basis: 'maine_pension_income_deduction_up_to_the_maximum_less_social_security_received_phased_out_above_federal_agi_threshold_and_529_deduction_up_to_1000_per_beneficiary',
    ...year(2025),
    act: 'Maine Revised Statutes Title 36 (Taxation)',
    section: '5122(2)',
    source: `${SCH1S_2025}: line P2 "Maximum allowable deduction 48,216", phaseout when federal AGI is more than $125,000 single or separate, $187,500 head of household, $250,000 joint, line 4 "$100,000 if single or head of household or married filing jointly ... $50,000 if married filing separately"; Schedule 1S line 8 "Limited to $1,000 per beneficiary" and the 2025 Form 1040ME instructions for the AGI limit of $100,000 single or separate and $200,000 for other statuses; ${READ}`,
    attestations: []
  },
  {
    id: 'us.state-return.me.subtractions',
    value: { pensionMaximum: 49824, pensionPhaseout: { start: { single: 125000, mfs: 125000, hoh: 187500, mfj: 250000 }, range: { single: 100000, mfs: 50000, hoh: 100000, mfj: 100000 } }, college529: { perBeneficiary: 1000, agiLimit: { single: 100000, mfs: 100000, hoh: 200000, mfj: 200000 } }, provisional: true },
    basis: 'maine_pension_income_deduction_up_to_the_maximum_less_social_security_received_phased_out_above_federal_agi_threshold_and_529_deduction_up_to_1000_per_beneficiary',
    ...year(2026),
    act: 'Maine Revised Statutes Title 36 (Taxation)',
    section: '5122(2)',
    source: `${ES_2026}: pension income deduction maximum $49,824 for 2026. ${NOT_YET}; the pension phaseout thresholds are indexed for years after 2025 and are carried from 2025, so the record is provisional; ${READ}`,
    attestations: []
  },
  {
    id: 'us.state-return.me.credits',
    value: CREDITS_2025,
    basis: 'maine_dependent_exemption_credit_eitc_child_care_credit_property_tax_fairness_credit_and_sales_tax_fairness_credit',
    ...year(2025),
    act: 'Maine Revised Statutes Title 36 (Taxation)',
    section: '5218; 5219-S; 5219-SS; 5219-KK; 5213-A',
    source: `${CREDIT_DOCS_2025}: $305 per qualifying child or dependent aged 6 or more and $610 under 6, reduced by $20 per $500 (rounded up) of Maine AGI over $100,000 single, $125,000 head of household, $150,000 joint, $75,000 separate; EITC 25% of the federal credit with a qualifying child, 50% without; child care credit 25% (50% Star 5) of federal Schedule 3 line 2, refundable up to $500; property tax fairness credit benefit base $2,550 single, $3,300 or $4,050 joint and head of household by line 13a, $4,100 at 65, less 4% of total income, capped at $1,000 ($2,000 at 65), rent counted at 15%; sales tax fairness credit tables (single $155 up to $25,450 then $10 less per $500; head of household $215/$250/$280 up to $38,200 then $15 less per $750; joint $215/$250/$280 up to $50,950 then $20 less per $1,000); ${READ}`,
    attestations: []
  },
  {
    id: 'us.state-return.me.credits',
    value: { ...CREDITS_2025, provisional: true },
    basis: 'maine_dependent_exemption_credit_eitc_child_care_credit_property_tax_fairness_credit_and_sales_tax_fairness_credit',
    ...year(2026),
    act: 'Maine Revised Statutes Title 36 (Taxation)',
    section: '5218; 5219-S; 5219-SS; 5219-KK; 5213-A',
    source: `${NOT_YET}; the dependent exemption credit phaseout thresholds and the property and sales tax fairness credit amounts are indexed each year, so the 2025 figures are carried and the record is provisional; ${READ}`,
    attestations: []
  }
];
