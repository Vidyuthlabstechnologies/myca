import { ACCOUNT_FLAGS, createAccounts, paise } from './ledger.mjs';

export const INTEREST_INCOME_ACCOUNT = { id: 4100, code: '4100', name: 'Interest income', type: 'income', flags: 0 };

export const COA = [
  { id: 1001, code: '1001', name: 'Cash', type: 'asset', flags: ACCOUNT_FLAGS.CREDITS_MUST_NOT_EXCEED_DEBITS },
  { id: 1002, code: '1002', name: 'Bank', type: 'asset', flags: 0 },
  { id: 1100, code: '1100', name: 'Trade receivables', type: 'asset', flags: 0 },
  { id: 1200, code: '1200', name: 'GST input CGST', type: 'asset', flags: 0 },
  { id: 1201, code: '1201', name: 'GST input SGST', type: 'asset', flags: 0 },
  { id: 1202, code: '1202', name: 'GST input IGST', type: 'asset', flags: 0 },
  { id: 2000, code: '2000', name: 'Trade payables', type: 'liability', flags: ACCOUNT_FLAGS.DEBITS_MUST_NOT_EXCEED_CREDITS },
  { id: 2100, code: '2100', name: 'GST output CGST', type: 'liability', flags: 0 },
  { id: 2101, code: '2101', name: 'GST output SGST', type: 'liability', flags: 0 },
  { id: 2102, code: '2102', name: 'GST output IGST', type: 'liability', flags: 0 },
  { id: 2200, code: '2200', name: 'TDS payable', type: 'liability', flags: 0 },
  { id: 3000, code: '3000', name: 'Capital', type: 'equity', flags: ACCOUNT_FLAGS.DEBITS_MUST_NOT_EXCEED_CREDITS },
  { id: 4000, code: '4000', name: 'Sales', type: 'income', flags: ACCOUNT_FLAGS.DEBITS_MUST_NOT_EXCEED_CREDITS },
  INTEREST_INCOME_ACCOUNT,
  { id: 5000, code: '5000', name: 'Purchases', type: 'expense', flags: 0 },
  { id: 5100, code: '5100', name: 'Operating expenses', type: 'expense', flags: 0 },
];

export const DEFAULT_COMPANY = {
  name: 'Nalanda Textiles LLP',
  gstin: '27AABCU9603R1ZN',
  state: '27',
  pan: 'AABCU9603R',
  fy: '2026-27',
  address: 'Pune, Maharashtra',
};

export function installChart(ledger) {
  createAccounts(ledger, COA);
}

export function ensureInterestIncomeAccount(state) {
  createAccounts(state.ledger, [INTEREST_INCOME_ACCOUNT]);
  return INTEREST_INCOME_ACCOUNT.id;
}

export function nextPartyId(state) {
  const used = (state.parties || []).map((p) => Number(p.accountId));
  let n = 90001;
  while (used.includes(n)) n += 1;
  return n;
}

// CGST and SGST are each levied at half the rate, so each is computed on its own
// in paise and they are always equal; IGST is levied at the full rate.
export function gstSplit({ taxable, rate, supplierState, partyState }) {
  const taxablePaise = Math.round(Number(taxable) * 100);
  const intra = supplierState === partyState;
  if (intra) {
    const half = Math.round((taxablePaise * rate) / 200) / 100;
    return { intra: true, cgst: half, sgst: half, igst: 0, tax: Math.round(half * 200) / 100 };
  }
  const igst = Math.round((taxablePaise * rate) / 100) / 100;
  return { intra: false, cgst: 0, sgst: 0, igst, tax: igst };
}

export function partyStateOf(gstin) {
  if (!gstin || gstin.length < 2) return '';
  return String(gstin).slice(0, 2);
}

export { paise };
