import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool, TOOLS } from '../src/tools.mjs';
import { chat, fmtToolResult } from '../src/router.mjs';
import { planLocalToolCall, assistantTools, validateAssistantToolCall } from '../src/assistant-contract.mjs';
import { CONFIRM_TOOLS, needsConfirmation, previewOf } from '../src/chat-confirm.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';
import { toolServesCountry } from '../src/country.mjs';
import { localToday } from '../src/dates.mjs';
import { trialBalance, listAccounts, paise } from '../src/ledger.mjs';
import { parse26asCredits, marketplaceCredits, fyOfPeriod } from '../src/marketplace-credits.mjs';
import { tdsCreditCheck, tdsCreditWords, tdsWithheldInFy, planTdsWithheld, CUSTOMER_TDS_SECTIONS, TDS_RECEIVABLE_ACCOUNT } from '../src/tds-credits.mjs';
import { advanceTax } from '../src/advance-tax.mjs';
import { invoiceDocument } from '../src/invoice-document.mjs';
import { reportSheet, REPORT_KEYS } from '../src/report-sheets.mjs';
import { exportTallyXml } from '../src/tally-export.mjs';
import { outstandingOf } from '../src/credit-notes.mjs';

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  return state;
}

async function sale(state, partyName, amount, date) {
  const out = await runTool(state, 'create_invoice', { partyName, lines: [{ description: 'Services', qty: 1, rate: amount, gstRate: 0 }], date });
  assert.equal(out.ok, true, JSON.stringify(out));
  return out.invoice;
}

async function withheld(state, args) {
  const out = await runTool(state, 'record_tds_withheld', args);
  assert.equal(out.ok, true, JSON.stringify(out));
  return out;
}

function unzip(buffer) {
  const parts = new Map();
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    const start = offset + 30 + nameLength + extraLength;
    const packedSize = buffer.readUInt32LE(offset + 18);
    parts.set(name, inflateRawSync(buffer.subarray(start, start + packedSize)).toString('utf8'));
    offset = start + packedSize;
  }
  return parts;
}

function unescapeXml(text) {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function columnIndex(letters) {
  return [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
}

function sheetRows(out, index) {
  const xml = unzip(Buffer.from(out.data.xlsxBase64, 'base64')).get(`xl/worksheets/sheet${index}.xml`);
  const rows = [];
  for (const row of xml.matchAll(/<row r="(\d+)">(.*?)<\/row>/g)) {
    const cells = [];
    for (const m of row[2].matchAll(/<c r="([A-Z]+)\d+"[^>]*>(?:<is><t[^>]*>(.*?)<\/t><\/is>|<v>(.*?)<\/v>)<\/c>/g)) cells[columnIndex(m[1])] = m[3] !== undefined ? Number(m[3]) : unescapeXml(m[2]);
    rows.push(Array.from(cells, (cell) => (cell === undefined ? '' : cell)));
  }
  return rows;
}

const FORM_26AS = [
  'Section,Name of Deductor,TAN of Deductor,Amount Paid/Credited,Tax Deducted,Date of Booking',
  '194O,AMAZON SELLER SERVICES PVT LTD,BLRA12345A,20000,150,2026-09-30',
  '194C,SOME CLIENT,MUMS12345B,50000,1000,2026-09-10',
  '194J,PROFESSIONAL CLIENT,DELP12345C,30000,3000,2026-10-12',
].join('\n');

const CHECK_26AS = [
  'Section,Name of Deductor,TAN of Deductor,Amount Paid/Credited,Tax Deducted,Date of Booking',
  '194C,DELTA PROJECTS PRIVATE LIMITED,DELD12345A,100000,2000,2026-08-20',
  '194J,EASTERN CONSULTANTS LLP,EAST12345B,75000,1500,2026-09-15',
  '194C,FALCON TRADERS PVT LTD,FALC12345C,40000,800,2026-08-28',
  '194J,HARSHA BUILDERS PRIVATE LIMITED,HARS12345D,125000,2500,2026-10-05',
].join('\n');

async function checkBooks({ import26as = true } = {}) {
  const state = books();
  const delta = await sale(state, 'Delta Projects', 100000, '2026-08-05');
  const eastern = await sale(state, 'Eastern Consultants', 50000, '2026-08-10');
  await sale(state, 'Falcon Traders', 40000, '2026-08-12');
  const gamma = await sale(state, 'Gamma Agencies', 25000, '2026-09-01');
  const harsha = await sale(state, 'Harsha Builders', 100000, '2026-10-01');
  const deltaAgain = await sale(state, 'Delta Projects', 150000, '2026-10-20');
  await withheld(state, { invoiceId: delta.id, amount: 2000, date: '2026-08-20', section: '194C', tan: 'DELD12345A' });
  await withheld(state, { invoiceId: eastern.id, amount: 1000, date: '2026-09-15', section: '194J', tan: 'EAST12345B' });
  await withheld(state, { invoiceId: gamma.id, amount: 500, date: '2026-09-20', section: '194H' });
  await withheld(state, { invoiceId: harsha.id, amount: 2500, date: '2026-10-05', section: '194J' });
  await withheld(state, { invoiceId: deltaAgain.id, amount: 3000, date: '2026-11-02', section: '194C', tan: 'DELD12345A' });
  if (import26as) {
    const imported = await runTool(state, 'import_26as_credits', { csv: CHECK_26AS });
    assert.equal(imported.ok, true, JSON.stringify(imported));
    assert.equal(imported.data.imported, 4);
  }
  return state;
}

test('Form 26AS is read in every section, each row keeps its section, marketplace credits still see only 194-O, and rows are never recorded twice', async () => {
  const parsed = parse26asCredits(FORM_26AS);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.lines.map((line) => line.section), ['194O', '194C', '194J']);
  assert.equal(parsed.otherSections, 0);

  const state = books();
  await runTool(state, 'set_channel_identity', { channel: 'amazon', tan: 'BLRA12345A' });
  const imported = await runTool(state, 'import_26as_credits', { csv: FORM_26AS });
  assert.equal(imported.ok, true, JSON.stringify(imported));
  assert.equal(imported.data.imported, 3);
  assert.equal(imported.data.total, 4150);
  assert.equal(imported.data.otherSections, 0);
  assert.deepEqual(imported.data.unknownDeductors, []);
  assert.deepEqual(imported.data.bySection.map((row) => [row.section, row.rows, row.total]), [['194C', 1, 1000], ['194J', 1, 3000], ['194O', 1, 150]]);
  assert.deepEqual(state.tdsCreditStatements.map((row) => [row.section, row.tan, row.taxDeducted, row.quarter, row.channel]), [
    ['194O', 'BLRA12345A', 150, 'Q2 2026-27', 'amazon'],
    ['194C', 'MUMS12345B', 1000, 'Q2 2026-27', ''],
    ['194J', 'DELP12345C', 3000, 'Q3 2026-27', ''],
  ]);

  const credits = marketplaceCredits(state, {}).data;
  assert.equal(credits.tds.length, 1, 'the 194C and 194J rows are not marketplace credits');
  assert.deepEqual([credits.tds[0].channel, credits.tds[0].quarter, credits.tds[0].in26as], ['amazon', 'Q2 2026-27', 150]);
  assert.equal(credits.totals.tdsIn26as, 150);

  const again = await runTool(state, 'import_26as_credits', { csv: FORM_26AS });
  assert.equal(again.data.imported, 0);
  assert.equal(again.data.skipped.filter((row) => row.reason === 'exists').length, 3);

  const copy = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.deepEqual(copy.tdsCreditStatements.map((row) => row.section), ['194O', '194C', '194J']);
});

test('26AS rows imported before sections existed stay 194-O, a section is normalised, and a row with no readable section is the only one left out', async () => {
  const legacy = books();
  legacy.tdsCreditStatements = [{ tan: 'BLRA12345A', name: 'AMAZON', date: '2026-09-30', quarter: 'Q2 2026-27', channel: 'amazon', amountPaid: 20000, taxDeducted: 150, importedOn: '2026-10-01' }];
  assert.equal(marketplaceCredits(legacy, {}).data.totals.tdsIn26as, 150);
  const again = await runTool(legacy, 'import_26as_credits', { csv: FORM_26AS });
  assert.equal(again.data.imported, 2, 'the 194-O row recorded before sections existed is not recorded again');
  assert.equal(legacy.tdsCreditStatements.length, 3);

  const header = 'Section,Name of Deductor,TAN of Deductor,Amount Paid/Credited,Tax Deducted,Date of Booking';
  const odd = await runTool(books(), 'import_26as_credits', { csv: [header, ',NO SECTION,MUMS12345B,100,10,2026-09-10', 'Section 194C,SOME CLIENT,MUMS12345B,50000,1000,2026-09-10', '194-O,AMAZON,BLRA12345A,20000,150,2026-09-30', '194 j,PRO CLIENT,DELP12345C,30000,3000,2026-10-12'].join('\n') });
  assert.equal(odd.ok, true, JSON.stringify(odd));
  assert.equal(odd.data.imported, 3);
  assert.equal(odd.data.otherSections, 1);

  const none = await runTool(books(), 'import_26as_credits', { csv: [header, ',NO SECTION,MUMS12345B,100,10,2026-09-10'].join('\n') });
  assert.equal(none.ok, false);
  assert.equal(none.error, 'NO_ROWS');
});

test('26AS import preview and words talk about every section, not just 194-O', async () => {
  const state = books();
  state.pendingFile = { name: '26as.csv', content: FORM_26AS };
  const held = await chat(state, 'import 26as');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.match(held.reply, /Form 26AS: 3 entries totalling ₹4,150\.00 \(194C 1, 194J 1, 194O 1\)/, held.reply);
  assert.doesNotMatch(held.reply, /ignored/);
  const posted = await chat(state, 'yes');
  assert.match(posted.reply, /Recorded 3 entries of TDS from Form 26AS totalling ₹4,150\.00 \(194C 1, 194J 1, 194O 1\)\./, posted.reply);

  const nothing = await chat(state, 'import 26as');
  assert.match(nothing.reply, /Attach Form 26AS/);
  assert.match(nothing.reply, /Every section is read/);
  assert.doesNotMatch(nothing.reply, /Only section 194-O/);
});

test('TDS withheld by a customer settles part of the invoice, sits in TDS receivable, and the rest is received as usual', async () => {
  const state = books();
  const invoice = await sale(state, 'Delta Projects', 100000, '2026-08-05');
  assert.equal(invoice.id, 'INV-0001');
  const out = await runTool(state, 'record_tds_withheld', { invoiceId: 'INV-0001', amount: 2000, date: '2026-08-20', section: '194j', tan: 'deld12345a' });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.invoice.status, 'partial');
  assert.equal(out.remaining, 98000);
  assert.deepEqual(out.receipt, { amount: 2000, date: '2026-08-20', mode: 'tds', section: '194J', tan: 'DELD12345A' });
  assert.equal(out.posted.length, 1);

  const transfer = state.ledger.transfers.at(-1);
  assert.equal(Number(transfer.debitAccountId), 1160);
  assert.equal(transfer.creditAccountId, BigInt(state.parties.find((party) => party.name === 'Delta Projects').accountId));
  assert.equal(transfer.amount, paise(2000));
  assert.equal(transfer.code, 'TDS_WITHHELD');
  assert.equal(transfer.invoiceId, 'INV-0001');
  assert.equal(transfer.userData, '2026-08-20');

  const accounts = Object.fromEntries(listAccounts(state.ledger).map((account) => [account.code, account]));
  assert.equal(accounts['1160'].name, 'TDS receivable (customers)');
  assert.equal(accounts['1160'].debitsPosted, 2000);
  assert.equal(outstandingOf(state, out.invoice), 98000);
  assert.deepEqual(TDS_RECEIVABLE_ACCOUNT, { id: 1160, code: '1160', name: 'TDS receivable (customers)', type: 'asset' });

  const rest = await runTool(state, 'record_receipt', { invoiceId: 'INV-0001', mode: 'bank', date: '2026-08-25' });
  assert.equal(rest.ok, true, JSON.stringify(rest));
  assert.equal(rest.invoice.status, 'paid');
  assert.equal(rest.invoice.receipts.at(-1).amount, 98000, 'the receipt with no amount takes what is still owed after the TDS');
  assert.equal(outstandingOf(state, rest.invoice), 0);
  assert.equal(trialBalance(state.ledger).balanced, true);
  assert.equal(listAccounts(state.ledger).find((account) => account.code === '1160').debitsPosted, 2000);

  const copy = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.deepEqual(copy.invoices[0].receipts[0], { amount: 2000, date: '2026-08-20', mode: 'tds', section: '194J', tan: 'DELD12345A' });
});

test('TDS can settle an invoice on its own, a date left out is today, and a TAN is optional', async () => {
  const state = books();
  await sale(state, 'Delta Projects', 2000, localToday());
  const out = await runTool(state, 'record_tds_withheld', { invoiceId: 'INV-0001', amount: 2000, section: '194C' });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.invoice.status, 'paid');
  assert.equal(out.remaining, 0);
  assert.deepEqual(out.receipt, { amount: 2000, date: localToday(), mode: 'tds', section: '194C' });
  const more = await runTool(state, 'record_tds_withheld', { invoiceId: 'INV-0001', amount: 1, section: '194C' });
  assert.equal(more.error, 'OVERPAYMENT');
  assert.equal(more.due, 0);
});

test('TDS withheld refuses what cannot be true and posts nothing when it does', async () => {
  const state = books();
  await sale(state, 'Delta Projects', 100000, '2026-08-05');
  await sale(state, 'Eastern Consultants', 50000, '2026-08-10');
  const before = state.ledger.transfers.length;
  const tries = [
    [{ invoiceId: 'INV-0009', amount: 2000, section: '194J' }, 'INVOICE_NOT_FOUND'],
    [{ invoiceId: 'INV-0001', amount: 2000, section: '194J', date: '2026-13-45' }, 'INVALID_DATE'],
    [{ invoiceId: 'INV-0001', amount: 0, section: '194J' }, 'BAD_AMOUNT'],
    [{ invoiceId: 'INV-0001', amount: -5, section: '194J' }, 'BAD_AMOUNT'],
    [{ invoiceId: 'INV-0001', section: '194J' }, 'BAD_AMOUNT'],
    [{ invoiceId: 'INV-0001', amount: 2000 }, 'BAD_SECTION'],
    [{ invoiceId: 'INV-0001', amount: 2000, section: 'rent' }, 'BAD_SECTION'],
    [{ invoiceId: 'INV-0001', amount: 2000, section: '19' }, 'BAD_SECTION'],
    [{ invoiceId: 'INV-0001', amount: 2000, section: '194J', tan: 'MUMA1234' }, 'BAD_TAN'],
    [{ invoiceId: 'INV-0001', amount: 100001, section: '194J' }, 'OVERPAYMENT'],
  ];
  for (const [args, error] of tries) {
    const out = await runTool(state, 'record_tds_withheld', args);
    assert.equal(out.ok, false, JSON.stringify(args));
    assert.equal(out.error, error, JSON.stringify(args));
  }
  const over = await runTool(state, 'record_tds_withheld', { invoiceId: 'INV-0001', amount: 100001, section: '194J' });
  assert.equal(over.due, 100000);
  assert.equal(state.ledger.transfers.length, before);
  assert.equal(state.invoices[0].receipts?.length || 0, 0);

  const cancelled = await runTool(state, 'cancel_invoice', { invoiceId: 'INV-0002' });
  assert.equal(cancelled.ok, true, JSON.stringify(cancelled));
  const gone = await runTool(state, 'record_tds_withheld', { invoiceId: 'INV-0002', amount: 500, section: '194J', date: '2026-08-12' });
  assert.equal(gone.error, 'INVOICE_CANCELLED');

  const lost = books();
  await sale(lost, 'Delta Projects', 100000, '2026-08-05');
  lost.parties = [];
  assert.equal((await runTool(lost, 'record_tds_withheld', { invoiceId: 'INV-0001', amount: 2000, section: '194J', date: '2026-08-20' })).error, 'PARTY_NOT_FOUND');

  const locked = await runTool(state, 'lock_period', { through: '2026-08-31', reason: 'August closed' });
  assert.equal(locked.ok, true, JSON.stringify(locked));
  const late = await runTool(state, 'record_tds_withheld', { invoiceId: 'INV-0001', amount: 2000, section: '194J', date: '2026-08-20' });
  assert.equal(late.error, 'PERIOD_LOCKED');
  assert.equal(late.lockThrough, '2026-08-31');
  assert.equal(planTdsWithheld(state, { invoiceId: 'INV-0001', amount: 2000, section: '194J', date: '2026-09-02' }).ok, true);
});

test('the check lines up 26AS with the books by TAN or by name, per quarter, and names every gap', async () => {
  const state = await checkBooks();
  const out = await runTool(state, 'tds_credit_check', { fy: '2026-27' });
  assert.equal(out.ok, true, JSON.stringify(out));
  const d = out.data;
  assert.equal(d.fy, '2026-27');
  assert.equal(d.source, `26AS imported ${localToday()}`);
  assert.deepEqual(d.rows.map((row) => [row.quarter, row.section, row.tan, row.deductor, row.customer, row.in26as, row.inBooks, row.gap, row.status]), [
    ['Q2 2026-27', '194C', 'DELD12345A', 'DELTA PROJECTS PRIVATE LIMITED', 'Delta Projects', 2000, 2000, 0, 'matched'],
    ['Q2 2026-27', '194J', 'EAST12345B', 'EASTERN CONSULTANTS LLP', 'Eastern Consultants', 1500, 1000, -500, 'more in 26AS'],
    ['Q2 2026-27', '194C', 'FALC12345C', 'FALCON TRADERS PVT LTD', '', 800, 0, -800, 'not in books'],
    ['Q2 2026-27', '194H', '', 'Gamma Agencies', 'Gamma Agencies', 0, 500, 500, 'not in 26AS'],
    ['Q3 2026-27', '194C', 'DELD12345A', 'Delta Projects', 'Delta Projects', 0, 3000, 3000, 'not in 26AS'],
    ['Q3 2026-27', '194J', 'HARS12345D', 'HARSHA BUILDERS PRIVATE LIMITED', 'Harsha Builders', 2500, 2500, 0, 'matched'],
  ]);
  assert.deepEqual(d.totals, { in26as: 6800, inBooks: 9000, gap: 2200, notInBooks: 800, notIn26as: 3500 });
  assert.deepEqual(d.bySection, [
    { section: '194C', rows: 3, in26as: 2800, inBooks: 5000 },
    { section: '194H', rows: 1, in26as: 0, inBooks: 500 },
    { section: '194J', rows: 2, in26as: 4000, inBooks: 3500 },
  ]);
  assert.equal(d.note, 'Form 26AS lists the TDS deductors reported against your PAN. Rows not in your books usually mean a customer paid you short by TDS and the shortfall was never recorded: record it with "TDS withheld" on that invoice, using the date 26AS shows. AIS is not read yet.');

  const copy = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.deepEqual(tdsCreditCheck(copy, { fy: '2026-27' }).data, d, 'the check reads the same after the books are saved and loaded');
  assert.equal(tdsCreditCheck(state, { fy: '2025-26' }).data.rows.length, 0);
  assert.equal(tdsCreditCheck(state, {}).data.fy, fyOfPeriod(localToday().slice(0, 7)), 'no fy means the current financial year');
});

test('a section recorded differently from 26AS still lines up by TAN, and a second quarter or customer is its own row', async () => {
  const state = books();
  const first = await sale(state, 'Delta Projects', 100000, '2026-08-05');
  const second = await sale(state, 'Delta Projects', 100000, '2026-08-06');
  await withheld(state, { invoiceId: first.id, amount: 2000, date: '2026-08-20', section: '194C', tan: 'DELD12345A' });
  await withheld(state, { invoiceId: second.id, amount: 500, date: '2026-08-21', section: '194C', tan: 'DELD12345A' });
  await runTool(state, 'import_26as_credits', { csv: ['Section,Name of Deductor,TAN of Deductor,Amount Paid/Credited,Tax Deducted,Date of Booking', '194J,DELTA PROJECTS PRIVATE LIMITED,DELD12345A,125000,2500,2026-08-20'].join('\n') });
  const rows = tdsCreditCheck(state, { fy: '2026-27' }).data.rows;
  assert.equal(rows.length, 1, JSON.stringify(rows));
  assert.deepEqual([rows[0].section, rows[0].in26as, rows[0].inBooks, rows[0].status], ['194J', 2500, 2500, 'matched']);
});

test('before any 26AS is imported every TDS the books claim is flagged as not in 26AS, and with nothing at all there is nothing to compare', async () => {
  const state = await checkBooks({ import26as: false });
  const d = tdsCreditCheck(state, { fy: '2026-27' }).data;
  assert.equal(d.source, 'no 26AS imported yet');
  assert.equal(d.rows.length, 5);
  assert.ok(d.rows.every((row) => row.status === 'not in 26AS' && row.in26as === 0));
  assert.deepEqual(d.totals, { in26as: 0, inBooks: 9000, gap: 9000, notInBooks: 0, notIn26as: 9000 });

  const empty = tdsCreditCheck(books(), { fy: '2026-27' }).data;
  assert.deepEqual(empty.rows, []);
  assert.deepEqual(empty.totals, { in26as: 0, inBooks: 0, gap: 0, notInBooks: 0, notIn26as: 0 });
  assert.equal(empty.source, 'no 26AS imported yet');
});

test('194-O deducted in marketplace settlements is one row per marketplace and quarter, beside the sections customers deduct under', async () => {
  const state = books();
  await runTool(state, 'set_channel_identity', { channel: 'amazon', tan: 'BLRA12345A' });
  state.settlements = [{ id: 'ST-1', channel: 'amazon', to: '2026-09-30', totals: { tds: -200, tcs: 0 } }];
  const imported = await runTool(state, 'import_26as_credits', { csv: FORM_26AS });
  assert.equal(imported.ok, true, JSON.stringify(imported));
  const d = tdsCreditCheck(state, { fy: '2026-27' }).data;
  assert.deepEqual(d.rows.map((row) => [row.quarter, row.section, row.tan, row.deductor, row.in26as, row.inBooks, row.status]), [
    ['Q2 2026-27', '194O', 'BLRA12345A', 'amazon', 150, 200, 'short in 26AS'],
    ['Q2 2026-27', '194C', 'MUMS12345B', 'SOME CLIENT', 1000, 0, 'not in books'],
    ['Q3 2026-27', '194J', 'DELP12345C', 'PROFESSIONAL CLIENT', 3000, 0, 'not in books'],
  ]);
  assert.deepEqual(d.totals, { in26as: 4150, inBooks: 200, gap: -3950, notInBooks: 4000, notIn26as: 0 });
  const marketplace = marketplaceCredits(state, { fy: '2026-27' }).data;
  assert.deepEqual([marketplace.tds.length, marketplace.totals.tdsRecorded, marketplace.totals.tdsIn26as], [1, 200, 150]);
});

test('the words give the totals, up to eight rows and where the 26AS came from', async () => {
  const state = await checkBooks();
  const d = tdsCreditCheck(state, { fy: '2026-27' }).data;
  const money = (n) => (n < 0 ? '-' : '') + '₹' + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  const lines = tdsCreditWords(d, money).split('\n');
  assert.equal(lines[0], '26AS vs books for FY 2026-27: ₹6,800.00 in 26AS, ₹9,000.00 in your books, gap ₹2,200.00.');
  assert.equal(lines[1], '· DELTA PROJECTS PRIVATE LIMITED Q2 2026-27 (194C): matched, 26AS ₹2,000.00, books ₹2,000.00');
  assert.equal(lines[3], '· FALCON TRADERS PVT LTD Q2 2026-27 (194C): not in books, 26AS ₹800.00, books ₹0.00');
  assert.equal(lines.length, 8);
  assert.equal(lines.at(-1), `26AS imported ${localToday()}`);

  const many = { ...d, rows: Array.from({ length: 11 }, (_, i) => ({ ...d.rows[0], deductor: `D${i}` })) };
  const long = tdsCreditWords(many, money).split('\n');
  assert.equal(long.length, 11);
  assert.equal(long[9], '… and 3 more');

  const none = tdsCreditWords(tdsCreditCheck(books(), { fy: '2026-27' }).data, money);
  assert.match(none, /^No TDS credit is on record for FY 2026-27 yet\./);
  assert.match(none, /Import Form 26AS/);
});

test('advance tax counts the TDS customers withheld when there is no 26AS, and the 26AS alone when there is one', async () => {
  const state = books();
  state.company.entityType = 'proprietorship';
  const invoice = await sale(state, 'Delta Projects', 100000, '2026-08-05');
  await withheld(state, { invoiceId: invoice.id, amount: 2000, date: '2026-08-20', section: '194J' });
  await withheld(state, { invoiceId: invoice.id, amount: 500, date: '2026-12-15', section: '194J' });
  const fy = { label: '2026-27', from: '2026-04-01', to: '2027-03-31' };
  assert.equal(tdsWithheldInFy(state, fy, '2026-11-30'), 2000, 'a receipt dated after today is not yet a credit');
  assert.equal(tdsWithheldInFy(state, fy, '2027-01-31'), 2500);
  assert.equal(tdsWithheldInFy(state, { label: '2025-26', from: '2025-04-01', to: '2026-03-31' }, '2026-03-31'), 0);

  const alone = advanceTax(state, { asOf: '2026-11-30' }).data.credits;
  assert.deepEqual([alone.tdsWithheld, alone.tds194o, alone.tds26as, alone.credits], [2000, 0, 0, 2000]);
  assert.equal(alone.source, 'TDS withheld by customers (26AS not imported)');

  state.settlements = [{ id: 'ST-1', channel: 'amazon', to: '2026-09-30', totals: { tds: -200, tcs: 0 } }];
  const both = advanceTax(state, { asOf: '2026-11-30' }).data.credits;
  assert.deepEqual([both.tdsWithheld, both.tds194o, both.credits], [2000, 200, 2200]);
  assert.equal(both.source, 'TDS withheld by customers and 194-O seen in settlements (26AS not imported)');
  assert.match(advanceTax(state, { asOf: '2026-11-30' }).data.assumptions.join(' '), /TDS credit: TDS withheld by customers and 194-O seen in settlements/);

  const only194o = books();
  only194o.company.entityType = 'proprietorship';
  only194o.settlements = state.settlements;
  const marketplaceOnly = advanceTax(only194o, { asOf: '2026-11-30' }).data.credits;
  assert.deepEqual([marketplaceOnly.tdsWithheld, marketplaceOnly.credits, marketplaceOnly.source], [0, 200, 'TDS 194-O seen in marketplace settlements (26AS not imported)']);

  await runTool(state, 'import_26as_credits', { csv: ['Section,Name of Deductor,TAN of Deductor,Amount Paid/Credited,Tax Deducted,Date of Booking', '194C,SOME CLIENT,MUMS12345B,50000,5000,2026-09-10'].join('\n') });
  const imported = advanceTax(state, { asOf: '2026-11-30' }).data.credits;
  assert.deepEqual([imported.tds26as, imported.tdsWithheld, imported.credits, imported.source], [5000, 2000, 5000, 'Form 26AS as imported']);
});

test('the new tools are registered where every tool must be: schema, risk, remote list, confirmation, previews, cloud proposals and the country gate', async () => {
  const catalog = Object.fromEntries(assistantTools(TOOLS).map((tool) => [tool.name, tool]));
  assert.equal(catalog.record_tds_withheld.risk, 'writes_books');
  assert.equal(catalog.tds_credit_check.risk, 'read_only');
  assert.equal(catalog.record_tds_withheld.parameters.additionalProperties, false);

  const good = { invoiceId: 'INV-0001', amount: 2000, date: '2026-08-20', section: '194J', tan: 'DELD12345A' };
  assert.equal(validateAssistantToolCall('record_tds_withheld', good).ok, true);
  assert.equal(validateAssistantToolCall('record_tds_withheld', { invoiceId: 'INV-0001', amount: 2000 }).ok, true);
  for (const bad of [{ ...good, invoiceId: 'BILL-0001' }, { ...good, amount: 0 }, { ...good, extra: 1 }, { ...good, section: '194JJJJ' }, { ...good, tan: 'ABCDEFGHIJK' }, { ...good, date: '2026-8-2' }, { amount: 2000 }]) {
    assert.equal(validateAssistantToolCall('record_tds_withheld', bad).ok, false, JSON.stringify(bad));
  }
  assert.equal(validateAssistantToolCall('tds_credit_check', {}).ok, true);
  assert.equal(validateAssistantToolCall('tds_credit_check', { fy: '2026-27' }).ok, true);
  assert.equal(validateAssistantToolCall('tds_credit_check', { fy: '2026' }).ok, false);
  assert.equal(validateAssistantToolCall('tds_credit_check', { year: '2026-27' }).ok, false);

  assert.equal(isRemoteQuery('tds_credit_check'), true);
  assert.equal(isRemoteQuery('record_tds_withheld'), false);
  assert.equal(needsConfirmation('record_tds_withheld'), true);
  assert.equal(CONFIRM_TOOLS.has('tds_credit_check'), false);
  for (const name of ['record_tds_withheld', 'tds_credit_check']) {
    assert.equal(toolServesCountry(name, 'IN'), true, name);
    assert.equal(toolServesCountry(name, 'US'), false, name);
    const us = createState();
    us.company = { ...us.company, country: 'US' };
    assert.equal((await runTool(us, name, {})).error, 'NOT_FOR_COUNTRY', name);
  }

  const source = readFileSync(fileURLToPath(new URL('../../cloud/src/api.mjs', import.meta.url)), 'utf8');
  const listed = source.match(/export const PROPOSABLE = new Set\(\[([^\]]*)\]\)/);
  assert.ok(listed, 'PROPOSABLE is a literal set');
  assert.equal(new Set([...listed[1].matchAll(/'([^']+)'/g)].map((hit) => hit[1])).has('record_tds_withheld'), true);
  assert.deepEqual(CUSTOMER_TDS_SECTIONS, ['194A', '194C', '194H', '194I', '194J', '194Q', '194O', '192', '194D', '194G', '194LA', '206AB']);
});

test('the preview says what will happen, and every reason it cannot is a sentence', async () => {
  const state = books();
  await sale(state, 'Delta Projects', 100000, '2026-08-05');
  const preview = previewOf(state, 'record_tds_withheld', { invoiceId: 'INV-0001', amount: 2000, section: '194J' });
  assert.deepEqual(preview.blockers, []);
  assert.equal(preview.summary, 'TDS of ₹2,000.00 withheld by Delta Projects on INV-0001 (section 194J), dated 5 Aug 2026');
  assert.deepEqual(preview.effects, ['The invoice settles by that amount; the credit sits in TDS receivable (1160) until Form 26AS confirms it.']);
  assert.deepEqual(preview.figures, { amount: 2000, remaining: 98000 });

  const reasons = [
    [{ invoiceId: 'INV-0009', amount: 2000, section: '194J' }, /not in these books/],
    [{ invoiceId: 'INV-0001', amount: 2000 }, /Say which TDS section the customer deducted under, like 194C or 194J\./],
    [{ invoiceId: 'INV-0001', amount: 2000, section: '194J', tan: 'MUMA1' }, /A TAN looks like MUMA12345B\./],
    [{ invoiceId: 'INV-0001', amount: 200000, section: '194J' }, /more than is still owed.*₹1,00,000\.00/],
    [{ invoiceId: 'INV-0001', amount: 0, section: '194J' }, /positive amount/],
    [{ invoiceId: 'INV-0001', amount: 2000, section: '194J', date: 'someday' }, /not a date I can read/],
  ];
  for (const [args, pattern] of reasons) {
    const blocked = previewOf(state, 'record_tds_withheld', args);
    assert.equal(blocked.blockers.length, 1, JSON.stringify(args));
    assert.match(blocked.blockers[0], pattern, JSON.stringify(args));
    assert.doesNotMatch(blocked.blockers[0], /[A-Z]{3,}_[A-Z]{3,}/, 'no raw code');
  }
  await runTool(state, 'lock_period', { through: '2026-08-31', reason: 'closed' });
  assert.match(previewOf(state, 'record_tds_withheld', { invoiceId: 'INV-0001', amount: 2000, section: '194J', date: '2026-08-20' }).blockers[0], /locked period/);
});

test('every way TDS withheld can fail reaches the user as a sentence, never a code, and the answers read plainly', async () => {
  for (const code of ['INVOICE_NOT_FOUND', 'INVOICE_CANCELLED', 'INVALID_DATE', 'PERIOD_LOCKED', 'BAD_AMOUNT', 'BAD_SECTION', 'BAD_TAN', 'OVERPAYMENT', 'PARTY_NOT_FOUND']) {
    const words = fmtToolResult('record_tds_withheld', { ok: false, error: code, due: 10, lockThrough: '2026-08-31' });
    assert.doesNotMatch(words, /[A-Z]{3,}_[A-Z]{3,}/, code);
    assert.doesNotMatch(words, /^That did not go through/, `${code} has its own sentence`);
  }
  assert.equal(fmtToolResult('record_tds_withheld', { ok: false, error: 'BAD_SECTION' }), 'Say which TDS section the customer deducted under, like 194C or 194J.');
  assert.equal(fmtToolResult('record_tds_withheld', { ok: false, error: 'BAD_TAN' }), 'A TAN looks like MUMA12345B.');
  assert.match(fmtToolResult('record_tds_withheld', { ok: false, error: 'INVOICE_CANCELLED' }), /cancelled/);
});

test('chat reaches the 26AS check and the TDS entry, and the old TDS sentences keep their routes', async () => {
  const state = books();
  await sale(state, 'Delta Projects', 100000, '2026-08-05');
  const plan = (sentence) => planLocalToolCall(state, sentence);
  for (const sentence of ['check 26AS against the books', 'reconcile TDS against 26AS', 'Compare Form 26AS with my books', 'verify the 26as', 'is 26AS matching the books?', '26AS vs books', 'tds credit check', 'did you check 26AS against the books?']) {
    assert.deepEqual(plan(sentence), { kind: 'tool', name: 'tds_credit_check', args: {} }, sentence);
  }
  assert.deepEqual(plan('check 26AS against the books for FY 2025-26').args, { fy: '2025-26' });
  assert.deepEqual(plan('compare 26as with my books fy2026-2027').args, { fy: '2026-27' });

  assert.deepEqual(plan('record tds withheld 2000 on INV-0001 under 194J'), { kind: 'tool', name: 'record_tds_withheld', args: { invoiceId: 'INV-0001', amount: 2000, section: '194J' } });
  assert.deepEqual(plan('tds withheld ₹1,500 on inv-0001 section 194c').args, { invoiceId: 'INV-0001', amount: 1500, section: '194C' });
  assert.deepEqual(plan('Delta deducted tds 2500 on INV-0001 under 194H dated 2026-08-20 tan DELD12345A').args, { invoiceId: 'INV-0001', amount: 2500, section: '194H', date: '2026-08-20', tan: 'DELD12345A' });
  assert.deepEqual(plan('record tds withheld 195 on INV-0001 under 194J').args, { invoiceId: 'INV-0001', amount: 195, section: '194J' });
  assert.deepEqual(plan('record tds withheld 2000 on INV-0001').args, { invoiceId: 'INV-0001', amount: 2000 });
  const noAmount = plan('record tds withheld on INV-0001 under 194J');
  assert.equal(noAmount.kind, 'reply');
  assert.match(noAmount.reply, /Say how much TDS was withheld/);
  assert.match(noAmount.reply, /recorded nothing/);

  for (const sentence of ["don't check 26AS against the books", 'was tds withheld on INV-0001?', "don't record tds withheld 2000 on INV-0001 under 194J", 'import 26as and check it against the books']) {
    assert.notEqual(plan(sentence).name, 'tds_credit_check', sentence);
    assert.notEqual(plan(sentence).name, 'record_tds_withheld', sentence);
  }
  assert.equal(plan('import 26as').kind, 'reply');
  assert.match(plan('import 26as').reply, /Attach Form 26AS/);
  assert.equal(plan('tds').name, 'tds_summary');
  assert.equal(plan('tds summary').name, 'tds_summary');
  assert.equal(plan('how much tds is due').name, 'tds_summary');
  assert.equal(plan('tcs and tds credits').name, 'marketplace_credits');
  assert.notEqual(plan('reconcile TDS against 26AS').name, 'bank_reconciliation');
});

test('chat: recording TDS withheld shows a preview, posts after yes, and the check reads the result back', async () => {
  const state = books();
  await sale(state, 'Delta Projects', 100000, localToday());
  const held = await chat(state, 'record tds withheld 2000 on INV-0001 under 194J');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.match(held.reply, /TDS of ₹2,000\.00 withheld by Delta Projects on INV-0001 \(section 194J\)/, held.reply);
  assert.equal(state.invoices[0].receipts?.length || 0, 0, 'nothing is posted before yes');
  const done = await chat(state, 'yes');
  assert.equal(done.posted, true, done.reply);
  const [year, month, day] = localToday().split('-').map(Number);
  const dated = `${day} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1]} ${year}`;
  assert.equal(done.reply, `Recorded TDS of ₹2,000.00 withheld on INV-0001, dated ${dated}; ₹98,000.00 still owed.`);
  assert.equal(state.invoices[0].status, 'partial');

  const missing = await chat(state, 'record tds withheld 100 on INV-0001');
  assert.equal(missing.awaitingConfirmation, undefined, missing.reply);
  assert.match(missing.reply, /Say which TDS section the customer deducted under, like 194C or 194J\./, missing.reply);

  const check = await chat(state, 'check 26AS against the books');
  assert.match(check.reply, /^26AS vs books for FY \d{4}-\d{2}: ₹0\.00 in 26AS, ₹2,000\.00 in your books, gap ₹2,000\.00\./, check.reply);
  assert.match(check.reply, /· Delta Projects Q\d \d{4}-\d{2} \(194J\): not in 26AS, 26AS ₹0\.00, books ₹2,000\.00/, check.reply);
  assert.match(check.reply, /no 26AS imported yet$/, check.reply);

  const later = await chat(state, 'received 98000 from Delta Projects');
  assert.equal(later.awaitingConfirmation, true, later.reply);
  assert.match(later.reply, /against INV-0001 \(Delta Projects\).*Outstanding is ₹98,000\.00 of ₹1,00,000\.00/, later.reply);
});

test('a receipt after TDS says what was received in cash and what was withheld', async () => {
  const state = books();
  await sale(state, 'Delta Projects', 100000, '2026-08-05');
  await withheld(state, { invoiceId: 'INV-0001', amount: 2000, date: '2026-08-20', section: '194J' });
  const part = await runTool(state, 'record_receipt', { invoiceId: 'INV-0001', amount: 50000, mode: 'bank', date: '2026-08-21' });
  assert.equal(part.ok, true, JSON.stringify(part));
  assert.equal(fmtToolResult('record_receipt', part), 'Recorded ₹50,000.00 received from Delta Projects by bank on 2026-08-21 against INV-0001. ₹50,000.00 of ₹1,00,000.00 received so far (plus ₹2,000.00 TDS withheld).');
  const rest = await runTool(state, 'record_receipt', { invoiceId: 'INV-0001', amount: 48000, mode: 'bank', date: '2026-08-22' });
  assert.equal(fmtToolResult('record_receipt', rest), 'Recorded ₹48,000.00 received from Delta Projects by bank on 2026-08-22 against INV-0001. INV-0001 is paid in full.');

  const plain = books();
  await sale(plain, 'Kiran Stores', 1000, '2026-08-05');
  const one = await runTool(plain, 'record_receipt', { invoiceId: 'INV-0001', amount: 400, mode: 'bank', date: '2026-08-06' });
  assert.equal(fmtToolResult('record_receipt', one), 'Recorded ₹400.00 received from Kiran Stores by bank on 2026-08-06 against INV-0001. ₹400.00 of ₹1,000.00 received so far.');
});

test('the invoice document lists the TDS as its own line and the balance stays right', async () => {
  const state = books();
  await sale(state, 'Delta Projects', 100000, '2026-08-05');
  await withheld(state, { invoiceId: 'INV-0001', amount: 2000, date: '2026-08-20', section: '194J', tan: 'DELD12345A' });
  const before = invoiceDocument(state, 'INV-0001').data;
  assert.deepEqual(before.receipts, [{ date: '2026-08-20', mode: 'tds', amount: 2000, label: 'TDS withheld ₹2,000.00 (194J)', section: '194J', tan: 'DELD12345A' }]);
  assert.equal(before.received, 2000);
  assert.equal(before.tdsWithheld, 2000);
  assert.equal(before.balance, 98000);
  await runTool(state, 'record_receipt', { invoiceId: 'INV-0001', amount: 98000, mode: 'bank', date: '2026-08-25' });
  const after = invoiceDocument(state, 'INV-0001').data;
  assert.deepEqual(after.receipts.map((receipt) => [receipt.mode, receipt.amount, receipt.label]), [['tds', 2000, 'TDS withheld ₹2,000.00 (194J)'], ['bank', 98000, undefined]]);
  assert.equal(after.balance, 0);
  assert.equal(after.status, 'paid');
});

test('the Tally export makes a Journal voucher of the TDS, not a receipt into the bank', async () => {
  const state = books();
  await sale(state, 'Delta Projects', 100000, '2026-08-05');
  await withheld(state, { invoiceId: 'INV-0001', amount: 2000, date: '2026-08-20', section: '194J' });
  await runTool(state, 'record_receipt', { invoiceId: 'INV-0001', amount: 98000, mode: 'bank', date: '2026-08-25' });
  const out = exportTallyXml(state, { period: '2026-08' });
  assert.equal(out.ok, true);
  const xml = out.data.xml;
  assert.equal(out.data.count, 3, 'the sale, the journal and one receipt');
  assert.equal((xml.match(/VCHTYPE="Receipt"/g) || []).length, 1);
  assert.equal((xml.match(/VCHTYPE="Journal"/g) || []).length, 1);
  const journal = xml.slice(xml.indexOf('VCHTYPE="Journal"'), xml.indexOf('</VOUCHER>', xml.indexOf('VCHTYPE="Journal"')));
  assert.match(journal, /<NARRATION>TDS withheld against INV-0001 \(194J\)<\/NARRATION>/);
  assert.match(journal, /<LEDGERNAME>TDS Receivable<\/LEDGERNAME>\s*<ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE>\s*<AMOUNT>-2000\.00<\/AMOUNT>/);
  assert.match(journal, /<LEDGERNAME>Delta Projects<\/LEDGERNAME>\s*<ISDEEMEDPOSITIVE>No<\/ISDEEMEDPOSITIVE>\s*<AMOUNT>2000\.00<\/AMOUNT>/);
  assert.doesNotMatch(journal, /<LEDGERNAME>Bank<\/LEDGERNAME>/);
  assert.match(xml, /<LEDGER NAME="TDS Receivable" ACTION="Create">\s*<NAME>TDS Receivable<\/NAME>\s*<PARENT>Current Assets<\/PARENT>/);

  const quiet = books();
  await sale(quiet, 'Kiran Stores', 1000, '2026-08-05');
  await runTool(quiet, 'record_receipt', { invoiceId: 'INV-0001', amount: 1000, mode: 'bank', date: '2026-08-06' });
  assert.doesNotMatch(exportTallyXml(quiet, { period: '2026-08' }).data.xml, /TDS Receivable/, 'books without TDS export exactly as before');
});

test('the Excel key builds on fresh books and with data, is India only, and chat reaches it without disturbing the TDS sheet', async () => {
  assert.equal(REPORT_KEYS.indexOf('tds_credit_check'), REPORT_KEYS.indexOf('tds_summary') + 1);
  const fresh = reportSheet(books(), 'tds_credit_check', {});
  assert.equal(fresh.ok, true, JSON.stringify(fresh));
  assert.match(fresh.data.fileName, /^myca-tds-credit-check-\d{4}-\d{2}\.xlsx$/);
  assert.equal(fresh.data.title, 'Form 26AS check');
  assert.deepEqual(fresh.data.sheets.map((sheet) => sheet.name), ['26AS vs books', 'Summary']);
  assert.equal(fresh.data.sheets[0].rows, 0);

  const state = await checkBooks();
  const out = reportSheet(state, 'tds_credit_check', { period: '2026-10' });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.data.period, 'FY 2026-27');
  assert.deepEqual(out.data.sheets.map((sheet) => [sheet.name, sheet.rows]).slice(0, 1), [['26AS vs books', 6]]);
  const rows = sheetRows(out, 1);
  assert.deepEqual(rows[0], ['Section', 'TAN', 'Deductor', 'Customer', 'Quarter', 'In 26AS', 'In books', 'Gap', 'Status']);
  assert.deepEqual(rows[2], ['194J', 'EAST12345B', 'EASTERN CONSULTANTS LLP', 'Eastern Consultants', 'Q2 2026-27', 1500, 1000, -500, 'more in 26AS']);
  assert.deepEqual(rows[3].slice(5), [800, 0, -800, 'not in books']);
  const summary = sheetRows(out, 2);
  assert.deepEqual(summary[0], ['Item', 'Value']);
  const byItem = Object.fromEntries(summary.slice(1));
  assert.equal(byItem['Financial year'], '2026-27');
  assert.equal(byItem['In 26AS'], 6800);
  assert.equal(byItem['In books'], 9000);
  assert.equal(byItem['In 26AS but not in books'], 800);
  assert.equal(byItem['In books but not in 26AS'], 3500);

  const us = createState();
  us.company = { ...us.company, country: 'US' };
  assert.equal(reportSheet(us, 'tds_credit_check', {}).error, 'NOT_FOR_COUNTRY');

  const plan = (sentence) => planLocalToolCall(state, sentence);
  assert.deepEqual(plan('check 26AS against the books in excel'), { kind: 'tool', name: 'export_xlsx', args: { report: 'tds_credit_check' } });
  assert.deepEqual(plan('export tds credits to excel'), { kind: 'tool', name: 'export_xlsx', args: { report: 'tds_credit_check' } });
  assert.deepEqual(plan('export the 26AS check to excel for last month'), { kind: 'tool', name: 'export_xlsx', args: { report: 'tds_credit_check', period: 'last-month' } });
  assert.deepEqual(plan('tds in excel'), { kind: 'tool', name: 'export_xlsx', args: { report: 'tds_summary' } });
  assert.deepEqual(plan('export tds summary to excel'), { kind: 'tool', name: 'export_xlsx', args: { report: 'tds_summary' } });
  assert.deepEqual(plan('reconcile the bank in excel'), { kind: 'tool', name: 'export_xlsx', args: { report: 'bank_reconciliation' } });
  assert.equal(validateAssistantToolCall('export_xlsx', { report: 'tds_credit_check' }).ok, true);
});

test('sales and customer dues sheets keep their columns, and add a TDS withheld column only when TDS was withheld, with Received meaning cash', async () => {
  const state = books();
  await sale(state, 'Kiran Stores', 1000, '2026-08-05');
  const plainSales = reportSheet(state, 'sales', { period: '2026-08' });
  assert.deepEqual(sheetRows(plainSales, 1)[0], ['Date', 'Number', 'Customer', 'GSTIN', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total', 'Received', 'Outstanding', 'Status']);
  const plainDues = reportSheet(state, 'customer_dues', {});
  assert.deepEqual(sheetRows(plainDues, 1)[0], ['Customer', 'GSTIN', 'Invoice', 'Date', 'Due date', 'Total', 'Received', 'Outstanding', 'Days overdue']);

  await sale(state, 'Delta Projects', 100000, '2026-08-06');
  await withheld(state, { invoiceId: 'INV-0002', amount: 2000, date: '2026-08-20', section: '194J' });
  await runTool(state, 'record_receipt', { invoiceId: 'INV-0002', amount: 50000, mode: 'bank', date: '2026-08-21' });
  const sales = sheetRows(reportSheet(state, 'sales', { period: '2026-08' }), 1);
  assert.deepEqual(sales[0], ['Date', 'Number', 'Customer', 'GSTIN', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total', 'Received', 'TDS withheld', 'Outstanding', 'Status']);
  const delta = sales.find((row) => row[1] === 'INV-0002');
  assert.deepEqual(delta.slice(8, 12), [100000, 50000, 2000, 48000]);
  const kiran = sales.find((row) => row[1] === 'INV-0001');
  assert.deepEqual(kiran.slice(8, 12), [1000, 0, 0, 1000]);

  const dues = sheetRows(reportSheet(state, 'customer_dues', {}), 1);
  assert.deepEqual(dues[0], ['Customer', 'GSTIN', 'Invoice', 'Date', 'Due date', 'Total', 'Received', 'TDS withheld', 'Outstanding', 'Days overdue']);
  assert.deepEqual(dues.find((row) => row[2] === 'INV-0002').slice(5, 9), [100000, 50000, 2000, 48000]);
});
