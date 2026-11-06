import { createHash } from 'node:crypto';
import { localToday, isoDate } from './dates.mjs';
import { rangeOf, runReportSpec, savedReportSpec, REPORT_PERIODS } from './reports.mjs';
import { rowsFor as entryRows, usRow, HEADER as ENTRIES_HEADER, HEADER_US as ENTRIES_HEADER_US } from './entries-export.mjs';
import { trialBalanceRows } from './trial-balance-export.mjs';
import { outstandingOf, receivedAgainst } from './credit-notes.mjs';
import { billOutstanding } from './invoice.mjs';
import { overdueBy } from './payment-terms.mjs';
import { supplierDues } from './supplier-dues.mjs';
import { cashForecast } from './cash-forecast.mjs';
import { deadlineRun } from './deadline-run.mjs';
import { creditAtRisk } from './gstr2b-check.mjs';
import { imsReview } from './ims.mjs';
import { tdsSummary } from './tds-deduction.mjs';
import { tdsCreditCheck, tdsWithheldOn } from './tds-credits.mjs';
import { fyOfPeriod } from './marketplace-credits.mjs';
import { skuMargins, stockPosition } from './sku-margins.mjs';
import { businessSummary } from './business-summary.mjs';
import { periodSummary } from './period-summary.mjs';
import { paymentFor } from './gst-payment.mjs';
import { regArg } from './registrations.mjs';
import { countryOf } from './country.mjs';
import { rupees } from './ledger.mjs';
import { xlsxWorkbook, sheetNames, XLSX_CONTENT_TYPE } from './xlsx.mjs';
import { auditEventsIn, auditSheetRows, verifyAuditChain, ledgerVerdict, AUDIT_SHEET_HEADER, AUDIT_SHEET_WIDTHS } from './audit-trail.mjs';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ACRONYMS = { gstin: 'GSTIN', cgst: 'CGST', sgst: 'SGST', igst: 'IGST', gst: 'GST', tds: 'TDS', tcs: 'TCS', msme: 'MSME', sku: 'SKU', itc: 'ITC', gstr1: 'GSTR-1', b2b: 'B2B', b2cl: 'B2CL', b2cs: 'B2CS', cdnr: 'CDNR', cdnur: 'CDNUR', fp: 'Return period', tan: 'TAN', pan: 'PAN', id: 'ID', ifsc: 'IFSC', hsn: 'HSN', cogs: 'Cost of goods', ein: 'EIN', pct: '%' };
const BANK_STATUS = { unmatched: 'Not matched yet', matched: 'Matched', booked: 'Booked', ignored: 'Ignored' };
const GROUP_LABELS = { customer: 'Customer', supplier: 'Supplier', head: 'Head', month: 'Month', none: 'Item' };

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function money(value) {
  return value == null || value === '' ? '' : round2(value);
}

function text(value) {
  return value == null ? '' : String(value);
}

function yesNo(value) {
  return value ? 'Yes' : 'No';
}

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

export function words(key) {
  const parts = String(key).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_.]/g, ' ').toLowerCase().split(/\s+/).filter(Boolean);
  return parts.map((part, i) => ACRONYMS[part] || (i === 0 ? part[0].toUpperCase() + part.slice(1) : part)).join(' ');
}

function headerWords(keys) {
  return keys.map(words);
}

export function periodRange(args = {}, today = localToday()) {
  const period = String(args.period || '').trim();
  const from = args.from == null || args.from === '' ? '' : isoDate(args.from);
  const to = args.to == null || args.to === '' ? '' : isoDate(args.to);
  if (from === null || to === null || (from && to && from > to)) return fail('INVALID_DATE');
  if (from || to) {
    const end = to || today;
    const month = from && to && from.slice(0, 7) === to.slice(0, 7) && from.endsWith('-01') && rangeOf(from.slice(0, 7), today).to === to ? from.slice(0, 7) : '';
    return { ok: true, from, to: end, label: `${from || 'the start'} to ${end}`, tag: month || `${from || 'start'}-to-${end}`, month };
  }
  if (period && !MONTH.test(period) && !REPORT_PERIODS.includes(period)) return fail('BAD_PERIOD', { hint: REPORT_PERIODS.join(', ') });
  const range = rangeOf(period, today);
  const month = range.from.slice(0, 7) === range.to.slice(0, 7) ? range.from.slice(0, 7) : '';
  return { ok: true, from: range.from, to: range.to, label: range.label, tag: month || `${range.from}-to-${range.to}`, month };
}

function monthOnly(args, today) {
  const range = periodRange(args, today);
  if (!range.ok) return range;
  if (!range.month) return fail('MONTH_REQUIRED', { hint: 'Use one month, for example 2026-10.' });
  return range;
}

function inRange(range) {
  return (doc) => DAY.test(String(doc?.date || '')) && doc.date >= range.from && doc.date <= range.to;
}

function monthsWithEntries(state, range) {
  const within = inRange(range);
  const months = new Set();
  const add = (doc) => {
    if (within(doc)) months.add(doc.date.slice(0, 7));
  };
  for (const inv of state.invoices || []) {
    add(inv);
    for (const receipt of inv.receipts || []) add(receipt);
  }
  for (const bill of state.purchases || []) {
    add(bill);
    for (const payment of bill.payments || []) add(payment);
  }
  for (const list of [state.creditNotes, state.debitNotes, state.purchaseNotes, state.expenses]) for (const doc of list || []) add(doc);
  return [...months].sort();
}

function byDateThenId(a, b) {
  return String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id));
}

function sheet(name, header, rows, widths) {
  return { name, header, rows, ...(widths ? { widths } : {}) };
}

function done(sheets, tag, label) {
  return { ok: true, sheets, rows: sheets.reduce((sum, item) => sum + item.rows.length, 0), tag, label };
}

function cellOf(value) {
  if (value == null) return '';
  if (typeof value === 'boolean') return yesNo(value);
  if (typeof value === 'number') return Number.isFinite(value) ? round2(value) : '';
  if (Array.isArray(value)) return value.filter((item) => item == null || typeof item !== 'object').map((item) => text(item)).join('; ');
  if (typeof value === 'object') return '';
  return String(value);
}

function flatten(value, segments, pairs, tables) {
  if (Array.isArray(value)) {
    if (!value.length) return;
    if (value.some((item) => item && typeof item === 'object' && !Array.isArray(item))) tables.push({ name: words(segments.join(' ')), rows: value });
    else pairs.push([words(segments.join(' ')), cellOf(value)]);
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) flatten(child, [...segments, key], pairs, tables);
    return;
  }
  pairs.push([words(segments.join(' ')), cellOf(value)]);
}

function tableSheet(name, rows) {
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row || {}).filter((key) => row[key] == null || typeof row[key] !== 'object' || Array.isArray(row[key]))))];
  return sheet(name, headerWords(keys), rows.map((row) => keys.map((key) => cellOf(row?.[key]))));
}

export function summarySheets(title, data, { skip = [] } = {}) {
  const pairs = [];
  const tables = [];
  for (const [key, value] of Object.entries(data || {})) {
    if (skip.includes(key) || key === 'ok') continue;
    flatten(value, [key], pairs, tables);
  }
  return [sheet(title, ['Item', 'Value'], pairs, [36, 24]), ...tables.map((table) => tableSheet(table.name, table.rows))];
}

function trialBalance(state, args, today) {
  const { header, rows, total } = trialBalanceRows(state);
  return done([sheet('Trial balance', headerWords(header), [...rows, total], [10, 36, 12, 16, 16, 16, 16])], today, `as of ${today}`);
}

function entries(state, args, today) {
  const range = periodRange(args, today);
  if (!range.ok) return range;
  const us = countryOf(state) === 'US';
  const rows = monthsWithEntries(state, range).flatMap((month) => entryRows(state, month)).filter((row) => row[0] >= range.from && row[0] <= range.to);
  const header = headerWords(us ? ENTRIES_HEADER_US : ENTRIES_HEADER);
  const widths = us ? [12, 14, 12, 28, 18, 32] : [12, 14, 12, 28, 18, 16, 32];
  return done([sheet('Entries', header, us ? rows.map(usRow) : rows, widths)], range.tag, range.label);
}

function documentDates(state) {
  const dates = new Map();
  for (const list of [state.invoices, state.purchases, state.creditNotes, state.debitNotes, state.purchaseNotes, state.expenses]) {
    for (const doc of list || []) if (doc?.id && DAY.test(String(doc.date || ''))) dates.set(doc.id, doc.date);
  }
  return dates;
}

const DAY_BOOK_HEADER = ['Date', 'Transfer', 'Debit account', 'Credit account', 'Amount', 'Code', 'Document'];
const DAY_BOOK_WIDTHS = [12, 12, 30, 30, 14, 14, 14];

function dayBookRows(state, range) {
  const names = new Map([...state.ledger.accounts.values()].map((account) => [account.id.toString(), `${account.code} ${account.name}`]));
  const dates = documentDates(state);
  const rows = [];
  for (const transfer of state.ledger.transfers) {
    if (!transfer.posted || transfer.pendingId != null) continue;
    const date = typeof transfer.userData === 'string' && DAY.test(transfer.userData) ? transfer.userData : dates.get(transfer.invoiceId) || '';
    if (!date || date < range.from || date > range.to) continue;
    const debit = transfer.debitAccountId.toString();
    const credit = transfer.creditAccountId.toString();
    rows.push([date, transfer.id.toString(), names.get(debit) || debit, names.get(credit) || credit, rupees(transfer.amount), text(transfer.code), text(transfer.invoiceId)]);
  }
  rows.sort((a, b) => a[0].localeCompare(b[0]));
  return rows;
}

function dayBook(state, args, today) {
  const range = periodRange(args, today);
  if (!range.ok) return range;
  return done([sheet('Day book', DAY_BOOK_HEADER, dayBookRows(state, range), DAY_BOOK_WIDTHS)], range.tag, range.label);
}

function sales(state, args, today) {
  const range = periodRange(args, today);
  if (!range.ok) return range;
  const us = countryOf(state) === 'US';
  const invoices = (state.invoices || []).filter(inRange(range)).sort(byDateThenId);
  const withheld = !us && invoices.some((inv) => tdsWithheldOn(inv) > 0);
  const rows = invoices.map((inv) => {
    const tds = tdsWithheldOn(inv);
    const received = round2(receivedAgainst(inv) - tds);
    const outstanding = inv.status === 'cancelled' ? 0 : outstandingOf(state, inv);
    return us
      ? [inv.date, inv.id, inv.partyName, money(inv.subtotal ?? inv.taxable), money(inv.salesTax), money(inv.total), received, outstanding, text(inv.status)]
      : [inv.date, inv.id, inv.partyName, text(inv.partyGstin), money(inv.taxable), money(inv.cgst), money(inv.sgst), money(inv.igst), money(inv.total), received, ...(withheld ? [tds] : []), outstanding, text(inv.status)];
  });
  const header = us
    ? ['Date', 'Number', 'Customer', 'Subtotal', 'Sales tax', 'Total', 'Received', 'Outstanding', 'Status']
    : ['Date', 'Number', 'Customer', 'GSTIN', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total', 'Received', ...(withheld ? ['TDS withheld'] : []), 'Outstanding', 'Status'];
  return done([sheet('Sales', header, rows, us ? [12, 12, 32] : [12, 12, 32, 18])], range.tag, range.label);
}

function inputCreditAmount(item) {
  return item.inputCredit ? round2(Number(item.cgst || 0) + Number(item.sgst || 0) + Number(item.igst || 0)) : 0;
}

function paidAgainst(bill) {
  return round2((bill.payments || []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
}

function purchases(state, args, today) {
  const range = periodRange(args, today);
  if (!range.ok) return range;
  const us = countryOf(state) === 'US';
  const bills = (state.purchases || []).filter(inRange(range)).sort(byDateThenId);
  const rows = bills.map((bill) => {
    const outstanding = bill.status === 'cancelled' ? 0 : billOutstanding(bill);
    return us
      ? [bill.date, bill.id, text(bill.supplierInvoiceNo), bill.partyName, money(bill.subtotal ?? bill.taxable), money(bill.salesTaxPaid), money(bill.total), paidAgainst(bill), outstanding, text(bill.status)]
      : [bill.date, bill.id, text(bill.supplierInvoiceNo), bill.partyName, text(bill.partyGstin), money(bill.taxable), money(bill.cgst), money(bill.sgst), money(bill.igst), money(bill.total), paidAgainst(bill), outstanding, text(bill.status)];
  });
  const header = us
    ? ['Date', 'Number', 'Supplier bill', 'Supplier', 'Subtotal', 'Sales tax', 'Total', 'Paid', 'Outstanding', 'Status']
    : ['Date', 'Number', 'Supplier bill', 'Supplier', 'GSTIN', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total', 'Paid', 'Outstanding', 'Status'];
  return done([sheet('Purchases', header, rows, us ? [12, 12, 16, 32] : [12, 12, 16, 32, 18])], range.tag, range.label);
}

function expenses(state, args, today) {
  const range = periodRange(args, today);
  if (!range.ok) return range;
  const us = countryOf(state) === 'US';
  const list = (state.expenses || []).filter(inRange(range)).sort(byDateThenId);
  const rows = list.map((item) => (us
    ? [item.date, item.id, text(item.headName), text(item.description), text(item.payee), text(item.mode), money(item.amount)]
    : [item.date, item.id, text(item.headName), text(item.description), text(item.payee), text(item.supplierGstin), text(item.mode), money(item.taxable), money(item.cgst), money(item.sgst), money(item.igst), yesNo(item.inputCredit), inputCreditAmount(item), money(item.amount)]));
  const header = us
    ? ['Date', 'Number', 'Head', 'Description', 'Payee', 'Paid by', 'Amount']
    : ['Date', 'Number', 'Head', 'Description', 'Payee', 'GSTIN', 'Paid by', 'Taxable', 'CGST', 'SGST', 'IGST', 'Input credit', 'Input credit amount', 'Amount'];
  return done([sheet('Expenses', header, rows, [12, 12, 18, 36, 24])], range.tag, range.label);
}

function creditNotes(state, args, today) {
  const range = periodRange(args, today);
  if (!range.ok) return range;
  const notes = (state.creditNotes || []).filter(inRange(range)).sort(byDateThenId);
  const rows = notes.map((note) => [note.date, note.id, text(note.invoiceId), note.partyName, text(note.partyGstin), text(note.reason), money(note.taxable), money(note.cgst), money(note.sgst), money(note.igst), money(note.total), yesNo(note.cancels)]);
  return done([sheet('Credit notes', ['Date', 'Number', 'Invoice', 'Customer', 'GSTIN', 'Reason', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total', 'Cancels invoice'], rows, [12, 12, 12, 32, 18, 30])], range.tag, range.label);
}

function debitNotes(state, args, today) {
  const range = periodRange(args, today);
  if (!range.ok) return range;
  const onSales = (state.debitNotes || []).filter(inRange(range)).sort(byDateThenId).map((note) => [note.date, note.id, text(note.invoiceId), note.partyName, text(note.partyGstin), text(note.reason), money(note.taxable), money(note.cgst), money(note.sgst), money(note.igst), money(note.total)]);
  const toSuppliers = (state.purchaseNotes || []).filter(inRange(range)).sort(byDateThenId).map((note) => [note.date, note.id, text(note.billId), text(note.supplierInvoiceNo), note.partyName, text(note.partyGstin), text(note.reason), money(note.taxable), money(note.cgst), money(note.sgst), money(note.igst), money(note.total)]);
  return done([
    sheet('Debit notes', ['Date', 'Number', 'Invoice', 'Customer', 'GSTIN', 'Reason', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total'], onSales, [12, 12, 12, 32, 18, 30]),
    sheet('Debit notes to suppliers', ['Date', 'Number', 'Bill', 'Supplier bill', 'Supplier', 'GSTIN', 'Reason', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total'], toSuppliers, [12, 12, 12, 16, 32, 18, 30]),
  ], range.tag, range.label);
}

function customerDues(state, args, today) {
  const open = (state.invoices || []).filter((inv) => inv.status !== 'cancelled').map((inv) => ({ inv, due: outstandingOf(state, inv) })).filter((item) => item.due > 0.005);
  open.sort((a, b) => String(a.inv.dueDate || a.inv.date).localeCompare(String(b.inv.dueDate || b.inv.date)) || a.inv.id.localeCompare(b.inv.id));
  const withheld = open.some(({ inv }) => tdsWithheldOn(inv) > 0);
  const rows = open.map(({ inv, due }) => {
    const late = overdueBy(inv, today);
    const tds = tdsWithheldOn(inv);
    return [inv.partyName, text(inv.partyGstin), inv.id, inv.date, text(inv.dueDate), money(inv.total), round2(receivedAgainst(inv) - tds), ...(withheld ? [tds] : []), due, late == null ? '' : late];
  });
  return done([sheet('Customer dues', ['Customer', 'GSTIN', 'Invoice', 'Date', 'Due date', 'Total', 'Received', ...(withheld ? ['TDS withheld'] : []), 'Outstanding', 'Days overdue'], rows, [32, 18])], today, `as of ${today}`);
}

function supplierDuesSheet(state, args, today) {
  const out = supplierDues(state, { asOf: today });
  if (!out.ok) return out;
  const rows = out.data.bills.map((bill) => [bill.billId, bill.supplier, text(bill.gstin), bill.date, money(bill.total), money(bill.outstanding), bill.payBy, bill.daysLeft, yesNo(bill.overdue), yesNo(bill.msme)]);
  return done([
    sheet('Supplier dues', ['Bill', 'Supplier', 'GSTIN', 'Date', 'Total', 'Outstanding', 'Pay by', 'Days left', 'Overdue', 'MSME'], rows, [12, 32, 18]),
    ...summarySheets('Summary', { asOf: out.data.asOf, msme: out.data.msme, note: out.data.note }, { skip: [] }),
  ], today, `as of ${today}`);
}

function eventSheet(name, rows) {
  return sheet(name, ['Date', 'What', 'Amount', 'Basis'], (rows || []).map((row) => [row.date, text(row.label), money(row.amount), text(row.basis)]), [12, 36, 14, 48]);
}

function cashForecastSheets(state, args, today) {
  const clientId = String(state.activeClientId || 'SELF');
  const due = deadlineRun(state, { asOfDate: today });
  const out = cashForecast(state, { deadlines: (due.deadlines || []).filter((row) => row.clientId === clientId) });
  if (!out.ok) return out;
  const d = out.data;
  const summary = {
    from: d.from, until: d.until, days: d.days, startingBalance: d.start?.amount, startingBalanceSource: d.start?.source, comingIn: d.coming.total, goingOut: d.going.total, endingBalance: d.end,
    lowestBalance: d.lowest?.amount, lowestOn: d.lowest?.date, overdueNotCounted: d.overdue.total, unpaidOldBills: d.unpaidBills.total, monthlyOutgoings: d.monthlyOutgoings, notes: d.notes,
  };
  return done([
    ...summarySheets('Summary', summary),
    eventSheet('Coming in', d.coming.rows),
    eventSheet('Going out', d.going.rows),
    eventSheet('Overdue', d.overdue.rows),
    eventSheet('Unpaid bills', d.unpaidBills.rows),
    sheet('Balance by day', ['Date', 'Balance'], (d.balanceOn || []).map((row) => [row.date, money(row.amount)])),
    sheet('Risks', ['Risk'], (d.risks || []).map((risk) => [text(risk.text || risk)]), [80]),
  ], today, `${d.from} to ${d.until}`);
}

function creditAtRiskSheets(state, args, today) {
  const range = monthOnly(args, today);
  if (!range.ok) return range;
  const out = creditAtRisk(state, { period: range.month });
  if (!out.ok) return out;
  const d = out.data;
  return done([
    ...summarySheets('Summary', { period: d.period, statement: d.statement, statements: d.statements, bills: d.bills, creditInBooks: d.creditInBooks, creditMatched: d.creditMatched, creditAtRisk: d.creditAtRisk, caveat: d.caveat }),
    sheet('At risk', ['Bill', 'Supplier bill', 'Supplier', 'GSTIN', 'Date', 'Credit', 'Reason', 'Why'], (d.risks || []).map((risk) => [text(risk.billId), text(risk.supplierInvoiceNo), text(risk.supplier), text(risk.gstin), text(risk.date), money(risk.credit), text(risk.reason), text(risk.why)]), [12, 16, 32, 18, 12, 14, 18, 60]),
    sheet('By supplier', ['Supplier', 'GSTIN', 'Credit', 'Bills'], (d.bySupplier || []).map((row) => [text(row.supplier), text(row.gstin), money(row.credit), row.bills]), [32, 18]),
    sheet('In 2B, not in books', ['Supplier', 'GSTIN', 'Invoice', 'Date', 'Credit'], (d.notBooked || []).map((row) => [text(row.supplier), text(row.gstin), text(row.invoiceNo), text(row.date), money(row.credit)]), [32, 18]),
  ], range.tag, range.label);
}

const IMS_HEADER = ['Section', 'Supplier GSTIN', 'Supplier', 'Invoice no', 'Invoice date', 'Taxable value', 'CGST', 'SGST', 'IGST', 'Cess', 'Total', 'ITC', 'In books', 'Match', 'Suggested', 'Decision', 'Note', 'Decided by', 'Decided on'];
const IMS_MATCH_LABELS = { matched: 'Matched', 'amount differs': 'Amount differs', 'date differs': 'Date differs', 'not in books': 'Not in books' };
const IMS_DECISION_LABELS = { accept: 'Accept', reject: 'Reject', pending: 'Pending' };

function imsSheets(state, args, today) {
  const range = monthOnly(args, today);
  if (!range.ok) return range;
  const out = imsReview(state, { period: range.month });
  if (!out.ok) return out;
  const rows = out.data.rows.map((row) => [row.section, row.supplierGstin, row.supplierName, row.invoiceNo, row.invoiceDate, money(row.taxableValue), money(row.cgst), money(row.sgst), money(row.igst), money(row.cess), money(row.totalValue), money(row.credit), row.billId, IMS_MATCH_LABELS[row.match] || row.match, IMS_DECISION_LABELS[row.suggested] || '', IMS_DECISION_LABELS[row.decision] || '', row.note, row.decidedBy, row.decidedOn]);
  return done([sheet('IMS', IMS_HEADER, rows, [10, 18, 32, 16, 12])], range.tag, range.label);
}

function tdsSheets(state, args, today) {
  const out = tdsSummary(state);
  if (!out.ok) return out;
  const d = out.data;
  return done([
    ...summarySheets('Summary', { deductor: d.deductor, tan: d.tan, deducted: d.deducted, deposited: d.deposited, due: d.due }),
    sheet('By month', ['Month', 'Deducted', 'Deposit by'], (d.months || []).map((row) => [row.month, money(row.deducted), text(row.depositBy)])),
    sheet('By quarter', ['Quarter', 'Kind', 'Form', 'Deducted', 'Deposited', 'Shortfall', 'Due date', 'Approved', 'Filed on'], (d.quarters || []).map((row) => [row.quarter, text(row.kind), text(row.form), money(row.deducted), money(row.deposited), money(row.shortfall), text(row.dueDate), yesNo(row.approved), text(row.filed?.filedOn)])),
    sheet('Entries', ['Date', 'Document', 'Payee', 'PAN', 'Section', 'Basis', 'Rate %', 'TDS'], (d.entries || []).map((row) => [text(row.date), text(row.source), text(row.payee), text(row.pan), text(row.section), money(row.basis), row.rate == null ? '' : row.rate, money(row.tds)]), [12, 12, 32, 14]),
    sheet('Deposits', ['Deposit', 'Date', 'Amount', 'Challan', 'Paid by'], (d.deposits || []).map((row) => [text(row.id), text(row.date), money(row.amount), text(row.challan), text(row.mode)])),
  ], today, `as of ${today}`);
}

function tdsCreditSheets(state, args, today) {
  const range = periodRange(args, today);
  if (!range.ok) return range;
  const d = tdsCreditCheck(state, { fy: fyOfPeriod(range.to.slice(0, 7)) }).data;
  const rows = d.rows.map((row) => [row.section, text(row.tan), row.deductor, text(row.customer), row.quarter, money(row.in26as), money(row.inBooks), money(row.gap), row.status]);
  const summary = [
    ['Financial year', d.fy],
    ['Source', d.source],
    ['In 26AS', money(d.totals.in26as)],
    ['In books', money(d.totals.inBooks)],
    ['Gap (books minus 26AS)', money(d.totals.gap)],
    ['In 26AS but not in books', money(d.totals.notInBooks)],
    ['In books but not in 26AS', money(d.totals.notIn26as)],
    ['Note', d.note],
  ];
  return done([
    sheet('26AS vs books', ['Section', 'TAN', 'Deductor', 'Customer', 'Quarter', 'In 26AS', 'In books', 'Gap', 'Status'], rows, [10, 14, 34, 28, 12]),
    sheet('Summary', ['Item', 'Value'], summary, [36, 60]),
  ], today.slice(0, 7), `FY ${d.fy}`);
}

function marginsSheets(state, args, today) {
  const period = String(args.period || '').trim();
  const range = period || args.from || args.to ? monthOnly(args, today) : { ok: true, month: '', tag: today, label: `as of ${today}` };
  if (!range.ok) return range;
  const out = skuMargins(state, { period: range.month, channel: args.channel });
  if (!out.ok) return out;
  const d = out.data;
  const rows = (d.rows || []).map((row) => [row.sku, text(row.name), row.channel, row.units, row.returnedUnits, money(row.sales), money(row.returns), money(row.net), money(row.fees), money(row.cogs), money(row.margin), row.marginPercent == null ? '' : row.marginPercent, yesNo(row.costMissing)]);
  const byChannel = Object.entries(d.byChannel || {}).map(([channel, bucket]) => [channel, bucket.units, money(bucket.net), money(bucket.fees), money(bucket.cogs), money(bucket.margin), bucket.marginPercent == null ? '' : bucket.marginPercent]);
  return done([
    sheet('Margins', ['SKU', 'Name', 'Channel', 'Units', 'Returned', 'Sales', 'Returns', 'Net', 'Fees', 'Cost of goods', 'Margin', 'Margin %', 'Cost missing'], rows, [16, 32]),
    sheet('By channel', ['Channel', 'Units', 'Net', 'Fees', 'Cost of goods', 'Margin', 'Margin %'], byChannel),
    ...summarySheets('Summary', { period: d.period, channel: d.channel, totals: d.totals, costMissing: d.costMissing }),
  ], range.tag, range.label);
}

function stockSheets(state, args, today) {
  const out = stockPosition(state, { sku: args.sku, location: args.location });
  if (!out.ok) return out;
  const d = out.data;
  const rows = (d.rows || []).map((row) => [row.sku, text(row.name), row.location, row.qty, row.cost == null ? '' : money(row.cost), row.value == null ? '' : money(row.value), text(row.lastMove)]);
  return done([
    sheet('Stock', ['SKU', 'Name', 'Location', 'Quantity', 'Cost', 'Value', 'Last move'], rows, [16, 32, 16]),
    ...summarySheets('Summary', { value: d.value, locationsNegative: (d.negative || []).length }),
  ], today, `as of ${today}`);
}

function savedReport(state, args, today) {
  const name = String(args.name || '').trim();
  if (!name) return fail('NAME_REQUIRED');
  const found = savedReportSpec(state, name);
  if (!found.ok) return found;
  const result = runReportSpec(state, found.spec, today, { maxRows: Infinity });
  const before = new Map((result.compare?.rows || []).map((row) => [row.label, row.before]));
  const header = [GROUP_LABELS[result.groupBy] || 'Item', 'Amount', ...(result.compare ? [`Before (${result.compare.label})`] : [])];
  const rows = result.rows.map((row) => [row.label, money(row.amount), ...(result.compare ? [money(before.get(row.label) || 0)] : [])]);
  rows.push(['Total', money(result.total), ...(result.compare ? [money(result.compare.total)] : [])]);
  const balance = result.metric === 'owed' || result.metric === 'owing';
  const month = !balance && result.range.from.slice(0, 7) === result.range.to.slice(0, 7) ? result.range.from.slice(0, 7) : '';
  const tag = balance ? today : month || `${result.range.from}-to-${result.range.to}`;
  return done([sheet(found.name, header, rows, [36, 16, 16])], tag, result.range.label);
}

function businessSummarySheets(state, args, today) {
  const range = monthOnly(args, today);
  if (!range.ok) return range;
  const out = businessSummary(state, { period: range.month });
  if (!out.ok) return out;
  return done(summarySheets('Summary', out.data), range.tag, range.label);
}

function gstPeriodSheets(state, args, today) {
  const regd = regArg(state, args.gstin);
  if (!regd.ok) return regd;
  const period = String(args.period || '').trim();
  const range = period || args.from || args.to ? monthOnly(args, today) : null;
  if (range && !range.ok) return range;
  const summary = periodSummary(state, range ? range.month : '', regd.gstin);
  if (!summary.ok) return summary;
  const payment = paymentFor(state, summary.data.period, { gstin: regd.gstin });
  const data = { ...summary.data, payment: payment.ok ? payment.data : null, paymentError: payment.ok ? '' : payment.error };
  return done(summarySheets('Summary', data), summary.data.period, summary.data.period);
}

function bankAccountId(value) {
  const raw = String(value || '').trim();
  if (!raw || /^bank$/i.test(raw)) return '1002';
  if (/^cash$/i.test(raw)) return '1001';
  return raw;
}

function bankReconciliation(state, args, today) {
  const account = bankAccountId(args.account);
  const asked = Boolean(args.period || args.from || args.to);
  const range = asked ? periodRange(args, today) : null;
  if (range && !range.ok) return range;
  const lines = (Array.isArray(state.bankLines) ? state.bankLines : [])
    .filter((line) => String(line.account || '1002') === account)
    .filter((line) => !range || (line.date >= range.from && line.date <= range.to))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)));
  const rows = lines.map((line) => [line.date, text(line.narration), text(line.refNo), money(line.in), money(line.out), line.balance == null ? '' : money(line.balance), BANK_STATUS[line.status] || text(line.status), line.match ? [text(line.match.kind), text(line.match.id)].filter(Boolean).join(' ') : '']);
  return done([sheet('Bank reconciliation', ['Date', 'Narration', 'Reference', 'In', 'Out', 'Balance', 'Status', 'Matched to'], rows, [12, 48, 16, 14, 14, 14, 16, 22])], range ? range.tag : today, range ? range.label : `as of ${today}`);
}

function auditTrailSheets(state, args, today) {
  const range = periodRange(args, today);
  if (!range.ok) return range;
  const events = auditEventsIn(state, range, { view: 'all' }).events;
  const rows = auditSheetRows(events);
  const chain = verifyAuditChain(state.__root || state);
  const ledger = ledgerVerdict(state);
  const summary = [
    ['Period', range.label],
    ['Events', events.length],
    ['Changes', events.filter((event) => event.kind === 'change').length],
    ['Log chain', chain.ok ? `verified ${chain.chained} ${chain.chained === 1 ? 'event' : 'events'}` : `broken at ${chain.at}`],
    ['Ledger chain', ledger.ok ? 'ok' : `broken at ${ledger.at ?? 'an entry'}`],
    ['Ledger last checksum', ledger.ok ? String(ledger.last) : ''],
    ['Exported at (UTC ISO)', new Date().toISOString()],
    ['Audit sheet sha256', createHash('sha256').update(JSON.stringify(rows)).digest('hex')],
  ];
  return done([
    sheet('Audit trail', AUDIT_SHEET_HEADER, rows, AUDIT_SHEET_WIDTHS),
    sheet('Entries', DAY_BOOK_HEADER, dayBookRows(state, range), DAY_BOOK_WIDTHS),
    sheet('Summary', ['Item', 'Value'], summary, [28, 70]),
  ], range.tag, range.label);
}

export const REPORT_SHEETS = {
  trial_balance: { title: 'Trial balance', build: trialBalance },
  entries: { title: 'Entries', build: entries },
  day_book: { title: 'Day book', build: dayBook },
  sales: { title: 'Sales', build: sales },
  purchases: { title: 'Purchases', build: purchases },
  expenses: { title: 'Expenses', build: expenses },
  credit_notes: { title: 'Credit notes', build: creditNotes },
  debit_notes: { title: 'Debit notes', build: debitNotes },
  customer_dues: { title: 'Customer dues', build: customerDues },
  supplier_dues: { title: 'Supplier dues', build: supplierDuesSheet },
  cash_forecast: { title: 'Cash forecast', build: cashForecastSheets },
  credit_at_risk: { title: 'Credit at risk', country: 'IN', build: creditAtRiskSheets },
  ims_review: { title: 'IMS decisions', country: 'IN', build: imsSheets },
  tds_summary: { title: 'TDS', country: 'IN', build: tdsSheets },
  tds_credit_check: { title: 'Form 26AS check', country: 'IN', build: tdsCreditSheets },
  sku_margins: { title: 'Margins by SKU', build: marginsSheets },
  stock_position: { title: 'Stock on hand', build: stockSheets },
  saved_report: { title: 'Saved report', build: savedReport },
  business_summary: { title: 'Business summary', build: businessSummarySheets },
  gst_period_summary: { title: 'GST for one period', country: 'IN', build: gstPeriodSheets },
  bank_reconciliation: { title: 'Bank reconciliation', build: bankReconciliation },
  audit_trail: { title: 'Audit trail', build: auditTrailSheets },
};

export const REPORT_KEYS = Object.keys(REPORT_SHEETS);

export function reportSheet(state, key, args = {}) {
  const wanted = String(key || 'trial_balance').trim();
  const report = REPORT_SHEETS[wanted];
  if (!report) return fail('UNKNOWN_REPORT', { report: wanted, known: REPORT_KEYS });
  if (report.country && countryOf(state) !== report.country) return fail('NOT_FOR_COUNTRY', { tool: 'export_xlsx', report: wanted, country: countryOf(state) });
  const today = localToday();
  const built = report.build(state, args || {}, today);
  if (!built.ok) return built;
  const names = sheetNames(built.sheets.map((item) => item.name));
  const workbook = xlsxWorkbook(built.sheets);
  return {
    ok: true,
    data: {
      report: wanted,
      title: report.title,
      period: built.label,
      fileName: `myca-${wanted.replace(/_/g, '-')}-${built.tag}.xlsx`,
      contentType: XLSX_CONTENT_TYPE,
      xlsxBase64: workbook.toString('base64'),
      sheets: built.sheets.map((item, i) => ({ name: names[i], rows: item.rows.length })),
      rows: built.rows,
    },
  };
}
