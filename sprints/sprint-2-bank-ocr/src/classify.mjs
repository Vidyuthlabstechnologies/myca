// classify.mjs
// Narration-driven transaction classification for Indian CA work.
// This is the Sprint 3-facing differentiator: competitors (Provi AI, Febi.ai,
// AI Accountant) "auto-categorize" but warn buyers to verify. We make the rules
// transparent, deterministic and auditable — every category cites the rule that
// fired, so the CA can see WHY and override with a one-line reason.
//
// Output per transaction:
//   { category, isCapEx, isRevenue, tdsSection, ruleIds: [...] }

// Ordered rule lists. FIRST match wins. Each rule: { id, pattern (regex on
// uppercase narration), category, capEx (bool|null), revenue (bool|null),
// tdsSection (string|null), note }

const RULES = [
  // ── Government / statutory outflow ─────────────────────────────────────
  { id: 'r.income-tax-refund', pattern: /INCOME ?TAX REFUND|ITR REFUND|REFUND.*INCOME/, category: 'non-operating', capEx: null, revenue: null, tdsSection: null, note: 'income-tax refund' },
  { id: 'r.gst-payment', pattern: /GST|SGST|CGST|IGST|CASH LEDGER|ELECTRONIC CREDIT/, category: 'tax_payment', capEx: null, revenue: null, tdsSection: null, note: 'GST remittance' },
  { id: 'r.tds-deposit', pattern: /TDS|CHALLAN.*28[0-9]|194[A-Z]|192|206C/, category: 'tax_payment', capEx: null, revenue: null, tdsSection: null, note: 'TDS/TCS deposit' },
  // ── Employee / payroll ──────────────────────────────────────────────────
  { id: 'r.salary', pattern: /\bSALARY|WAGES|REMUNE|EMPLOYEE|PF |EPF|ESI\b/, category: 'salary', capEx: null, revenue: true, tdsSection: '192', note: 'salary & statutory payroll' },
  // ── Sales / receipts ────────────────────────────────────────────────────
  { id: 'r.sales', pattern: /SALE|EXPORT|INVOICE|BILLING|GOODS/.source, category: 'sales', capEx: null, revenue: true, tdsSection: null, note: 'sales realisation' },
  { id: 'r.interest-received', pattern: /INT\.? ?RECEIVED|INTEREST.*(RECEIVED|CREDITED|PAID BY|FROM)|FD MATURITY|FIXED DEPOSIT|MATURITY/, category: 'interest_income', capEx: null, revenue: true, tdsSection: '194A', note: 'bank/fixed-deposit interest' },
  { id: 'r.rent-received', pattern: /RENT.*(RECEIVED|CREDIT)|LEASE.*INCOME/.source, category: 'rent_income', capEx: null, revenue: true, tdsSection: null, note: 'rent/lease income (TDS deducted by tenant, not firm)' },
  // ── Fixed assets ────────────────────────────────────────────────────────
  // NOTE: must precede r.purchase so "MACHINERY PURCHASE" is capital, not stock.
  { id: 'r.machinery', pattern: /MACHINE|EQUIPMENT|PLANT|COMPUTER|LAPTOP|FURNITURE|VEHICLE|CAR |BUILDING|LAND |IMPROVEMENT/, category: 'capex', capEx: true, revenue: null, tdsSection: null, note: 'capital asset acquisition' },
  // ── Purchases / operational payments ────────────────────────────────────
  { id: 'r.purchase', pattern: /PURCHASE|SUPPLIER|VENDOR|RAW MATERIAL|STOCK|TRADING/, category: 'purchases', capEx: null, revenue: true, tdsSection: null, note: 'goods/stock purchase' },
  { id: 'r.utility', pattern: /ELECTRIC|POWER|BILL|WATER|MOBILE|POSTPAID|INTERNET|PHONE|GAS/, category: 'utilities', capEx: null, revenue: true, tdsSection: null, note: 'utility bill' },
  { id: 'r.transport', pattern: /FREIGHT|COURIER|TRANSPORT|LOGISTICS|SHIPPING|DELIVERY|FUEL/, category: 'logistics', capEx: null, revenue: true, tdsSection: '194C', note: 'freight/logistics (194C applicable)' },
  // ── Rent / premises ─────────────────────────────────────────────────────
  { id: 'r.rent-paid', pattern: /RENT(?![A-Z ]*RECEIVED)|LEASE/, category: 'rent_expense', capEx: null, revenue: true, tdsSection: '194I', note: 'rent paid' },
  // ── Professional services ───────────────────────────────────────────────
  { id: 'r.professional', pattern: /LEGAL|CA |CHARTERED|CONSULT|ADVISOR|AUDIT|TAX |ACCOUNT(?:ING|ANCY)|BOOK.? ?KEEP|ADVOCATE|SOLICITOR/, category: 'professional_fees', capEx: null, revenue: true, tdsSection: '194J', note: 'professional/technical fees' },
  { id: 'r.consulting', pattern: /MANAGEMENT FEE|TECHNICAL FEE|IT SERVICES|SOFTWARE|AMS |HOSTING/, category: 'consulting_it', capEx: null, revenue: true, tdsSection: '194J', note: 'technical/IT services' },
  // ── Loans / capital ─────────────────────────────────────────────────────
  { id: 'r.loan-received', pattern: /LOAN.*(RECEIVED|FROM)|PROPRIETOR.*(CAPITAL|INTRO)|CREDIT.*FROM|PARTNER.*CAPITAL|CAPITAL.*(INTRODUCED|RECEIVED)|UNSECURED/, category: 'loan_capital_in', capEx: null, revenue: null, tdsSection: null, note: 'loan/proprietor capital inflow' },
  { id: 'r.loan-paid', pattern: /LOAN.*(REPAY|PAID)|REPAYMENT|PRINCIPAL/, category: 'loan_capital_out', capEx: null, revenue: null, tdsSection: null, note: 'loan repayment (non-revenue)' },
  { id: 'r.interest-paid', pattern: /INTEREST|INT\.? ?(PAID|DR)|OD INTEREST|FINANCE CHARGE|BANK CHARGES|SWIFT|COMMISSION/, category: 'finance_cost', capEx: null, revenue: true, tdsSection: null, note: 'interest/bank charges' },
  // ── Marketing ───────────────────────────────────────────────────────────
  { id: 'r.marketing', pattern: /ADVERT|MARKETING|PROMOTION|SPONSOR|BRAND/, category: 'marketing', capEx: null, revenue: true, tdsSection: '194C', note: 'marketing spend' },
  // ── Investments ─────────────────────────────────────────────────────────
  { id: 'r.investment', pattern: /MF |MUTUAL FUND|SHARE|BOND|SECURITY|STOCK|SIP/, category: 'investments', capEx: null, revenue: null, tdsSection: null, note: 'investment (non-revenue)' },
  // ── Drawings / owners ───────────────────────────────────────────────────
  { id: 'r.drawing', pattern: /DRAWING|PROPRIETOR|PARTNER/, category: 'drawings', capEx: null, revenue: null, tdsSection: null, note: 'owner drawings' },
  // ── Transfer / contra ───────────────────────────────────────────────────
  { id: 'r.transfer', pattern: /TRANSFER|CONTRA|FDR |FD |SWEEP IN|SWEEP OUT|FIXED DEPOSIT/, category: 'transfer', capEx: null, revenue: null, tdsSection: null, note: 'internal account transfer' }
];

// TDS section autodetect from narration + amount context.
// Only fires when the narration clearly cites a section. Never fabricates one.
function detectTdsSection(narration, inflow) {
  const upper = narration.toUpperCase();
  const m = upper.match(/SECTION\s*([0-9][0-9A-Z-]*)/);
  if (m) return m[1];
  // Known 194-family words
  for (const [word, sec] of [
    ['SALARY', '192'], ['CONTRACT', '194C'], ['RENT', '194I'], ['COMMISSION', '194H'],
    ['PROFESSIONAL', '194J'], ['CONSULT', '194J'], ['LEGAL', '194J'], ['ROYALTY', '194J'],
    ['INTEREST', '194A'], ['DIVIDEND', '194'], ['WINNING', '194B']
  ]) {
    if (upper.includes(word)) {
      // RENT received by THE FIRM is not subject to 194I deduction by it.
      if (word === 'RENT' && inflow) continue;
      return sec;
    }
  }
  return null;
}

export function classify(narration, opts = {}) {
  const text = String(narration || '').trim();
  if (!text) return { category: 'unclassified', isCapEx: null, isRevenue: null, tdsSection: null, ruleIds: [], confidence: 'none' };

  const upper = text.toUpperCase();
  let matched = null;
  for (const rule of RULES) {
    // .source strips flags so we can build a case-insensitive search safely
    if (new RegExp(rule.pattern, 'i').test(upper)) { matched = rule; break; }
  }

  const inflow = opts.kind === 'credit';
  const tdsSection = detectTdsSection(text, inflow) || (matched ? matched.tdsSection : null);

  return {
    category: matched ? matched.category : 'unclassified',
    isCapEx: matched ? resolveCapEx(matched, text) : deriveCapEx(text),
    isRevenue: matched ? (matched.revenue ?? (matched.capEx === true ? false : null)) : null,
    tdsSection,
    ruleIds: matched ? [matched.id] : [],
    note: matched ? matched.note : null,
    confidence: matched ? 'rule' : 'none'
  };
}

// A transaction explicitly booked as revenue (or capital) pins BOTH flags:
// revenue income/expense is by definition NOT capex, and a capital-asset
// acquisition is not revenue. Unknowns fall back to keyword detection.
function resolveCapEx(matched, text) {
  if (matched.capEx === true) return true;
  if (matched.capEx === false) return false;
  if (matched.revenue === true) return false;
  return deriveCapEx(text);
}

function deriveCapEx(text) {
  const upper = text.toUpperCase();
  const capexKws = ['MACHIN', 'EQUIPMENT', 'PLANT', 'COMPUTER', 'LAPTOP', 'FURNITURE', 'VEHICLE', 'BUILDING', 'LAND', 'IMPROVEMENT'];
  if (capexKws.some((k) => upper.includes(k))) return true;
  return null;
}

export { RULES };