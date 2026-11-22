const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const OR40 = 'Oregon Department of Revenue, 2025 Form OR-40 Instructions (www.oregon.gov/dor/forms/FormsPubs/form-or-40-inst_101-040-1_2025.pdf, Rev. 01-29-26), read 2026-11-21';
const OR40NP = 'Oregon Department of Revenue, 2025 Form OR-40-N and Form OR-40-P Instructions (www.oregon.gov/dor/forms/FormsPubs/form-or-40-n_or-40-p-inst_101-048-1_2025.pdf, Rev. 12-30-25), read 2026-11-21';
const OR17 = 'Oregon Department of Revenue, Publication OR-17, 2025 Oregon Individual Income Tax Guide (www.oregon.gov/dor/forms/FormsPubs/publication-or-17_101-431_2025.pdf), Retirement income credit 811, read 2026-11-21';
const ORA = 'Oregon Department of Revenue, 2025 Schedule OR-A and Instructions (www.oregon.gov/dor/forms/FormsPubs/schedule-or-a_101-007_2025.pdf and schedule-or-a-inst_101-007-1_2025.pdf), read 2026-11-21';
const EST_2026 = 'Oregon Department of Revenue, Publication OR-ESTIMATE 2026 (www.oregon.gov/dor/forms/FormsPubs/publication-or-estimate_101-026_2026.pdf), "Estimated Oregon indexed figures for tax year 2026", read 2026-11-21';
const PROVISIONAL_2026 = 'Oregon has not published the 2026 Form OR-40 or its instructions as of 2026-11-21; the department\'s 2026 estimated-tax publication gives only estimated indexed figures, and amounts it does not list are carried from 2025, so the record is marked provisional until the 2026 instructions are published';

const brackets2025 = { S: [{ overCents: 0, rateBp: 475 }, { overCents: 440000, rateBp: 675 }, { overCents: 1110000, rateBp: 875 }, { overCents: 12500000, rateBp: 990 }], J: [{ overCents: 0, rateBp: 475 }, { overCents: 880000, rateBp: 675 }, { overCents: 2220000, rateBp: 875 }, { overCents: 25000000, rateBp: 990 }] };
const brackets2026 = { S: [{ overCents: 0, rateBp: 475 }, { overCents: 455000, rateBp: 675 }, { overCents: 1140000, rateBp: 875 }, { overCents: 12500000, rateBp: 990 }], J: [{ overCents: 0, rateBp: 475 }, { overCents: 910000, rateBp: 675 }, { overCents: 2280000, rateBp: 875 }, { overCents: 25000000, rateBp: 990 }] };
const table = { tableBelow: 50000, tableBands: [{ from: 0, width: 20 }, { from: 20, width: 30 }, { from: 50, width: 50 }, { from: 100, width: 100 }] };

const federalTax2025 = { maximum: { mfs: 4250, other: 8500 }, phaseOut: { single: [{ atLeast: 125000, amount: 6800 }, { atLeast: 130000, amount: 5100 }, { atLeast: 135000, amount: 3400 }, { atLeast: 140000, amount: 1700 }, { atLeast: 145000, amount: 0 }], mfs: [{ atLeast: 125000, amount: 3400 }, { atLeast: 130000, amount: 2550 }, { atLeast: 135000, amount: 1700 }, { atLeast: 140000, amount: 850 }, { atLeast: 145000, amount: 0 }], joint: [{ atLeast: 250000, amount: 6800 }, { atLeast: 260000, amount: 5100 }, { atLeast: 270000, amount: 3400 }, { atLeast: 280000, amount: 1700 }, { atLeast: 290000, amount: 0 }] } };
const federalTax2026 = { maximum: { mfs: 4375, other: 8750 }, phaseOut: { single: [{ atLeast: 125000, amount: 7000 }, { atLeast: 130000, amount: 5250 }, { atLeast: 135000, amount: 3500 }, { atLeast: 140000, amount: 1750 }, { atLeast: 145000, amount: 0 }], mfs: [{ atLeast: 125000, amount: 3500 }, { atLeast: 130000, amount: 2625 }, { atLeast: 135000, amount: 1750 }, { atLeast: 140000, amount: 875 }, { atLeast: 145000, amount: 0 }], joint: [{ atLeast: 250000, amount: 7000 }, { atLeast: 260000, amount: 5250 }, { atLeast: 270000, amount: 3500 }, { atLeast: 280000, amount: 1750 }, { atLeast: 290000, amount: 0 }] } };

const deductions2025 = { standard: { single: 2835, mfs: 2835, hoh: 4560, mfj: 5670, qss: 5670 }, ageOrBlind: { single: 1200, hoh: 1200, other: 1000 }, dependentFiler: { minimum: 1350, earnedPlus: 450 }, medicalFloorBasisPoints: 750, saltLimit: { mfs: 20000, other: 40000 } };
const credits2025 = { exemptionCredit: 256, exemptionAgiLimit: { single: 100000, mfs: 100000, other: 200000 }, specialExemptionAgiLimit: 100000, politicalMaximum: { mfj: 100, other: 50 }, politicalAgiLimit: { mfj: 150000, other: 75000 }, eitcBasisPoints: 900, eitcYoungChildBasisPoints: 1200, eitcYoungChildUnderAge: 3, kids: { perChild: 1050, maxChildren: 5, underAge: 6, phaseStart: 26550, phaseRange: 5000, lossAllowance: 20000 }, retirement: { age: 62, householdLimit: { mfj: 45000, other: 22500 }, socialSecurityLimit: { mfj: 15000, other: 7500 }, base: { mfj: 15000, other: 7500 }, householdBase: { mfj: 30000, other: 15000 }, basisPoints: 900 }, otherStateExcluded: ['AZ', 'CA', 'IN', 'VA'], kickerPerHundredThousand: 9863 };

export const RULES = [
  {
    id: 'us.state-return.or.income-tax',
    value: { brackets: brackets2025, ...table },
    basis: 'tax_table_below_50000_at_the_midpoint_of_each_band_with_each_bracket_rounded_and_rate_charts_at_50000_or_more',
    ...year(2025),
    act: 'Oregon Revised Statutes chapter 316',
    section: '316.037',
    source: `${OR40}: 2025 tax tables (Column S and Column J, bands of $20/$30/$50 then $100 below $50,000) and 2025 Tax rate charts (Chart S: $209 plus 6.75% over $4,400, $661 plus 8.75% over $11,100, $10,627 plus 9.9% over $125,000; Chart J: $418 plus 6.75% over $8,800, $1,323 plus 8.75% over $22,200, $21,256 plus 9.9% over $250,000); ${OR40NP} prints the same charts`,
    attestations: []
  },
  {
    id: 'us.state-return.or.income-tax',
    value: { brackets: brackets2026, ...table, provisional: true },
    basis: 'tax_table_below_50000_at_the_midpoint_of_each_band_with_each_bracket_rounded_and_rate_charts_at_50000_or_more',
    ...year(2026),
    act: 'Oregon Revised Statutes chapter 316',
    section: '316.037',
    source: `${EST_2026}: Chart S 4.75% to $4,550, $216 plus 6.75% to $11,400, $678 plus 8.75% to $125,000, $10,618 plus 9.9% above; Chart J 4.75% to $9,100, $432 plus 6.75% to $22,800, $1,357 plus 8.75% to $250,000, $21,237 plus 9.9% above. ${PROVISIONAL_2026}`,
    attestations: []
  },
  {
    id: 'us.state-return.or.federal-tax-subtraction',
    value: federalTax2025,
    basis: 'federal_income_tax_after_credits_other_than_eitc_limited_to_8500_and_reduced_by_federal_agi',
    ...year(2025),
    act: 'Oregon Revised Statutes chapter 316',
    section: '316.680(1)(b); 316.685',
    source: `${OR40}: Federal tax liability subtraction worksheet (Form 1040 line 22 minus Schedule 2 line 1a, plus Schedule 2 lines 8, 16 and 17, minus Form 1040 lines 29 and 30 and Form 8962 line 24) and Table 4 (single and married filing separately $8,500 / $4,250 below $125,000, then $6,800 / $3,400, $5,100 / $2,550, $3,400 / $1,700, $1,700 / $850 for each $5,000 to $145,000 and 0 above; joint, head of household and qualifying surviving spouse $8,500 below $250,000, then $6,800, $5,100, $3,400, $1,700 for each $10,000 to $290,000 and 0 above)`,
    attestations: []
  },
  {
    id: 'us.state-return.or.federal-tax-subtraction',
    value: { ...federalTax2026, provisional: true },
    basis: 'federal_income_tax_after_credits_other_than_eitc_limited_to_8750_and_reduced_by_federal_agi',
    ...year(2026),
    act: 'Oregon Revised Statutes chapter 316',
    section: '316.680(1)(b); 316.685',
    source: `${EST_2026}: "Federal tax subtraction: $0 to $8,750". The married filing separately limit ($4,375, half the joint limit as in 2025) and the phase-out steps (the same AGI rows reducing the limit by one fifth each, as in 2025 Table 4) are not published for 2026. ${PROVISIONAL_2026}`,
    attestations: []
  },
  {
    id: 'us.state-return.or.deductions',
    value: deductions2025,
    basis: 'oregon_standard_deduction_with_age_or_blind_additions_dependent_filer_limit_and_schedule_or_a_limits',
    ...year(2025),
    act: 'Oregon Revised Statutes chapter 316',
    section: '316.695; 316.716',
    source: `${OR40}: standard deductions single $2,835, married filing jointly $5,670, married filing separately $2,835 (or $0), head of household $4,560, qualifying surviving spouse $5,670; age 65 or blind "$1,200 if single or head of household" and "$1,000 for all other filers"; dependents "The larger of $1,350, or your earned income plus $450"; ${ORA}: medical over 7.5% of federal AGI and income and property taxes "Don't enter more than $40,000 ($20,000 if married filing separately)", no Oregon income tax or sales tax`,
    attestations: []
  },
  {
    id: 'us.state-return.or.deductions',
    value: { ...deductions2025, standard: { single: 2900, mfs: 2900, hoh: 4650, mfj: 5800, qss: 5800 }, provisional: true },
    basis: 'oregon_standard_deduction_with_age_or_blind_additions_dependent_filer_limit_and_schedule_or_a_limits',
    ...year(2026),
    act: 'Oregon Revised Statutes chapter 316',
    section: '316.695; 316.716',
    source: `${EST_2026}: "Standard deduction: Single or married filing separately: $2,900. Head of household: $4,650. Married filing jointly or Qualifying surviving spouse: $5,800". The age or blind additions, the dependent filer amounts and the Schedule OR-A limits are carried from 2025. ${PROVISIONAL_2026}`,
    attestations: []
  },
  {
    id: 'us.state-return.or.credits',
    value: credits2025,
    basis: 'exemption_credit_political_contribution_credit_retirement_income_credit_other_state_credit_eitc_kids_credit_and_kicker',
    ...year(2025),
    act: 'Oregon Revised Statutes chapters 291, 315 and 316',
    section: '316.085; 316.102; 316.157; 315.266; 315.273; 316.082; 291.349',
    source: `${OR40}: exemption credit $256 with no credit above federal AGI of $100,000 (single, married filing separately) or $200,000 (others) and severe-disability and disabled-child exemptions only to $100,000; political contribution credit "up to $50 ($100 if you're filing a joint return)" if federal AGI isn't more than "$75,000 ($150,000 if you're filing a joint return)"; earned income credit 9 percent, or 12 percent if the youngest dependent is younger than 3; Oregon Kids Credit "$1,050 per qualifying dependent, for up to five dependents", qualifying income $26,550 or less for the full credit, reduced by (income minus $26,550) / $5,000 rounded to two places, none at $31,550 or more, losses above $20,000 added back; kicker "9.863 percent of your 2024 total Oregon personal income tax liability"; ${OR17}: household income below $22,500 ($45,000 joint), Social Security below $7,500 ($15,000 joint), $7,500 ($15,000) less benefits less household income over $15,000 ($30,000), credit 9%; ${OR40NP}: credit for income taxes paid to another state (code 802), not for states that give residents of Oregon the credit (Arizona, California, Indiana, Virginia)`,
    attestations: []
  },
  {
    id: 'us.state-return.or.credits',
    value: { ...credits2025, exemptionCredit: 260, kickerPerHundredThousand: 0, provisional: true },
    basis: 'exemption_credit_political_contribution_credit_retirement_income_credit_other_state_credit_eitc_kids_credit_and_no_kicker_in_an_even_year',
    ...year(2026),
    act: 'Oregon Revised Statutes chapters 291, 315 and 316',
    section: '316.085; 316.102; 316.157; 315.266; 315.273; 316.082; 291.349',
    source: `${EST_2026}: "Personal exemption credit: $260". The kicker is certified each biennium and claimed on the return for the odd year that ends it (ORS 291.349; the 2025 kicker was claimed on 2025 returns), so there is no kicker on 2026 returns. The Kids Credit amounts and income limits, the political and retirement credit limits and the EITC percentages are carried from 2025. ${PROVISIONAL_2026}`,
    attestations: []
  }
];
