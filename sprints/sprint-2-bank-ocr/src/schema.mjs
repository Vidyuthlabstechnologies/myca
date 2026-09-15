// schema.mjs
// Canonical schema for Indian bank statement ingestion.
// Handles the messy reality: every bank exports different headers.
// Three ingestion paths:
//   1. CSV/Matrix exports (most banks: HDFC, ICICI, SBI, Axis, Kotak...)
//   2. Fixed-width TXT (HDFC/ICICI monthly text statements)
//   3. PDF -> text/OCR extraction (via ocr.mjs -> same canonical shape)
//
// Canonical transaction => { date, type, narration, refNo, debit, credit,
//   balance, openingBalance, ifsc, bank, chequeNo, _blocking, ... }

export const REQUIRED_COLUMNS = ['date', 'narration'];

// Presence of either a Debit/Credit/Amount column, OR a Balance column, is enough
// to reconstruct entries (one-sided statements list only Opening Balance rows).
export const AMOUNT_COLUMNS = ['debit', 'credit', 'amount', 'balance'];

export const COLUMN_ALIASES = {
  date: [
    'Date', 'Txn Date', 'Transaction Date', 'Value Date', 'Posting Date',
    'Txn. Date', 'Trans Date', 'Date of Transaction', 'Statement Date'
  ],
  narration: [
    'Narration', 'Description', 'Particulars', 'Details', 'Remarks',
    'Transaction Details', 'Transaction Description', 'Transaction Remarks',
    'Txn Description', 'Description/Narrative', 'Narrative', 'Memo', 'Narration (DB/CR)'
  ],
  debit: [
    'Withdrawal', 'Withdrawal Amt', 'Withdrawal Amt.', 'Withdrawal Amount',
    'Withdrawals', 'Debit', 'Dr', 'Dr Amount', 'Debit Amount', 'Money Out',
    'Payments', 'Chq Withdrawn', 'Cheque Withdrawal', 'Debit (Rs)', 'Dr (Rs)',
    'Withdrawal (Dr)'
  ],
  credit: [
    'Deposit', 'Deposit Amt', 'Deposit Amt.', 'Deposit Amount', 'Deposits',
    'Credit', 'Cr', 'Cr Amount', 'Credit Amount', 'Money In', 'Receipts',
    'Cheque Deposited', 'Chq Deposited', 'Credit (Rs)', 'Cr (Rs)', 'Deposit (Cr)'
  ],
  balance: [
    'Balance', 'Closing Balance', 'Balance Amount', 'Balance Amt', 'Running Balance',
    'Available Balance', 'Bal', 'Ledger Balance', 'Book Balance', 'Balance (Rs)'
  ],
  refNo: [
    'Ref No', 'Ref No.', 'Reference', 'Reference No', 'Ref/Cheque No',
    'Chq/Ref Number', 'Cheque No', 'Cheque No.', 'Cheque Number', 'Chq No',
    'Transaction Ref', 'Ref Id', 'UTR', 'UTR No', 'RRN', 'NEFT Ref', 'RMTR', 'Ref number'
  ],
  openingBalance: ['Opening Balance', 'Opening Bal', 'Opening Balance (Rs)'],
  ifsc: ['IFSC', 'IFSC Code', 'Bank IFSC', 'IFSC Code (Branch)'],
  bank: ['Bank', 'Bank Name', 'Account Name'],
  accountNo: ['Account No', 'A/c No', 'Account Number', 'A/C No']
};

export const OPTIONAL_COLUMNS = [
  'debit', 'credit', 'balance', 'refNo', 'openingBalance', 'ifsc', 'bank', 'accountNo'
];

export const ALL_CANONICAL = [...REQUIRED_COLUMNS, ...AMOUNT_COLUMNS, ...OPTIONAL_COLUMNS];

export function normalizeHeader(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*\(db\/cr\)$/i, '')
    .replace(/\.+$/, '');
}