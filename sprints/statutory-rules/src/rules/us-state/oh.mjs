const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const BOOKLET_2025 = 'Ohio Department of Taxation, 2025 Ohio IT 1040 / SD 100 Instructions (dam.assets.ohio.gov/image/upload/tax.ohio.gov/forms/ohio_individual/individual/2025/it1040-booklet.pdf) and the 2025 IT 1040, Schedule of Adjustments, Schedule of Business Income, Schedule of Credits, IT NRC and IT RC (1040-bundle-original-fi.pdf, itnrc.pdf, itrc.pdf in the same folder), read 2026-11-21';
const DRAFT_2026 = 'Ohio Department of Taxation, 2026 Ohio IT 1040 / SD 100 Instructions, draft marked subject to change and stated accurate as of November 10, 2026 (dam.assets.ohio.gov/image/upload/tax.ohio.gov/forms/DRAFTS/2026/it1040-booklet-draft.pdf), read 2026-11-21';
const ORC_502 = 'Ohio Revised Code 5747.02 as amended by Am. Sub. H.B. 96 of the 136th General Assembly, effective September 30, 2025 (codes.ohio.gov/ohio-revised-code/section-5747.02), read 2026-11-21';
const ORC_5025 = 'Ohio Revised Code 5747.025 as amended by Am. Sub. H.B. 96 of the 136th General Assembly (codes.ohio.gov/ohio-revised-code/section-5747.025), read 2026-11-21';
const ORC_CREDITS = 'Ohio Revised Code 5747.05(E), 5747.022, 5747.054, 5747.055 and 5747.71 (codes.ohio.gov/ohio-revised-code), read 2026-11-21';

export const RULES = [
  {
    id: 'us.state-return.oh.income-tax',
    value: { nonbusinessSchedule: [{ overCents: 0, baseCents: 0, rateBp: 0 }, { overCents: 2605000, baseCents: 34200, rateBp: 275 }, { overCents: 10000000, baseCents: 239432, rateBp: 312.5 }], businessRateBp: 300, businessDeductionCap: { mfs: 125000, other: 250000 } },
    basis: 'nonbusiness_income_after_exemptions_taxed_by_the_schedule_base_plus_rate_over_the_bracket_floor_business_income_after_the_deduction_taxed_at_a_flat_rate',
    ...year(2025),
    act: 'Ohio Revised Code Chapter 5747, as amended by Am. Sub. H.B. 96 (136th General Assembly)',
    section: '5747.02(A)(3)(b) and (A)(4); 5747.01(A)(28)',
    source: `${ORC_502}: "(b) For taxable years beginning in 2025: More than $26,050 but not more than $100,000 $342.00 plus 2.75% of the amount in excess of $26,050; More than $100,000 $2,394.32 plus 3.125%", no tax at or below $26,050, business income taxed at three per cent; ${BOOKLET_2025}, 2025 Ohio Income Tax Brackets (page 18) and Schedule of Business Income lines 12 and 16 ($250,000, $125,000 married filing separately, 3%)`,
    attestations: []
  },
  {
    id: 'us.state-return.oh.income-tax',
    value: { nonbusinessSchedule: [{ overCents: 0, baseCents: 0, rateBp: 0 }, { overCents: 2605000, baseCents: 33200, rateBp: 275 }], businessRateBp: 300, businessDeductionCap: { mfs: 125000, other: 250000 } },
    basis: 'flat_rate_on_nonbusiness_income_after_exemptions_above_the_zero_bracket_business_income_after_the_deduction_taxed_at_a_flat_rate',
    ...year(2026),
    act: 'Ohio Revised Code Chapter 5747, as amended by Am. Sub. H.B. 96 (136th General Assembly)',
    section: '5747.02(A)(3)(c) and (A)(4); 5747.01(A)(28)',
    source: `${ORC_502}: "(c) For taxable years beginning in 2026 and thereafter, $332.00 plus 2.75% of the amount in excess of $26,050"; enacted by statute, so not provisional. ${DRAFT_2026}, 2026 Ohio Income Tax Brackets (page 22) shows the same $26,050 floor and $332.00 base`,
    attestations: []
  },
  {
    id: 'us.state-return.oh.exemptions',
    value: { tiers: [{ magiUpTo: 40000, amount: 2400 }, { magiUpTo: 80000, amount: 2150 }, { magiUpTo: null, amount: 1900 }], noExemptionFromMagi: 750000 },
    basis: 'personal_and_dependent_exemption_by_modified_adjusted_gross_income_with_none_at_or_above_the_limit',
    ...year(2025),
    act: 'Ohio Revised Code Chapter 5747',
    section: '5747.025',
    source: `${BOOKLET_2025}, Line 4 – Personal and Dependent Exemptions: $2,400 for MAGI of $40,000 or less, $2,150 for $40,001 – $80,000, $1,900 for $80,001 – $749,999, $0 for $750,000 or greater; ${ORC_5025} ("less than seven hundred fifty thousand dollars for taxable years beginning in 2025")`,
    attestations: []
  },
  {
    id: 'us.state-return.oh.exemptions',
    value: { tiers: [{ magiUpTo: 40000, amount: 2400 }, { magiUpTo: 80000, amount: 2150 }, { magiUpTo: null, amount: 1900 }], noExemptionFromMagi: 500000, provisional: true },
    basis: 'personal_and_dependent_exemption_by_modified_adjusted_gross_income_with_none_at_or_above_the_limit',
    ...year(2026),
    act: 'Ohio Revised Code Chapter 5747, as amended by Am. Sub. H.B. 96 (136th General Assembly)',
    section: '5747.025',
    source: `${ORC_5025}: no exemption unless MAGI is "less than ... five hundred thousand dollars for taxable years beginning in 2026" (statutory, final). The amounts $2,400 / $2,150 / $1,900 are from ${DRAFT_2026}, Line 4 table; the statute indexes them each August and the Department has published them only in the draft booklet, so the record stays provisional until the final 2026 instructions are issued`,
    attestations: []
  },
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.oh.adjustments',
    value: { contribution529PerBeneficiary: 4000, educatorExpensePerEducator: 300, medicalExpenseFloorBasisPoints: 750 },
    basis: 'schedule_of_adjustments_limits_529_contributions_per_beneficiary_educator_expenses_per_educator_and_the_medical_expense_floor_as_a_share_of_federal_agi',
    ...year(y),
    act: 'Ohio Revised Code Chapter 5747',
    section: '5747.01(A)(9), (A)(10) and (A)(31); 5747.70',
    source: y === 2025
      ? `${BOOKLET_2025}, Schedule of Adjustments Line 37 ("limited to $4,000 per beneficiary per year"), Line 39 ("limited to $300 per qualifying Ohio educator") and the Unreimbursed Medical Care Expenses Worksheet line 7 ("Line 6 times 7.5%")`
      : `${DRAFT_2026}, Schedule of Adjustments Line 40 ($4,000 per beneficiary), Line 42 ($300 per qualifying Ohio educator) and Line 47 (medical care "in excess of 7.5%" of federal AGI); the amounts are fixed in R.C. 5747.01 and 5747.70, not indexed`,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.oh.credits',
    value: {
      retirementIncomeCredit: [{ over: 0, credit: 0 }, { over: 500, credit: 25 }, { over: 1500, credit: 50 }, { over: 3000, credit: 80 }, { over: 5000, credit: 130 }, { over: 8000, credit: 200 }],
      retirementAndSeniorLimitMagiLessExemptions: 100000,
      seniorCredit: 50,
      seniorAge: 65,
      childCareMagiLimit: 40000,
      childCareFullCreditMagiBelow: 20000,
      childCareBasisPoints: 2500,
      displacedWorkerBasisPoints: 5000,
      displacedWorkerMaximum: 500,
      campaignContribution: y === 2025 ? { joint: 100, other: 50 } : null,
      exemptionCreditPerExemption: 20,
      exemptionCreditMagiLessExemptionsBelow: 30000,
      jointFiling: { minimumQualifyingIncomeEach: 500, magiBelow: y === 2025 ? 750000 : 500000, maximum: 650, table: [{ upTo: 25000, basisPoints: 2000 }, { upTo: 50000, basisPoints: 1500 }, { upTo: 75000, basisPoints: 1000 }, { upTo: null, basisPoints: 500 }] },
      eitcBasisPoints: 3000,
      homeSchoolPerStudent: 250,
      scholarshipDonationPerPerson: 750,
      nonpublicTuition: { federalAgiBelow: 50000, lower: 1000, higher: 1500 }
    },
    basis: 'ohio_schedule_of_credits_amounts_retirement_senior_child_care_displaced_worker_campaign_exemption_joint_filing_earned_income_home_school_scholarship_and_nonpublic_tuition',
    ...year(y),
    act: y === 2025 ? 'Ohio Revised Code Chapter 5747' : 'Ohio Revised Code Chapter 5747, as amended by Am. Sub. H.B. 96 (136th General Assembly)',
    section: '5747.022; 5747.05(E); 5747.054; 5747.055(B) and (F); 5747.27; 5747.29 (repealed for 2026); 5747.71; 5747.72; 5747.73; 5747.75',
    source: y === 2025
      ? `${BOOKLET_2025}, Schedule of Credits instructions lines 2, 4, 6, 7, 8, 9, 12, 13, 14, 15 and 16 and Table 2 (page 44) and the child care worksheet (page 45); ${ORC_CREDITS}`
      : `${ORC_CREDITS}: amounts fixed by statute; the joint filing credit requires MAGI "less than five hundred thousand dollars for taxable years beginning in 2026" and the campaign contribution credit (former 5747.29) was repealed by H.B. 96. ${DRAFT_2026}, Schedule of Credits instructions (Line 8 Exemption Credit, Line 11 Joint Filing Credit, Line 12 Earned Income Credit; "the campaign contribution credit is no longer available beginning in tax year 2026")`,
    attestations: []
  }))
];
