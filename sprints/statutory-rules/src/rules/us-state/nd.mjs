const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const BOOKLET_2025 = 'North Dakota Office of State Tax Commissioner, 2025 Individual Income Tax Booklet with Form ND-1 instructions, the Marriage Penalty Credit Worksheet, the Net Long-Term Capital Gain Exclusion Worksheet, the 2025 Tax Table and the 2025 Tax Rate Schedules (www.tax.nd.gov/sites/www/files/documents/forms/individual/2025-iit/2025-individual-income-tax-booklet.pdf), with 2025 Form ND-1 (28702-form-nd-1-2025.pdf) and 2025 Schedule ND-1NR (28724-schedule-nd-1nr-2025.pdf), read 2026-11-21';
const ES_2026 = 'North Dakota Office of State Tax Commissioner, 2026 Form ND-1ES (SFN 28709, 12-2025), "2026 Forms ND-1 and ND-EZ Tax Rate Schedules" (www.tax.nd.gov/sites/www/files/documents/forms/individual/2025-iit/28709-form-nd-1es-2026.pdf), read 2026-11-21';
const NDCC = 'N.D.C.C. 57-38-30.3(2)(a), (d), (g), (m), (r), (s) and (t) and 57-38-30.3(4) (ndlegis.gov/cencode/t57c38.pdf), read 2026-11-21';
const PROVISIONAL_2026 = 'The 2026 Form ND-1 booklet is not published as of 2026-11-21; the 2026 Tax Table and the indexed amounts on the 2026 Marriage Penalty Credit Worksheet (N.D.C.C. 57-38-01.28: maximum credit adjusted each year with the rate schedules, the lesser-earning spouse floor and the exemption and standard deduction reduction) are not published, so the 2025 figures are carried and the record is provisional';

const band = (rows) => rows.map(([over, rateBp]) => ({ overCents: over * 100, rateBp }));

const BRACKETS = {
  2025: { single: band([[0, 0], [48475, 195], [244825, 250]]), mfj: band([[0, 0], [80975, 195], [298075, 250]]), mfs: band([[0, 0], [40475, 195], [149025, 250]]), hoh: band([[0, 0], [64950, 195], [271450, 250]]) },
  2026: { single: band([[0, 0], [49575, 195], [250400, 250]]), mfj: band([[0, 0], [82800, 195], [304850, 250]]), mfs: band([[0, 0], [41400, 195], [152425, 250]]), hoh: band([[0, 0], [66400, 195], [277600, 250]]) },
};

export const RULES = [
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.nd.income-tax',
    value: { brackets: { ...BRACKETS[y], qss: BRACKETS[y].mfj }, tableBelow: 100000 },
    basis: 'north_dakota_taxable_income_taxed_at_0_1_95_and_2_5_percent_by_filing_status_tax_table_below_100000',
    ...year(y),
    act: 'N.D.C.C. 57-38-30.3(1)',
    section: '57-38-30.3(1)(a)-(d) and (g)',
    source: y === 2025 ? `${BOOKLET_2025}: 2025 Tax Rate Schedules page 28 (single 0% to $48,475, 1.95% to $244,825, $3,828.83 plus 2.50% above; joint and qualifying surviving spouse $80,975 and $298,075; separate $40,475 and $149,025; head of household $64,950 and $271,450) and Line 20 instructions (Tax Table for full-year residents; schedules at $100,000 or more)` : `${ES_2026}: single $49,575 and $250,400; joint and qualifying surviving spouse $82,800 and $304,850; separate $41,400 and $152,425; head of household $66,400 and $277,600, the brackets indexed under N.D.C.C. 57-38-30.3(1)(g)`,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.nd.tax-table',
    value: { rowWidth: 50, rounding: 'midpoint_half_up', ...(y === 2026 ? { provisional: true } : {}) },
    basis: 'tax_table_amount_is_the_rate_schedule_tax_on_the_midpoint_of_each_50_dollar_row_rounded_to_the_nearest_dollar',
    ...year(y),
    act: 'N.D.C.C. 57-38-30.3(1)(h)',
    section: 'Form ND-1 line 20; Schedule ND-1NR line 22',
    source: y === 2025 ? `${BOOKLET_2025}: 2025 Tax Table pages 20-27; the 720 rows read from $41,650 to $100,000 were checked in all four columns to equal the rate schedule tax on the row midpoint rounded to the nearest dollar` : PROVISIONAL_2026,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.nd.adjustments',
    value: { capitalGainExclusionBasisPoints: 4000, qualifiedDividendExclusionBasisPoints: 4000, collegeSaveLimit: { mfj: 10000, other: 5000 } },
    basis: 'forty_percent_exclusions_of_net_long_term_capital_gain_and_qualified_dividends_and_the_college_save_contribution_deduction',
    ...year(y),
    act: 'N.D.C.C. 57-38-30.3(2)',
    section: '57-38-30.3(2)(d) and (m)',
    source: y === 2025 ? `${BOOKLET_2025}: lines 6, 12 and 13 instructions ("exclude 40 percent of the gain"; College SAVE "up to a maximum of $5,000 ($10,000, if married filing jointly)"; qualified dividends "by 40 percent"); ${NDCC}` : `${NDCC}; the percentages and limits are fixed by statute and not indexed`,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.nd.marriage-penalty',
    value: { jointTaxableIncomeOver: 81036, lesserIncomeOver: 47550, lesserIncomeReduction: 15750, maximum: 312, ...(y === 2026 ? { provisional: true } : {}) },
    basis: 'marriage_penalty_credit_joint_tax_minus_single_tax_on_the_lesser_earning_spouse_qualified_income_less_the_reduction_and_on_the_rest_up_to_the_maximum',
    ...year(y),
    act: 'N.D.C.C. 57-38-01.28',
    section: '57-38-01.28(1)-(4)',
    source: y === 2025 ? `${BOOKLET_2025}: Marriage Penalty Credit Worksheet page 15 (line 2 "more than $81,036", line 5 "more than $47,550" and 15,750.00, line 13 maximum credit 312.00) and "What's included in qualified income?"` : PROVISIONAL_2026,
    attestations: []
  })),
];
