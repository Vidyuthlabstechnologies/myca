import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-fix7-'));
process.env.HOME = process.env.APPDATA;

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { createState } from '../src/store.mjs';
import { openSession } from '../src/session.mjs';
import { createMemoryStores } from '../src/store-ports.mjs';
import { runTool, TOOLS } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { assistantTools } from '../src/assistant-contract.mjs';
import { appendAuditEvent } from '../src/ca-api.mjs';
import { verifyAuditChain, auditTrailWords, auditEventsIn } from '../src/audit-trail.mjs';
import { reportSheet, periodRange } from '../src/report-sheets.mjs';
import * as textSafe from '../src/text-safe.mjs';
import * as gstr2bCheck from '../src/gstr2b-check.mjs';
import { gst } from '../src/sprint-load.mjs';
import { localToday } from '../src/dates.mjs';

const TODAY = localToday();
const EVERYTHING = { from: '2000-01-01', to: '2100-12-31' };
const NOT_SEALED = 'the client an event is filed under is not sealed';
const GSTIN = '27AABCT1332L1ZE';
const KEY = `gstin:${GSTIN}`;
const BANK_A = { partyName: 'Fabric Co', partyGstin: GSTIN, account: '123456789012', ifsc: 'HDFC0001234', holder: 'Fabric Co' };
const BANK_B = { partyName: 'Fabric Co', partyGstin: GSTIN, account: '999988887777', ifsc: 'ICIC0004321', holder: 'Fabric Co' };

function shift(days) {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  return state;
}

async function bill(state, partyName, partyGstin, supplierInvoiceNo, date, rate = 100000) {
  const out = await runTool(state, 'create_purchase', { partyName, ...(partyGstin ? { partyGstin } : {}), supplierInvoiceNo, date, lines: [{ description: 'Goods', hsn: '5208', qty: 1, rate, gstRate: 5 }] });
  assert.equal(out.ok, true, JSON.stringify(out));
  return out.invoice;
}

async function session() {
  const s = openSession(createMemoryStores(), { seed: false });
  const signed = await s.signIn('USR-ADMIN', '1234');
  assert.equal(signed.ok, true);
  s.state.company = { ...s.state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  return s;
}

async function trail(s, args = {}) {
  const out = await s.tool('audit_trail', { ...EVERYTHING, ...args });
  assert.equal(out.ok, true, JSON.stringify(out));
  return out.data;
}

function sheetXmls(base64) {
  const buffer = Buffer.from(base64, 'base64');
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

function summaryOf(out) {
  assert.equal(out.ok, true, JSON.stringify(out));
  const xml = sheetXmls(out.data.xlsxBase64).get('xl/worksheets/sheet3.xml');
  const unescape = (text) => text.replace(/&(amp|lt|gt|quot|#39);/g, (_, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[name]));
  const rows = [...xml.matchAll(/<row r="(\d+)">(.*?)<\/row>/g)].map((row) => [...row[2].matchAll(/<c r="([A-Z]+)\d+"[^>]*>(?:<is><t[^>]*>(.*?)<\/t><\/is>|<v>(.*?)<\/v>)<\/c>/g)].map((m) => (m[3] !== undefined ? Number(m[3]) : unescape(m[2]))));
  return new Map(rows.map((row) => [row[0], row[1]]));
}

function legacyEvents(count) {
  return Array.from({ length: count }, (_, index) => ({
    eventId: `AUD-9${String(index + 1).padStart(5, '0')}`,
    actorId: 'api',
    clientId: 'SELF',
    action: index % 2 ? 'tool.list_invoices' : 'documents.upload',
    at: '2026-01-05T10:00:00.000Z',
    beforeHash: 'a',
    afterHash: 'a',
    metadata: {},
  }));
}

test('E1: set_supplier_terms keeps the saved bank record and whatever else is stored with it, and writes the terms as before', async () => {
  const state = books();
  await bill(state, 'Fabric Co', GSTIN, 'F-1', shift(-12));
  const saved = await runTool(state, 'set_supplier_bank', BANK_A);
  assert.equal(saved.ok, true, JSON.stringify(saved));
  const bank = JSON.parse(JSON.stringify(state.supplierTerms[KEY].bank));
  assert.equal(bank.account, '123456789012');
  state.supplierTerms[KEY].reviewedBy = { by: 'CA', on: '2026-11-01' };

  const terms = await runTool(state, 'set_supplier_terms', { partyName: 'Fabric Co', partyGstin: GSTIN, msme: true, category: 'small' });
  assert.equal(terms.ok, true, JSON.stringify(terms));
  assert.deepEqual(state.supplierTerms[KEY], { msme: true, udyam: '', category: 'small', days: null, bank, reviewedBy: { by: 'CA', on: '2026-11-01' } });
  assert.deepEqual(Object.keys(terms).sort(), ['before', 'category', 'covered', 'days', 'gstin', 'msme', 'ok', 'supplier', 'udyam']);
  assert.equal(terms.msme, true);
  assert.equal(terms.category, 'small');
  assert.equal(terms.days, null);

  const days = await runTool(state, 'set_supplier_terms', { partyName: 'Fabric Co', partyGstin: GSTIN, days: 20 });
  assert.equal(days.ok, true, JSON.stringify(days));
  assert.deepEqual(state.supplierTerms[KEY], { msme: true, udyam: '', category: 'small', days: 20, bank, reviewedBy: { by: 'CA', on: '2026-11-01' } });

  const off = await runTool(state, 'set_supplier_terms', { partyName: 'Fabric Co', partyGstin: GSTIN, msme: false });
  assert.equal(off.ok, true, JSON.stringify(off));
  assert.deepEqual(state.supplierTerms[KEY], { msme: false, udyam: '', category: '', days: 20, bank, reviewedBy: { by: 'CA', on: '2026-11-01' } });
});

test('E1: the answer to set_supplier_terms shows the saved bank with the account masked, as set_supplier_bank does, while the books keep the whole number', async () => {
  const state = books();
  await bill(state, 'Fabric Co', GSTIN, 'F-1', shift(-12));
  const saved = await runTool(state, 'set_supplier_bank', BANK_A);
  assert.equal(saved.ok, true, JSON.stringify(saved));
  const first = await runTool(state, 'set_supplier_terms', { partyName: 'Fabric Co', partyGstin: GSTIN, msme: true, category: 'small' });
  const second = await runTool(state, 'set_supplier_terms', { partyName: 'Fabric Co', partyGstin: GSTIN, days: 20 });
  for (const answer of [first, second]) {
    assert.equal(answer.ok, true, JSON.stringify(answer));
    assert.equal(answer.before.bank.account, 'xxxx9012');
    assert.equal(answer.before.bank.ifsc, 'HDFC0001234');
    assert.equal(answer.before.bank.holder, 'Fabric Co');
    assert.equal(JSON.stringify(answer).includes('123456789012'), false, 'the whole account number is not in the answer');
  }
  assert.equal(second.before.days, null);
  assert.equal(second.before.category, 'small');
  assert.equal(state.supplierTerms[KEY].bank.account, '123456789012', 'the books keep the whole number for the payout file');
  const swapped = await runTool(state, 'set_supplier_bank', BANK_B);
  assert.equal(swapped.changed, true);
  const third = await runTool(state, 'set_supplier_terms', { partyName: 'Fabric Co', partyGstin: GSTIN, days: 25 });
  assert.equal(third.before.bank.account, 'xxxx7777');
  assert.equal(third.before.bank.changedFrom.account, 'xxxx9012');
  assert.equal(JSON.stringify(third).includes('999988887777'), false);
  assert.equal(JSON.stringify(third).includes('123456789012'), false);
  const nobank = await runTool(state, 'set_supplier_terms', { partyName: 'Ravi Packaging', msme: true, category: 'micro' });
  assert.equal(nobank.ok, true, JSON.stringify(nobank));
  assert.equal(nobank.before, null);
  const again = await runTool(state, 'set_supplier_terms', { partyName: 'Ravi Packaging', days: 15 });
  assert.deepEqual(again.before, { msme: true, udyam: '', category: 'micro', days: null });
});

test('E1: after set_supplier_bank then set_supplier_terms, a later bank change is still caught and the payout file marks it', async () => {
  const state = books();
  await runTool(state, 'set_supplier_terms', { partyName: 'Fabric Co', partyGstin: GSTIN, days: 10 });
  await bill(state, 'Fabric Co', GSTIN, 'F-1', shift(-12));
  await runTool(state, 'set_cash_balance', { bank: 5000000, cash: 0, on: TODAY });
  assert.equal((await runTool(state, 'set_supplier_bank', BANK_A)).changed, false);
  const terms = await runTool(state, 'set_supplier_terms', { partyName: 'Fabric Co', partyGstin: GSTIN, msme: true, category: 'small' });
  assert.equal(terms.ok, true, JSON.stringify(terms));

  const swapped = await runTool(state, 'set_supplier_bank', BANK_B);
  assert.equal(swapped.ok, true, JSON.stringify(swapped));
  assert.equal(swapped.changed, true, 'the swap is seen as a change');
  assert.deepEqual(state.supplierTerms[KEY].bank.changedFrom, { account: 'xxxx9012', ifsc: 'HDFC0001234', upi: '' });
  assert.equal(state.supplierTerms[KEY].msme, true, 'the terms survive the bank change');
  const payout = await runTool(state, 'supplier_payout_file', {});
  assert.equal(payout.ok, true, JSON.stringify(payout));
  assert.equal(payout.data.ready.length, 1, JSON.stringify(payout.data));
  assert.equal(payout.data.ready[0].account, '999988887777');
  assert.equal(payout.data.ready[0].recentlyChanged, true);
  assert.match(payout.data.warning, /bank details were changed recently/);
});

test('E1: marking a supplier MSME in chat, then yes, keeps the bank record', async () => {
  const state = books();
  await bill(state, 'Fabric Co', GSTIN, 'F-1', shift(-3));
  await runTool(state, 'set_supplier_bank', BANK_A);
  const before = JSON.parse(JSON.stringify(state.supplierTerms[KEY].bank));
  const held = await chat(state, 'Fabric Co is MSME');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  const done = await chat(state, 'yes');
  assert.equal(done.posted, true, done.reply);
  assert.equal(state.supplierTerms[KEY].msme, true);
  assert.deepEqual(state.supplierTerms[KEY].bank, before);
});

test('E1: a supplier first recorded by name keeps its bank when the terms arrive with a GSTIN and the record moves to the GSTIN key', async () => {
  const state = books();
  await bill(state, 'Ravi Packaging', '', 'RP-1', shift(-3));
  const saved = await runTool(state, 'set_supplier_bank', { partyName: 'Ravi Packaging', account: '50100123456789', ifsc: 'HDFC0001234', holder: 'Ravi Packaging' });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  assert.deepEqual(Object.keys(state.supplierTerms), ['name:ravi packaging']);
  const bank = JSON.parse(JSON.stringify(state.supplierTerms['name:ravi packaging'].bank));
  const terms = await runTool(state, 'set_supplier_terms', { partyName: 'Ravi Packaging', partyGstin: '24AAACF7856R1ZY', days: 20 });
  assert.equal(terms.ok, true, JSON.stringify(terms));
  assert.deepEqual(state.supplierTerms['gstin:24AAACF7856R1ZY'], { msme: false, udyam: '', category: '', days: 20, bank });
});

test('E2: the audit trail words and the Summary row say how many events were recorded before sealing and are not covered', async () => {
  const s = await session();
  s.state.auditEvents.unshift(...legacyEvents(7));
  await s.tool('list_invoices', {});
  const verdict = verifyAuditChain(s.state);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.unchained, 7);
  const chained = verdict.chained;
  const sentence = '7 earlier events were recorded before sealing and are not covered';

  const data = await trail(s);
  assert.equal(data.chain.unchained, 7);
  const first = auditTrailWords(data).split('\n')[0];
  assert.ok(first.endsWith(`, log chain verified (${chained} events; ${NOT_SEALED}; ${sentence})`), first);
  const asked = await s.chat('audit trail');
  assert.match(asked.reply.split('\n')[0], new RegExp(`log chain verified \\(\\d+ events; ${NOT_SEALED}; ${sentence}\\)$`), asked.reply);

  const row = summaryOf(reportSheet(s.state, 'audit_trail', EVERYTHING)).get('Log chain');
  assert.match(row, new RegExp(`^verified \\d+ events; ${NOT_SEALED}; ${sentence}$`), row);
});

test('E2: one earlier event is said in the singular, nothing chained yet says so without the client caveat, and a clean log reads as before', async () => {
  const base = { from: '2026-10-01', to: '2026-10-31', view: 'changes', count: 0, total: 0, more: false, events: [] };
  const head = '0 changes between 2026-10-01 and 2026-10-31, ';
  assert.equal(auditTrailWords({ ...base, chain: { ok: true, chained: 3, unchained: 1 } }), `${head}log chain verified (3 events; ${NOT_SEALED}; 1 earlier event was recorded before sealing and is not covered)`);
  assert.equal(auditTrailWords({ ...base, chain: { ok: true, chained: 0, unchained: 4 } }), `${head}log chain verified (0 events; 4 earlier events were recorded before sealing and are not covered)`);
  assert.equal(auditTrailWords({ ...base, chain: { ok: true, chained: 1, unchained: 12 } }), `${head}log chain verified (1 event; ${NOT_SEALED}; 12 earlier events were recorded before sealing and are not covered)`);
  assert.equal(auditTrailWords({ ...base, chain: { ok: true, chained: 3, unchained: 0 } }), `${head}log chain verified (3 events; ${NOT_SEALED})`);
  assert.equal(auditTrailWords({ ...base, chain: { ok: true, chained: 3 } }), `${head}log chain verified (3 events; ${NOT_SEALED})`);
  assert.equal(auditTrailWords({ ...base, chain: { ok: true, chained: 0, unchained: 0 } }), `${head}log chain verified (0 events)`);
  assert.equal(auditTrailWords({ ...base, chain: { ok: false, error: 'HASH_MISMATCH', at: 'AUD-000007', chained: 6, unchained: 3 } }), `${head}LOG CHAIN BROKEN at AUD-000007`);

  const clean = await session();
  await clean.tool('list_invoices', {});
  const chained = verifyAuditChain(clean.state).chained;
  assert.equal(verifyAuditChain(clean.state).unchained, 0);
  assert.ok(auditTrailWords(await trail(clean)).split('\n')[0].endsWith(`log chain verified (${chained} events; ${NOT_SEALED})`));
  const chainedNow = verifyAuditChain(clean.state).chained;
  assert.equal(summaryOf(reportSheet(clean.state, 'audit_trail', EVERYTHING)).get('Log chain'), `verified ${chainedNow} events; ${NOT_SEALED}`);
  assert.equal(summaryOf(reportSheet(createState(), 'audit_trail', {})).get('Log chain'), 'verified 0 events');

  const one = await session();
  await one.tool('list_invoices', {});
  one.state.auditEvents.unshift(...legacyEvents(1));
  const oneChained = verifyAuditChain(one.state).chained;
  assert.equal(summaryOf(reportSheet(one.state, 'audit_trail', EVERYTHING)).get('Log chain'), `verified ${oneChained} events; ${NOT_SEALED}; 1 earlier event was recorded before sealing and is not covered`);

  const legacyOnly = createState();
  legacyOnly.auditEvents = legacyEvents(5);
  assert.equal(summaryOf(reportSheet(legacyOnly, 'audit_trail', EVERYTHING)).get('Log chain'), 'verified 0 events; 5 earlier events were recorded before sealing and are not covered');
});

test('E2: the Summary sheet keeps its key list', async () => {
  const s = await session();
  s.state.auditEvents.unshift(...legacyEvents(2));
  const summary = summaryOf(reportSheet(s.state, 'audit_trail', EVERYTHING));
  assert.deepEqual([...summary.keys()], ['Item', 'Period', 'Events', 'Changes', 'Log chain', 'Ledger chain', 'Ledger last checksum', 'Exported at (UTC ISO)', 'Audit sheet sha256']);
});

test('E4: request_documents, record_document_received and correct_eval are changes in the audit trail, in the words and in the Excel counts', async () => {
  const s = await session();
  const asked = await s.tool('request_documents', { clientId: 'SELF', period: TODAY.slice(0, 7), items: ['Bank statement', 'Sales register'], dueOn: TODAY });
  assert.equal(asked.ok, true, JSON.stringify(asked));
  const got = await s.tool('record_document_received', { id: asked.request.id, item: 'Bank statement' });
  assert.equal(got.ok, true, JSON.stringify(got));
  await s.chat('help');
  const evalId = s.state.evalEvents[0].id;
  const corrected = await s.tool('correct_eval', { id: evalId, note: 'should have shown the books check' });
  assert.equal(corrected.ok, true, JSON.stringify(corrected));

  const changes = await trail(s);
  assert.deepEqual(changes.events.map((event) => [event.action, event.kind]), [['tool.request_documents', 'change'], ['tool.record_document_received', 'change'], ['tool.correct_eval', 'change']]);
  assert.equal(changes.count, 3);
  const words = (await s.chat('audit trail')).reply;
  assert.match(words.split('\n')[0], /^3 changes between /, words);
  assert.match(words, /Request documents/);
  assert.match(words, /Record document received/);
  assert.match(words, /Correct eval/);
  const everything = await trail(s, { view: 'all' });
  assert.deepEqual(everything.events.filter((event) => event.kind === 'change').map((event) => event.action), ['tool.request_documents', 'tool.record_document_received', 'tool.correct_eval']);
  assert.equal(summaryOf(reportSheet(s.state, 'audit_trail', EVERYTHING)).get('Changes'), 3);
});

test('E4: the same tools run from a typed chat message are changes too, and a chat message that only reads is not', async () => {
  const s = await session();
  const month = TODAY.slice(0, 7);
  const asked = await s.chat(`request documents from SELF: Bank statement, Sales register for ${month} by ${TODAY}`);
  assert.deepEqual(asked.tools.map((tool) => tool.name), ['request_documents'], asked.reply);
  const id = asked.tools[0].result.request.id;
  const got = await s.chat(`received bank statement for ${id}`);
  assert.deepEqual(got.tools.map((tool) => tool.name), ['record_document_received'], got.reply);
  await s.chat('help');
  await s.tool('list_invoices', {});
  const changes = await trail(s);
  assert.deepEqual(changes.events.map((event) => [event.action, event.kind, event.summary]), [['chat.run', 'change', 'Chat message (Request documents)'], ['chat.run', 'change', 'Chat message (Record document received)']]);
});

test('E4: a yes that fails, a preview and a chat message that runs a read tool stay reads', async () => {
  const s = await session();
  await bill(s.state, 'Fabric Co', GSTIN, 'F-1', shift(-3));
  const held = await s.propose('set_supplier_terms', { partyName: 'Fabric Co', partyGstin: GSTIN, msme: true, days: 30 });
  assert.equal(held.awaitingConfirmation, true, held.reply);
  s.state.pendingChatAction.args.days = 60;
  const failed = await s.chat('yes');
  assert.equal(failed.posted, false, failed.reply);
  assert.deepEqual(failed.tools.map((tool) => tool.name), ['set_supplier_terms']);
  const second = await s.propose('set_supplier_terms', { partyName: 'Fabric Co', partyGstin: GSTIN, msme: true, days: 30 });
  assert.equal(second.awaitingConfirmation, true, second.reply);
  await s.chat('no');
  await s.chat('who owes me money');
  await s.chat('audit trail');
  const all = await trail(s, { view: 'all' });
  const runs = all.events.filter((event) => event.action === 'chat.run');
  assert.ok(runs.length >= 4, JSON.stringify(runs.map((event) => event.summary)));
  assert.deepEqual([...new Set(runs.map((event) => event.kind))], ['read']);
  assert.deepEqual((await trail(s)).events, []);
});

test('E4: a share that recorded something is a change, a cancelled share and a failed one are not, and the summary names the document', async () => {
  const s = await session();
  const invoice = await s.tool('create_invoice', { partyName: 'Delta Projects', date: TODAY, lines: [{ description: 'Services', qty: 1, rate: 100000, gstRate: 18 }] });
  assert.equal(invoice.ok, true, JSON.stringify(invoice));
  const quote = await s.tool('create_quote', { partyName: 'Delta Projects', lines: [{ description: 'Services', qty: 1, rate: 5000, gstRate: 18 }] });
  assert.equal(quote.ok, true, JSON.stringify(quote));
  const quoteId = quote.quote.id;
  assert.equal((await s.tool('record_share', { invoiceId: invoice.invoice.id, channel: 'share_sheet', outcome: 'cancelled' })).recorded, false);
  assert.equal((await s.tool('record_share', { invoiceId: invoice.invoice.id, channel: 'share_sheet', outcome: 'shared' })).recorded, true);
  assert.equal((await s.tool('record_share', { invoiceId: quoteId, channel: 'share_sheet', outcome: 'shared' })).recorded, true);
  assert.equal((await s.tool('record_share', { invoiceId: quoteId, channel: 'print', outcome: 'cancelled' })).recorded, false);
  assert.equal((await s.tool('record_share', { invoiceId: 'INV-9999', channel: 'share_sheet', outcome: 'shared' })).ok, false);

  const shares = (await trail(s, { view: 'all' })).events.filter((event) => event.action === 'tool.record_share');
  assert.deepEqual(shares.map((event) => [event.kind, event.summary]), [
    ['read', 'Record share'],
    ['change', `Record share (${invoice.invoice.id})`],
    ['change', `Record share (${quoteId})`],
    ['read', 'Record share'],
    ['read', 'Record share did not go through'],
  ]);
  assert.equal(shares.filter((event) => event.kind === 'change').length, 2);
  const changes = (await trail(s)).events.filter((event) => event.action === 'tool.record_share');
  assert.equal(changes.length, 2);
});

test('E4: every writes_books tool in the catalogue is a change in the audit trail, by its confirmation or by name, or is a share that recorded something', () => {
  const catalogue = assistantTools(TOOLS).filter((tool) => tool.risk === 'writes_books').map((tool) => tool.name);
  assert.ok(catalogue.length > 50, String(catalogue.length));
  for (const name of ['request_documents', 'record_document_received', 'correct_eval', 'record_share', 'create_invoice', 'set_supplier_terms']) assert.ok(catalogue.includes(name), name);
  const state = createState();
  const kinds = new Map();
  for (const name of catalogue) {
    const event = appendAuditEvent(state, { actorId: 'a', action: `tool.${name}`, at: '2026-10-05T09:00:00.000Z', beforeHash: 'same', afterHash: 'same', metadata: { ok: true, args: [], details: { ids: [] } } });
    kinds.set(name, event.eventId);
  }
  const found = auditEventsIn(state, periodRange({ from: '2026-10-01', to: '2026-10-31' }, '2026-10-31'), { view: 'all' }).events;
  const kindOf = new Map(found.map((event) => [event.eventId, event.kind]));
  const missing = catalogue.filter((name) => name !== 'record_share' && kindOf.get(kinds.get(name)) !== 'change');
  assert.deepEqual(missing, [], `writes_books tools that do not show as changes: ${missing.join(', ')}`);
  assert.equal(kindOf.get(kinds.get('record_share')), 'read', 'a share that recorded nothing is not a change');
});

const AS_OF = '2026-10-05';

const MSME_BILL = (date, no, name = 'Fabric Co', gstin = '27AAACF1234A1Z5') => ({ partyName: name, partyGstin: gstin, lines: [{ description: 'Cloth', hsn: '5208', qty: 10, rate: 1000, gstRate: 5 }], date, supplierInvoiceNo: no });
const msmeReminders = (state) => (state.reminders || []).filter((item) => String(item.source || '').startsWith('msme:'));
const openTitles = async (state, today) => (await runTool(state, 'list_reminders', { today })).data.reminders.map((item) => item.text);

test('E5: paying the bill completes its MSME reminder at once, so the reminder list and the week ahead stop telling the owner to pay it', async () => {
  const state = books();
  await runTool(state, 'set_supplier_terms', { partyName: 'Fabric Co', msme: true, category: 'small' });
  await runTool(state, 'create_purchase', MSME_BILL('2026-09-30', 'F-1'));
  await runTool(state, 'create_purchase', MSME_BILL('2026-09-30', 'F-2'));
  const manual = await runTool(state, 'add_reminder', { text: 'Ask Fabric Co for the GST invoice', due: shift(60), billId: 'BILL-0001' });
  assert.equal(manual.ok, true, JSON.stringify(manual));
  await runTool(state, 'run_automation', { asOf: AS_OF });
  const made = msmeReminders(state);
  assert.deepEqual(made.map((item) => item.source), ['msme:BILL-0001:2026-10-15', 'msme:BILL-0002:2026-10-15']);
  const filing = state.reminders.filter((item) => String(item.source || '').startsWith('filing:'));
  assert.ok(filing.length > 0, 'a filing reminder is open as well');
  const before = await openTitles(state, '2026-10-08');
  assert.ok(before.some((text) => /Pay Fabric Co .* on BILL-0001 by 2026-10-15 \(MSME limit\)/.test(text)), before.join(' | '));
  const weekBefore = (await runTool(state, 'week_ahead', { asOf: '2026-10-08' })).data.items;
  assert.ok(weekBefore.some((item) => item.kind === 'reminder' && /on BILL-0001 by/.test(item.title)));

  const part = await runTool(state, 'record_payment', { billId: 'BILL-0001', amount: 5000, date: '2026-10-08' });
  assert.equal(part.ok, true, JSON.stringify(part));
  assert.equal(made[0].done, null, 'a part payment leaves the reminder open');

  const paid = await runTool(state, 'record_payment', { billId: 'BILL-0001', date: '2026-10-08' });
  assert.equal(paid.ok, true, JSON.stringify(paid));
  assert.equal(paid.bill.status, 'paid');
  assert.ok(made[0].done, 'the reminder for the paid bill is done');
  assert.equal(made[0].done.by, 'automation');
  assert.match(made[0].done.on, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(made[1].done, null, 'the other bill keeps its reminder');
  for (const item of filing) assert.equal(item.done, null, 'a filing reminder is untouched');
  assert.equal(state.reminders.find((item) => item.text === 'Ask Fabric Co for the GST invoice').done, null, 'a reminder of the owner\'s own, even about the same bill, is untouched');

  const after = await openTitles(state, '2026-10-08');
  assert.equal(after.some((text) => /on BILL-0001 by/.test(text)), false, after.join(' | '));
  assert.equal(after.some((text) => /on BILL-0002 by/.test(text)), true);
  assert.ok(after.includes('Ask Fabric Co for the GST invoice'));
  const week = (await runTool(state, 'week_ahead', { asOf: '2026-10-08' })).data.items;
  assert.equal(week.some((item) => /on BILL-0001/.test(item.title)), false, JSON.stringify(week.filter((item) => /BILL-0001/.test(item.title))));
  assert.equal(week.some((item) => /on BILL-0002/.test(item.title) && item.kind === 'reminder'), true);
  const done = (await runTool(state, 'list_reminders', { today: '2026-10-08', status: 'done' })).data.reminders;
  assert.deepEqual(done.map((item) => item.source), ['msme:BILL-0001:2026-10-15']);

  const again = await runTool(state, 'run_automation', { asOf: '2026-10-09' });
  assert.equal(again.ok, true, JSON.stringify(again));
  assert.equal(msmeReminders(state).length, 2, 'a completed reminder is not made again');
  assert.equal(again.data.run.reminders.filter((item) => /MSME limit/.test(item.text)).length, 0);
});

test('E5: a payment through the payment run completes the reminders of the bills it settles', async () => {
  const state = books();
  await runTool(state, 'set_supplier_terms', { partyName: 'Fabric Co', msme: true });
  await runTool(state, 'create_purchase', MSME_BILL('2026-09-30', 'F-1'));
  await runTool(state, 'run_automation', { asOf: AS_OF });
  assert.equal(msmeReminders(state).length, 1);
  assert.equal(msmeReminders(state)[0].done, null);
  await runTool(state, 'set_cash_balance', { bank: 5000000, cash: 0, on: AS_OF });
  const run = await runTool(state, 'record_payment_run', { billIds: ['BILL-0001'], date: AS_OF });
  assert.equal(run.ok, true, JSON.stringify(run));
  assert.equal(state.purchases[0].status, 'paid');
  assert.ok(msmeReminders(state)[0].done, JSON.stringify(msmeReminders(state)));
});

test('E5: a bill settled any other way has its reminder completed on the next daily refresh, and a bill still owing keeps it', async () => {
  const state = books();
  await runTool(state, 'set_supplier_terms', { partyName: 'Fabric Co', msme: true });
  await runTool(state, 'create_purchase', MSME_BILL('2026-09-30', 'F-1'));
  await runTool(state, 'create_purchase', MSME_BILL('2026-09-30', 'F-2'));
  await runTool(state, 'run_automation', { asOf: AS_OF });
  const [first, second] = msmeReminders(state);
  assert.deepEqual([first.done, second.done], [null, null]);

  const noted = await runTool(state, 'create_purchase_note', { billId: 'BILL-0001', amount: 10500, date: AS_OF, reason: 'Goods returned' });
  assert.equal(noted.ok, true, JSON.stringify(noted));
  assert.equal(noted.outstanding, 0);

  const next = await runTool(state, 'run_automation', { asOf: '2026-10-06' });
  assert.equal(next.ok, true, JSON.stringify(next));
  assert.ok(first.done, 'the settled bill\'s reminder is done');
  assert.equal(first.done.by, 'automation');
  assert.equal(first.done.on, '2026-10-06');
  assert.equal(second.done, null, 'the bill still owing keeps its reminder');
  assert.equal(msmeReminders(state).length, 2);
  assert.equal((await openTitles(state, '2026-10-08')).some((text) => /on BILL-0001 by/.test(text)), false);
  assert.equal((await openTitles(state, '2026-10-08')).some((text) => /on BILL-0002 by/.test(text)), true);
});

test('E5: reminders from other sources are left alone by the sweep, and one for a bill that is not in the books is closed', async () => {
  const state = books();
  state.reminders = [
    { id: 'REM-0001', text: 'GSTR-3B for 2026-09 is due', due: '2026-10-20', createdOn: AS_OF, createdBy: 'automation', done: null, source: 'filing:GSTR-3B:2026-09' },
    { id: 'REM-0002', text: 'Pay rent', due: '2026-10-20', createdOn: AS_OF, createdBy: 'USR-ADMIN', done: null, about: { kind: 'bill', id: 'BILL-0001', name: 'Fabric Co' } },
    { id: 'REM-0003', text: 'Pay Ghost Co on BILL-0099 by 2026-10-15 (MSME limit)', due: '2026-10-08', createdOn: AS_OF, createdBy: 'automation', done: null, source: 'msme:BILL-0099:2026-10-15' },
  ];
  state.reminderSeq = 3;
  const run = await runTool(state, 'run_automation', { asOf: AS_OF });
  assert.equal(run.ok, true, JSON.stringify(run));
  assert.equal(state.reminders[0].done, null);
  assert.equal(state.reminders[1].done, null);
  assert.ok(state.reminders[2].done, 'a reminder for a bill that does not exist has nothing to pay');
});

test('E6: text-safe has a raw CSV writer with RFC 4180 quoting that does not neutralise formulas, and the neutralising writer is unchanged', () => {
  const rows = [['=SUM(A1)', 'a,b', 'say "hi"', 'line\nbreak', '-5', '@x', '+1', '', null, undefined, 12.5], ['plain', 'cr\rhere', ' padded ']];
  assert.equal(typeof textSafe.csvRawRows, 'function');
  assert.equal(textSafe.csvRawRows(rows), ['=SUM(A1),"a,b","say ""hi""","line\nbreak",-5,@x,+1,,,,12.5', 'plain,"cr\rhere", padded '].join('\n'));
  assert.equal(textSafe.csvRawRows([]), '');
  assert.equal(textSafe.csvRawRows([['a']]), 'a');
  assert.equal(textSafe.csvRows([['=SUM(A1)', '-x', '-5', '@x', '+1', 'a,b']]), "'=SUM(A1),'-x,-5,'@x,'+1,\"a,b\"");
});

const HEADER_CELLS = ['SECTION', 'SUPPLIER GSTIN', 'SUPPLIER NAME', 'INVOICE NO', 'INVOICE DATE', 'TAXABLE VALUE', 'CGST', 'SGST', 'IGST', 'CESS', 'TOTAL VALUE', 'ITC AVAILABILITY'];
const STATEMENT_FIELDS = ['section', 'supplierGstin', 'supplierName', 'invoiceNo', 'invoiceDate', 'taxableValue', 'cgst', 'sgst', 'igst', 'cess', 'totalValue', 'itcAvailability'];

function legacyCsvField(value) {
  const written = String(value ?? '');
  return written.includes(',') ? `"${written}"` : written;
}

function legacyStatementText(rows) {
  const dayMonthYear = (iso) => {
    const [year, month, day] = String(iso || '').split('-');
    return year && month && day ? `${day}-${month}-${year}` : '';
  };
  const lines = rows.map((row) => STATEMENT_FIELDS.map((field) => legacyCsvField(field === 'invoiceDate' ? dayMonthYear(row.invoiceDate) : row[field])).join(','));
  return [HEADER_CELLS.join(','), ...lines].join('\n');
}

function pick(row) {
  return Object.fromEntries(STATEMENT_FIELDS.map((field) => [field, row[field]]));
}

function generator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const NAME_PIECES = ['Fabric', 'Co', 'Mills', 'A', 'b', '1', ' ', ' ', ',', ',', '"', '"', '\n', '\r', '=', '+', '-', '@', "'", '(', ')', ';', 'é', '\t'];

function randomName(next) {
  const length = 1 + Math.floor(next() * 9);
  let name = '';
  for (let i = 0; i < length; i += 1) name += NAME_PIECES[Math.floor(next() * NAME_PIECES.length)];
  return name;
}

function statementFile(docs) {
  const rows = [];
  for (const doc of docs) {
    rows.push(['B2B', doc.gstin, doc.name, doc.no, doc.date, '1000', '25', '25', '0', '0', '1050', 'Y']);
    rows.push(['B2B', doc.gstin, doc.name, doc.no, doc.date, '500', '12.5', '12.5', '0', '0', '525', 'N']);
  }
  return textSafe.csvRawRows([HEADER_CELLS, ...rows]);
}

test('E6: statementText is written by the raw writer, and a statement that was merged parses back to the same rows', () => {
  assert.equal(typeof gstr2bCheck.statementText, 'function');
  const source = gst.parseGstr2B(statementFile([
    { gstin: GSTIN, name: 'FABRIC CO', no: 'F-1', date: '05-09-2026' },
    { gstin: '24AAACF7856R1ZY', name: 'GUJARAT MILLS, SURAT', no: 'GM/77', date: '08-09-2026' },
    { gstin: '29AABCL1234J1ZL', name: '=HYPERLINK("x")', no: '+9', date: '10-09-2026' },
    { gstin: '33AAACZ1234F1Z5', name: '-Thread @ Ltd', no: '@7', date: '11-09-2026' },
  ]));
  assert.equal(source.errors.length, 0, JSON.stringify(source.errors));
  const merged = gstr2bCheck.documentsOf(source.rows, { byDate: true });
  assert.equal(merged.length, 4);
  assert.ok(merged.every((document) => document.lines === 2));
  const raw = merged.map((document) => document.raw);
  const text = gstr2bCheck.statementText(raw);
  assert.equal(text, legacyStatementText(raw), 'the text is the same as the hand-written one made');
  assert.equal(text.split('\n')[0], HEADER_CELLS.join(','));
  assert.match(text, /^B2B,24AAACF7856R1ZY,"GUJARAT MILLS, SURAT",GM\/77,08-09-2026,1500,37\.5,37\.5,0,0,1575,N$/m);
  assert.match(text, /^B2B,29AABCL1234J1ZL,=HYPERLINK\(x\),\+9,10-09-2026,/m, 'a formula-looking name is not given an apostrophe');
  assert.match(text, /^B2B,33AAACZ1234F1Z5,-Thread @ Ltd,@7,11-09-2026,/m);
  const back = gst.parseGstr2B(text);
  assert.deepEqual(back.errors, []);
  assert.deepEqual(back.rows.map(pick), raw.map(pick));
});

test('E6: a fuzz of supplier names with commas, quotes, newlines and a leading = + - or @ gives the same statement text as before and parses back to the same rows', () => {
  const next = generator(20261108);
  let checked = 0;
  let withComma = 0;
  let withFormula = 0;
  for (let round = 0; round < 400; round += 1) {
    const docs = Array.from({ length: 1 + Math.floor(next() * 4) }, (_, index) => ({
      gstin: ['27AABCT1332L1ZE', '24AAACF7856R1ZY', '', '29aabcl1234j1zl'][Math.floor(next() * 4)],
      name: randomName(next),
      no: next() < 0.3 ? randomName(next) : `N-${round}-${index}`,
      date: next() < 0.9 ? '08-09-2026' : '31-02-2026',
    }));
    const parsed = gst.parseGstr2B(statementFile(docs));
    const raw = gstr2bCheck.documentsOf(parsed.rows, { byDate: true }).map((document) => document.raw);
    const text = gstr2bCheck.statementText(raw);
    assert.equal(text, legacyStatementText(raw), JSON.stringify(docs));
    const back = gst.parseGstr2B(text);
    assert.deepEqual(back.rows.map(pick), raw.map(pick), JSON.stringify(docs));
    assert.deepEqual(back.errors, [], JSON.stringify(docs));
    checked += raw.length;
    withComma += raw.filter((row) => row.supplierName.includes(',')).length;
    withFormula += raw.filter((row) => /^[=+\-@]/.test(row.supplierName)).length;
  }
  assert.ok(checked > 300, String(checked));
  assert.ok(withComma > 20, String(withComma));
  assert.ok(withFormula > 20, String(withFormula));
});

test('E6: values the file parser cannot produce are still written as one well-formed field each', () => {
  const rows = [{ section: 'B2B', supplierGstin: GSTIN, supplierName: '5" pipes, "fine" co', invoiceNo: 'a\nb', invoiceDate: '2026-09-08', taxableValue: 1000, cgst: 25, sgst: 25, igst: 0, cess: 0, totalValue: 1050, itcAvailability: 'Y' }];
  const text = gstr2bCheck.statementText(rows);
  assert.equal(text, `${HEADER_CELLS.join(',')}\nB2B,${GSTIN},"5"" pipes, ""fine"" co","a\nb",08-09-2026,1000,25,25,0,0,1050,Y`);
  const single = gstr2bCheck.statementText([{ ...rows[0], invoiceNo: 'A-1' }]);
  const back = gst.parseGstr2B(single);
  assert.deepEqual(back.errors, []);
  assert.equal(back.rows.length, 1);
  assert.equal(back.rows[0].supplierName, '5 pipes, fine co');
  assert.equal(back.rows[0].invoiceNo, 'A-1');
  assert.equal(back.rows[0].totalValue, 1050);
});

test('E6: no second CSV writer is left in gstr2b-check.mjs', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../src/gstr2b-check.mjs', import.meta.url), 'utf8');
  assert.equal(source.includes("join(',')"), false);
  assert.equal(/function csvField/.test(source), false);
  assert.match(source, /from '\.\/text-safe\.mjs'/);
});
