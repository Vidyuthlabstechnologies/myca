const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const INSTR_2025 = 'Illinois Department of Revenue, 2025 Form IL-1040 Instructions (tax.illinois.gov/content/dam/soi/en/web/tax/forms/incometax/documents/currentyear/individual/il-1040-instr.pdf), What\'s New and Lines 10 and 30, read 2026-11-21';
const PROVISIONAL_2026 = 'Illinois has not published the 2026 IL-1040 instructions or the 2026 exemption amount as of 2026-11-21; the rate is fixed by statute and the exemption is carried from 2025 until the Department announces the indexed 2026 figure, so the record is marked provisional';

export const RULES = [
  {
    id: 'us.state-return.il.income-tax',
    value: { rateBasisPoints: 495, personalExemption: 2850, seniorOrBlindExtra: 1000, exemptionAgiLimit: { joint: 500000, other: 250000 } },
    basis: 'flat_rate_on_illinois_net_income_base_income_less_the_exemption_allowance_with_no_allowance_above_the_federal_agi_limits',
    ...year(2025),
    act: 'Illinois Income Tax Act (35 ILCS 5)',
    section: '201(b)(5.4); 204',
    source: `${INSTR_2025}: "The Illinois income tax rate is 4.95 percent", "The personal exemption amount for tax year 2025 is $2,850", $1,000 for each 65-or-older and legally-blind box, no exemption allowance above federal AGI of $500,000 joint or $250,000 otherwise`,
    attestations: []
  },
  {
    id: 'us.state-return.il.income-tax',
    value: { rateBasisPoints: 495, personalExemption: 2850, seniorOrBlindExtra: 1000, exemptionAgiLimit: { joint: 500000, other: 250000 }, provisional: true },
    basis: 'flat_rate_on_illinois_net_income_base_income_less_the_exemption_allowance_with_no_allowance_above_the_federal_agi_limits',
    ...year(2026),
    act: 'Illinois Income Tax Act (35 ILCS 5)',
    section: '201(b)(5.4); 204',
    source: PROVISIONAL_2026,
    attestations: []
  },
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.il.credits',
    value: { eitcBasisPoints: 2000, childTaxCreditBasisPoints: 4000, childTaxCreditUnderAge: 12, propertyTaxBasisPoints: 500, k12BasisPoints: 2500, k12Floor: 250, k12Maximum: 750, creditAgiLimit: { joint: 500000, other: 250000 }, ...(y === 2026 ? { provisional: true } : {}) },
    basis: 'illinois_eitc_is_20_percent_of_the_federal_eic_child_tax_credit_40_percent_of_the_illinois_eitc_for_a_dependent_under_12_property_tax_credit_5_percent_k12_credit_25_percent_over_250_up_to_750',
    ...year(y),
    act: 'Illinois Income Tax Act (35 ILCS 5)',
    section: '208; 209; 212; 212.1',
    source: y === 2025 ? `${INSTR_2025} (Child Tax Credit "40 percent of their EITC amount" for a dependent "under the age of 12"); the 20 percent EITC and the Schedule ICR property tax (5 percent) and K-12 (25 percent over $250, up to $750) amounts are from Schedule IL-E/EITC and Schedule ICR as published for 2025, not re-read for this record` : PROVISIONAL_2026,
    attestations: []
  }))
];
