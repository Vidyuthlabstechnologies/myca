const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const D401_2025 = 'North Carolina Department of Revenue, 2025 D-401 Individual Income Tax Instructions (www.ncdor.gov/2025-d-401-individual-income-tax-instructions/open), with the 2025 Form D-400, D-400 Schedule S, D-400 Schedule A, D-400 Schedule PN and D-400TC web-fill forms (www.ncdor.gov/taxes-forms/individual-income-tax/individual-income-tax-forms-instructions), read 2026-11-21';
const GS_1537 = 'N.C. Gen. Stat. 105-153.7(a) (www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_105/GS_105-153.7.html), rate table "In 2025 4.25% / After 2025 3.99%" as enacted by S.L. 2023-134 s. 42.1(a), read 2026-11-21; the rate reduction trigger in subsection (a1) first applies to taxable years beginning in 2027';
const GS_1535 = 'N.C. Gen. Stat. 105-153.5(a) and (a1) (www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_105/GS_105-153.5.html), standard deduction table, $20,000 limit on mortgage interest and real estate taxes, and child deduction table, read 2026-11-21';

const CHILD = {
  mfj: [{ agiUpTo: 40000, amount: 3000 }, { agiUpTo: 60000, amount: 2500 }, { agiUpTo: 80000, amount: 2000 }, { agiUpTo: 100000, amount: 1500 }, { agiUpTo: 120000, amount: 1000 }, { agiUpTo: 140000, amount: 500 }, { agiUpTo: null, amount: 0 }],
  hoh: [{ agiUpTo: 30000, amount: 3000 }, { agiUpTo: 45000, amount: 2500 }, { agiUpTo: 60000, amount: 2000 }, { agiUpTo: 75000, amount: 1500 }, { agiUpTo: 90000, amount: 1000 }, { agiUpTo: 105000, amount: 500 }, { agiUpTo: null, amount: 0 }],
  single: [{ agiUpTo: 20000, amount: 3000 }, { agiUpTo: 30000, amount: 2500 }, { agiUpTo: 40000, amount: 2000 }, { agiUpTo: 50000, amount: 1500 }, { agiUpTo: 60000, amount: 1000 }, { agiUpTo: 70000, amount: 500 }, { agiUpTo: null, amount: 0 }],
};

export const RULES = [
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.nc.income-tax',
    value: { rateBasisPoints: y === 2025 ? 425 : 399, standardDeduction: { mfj: 25500, qss: 25500, hoh: 19125, single: 12750, mfs: 12750 }, childDeduction: { mfj: CHILD.mfj, qss: CHILD.mfj, hoh: CHILD.hoh, single: CHILD.single, mfs: CHILD.single } },
    basis: 'flat_rate_on_north_carolina_taxable_income_after_the_nc_standard_or_itemized_deduction_and_the_child_deduction_by_federal_agi_band',
    ...year(y),
    act: 'N.C. Gen. Stat. Chapter 105, Article 4 (S.L. 2023-134)',
    section: '105-153.7(a); 105-153.5(a)(1); 105-153.5(a1)',
    source: y === 2025 ? `${D401_2025}: "For tax year 2025, the individual income tax rate is 4.25%"; NC Standard Deduction Chart; Child Deduction Table; ${GS_1537}` : `${GS_1537}; ${GS_1535}; the 2026 rate and the fixed statutory deduction amounts are set by statute, not indexed`,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.nc.itemized',
    value: { mortgageAndPropertyTaxCap: 20000, realEstateTaxCap: { mfs: 5000, other: 10000 }, medicalFloorBasisPoints: 750, cashCharityAgiBasisPoints: 6000, nonCashCharityAgiBasisPoints: 3000 },
    basis: 'nc_itemized_deductions_are_mortgage_interest_plus_real_estate_tax_up_to_20000_charitable_contributions_allowed_under_section_170_and_medical_expenses_over_7_5_percent_of_federal_agi',
    ...year(y),
    act: 'N.C. Gen. Stat. 105-153.5(a)(2)',
    section: '105-153.5(a)(2)a.-c.',
    source: `${D401_2025}: Schedule A instructions Lines 1-7d ("may not deduct more than $10,000 of real estate property taxes ... married individuals filing separately may not deduct more than $5,000", Line 4 limitation $20,000, Line 7c "Multiply Line 7b by 7.5%"); ${GS_1535}; the 60% and 30% charitable limits are the section 170(b) limits North Carolina adopts by reference`,
    attestations: []
  })),
];
