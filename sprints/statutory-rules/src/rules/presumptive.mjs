const RUPEE = 100;
const LAKH = 100000 * RUPEE;
const CRORE = 100 * LAKH;

const FY_START_LOOKUP = 'Looked up by the first day of the financial year (tax year) whose income is presumed';
const ACT_2025 = 'Income-tax Act 2025 (30 of 2025), Gazette of India 21.08.2025; the Finance Act, 2026 (No. 4 of 2026) does not amend s.58(2)';
const CROSS_CHECK = 'rates and limits cross-checked against the MIT-licensed india-tax-guru presumptive rules (github.com/anivar/india-tax-guru, v0.2.1), which record them as unchanged since the Finance Act 2023';

const BUSINESS = {
  digitalReceiptsRatePercent: 6,
  otherReceiptsRatePercent: 8,
  turnoverCapPaise: 2 * CRORE,
  lowCash: { turnoverCapPaise: 3 * CRORE, cashReceiptsMaxPercent: 5 },
  digitalReceiptCutoff: 'received by account-payee cheque or draft, ECS or another prescribed electronic mode during the year or before the return due date',
  eligibleAssessees: ['resident individual', 'resident HUF', 'resident partnership firm other than an LLP'],
  excluded: ['profession under the books-of-account section', 'commission or brokerage', 'agency business', 'goods carriages (separate section)'],
  lockInYears: 5
};

const PROFESSION = {
  ratePercent: 50,
  grossReceiptsCapPaise: 50 * LAKH,
  lowCash: { grossReceiptsCapPaise: 75 * LAKH, cashReceiptsMaxPercent: 5 },
  eligibleAssessees: ['resident individual', 'resident partnership firm other than an LLP'],
  professions: ['legal', 'medical', 'engineering', 'architectural', 'accountancy', 'technical consultancy', 'interior decoration', 'film artist', 'company secretary', 'information technology', 'authorised representative']
};

function record(id, value, basis, effectiveFrom, effectiveTo, act, section, source) {
  return { id, value, basis, effectiveFrom, effectiveTo, act, section, source: `${source}; ${CROSS_CHECK}. ${FY_START_LOOKUP}`, attestations: [] };
}

export const RULES = [
  record(
    'income-tax.presumptive.business', BUSINESS, 'total_turnover_or_gross_receipts',
    '2023-04-01', '2026-03-31', 'IT-1961', '44AD(1) and provisos',
    'Income-tax Act 1961 s.44AD(1): eight per cent of total turnover or gross receipts, six per cent of the amount received by account-payee cheque or draft, ECS or another prescribed electronic mode during the year or before the s.139(1) due date; eligible business limited to two crore rupees, three crore where cash receipts do not exceed five per cent (Finance Act 2023, AY 2024-25 onward); s.44AD(4) five-year consequence; s.44AD(6) exclusions'
  ),
  record(
    'income-tax.presumptive.business', BUSINESS, 'total_turnover_or_gross_receipts',
    '2026-04-01', null, 'IT-2025', '58(2) Table Sl. No. 1',
    `${ACT_2025}: s.58(2) Table Sl. No. 1 carries the eight and six per cent rates and the two crore and three crore limits forward for an eligible business`
  ),
  record(
    'income-tax.presumptive.profession', PROFESSION, 'gross_receipts',
    '2023-04-01', '2026-03-31', 'IT-1961', '44ADA(1)',
    'Income-tax Act 1961 s.44ADA(1): fifty per cent of gross receipts of a profession referred to in s.44AA(1), for receipts up to fifty lakh rupees, seventy-five lakh where cash receipts do not exceed five per cent (Finance Act 2023, AY 2024-25 onward); an individual or a partnership firm other than an LLP'
  ),
  record(
    'income-tax.presumptive.profession', PROFESSION, 'gross_receipts',
    '2026-04-01', null, 'IT-2025', '58(2) Table Sl. No. 3',
    `${ACT_2025}: s.58(2) Table Sl. No. 3 carries the fifty per cent rate and the fifty lakh and seventy-five lakh limits forward for an eligible profession`
  )
];
