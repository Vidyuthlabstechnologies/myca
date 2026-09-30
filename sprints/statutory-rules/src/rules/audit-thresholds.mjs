const RUPEE = 100;
const LAKH = 100000 * RUPEE;
const CRORE = 100 * LAKH;

const FY_START_LOOKUP = 'Looked up by the first day of the financial year (tax year) being audited';
const ACT_2025 = 'Income-tax Act 2025 (30 of 2025), Gazette of India 21.08.2025; the Finance Act, 2026 (No. 4 of 2026) does not amend ss.58(2) or 63';

const TAX_AUDIT_LIMITS = {
  business: { auditAbovePaise: 1 * CRORE, lowCash: { auditAbovePaise: 10 * CRORE, cashReceiptsMaxPercent: 5, cashPaymentsMaxPercent: 5 } },
  profession: { auditAbovePaise: 50 * LAKH }
};

const PRESUMPTIVE_EXEMPTION = {
  business: { turnoverUpToPaise: 2 * CRORE, lowCash: { turnoverUpToPaise: 3 * CRORE, cashReceiptsMaxPercent: 5 } },
  profession: { grossReceiptsUpToPaise: 50 * LAKH, lowCash: { grossReceiptsUpToPaise: 75 * LAKH, cashReceiptsMaxPercent: 5 } },
  requiresPresumptiveProfitDeclared: true
};

function record(id, value, basis, effectiveFrom, effectiveTo, act, section, source) {
  return { id, value, basis, effectiveFrom, effectiveTo, act, section, source: `${source}. ${FY_START_LOOKUP}`, attestations: [] };
}

export const RULES = [
  record(
    'audit-threshold.tax-audit', TAX_AUDIT_LIMITS, 'total_sales_turnover_or_gross_receipts',
    '2020-04-01', '2026-03-31', 'IT-1961', '44AB',
    'Income-tax Act 1961 s.44AB(a) and its proviso, s.44AB(b): audit when business turnover exceeds one crore rupees, or ten crore rupees where cash receipts and cash payments each do not exceed five per cent, and when professional gross receipts exceed fifty lakh rupees; ten crore from AY 2021-22 per the Memorandum to the Finance Bill 2021 ("Rationalisation of provisions relating to tax audit in certain cases"), limits restated in the Memorandum to the Finance Bill 2023'
  ),
  record(
    'audit-threshold.tax-audit', { ...TAX_AUDIT_LIMITS, nonAccountPayeeChequeIsCash: true }, 'total_sales_turnover_or_gross_receipts',
    '2026-04-01', null, 'IT-2025', '63(1)',
    `${ACT_2025}: s.63(1) Table Sl. No. 1(a)-(c) (one crore, ten crore when cash receipts and cash payments are each within 5%, fifty lakh for a profession) and s.63(5)(b) (a non-account-payee cheque or draft counts as cash)`
  ),
  record(
    'audit-threshold.tax-audit.presumptive-exemption', PRESUMPTIVE_EXEMPTION, 'total_turnover_or_gross_receipts',
    '2023-04-01', '2026-03-31', 'IT-1961', '44AB proviso; 44AD(1); 44ADA(1)',
    'Memorandum to the Finance Bill 2023 (AY 2024-25 onward): s.44AB does not apply to a person declaring profits under s.44AD(1) (turnover up to two crore, three crore where cash receipts do not exceed 5%) or s.44ADA(1) (gross receipts up to fifty lakh, seventy-five lakh where cash receipts do not exceed 5%)'
  ),
  record(
    'audit-threshold.tax-audit.presumptive-exemption', PRESUMPTIVE_EXEMPTION, 'total_turnover_or_gross_receipts',
    '2026-04-01', null, 'IT-2025', '63(2); 58(2) Table Sl. Nos. 1 and 3',
    `${ACT_2025}: s.63(2) excludes profits declared as per s.58(2); s.58(2) Table Sl. No. 1 (two crore, three crore where cash receipts are within 5%) and Sl. No. 3 (fifty lakh, seventy-five lakh where cash receipts are within 5%); s.58(3) still requires audit when lower profits are claimed and total income exceeds the basic exemption`
  )
];
