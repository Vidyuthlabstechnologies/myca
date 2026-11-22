const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const BOOKLET_2025 = 'Kansas Department of Revenue, 2025 Kansas Individual Income Tax booklet (ksrevenue.gov/pdf/ip25.pdf) and 2025 Form K-40 (ksrevenue.gov/pdf/k-4025.pdf), read 2026-11-21';
const STATUTE_2026 = 'The 2026 Kansas Individual Income Tax booklet is not yet published (ksrevenue.gov/pdf/ip26.pdf not found, read 2026-11-21); the amounts are fixed in statute without inflation indexing, so the 2025 statutory amounts apply to 2026';
const RATE_NOTICE_2026 = 'Kansas Department of Revenue Notice 25-06, Decreases of Income and Privilege Tax Rates - Contingent on Revenue, October 2, 2025 (ksrevenue.gov/taxnotices/notice25-06.pdf): "there will be no rate reduction for tax year 2026", read 2026-11-21';
const LEG_2026 = 'Kansas Department of Revenue, 2026 Kansas Tax Legislation and Policy Changes (ksrevenue.gov/pdf/2026LegChanges.pdf), read 2026-11-21: no change to the individual rates, standard deduction, exemptions, earned income or child and dependent care credits for 2026';

export const RULES = [
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ks.income-tax',
    value: {
      brackets: {
        other: [{ overCents: 0, rateBp: 520 }, { overCents: 2300000, rateBp: 558 }],
        mfj: [{ overCents: 0, rateBp: 520 }, { overCents: 4600000, rateBp: 558 }]
      },
      tableLimit: 100000,
      tableZeroThrough: 25,
      tableFirstRowTo: 50,
      tableRowWidth: 50,
      overTable: { rateBp: 558, subtract: { other: 87, mfj: 175 } }
    },
    basis: 'two_bracket_tax_5_2_and_5_58_percent_tax_table_at_row_midpoint_up_to_100000_then_tax_computation_schedule',
    ...year(y),
    act: 'Kansas Income Tax Act, K.S.A. 79-32,101 et seq., as amended by 2024 Special Session S.B. 1',
    section: '79-32,110(a); 79-32,110c',
    source: y === 2025
      ? `${BOOKLET_2025}: Tax Rate Schedules and Tax Tables (page 27 onward: $0-$25 tax 0, $26-$50, then $50 rows), line 8 "If line 7 is more than $100,000, you will need to use the Tax Computation Worksheet on page 34", Tax Computation Worksheet single, head of household and married filing separate "multiply by 5.58% ... subtract $87", married filing joint "subtract $175", rates 5.20% up to $23,000 ($46,000 joint) and 5.58% above`
      : `${RATE_NOTICE_2026}; Kansas Department of Revenue Notice 26-11 (October 15, 2026) on the 2027 year, read 2026-11-21; ${LEG_2026}`,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ks.standard-deduction',
    value: {
      base: { single: 3605, mfj: 8240, hoh: 6180, mfs: 4120 },
      perBox: { single: 850, hoh: 850, mfj: 700, mfs: 700 }
    },
    basis: 'kansas_standard_deduction_by_filing_status_plus_an_amount_for_each_65_or_older_or_blind_box_qualifying_surviving_spouse_files_as_head_of_household',
    ...year(y),
    act: 'Kansas Income Tax Act',
    section: '79-32,119',
    source: y === 2025
      ? `${BOOKLET_2025}: Kansas Standard Deduction single $3,605, married filing joint $8,240, head of household $6,180, married filing separate $4,120; Worksheet - Standard Deduction for People 65 or Older and/or Blind single $4,455/$5,305, joint $8,940/$9,640/$10,340/$11,040, separate $4,820/$5,520/$6,220/$6,920, head of household $7,030/$7,880`
      : `${STATUTE_2026}; K.S.A. 79-32,119 (kslegislature.gov, read 2026-11-21) sets the standard deduction and additional amounts without an inflation adjustment; ${LEG_2026}`,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ks.exemptions',
    value: { personal: 9160, joint: 18320, headOfHousehold: 2320, perDependent: 2320, perNewborn: 2320, perStillbirth: 2320, perDisabledVeteran: 2320 },
    basis: 'kansas_exemption_allowance_9160_per_filer_18320_joint_2320_head_of_household_2320_per_dependent_newborn_stillbirth_and_disabled_veteran',
    ...year(y),
    act: 'Kansas Income Tax Act',
    section: '79-32,121',
    source: y === 2025
      ? `${BOOKLET_2025}: Exemptions and Dependents "enter 2 ... and $18,320", single, separate or head of household "$9,160", head of household "additional exemption of $2,320", dependents "Multiply that number by $2,320", "If you are claimed as a dependent by another taxpayer, enter 0 in the number of dependents box"; Additional Exemptions for children born in the tax year, stillborn births and disabled veterans $2,320 each`
      : `${STATUTE_2026}; K.S.A. 79-32,121 (kslegislature.gov, read 2026-11-21); ${LEG_2026}`,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ks.credits',
    value: { eitcBp: 1700, childCareBp: 5000 },
    basis: 'kansas_eitc_17_percent_of_federal_refundable_residents_only_child_and_dependent_care_credit_50_percent_of_federal_residents_only',
    ...year(y),
    act: 'Kansas Income Tax Act',
    section: '79-32,205; 79-32,111c',
    source: y === 2025
      ? `${BOOKLET_2025}: line 14 "Multiply amount of credit allowed on (federal Form 2441) by 50%", available to residents only; line 17 Earned Income Tax Credit Worksheet "Kansas EITC (multiply line 1 by 17%)", residents only, excess over line 16 refundable on line 22`
      : `${STATUTE_2026}; K.S.A. 79-32,205 and 79-32,111c (kslegislature.gov, read 2026-11-21); ${LEG_2026}`,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ks.subtractions',
    value: { college529PerBeneficiary: { other: 3000, mfj: 6000 } },
    basis: 'kansas_529_contribution_subtraction_up_to_3000_per_beneficiary_6000_joint',
    ...year(y),
    act: 'Kansas Income Tax Act',
    section: '79-32,117(c)',
    source: y === 2025
      ? `${BOOKLET_2025}: Schedule S line A16 contributions to a Kansas-sponsored 529 plan or other qualified plan, "up to $3,000 per beneficiary; or $6,000 per beneficiary if your filing status is married filing joint"`
      : `${STATUTE_2026}; K.S.A. 79-32,117(c) (kslegislature.gov, read 2026-11-21); ${LEG_2026}`,
    attestations: []
  }))
];
