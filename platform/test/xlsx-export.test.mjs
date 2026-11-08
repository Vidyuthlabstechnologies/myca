import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync, crc32 } from 'node:zlib';
import { createState } from '../src/store.mjs';
import { runTool, TOOLS } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { createInvoice, createPurchase, recordReceipt } from '../src/invoice.mjs';
import { xlsxWorkbook, sheetNames, XLSX_CONTENT_TYPE } from '../src/xlsx.mjs';
import { xmlText } from '../src/text-safe.mjs';
import { REPORT_KEYS, reportSheet } from '../src/report-sheets.mjs';
import { runReportSpec } from '../src/reports.mjs';
import { exportTrialBalance } from '../src/trial-balance-export.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';
import { toolServesCountry } from '../src/country.mjs';
import { assistantTools, validateAssistantToolCall, planLocalToolCall } from '../src/assistant-contract.mjs';
import { localToday } from '../src/dates.mjs';

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;

function unzip(buffer) {
  const parts = new Map();
  const locals = [];
  let offset = 0;
  while (buffer.readUInt32LE(offset) === LOCAL) {
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    const start = offset + 30 + nameLength + extraLength;
    const packedSize = buffer.readUInt32LE(offset + 18);
    assert.equal(buffer.readUInt16LE(offset + 4), 20, `${name}: version 2.0`);
    assert.equal(buffer.readUInt16LE(offset + 6), 0, `${name}: no flags, so sizes live in the header`);
    assert.equal(buffer.readUInt16LE(offset + 8), 8, `${name}: deflate`);
    const data = inflateRawSync(buffer.subarray(start, start + packedSize));
    assert.equal(data.length, buffer.readUInt32LE(offset + 22), `${name}: uncompressed size`);
    assert.equal(crc32(data), buffer.readUInt32LE(offset + 14), `${name}: crc`);
    parts.set(name, data.toString('utf8'));
    locals.push({ name, offset, crc: crc32(data), packedSize, size: data.length });
    offset = start + packedSize;
  }
  const directoryStart = offset;
  const central = [];
  while (buffer.readUInt32LE(offset) === CENTRAL) {
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    central.push({
      name: buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8'),
      crc: buffer.readUInt32LE(offset + 16),
      packedSize: buffer.readUInt32LE(offset + 20),
      size: buffer.readUInt32LE(offset + 24),
      localOffset: buffer.readUInt32LE(offset + 42),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  assert.equal(buffer.readUInt32LE(offset), END, 'the end record follows the central directory');
  assert.equal(buffer.readUInt16LE(offset + 8), locals.length, 'entry count on this disk');
  assert.equal(buffer.readUInt16LE(offset + 10), locals.length, 'entry count in total');
  assert.equal(buffer.readUInt32LE(offset + 12), offset - directoryStart, 'central directory size');
  assert.equal(buffer.readUInt32LE(offset + 16), directoryStart, 'central directory offset');
  assert.equal(offset + 22, buffer.length, 'nothing after the end record');
  assert.deepEqual(central.map((entry) => entry.name), locals.map((entry) => entry.name));
  for (const entry of central) {
    const local = locals.find((item) => item.name === entry.name);
    assert.equal(entry.localOffset, local.offset, `${entry.name}: directory offset points at its local header`);
    assert.equal(buffer.readUInt32LE(entry.localOffset), LOCAL);
    assert.equal(entry.crc, local.crc);
    assert.equal(entry.packedSize, local.packedSize);
    assert.equal(entry.size, local.size);
  }
  return parts;
}

const TOKEN = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[A-Za-z_][\w:.-]*="[^"<]*")*)\s*(\/?)>|([^<]+)|(<)/g;
const BARE_AMPERSAND = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/;

function assertWellFormed(xml, name) {
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'), `${name}: declaration`);
  const body = xml.slice(xml.indexOf('?>') + 2);
  const stack = [];
  let roots = 0;
  for (const token of body.matchAll(TOKEN)) {
    assert.equal(token[6], undefined, `${name}: malformed tag near ${body.slice(token.index, token.index + 40)}`);
    if (token[5] !== undefined) {
      assert.doesNotMatch(token[5], BARE_AMPERSAND, `${name}: bare & in text`);
      if (token[5].trim()) assert.ok(stack.length, `${name}: text outside the root element`);
      continue;
    }
    assert.doesNotMatch(token[3], BARE_AMPERSAND, `${name}: bare & in an attribute`);
    if (token[1] === '/') {
      assert.equal(stack.pop(), token[2], `${name}: </${token[2]}> closes the open element`);
      continue;
    }
    if (!stack.length) roots += 1;
    if (!token[4]) stack.push(token[2]);
  }
  assert.deepEqual(stack, [], `${name}: every element is closed`);
  assert.equal(roots, 1, `${name}: exactly one root element`);
}

function checkPackage(buffer) {
  assert.equal(buffer.subarray(0, 2).toString(), 'PK');
  const parts = unzip(buffer);
  for (const [name, xml] of parts) assertWellFormed(xml, name);
  const types = parts.get('[Content_Types].xml');
  const overrides = [...types.matchAll(/PartName="([^"]+)"/g)].map((m) => m[1]);
  const defaults = [...types.matchAll(/Default Extension="([^"]+)"/g)].map((m) => m[1]);
  for (const name of parts.keys()) {
    if (name === '[Content_Types].xml') continue;
    assert.ok(overrides.includes(`/${name}`) || defaults.includes(name.split('.').pop()), `${name} is declared in [Content_Types].xml`);
  }
  for (const partName of overrides) assert.ok(parts.has(partName.slice(1)), `${partName} exists`);
  const rels = parts.get('xl/_rels/workbook.xml.rels');
  for (const [, target] of rels.matchAll(/Target="(worksheets\/[^"]+)"/g)) assert.ok(parts.has(`xl/${target}`), `${target} exists`);
  for (const [, id] of parts.get('xl/workbook.xml').matchAll(/r:id="([^"]+)"/g)) assert.match(rels, new RegExp(`Id="${id}"`));
  assert.match(parts.get('_rels/.rels'), /Target="xl\/workbook.xml"/);
  assert.match(parts.get('xl/styles.xml'), /<cellXfs count="3">/);
  assert.match(parts.get('xl/styles.xml'), /formatCode="#,##0.00"/);
  return parts;
}

function cells(sheetXml, rowNumber) {
  const row = new RegExp(`<row r="${rowNumber}">(.*?)</row>`).exec(sheetXml);
  return row ? [...row[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*)>(.*?)<\/c>/g)].map((m) => ({ column: m[1], attrs: m[2], body: m[3] })) : null;
}

function unescape(text) {
  return text.replace(/&(amp|lt|gt|quot|#39);/g, (_, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[name]));
}

function values(sheetXml) {
  const rows = [];
  for (const row of sheetXml.matchAll(/<row r="(\d+)">(.*?)<\/row>/g)) {
    rows.push([...row[2].matchAll(/<c r="[A-Z]+\d+"[^>]*>(?:<is><t[^>]*>(.*?)<\/t><\/is>|<v>(.*?)<\/v>)<\/c>/g)].map((m) => (m[2] !== undefined ? Number(m[2]) : unescape(m[1]))));
  }
  return rows;
}

const SHEETS = [
  { name: 'A very long sheet name that goes past thirty one characters', header: ['Party', 'Amount', 'Note'], rows: [['Sharma & Sons <Pvt>', 1234.5, '=HYPERLINK("x")'], ['Plain', null, ''], [' lead', -5, 'tab\tin'], ['Big', 12345678.9, undefined]] },
  { name: 'Dup', header: ['A'], rows: [['x']] },
  { name: 'Dup', header: ['A'], rows: [[1]], widths: [30] },
];

test('the workbook is a clean zip of well-formed parts: crc and sizes tie, directory offsets land on the headers, every part is declared, bytes are deterministic', () => {
  const buffer = xlsxWorkbook(SHEETS);
  const parts = checkPackage(buffer);
  assert.deepEqual([...parts.keys()], ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet3.xml']);
  assert.ok(buffer.equals(xlsxWorkbook(SHEETS)), 'the same sheets give the same bytes');
  assert.ok(!buffer.equals(xlsxWorkbook([SHEETS[0]])));
});

test('cells: bold inline-string header, escaped text, formula-looking text stays text, numbers as values with the number style, blanks skipped, widths and sheet names', () => {
  const parts = unzip(xlsxWorkbook(SHEETS));
  const sheet = parts.get('xl/worksheets/sheet1.xml');
  const header = cells(sheet, 1);
  assert.deepEqual(header.map((c) => c.column), ['A', 'B', 'C']);
  for (const c of header) assert.match(c.attrs, /t="inlineStr" s="1"/);
  assert.equal(header[0].body, '<is><t>Party</t></is>');
  const first = cells(sheet, 2);
  assert.equal(first[0].body, '<is><t>Sharma &amp; Sons &lt;Pvt&gt;</t></is>');
  assert.equal(first[0].attrs, ' t="inlineStr"');
  assert.equal(first[1].attrs, ' s="2"');
  assert.equal(first[1].body, '<v>1234.5</v>');
  assert.equal(first[2].body, '<is><t>=HYPERLINK(&quot;x&quot;)</t></is>');
  assert.ok(!sheet.includes("'=HYPERLINK"), 'no CSV-style apostrophe in a spreadsheet cell');
  assert.deepEqual(cells(sheet, 3).map((c) => c.column), ['A'], 'null and the empty string make no cell');
  const third = cells(sheet, 4);
  assert.equal(third[0].body, '<is><t xml:space="preserve"> lead</t></is>');
  assert.equal(third[1].body, '<v>-5</v>');
  assert.equal(third[2].body, '<is><t xml:space="preserve">tab\tin</t></is>');
  assert.deepEqual(cells(sheet, 5).map((c) => c.column), ['A', 'B']);
  assert.match(sheet, /<dimension ref="A1:C5"\/>/);
  assert.match(sheet, /<col min="1" max="1" width="40" customWidth="1"\/><col min="2" max="2" width="14" customWidth="1"\/>/);
  assert.match(parts.get('xl/worksheets/sheet3.xml'), /<col min="1" max="1" width="30" customWidth="1"\/>/);
  assert.match(parts.get('xl/worksheets/sheet3.xml'), /<c r="A2" s="2"><v>1<\/v><\/c>/);
  const workbook = parts.get('xl/workbook.xml');
  assert.match(workbook, /<sheet name="A very long sheet name that goe" sheetId="1" r:id="rId1"\/>/);
  assert.match(workbook, /<sheet name="Dup" sheetId="2" r:id="rId2"\/>/);
  assert.match(workbook, /<sheet name="Dup \(2\)" sheetId="3" r:id="rId3"\/>/);
  assert.deepEqual(sheetNames(['Dup', 'dup', 'Dup', 'A/B:C*D?E[F]G\\H', '', 'x'.repeat(40), 'x'.repeat(40)]), ['Dup', 'dup (2)', 'Dup (3)', 'ABCDEFGH', 'Sheet5', 'x'.repeat(31), `${'x'.repeat(27)} (2)`]);
  const empty = unzip(xlsxWorkbook([]));
  assert.match(empty.get('xl/workbook.xml'), /<sheet name="Sheet1"/);
});

test('xmlText escapes markup and quotes, drops control characters, keeps tab and newline', () => {
  assert.equal(xmlText('a & b <c> "d" \'e\''), 'a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39;');
  assert.equal(xmlText('bad\u0000\u0001\u001f\u000bchars\u0007'), 'badchars');
  assert.equal(xmlText('tab\tnew\nline\r'), 'tab\tnew\nline\r');
  assert.equal(xmlText(null), '');
  assert.equal(xmlText(12.5), '12.5');
});

async function books() {
  const state = createState();
  state.company = { ...state.company, gstin: '27AABCU9603R1ZN' };
  const today = localToday();
  const sale = await runTool(state, 'create_invoice', { partyName: 'Sharma & Sons <Pvt>', partyGstin: '27AAACK1234F1Z5', lines: [{ description: 'Consulting', qty: 1, rate: 50000, gstRate: 18 }], date: today });
  assert.equal(sale.ok, true, JSON.stringify(sale));
  const receipt = await runTool(state, 'record_receipt', { invoiceId: 'INV-0001', amount: 20000, date: today });
  assert.equal(receipt.ok, true, JSON.stringify(receipt));
  return state;
}

test('export_xlsx on a book with an invoice and a receipt returns a real workbook: the sales sheet carries the invoice, what was received and what is still owed', async () => {
  const state = await books();
  const out = await runTool(state, 'export_xlsx', { report: 'sales' });
  assert.equal(out.ok, true, JSON.stringify(out));
  const d = out.data;
  assert.equal(d.contentType, XLSX_CONTENT_TYPE);
  assert.equal(d.contentType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.match(d.fileName, /^myca-sales-\d{4}-\d{2}\.xlsx$/);
  assert.deepEqual(d.sheets, [{ name: 'Sales', rows: 1 }]);
  assert.equal(d.rows, 1);
  assert.equal(d.report, 'sales');
  const buffer = Buffer.from(d.xlsxBase64, 'base64');
  assert.equal(buffer.subarray(0, 2).toString(), 'PK');
  const parts = checkPackage(buffer);
  const rows = values(parts.get('xl/worksheets/sheet1.xml'));
  assert.deepEqual(rows[0], ['Date', 'Number', 'Customer', 'GSTIN', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total', 'Received', 'Outstanding', 'Status']);
  assert.deepEqual(rows[1], [localToday(), 'INV-0001', 'Sharma & Sons <Pvt>', '27AAACK1234F1Z5', 50000, 4500, 4500, 0, 59000, 20000, 39000, 'partial']);
  assert.ok(!('csv' in d) && !('xml' in d), 'the Excel export carries bytes, not a text file');
});

test('the trial balance sheet is the CSV export plus its total row, with money as numbers', async () => {
  const state = await books();
  const out = await runTool(state, 'export_xlsx', { report: 'trial_balance' });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.match(out.data.fileName, /^myca-trial-balance-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const csvLines = exportTrialBalance(state).data.csv.trim().split('\n');
  const rows = values(checkPackage(Buffer.from(out.data.xlsxBase64, 'base64')).get('xl/worksheets/sheet1.xml'));
  assert.deepEqual(rows[0], ['Code', 'Account', 'Type', 'Debits posted', 'Credits posted', 'Closing debit', 'Closing credit']);
  assert.equal(rows.length, csvLines.length);
  assert.equal(out.data.rows, csvLines.length - 1);
  const bank = rows.find((row) => row[0] === '1002');
  assert.deepEqual(bank, ['1002', 'Bank', 'asset', 20000, 0, 20000, 0]);
  const total = rows[rows.length - 1];
  assert.equal(total[0], 'Total');
  assert.equal(total[1], 79000);
  assert.equal(total[2], 79000);
});

test('entries span the asked dates, the day book carries posting dates and account names, and a saved report is complete beyond the 20-row app view', async () => {
  const state = createState();
  state.company = { ...state.company, gstin: '27AABCU9603R1ZN' };
  for (let i = 1; i <= 25; i += 1) {
    const made = createInvoice(state, { date: `2026-10-${String((i % 28) + 1).padStart(2, '0')}`, partyName: `Customer ${String(i).padStart(2, '0')}`, lines: [{ description: 'Goods', qty: 1, rate: 1000 + i, gstRate: 18 }] });
    assert.equal(made.ok, true, JSON.stringify(made));
  }
  createInvoice(state, { date: '2026-08-15', partyName: 'August Buyer', lines: [{ description: 'Old', qty: 1, rate: 500, gstRate: 5 }] });
  assert.equal(recordReceipt(state, { invoiceId: 'INV-0026', amount: 525, date: '2026-09-02', mode: 'cash' }).ok, true);
  const bill = createPurchase(state, { date: '2026-10-06', partyName: 'Fabric Co', partyGstin: '27AABCT1332L1ZE', lines: [{ description: 'Grey cloth', hsn: '5208', qty: 1, rate: 400, gstRate: 5 }] });
  assert.equal(bill.ok, true, JSON.stringify(bill));
  const saved = await runTool(state, 'save_report', { name: 'Top customers', metric: 'sales', groupBy: 'customer', period: '2026-10' });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  assert.equal(saved.result.rows.length, 20, 'the app view stays capped at 20 rows');
  assert.equal(saved.result.more, 5);
  assert.equal(runReportSpec(state, saved.report, '2026-11-06', { maxRows: Infinity }).rows.length, 25);

  const report = await runTool(state, 'export_xlsx', { report: 'saved_report', name: 'Top customers' });
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.equal(report.data.fileName, 'myca-saved-report-2026-10.xlsx');
  assert.deepEqual(report.data.sheets, [{ name: 'Top customers', rows: 26 }]);
  const reportRows = values(checkPackage(Buffer.from(report.data.xlsxBase64, 'base64')).get('xl/worksheets/sheet1.xml'));
  assert.deepEqual(reportRows[0], ['Customer', 'Amount']);
  assert.equal(reportRows[1][0], 'Customer 25');
  assert.equal(reportRows[1][1], 1025);
  assert.deepEqual(reportRows[26], ['Total', saved.result.total]);
  assert.equal((await runTool(state, 'export_xlsx', { report: 'saved_report', name: 'Nope' })).error, 'REPORT_NOT_FOUND');
  assert.equal((await runTool(state, 'export_xlsx', { report: 'saved_report' })).error, 'NAME_REQUIRED');

  const entries = await runTool(state, 'export_xlsx', { report: 'entries', from: '2026-08-01', to: '2026-10-31' });
  assert.equal(entries.ok, true, JSON.stringify(entries));
  assert.equal(entries.data.fileName, 'myca-entries-2026-08-01-to-2026-10-31.xlsx');
  const entryRows = values(checkPackage(Buffer.from(entries.data.xlsxBase64, 'base64')).get('xl/worksheets/sheet1.xml'));
  assert.deepEqual(entryRows[0], ['Date', 'Type', 'Number', 'Party', 'Party GSTIN', 'Head', 'Description', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total', 'Paid by', 'Refers to']);
  const kinds = entryRows.slice(1).map((row) => row[1]);
  assert.equal(kinds.filter((kind) => kind === 'Sale').length, 26);
  assert.equal(kinds.filter((kind) => kind === 'Receipt').length, 1);
  assert.equal(entryRows.length, 29, 'header, an August sale, a September receipt, 25 October sales and one bill');
  assert.equal(entryRows[1][0], '2026-08-15');
  assert.deepEqual(entryRows[2], ['2026-09-02', 'Receipt', 'August Buyer', 525, 'cash', 'INV-0026'], 'blank cells are skipped, the rest keep their values');
  assert.deepEqual(entryRows.filter((row) => row[1] === 'Purchase').length, 1);
  const october = await runTool(state, 'export_xlsx', { report: 'entries', period: '2026-10' });
  assert.equal(october.data.fileName, 'myca-entries-2026-10.xlsx');
  assert.equal(october.data.rows, 26);
  assert.equal((await runTool(state, 'export_xlsx', { report: 'entries', period: 'this-quarter' })).ok, true);

  const dayBook = await runTool(state, 'export_xlsx', { report: 'day_book', period: '2026-09' });
  assert.equal(dayBook.ok, true, JSON.stringify(dayBook));
  const dayRows = values(checkPackage(Buffer.from(dayBook.data.xlsxBase64, 'base64')).get('xl/worksheets/sheet1.xml'));
  assert.deepEqual(dayRows[0], ['Date', 'Transfer', 'Debit account', 'Credit account', 'Amount', 'Code', 'Document']);
  assert.equal(dayRows.length, 2);
  assert.equal(dayRows[1][0], '2026-09-02');
  assert.equal(dayRows[1][2], '1001 Cash');
  assert.match(dayRows[1][3], /^90\d{3} AR · August Buyer$/);
  assert.equal(dayRows[1][4], 525);
  assert.equal(dayRows[1][5], 'RECEIPT');
  assert.equal(dayRows[1][6], 'INV-0026');
  const august = await runTool(state, 'export_xlsx', { report: 'day_book', period: '2026-08' });
  const augustRows = values(unzip(Buffer.from(august.data.xlsxBase64, 'base64')).get('xl/worksheets/sheet1.xml')).slice(1);
  assert.equal(augustRows.length, 3, 'the sale posting and its two GST legs take the invoice date');
  assert.ok(augustRows.every((row) => row[0] === '2026-08-15' && row[6] === 'INV-0026'));
  assert.equal(augustRows.reduce((sum, row) => sum + row[4], 0), 525);
  assert.ok(augustRows.some((row) => row[3] === '4000 Sales' && row[4] === 500));

  const dues = await runTool(state, 'export_xlsx', { report: 'customer_dues' });
  assert.equal(dues.ok, true);
  assert.equal(dues.data.rows, 25, 'the August invoice is settled, the October ones are open');
  const purchases = await runTool(state, 'export_xlsx', { report: 'purchases', period: '2026-10' });
  assert.equal(purchases.data.rows, 1);
  const supplierDues = await runTool(state, 'export_xlsx', { report: 'supplier_dues' });
  assert.equal(supplierDues.ok, true, JSON.stringify(supplierDues));
  assert.equal(supplierDues.data.sheets[0].name, 'Supplier dues');
});

test('every report key builds a workbook on fresh books, nested tools flatten to key/value sheets, and the bank sheet is header-only without statement lines', async () => {
  const state = createState();
  state.company = { ...state.company, gstin: '27AABCU9603R1ZN' };
  for (const key of REPORT_KEYS) {
    const args = key === 'saved_report' ? { name: 'Nothing' } : {};
    const out = reportSheet(state, key, args);
    if (key === 'saved_report') {
      assert.equal(out.error, 'REPORT_NOT_FOUND');
      continue;
    }
    assert.equal(out.ok, true, `${key}: ${JSON.stringify(out)}`);
    assert.match(out.data.fileName, new RegExp(`^myca-${key.replace(/_/g, '-')}-\\d{4}-\\d{2}(?:-\\d{2})?\\.xlsx$`));
    checkPackage(Buffer.from(out.data.xlsxBase64, 'base64'));
    assert.ok(out.data.sheets.length >= 1);
    assert.equal(out.data.rows, out.data.sheets.reduce((sum, sheet) => sum + sheet.rows, 0));
  }
  const summary = reportSheet(state, 'business_summary', { period: '2026-10' });
  const summaryRows = values(unzip(Buffer.from(summary.data.xlsxBase64, 'base64')).get('xl/worksheets/sheet1.xml'));
  assert.deepEqual(summaryRows[0], ['Item', 'Value']);
  assert.deepEqual(summaryRows[1], ['Period', '2026-10']);
  assert.ok(summaryRows.some((row) => row[0] === 'Current sales total' && row[1] === 0));
  assert.ok(summaryRows.some((row) => row[0] === 'Owed to you total'));
  const cash = reportSheet(state, 'cash_forecast', {});
  assert.deepEqual(cash.data.sheets.map((sheet) => sheet.name), ['Summary', 'Coming in', 'Going out', 'Overdue', 'Unpaid bills', 'Balance by day', 'Risks']);

  const empty = reportSheet(state, 'bank_reconciliation', {});
  assert.equal(empty.ok, true);
  assert.deepEqual(empty.data.sheets, [{ name: 'Bank reconciliation', rows: 0 }]);
  const emptySheet = unzip(Buffer.from(empty.data.xlsxBase64, 'base64')).get('xl/worksheets/sheet1.xml');
  assert.deepEqual(values(emptySheet), [['Date', 'Narration', 'Reference', 'In', 'Out', 'Balance', 'Status', 'Matched to']]);
  state.bankLines = [
    { id: 'BL-000002', account: '1002', date: '2026-10-03', narration: 'NEFT SHARMA TRADERS', refNo: 'N123', in: 20000, out: 0, balance: 120000, status: 'matched', match: { kind: 'books', id: 'INV-0007' } },
    { id: 'BL-000001', account: '1002', date: '2026-10-02', narration: 'SMS CHARGES', refNo: '', in: 0, out: 15, balance: 100000, status: 'unmatched', match: null },
    { id: 'BL-000003', account: '1003', date: '2026-10-02', narration: 'OTHER ACCOUNT', refNo: '', in: 0, out: 1, balance: 1, status: 'unmatched', match: null },
  ];
  const lines = reportSheet(state, 'bank_reconciliation', { account: '1002', period: '2026-10' });
  assert.equal(lines.data.fileName, 'myca-bank-reconciliation-2026-10.xlsx');
  const lineRows = values(unzip(Buffer.from(lines.data.xlsxBase64, 'base64')).get('xl/worksheets/sheet1.xml'));
  assert.deepEqual(lineRows[1], ['2026-10-02', 'SMS CHARGES', 0, 15, 100000, 'Not matched yet']);
  assert.deepEqual(lineRows[2], ['2026-10-03', 'NEFT SHARMA TRADERS', 'N123', 20000, 0, 120000, 'Matched', 'books INV-0007']);
  assert.equal(lineRows.length, 3, 'the other account stays out');
});

test('arguments are checked: month-only reports refuse a quarter, unknown reports and bad dates are refused, a US book gets its own columns', async () => {
  const state = createState();
  assert.equal((await runTool(state, 'export_xlsx', { report: 'business_summary', period: 'this-quarter' })).error, 'MONTH_REQUIRED');
  assert.equal((await runTool(state, 'export_xlsx', { report: 'credit_at_risk', period: '2026-10' })).ok, true);
  assert.equal((await runTool(state, 'export_xlsx', { report: 'nonsense' })).error, 'UNKNOWN_REPORT');
  assert.equal((await runTool(state, 'export_xlsx', { report: 'sales', from: 'yesterday' })).error, 'INVALID_DATE');
  assert.equal((await runTool(state, 'export_xlsx', { report: 'sales', from: '2026-10-05', to: '2026-10-01' })).error, 'INVALID_DATE');
  assert.equal((await runTool(state, 'export_xlsx', { report: 'sales', period: 'sometime' })).error, 'BAD_PERIOD');
  assert.equal((await runTool(state, 'export_xlsx', {})).data.report, 'trial_balance');
  const us = createState();
  us.company = { name: 'Maple Street Bakery', country: 'US', gstin: '', state: '', ein: '12-3456789' };
  assert.equal((await runTool(us, 'set_sales_tax_rate', { code: 'tx-austin', name: 'Austin, Texas', ratePercent: 8.25, from: '2026-01-01' })).ok, true);
  const made = await runTool(us, 'create_invoice', { partyName: 'Corner Cafe', lines: [{ description: 'Cakes', qty: 10, rate: 20 }], taxJurisdiction: 'tx-austin', date: '2026-10-05' });
  assert.equal(made.ok, true, JSON.stringify(made));
  const out = await runTool(us, 'export_xlsx', { report: 'sales', period: '2026-10' });
  assert.equal(out.ok, true, JSON.stringify(out));
  const rows = values(unzip(Buffer.from(out.data.xlsxBase64, 'base64')).get('xl/worksheets/sheet1.xml'));
  assert.deepEqual(rows[0], ['Date', 'Number', 'Customer', 'Subtotal', 'Sales tax', 'Total', 'Received', 'Outstanding', 'Status']);
  assert.deepEqual(rows[1], ['2026-10-05', 'INV-0001', 'Corner Cafe', 200, 16.5, 216.5, 0, 216.5, 'posted']);
  for (const indian of ['tds_summary', 'credit_at_risk', 'gst_period_summary']) {
    const refused = await runTool(us, 'export_xlsx', { report: indian });
    assert.equal(refused.error, 'NOT_FOR_COUNTRY', indian);
    assert.equal(refused.country, 'US');
  }
  const entries = await runTool(us, 'export_xlsx', { report: 'entries', period: '2026-10' });
  assert.deepEqual(values(unzip(Buffer.from(entries.data.xlsxBase64, 'base64')).get('xl/worksheets/sheet1.xml'))[0], ['Date', 'Type', 'Number', 'Party', 'Account', 'Description', 'Subtotal', 'Sales tax', 'Total', 'Paid by', 'Refers to']);
});

test('export_xlsx is a remote read for both countries with a strict schema, and chat routes Excel sentences to it', async () => {
  assert.equal(isRemoteQuery('export_xlsx'), true);
  assert.equal(toolServesCountry('export_xlsx', 'IN'), true);
  assert.equal(toolServesCountry('export_xlsx', 'US'), true);
  const names = TOOLS.map((tool) => tool.name);
  assert.equal(names.indexOf('export_xlsx'), names.indexOf('export_tally') + 1);
  const catalog = assistantTools(TOOLS).find((tool) => tool.name === 'export_xlsx');
  assert.equal(catalog.risk, 'read_only');
  assert.deepEqual(catalog.parameters.properties.report.enum, REPORT_KEYS);
  assert.equal(validateAssistantToolCall('export_xlsx', { report: 'nonsense' }).ok, false);
  assert.equal(validateAssistantToolCall('export_xlsx', { report: 'entries', period: '2026-13' }).ok, false);
  assert.equal(validateAssistantToolCall('export_xlsx', { report: 'entries', period: 'this-quarter' }).ok, true);
  assert.equal(validateAssistantToolCall('export_xlsx', { report: 'saved_report', name: 'Top customers' }).ok, true);
  assert.equal(validateAssistantToolCall('export_xlsx', { report: 'sales', from: '2026-10-01', to: '2026-10-31' }).ok, true);
  assert.equal(validateAssistantToolCall('export_xlsx', { report: 'sales', days: 3 }).ok, false);

  const state = await books();
  const plans = {
    'export the trial balance to excel': { report: 'trial_balance' },
    'trial balance as a spreadsheet': { report: 'trial_balance' },
    'excel of sales for 2026-10': { report: 'sales', period: '2026-10' },
    'send my entries to excel for last month': { report: 'entries', period: 'last-month' },
    'xlsx of the day book from 2026-04-01 to 2026-09-30': { report: 'day_book', from: '2026-04-01', to: '2026-09-30' },
    'spreadsheet of what customers owe': { report: 'customer_dues' },
    'excel of supplier dues': { report: 'supplier_dues' },
    'export report Top customers to excel': { report: 'saved_report', name: 'Top customers' },
    'bank reconciliation in excel': { report: 'bank_reconciliation' },
    'audit trail in excel': { report: 'audit_trail' },
    'export the edit log to excel for last month': { report: 'audit_trail', period: 'last-month' },
    'make me an excel please': { report: 'trial_balance' },
  };
  for (const [sentence, args] of Object.entries(plans)) {
    const plan = planLocalToolCall(state, sentence);
    assert.equal(plan.kind, 'tool', sentence);
    assert.equal(plan.name, 'export_xlsx', sentence);
    assert.deepEqual(plan.args, args, sentence);
  }
  assert.equal(planLocalToolCall(state, 'excel please').fallback, true, 'a lone "excel" is not an export');
  assert.equal(planLocalToolCall(state, 'export the trial balance for my CA').name, 'export_trial_balance', 'the CSV route still answers without an Excel word');
  assert.notEqual(planLocalToolCall(state, 'upload the excel statement').name, 'export_xlsx', 'an upload is not an export');
  assert.equal(planLocalToolCall(state, 'import bank statement from excel').kind, 'reply', 'an import keeps its own route');
  const asked = await chat(state, 'export the trial balance to excel');
  assert.match(asked.reply, /^Saved myca-trial-balance-\d{4}-\d{2}-\d{2}\.xlsx with \d+ rows\. Open it in Excel or send it to your CA\.$/, asked.reply);
  const unknown = await chat(state, 'export the margins to excel for this quarter');
  assert.match(unknown.reply, /covers one month at a time/, unknown.reply);
});

async function entryRowsOf(state, args) {
  const out = await runTool(state, 'export_xlsx', { report: 'entries', ...args });
  assert.equal(out.ok, true, JSON.stringify(out));
  return { rows: values(checkPackage(Buffer.from(out.data.xlsxBase64, 'base64')).get('xl/worksheets/sheet1.xml')), data: out.data };
}

test('entries take their months from the books: "to" alone, a "from" 26 years back and the month itself give the same rows, in date order across a gap', async () => {
  const state = createState();
  state.company = { ...state.company, gstin: '27AABCU9603R1ZN' };
  assert.equal(createInvoice(state, { date: '2026-10-05', partyName: 'Kiran Stores', lines: [{ description: 'Goods', qty: 1, rate: 1000, gstRate: 18 }] }).ok, true);
  assert.equal(recordReceipt(state, { invoiceId: 'INV-0001', amount: 500, date: '2026-10-20', mode: 'bank' }).ok, true);
  assert.equal(createPurchase(state, { date: '2026-10-06', partyName: 'Fabric Co', partyGstin: '27AABCT1332L1ZE', lines: [{ description: 'Cloth', qty: 1, rate: 400, gstRate: 5 }] }).ok, true);
  const expense = await runTool(state, 'post_expense', { narration: 'Printer repair', amount: 1180, gstRate: 18, date: '2026-10-07', supplierGstin: '27AABCT1332L1ZE' });
  assert.equal(expense.ok, true, JSON.stringify(expense));

  const month = await entryRowsOf(state, { period: '2026-10' });
  assert.equal(month.rows.length, 5, 'header, a sale, a bill, an expense and a receipt');
  assert.deepEqual(month.rows.slice(1).map((row) => row[1]), ['Sale', 'Purchase', 'Expense', 'Receipt']);
  const toOnly = await entryRowsOf(state, { to: '2026-10-31' });
  assert.deepEqual(toOnly.rows, month.rows, 'no "from" means no lower bound');
  assert.equal(toOnly.data.rows, 4);
  assert.equal(toOnly.data.fileName, 'myca-entries-start-to-2026-10-31.xlsx');
  assert.equal(toOnly.data.period, 'the start to 2026-10-31');
  const farBack = await entryRowsOf(state, { from: '2000-01-01', to: '2026-10-31' });
  assert.deepEqual(farBack.rows, month.rows, 'a "from" more than 20 years back still reaches the real months');
  assert.equal(farBack.data.fileName, 'myca-entries-2000-01-01-to-2026-10-31.xlsx');
  const window = await entryRowsOf(state, { from: '2026-10-06', to: '2026-10-07' });
  assert.deepEqual(window.rows.slice(1).map((row) => row[1]), ['Purchase', 'Expense'], 'days inside the month still cut the rows');

  assert.equal(createInvoice(state, { date: '2024-03-15', partyName: 'Old Buyer', lines: [{ description: 'Old goods', qty: 1, rate: 700, gstRate: 5 }] }).ok, true);
  const all = await entryRowsOf(state, { to: '2026-10-31' });
  assert.deepEqual(all.rows.slice(1).map((row) => row[0]), ['2024-03-15', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-20'], 'months come out ascending with the empty months skipped');
  const beforeGap = await entryRowsOf(state, { to: '2024-12-31' });
  assert.deepEqual(beforeGap.rows.slice(1).map((row) => row[2]), ['INV-0002']);
  const nothing = await entryRowsOf(state, { from: '2025-01-01', to: '2025-12-31' });
  assert.equal(nothing.rows.length, 1, 'a window with no documents has only the header');
  const sales = await runTool(state, 'export_xlsx', { report: 'sales', to: '2026-10-31' });
  assert.equal(sales.data.rows, 2, 'the other dated sheets also take "to" alone as everything up to that day');
});

test('the expenses sheet says whether input credit was claimed and how much, instead of showing the flag as one rupee', async () => {
  const state = createState();
  state.company = { ...state.company, gstin: '27AABCU9603R1ZN' };
  const claimed = await runTool(state, 'post_expense', { narration: 'Printer repair', amount: 1180, gstRate: 18, date: '2026-10-03', supplierGstin: '27AABCT1332L1ZE' });
  assert.equal(claimed.ok, true, JSON.stringify(claimed));
  assert.equal(claimed.expense.inputCredit, true);
  const plain = await runTool(state, 'post_expense', { narration: 'Office rent', amount: 11800, date: '2026-10-05' });
  assert.equal(plain.ok, true, JSON.stringify(plain));
  assert.equal(plain.expense.inputCredit, false);
  const out = await runTool(state, 'export_xlsx', { report: 'expenses', period: '2026-10' });
  assert.equal(out.ok, true, JSON.stringify(out));
  const rows = values(checkPackage(Buffer.from(out.data.xlsxBase64, 'base64')).get('xl/worksheets/sheet1.xml'));
  assert.deepEqual(rows[0], ['Date', 'Number', 'Head', 'Description', 'Payee', 'GSTIN', 'Paid by', 'Taxable', 'CGST', 'SGST', 'IGST', 'Input credit', 'Input credit amount', 'Amount']);
  assert.deepEqual(rows[1], ['2026-10-03', claimed.expense.id, claimed.expense.headName, 'Printer repair', '27AABCT1332L1ZE', 'bank', 1000, 90, 90, 0, 'Yes', 180, 1180]);
  assert.deepEqual(rows[2], ['2026-10-05', plain.expense.id, plain.expense.headName, 'Office rent', 'bank', 11800, 0, 0, 0, 'No', 0, 11800]);
  const sheet = unzip(Buffer.from(out.data.xlsxBase64, 'base64')).get('xl/worksheets/sheet1.xml');
  assert.match(sheet, /<c r="L2" t="inlineStr"><is><t>Yes<\/t><\/is><\/c><c r="M2" s="2"><v>180<\/v><\/c>/);
  assert.match(sheet, /<c r="L3" t="inlineStr"><is><t>No<\/t><\/is><\/c><c r="M3" s="2"><v>0<\/v><\/c>/);
});

test('xmlText drops what XML 1.0 forbids: U+FFFE, U+FFFF and unpaired surrogates go, a real surrogate pair stays', () => {
  assert.equal(xmlText('NEFT\uFFFF SHARMA\uFFFE TRADERS'), 'NEFT SHARMA TRADERS');
  assert.equal(xmlText('lone\uD83D high'), 'lone high');
  assert.equal(xmlText('\uDE00lone low'), 'lone low');
  assert.equal(xmlText('pair 😀 kept'), 'pair 😀 kept');
  assert.equal(xmlText('😀\uD83D'), '😀');
  assert.equal(xmlText('\uDE00😀'), '😀');
  assert.equal(xmlText('� and  and é stay'), '� and  and é stay');
  assert.equal(xmlText('a & b <c>\t\n\r'), 'a &amp; b &lt;c&gt;\t\n\r');
});

test('a narration with U+FFFF makes a well-formed sheet, and a 200,000-row sheet builds in under ten seconds', () => {
  const bad = xlsxWorkbook([{ name: 'Bank\uFFFF lines', header: ['Narration', 'Amount'], rows: [['NEFT\uFFFF SHARMA\uFFFE TRADERS', 20000], ['lone\uD83D high', 1], ['pair 😀 kept', 2]] }]);
  const parts = unzip(bad);
  for (const [name, xml] of parts) assertWellFormed(xml, name);
  const sheet = parts.get('xl/worksheets/sheet1.xml');
  assert.doesNotMatch(sheet, /[\uFFFE\uFFFF�]/, 'the forbidden characters are gone, not replaced');
  assert.deepEqual(values(sheet).slice(1), [['NEFT SHARMA TRADERS', 20000], ['lone high', 1], ['pair 😀 kept', 2]]);
  assert.match(parts.get('xl/workbook.xml'), /<sheet name="Bank lines"/);

  const rows = [];
  for (let i = 0; i < 200000; i += 1) rows.push([`2026-${String((i % 12) + 1).padStart(2, '0')}-01`, `Line ${i} NEFT SHARMA TRADERS`, i % 7 === 0 ? '' : Math.round(i * 150) / 100, i]);
  const started = performance.now();
  const buffer = xlsxWorkbook([{ name: 'Big', header: ['Date', 'Narration', 'In', 'Out'], rows }]);
  const took = performance.now() - started;
  assert.ok(took < 10000, `200,000 rows took ${Math.round(took)} ms`);
  const big = unzip(buffer).get('xl/worksheets/sheet1.xml');
  assert.match(big, /<dimension ref="A1:D200001"\/>/);
  assert.match(big, /<row r="200001"><c r="A200001" t="inlineStr"><is><t>2026-08-01<\/t><\/is><\/c><c r="B200001" t="inlineStr"><is><t>Line 199999 NEFT SHARMA TRADERS<\/t><\/is><\/c><c r="C200001" s="2"><v>299998.5<\/v><\/c><c r="D200001" s="2"><v>199999<\/v><\/c><\/row>/);
  assert.equal((big.match(/<row r="/g) || []).length, 200001);
});
