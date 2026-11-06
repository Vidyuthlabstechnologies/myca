import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { createState } from '../src/store.mjs';
import { openSession } from '../src/session.mjs';
import { createMemoryStores } from '../src/store-ports.mjs';
import { runTool, TOOLS } from '../src/tools.mjs';
import { fmtToolResult, propose, confirmPending } from '../src/router.mjs';
import { previewOf, CONFIRM_TOOLS } from '../src/chat-confirm.mjs';
import { appendAuditEvent, stateDigest } from '../src/ca-api.mjs';
import { newBook } from '../src/books.mjs';
import { createPurchase } from '../src/invoice.mjs';
import { auditEventsIn } from '../src/audit-trail.mjs';
import { periodRange } from '../src/report-sheets.mjs';
import { planCreditNote } from '../src/credit-notes.mjs';
import { tdsCreditCheck } from '../src/tds-credits.mjs';
import { payingScore, collectionDrafts } from '../src/collections.mjs';
import { payingStats } from '../src/cash-forecast.mjs';
import { rowsFor, exportEntries } from '../src/entries-export.mjs';
import { booksAuditRows } from '../src/audit-ledger.mjs';

const EVERYTHING = { from: '2000-01-01', to: '2100-12-31' };
const IMS_HEADER = 'SECTION,SUPPLIER GSTIN,SUPPLIER NAME,INVOICE NO,INVOICE DATE,TAXABLE VALUE,CGST,SGST,IGST,CESS,TOTAL VALUE,ITC AVAILABILITY';
const FABRIC_ROW = (date) => `B2B,27AABCT1332L1ZE,FABRIC CO,F-101,${date},10000,250,250,0,0,10500,Y`;
const PACK_ROW = (date) => `B2B,29AABCL1234J1ZL,PACK HOUSE,PH-9,${date},5000,0,0,600,0,5600,Y`;
const HEADER_26AS = 'Section,Name of Deductor,TAN of Deductor,Amount Paid/Credited,Tax Deducted,Date of Booking';
const NO_ROWS_SENTENCE = 'There were no rows to work on.';
const MONTH_SENTENCE = 'Say the month as YYYY-MM, for example 2026-09.';

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  return state;
}

async function sale(state, partyName, amount, date, gstRate = 0) {
  const out = await runTool(state, 'create_invoice', { partyName, lines: [{ description: 'Services', qty: 1, rate: amount, gstRate }], date });
  assert.equal(out.ok, true, JSON.stringify(out));
  return out.invoice;
}

async function withheld(state, args) {
  const out = await runTool(state, 'record_tds_withheld', args);
  assert.equal(out.ok, true, JSON.stringify(out));
  return out;
}

async function received(state, args) {
  const out = await runTool(state, 'record_receipt', args);
  assert.equal(out.ok, true, JSON.stringify(out));
  return out;
}

function addPurchase(state, date) {
  const bill = createPurchase(state, { date, partyName: 'Fabric Co', partyGstin: '27AABCT1332L1ZE', supplierInvoiceNo: 'F-101', lines: [{ description: 'Goods', hsn: '5208', qty: 1, rate: 10000, gstRate: 5 }] });
  assert.equal(bill.ok, true, JSON.stringify(bill));
}

async function imsBooks(period = '2026-09', date = '05-09-2026') {
  const state = books();
  addPurchase(state, `${period}-05`);
  const imported = await runTool(state, 'import_gstr2b', { period, csv: [IMS_HEADER, FABRIC_ROW(date), PACK_ROW(date)].join('\n'), fileName: 'g.csv' });
  assert.equal(imported.ok, true, JSON.stringify(imported));
  return state;
}

async function session() {
  const s = openSession(createMemoryStores(), { seed: false });
  const signed = await s.signIn('USR-ADMIN', '1234');
  assert.equal(signed.ok, true);
  s.state.company = { ...s.state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  return s;
}

async function imsSession() {
  const s = await session();
  addPurchase(s.state, '2026-10-05');
  const imported = await s.tool('import_gstr2b', { period: '2026-10', csv: [IMS_HEADER, FABRIC_ROW('05-10-2026')].join('\n'), fileName: 'g.csv' });
  assert.equal(imported.ok, true, JSON.stringify(imported));
  return s;
}

async function trail(s, args = {}) {
  const out = await s.tool('audit_trail', { ...EVERYTHING, ...args });
  assert.equal(out.ok, true, JSON.stringify(out));
  return out.data;
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
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'").replace(/&amp;/g, '&');
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

test('INVALID_PERIOD and NO_ROWS read as plain sentences when an IMS tool or an older import is run directly', async () => {
  const state = await imsBooks();
  const direct = [
    ['ims_review', { period: '2026-13' }, MONTH_SENTENCE],
    ['ims_review', { period: '2026-9' }, MONTH_SENTENCE],
    ['ims_decide', { period: '2026-13', select: 'all', decision: 'accept' }, MONTH_SENTENCE],
    ['ims_decide', { period: '2026-09', decision: 'accept' }, NO_ROWS_SENTENCE],
    ['import_gstr2b', { period: '2026-09', csv: IMS_HEADER, fileName: 'empty.csv' }, NO_ROWS_SENTENCE],
    ['import_26as_credits', { csv: HEADER_26AS }, NO_ROWS_SENTENCE],
  ];
  for (const [name, args, sentence] of direct) {
    const out = await runTool(state, name, args);
    assert.equal(out.ok, false, `${name} ${JSON.stringify(args)}`);
    assert.equal(fmtToolResult(name, out), sentence, `${name} ${JSON.stringify(args)}`);
  }
});

test('a confirmed IMS decision that has nothing left to work on says so in a sentence, never a code', async () => {
  const state = await imsBooks();
  const held = await propose(state, 'ims_decide', { period: '2026-09', select: 'matched', decision: 'accept' });
  assert.equal(held.awaitingConfirmation, true, held.reply);
  state.pendingChatAction.args = { period: '2026-09', decision: 'accept' };
  const done = await confirmPending(state, held.preview.token);
  assert.equal(done.posted, false);
  assert.equal(done.reply, NO_ROWS_SENTENCE);
  assert.deepEqual(state.imsDecisions, {});

  const again = await propose(state, 'ims_decide', { period: '2026-09', select: 'matched', decision: 'accept' });
  assert.equal(again.awaitingConfirmation, true, again.reply);
  const replaced = await runTool(state, 'import_gstr2b', { period: '2026-09', csv: [IMS_HEADER, PACK_ROW('10-09-2026')].join('\n'), fileName: 'g2.csv' });
  assert.equal(replaced.ok, true, JSON.stringify(replaced));
  const lost = await confirmPending(state, again.preview.token);
  assert.equal(lost.posted, false);
  assert.doesNotMatch(lost.reply, /did not go through|\(no rows\)|\(invalid period\)/, lost.reply);
  assert.deepEqual(state.imsDecisions, {});
});

test('the preview of an IMS decision already explains the same two codes in words', async () => {
  const state = await imsBooks();
  assert.deepEqual(previewOf(state, 'ims_decide', { period: '2026-09', decision: 'accept' }).blockers, ['Say which invoices, for example "accept all matched in IMS for 2026-09" or "reject FABRIC CO in IMS for 2026-09".']);
  assert.deepEqual(previewOf(state, 'ims_decide', { period: '2026-13', select: 'all', decision: 'accept' }).blockers, ['Say the month as YYYY-MM, for example 2026-10.']);
  const held = await propose(state, 'ims_decide', { period: '2026-09', decision: 'accept' });
  assert.equal(held.blocked, true);
  assert.equal(held.reply, 'I did not post anything, because:\n· Say which invoices, for example "accept all matched in IMS for September 2026" or "reject FABRIC CO in IMS for September 2026".');
});

async function creditBooks({ tds = 0, cash = 0 } = {}) {
  const state = books();
  const invoice = await sale(state, 'Delta Projects', 100000, '2026-08-05', 18);
  assert.equal(invoice.total, 118000);
  if (tds) await withheld(state, { invoiceId: invoice.id, amount: tds, date: '2026-08-20', section: '194J', tan: 'DELD12345A' });
  if (cash) await received(state, { invoiceId: invoice.id, amount: cash, mode: 'bank', date: '2026-08-25' });
  return { state, invoice };
}

test('cancelling an invoice that only had TDS withheld owes nothing back in cash', async () => {
  const { state, invoice } = await creditBooks({ tds: 1000 });
  const preview = await propose(state, 'cancel_invoice', { invoiceId: invoice.id, reason: 'wrong party' });
  assert.equal(preview.awaitingConfirmation, true, preview.reply);
  assert.doesNotMatch(preview.reply, /has paid|due back/, preview.reply);
  const out = await runTool(state, 'cancel_invoice', { invoiceId: invoice.id, reason: 'wrong party' });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.refundDue, 0);
  assert.equal(fmtToolResult('cancel_invoice', out), `Cancelled ${invoice.id} with credit note CN-0001 (Delta Projects, ${out.creditNote.date}).`);
});

test('cancelling an invoice paid in cash and TDS owes back only the cash, in the preview and in the result', async () => {
  const { state, invoice } = await creditBooks({ tds: 1000 });
  const rest = await received(state, { invoiceId: invoice.id, mode: 'bank', date: '2026-08-25' });
  assert.equal(rest.invoice.receipts.at(-1).amount, 117000);
  assert.equal(planCreditNote(state, { invoiceId: invoice.id, reason: 'wrong party' }).plan.received, 117000);
  const preview = await propose(state, 'cancel_invoice', { invoiceId: invoice.id, reason: 'wrong party' });
  assert.equal(preview.awaitingConfirmation, true, preview.reply);
  assert.match(preview.reply, /Delta Projects has paid ₹1,17,000\.00, so ₹1,17,000\.00 becomes due back to them\./, preview.reply);
  const done = await confirmPending(state, preview.preview.token);
  assert.equal(done.posted, true, done.reply);
  assert.equal(done.tools[0].result.refundDue, 117000);
  assert.match(done.reply, /₹1,17,000\.00 was already received and is now due back to Delta Projects\./, done.reply);
});

test('a credit note on an invoice with only TDS withheld owes nothing back in cash', async () => {
  const { state, invoice } = await creditBooks({ tds: 1000 });
  const out = await runTool(state, 'create_credit_note', { invoiceId: invoice.id, amount: 117500, reason: 'discount' });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.refundDue, 0);
  assert.equal(fmtToolResult('create_credit_note', out), `Credit note CN-0001 for ₹1,17,500.00 against ${invoice.id} (Delta Projects, ${out.creditNote.date}).`);
});

test('cash received is what limits the refund when TDS and cash both came in', async () => {
  const { state, invoice } = await creditBooks({ tds: 10000, cash: 50000 });
  const cancel = await runTool(state, 'cancel_invoice', { invoiceId: invoice.id, reason: 'wrong party' });
  assert.equal(cancel.ok, true, JSON.stringify(cancel));
  assert.equal(cancel.refundDue, 50000);

  const partial = await creditBooks({ tds: 10000, cash: 50000 });
  const note = await runTool(partial.state, 'create_credit_note', { invoiceId: partial.invoice.id, amount: 80000, reason: 'price reduced' });
  assert.equal(note.ok, true, JSON.stringify(note));
  assert.equal(note.refundDue, 22000);
});

test('an invoice paid fully in cash still owes back what is credited or cancelled', async () => {
  const { state, invoice } = await creditBooks({ cash: 118000 });
  const partial = await runTool(state, 'create_credit_note', { invoiceId: invoice.id, amount: 11800, reason: 'price reduced' });
  assert.equal(partial.ok, true, JSON.stringify(partial));
  assert.equal(partial.refundDue, 11800);
  assert.equal(fmtToolResult('create_credit_note', partial), `Credit note CN-0001 for ₹11,800.00 against ${invoice.id} (Delta Projects, ${partial.creditNote.date}). ₹11,800.00 was already received and is now due back to Delta Projects.`);

  const whole = await creditBooks({ cash: 118000 });
  const cancel = await runTool(whole.state, 'cancel_invoice', { invoiceId: whole.invoice.id, reason: 'wrong party' });
  assert.equal(cancel.refundDue, 118000);
  assert.match(fmtToolResult('cancel_invoice', cancel), /₹1,18,000\.00 was already received and is now due back to Delta Projects\./);
});

const ACRONYM_TOKENS = { ims: 'IMS', tds: 'TDS', gst: 'GST', itc: 'ITC', msme: 'MSME', '26as': '26AS', gstr1: 'GSTR-1', gstr2b: 'GSTR-2B', gstr3b: 'GSTR-3B', gstin: 'GSTIN', hsn: 'HSN', tcs: 'TCS' };

function summariesOf(names, extra = {}) {
  const state = createState();
  for (const name of names) appendAuditEvent(state, { actorId: 'a', action: `tool.${name}`, at: '2026-10-05T09:00:00.000Z', beforeHash: 'a', afterHash: 'a', metadata: { ok: true, ...extra } });
  const range = periodRange({ from: '2026-10-01', to: '2026-10-31' }, '2026-10-31');
  return auditEventsIn(state, range, { view: 'all' }).events.map((event) => event.summary);
}

function humanised(name) {
  const text = name.split('_').map((token) => ACRONYM_TOKENS[token] || token).join(' ');
  return text[0].toUpperCase() + text.slice(1);
}

test('tool names in the audit trail keep their acronyms in capitals', () => {
  const names = ['ims_decide', 'ims_review', 'import_gstr2b', 'import_26as_credits', 'record_tds_withheld', 'tds_credit_check', 'gst_payable', 'prepare_gstr1', 'prepare_gstr3b', 'validate_gstin', 'search_gstin', 'itc_summary', 'msme_report', 'hsn_summary', 'import_tcs_statement', 'create_invoice', 'export_xlsx'];
  assert.deepEqual(summariesOf(names), [
    'IMS decide', 'IMS review', 'Import GSTR-2B', 'Import 26AS credits', 'Record TDS withheld', 'TDS credit check', 'GST payable', 'Prepare GSTR-1', 'Prepare GSTR-3B', 'Validate GSTIN', 'Search GSTIN', 'ITC summary', 'MSME report', 'HSN summary', 'Import TCS statement', 'Create invoice', 'Export xlsx',
  ]);
  const everyTool = TOOLS.map((tool) => tool.name);
  assert.deepEqual(summariesOf(everyTool), everyTool.map(humanised));
  assert.deepEqual(summariesOf(['constructor', 'toString', 'hasOwnProperty', 'valueOf', '__proto__']), ['Constructor', 'ToString', 'HasOwnProperty', 'ValueOf', 'Proto']);
});

test('the audit words and the Excel sheet print IMS, TDS, GSTR-2B and 26AS in capitals for every way of recording them', async () => {
  const s = await imsSession();
  const invoice = await s.tool('create_invoice', { partyName: 'Kiran Stores', lines: [{ description: 'Services', qty: 1, rate: 100000, gstRate: 0 }], date: '2026-08-05' });
  assert.equal(invoice.ok, true, JSON.stringify(invoice));
  const tds = await s.tool('record_tds_withheld', { invoiceId: invoice.invoice.id, amount: 1000, section: '194J', date: '2026-08-20' });
  assert.equal(tds.ok, true, JSON.stringify(tds));
  const held = await s.propose('ims_decide', { period: '2026-10', select: 'matched', decision: 'accept' });
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.equal((await s.confirm(held.preview.token)).posted, true);
  assert.equal((await s.tool('set_supplier_terms', { partyName: 'Fabric Co', msme: true, days: 30 })).ok, true);
  assert.equal((await s.tool('import_26as_credits', { csv: [HEADER_26AS, '194C,SOME CLIENT,MUMS12345B,50000,1000,2026-09-10'].join('\n') })).ok, true);
  assert.equal((await s.tool('gst_payable', {})).ok, true);
  const data = await trail(s, { view: 'all' });
  const by = (action) => data.events.find((event) => event.action === action).summary;
  assert.equal(by('tool.import_gstr2b'), 'Import GSTR-2B');
  assert.equal(by('tool.record_tds_withheld'), `Record TDS withheld (${invoice.invoice.id}, ${tds.posted[0].id})`);
  assert.equal(by('chat.propose'), 'Proposed IMS decide');
  assert.equal(by('chat.confirm'), 'Posted IMS decide');
  assert.equal(by('tool.set_supplier_terms'), 'Set supplier terms');
  assert.equal(by('tool.import_26as_credits'), 'Import 26AS credits');
  assert.equal(by('tool.gst_payable'), 'GST payable');
  const words = (await s.chat('audit trail')).reply;
  assert.match(words, /Import 26AS credits/);
  assert.match(words, /Record TDS withheld \(/);
  assert.doesNotMatch(words, /Import 26as|Ims decide|Import gstr2b|Record tds/);

  const sheet = await s.tool('export_xlsx', { report: 'audit_trail', ...EVERYTHING });
  assert.equal(sheet.ok, true, JSON.stringify(sheet));
  const cells = sheetRows(sheet, 1).map((row) => row[4]);
  for (const wanted of ['Import 26AS credits', 'Import GSTR-2B', 'Posted IMS decide', 'GST payable', `Record TDS withheld (${invoice.invoice.id}, ${tds.posted[0].id})`]) assert.ok(cells.includes(wanted), wanted);
  assert.ok(!cells.some((cell) => /Import 26as|Ims decide|Import gstr2b|Record tds/.test(cell)));
});

test('an IMS decision confirmed by typing yes or by sending the code is a change in the audit trail', async () => {
  for (const how of ['yes', 'code']) {
    const s = await imsSession();
    const held = await s.propose('ims_decide', { period: '2026-10', select: 'matched', decision: 'accept' });
    assert.equal(held.awaitingConfirmation, true, held.reply);
    const done = await s.chat(how === 'yes' ? 'yes' : `confirm ${held.preview.token}`);
    assert.equal(done.posted, true, `${how}: ${done.reply}`);
    assert.equal(Object.keys(s.state.imsDecisions).length, 1, how);
    const changes = await trail(s);
    const typed = changes.events.filter((event) => event.action === 'chat.run');
    assert.equal(typed.length, 1, `${how}: ${JSON.stringify(changes.events.map((event) => event.action))}`);
    assert.equal(typed[0].kind, 'change', how);
    assert.notEqual(typed[0].beforeHash, typed[0].afterHash, how);
    assert.equal(typed[0].summary, 'Chat message (IMS decide)', how);
    const stored = s.state.auditEvents.find((event) => event.action === 'chat.run' && event.metadata.posted === true);
    assert.deepEqual(stored.metadata.tools, ['ims_decide']);
    assert.equal(stored.metadata.details.length, 1);
    assert.deepEqual(stored.metadata.details[0].ids, []);
    assert.equal(stored.metadata.ledgerClock.before, stored.metadata.ledgerClock.after);
    assert.equal((await s.tool('audit_trail', { ...EVERYTHING })).data.chain.ok, true);
  }
});

test('supplier terms confirmed by typing yes are a change in the audit trail', async () => {
  const s = await imsSession();
  const held = await s.propose('set_supplier_terms', { partyName: 'Fabric Co', partyGstin: '27AABCT1332L1ZE', msme: true, days: 30 });
  assert.equal(held.awaitingConfirmation, true, held.reply);
  const done = await s.chat('yes');
  assert.equal(done.posted, true, done.reply);
  assert.deepEqual(Object.keys(s.state.supplierTerms), ['gstin:27AABCT1332L1ZE']);
  const changes = await trail(s);
  const typed = changes.events.filter((event) => event.action === 'chat.run');
  assert.equal(typed.length, 1);
  assert.equal(typed[0].kind, 'change');
  assert.notEqual(typed[0].beforeHash, typed[0].afterHash);
});

test('a typed yes shows the same record ids and money entries as confirming through the app', async () => {
  const setup = async () => {
    const s = await session();
    const invoice = await s.tool('create_invoice', { partyName: 'Kiran Stores', lines: [{ description: 'Services', qty: 1, rate: 100000, gstRate: 0 }], date: '2026-08-05' });
    assert.equal(invoice.ok, true, JSON.stringify(invoice));
    return { s, invoiceId: invoice.invoice.id };
  };
  const args = (invoiceId) => ({ invoiceId, amount: 2000, section: '194J', date: '2026-08-20' });

  const typed = await setup();
  const heldTyped = await typed.s.propose('record_tds_withheld', args(typed.invoiceId));
  assert.equal(heldTyped.awaitingConfirmation, true, heldTyped.reply);
  assert.equal((await typed.s.chat('yes')).posted, true);
  const code = await setup();
  const heldCode = await code.s.propose('record_tds_withheld', args(code.invoiceId));
  assert.equal((await code.s.chat(`confirm ${heldCode.preview.token}`)).posted, true);
  const app = await setup();
  const heldApp = await app.s.propose('record_tds_withheld', args(app.invoiceId));
  assert.equal((await app.s.confirm(heldApp.preview.token)).posted, true);

  const transfer = typed.s.state.ledger.transfers.at(-1).id.toString();
  const viaApp = (await trail(app.s)).events.find((event) => event.action === 'chat.confirm');
  assert.deepEqual(viaApp.ids, [typed.invoiceId, transfer]);
  assert.deepEqual(viaApp.transfers, [transfer]);
  for (const who of [typed, code]) {
    const event = (await trail(who.s)).events.find((item) => item.action === 'chat.run' && item.kind === 'change');
    assert.ok(event, 'the typed confirmation is listed as a change');
    assert.deepEqual(event.ids, viaApp.ids);
    assert.deepEqual(event.transfers, viaApp.transfers);
    assert.notEqual(event.beforeHash, event.afterHash);
  }

  const sale = await setup();
  const heldSale = await sale.s.propose('create_invoice', { partyName: 'Kiran Stores', lines: [{ description: 'Services', qty: 1, rate: 8000, gstRate: 18 }], date: '2026-09-01' });
  assert.equal(heldSale.awaitingConfirmation, true, heldSale.reply);
  const postedSale = await sale.s.chat('yes');
  assert.equal(postedSale.posted, true, postedSale.reply);
  const posted = postedSale.tools[0].result;
  const event = (await trail(sale.s)).events.filter((item) => item.action === 'chat.run').at(-1);
  assert.equal(event.kind, 'change');
  assert.ok(event.ids.includes(posted.invoice.id));
  assert.deepEqual(event.transfers, posted.posted.map((item) => item.id.toString()));
  assert.ok(event.transfers.length >= 2);
});

test('chat messages that post nothing stay reads, including a yes that fails', async () => {
  const s = await session();
  await s.chat('help');
  const held = await s.propose('record_tds_withheld', { invoiceId: 'INV-9999', amount: 5, section: '194J' });
  assert.equal(held.blocked, true);
  const invoice = await s.tool('create_invoice', { partyName: 'Kiran Stores', lines: [{ description: 'Services', qty: 1, rate: 1000, gstRate: 0 }], date: '2026-08-05' });
  const open = await s.propose('record_tds_withheld', { invoiceId: invoice.invoice.id, amount: 5, section: '194J' });
  assert.equal(open.awaitingConfirmation, true, open.reply);
  s.state.pendingChatAction.args.invoiceId = 'INV-9999';
  const failed = await s.chat('yes');
  assert.equal(failed.posted, false, failed.reply);
  const second = await s.propose('record_tds_withheld', { invoiceId: invoice.invoice.id, amount: 5, section: '194J' });
  assert.equal(second.awaitingConfirmation, true, second.reply);
  await s.chat('no');
  const all = await trail(s, { view: 'all' });
  const runs = all.events.filter((event) => event.action === 'chat.run');
  assert.equal(runs.length, 3);
  assert.deepEqual(runs.map((event) => event.kind), ['read', 'read', 'read']);
  assert.deepEqual((await trail(s)).events.filter((event) => event.action === 'chat.run'), []);
  for (const event of s.state.auditEvents.filter((item) => item.action === 'chat.run')) {
    assert.equal(Object.hasOwn(event.metadata, 'details'), false);
    assert.equal(Object.hasOwn(event.metadata, 'ledgerClock'), false);
  }
});

test('the books digest moves when an IMS decision or a supplier term changes, in the main books and in a client book', () => {
  const state = createState();
  const base = stateDigest(state);
  state.imsDecisions['2026-10|27AABCT1332L1ZE|F101|B2B'] = { decision: 'accept', note: '', by: 'USR-ADMIN', on: '2026-10-06' };
  const withIms = stateDigest(state);
  assert.notEqual(withIms, base);
  state.supplierTerms['gstin:27AABCT1332L1ZE'] = { msme: true, udyam: '', category: '', days: 30 };
  const withTerms = stateDigest(state);
  assert.notEqual(withTerms, withIms);
  state.imsDecisions['2026-10|27AABCT1332L1ZE|F101|B2B'].decision = 'reject';
  assert.notEqual(stateDigest(state), withTerms);

  const client = createState();
  const book = newBook({ name: 'Client' });
  client.extraBooks = { 'CL-1': book };
  const clientBase = stateDigest(client);
  book.imsDecisions['k'] = { decision: 'accept' };
  const clientIms = stateDigest(client);
  assert.notEqual(clientIms, clientBase);
  book.supplierTerms['k'] = { msme: true, days: 30 };
  assert.notEqual(stateDigest(client), clientIms);
});

test('every kind of audit action lands in its own bucket', () => {
  const state = createState();
  const add = (action, metadata = {}) => appendAuditEvent(state, { actorId: 'a', action, at: '2026-10-05T09:00:00.000Z', beforeHash: 'same', afterHash: 'same', metadata }).eventId;
  const changeActions = ['chat.confirm', 'recurring_posted', 'bank_rule_applied', 'exceptions.resolve', 'exceptions.assign', 'file.upload', 'file.attach', 'books_ledger.create_invoice', 'documents.upload', 'client.add', 'user.add', 'external.nic_irn_generate', 'sandbox.gst_file_gstr1_evc'];
  const changeTools = ['lock_period', 'unlock_period', 'set_company', 'set_supplier_terms', 'save_report', 'delete_report', 'set_employee_bank', 'run_automation', 'run_recurring'];
  const expected = new Map();
  for (const action of changeActions) expected.set(add(action), 'change');
  for (const name of changeTools) expected.set(add(`tool.${name}`), 'change');
  for (const name of CONFIRM_TOOLS) expected.set(add(`tool.${name}`), 'change');
  expected.set(add('chat.run', { posted: true }), 'change');
  for (const action of ['session.login', 'session.logout', 'session.pin_changed']) expected.set(add(action), 'session');
  for (const action of ['tool.list_invoices', 'tool.audit_trail', 'tool.export_xlsx', 'tool.gst_payable', 'chat.propose', 'chat.discard']) expected.set(add(action), 'read');
  expected.set(add('chat.run', { posted: false }), 'read');
  expected.set(add('chat.run', { posted: 'true' }), 'read');
  expected.set(add('chat.run', { tools: ['audit_trail'] }), 'read');
  expected.set(appendAuditEvent(state, { actorId: 'a', at: '2026-10-05T09:00:00.000Z' }).eventId, 'read');
  assert.equal(state.auditEvents.at(-1).action, 'api_event');
  const range = periodRange({ from: '2026-10-01', to: '2026-10-31' }, '2026-10-31');
  const events = auditEventsIn(state, range, { view: 'all' }).events;
  assert.equal(events.length, expected.size);
  for (const event of events) assert.equal(event.kind, expected.get(event.eventId), `${event.action} ${event.eventId}`);
  assert.deepEqual(auditEventsIn(state, range, { view: 'changes' }).events.map((event) => event.eventId), [...expected].filter(([, kind]) => kind === 'change').map(([id]) => id));
});

test('two 26AS lines that differ only by section are both imported, and a repeat skips both', async () => {
  const csv = [HEADER_26AS, '194C,SOME CLIENT,MUMS12345B,50000,1000,2026-09-10', '194J,SOME CLIENT,MUMS12345B,50000,1000,2026-09-10'].join('\n');
  const state = books();
  const first = await runTool(state, 'import_26as_credits', { csv });
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.data.imported, 2);
  assert.deepEqual(first.data.skipped, []);
  assert.deepEqual(state.tdsCreditStatements.map((row) => row.section), ['194C', '194J']);
  const again = await runTool(state, 'import_26as_credits', { csv });
  assert.equal(again.data.imported, 0);
  assert.deepEqual(again.data.skipped.map((row) => row.reason), ['exists', 'exists']);
  assert.equal(state.tdsCreditStatements.length, 2);
});

test('one 26AS row is matched to one customer only, even when two customers could claim it', async () => {
  const state = books();
  const first = await sale(state, 'Delta Projects', 100000, '2026-08-05');
  const second = await sale(state, 'Delta Projects Private', 50000, '2026-08-06');
  await withheld(state, { invoiceId: first.id, amount: 2000, date: '2026-08-20', section: '194C' });
  await withheld(state, { invoiceId: second.id, amount: 1000, date: '2026-08-21', section: '194C' });
  await runTool(state, 'import_26as_credits', { csv: [HEADER_26AS, '194C,DELTA PROJECTS PRIVATE LIMITED,DELD12345A,100000,2000,2026-08-20'].join('\n') });
  const d = tdsCreditCheck(state, { fy: '2026-27' }).data;
  assert.deepEqual(d.rows.map((row) => [row.deductor, row.customer, row.in26as, row.inBooks, row.status]), [
    ['Delta Projects Private', 'Delta Projects Private', 0, 1000, 'not in 26AS'],
    ['DELTA PROJECTS PRIVATE LIMITED', 'Delta Projects', 2000, 2000, 'matched'],
  ]);
  assert.deepEqual(d.totals, { in26as: 2000, inBooks: 3000, gap: 1000, notInBooks: 0, notIn26as: 1000 });
});

test('one 26AS row is matched to one section only, even when one customer deducted under two', async () => {
  const state = books();
  const first = await sale(state, 'Delta Projects', 100000, '2026-08-05');
  const second = await sale(state, 'Delta Projects', 50000, '2026-08-06');
  await withheld(state, { invoiceId: first.id, amount: 2000, date: '2026-08-20', section: '194C' });
  await withheld(state, { invoiceId: second.id, amount: 500, date: '2026-08-21', section: '194J' });
  await runTool(state, 'import_26as_credits', { csv: [HEADER_26AS, '194C,DELTA PROJECTS PRIVATE LIMITED,DELD12345A,100000,2000,2026-08-20'].join('\n') });
  const d = tdsCreditCheck(state, { fy: '2026-27' }).data;
  assert.deepEqual(d.rows.map((row) => [row.section, row.in26as, row.inBooks, row.status]), [
    ['194J', 0, 500, 'not in 26AS'],
    ['194C', 2000, 2000, 'matched'],
  ]);
  assert.deepEqual(d.totals, { in26as: 2000, inBooks: 2500, gap: 500, notInBooks: 0, notIn26as: 500 });
});

test('a TDS entry with no TAN lines up with the 26AS row of its own section first, and otherwise with the first row listed', async () => {
  const state = books();
  const one = await sale(state, 'Delta Projects', 100000, '2026-08-05');
  const two = await sale(state, 'Delta Projects', 100000, '2026-08-06');
  const three = await sale(state, 'Delta Projects', 100000, '2026-08-07');
  await withheld(state, { invoiceId: one.id, amount: 700, date: '2026-08-23', section: '194I' });
  await withheld(state, { invoiceId: two.id, amount: 500, date: '2026-08-22', section: '194H' });
  await withheld(state, { invoiceId: three.id, amount: 2000, date: '2026-08-21', section: '194C' });
  const lines = [
    '194J,DELTA PROJECTS PRIVATE LIMITED,DELD12345A,50000,500,2026-08-20',
    '194C,DELTA PROJECTS PRIVATE LIMITED,DELD12345A,100000,2000,2026-08-21',
    '194I,DELTA PROJECTS,DELD99999Z,70000,700,2026-08-23',
    '194Q,DELTA PROJECTS,DELD99999Z,30000,300,2026-08-24',
  ];
  await runTool(state, 'import_26as_credits', { csv: [HEADER_26AS, ...lines].join('\n') });
  const d = tdsCreditCheck(state, { fy: '2026-27' }).data;
  assert.deepEqual(d.rows.map((row) => [row.deductor, row.section, row.customer, row.in26as, row.inBooks, row.status]), [
    ['DELTA PROJECTS', '194I', 'Delta Projects', 700, 700, 'matched'],
    ['DELTA PROJECTS', '194Q', '', 300, 0, 'not in books'],
    ['DELTA PROJECTS PRIVATE LIMITED', '194C', 'Delta Projects', 2000, 2000, 'matched'],
    ['DELTA PROJECTS PRIVATE LIMITED', '194J', 'Delta Projects', 500, 500, 'matched'],
  ]);
  assert.deepEqual(d.totals, { in26as: 3500, inBooks: 3200, gap: -300, notInBooks: 300, notIn26as: 0 });
});

test('a customer lines up with 26AS by name when either name holds the other, but never from fewer than four letters or digits', async () => {
  const state = books();
  const falcon = await sale(state, 'Falcon Traders Pvt Ltd Pune', 100000, '2026-08-05');
  const zeta = await sale(state, 'Zeta', 100000, '2026-08-06');
  const zen = await sale(state, 'Zen', 100000, '2026-08-07');
  await withheld(state, { invoiceId: falcon.id, amount: 800, date: '2026-08-20', section: '194C' });
  await withheld(state, { invoiceId: zeta.id, amount: 300, date: '2026-08-21', section: '194J' });
  await withheld(state, { invoiceId: zen.id, amount: 200, date: '2026-08-22', section: '194J' });
  const lines = [
    '194C,FALCON TRADERS PVT LTD,FALC12345C,40000,800,2026-08-20',
    '194J,ZETA INDUSTRIES,ZETA12345A,15000,300,2026-08-21',
    '194J,ZEN INDUSTRIES,ZENI12345B,10000,200,2026-08-22',
  ];
  await runTool(state, 'import_26as_credits', { csv: [HEADER_26AS, ...lines].join('\n') });
  const d = tdsCreditCheck(state, { fy: '2026-27' }).data;
  assert.deepEqual(d.rows.map((row) => [row.deductor, row.section, row.customer, row.in26as, row.inBooks, row.status]), [
    ['FALCON TRADERS PVT LTD', '194C', 'Falcon Traders Pvt Ltd Pune', 800, 800, 'matched'],
    ['Zen', '194J', 'Zen', 0, 200, 'not in 26AS'],
    ['ZEN INDUSTRIES', '194J', '', 200, 0, 'not in books'],
    ['ZETA INDUSTRIES', '194J', 'Zeta', 300, 300, 'matched'],
  ]);
});

function bigBooks(size) {
  const state = books();
  const dates = ['2026-04-12', '2026-07-20', '2026-10-05', '2027-01-09'];
  const sections = ['194C', '194J', '194H'];
  const pad = (n) => String(n).padStart(6, '0');
  state.invoices = [];
  state.tdsCreditStatements = [];
  for (let i = 0; i < size; i += 1) {
    const section = sections[i % 3];
    const date = dates[i % 4];
    const amount = 20 + (i % 7);
    const tan = `TAN${String.fromCharCode(65 + (i % 26))}${String(10000 + (i % 9000)).padStart(5, '0')}${String.fromCharCode(65 + ((i >> 3) % 26))}`;
    state.invoices.push({ id: `INV-${i + 1}`, partyName: `Acme${pad(i)} Traders`, total: 1000, status: 'partial', receipts: [{ amount, date, mode: 'tds', section, ...(i % 2 ? { tan } : {}) }] });
    state.tdsCreditStatements.push({ section, tan, name: `ACME${pad(i)} TRADERS PRIVATE LIMITED`, date, quarter: `Q${(i % 4) + 1} 2026-27`, channel: '', amountPaid: null, taxDeducted: amount, importedOn: '2026-11-01' });
  }
  for (let i = 0; i < size / 10; i += 1) {
    state.invoices.push({ id: `INV-X${i}`, partyName: `Loner${pad(i)} Stores`, total: 1000, status: 'partial', receipts: [{ amount: 15, date: dates[i % 4], mode: 'tds', section: sections[i % 3] }] });
    state.tdsCreditStatements.push({ section: sections[i % 3], tan: `LONE${pad(i).slice(1)}Z`, name: `SOMEBODY${pad(i)} ELSE LTD`, date: dates[i % 4], quarter: `Q${(i % 4) + 1} 2026-27`, channel: '', amountPaid: null, taxDeducted: 15, importedOn: '2026-11-01' });
  }
  return state;
}

test('the 26AS check stays fast on thousands of invoices and rows', () => {
  const size = 12000;
  const state = bigBooks(size);
  const started = performance.now();
  const out = tdsCreditCheck(state, { fy: '2026-27' });
  const took = performance.now() - started;
  const rows = out.data.rows;
  assert.equal(rows.length, size + 2 * (size / 10));
  assert.equal(rows.filter((row) => row.status === 'matched').length, size);
  assert.equal(rows.filter((row) => row.status === 'not in books').length, size / 10);
  assert.equal(rows.filter((row) => row.status === 'not in 26AS').length, size / 10);
  assert.ok(took < 3000, `took ${Math.round(took)} ms`);
});

test('a TDS receipt is listed as TDS withheld wherever receipts are listed by how they were paid', async () => {
  const state = books();
  const invoice = await sale(state, 'Delta Projects', 100000, '2026-08-05');
  await withheld(state, { invoiceId: invoice.id, amount: 2000, date: '2026-08-20', section: '194J' });
  await received(state, { invoiceId: invoice.id, amount: 50000, mode: 'cash', date: '2026-08-21' });
  await received(state, { invoiceId: invoice.id, amount: 48000, mode: 'bank', date: '2026-08-22' });
  const receipts = rowsFor(state, '2026-08').filter((row) => row[1] === 'Receipt');
  assert.deepEqual(receipts.map((row) => [row[0], row[11], row[12]]), [['2026-08-20', 2000, 'TDS withheld'], ['2026-08-21', 50000, 'cash'], ['2026-08-22', 48000, 'bank']]);
  const csv = exportEntries(state, { period: '2026-08' }).data.csv.split(/\r?\n/);
  assert.ok(csv.some((line) => /^2026-08-20,Receipt,.*,2000,TDS withheld,/.test(line)), csv.join('\n'));
  const sheet = await runTool(state, 'export_xlsx', { report: 'entries', period: '2026-08' });
  assert.equal(sheet.ok, true, JSON.stringify(sheet));
  assert.deepEqual(sheetRows(sheet, 1).filter((row) => row[1] === 'Receipt').map((row) => row[row.length - 2]), ['TDS withheld', 'cash', 'bank']);
  const ledger = booksAuditRows(state).filter((row) => row[6] === 'receipt').map((row) => [row[1], row[2]]);
  assert.deepEqual(ledger, [['2026-08-20', `${invoice.id} TDS withheld`], ['2026-08-21', `${invoice.id} received`], ['2026-08-22', `${invoice.id} received`]]);
});

test('a TDS entry is not the customer paying: it is ignored as the last payment date in collections', async () => {
  const state = books();
  for (const [date, cash, tds] of [['2026-05-01', '2026-05-11', '2026-07-01'], ['2026-06-01', '2026-06-11', '2026-08-01'], ['2026-07-01', '2026-07-11', '2026-09-01']]) {
    const invoice = await sale(state, 'Delta Projects', 10000, date);
    await received(state, { invoiceId: invoice.id, amount: 9700, mode: 'bank', date: cash });
    await withheld(state, { invoiceId: invoice.id, amount: 300, date: tds, section: '194C' });
  }
  const tdsOnly = await sale(state, 'Delta Projects', 2000, '2026-08-01');
  await withheld(state, { invoiceId: tdsOnly.id, amount: 2000, date: '2026-09-15', section: '194C' });
  const score = payingScore(state, 'Delta Projects', '2026-11-06');
  assert.deepEqual([score.score, score.paid, score.onTime, score.late], ['good', 3, 3, 0]);

  const open = books();
  const quiet = await sale(open, 'Delta Projects', 10000, '2026-08-01');
  await withheld(open, { invoiceId: quiet.id, amount: 300, date: '2026-11-03', section: '194C' });
  const paying = await sale(open, 'Eastern Consultants', 10000, '2026-08-01');
  await received(open, { invoiceId: paying.id, amount: 500, mode: 'bank', date: '2026-11-03' });
  const drafts = collectionDrafts(open, { today: '2026-11-06' });
  assert.equal(drafts.ok, true, JSON.stringify(drafts));
  assert.deepEqual(drafts.data.customers.map((row) => row.customer), ['Delta Projects']);
  assert.deepEqual(drafts.data.possiblyPaid.map((row) => row.customer), ['Eastern Consultants']);
  assert.equal(collectionDrafts(open, { customer: 'Delta Projects', today: '2026-11-06' }).ok, true);
  assert.equal(collectionDrafts(open, { customer: 'Eastern Consultants', today: '2026-11-06' }).error, 'POSSIBLY_PAID');
});

test('a TDS entry is not the customer paying: it is ignored as the last payment date in the cash forecast', async () => {
  const state = books();
  const invoice = await sale(state, 'Delta Projects', 10000, '2026-08-01');
  await received(state, { invoiceId: invoice.id, amount: 9700, mode: 'bank', date: '2026-08-11' });
  await withheld(state, { invoiceId: invoice.id, amount: 300, date: '2026-09-10', section: '194C' });
  const alone = await sale(state, 'Eastern Consultants', 2000, '2026-08-01');
  await withheld(state, { invoiceId: alone.id, amount: 2000, date: '2026-09-15', section: '194C' });
  assert.equal(state.invoices.find((item) => item.id === invoice.id).status, 'paid');
  assert.equal(state.invoices.find((item) => item.id === alone.id).status, 'paid');
  const stats = payingStats(state);
  assert.equal(stats.get('delta projects').median, 10);
  assert.equal(stats.get('delta projects').n, 1);
  assert.equal(stats.has('eastern consultants'), false);
});
