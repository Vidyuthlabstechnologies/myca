// schema.mjs
// Canonical schema for a Tally Day Book / Purchase-Register export.
// Real Tally exports are inconsistent in column naming, so every canonical
// field maps to a set of accepted header aliases (normalized: lowercase,
// trimmed, internal whitespace collapsed, trailing spaces stripped).

export const REQUIRED_COLUMNS = ['date', 'voucherType'];

// The presence of at least one amount column is required at file level.
export const AMOUNT_COLUMNS = ['debit', 'credit', 'amount'];

export const COLUMN_ALIASES = {
  date: ['Date', 'Vch Date', 'Voucher Date', 'VoucherDate', 'Posting Date', 'Txn Date'],
  voucherType: ['Voucher Type', 'Vch Type', 'Type', 'VoucherType', 'Voucher', 'Vchtype'],
  voucherNo: ['Voucher No', 'Vch No', 'VchNo', 'Voucher Number', 'Bill No', 'Ref No', 'Voucher No.', 'No', 'Vch No.'],
  ledger: ['Particulars', 'Ledger', 'Ledger Name', 'Account Name', 'Party Name', 'Supplier', 'Customer', 'Party', 'Name', 'Particular'],
  debit: ['Debit', 'Dr', 'Dr Amount', 'Debit Amount', 'Debit Amt', 'Payment Amount'],
  credit: ['Credit', 'Cr', 'Cr Amount', 'Credit Amount', 'Credit Amt', 'Receipt Amount', 'Recv Amount'],
  amount: ['Amount', 'Total Amount', 'Bill Amount', 'Invoice Amount', 'Amount (R)', 'Amt'],
  narration: ['Narration', 'Description', 'Remarks', 'Notes', 'Narration/Spec. Extraction', 'Particulars Desc'],
  gstin: ['GSTIN', 'GSTIN of Recipient', 'Party GSTIN', 'GSTIN No', 'GSTIN No.', 'Recipient GSTIN', 'Supplier GSTIN'],
  gstRate: ['GST Rate', 'GST%', 'Rate', 'GST %', 'Tax Rate', 'GST Rate %'],
  hsn: ['HSN', 'SAC', 'HSN/SAC', 'HSN Code', 'SAC Code', 'HSN/SAC Code'],
  taxableValue: ['Taxable Value', 'Taxable Amount', 'Value', 'Taxable Amt'],
  cgst: ['CGST', 'CGST Amount', 'CGST Amt'],
  sgst: ['SGST', 'SGST/UTGST', 'SGST Amount', 'UTGST', 'SGST Amt', 'UTGST Amount'],
  igst: ['IGST', 'IGST Amount', 'IGST Amt'],
  tdsSection: ['TDS Section', 'Section', 'TDS Sec', 'TDS Section Code'],
  tdsRate: ['TDS Rate', 'TDS %', 'TDS Percentage', 'TDS Rate %'],
  tcsSection: ['TCS Section', 'TCS Sec'],
  tcsRate: ['TCS Rate', 'TCS %']
};

// Canonical keys that we know about but are optional in a Day Book export.
export const OPTIONAL_COLUMNS = [
  'voucherNo', 'ledger', 'narration', 'gstin', 'gstRate', 'hsn',
  'taxableValue', 'cgst', 'sgst', 'igst', 'tdsSection', 'tdsRate',
  'tcsSection', 'tcsRate'
];

export const ALL_CANONICAL = [...REQUIRED_COLUMNS, ...AMOUNT_COLUMNS, ...OPTIONAL_COLUMNS];

export function normalizeHeader(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\.+$/, '');
}

export const KNOWN_TDS_SECTIONS = new Set([
  '192', '193', '194', '194A', '194B', '194BB', '194C', '194D', '194E', '194EE',
  '194F', '194G', '194H', '194I', '194IA', '194IB', '194IC', '194J', '194K',
  '194LA', '194LBA', '194LBB', '194LBC', '194M', '194N', '194O', '194P', '194Q',
  '194R', '194S', '194T', '195', '195A', '196A', '206AA', '206AB', '206C',
  '206CA', '194-1', '194I'
]);

// Lenient GSTIN pattern (used to warn, not block). Real format:
// 2 digit state code + 5 PAN letters + 4 alnum + 1 letter + 1 checksum + "Z" + 1 flag
export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z][Z][0-9A-Z]$/;

// HSN/SAC is 4-8 digits (SAC codes may include dots in exports; normalize first)
export const HSN_PATTERN = /^\d{4,8}$/;