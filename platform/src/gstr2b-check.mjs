import { createHash } from 'node:crypto';
import { gst } from './sprint-load.mjs';
import { isReturnPeriod, periodOf } from './return-period.mjs';
import { localToday } from './dates.mjs';
import { csvRawRows } from './text-safe.mjs';

const { parseGstr2B, match2B, itcOf, reconcile } = gst;

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const OWN_NUMBER = /^BILL-\d+$/;
const SUMMED = ['taxableValue', 'cgst', 'sgst', 'igst', 'cess', 'totalValue'];
const LESS_AVAILABLE = ['N', 'A'];
const NAME_KEY_MAX = 40;
const NAME_HASH_LENGTH = 8;
const STATEMENT_COLUMNS = [
  ['SECTION', 'section'],
  ['SUPPLIER GSTIN', 'supplierGstin'],
  ['SUPPLIER NAME', 'supplierName'],
  ['INVOICE NO', 'invoiceNo'],
  ['INVOICE DATE', 'invoiceDate'],
  ['TAXABLE VALUE', 'taxableValue'],
  ['CGST', 'cgst'],
  ['SGST', 'sgst'],
  ['IGST', 'igst'],
  ['CESS', 'cess'],
  ['TOTAL VALUE', 'totalValue'],
  ['ITC AVAILABILITY', 'itcAvailability'],
];

export function normNumber(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function normGstin(value) {
  return String(value ?? '').trim().toUpperCase();
}

export function supplierNumberOf(bill) {
  const own = String(bill.supplierInvoiceNo ?? '').trim();
  if (own) return own;
  return OWN_NUMBER.test(String(bill.id)) ? '' : String(bill.id);
}

export function parse2bFile(csv) {
  const parsed = parseGstr2B(String(csv ?? ''));
  return { rows: parsed.rows || [], errors: parsed.errors || [] };
}

export function import2b(state, args = {}) {
  const period = String(args.period || '').trim();
  if (!isReturnPeriod(period)) return { ok: false, error: 'INVALID_PERIOD', hint: 'Say which month this 2B is for, as YYYY-MM.' };
  const { rows, errors } = parse2bFile(args.csv);
  if (!rows.length) return { ok: false, error: 'NO_ROWS', errors: errors.slice(0, 5) };
  state.gstr2b = state.gstr2b && typeof state.gstr2b === 'object' ? state.gstr2b : {};
  const replaced = Object.hasOwn(state.gstr2b, period);
  state.gstr2b[period] = {
    fileName: String(args.fileName || 'GSTR-2B.csv').slice(0, 120),
    importedOn: localToday(),
    rows,
    skipped: errors.length,
  };
  return { ok: true, period, rows: rows.length, skipped: errors.length, replaced };
}

export function allRows(state) {
  const stored = state.gstr2b && typeof state.gstr2b === 'object' ? state.gstr2b : {};
  return Object.entries(stored).flatMap(([period, entry]) => (entry.rows || []).map((row) => ({ ...row, statementPeriod: period })));
}

function supplierKey(row) {
  const gstin = normGstin(row.supplierGstin);
  if (gstin) return gstin;
  const name = normNumber(row.supplierName);
  if (name.length <= NAME_KEY_MAX) return name;
  return name.slice(0, NAME_KEY_MAX) + createHash('sha256').update(name).digest('hex').slice(0, NAME_HASH_LENGTH).toUpperCase();
}

export function documentKey(scope, row) {
  return `${scope}|${supplierKey(row)}|${normNumber(row.invoiceNo)}|${String(row.section || '').toUpperCase()}`;
}

function oneDocument(lines) {
  if (lines.length === 1) return lines[0];
  const added = Object.fromEntries(SUMMED.map((head) => [head, round2(lines.reduce((total, line) => total + (Number(line[head]) || 0), 0))]));
  const lesser = LESS_AVAILABLE.find((code) => lines.some((line) => line.itcAvailability === code));
  return { ...lines[0], ...added, itcAvailability: lesser || lines[0].itcAvailability };
}

export function documentsOf(rows, { byDate = false } = {}) {
  const groups = new Map();
  for (const row of rows) {
    const key = byDate ? `${documentKey(row.statementPeriod ?? '', row)}|${row.invoiceDate ?? ''}` : documentKey(row.statementPeriod ?? '', row);
    if (groups.has(key)) groups.get(key).push(row);
    else groups.set(key, [row]);
  }
  return [...groups].map(([key, lines]) => ({ key, raw: oneDocument(lines), lines: lines.length }));
}

function dayMonthYear(iso) {
  const [year, month, day] = String(iso || '').split('-');
  return year && month && day ? `${day}-${month}-${year}` : '';
}

export function statementText(rows) {
  const header = STATEMENT_COLUMNS.map(([name]) => name);
  const body = rows.map((row) => STATEMENT_COLUMNS.map(([, field]) => (field === 'invoiceDate' ? dayMonthYear(row.invoiceDate) : row[field])));
  return csvRawRows([header, ...body]);
}

export function reconcileDocuments(inputs, options) {
  if (typeof inputs?.gstr2bText !== 'string') return reconcile(inputs, options);
  const parsed = parseGstr2B(inputs.gstr2bText);
  const documents = documentsOf(parsed.rows, { byDate: true });
  if (documents.every((document) => document.lines === 1)) return reconcile(inputs, options);
  const merged = reconcile({ ...inputs, gstr2bText: statementText(documents.map((document) => document.raw)) }, options);
  if (!parsed.errors.length) return merged;
  const { parserErrors } = reconcile(inputs, options);
  return { ...merged, ok: false, parserErrors, summary: { ...merged.summary, ok: false } };
}

function billRow(bill) {
  return {
    gstin: normGstin(bill.partyGstin),
    invoiceNo: supplierNumberOf(bill),
    invoiceDate: bill.date,
    taxableValue: round2(bill.taxable),
    cgst: round2(bill.cgst),
    sgst: round2(bill.sgst),
    igst: round2(bill.igst),
    cess: 0,
    billId: bill.id,
    supplierName: bill.partyName,
  };
}

export function creditAtRisk(state, { period } = {}) {
  const wanted = String(period || '').trim() || localToday().slice(0, 7);
  if (!isReturnPeriod(wanted)) return { ok: false, error: 'INVALID_PERIOD', hint: 'Use YYYY-MM, for example 2026-09.' };
  const stored = state.gstr2b && typeof state.gstr2b === 'object' && Object.hasOwn(state.gstr2b, wanted) ? state.gstr2b[wanted] : null;
  const twob = documentsOf(allRows(state), { byDate: true }).map((document) => document.raw);
  const bills = (state.purchases || []).filter((bill) => periodOf(bill.date) === wanted && itcOf(billRow(bill)) > 0);
  const risks = [];
  const numbered = [];
  for (const bill of bills) {
    const row = billRow(bill);
    if (!normGstin(bill.partyGstin)) continue;
    if (!row.invoiceNo) {
      risks.push({ ...riskBase(bill, row), reason: 'NO_SUPPLIER_NUMBER', why: 'Add the supplier\'s bill number so it can be found in 2B.' });
      continue;
    }
    numbered.push(row);
  }
  const match = match2B({ purchaseRegister: numbered, gstr2b: twob });
  let matchedCredit = 0;
  for (const m of match.matched) {
    const row = m.purchase;
    const bill = bills.find((item) => item.id === row.billId);
    if (String(m.invoice.itcAvailability || '').toUpperCase() === 'N') {
      risks.push({ ...riskBase(bill, row), reason: 'ITC_NOT_AVAILABLE', why: 'The supplier reported it, but 2B marks the credit as not available.', statementPeriod: m.invoice.statementPeriod });
      continue;
    }
    if (m.amountMismatch) {
      const heads = m.mismatches.map((d) => `${d.head === 'taxableValue' ? 'taxable value' : d.head.toUpperCase()} ${d.books} in your books, ${d.gstr2b} in 2B`).join('; ');
      risks.push({ ...riskBase(bill, row), reason: m.placeOfSupplyMismatch ? 'TAX_TYPE_DIFFERS' : 'AMOUNT_DIFFERS', why: m.placeOfSupplyMismatch ? `The supplier reported a different tax type: ${heads}.` : `The amounts differ: ${heads}.`, credit2b: itcOf(m.invoice), statementPeriod: m.invoice.statementPeriod });
      continue;
    }
    matchedCredit += itcOf(row);
  }
  for (const row of match.unmatched.inBooksNotIn2B) {
    const bill = bills.find((item) => item.id === row.billId);
    const sameNumber = twob.find((r) => normGstin(r.supplierGstin) === row.gstin && normNumber(r.invoiceNo) === normNumber(row.invoiceNo));
    if (sameNumber) {
      risks.push({ ...riskBase(bill, row), reason: 'DATE_DIFFERS', why: `2B has this bill dated ${sameNumber.invoiceDate}; your books have ${row.invoiceDate}.`, statementPeriod: sameNumber.statementPeriod });
      continue;
    }
    risks.push({ ...riskBase(bill, row), reason: 'NOT_IN_2B', why: stored ? 'The supplier has not reported this bill in any 2B you have added.' : 'No 2B has been added for this month yet.' });
  }
  const statementRows = twob.filter((r) => r.statementPeriod === wanted);
  const booked = new Set(numbered.map((row) => `${row.gstin}|${normNumber(row.invoiceNo)}`));
  const notBooked = statementRows
    .filter((r) => String(r.section || '').toUpperCase() !== 'CDNR' && !booked.has(`${normGstin(r.supplierGstin)}|${normNumber(r.invoiceNo)}`))
    .filter((r) => !(state.purchases || []).some((bill) => normGstin(bill.partyGstin) === normGstin(r.supplierGstin) && normNumber(supplierNumberOf(bill)) === normNumber(r.invoiceNo)))
    .map((r) => ({ supplier: r.supplierName, gstin: r.supplierGstin, invoiceNo: r.invoiceNo, date: r.invoiceDate, credit: itcOf(r) }));
  const bySupplier = new Map();
  for (const risk of risks) {
    const key = risk.gstin || risk.supplier;
    const entry = bySupplier.get(key) || { supplier: risk.supplier, gstin: risk.gstin, credit: 0, bills: 0 };
    entry.credit = round2(entry.credit + risk.credit);
    entry.bills += 1;
    bySupplier.set(key, entry);
  }
  return {
    ok: true,
    data: {
      period: wanted,
      statement: stored ? { fileName: stored.fileName, importedOn: stored.importedOn, rows: (stored.rows || []).length } : null,
      statements: Object.keys(state.gstr2b || {}).sort(),
      bills: bills.length,
      creditInBooks: round2(bills.reduce((sum, bill) => sum + itcOf(billRow(bill)), 0)),
      creditMatched: round2(matchedCredit),
      creditAtRisk: round2(risks.reduce((sum, risk) => sum + risk.credit, 0)),
      risks,
      bySupplier: [...bySupplier.values()].sort((a, b) => b.credit - a.credit),
      notBooked,
      caveat: 'Matching is on supplier GSTIN, bill number and date, as 2B reports them. It does not check whether the supplier has paid their tax.',
    },
  };
}

function riskBase(bill, row) {
  return {
    billId: bill.id,
    supplierInvoiceNo: row.invoiceNo,
    supplier: bill.partyName,
    gstin: row.gstin,
    date: bill.date,
    credit: itcOf(row),
  };
}
