const RUPEE = 100;
const LAKH = 100000 * RUPEE;
const CRORE = 100 * LAKH;

const YEARS = [
  { effectiveFrom: '2024-04-01', effectiveTo: '2025-03-31', act: 'IT-1961' },
  { effectiveFrom: '2025-04-01', effectiveTo: '2026-03-31', act: 'IT-1961' },
  { effectiveFrom: '2026-04-01', effectiveTo: '2027-03-31', act: 'IT-2025' }
];

const PORTAL_AY_2025_26 = 'incometax.gov.in e-Filing help "Salaried Individuals for AY 2025-26" rate tables';
const PORTAL_AY_2026_27 = 'incometax.gov.in e-Filing help "Salaried Individuals for AY 2026-27" and "Senior Citizens and Super Senior Citizens for AY 2026-2027" rate tables';
const ACT_2025_TEXT = 'Income-tax Act, 2025 (30 of 2025), text as passed by Lok Sabha on 11.08.2025 (Bill No. 104-C of 2025)';
const NO_CHANGE_2026 = 'PRS Union Budget 2026-27 Analysis reports no change in income tax slabs; the Budget 2026-27 speech and PIB summary propose none';
const FINANCE_ACT_2026_UNREAD = `Finance Act, 2026 First Schedule not read directly; ${NO_CHANGE_2026}`;

function slabs(...rows) {
  return rows.map(([fromRupees, toRupees, ratePercent]) => ({
    fromPaise: fromRupees * RUPEE,
    toPaise: toRupees === null ? null : toRupees * RUPEE,
    ratePercent
  }));
}

function sameEachYear(value) {
  return YEARS.map(() => value);
}

function acrossYears(id, basis, values, citations) {
  return YEARS.map(({ effectiveFrom, effectiveTo, act }, index) => ({
    id,
    value: values[index],
    basis,
    effectiveFrom,
    effectiveTo,
    act,
    section: citations[index][0],
    source: citations[index][1],
    attestations: []
  }));
}

function financeActCitations(what) {
  return [
    ['', `${what} set by the annual Finance Act (First Schedule); ${PORTAL_AY_2025_26}`],
    ['', `${what} set by the annual Finance Act (First Schedule); ${PORTAL_AY_2026_27}`],
    ['', `${what} set by the annual Finance Act under the Income-tax Act, 2025; ${FINANCE_ACT_2026_UNREAD}`]
  ];
}

const NEW_REGIME_SLABS_FY_2024_25 = slabs([0, 300000, 0], [300000, 700000, 5], [700000, 1000000, 10], [1000000, 1200000, 15], [1200000, 1500000, 20], [1500000, null, 30]);
const NEW_REGIME_SLABS_FROM_FY_2025_26 = slabs([0, 400000, 0], [400000, 800000, 5], [800000, 1200000, 10], [1200000, 1600000, 15], [1600000, 2000000, 20], [2000000, 2400000, 25], [2400000, null, 30]);

export const RULES = [
  ...acrossYears('income-tax.new-regime.slabs', 'total_income', [NEW_REGIME_SLABS_FY_2024_25, NEW_REGIME_SLABS_FROM_FY_2025_26, NEW_REGIME_SLABS_FROM_FY_2025_26], [
    ['115BAC(1A)', `Income-tax Act, 1961 s.115BAC(1A) as amended by the Finance (No. 2) Act, 2024; ${PORTAL_AY_2025_26}; PIB Union Budget 2024-25 summary: 0-3 lakh nil, 3-7 5%, 7-10 10%, 10-12 15%, 12-15 20%, above 15 lakh 30%`],
    ['115BAC(1A)', `Income-tax Act, 1961 s.115BAC(1A) as amended by the Finance Act, 2025; PIB Highlights of Union Budget 2025-26 (PRID 2098382); ${PORTAL_AY_2026_27}`],
    ['202(1)', `${ACT_2025_TEXT}, s.202(1) Table; ${NO_CHANGE_2026}`]
  ]),

  ...acrossYears('income-tax.old-regime.slabs.below-60', 'total_income of an individual below 60 years, or of a non-resident individual',
    sameEachYear(slabs([0, 250000, 0], [250000, 500000, 5], [500000, 1000000, 20], [1000000, null, 30])),
    financeActCitations('Old-regime rates for individuals')),
  ...acrossYears('income-tax.old-regime.slabs.60-to-79', 'total_income of a resident individual aged 60 years or more but less than 80 years during the year',
    sameEachYear(slabs([0, 300000, 0], [300000, 500000, 5], [500000, 1000000, 20], [1000000, null, 30])),
    financeActCitations('Old-regime rates for senior citizens')),
  ...acrossYears('income-tax.old-regime.slabs.80-plus', 'total_income of a resident individual aged 80 years or more during the year',
    sameEachYear(slabs([0, 500000, 0], [500000, 1000000, 20], [1000000, null, 30])),
    financeActCitations('Old-regime rates for super senior citizens')),

  ...acrossYears('income-tax.new-regime.rebate', 'income-tax on total_income of a resident individual taxed under the new regime; marginal relief limits tax to the income above the threshold',
    [
      { maxTotalIncomePaise: 7 * LAKH, maxRebatePaise: 25000 * RUPEE, marginalRelief: true },
      { maxTotalIncomePaise: 12 * LAKH, maxRebatePaise: 60000 * RUPEE, marginalRelief: true },
      { maxTotalIncomePaise: 12 * LAKH, maxRebatePaise: 60000 * RUPEE, marginalRelief: true }
    ], [
      ['87A', 'Income-tax Act, 1961 s.87A provisos for s.115BAC(1A) inserted by the Finance Act, 2023; incometaxindia.gov.in FAQ on rebate u/s 87A: Rs 25,000 for AY 2025-26 where total income does not exceed Rs 7,00,000, with marginal relief above it'],
      ['87A', `Income-tax Act, 1961 s.87A as amended by the Finance Act, 2025; PIB Highlights of Union Budget 2025-26 (no tax up to Rs 12 lakh); ${PORTAL_AY_2026_27}; incometaxindia.gov.in FAQ on rebate u/s 87A marginal relief above Rs 12,00,000`],
      ['156(2)', `${ACT_2025_TEXT}, s.156(2)(a) Rs 60,000 up to twelve lakh rupees and s.156(2)(b) marginal relief; s.156(3) limits it to tax at s.202(1) rates`]
    ]),
  ...acrossYears('income-tax.old-regime.rebate', 'income-tax on total_income of a resident individual taxed under the old regime; no marginal relief',
    sameEachYear({ maxTotalIncomePaise: 5 * LAKH, maxRebatePaise: 12500 * RUPEE, marginalRelief: false }), [
      ['87A', `Income-tax Act, 1961 s.87A; ${PORTAL_AY_2025_26}`],
      ['87A', `Income-tax Act, 1961 s.87A; ${PORTAL_AY_2026_27}`],
      ['156(1)', `${ACT_2025_TEXT}, s.156(1): 100% of income-tax or Rs 12,500, whichever is less, where total income does not exceed Rs 5,00,000`]
    ]),

  ...acrossYears('income-tax.new-regime.standard-deduction', 'salary; the lower of this amount and the salary',
    sameEachYear({ maxPaise: 75000 * RUPEE }), [
      ['16(ia)', 'Income-tax Act, 1961 s.16(ia) as amended by the Finance (No. 2) Act, 2024 (Rs 75,000 where tax is computed under s.115BAC(1A), from AY 2025-26); PIB Union Budget 2024-25 summary'],
      ['16(ia)', `Income-tax Act, 1961 s.16(ia); ${PORTAL_AY_2026_27}; PIB Highlights of Union Budget 2025-26 (Rs 12.75 lakh nil for salaried due to Rs 75,000 standard deduction)`],
      ['19(1) Table Sl. No. 2', `${ACT_2025_TEXT}, s.19(1) Table Sl. No. 2(a): Rs 75,000 or the salary, whichever is less, where income-tax is computed under s.202(1)`]
    ]),
  ...acrossYears('income-tax.old-regime.standard-deduction', 'salary; the lower of this amount and the salary',
    sameEachYear({ maxPaise: 50000 * RUPEE }), [
      ['16(ia)', 'Income-tax Act, 1961 s.16(ia); incometax.gov.in FAQs on New vs Old Tax Regime: Rs 50,000 or the salary, whichever is lower'],
      ['16(ia)', 'Income-tax Act, 1961 s.16(ia); incometax.gov.in FAQs on New vs Old Tax Regime: Rs 50,000 or the salary, whichever is lower'],
      ['19(1) Table Sl. No. 2', `${ACT_2025_TEXT}, s.19(1) Table Sl. No. 2(b): Rs 50,000 or the salary, whichever is less, in any other case`]
    ]),

  ...acrossYears('income-tax.surcharge.individual', 'income-tax (after rebate) of an individual, by total_income above each threshold; marginal relief at each threshold',
    sameEachYear({
      tiers: [
        { aboveTotalIncomePaise: 50 * LAKH, ratePercent: 10 },
        { aboveTotalIncomePaise: CRORE, ratePercent: 15 },
        { aboveTotalIncomePaise: 2 * CRORE, ratePercent: 25 },
        { aboveTotalIncomePaise: 5 * CRORE, ratePercent: 37 }
      ],
      marginalRelief: true
    }),
    financeActCitations('Surcharge on income-tax of individuals with marginal relief')),
  ...acrossYears('income-tax.new-regime.surcharge-cap', 'surcharge rate on income-tax computed under the new regime',
    sameEachYear({ maxRatePercent: 25 }),
    financeActCitations('New-regime surcharge capped at 25% (no 37% tier)')),
  ...acrossYears('income-tax.cess.health-education', 'income-tax plus surcharge',
    sameEachYear({ ratePercent: 4 }),
    financeActCitations('Health and Education Cess at 4% of income-tax plus surcharge')),

  ...acrossYears('income-tax.deduction.80c.cap', 'aggregate of eligible payments (life insurance, provident fund and the like); old regime only',
    sameEachYear({ maxPaise: 150000 * RUPEE }), [
      ['80C', `Income-tax Act, 1961 s.80C (aggregate limit with s.80CCE); ${PORTAL_AY_2025_26}: combined deduction limit Rs 1,50,000`],
      ['80C', `Income-tax Act, 1961 s.80C (aggregate limit with s.80CCE); ${PORTAL_AY_2026_27}: combined deduction limit Rs 1,50,000`],
      ['123', `${ACT_2025_TEXT}, s.123: aggregate of sums in Schedule XV not exceeding Rs 1,50,000`]
    ]),
  ...acrossYears('income-tax.deduction.80d.caps', 'health insurance premium, preventive check-up and senior medical expenditure, capped per group (self and family; parents); old regime only',
    sameEachYear({
      groups: ['self-and-family', 'parents'],
      insuranceMaxPaise: 25000 * RUPEE,
      seniorInsuranceMaxPaise: 50000 * RUPEE,
      seniorMedicalExpenditureMaxPaise: 50000 * RUPEE,
      groupMaxPaise: 50000 * RUPEE,
      preventiveHealthCheckupMaxPaise: 5000 * RUPEE
    }), [
      ['80D', `Income-tax Act, 1961 s.80D; ${PORTAL_AY_2025_26}`],
      ['80D', `Income-tax Act, 1961 s.80D; ${PORTAL_AY_2026_27}: Rs 25,000 (Rs 50,000 if a senior citizen) per group, Rs 5,000 preventive health check-up within the limit, Rs 50,000 medical expenditure`],
      ['126', `${ACT_2025_TEXT}, s.126(2) Rs 25,000 per group, s.126(3) Rs 5,000 preventive check-up, s.126(4) Rs 50,000 per group aggregate, s.126(7) medical expenditure only for an uninsured senior citizen, s.126(8) Rs 50,000 for a senior citizen`]
    ]),

  ...acrossYears('income-tax.rounding.total-income', 'total_income',
    sameEachYear({ ignorePaise: true, multiplePaise: 10 * RUPEE, roundUpFromLastRupeeDigit: 5 }), [
      ['288A', 'Income-tax Act, 1961 s.288A: total income rounded off to the nearest multiple of ten rupees, paise ignored, last figure five or more rounded up'],
      ['288A', 'Income-tax Act, 1961 s.288A: total income rounded off to the nearest multiple of ten rupees, paise ignored, last figure five or more rounded up'],
      ['516', `${ACT_2025_TEXT}, s.516: total income rounded off to the nearest multiple of 10, paise ignored, last figure five or more rounded up`]
    ]),
  ...acrossYears('income-tax.rounding.tax-payable', 'tax payable or refundable',
    sameEachYear({ ignorePaise: true, multiplePaise: 10 * RUPEE, roundUpFromLastRupeeDigit: 5 }), [
      ['288B', 'Income-tax Act, 1961 s.288B: tax payable or refundable rounded off to the nearest multiple of ten rupees, paise ignored'],
      ['288B', 'Income-tax Act, 1961 s.288B: tax payable or refundable rounded off to the nearest multiple of ten rupees, paise ignored'],
      ['516', `${ACT_2025_TEXT}, s.516: any amount payable or refundable rounded off to the nearest multiple of 10, paise ignored, last figure five or more rounded up`]
    ])
];
