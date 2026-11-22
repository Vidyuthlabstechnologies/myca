const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const IT540_2025 = 'Louisiana Department of Revenue, 2025 Resident Income Tax Return instructions (dam.ldr.la.gov/taxforms/IT540i-WEB-2025-Revised-7-26.pdf) and 2025 Form IT-540-WEB-BC with its worksheets (dam.ldr.la.gov/taxforms/IT540WEB-BC(2025) F.pdf), read 2026-11-21';
const IT540B_2025 = 'Louisiana Department of Revenue, 2025 Nonresident and Part-Year Resident Income Tax Return instructions (dam.ldr.la.gov/taxforms/IT540Bi-2025-Revised-7-26.pdf) and 2025 Form IT-540B-WEB-BC (dam.ldr.la.gov/taxforms/IT540B(2025)WEB-BC F.pdf), read 2026-11-21';
const RIB = 'Louisiana Department of Revenue, Revenue Information Bulletin 25-012, Louisiana Individual Income Tax Reform (Act 11 of the 2024 Third Extraordinary Session), read 2026-11-21';
const ES_2026 = 'Louisiana Department of Revenue, IT-540ESi (2026) Worksheet for Estimating Your 2026 Louisiana Individual Income Tax (dam.ldr.la.gov/taxforms/IT540ESi-2026.pdf), read 2026-11-21';
const NOI_2026 = 'Louisiana Register Vol. 52, No. 6, June 20, 2026, Department of Revenue Notice of Intent amending LAC 61:I.1311, Annual Retirement Income Exemption for Individuals 65 or Older (dam.ldr.la.gov/lawspolicies/NOI-1311.pdf), read 2026-11-21';
const NO_FORM_2026 = 'The 2026 Form IT-540 and instructions are not yet published (read 2026-11-21); these amounts are fixed in La. R.S. without an inflation adjustment, so the 2025 amounts apply';

export const RULES = [
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.la.income-tax',
    value: { rateBp: 300 },
    basis: 'flat_3_percent_of_louisiana_taxable_income',
    ...year(y),
    act: 'Act 11 of the 2024 Third Extraordinary Session of the Louisiana Legislature',
    section: 'La. R.S. 47:32(A)',
    source: y === 2025 ? `${IT540_2025}: line 11 "Multiply Line 10 by .03. Round to the nearest dollar"; ${IT540B_2025}: line 13 "Multiply Line 12 by .03"; ${RIB}` : `${ES_2026}: line 5 "Multiply Line 4 by .03"; ${RIB}`,
    attestations: []
  })),
  {
    id: 'us.state-return.la.standard-deduction',
    value: { single: 12500, mfs: 12500, mfj: 25000, hoh: 25000, qss: 25000 },
    basis: 'louisiana_standard_deduction_by_filing_status_not_prorated_for_nonresidents',
    ...year(2025),
    act: 'Act 11 of the 2024 Third Extraordinary Session',
    section: 'La. R.S. 47:294',
    source: `${IT540_2025}: line 8 "If your filing status is 1 or 3, enter $12,500; 2, 4, or 5, enter $25,000"; ${IT540B_2025}: line 10 the same amounts; ${RIB}`,
    attestations: []
  },
  {
    id: 'us.state-return.la.standard-deduction',
    value: { single: 12875, mfs: 12875, mfj: 25750, hoh: 25750, qss: 25750 },
    basis: 'louisiana_standard_deduction_by_filing_status_inflation_adjusted_from_2026',
    ...year(2026),
    act: 'Act 11 of the 2024 Third Extraordinary Session, annual CPI-U adjustment beginning January 1, 2026',
    section: 'La. R.S. 47:294',
    source: `${ES_2026}: line 3 estimated standard deduction single $12,875, married filing joint $25,750, married filing separate $12,875, head of household $25,750, qualifying surviving spouse $25,750; ${RIB}: first inflation adjustment January 1, 2026`,
    attestations: []
  },
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.la.federal-standard-deduction',
    value: y === 2025 ? { single: 15750, mfs: 15750, mfj: 31500, qss: 31500, hoh: 23625 } : { single: 16100, mfs: 16100, mfj: 32200, qss: 32200, hoh: 24150 },
    basis: 'federal_basic_standard_deduction_subtracted_from_federal_medical_deduction_for_excess_federal_itemized_deductions',
    ...year(y),
    act: 'Act 11 of the 2024 Third Extraordinary Session; Internal Revenue Code section 63(c)',
    section: 'La. R.S. 47:293; 47:294',
    source: y === 2025 ? `${IT540_2025}: line 9C "If you itemized your deductions on your federal return and your filing status is 1 or 3, enter $15,750; 2 or 5, enter $31,500; 4, enter $23,625"; line 9D "Subtract Line 9C from Line 9B"` : `Internal Revenue Service, Rev. Proc. 2025-32, 2026 standard deduction $16,100 single and married filing separately, $32,200 married filing jointly and surviving spouses, $24,150 head of household, read 2026-11-21; line 9C of Form IT-540 uses the federal basic standard deduction (${IT540_2025})`,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.la.exemptions',
    value: { retirement65PerPerson: y === 2025 ? 12000 : 12324, startPerBeneficiary: { other: 2400, mfj: 4800 }, militaryPayMax: 50000 },
    basis: 'louisiana_schedule_e_exempt_income_annual_retirement_income_exemption_for_each_taxpayer_65_or_older_start_contributions_per_beneficiary_military_pay_exclusion',
    ...year(y),
    act: 'Louisiana Revised Statutes Title 47',
    section: 'La. R.S. 47:293(9)(a)(vi); 47:293(9)(e); LAC 61:I.1311',
    source: y === 2025 ? `${IT540_2025}: Schedule E code 06E "Up to $12,000 of your annual retirement income may be exempted" for each taxpayer 65 or older with the Worksheet for Code 06E, code 09E START "up to $2,400 per beneficiary" ("$4,800 per beneficiary" married filing jointly), code 10E military pay exclusion "up to $50,000", code 07E taxable Social Security` : `${NOI_2026}: "For tax year 2026, this amount is $12,324 after being adjusted for inflation"; START and military pay limits: ${NO_FORM_2026} (La. R.S. 47:293(9)(a)(vi) and 47:293(9)(e))`,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.la.credits',
    value: {
      eicBp: 500,
      refundableChildCare: { federalAgiMax: 25000, shareBp: 5000, bands: [{ upTo: 15000, bp: 3500 }, { upTo: 17000, bp: 3400 }, { upTo: 19000, bp: 3300 }, { upTo: 21000, bp: 3200 }, { upTo: 23000, bp: 3100 }, { upTo: 25000, bp: 3000 }] },
      nonrefundableChildCare: { bands: [{ upTo: 35000, bp: 3000 }, { upTo: 60000, bp: 1000 }], aboveBp: 1000, aboveMax: 25 }
    },
    basis: 'louisiana_eic_5_percent_of_federal_refundable_child_care_credit_50_percent_of_the_federal_rate_table_on_expenses_for_federal_agi_up_to_25000_nonrefundable_child_care_credit_percent_of_federal_credit_above_25000',
    ...year(y),
    act: 'Louisiana Revised Statutes Title 47',
    section: 'La. R.S. 47:297.8; 47:297.4',
    source: y === 2025 ? `${IT540_2025}: Louisiana Earned Income Credit Worksheet "Multiply Line 1 above by 5 percent, round to the nearest dollar"; Refundable Child Care Credit Worksheet line 8 decimal .35 up to $15,000, .34 to $17,000, .33 to $19,000, .32 to $21,000, .31 to $23,000, .30 to $25,000, line 10 "Multiply Line 9 by 50 percent"; Nonrefundable Child Care Credit Worksheet line 1A 30% for $25,001-$35,000, 10% for $35,001-$60,000 and over $60,000, line 2A "limited to the LESSER of $25.00, or 10 percent of the federal credit"` : `${NO_FORM_2026} (La. R.S. 47:297.8 and 47:297.4)`,
    attestations: []
  }))
];
