const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const INSTR_2025 = 'Utah State Tax Commission, 2025 TC-40 Forms and Instructions (tax.utah.gov/forms/current/tc-40inst.pdf) and 2025 form TC-40 (tax.utah.gov/forms/current/tc-40.pdf), read 2026-11-21';
const PROVISIONAL_2026 = 'Utah has not published the 2026 TC-40 or the 2026 inflation-indexed personal exemption, taxpayer tax credit phase-out base amounts or credit income limits as of 2026-11-21 (Publication 14, Withholding Tax Guide, effective June 1, 2026, files.tax.utah.gov/tax/forms/pubs/pub-14.pdf, read 2026-11-21, gives only payroll-period amounts); the 2025 figures are carried and the record is marked provisional until the Commission publishes the 2026 instructions';

export const RULES = [
  {
    id: 'us.state-return.ut.income-tax',
    value: { rateBasisPoints: 450 },
    basis: 'flat_rate_on_utah_taxable_income',
    ...year(2025),
    act: 'Utah Code Title 59 Chapter 10 (Individual Income Tax Act), as amended by H.B. 106 (2025)',
    section: '59-10-104',
    source: `${INSTR_2025}: What's New "The 2025 Utah Legislature passed HB 106, lowering the income tax rate from 4.55 percent to 4.5 percent"; TC-40 line 10 "multiply line 9 by 4.5% (.045)"`,
    attestations: []
  },
  {
    id: 'us.state-return.ut.income-tax',
    value: { rateBasisPoints: 445 },
    basis: 'flat_rate_on_utah_taxable_income',
    ...year(2026),
    act: 'Utah S.B. 60 (2026 General Session), Income Tax Rate Amendments, retrospective to taxable years beginning on or after January 1, 2026',
    section: '59-10-104(2)(b)',
    source: 'Utah Legislature, S.B. 60 enrolled copy (le.utah.gov/Session/2026/bills/enrolled/SB0060.pdf), section 3 amending 59-10-104(2)(b) to "4.45%" and section 5 retrospective operation for taxable years beginning on or after January 1, 2026, read 2026-11-21; Utah Publication 14 effective June 1, 2026 uses .0445 (4.45%), read 2026-11-21',
    attestations: []
  },
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ut.taxpayer-credit',
    value: { personalExemption: 2111, creditBasisPoints: 600, phaseOutBasisPoints: 130, phaseOutBase: { single: 18213, mfs: 18213, hoh: 27320, mfj: 36426, qss: 36426 }, exemptStandardDeduction: { single: 15750, mfs: 15750, hoh: 23625, mfj: 31500, qss: 31500 }, ...(y === 2026 ? { provisional: true } : {}) },
    basis: 'six_percent_of_utah_personal_exemptions_plus_federal_deductions_less_state_income_tax_deducted_reduced_by_1_3_percent_of_utah_taxable_income_above_the_base_phase_out_amount_qualified_exempt_taxpayer_when_federal_agi_does_not_exceed_the_basic_standard_deduction_plus_the_senior_deduction',
    ...year(y),
    act: 'Utah Code Title 59 Chapter 10',
    section: '59-10-1018; 59-10-104.1',
    source: y === 2025 ? `${INSTR_2025}: line 11 "The Utah personal exemption is $2,111 per dependent", line 16 "Multiply line 15 by 6 percent (.06)", line 17 base phase-out amounts $18,213 single and married filing separately, $36,426 married filing jointly and qualifying surviving spouse, $27,320 head of household, line 19 "Multiply line 18 by 1.3 percent (.013)", Qualified Exempt Taxpayer Worksheet standard deductions $15,750, $23,625, $31,500` : PROVISIONAL_2026,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ut.credits',
    value: {
      retirement: { perPerson: 450, bornOnOrBefore: '1952-12-31', base: { single: 25000, mfs: 16000, hoh: 32000, mfj: 32000, qss: 32000 }, phaseBasisPoints: 250 },
      socialSecurity: { rateBasisPoints: 450, base: { single: 54000, mfs: 45000, hoh: 90000, mfj: 90000, qss: 90000 }, phaseBasisPoints: 250 },
      eitcBasisPoints: 2000,
      childTaxCredit: { perChild: 1000, maxAge: 5, base: { single: 43000, mfs: 27000, hoh: 43000, mfj: 54000, qss: 54000 }, phaseBasisPoints: 1000 },
      ...(y === 2026 ? { provisional: true } : {})
    },
    basis: 'utah_apportionable_nonrefundable_credits_retirement_credit_450_per_person_born_on_or_before_1952_social_security_credit_4_5_percent_of_taxable_benefits_both_reduced_2_5_cents_per_dollar_above_the_base_eitc_20_percent_of_federal_limited_to_utah_w2_wages_child_tax_credit_1000_per_child_aged_5_or_under_reduced_10_cents_per_dollar_above_the_base',
    ...year(y),
    act: 'Utah Code Title 59 Chapter 10',
    section: '59-10-1019; 59-10-1042; 59-10-1044; 59-10-1047',
    source: y === 2025 ? `${INSTR_2025}: TC-40A Part 3 Retirement Credit Worksheet ($450 each, born on or before Dec. 31, 1952, base $16,000 MFS, $32,000 joint, $25,000 single, $32,000 QSS or head of household, line 9 "Multiply line 8 by 0.025"); Social Security Benefits Credit Worksheet (line 4 "Multiply line 3 by 0.045", line 10 $45,000 MFS, $90,000 joint, $54,000 single, $90,000 QSS or head of household, line 12 "Multiply line 11 by 0.025"); Earned Income Tax Credit "equal to 20 percent of your federal earned income tax credit", lesser of that or total Utah W-2 box 16 wages; Child Tax Credit Worksheet ($1,000 per child who qualifies under IRC 24 and was 5 and younger, base $27,000 MFS, $54,000 joint, $43,000 single or head of household, $54,000 QSS, "Multiply line 9 by 0.10")` : PROVISIONAL_2026,
    attestations: []
  }))
];
