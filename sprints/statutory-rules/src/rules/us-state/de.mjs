const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const RES_2025 = 'Delaware Division of Revenue, 2025 Form PIT-RES Instructions (revenuefiles.delaware.gov/2025/PITForms_Instructions/Instructions/PIT-RES_Instructions_2025-01.pdf)';
const NON_2025 = 'Delaware Division of Revenue, 2025 Form PIT-NON Instructions (revenuefiles.delaware.gov/2025/PITForms_Instructions/Instructions/PIT-NON_Instructions_2025-01.pdf)';
const TABLE_2025 = 'Delaware Division of Revenue, 2025 State Income Tax Table and rate schedule (revenuefiles.delaware.gov/2025/TY25_taxtable.pdf)';
const DEVELOPER = 'Delaware Division of Revenue, software developer tax rate changes page (revenue.delaware.gov/software-developer/tax-rate-changes/)';
const CODE = 'Delaware Code Title 30, Chapter 11, Subchapters I and II (delcode.delaware.gov/title30/c011/sc01/index.html and sc02/index.html)';
const READ = 'read 2026-11-21';
const STATUTORY_2026 = `The 2026 amounts are fixed in ${CODE} (rates under section 1102(a)(14) for tax years after 2013; standard deduction, additional standard deduction, personal credits, the pension exclusion amounts set for tax years 2022 through 2026, the 60-and-over exclusion and the EITC percentages are not indexed), ${READ}; the 2026 forms are not yet published but no figure in this record depends on them`;

const BANDS = [
  { overCents: 0, rateBp: 0 }, { overCents: 200000, rateBp: 220 }, { overCents: 500000, rateBp: 390 }, { overCents: 1000000, rateBp: 480 },
  { overCents: 2000000, rateBp: 520 }, { overCents: 2500000, rateBp: 555 }, { overCents: 6000000, rateBp: 660 }
];

export const RULES = [
  {
    id: 'us.state-return.de.itemized',
    value: { medicalFloorBp: 750, taxCap: { other: 40000, mfs: 20000 }, fullCapAgiUpTo: { other: 500000, mfs: 250000 } },
    basis: 'delaware_schedule_a_medical_floor_and_state_and_local_tax_cap_with_the_federal_worksheet_above_the_agi_threshold',
    ...year(2025),
    act: 'Delaware Code Title 30 (Personal Income Tax)',
    section: '1109',
    source: `${RES_2025}, PIT-RSA instructions (Line 3 medical floor 7.5% of federal AGI; Line 5f the smaller of Line 5e or $40,000, $20,000 married filing separately, when federal AGI is at most $500,000, $250,000 married filing separately, otherwise the State and Local Tax Deduction Worksheet) and Form PIT-RSA (revenuefiles.delaware.gov/2025/PITForms_Instructions/PIT-RSA_2025-01_PaperInteractiveIPM.pdf); ${READ}`,
    attestations: []
  },
  {
    id: 'us.state-return.de.itemized',
    value: { medicalFloorBp: 750, taxCap: { other: 40000, mfs: 20000 }, fullCapAgiUpTo: { other: 500000, mfs: 250000 }, provisional: true },
    basis: 'delaware_schedule_a_medical_floor_and_state_and_local_tax_cap_with_the_federal_worksheet_above_the_agi_threshold',
    ...year(2026),
    act: 'Delaware Code Title 30 (Personal Income Tax)',
    section: '1109',
    source: 'The 2026 PIT-RSA is not published as of 2026-11-21; the federal state and local tax cap that Delaware follows rises after 2025, so the 2025 cap and threshold are carried and the record is provisional',
    attestations: []
  },
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.de.income-tax',
    value: { bands: BANDS, tableBelow: 60000, tableRowWidth: 50, tableZeroBelow: 2000, standardDeduction: { other: 3250, mfj: 6500 }, additionalStandard: 2500, personalCredit: 110, seniorCredit: 110, seniorCreditAge: 60 },
    basis: 'graduated_rates_with_the_50_dollar_midpoint_tax_table_below_60000_standard_deduction_additional_standard_deduction_and_110_dollar_personal_credits',
    ...year(y),
    act: 'Delaware Code Title 30 (Personal Income Tax)',
    section: '1102(a)(14); 1108; 1110',
    source: y === 2025
      ? `${RES_2025} (Line 20 standard deduction $3,250 or $6,500 joint, Line 21 $2,500 for each box 65 or over or blind, Line 27a $110 for each exemption on the federal return, Line 27b $110 for each filer 60 or over, Line 24 tax table below $60,000); ${TABLE_2025} (rows of $50, $0 below $2,000; 2.2% to $5,000, 3.9% to $10,000, 4.8% to $20,000, 5.2% to $25,000, 5.55% to $60,000, 6.6% above); ${DEVELOPER} (table tax is the tax on the midpoint of each row); ${READ}`
      : STATUTORY_2026,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.de.exclusions',
    value: { pensionAge: 60, pensionUnder60: 2000, militaryUnder60: 12500, pension60: 12500, seniorExclusionAge: 60, seniorExclusion: { single: { amount: 2000, earnedBelow: 2500, incomeUpTo: 10000 }, joint: { amount: 4000, earnedBelow: 5000, incomeUpTo: 20000 } } },
    basis: 'pension_exclusion_by_age_and_military_status_and_exclusion_for_persons_60_or_over_with_low_earned_income',
    ...year(y),
    act: 'Delaware Code Title 30 (Personal Income Tax)',
    section: '1106(b)',
    source: y === 2025
      ? `${RES_2025}, Line 6 pension exclusion (under 60: the lesser of the pension or $2,000, or $12,500 for a U.S. military pension; 60 or over: the lesser of $12,500 or the pension plus eligible retirement income; code 1 early distributions do not qualify; one exclusion per spouse) and Line 11 worksheet ($2,000, or $4,000 joint when both spouses are 60 or over, earned income below $2,500 or $5,000 combined and Line 10 at most $10,000 or $20,000); ${READ}`
      : STATUTORY_2026,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.de.credits',
    value: { eitcRefundableBp: 450, eitcNonrefundableBp: 2000, childCareBp: 5000, volunteerFirefighter: 1000 },
    basis: 'eitc_refundable_4_5_percent_or_nonrefundable_20_percent_of_federal_child_care_credit_50_percent_of_federal_and_volunteer_firefighter_credit',
    ...year(y),
    act: 'Delaware Code Title 30 (Personal Income Tax)',
    section: '1113; 1114; 1117',
    source: y === 2025
      ? `${RES_2025}: Line 34 ("a refundable credit of 4.5% of the federal earned income credit or a nonrefundable credit of 20% of the federal earned income credit"), Line 31 (50% of the federal child care credit), Line 29 (volunteer firefighter credit of $1,000), Line 32 (non-refundable credits limited to the Line 26 tax); ${NON_2025} (these credits cannot be taken on PIT-NON); ${READ}`
      : STATUTORY_2026,
    attestations: []
  }))
];
