const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });

const PACKET_2025 = 'Kentucky Department of Revenue, 2025 Kentucky Individual Income Tax Forms, Instructions for Form 740, 42A740(PKT) (10-25) (revenue.ky.gov/Forms/740%20Packet%20Instructions.pdf), read 2026-11-21';
const FORM_2025 = 'Kentucky Department of Revenue, 2025 Form 740 42A740 (10-25) and 2025 Schedule ITC 42A740ITC (10-25), as mirrored by NBER at taxsim.nber.org/historical_state_tax_forms/KY/2025/, read 2026-11-21';
const NP_2025 = 'Kentucky Department of Revenue, Form 740-NP and instructions (revenue.ky.gov/Forms/740-NP%20instructions%20packet%20(2025).pdf, which served the 2024 edition 42A740-NP(I) (10-24) on 2026-11-21, and revenue.ky.gov/Forms/740-NP.pdf), read 2026-11-21 for the line structure: line 7 Kentucky percentage, line 10 standard deduction not prorated, line 12 itemized deductions times line 7, line 18 personal tax credits times line 7';
const NOT_PUBLISHED_2026 = 'Kentucky has not published the 2026 Form 740, Schedule ITC or the 2026 family size threshold amounts as of 2026-11-21; the 2025 figures are carried until it does, so the record is marked provisional';

const FAMILY_SIZE_2025 = {
  1: [{ notOver: 15650, percent: 100 }, { notOver: 16276, percent: 90 }, { notOver: 16902, percent: 80 }, { notOver: 17528, percent: 70 }, { notOver: 18154, percent: 60 }, { notOver: 18780, percent: 50 }, { notOver: 19406, percent: 40 }, { notOver: 19876, percent: 30 }, { notOver: 20345, percent: 20 }, { notOver: 20815, percent: 10 }],
  2: [{ notOver: 21150, percent: 100 }, { notOver: 21996, percent: 90 }, { notOver: 22842, percent: 80 }, { notOver: 23688, percent: 70 }, { notOver: 24534, percent: 60 }, { notOver: 25380, percent: 50 }, { notOver: 26226, percent: 40 }, { notOver: 26861, percent: 30 }, { notOver: 27495, percent: 20 }, { notOver: 28130, percent: 10 }],
  3: [{ notOver: 26650, percent: 100 }, { notOver: 27716, percent: 90 }, { notOver: 28782, percent: 80 }, { notOver: 29848, percent: 70 }, { notOver: 30914, percent: 60 }, { notOver: 31980, percent: 50 }, { notOver: 33046, percent: 40 }, { notOver: 33846, percent: 30 }, { notOver: 34645, percent: 20 }, { notOver: 35445, percent: 10 }],
  4: [{ notOver: 32150, percent: 100 }, { notOver: 33436, percent: 90 }, { notOver: 34722, percent: 80 }, { notOver: 36008, percent: 70 }, { notOver: 37294, percent: 60 }, { notOver: 38580, percent: 50 }, { notOver: 39866, percent: 40 }, { notOver: 40831, percent: 30 }, { notOver: 41795, percent: 20 }, { notOver: 42760, percent: 10 }],
};
const CREDITS = { personalAge65: 40, personalBlind: 40, personalNationalGuard: 20, personalMaximumPerPerson: 100, childCareBasisPoints: 2000, familySizeTable: FAMILY_SIZE_2025, familySizeMaximum: 4 };

export const RULES = [
  {
    id: 'us.state-return.ky.income-tax',
    value: { rateBasisPoints: 400, standardDeduction: 3270 },
    basis: 'flat_rate_on_kentucky_taxable_income_after_the_standard_or_itemized_deduction',
    ...year(2025),
    act: 'Kentucky Revised Statutes',
    section: 'KRS 141.020(2); KRS 141.081',
    source: `${PACKET_2025}, What's New: "For 2025, the standard deduction is $3,270" and "For 2025, the tax rate for individual income tax is 4%"; ${FORM_2025}: Form 740 line 12 "Multiply line 11 by 4% (.04)"`,
    attestations: []
  },
  {
    id: 'us.state-return.ky.income-tax',
    value: { rateBasisPoints: 350, standardDeduction: 3360 },
    basis: 'flat_rate_on_kentucky_taxable_income_after_the_standard_or_itemized_deduction',
    ...year(2026),
    act: 'Kentucky Revised Statutes as amended by 2025 Regular Session House Bill 1',
    section: 'KRS 141.020(2); KRS 141.081(2)(a)',
    source: 'Kentucky Department of Revenue, 2026 Withholding Formula (revenue.ky.gov/Forms/2026%20Withholding%20Formula.pdf): "2026 Kentucky Tax Rate: 3.5% of taxable income" and "2026 Kentucky Standard Deduction: $3,360"; Kentucky DOR news release of September 4, 2025 "Kentucky DOR Announces 2026 Standard Deduction" (the standard deduction for 2026 is $3,360, under KRS 141.081), read 2026-11-21. The 3.5% rate is the statutory reduction enacted by 2025 HB 1',
    attestations: []
  },
  {
    id: 'us.state-return.ky.modifications',
    value: { pensionExclusion: 31110 },
    basis: 'schedule_m_pension_income_exclusion_per_person_up_to_the_limit_social_security_and_us_obligation_interest_subtracted',
    ...year(2025),
    act: 'Kentucky Revised Statutes',
    section: 'KRS 141.019',
    source: `${PACKET_2025}, Schedule M line 9: "The 2025 exclusion amount is 100 percent of taxable retirement benefits or $31,110, whichever is less", computed for each taxpayer separately; line 7 state refund, line 8 U.S. government interest, line 10 Social Security, line 1 other states' bond interest added`,
    attestations: []
  },
  {
    id: 'us.state-return.ky.modifications',
    value: { pensionExclusion: 31110, provisional: true },
    basis: 'schedule_m_pension_income_exclusion_per_person_up_to_the_limit_social_security_and_us_obligation_interest_subtracted',
    ...year(2026),
    act: 'Kentucky Revised Statutes',
    section: 'KRS 141.019',
    source: NOT_PUBLISHED_2026,
    attestations: []
  },
  {
    id: 'us.state-return.ky.credits',
    value: CREDITS,
    basis: 'schedule_itc_personal_tax_credits_family_size_tax_credit_table_and_child_and_dependent_care_credit_20_percent_of_federal',
    ...year(2025),
    act: 'Kentucky Revised Statutes',
    section: 'KRS 141.020(3); KRS 141.066; KRS 141.067',
    source: `${FORM_2025}: Schedule ITC Section B "enter 40" for 65 or over and for blind, "enter 20" for Kentucky National Guard, "Not to exceed 100" per person; Section C Family Size Tax Credit Table for tax year 2025 (thresholds $15,650, $21,150, $26,650, $32,150, 100 percent at or below, then 90 down to 10 percent); Form 740 line 24 "federal Form 2441, line 11 x 20% (.20)"; ${NP_2025}`,
    attestations: []
  },
  {
    id: 'us.state-return.ky.credits',
    value: { ...CREDITS, provisional: true },
    basis: 'schedule_itc_personal_tax_credits_family_size_tax_credit_table_and_child_and_dependent_care_credit_20_percent_of_federal',
    ...year(2026),
    act: 'Kentucky Revised Statutes',
    section: 'KRS 141.020(3); KRS 141.066; KRS 141.067',
    source: NOT_PUBLISHED_2026,
    attestations: []
  }
];
