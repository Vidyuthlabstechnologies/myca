const FORM_1040_2025 = Object.freeze([
  ['1a', 'wages'], ['1e', 'dependentCareBenefits'], ['1z', 'totalWages'], ['2a', 'taxExemptInterest'], ['2b', 'taxableInterest'], ['3a', 'qualifiedDividends'], ['3b', 'ordinaryDividends'],
  ['4a', 'iraDistributions'], ['4b', 'iraTaxable'], ['5a', 'pensions'], ['5b', 'pensionsTaxable'], ['6a', 'socialSecurity'], ['6b', 'socialSecurityTaxable'], ['7a', 'capitalGain'],
  ['8', 'additionalIncome'], ['9', 'totalIncome'], ['10', 'adjustments'], ['11a', 'agi'], ['11b', 'agi'], ['12e', 'deduction'], ['13a', 'qbiDeduction'], ['13b', 'additionalDeductions'],
  ['14', 'totalDeductions'], ['15', 'taxableIncome'], ['16', 'tax'], ['17', 'schedule2Tax'], ['18', 'taxBeforeCredits'], ['19', 'childTaxCredit'], ['20', 'otherCredits'], ['21', 'totalCredits'],
  ['22', 'taxAfterCredits'], ['23', 'otherTaxes'], ['24', 'totalTax'], ['25a', 'w2Withheld'], ['25b', 'form1099Withheld'], ['25c', 'otherWithheld'], ['25d', 'withholding'], ['26', 'estimatedPayments'],
  ['27a', 'earnedIncomeCredit'], ['28', 'additionalChildTaxCredit'], ['29', 'aotcRefundable'], ['31', 'schedule3Payments'], ['32', 'otherPayments'], ['33', 'totalPayments'], ['34', 'overpaid'],
  ['35a', 'refund'], ['36', 'appliedToNextYear'], ['37', 'owed'],
]);

const FORM_1040_2026 = Object.freeze([
  ...FORM_1040_2025.slice(0, FORM_1040_2025.findIndex(([key]) => key === '12e') + 1),
  ['12f', 'nonItemizerCharity'], ['13a', 'additionalDeductions'], ['13b', 'qbiDeduction'],
  ...FORM_1040_2025.slice(FORM_1040_2025.findIndex(([key]) => key === '14'), FORM_1040_2025.findIndex(([key]) => key === '24')),
  ['24a', 'totalTax'], ['24c', 'totalTax'],
  ...FORM_1040_2025.slice(FORM_1040_2025.findIndex(([key]) => key === '25a'), FORM_1040_2025.findIndex(([key]) => key === '32')),
  ['32a', 'otherPayments'], ['32c', 'otherPayments'],
  ...FORM_1040_2025.slice(FORM_1040_2025.findIndex(([key]) => key === '33')),
]);

const LAYOUTS = Object.freeze({
  2025: Object.freeze({
    1040: FORM_1040_2025,
    '1-A': Object.freeze([['13', 'tips'], ['21', 'overtime'], ['30', 'carLoanInterest'], ['37', 'seniors'], ['38', 'total']]),
    2: Object.freeze([['1a', 'ptcRepayment'], ['1z', 'ptcRepayment'], ['2', 'amt'], ['3', 'partI'], ['4', 'seTax'], ['8', 'accountTaxes'], ['11', 'additionalMedicare'], ['12', 'niit'], ['17c', 'hsaDistributionTax'], ['17d', 'hsaTestingTax'], ['18', 'otherAdditionalTaxes'], ['21', 'total']]),
    3: Object.freeze(['1', '2', '3', '4', '5a', '5b', '8', '9', '11', '15'].map((key) => [key, key])),
    A: Object.freeze(['1', '2', '3', '4', '5a', '5b', '5c', '5d', '5e', '7', '8a', '8b', '8d', '8e', '10', '11', '12', '14', '16', '17'].map((key) => [key, key])),
    8959: Object.freeze(['1', '5', '6', '7', '8', '13', '18', '19', '20', '21', '22', '24'].map((key) => [key, key])),
  }),
  2026: Object.freeze({
    1040: FORM_1040_2026,
    '1-A': Object.freeze([['15', 'tips'], ['27', 'overtime'], ['36', 'carLoanInterest'], ['43', 'seniors'], ['44', 'total']]),
    2: Object.freeze([['1a', 'ptcRepayment'], ['1z', 'ptcRepayment'], ['2', 'amt'], ['3', 'partI'], ['4', 'seTax'], ['5', 'earlyDistributionTax'], ['6', 'niit'], ['11', 'seAdditionalMedicare'], ['13c', 'hsaDistributionTax'], ['13d', 'hsaTestingTax'], ['14', 'otherAdditionalTaxes'], ['15', 'incomeTaxesPartII'], ['17b', 'wageAdditionalMedicare'], ['17d', 'wageAdditionalMedicare'], ['18', 'accountExciseTaxes'], ['20', 'employmentAndOtherTaxes'], ['21', 'total']]),
    3: Object.freeze(['1', '2', '3', '4', '5a', '8', '9', '11', '15'].map((key) => [key, key])),
    A: Object.freeze([['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5a', '5a'], ['5b', '5b'], ['5c', '5c'], ['5d', '5d'], ['5e', '5e'], ['7', '7'], ['8a', '8a'], ['8b', '8b'], ['8d', '8d'], ['8e', '8e'], ['10', '10'], ['11', '11'], ['12', '12'], ['13', '14'], ['15', '14'], ['17z', '16'], ['18', '17']]),
    8959: Object.freeze([['1', '1'], ['5', '5'], ['6', '6'], ['7', '7'], ['12', '7'], ['13', '8'], ['14', '5'], ['18', '13'], ['19', '19'], ['20', '20'], ['21', '21'], ['22', '22'], ['24', '24']]),
  }),
});

const NAME_LABELS = Object.freeze({
  1040: Object.freeze({
    wages: 'Wages (W-2 box 1)', dependentCareBenefits: 'Taxable dependent care benefits (Form 2441)', totalWages: 'Total wages', taxExemptInterest: 'Tax-exempt interest', taxableInterest: 'Taxable interest',
    qualifiedDividends: 'Qualified dividends', ordinaryDividends: 'Ordinary dividends', iraDistributions: 'IRA distributions', iraTaxable: 'IRA distributions, taxable', pensions: 'Pensions and annuities',
    pensionsTaxable: 'Pensions and annuities, taxable', socialSecurity: 'Social security benefits', socialSecurityTaxable: 'Social security benefits, taxable', capitalGain: 'Capital gain or loss',
    additionalIncome: 'Additional income (Schedule 1)', totalIncome: 'Total income', adjustments: 'Adjustments to income (Schedule 1)', agi: 'Adjusted gross income', deduction: 'Standard or itemized deduction',
    nonItemizerCharity: 'Charitable contribution deduction for non-itemizers', qbiDeduction: 'Qualified business income deduction', additionalDeductions: 'Additional deductions (Schedule 1-A)',
    totalDeductions: 'Total deductions', taxableIncome: 'Taxable income', tax: 'Tax', schedule2Tax: 'Schedule 2, line 3', taxBeforeCredits: 'Tax before credits',
    childTaxCredit: 'Child tax credit and credit for other dependents', otherCredits: 'Other credits (Schedule 3)', totalCredits: 'Total credits', taxAfterCredits: 'Tax after credits',
    otherTaxes: 'Other taxes (Schedule 2)', totalTax: 'Total tax', w2Withheld: 'Federal tax withheld, W-2', form1099Withheld: 'Federal tax withheld, 1099', otherWithheld: 'Federal tax withheld, other',
    withholding: 'Total withholding', estimatedPayments: 'Estimated tax payments', earnedIncomeCredit: 'Earned income credit', additionalChildTaxCredit: 'Additional child tax credit',
    aotcRefundable: 'American opportunity credit, refundable', schedule3Payments: 'Other payments (Schedule 3)', otherPayments: 'Total other payments and refundable credits',
    totalPayments: 'Total payments', overpaid: 'Overpaid', refund: 'Refund', appliedToNextYear: 'Applied to next year\'s estimated tax', owed: 'Amount you owe',
  }),
  '1-A': Object.freeze({ tips: 'No tax on tips', overtime: 'No tax on overtime', carLoanInterest: 'Car loan interest', seniors: 'Enhanced deduction for seniors', total: 'Total additional deductions' }),
  2: Object.freeze({
    ptcRepayment: 'Excess advance premium tax credit repayment (Form 8962)', partI: 'Total additions to tax (to Form 1040 line 17)', seTax: 'Self-employment tax',
    accountTaxes: 'Additional tax on IRAs and other tax-favored accounts (Form 5329)', earlyDistributionTax: 'Additional tax on IRAs and other tax-favored accounts (Form 5329)',
    additionalMedicare: 'Additional Medicare tax', seAdditionalMedicare: 'Additional Medicare tax on self-employment income (Form 8959)', niit: 'Net investment income tax',
    hsaDistributionTax: 'Additional 20% tax on HSA distributions (Form 8889)', hsaTestingTax: 'Additional 10% tax for not remaining HSA-eligible (Form 8889)', otherAdditionalTaxes: 'Total additional taxes',
    incomeTaxesPartII: 'Additional income taxes', wageAdditionalMedicare: 'Additional Medicare tax on Medicare wages (Form 8959)',
    accountExciseTaxes: 'Tax on excess contributions or accumulations (Form 5329)', employmentAndOtherTaxes: 'Total additional employment and other taxes', total: 'Total other taxes',
  }),
});

const KEY_LABELS = Object.freeze({
  2025: Object.freeze({ 1040: Object.freeze({ '11b': 'Adjusted gross income (from line 11a)' }) }),
  2026: Object.freeze({ 1040: Object.freeze({ '11b': 'Adjusted gross income (from line 11a)', '24c': 'Total tax with Form 1062', '32c': 'Total other payments less Schedule 3-A' }) }),
});

const SOURCE_LABELS = Object.freeze({
  3: Object.freeze({ 1: 'Foreign tax credit', 2: 'Child and dependent care credit (Form 2441)', 3: 'Education credits', 4: 'Retirement savings contributions credit (Form 8880)', '5a': 'Residential clean energy credit (Form 5695)', '5b': 'Energy efficient home improvement credit (Form 5695)', 8: 'Total nonrefundable credits', 9: 'Net premium tax credit (Form 8962)', 11: 'Excess social security tax withheld', 15: 'Total other payments' }),
  A: Object.freeze({ 4: 'Medical and dental above 7.5% of AGI', '5d': 'State and local taxes before the cap', '5e': 'State and local taxes after the cap', '8a': 'Mortgage interest and points on Form 1098', '8b': 'Mortgage interest not on Form 1098', '8d': 'Mortgage insurance premiums', 10: 'Home mortgage interest', 14: 'Gifts to charity', 16: 'Other itemized deductions', 17: 'Total itemized deductions' }),
});

const FORM_NAMES = Object.freeze({ 1040: '1040', '1-A': 'Schedule 1-A', 2: 'Schedule 2', 3: 'Schedule 3', A: 'Schedule A' });

export const LINE_MAP_YEARS = Object.freeze(Object.keys(LAYOUTS));

function layoutOf(taxYear, form) {
  const year = LAYOUTS[String(taxYear)];
  if (!year) throw new Error(`US_LINE_MAP_YEAR_UNKNOWN ${taxYear}`);
  return year[form] || null;
}

export function layoutLines(taxYear, form, values) {
  const layout = layoutOf(taxYear, form);
  if (!layout) return { ...values };
  const out = {};
  for (const [key, source] of layout) if (values[source] !== undefined) out[key] = values[source];
  return out;
}

export function form1040Line(taxYear, name) {
  const keys = layoutOf(taxYear, 1040).filter(([, source]) => source === name).map(([key]) => key);
  return keys.length ? keys[keys.length - 1] : null;
}

export function form1040Amount(data, name) {
  const key = form1040Line(data?.taxYear, name);
  return key === null ? 0 : Number(data?.lines?.[key] || 0);
}

export function lineLabels(taxYear) {
  const out = {};
  for (const [form, title] of Object.entries(FORM_NAMES)) {
    const names = NAME_LABELS[form] || {};
    const sources = SOURCE_LABELS[form] || {};
    const keyed = KEY_LABELS[String(taxYear)]?.[form] || {};
    const rows = [];
    for (const [key, source] of layoutOf(taxYear, form)) {
      const label = keyed[key] || names[source] || sources[source];
      if (label) rows.push([key, label]);
    }
    out[title] = Object.freeze(rows);
  }
  return Object.freeze(out);
}
