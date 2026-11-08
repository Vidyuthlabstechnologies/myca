import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { openSession } from '../src/session.mjs';
import { createMemoryStores } from '../src/store-ports.mjs';
import { runTool, TOOLS } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { appendAuditEvent, auditEventHash, handleCaApi } from '../src/ca-api.mjs';
import { createInvoice } from '../src/invoice.mjs';
import { verifyAuditChain, auditDetails, auditTrailWords, auditEventsIn, auditSheetRows } from '../src/audit-trail.mjs';
import { reportSheet, periodRange } from '../src/report-sheets.mjs';
import { CONFIRM_TOOLS } from '../src/chat-confirm.mjs';
import { isRemoteQuery, REMOTE_QUERY_TOOLS } from '../src/remote-contract.mjs';
import { toolServesCountry } from '../src/country.mjs';
import { assistantTools, validateAssistantToolCall, planLocalToolCall } from '../src/assistant-contract.mjs';
import { localToday } from '../src/dates.mjs';

const OWNER = { userId: 'USR-OWNER', role: 'admin', name: 'Asha' };
const STAFF = { userId: 'USR-STAFF', role: 'staff', name: 'Ravi' };
const SALE = { partyName: 'Kiran Stores', partyGstin: '', lines: [{ description: 'Supply', qty: 1, rate: 8000, gstRate: 18 }] };
const EVERYTHING = { from: '2000-01-01', to: '2100-12-31' };
const NOTE = 'Every change made through MyCA is listed with who made it and when. Hashes chain each event to the one before, so an edited or removed event shows as a broken chain. The seal covers who, what and when, but not which client an event is filed under. It cannot show events cut off the end of the log, or a log re-sealed by someone who can write the books.';

function open() {
  return openSession(createMemoryStores(), { seed: false });
}

async function trail(s, args = {}) {
  const out = await s.tool('audit_trail', { ...EVERYTHING, ...args });
  assert.equal(out.ok, true, JSON.stringify(out));
  return out.data;
}

async function story() {
  const s = open();
  const signed = await s.signIn('USR-ADMIN', '1234');
  assert.equal(signed.ok, true);
  const proposed = await s.propose('create_invoice', SALE);
  assert.equal(proposed.awaitingConfirmation, true, proposed.reply);
  const posted = await s.confirm(proposed.preview.token);
  assert.equal(posted.posted, true, posted.reply);
  const invoiceId = posted.tools[0].result.invoice.id;
  const receipt = await s.tool('record_receipt', { invoiceId, amount: 1000, mode: 'bank' });
  assert.equal(receipt.ok, true, JSON.stringify(receipt));
  const lock = await s.tool('lock_period', { through: '2000-01-31', reason: 'January closed after the audit' });
  assert.equal(lock.ok, true, JSON.stringify(lock));
  const unlock = await s.tool('unlock_period', { reason: 'Correction agreed with the auditor' });
  assert.equal(unlock.ok, true, JSON.stringify(unlock));
  assert.equal((await s.tool('list_invoices', {})).ok, true);
  return { s, invoiceId };
}

function transferIds(state, keep) {
  return state.ledger.transfers.filter(keep).map((transfer) => transfer.id.toString());
}

const LOCAL = 0x04034b50;

function sheetXmls(base64) {
  const buffer = Buffer.from(base64, 'base64');
  const parts = new Map();
  let offset = 0;
  while (buffer.readUInt32LE(offset) === LOCAL) {
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

function unescape(text) {
  return text.replace(/&(amp|lt|gt|quot|#39);/g, (_, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[name]));
}

function cellRows(xml) {
  return [...xml.matchAll(/<row r="(\d+)">(.*?)<\/row>/g)].map((row) => [...row[2].matchAll(/<c r="([A-Z]+)\d+"[^>]*>(?:<is><t[^>]*>(.*?)<\/t><\/is>|<v>(.*?)<\/v>)<\/c>/g)].map((m) => [m[1], m[3] !== undefined ? Number(m[3]) : unescape(m[2])]));
}

function sheetOf(out, number) {
  return cellRows(sheetXmls(out.data.xlsxBase64).get(`xl/worksheets/sheet${number}.xml`));
}

function at(row, letter) {
  return row.find((cell) => cell[0] === letter)?.[1];
}

function summaryOf(out) {
  return new Map(sheetOf(out, 3).map((row) => [at(row, 'A'), at(row, 'B')]));
}

function sha(text) {
  return createHash('sha256').update(text).digest('hex');
}

test('every event names who made it and is chained to the one before; the chain verifies', async () => {
  const s = open();
  const { preview } = await s.propose('create_invoice', SALE, { actor: STAFF });
  await s.confirm(preview.token, { actor: OWNER });
  await s.query('gst_payable', {}, { actor: STAFF });
  await s.chat('help', { actor: OWNER });
  await s.propose('create_invoice', SALE, { actor: STAFF });
  await s.discard({ actor: OWNER });
  await s.uploadDocument('statement.csv', 'a,b\n1,2\n', { actor: OWNER });
  await s.attachFile('gstr2b', 'two-b.json', '{}', { actor: STAFF });
  await s.tool('list_invoices', {});
  const by = (action) => s.state.auditEvents.filter((event) => event.action === action).at(-1);
  assert.equal(by('chat.propose').actorName, 'Ravi');
  assert.equal(by('chat.confirm').actorName, 'Asha');
  assert.equal(by('tool.gst_payable').actorName, 'Ravi');
  assert.equal(by('chat.run').actorName, 'Asha');
  assert.equal(by('chat.discard').actorName, 'Asha');
  assert.equal(by('file.upload').actorName, 'Asha');
  assert.equal(by('file.attach').actorName, 'Ravi');
  assert.equal(by('tool.list_invoices').actorId, 'renderer');
  assert.equal(by('tool.list_invoices').actorName, '');
  await s.signIn('USR-ADMIN', '1234');
  assert.equal(by('session.login').actorName, 'Firm Admin');
  assert.equal((await s.changePin('USR-ADMIN', '1234', '4821')).ok, true);
  assert.equal(by('session.pin_changed').actorName, 'Firm Admin');
  await s.signOut();
  assert.equal(by('session.logout').actorName, 'Firm Admin');
  assert.equal(by('session.logout').actorId, 'USR-ADMIN');

  const events = s.state.auditEvents;
  assert.ok(events.length >= 12);
  let previous = '';
  for (const event of events) {
    assert.match(event.hash, /^[0-9a-f]{64}$/, event.eventId);
    assert.equal(event.prevHash, previous, event.eventId);
    assert.equal(event.hash, auditEventHash(event), event.eventId);
    previous = event.hash;
  }
  const verdict = verifyAuditChain(s.state);
  assert.deepEqual(verdict, { ok: true, chained: events.length, unchained: 0, last: events.at(-1).hash });
});

test('the hash covers the event but not the client id, which a client rename remaps', () => {
  const state = createState();
  const first = appendAuditEvent(state, { actorId: 'USR-OWNER', actorName: 'Asha', action: 'tool.set_company', at: '2026-10-05T09:00:00.000Z', beforeHash: 'a', afterHash: 'b', metadata: { ok: true, args: ['name'] } });
  const expected = createHash('sha256').update([first.eventId, first.actorId, first.actorName, first.action, first.at, first.beforeHash, first.afterHash, '{"args":["name"],"ok":true}', ''].join('\n')).digest('hex');
  assert.equal(first.hash, expected);
  assert.equal(first.prevHash, '');
  assert.equal(first.actorName, 'Asha');
  const nameless = appendAuditEvent(state, { actorId: 'x' });
  assert.equal(nameless.actorName, '');
  assert.equal(nameless.prevHash, first.hash);
  const second = appendAuditEvent(state, { actorId: 'USR-OWNER', action: 'tool.set_company', clientId: 'CL-9' });
  assert.equal(second.prevHash, nameless.hash);
  assert.equal(second.clientId, 'CL-9');
  second.clientId = 'CL-10';
  assert.equal(verifyAuditChain(state).ok, true, 'a client rename does not break the chain');
  assert.equal(handleCaApi(state, 'POST', '/api/ca/audit-events', { actorId: 'api', action: 'x.y', hash: 'forged', prevHash: 'forged' }).ok, true);
  const added = state.auditEvents.at(-1);
  assert.notEqual(added.hash, 'forged');
  assert.equal(added.prevHash, second.hash);
  assert.equal(verifyAuditChain(state).ok, true);
});

test('who changed what: the confirm, the receipt and both lock events are listed with record ids, money entries and a sentence', async () => {
  const { s, invoiceId } = await story();
  const data = await trail(s);
  assert.equal(data.view, 'changes');
  assert.equal(data.from, '2000-01-01');
  assert.equal(data.to, '2100-12-31');
  assert.equal(data.label, '2000-01-01 to 2100-12-31');
  assert.deepEqual(data.events.map((event) => event.action), ['chat.confirm', 'tool.record_receipt', 'tool.lock_period', 'tool.unlock_period']);
  assert.equal(data.count, 4);
  assert.equal(data.total, 4);
  assert.equal(data.more, false);
  assert.equal(data.note, NOTE);
  const [confirm, receipt, lock, unlock] = data.events;

  assert.equal(confirm.kind, 'change');
  assert.equal(confirm.actorId, 'USR-ADMIN');
  assert.equal(confirm.actorName, 'Firm Admin');
  assert.equal(confirm.chained, true);
  assert.ok(confirm.ids.includes(invoiceId));
  assert.match(confirm.summary, new RegExp(`^Posted Create invoice \\(${invoiceId}`));
  assert.notEqual(confirm.beforeHash, confirm.afterHash);
  assert.match(confirm.eventId, /^AUD-\d{6}$/);
  assert.match(confirm.at, /^\d{4}-\d{2}-\d{2}T/);
  const invoiceTransfers = transferIds(s.state, (t) => t.invoiceId === invoiceId && t.code !== 'RECEIPT');
  assert.ok(invoiceTransfers.length >= 2);
  assert.deepEqual(confirm.transfers, invoiceTransfers);

  const receiptTransfers = transferIds(s.state, (t) => t.code === 'RECEIPT');
  assert.equal(receiptTransfers.length, 1);
  assert.deepEqual(receipt.transfers, receiptTransfers);
  assert.ok(receipt.ids.includes(invoiceId));
  assert.ok(receipt.ids.includes(receiptTransfers[0]));
  assert.match(receipt.summary, new RegExp(`^Record receipt \\(${invoiceId}`));
  assert.equal(receipt.kind, 'change');

  assert.equal(lock.summary, 'Locked the books through 2000-01-31: January closed after the audit');
  assert.equal(unlock.summary, 'Unlocked the books (was locked through 2000-01-31): Correction agreed with the auditor');
  assert.deepEqual(lock.transfers, []);
  assert.deepEqual(unlock.transfers, []);
  assert.notEqual(lock.beforeHash, lock.afterHash);
  assert.notEqual(unlock.beforeHash, unlock.afterHash);

  assert.equal(data.chain.ok, true);
  assert.ok(data.chain.chained >= 5, JSON.stringify(data.chain));
  assert.equal(data.chain.unchained, 0);
  assert.deepEqual(data.ledger, { ok: true, last: s.state.ledger.lastChecksum });
});

test('the everything view also lists reads, proposals and sign-ins with their kind', async () => {
  const { s } = await story();
  const data = await trail(s, { view: 'all' });
  assert.equal(data.view, 'all');
  const actions = data.events.map((event) => event.action);
  for (const wanted of ['session.login', 'chat.propose', 'chat.confirm', 'tool.record_receipt', 'tool.lock_period', 'tool.unlock_period', 'tool.list_invoices']) assert.ok(actions.includes(wanted), wanted);
  const named = (action) => data.events.find((event) => event.action === action);
  assert.equal(named('session.login').kind, 'session');
  assert.equal(named('session.login').summary, 'Signed in');
  assert.equal(named('chat.propose').kind, 'read');
  assert.equal(named('chat.propose').summary, 'Proposed Create invoice');
  assert.equal(named('tool.list_invoices').kind, 'read');
  assert.equal(named('tool.list_invoices').summary, 'List invoices');
  assert.deepEqual(data.events.map((event) => event.eventId), [...data.events.map((event) => event.eventId)].sort(), 'array order is event order, newest last');
  const second = await trail(s, { view: 'all' });
  assert.ok(second.events.some((event) => event.action === 'tool.audit_trail'), 'looking at the trail is itself a read event');
  assert.equal(second.events.find((event) => event.action === 'tool.audit_trail').kind, 'read');
});

test('events made before the chain existed are counted as unchained and do not break it', () => {
  const state = createState();
  state.auditEvents = [
    { eventId: 'AUD-000001', actorId: 'api', clientId: 'SELF', action: 'documents.upload', at: '2026-01-05T10:00:00.000Z', beforeHash: 'a', afterHash: 'a', metadata: {} },
    { eventId: 'AUD-000002', actorId: 'USR-ADMIN', clientId: 'SELF', action: 'tool.list_invoices', at: '2026-01-06T10:00:00.000Z', beforeHash: 'a', afterHash: 'a', metadata: { ok: true, args: [] } },
  ];
  state.auditSeq = 2;
  assert.deepEqual(verifyAuditChain(state), { ok: true, chained: 0, unchained: 2, last: '' });
  const third = appendAuditEvent(state, { actorId: 'USR-OWNER', action: 'tool.set_company', at: '2026-02-01T10:00:00.000Z', beforeHash: 'a', afterHash: 'b', metadata: { ok: true, args: ['name'] } });
  const fourth = appendAuditEvent(state, { actorId: 'USR-OWNER', action: 'tool.set_company', at: '2026-02-02T10:00:00.000Z', beforeHash: 'b', afterHash: 'c', metadata: { ok: true, args: ['name'] } });
  assert.equal(third.prevHash, '');
  assert.equal(fourth.prevHash, third.hash);
  assert.deepEqual(verifyAuditChain(state), { ok: true, chained: 2, unchained: 2, last: fourth.hash });
  const forged = state.auditEvents[2];
  forged.prevHash = 'feedface';
  forged.hash = auditEventHash(forged);
  const broken = verifyAuditChain(state);
  assert.equal(broken.ok, false);
  assert.equal(broken.error, 'LINK_BROKEN');
  assert.equal(broken.at, forged.eventId);
  assert.deepEqual(verifyAuditChain({ auditEvents: [] }), { ok: true, chained: 0, unchained: 0, last: '' });
  assert.deepEqual(verifyAuditChain({}), { ok: true, chained: 0, unchained: 0, last: '' });
});

test('editing a stored event shows as HASH_MISMATCH at that event and removing one as LINK_BROKEN at the next', async () => {
  const { s } = await story();
  const events = s.state.auditEvents;
  assert.equal(verifyAuditChain(s.state).ok, true);
  const index = events.findIndex((event) => event.action === 'tool.record_receipt');
  const original = JSON.parse(JSON.stringify(events));

  events[index].metadata.ok = false;
  const edited = verifyAuditChain(s.state);
  assert.equal(edited.ok, false);
  assert.equal(edited.error, 'HASH_MISMATCH');
  assert.equal(edited.at, events[index].eventId);
  assert.equal(edited.chained, index);
  assert.equal(edited.unchained, 0);
  assert.equal(summaryOf(reportSheet(s.state, 'audit_trail', EVERYTHING)).get('Log chain'), `broken at ${events[index].eventId}`);
  const words = auditTrailWords((await runTool(s.state, 'audit_trail', EVERYTHING)).data);
  assert.match(words, new RegExp(`, LOG CHAIN BROKEN at ${events[index].eventId}\\n`));

  s.state.auditEvents = JSON.parse(JSON.stringify(original));
  assert.equal(verifyAuditChain(s.state).ok, true);
  const removedId = s.state.auditEvents[index].eventId;
  const nextId = s.state.auditEvents[index + 1].eventId;
  s.state.auditEvents.splice(index, 1);
  assert.equal(s.state.auditEvents.some((event) => event.eventId === removedId), false);
  const removed = verifyAuditChain(s.state);
  assert.equal(removed.ok, false);
  assert.equal(removed.error, 'LINK_BROKEN');
  assert.equal(removed.at, nextId);

  s.state.auditEvents = JSON.parse(JSON.stringify(original));
  s.state.auditEvents[index].at = '2026-01-01T00:00:00.000Z';
  assert.equal(verifyAuditChain(s.state).error, 'HASH_MISMATCH', 'the time of a change is covered too');
  s.state.auditEvents = JSON.parse(JSON.stringify(original));
  s.state.auditEvents[index].actorId = 'USR-SOMEONE-ELSE';
  assert.equal(verifyAuditChain(s.state).error, 'HASH_MISMATCH', 'and so is who made it');
});

test('the chain survives saving and loading the books', async () => {
  const { s } = await story();
  const before = verifyAuditChain(s.state);
  assert.equal(before.ok, true);
  const reloaded = deserialize(JSON.parse(JSON.stringify(serialize(s.state))));
  assert.deepEqual(verifyAuditChain(reloaded), before);
  const reopened = openSession(s.stores, { seed: false });
  assert.deepEqual(verifyAuditChain(reopened.state), before);
  await reopened.tool('list_invoices', {});
  const after = verifyAuditChain(reopened.state);
  assert.equal(after.ok, true);
  assert.equal(after.chained, before.chained + 1);
});

test('the money movements of a change come from the ledger clock, and a read has none', async () => {
  const { s, invoiceId } = await story();
  const confirm = s.state.auditEvents.find((event) => event.action === 'chat.confirm');
  assert.deepEqual(confirm.metadata.tools, ['create_invoice']);
  assert.equal(confirm.metadata.posted, true);
  const created = s.state.ledger.transfers.filter((transfer) => transfer.invoiceId === invoiceId && transfer.code !== 'RECEIPT');
  assert.ok(created[0].timestamp > BigInt(confirm.metadata.ledgerClock.before));
  assert.equal(created.at(-1).timestamp, BigInt(confirm.metadata.ledgerClock.after));
  assert.ok(Array.isArray(confirm.metadata.details));
  assert.equal(confirm.metadata.details.length, 1);
  assert.ok(confirm.metadata.details[0].ids.includes(invoiceId));
  const receipt = s.state.auditEvents.find((event) => event.action === 'tool.record_receipt');
  assert.equal(receipt.metadata.ok, true);
  assert.deepEqual(receipt.metadata.args, ['invoiceId', 'amount', 'mode']);
  assert.equal(receipt.metadata.ledgerClock.before, confirm.metadata.ledgerClock.after);
  assert.equal(BigInt(receipt.metadata.ledgerClock.after), BigInt(receipt.metadata.ledgerClock.before) + 1n);
  assert.ok(receipt.metadata.details.ids.includes(invoiceId));
  const read = s.state.auditEvents.find((event) => event.action === 'tool.list_invoices');
  assert.equal(read.metadata.ledgerClock.before, read.metadata.ledgerClock.after);
  assert.deepEqual(read.metadata.details, { ids: [] });
  const lock = s.state.auditEvents.find((event) => event.action === 'tool.lock_period');
  assert.deepEqual(lock.metadata.details, { ids: [], lockThrough: '2000-01-31', reason: 'January closed after the audit' });
  const unlock = s.state.auditEvents.find((event) => event.action === 'tool.unlock_period');
  assert.deepEqual(unlock.metadata.details, { ids: [], was: '2000-01-31', reason: 'Correction agreed with the auditor' });
  assert.equal(JSON.stringify(s.state.auditEvents).includes('Kiran Stores'), false, 'party names and argument values stay out of the log');
});

test('a clock that is missing, unreadable or empty gives no transfers', () => {
  const state = createState();
  assert.equal(createInvoice(state, { date: '2026-10-05', partyName: 'Kiran Stores', lines: [{ description: 'Goods', qty: 1, rate: 1000, gstRate: 18 }] }).ok, true);
  const all = state.ledger.transfers.map((transfer) => transfer.id.toString());
  const clock = String(state.ledger.clock);
  const at = (n) => `2026-10-0${n}T10:00:00.000Z`;
  appendAuditEvent(state, { actorId: 'a', action: 'tool.create_invoice', at: at(1), beforeHash: 'a', afterHash: 'b', metadata: { ledgerClock: { before: '0', after: clock } } });
  appendAuditEvent(state, { actorId: 'a', action: 'tool.create_invoice', at: at(2), beforeHash: 'a', afterHash: 'b', metadata: { ledgerClock: { before: clock, after: clock } } });
  appendAuditEvent(state, { actorId: 'a', action: 'tool.create_invoice', at: at(3), beforeHash: 'a', afterHash: 'b', metadata: { ledgerClock: { before: 'abc', after: 'def' } } });
  appendAuditEvent(state, { actorId: 'a', action: 'tool.create_invoice', at: at(4), beforeHash: 'a', afterHash: 'b', metadata: {} });
  const [first, second] = state.ledger.transfers;
  appendAuditEvent(state, { actorId: 'a', action: 'tool.create_invoice', at: at(5), beforeHash: 'a', afterHash: 'b', metadata: { ledgerClock: { before: String(first.timestamp), after: String(second.timestamp) } } });
  const range = periodRange({ from: '2026-10-01', to: '2026-10-31' }, '2026-10-31');
  const found = auditEventsIn(state, range, { view: 'all' }).events;
  assert.deepEqual(found.map((event) => event.transfers), [all, [], [], [], [second.id.toString()]]);
});

test('the range, the actor, the view and the limit cut the list, and another client is never mixed in', async () => {
  const state = createState();
  const add = (at, actorId, actorName, action, changed = false, extra = {}) => appendAuditEvent(state, { actorId, actorName, action, at, beforeHash: 'a', afterHash: changed ? 'b' : 'a', metadata: {}, ...extra });
  const july = add('2026-07-31T23:59:59.000Z', 'USR-OWNER', 'Asha', 'tool.create_invoice', true);
  const first = add('2026-08-01T00:00:00.000Z', 'USR-OWNER', 'Asha', 'tool.create_invoice', true);
  const second = add('2026-08-15T09:00:00.000Z', 'USR-STAFF', 'Ravi', 'chat.confirm', true);
  const read = add('2026-08-15T10:00:00.000Z', 'USR-STAFF', 'Ravi', 'tool.list_invoices');
  const login = add('2026-08-31T23:59:59.000Z', 'USR-OWNER', 'Asha', 'session.login');
  const september = add('2026-09-01T00:00:00.000Z', 'USR-OWNER', 'Asha', 'tool.create_invoice', true);
  const other = add('2026-08-20T10:00:00.000Z', 'USR-OWNER', 'Asha', 'tool.create_invoice', true, { clientId: 'CL-9' });
  const ids = (data) => data.events.map((event) => event.eventId);
  const ask = async (args) => {
    const out = await runTool(state, 'audit_trail', args);
    assert.equal(out.ok, true, JSON.stringify(out));
    return out.data;
  };

  const changes = await ask({ period: '2026-08' });
  assert.deepEqual(ids(changes), [first.eventId, second.eventId]);
  assert.equal(changes.from, '2026-08-01');
  assert.equal(changes.to, '2026-08-31');
  assert.equal(changes.label, '2026-08');
  const everything = await ask({ period: '2026-08', view: 'all' });
  assert.deepEqual(ids(everything), [first.eventId, second.eventId, read.eventId, login.eventId]);
  assert.deepEqual(ids(await ask({ from: '2026-08-15', to: '2026-08-15', view: 'all' })), [second.eventId, read.eventId]);
  assert.deepEqual(ids(await ask({ to: '2026-08-01', view: 'all' })), [july.eventId, first.eventId], 'to alone has no lower bound');
  assert.deepEqual(ids(await ask({ period: '2026-08', view: 'all', actor: 'ravi' })), [second.eventId, read.eventId], 'a name matches in any case');
  assert.deepEqual(ids(await ask({ period: '2026-08', view: 'all', actor: 'USR-OW' })), [first.eventId, login.eventId], 'an id matches by part');
  assert.deepEqual(ids(await ask({ period: '2026-08', view: 'all', actor: 'nobody' })), []);
  assert.deepEqual(ids(await ask({ period: '2026-07', view: 'all' })), [july.eventId]);
  assert.deepEqual(ids(await ask({ period: '2026-09', view: 'all' })), [september.eventId]);

  const limited = await ask({ period: '2026-08', view: 'all', limit: 2 });
  assert.deepEqual(ids(limited), [read.eventId, login.eventId], 'the latest events are kept, oldest first');
  assert.equal(limited.count, 2);
  assert.equal(limited.total, 4);
  assert.equal(limited.more, true);

  state.activeClientId = 'CL-9';
  assert.deepEqual(ids(await ask({ period: '2026-08', view: 'all' })), [other.eventId]);
  state.activeClientId = 'SELF';

  const wrong = await runTool(state, 'audit_trail', { from: 'yesterday' });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.error, 'INVALID_DATE');
  assert.equal((await runTool(state, 'audit_trail', { period: 'sometime' })).error, 'BAD_PERIOD');
  const thisMonth = await ask({});
  assert.equal(thisMonth.label, localToday().slice(0, 7));
  assert.equal(thisMonth.view, 'changes');
});

test('the limit defaults to 200, never passes 2000, and says how many it left out', async () => {
  const state = createState();
  for (let n = 0; n < 2100; n += 1) appendAuditEvent(state, { actorId: 'a', action: 'tool.set_company', at: '2026-08-15T09:00:00.000Z', beforeHash: 'a', afterHash: 'b', metadata: {} });
  const range = { period: '2026-08' };
  const byDefault = (await runTool(state, 'audit_trail', range)).data;
  assert.equal(byDefault.count, 200);
  assert.equal(byDefault.total, 2100);
  assert.equal(byDefault.more, true);
  assert.equal(byDefault.events.at(-1).eventId, state.auditEvents.at(-1).eventId);
  const capped = (await runTool(state, 'audit_trail', { ...range, limit: 5000 })).data;
  assert.equal(capped.count, 2000);
  assert.equal(capped.more, true);
  assert.equal((await runTool(state, 'audit_trail', { ...range, limit: 0 })).data.count, 200);
  assert.equal((await runTool(state, 'audit_trail', { ...range, limit: 'many' })).data.count, 200);
  assert.equal((await runTool(state, 'audit_trail', { ...range, limit: 7 })).data.count, 7);
  assert.equal(verifyAuditChain(state).chained, 2100);
});

test('a failed confirmation and a failed tool say so in words, never with a code', async () => {
  const s = open();
  const nothing = await s.confirm('0123456789ab');
  assert.equal(nothing.posted, false);
  const failed = await s.tool('record_receipt', { invoiceId: 'INV-9999', amount: 5 });
  assert.equal(failed.ok, false);
  const data = await trail(s);
  assert.equal(data.events[0].action, 'chat.confirm');
  assert.equal(data.events[0].summary, 'Confirmation failed: nothing was waiting');
  assert.equal(data.events[1].action, 'tool.record_receipt');
  assert.equal(data.events[1].summary, 'Record receipt did not go through');
  assert.equal(data.events[1].kind, 'change');
  for (const event of data.events) assert.doesNotMatch(event.summary, /[A-Z]{2,}_[A-Z]{2,}/);
});

test('the sentence for every kind of event', () => {
  const state = createState();
  const add = (action, metadata = {}, extra = {}) => appendAuditEvent(state, { actorId: 'a', action, at: '2026-10-05T09:00:00.000Z', beforeHash: 'a', afterHash: 'a', metadata, ...extra });
  add('chat.confirm', { tools: ['create_invoice', 'record_receipt'], posted: true, details: [{ ids: ['INV-0001', '4'] }, { ids: ['INV-0001', '5'] }] });
  add('chat.confirm', { tools: [], posted: false, error: 'EXPIRED' });
  add('chat.confirm', { tools: ['create_invoice'], posted: false, error: '' });
  add('chat.confirm', { tools: ['create_invoice'], posted: true });
  add('chat.run', { tools: ['export_xlsx', 'audit_trail'] });
  add('chat.run', { tools: [] });
  add('chat.discard');
  add('recurring_posted', { scheduleId: 'RP-0001', kind: 'invoice', date: '2026-10-05', documentId: 'INV-0007' });
  add('bank_rule_applied', { lineId: 'BL-000012', ruleId: 'BR-0002', kind: 'receipt', ids: [] });
  add('exceptions.resolve', { exceptionId: 'EX-0003', note: 'Checked with the supplier' });
  add('exceptions.assign', { exceptionId: 'EX-0004' });
  add('file.upload', { name: 'march-statement.csv', bytes: 10, sha256: 'x' });
  add('file.attach', { kind: 'gstr2b', name: 'two-b.json' });
  add('session.logout');
  add('session.pin_changed');
  add('documents.upload', { documentId: 'DOC-1' });
  add('tool.create_invoice', { ok: true, details: { ids: ['INV-0001', '7', '8'] } });
  add('tool.lock_period', { ok: true, details: { ids: [], lockThrough: '2026-09-30', reason: '' } });
  add('tool.unlock_period', { ok: true, details: { ids: [], was: '', reason: 'Testing' } });
  const range = periodRange({ from: '2026-10-01', to: '2026-10-31' }, '2026-10-31');
  const sentences = auditEventsIn(state, range, { view: 'all' }).events.map((event) => event.summary);
  assert.deepEqual(sentences, [
    'Posted Create invoice, Record receipt (INV-0001, 4, 5)',
    'Confirmation failed: the preview had expired',
    'Confirmation failed: not posted',
    'Posted Create invoice',
    'Chat message (Export xlsx, Audit trail)',
    'Chat message (no tool)',
    'chat discard',
    'Repeating entry RP-0001 posted INV-0007',
    'Bank rule BR-0002 booked BL-000012',
    'Exception EX-0003 resolve: Checked with the supplier',
    'Exception EX-0004 assign',
    'Uploaded march-statement.csv',
    'Attached two-b.json',
    'Signed out',
    'Changed PIN',
    'documents upload',
    'Create invoice (INV-0001, 7, 8)',
    'Locked the books through 2026-09-30',
    'Unlocked the books (it was not locked): Testing',
  ]);
});

test('auditDetails keeps ids and the lock reason, bounds the list and never keeps values', () => {
  assert.deepEqual(auditDetails('create_invoice', { ok: true, invoice: { id: 'INV-0001', partyName: 'Kiran Stores', total: 9440 }, posted: [{ id: 7n, ok: true }, { id: 8n, ok: true }] }), { ids: ['INV-0001', '7', '8'] });
  assert.deepEqual(auditDetails('lock_period', { ok: true, data: { ok: true, lockThrough: '2026-09-30', reason: 'Books closed' } }), { ids: [], lockThrough: '2026-09-30', reason: 'Books closed' });
  assert.deepEqual(auditDetails('lock_period', { ok: true, lockThrough: '2026-09-30', reason: 'Books closed' }), { ids: [], lockThrough: '2026-09-30', reason: 'Books closed' });
  assert.deepEqual(auditDetails('unlock_period', { ok: true, data: { ok: true, lockThrough: '', was: '2026-09-30', reason: 'Fix' } }), { ids: [], was: '2026-09-30', reason: 'Fix' });
  assert.deepEqual(auditDetails('lock_period', { ok: false, error: 'INVALID_DATE' }), { ids: [] });
  assert.deepEqual(auditDetails('list_invoices', { ok: true, data: { invoices: [{ id: 'INV-0001' }] } }), { ids: [] });
  assert.deepEqual(auditDetails('set_company', { ok: true, data: { name: 'Secret Name' } }), { ids: [] });
  assert.deepEqual(auditDetails('anything', null), { ids: [] });
  assert.deepEqual(auditDetails('anything', 'text'), { ids: [] });
  assert.deepEqual(auditDetails('anything', undefined), { ids: [] });
  const every = {
    invoice: { id: 'INV-1' }, bill: { id: 'BILL-1' }, expense: { id: 'EXP-1' }, creditNote: { id: 'CN-1' }, debitNote: { id: 'DN-1' }, purchaseNote: { id: 'PN-1' }, note: { id: 'NOTE-1' }, amendment: { id: 'AMD-1' },
    report: { name: 'Sales by customer' }, reminder: { id: 'REM-1' }, rule: { id: 'BR-1' }, line: { id: 'BL-1' }, quote: { id: 'QT-1' }, schedule: { id: 'RP-1' }, employee: { id: 'EMP-1' }, settlement: { id: 'SET-1' }, data: { id: 'DATA-1' },
    posted: [{ id: 11n }, { id: '12' }, { id: 13 }, { ok: false }, null],
  };
  assert.deepEqual(auditDetails('x', every).ids, ['INV-1', 'BILL-1', 'EXP-1', 'CN-1', 'DN-1', 'PN-1', 'NOTE-1', 'AMD-1', 'Sales by customer', 'REM-1', 'BR-1', 'BL-1', 'QT-1', 'RP-1', 'EMP-1', 'SET-1', 'DATA-1', '11', '12', '13']);
  const many = auditDetails('x', { invoice: { id: 'INV-1' }, posted: Array.from({ length: 50 }, (_, n) => ({ id: BigInt(n + 1) })) });
  assert.equal(many.ids.length, 20);
  assert.equal(many.ids[0], 'INV-1');
  assert.deepEqual(auditDetails('x', { invoice: { id: 'INV-1' }, data: { id: 'INV-1' } }).ids, ['INV-1']);
});

test('audit_trail is registered as a read for both countries, with a strict schema, and is not a previewed write', async () => {
  assert.equal(isRemoteQuery('audit_trail'), true);
  assert.ok(REMOTE_QUERY_TOOLS.has('audit_trail'));
  assert.equal(CONFIRM_TOOLS.has('audit_trail'), false);
  assert.equal(toolServesCountry('audit_trail', 'IN'), true);
  assert.equal(toolServesCountry('audit_trail', 'US'), true);
  const names = TOOLS.map((tool) => tool.name);
  assert.equal(names.indexOf('audit_trail'), names.indexOf('export_xlsx') + 1);
  assert.equal(names.indexOf('export_xlsx'), names.indexOf('export_tally') + 1);
  const catalog = assistantTools(TOOLS).find((tool) => tool.name === 'audit_trail');
  assert.equal(catalog.risk, 'read_only');
  assert.equal(catalog.strict, true);
  assert.equal(catalog.parameters.additionalProperties, false);
  assert.deepEqual(Object.keys(catalog.parameters.properties), ['period', 'from', 'to', 'view', 'actor', 'limit']);
  assert.equal(validateAssistantToolCall('audit_trail', {}).ok, true);
  assert.equal(validateAssistantToolCall('audit_trail', { period: 'last-month', view: 'all', actor: 'Asha', limit: 50 }).ok, true);
  assert.equal(validateAssistantToolCall('audit_trail', { period: '2026-10' }).ok, true);
  assert.equal(validateAssistantToolCall('audit_trail', { from: '2026-10-01', to: '2026-10-31' }).ok, true);
  assert.equal(validateAssistantToolCall('audit_trail', { period: '2026-13' }).ok, false);
  assert.equal(validateAssistantToolCall('audit_trail', { view: 'everything' }).ok, false);
  assert.equal(validateAssistantToolCall('audit_trail', { limit: 0 }).ok, false);
  assert.equal(validateAssistantToolCall('audit_trail', { limit: 2001 }).ok, false);
  assert.equal(validateAssistantToolCall('audit_trail', { limit: 1.5 }).ok, false);
  assert.equal(validateAssistantToolCall('audit_trail', { actor: 'x'.repeat(81) }).ok, false);
  assert.equal(validateAssistantToolCall('audit_trail', { from: 'yesterday' }).ok, false);
  assert.equal(validateAssistantToolCall('audit_trail', { days: 3 }).ok, false);

  const us = createState();
  us.company = { name: 'Maple Street Bakery', country: 'US', gstin: '', state: '', ein: '12-3456789' };
  const out = await runTool(us, 'audit_trail', {});
  assert.equal(out.ok, true, JSON.stringify(out));
  const s = open();
  const viaQuery = await s.query('audit_trail', {});
  assert.equal(viaQuery.ok, true);
  assert.equal(s.state.auditEvents.at(-1).action, 'tool.audit_trail');
});

test('chat finds the audit trail, keeps Excel and the audit books where they were, and leaves a negation alone', async () => {
  const state = createState();
  const plans = {
    'audit trail for this month': { period: 'this-month' },
    'who changed what last month': { period: 'last-month' },
    'show me the audit trail': {},
    'edit log for this quarter': { period: 'this-quarter' },
    'audit log for 2026-10': { period: '2026-10' },
    'change log': {},
    'what changed in the books': {},
    'what changed in books this year': { period: 'this-year' },
    'audit trail of everything last month': { period: 'last-month', view: 'all' },
    'show the audit trail including reads': { view: 'all' },
    'audit trail with all events for 2026-09': { period: '2026-09', view: 'all' },
  };
  for (const [sentence, args] of Object.entries(plans)) {
    const plan = planLocalToolCall(state, sentence);
    assert.equal(plan.kind, 'tool', sentence);
    assert.equal(plan.name, 'audit_trail', sentence);
    assert.deepEqual(plan.args, args, sentence);
    assert.equal(validateAssistantToolCall(plan.name, plan.args).ok, true, sentence);
  }
  for (const [sentence, args] of Object.entries({ 'audit trail in excel': { report: 'audit_trail' }, 'export the edit log to excel for last month': { report: 'audit_trail', period: 'last-month' }, 'who changed what in a spreadsheet': { report: 'audit_trail' } })) {
    const plan = planLocalToolCall(state, sentence);
    assert.equal(plan.name, 'export_xlsx', sentence);
    assert.deepEqual(plan.args, args, sentence);
  }
  assert.equal(planLocalToolCall(state, 'show me the audit books').name, 'audit_books');
  assert.equal(planLocalToolCall(state, 'audit the books').name, 'audit_books');
  assert.notEqual(planLocalToolCall(state, 'do not show the audit trail').name, 'audit_trail');
  assert.notEqual(planLocalToolCall(state, 'trial balance').name, 'audit_trail');

  const asked = await chat(state, 'audit trail for this month');
  assert.equal(asked.tools[0].name, 'audit_trail');
  assert.match(asked.reply, /^0 changes between .+, log chain verified \(0 events\)$/, asked.reply);
  const sheet = await chat(state, 'audit trail in excel');
  assert.match(sheet.reply, /^Saved myca-audit-trail-\d{4}-\d{2}\.xlsx with \d+ rows on 3 sheets\./, sheet.reply);
});

test('in words: the count, the chain verdict, the newest ten lines and what was left out', () => {
  const event = (n, extra = {}) => ({ at: `2026-10-${String(n).padStart(2, '0')}T${String(n).padStart(2, '0')}:05:30.000Z`, actorId: `USR-${n}`, actorName: '', summary: `Change ${n}`, ...extra });
  const base = { from: '2026-10-01', to: '2026-10-31', view: 'changes', chain: { ok: true, chained: 12, unchained: 0 }, more: false };
  assert.equal(auditTrailWords({ ...base, count: 2, total: 2, events: [event(5, { actorName: 'Asha' }), event(6)] }), [
    '2 changes between 2026-10-01 and 2026-10-31, log chain verified (12 events; the client an event is filed under is not sealed)',
    '· 2026-10-06 06:05 USR-6: Change 6',
    '· 2026-10-05 05:05 Asha: Change 5',
  ].join('\n'));
  assert.equal(auditTrailWords({ ...base, count: 1, total: 1, chain: { ok: true, chained: 1 }, events: [event(5)] }).split('\n')[0], '1 change between 2026-10-01 and 2026-10-31, log chain verified (1 event; the client an event is filed under is not sealed)');
  assert.equal(auditTrailWords({ ...base, view: 'all', count: 0, total: 0, events: [] }), '0 events, log chain verified (12 events; the client an event is filed under is not sealed)');
  assert.equal(auditTrailWords({ ...base, view: 'all', count: 1, total: 1, events: [event(5)] }).split('\n')[0], '1 event, log chain verified (12 events; the client an event is filed under is not sealed)');
  const many = Array.from({ length: 14 }, (_, n) => event(n + 1));
  const crowded = auditTrailWords({ ...base, count: 14, total: 14, events: many }).split('\n');
  assert.equal(crowded.length, 12);
  assert.equal(crowded[1], '· 2026-10-14 14:05 USR-14: Change 14');
  assert.equal(crowded[10], '· 2026-10-05 05:05 USR-5: Change 5');
  assert.equal(crowded[11], '… and 4 more');
  const cut = auditTrailWords({ ...base, count: 2, total: 9, more: true, events: [event(1), event(2)] }).split('\n');
  assert.equal(cut.at(-1), '… and 7 more');
  const broken = auditTrailWords({ ...base, count: 1, total: 1, chain: { ok: false, error: 'HASH_MISMATCH', at: 'AUD-000007', chained: 6, unchained: 0 }, events: [event(5)] }).split('\n');
  assert.equal(broken[0], '1 change between 2026-10-01 and 2026-10-31, LOG CHAIN BROKEN at AUD-000007');
});

test('the Excel report lists every event, the day book entries and a summary that carries the proof', async () => {
  const { s, invoiceId } = await story();
  const range = periodRange(EVERYTHING, localToday());
  const expectedEvents = auditEventsIn(s.state, range, { view: 'all' }).events;
  const out = reportSheet(s.state, 'audit_trail', EVERYTHING);
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.data.title, 'Audit trail');
  assert.deepEqual(out.data.sheets.map((sheet) => sheet.name), ['Audit trail', 'Entries', 'Summary']);
  assert.equal(out.data.sheets[0].rows, expectedEvents.length);
  assert.ok(expectedEvents.length >= 7);

  const audit = sheetOf(out, 1);
  assert.deepEqual(audit[0].map((cell) => cell[1]), ['Event', 'When (UTC)', 'Who', 'Action', 'What changed', 'Records', 'Transfers', 'Books digest before', 'Books digest after', 'Chained']);
  assert.equal(audit.length, expectedEvents.length + 1);
  const confirmEvent = expectedEvents.find((event) => event.action === 'chat.confirm');
  const confirmRow = audit.find((row) => at(row, 'D') === 'chat.confirm');
  assert.equal(at(confirmRow, 'A'), confirmEvent.eventId);
  assert.equal(at(confirmRow, 'B'), confirmEvent.at);
  assert.equal(at(confirmRow, 'C'), 'Firm Admin');
  assert.match(at(confirmRow, 'E'), /^Posted Create invoice/);
  assert.ok(at(confirmRow, 'F').split('; ').includes(invoiceId));
  assert.equal(at(confirmRow, 'G'), confirmEvent.transfers.join('; '));
  assert.equal(at(confirmRow, 'H'), confirmEvent.beforeHash);
  assert.equal(at(confirmRow, 'I'), confirmEvent.afterHash);
  assert.equal(at(confirmRow, 'J'), 'Yes');
  const readRow = audit.find((row) => at(row, 'D') === 'tool.list_invoices');
  assert.equal(at(readRow, 'E'), 'List invoices', 'reads are in the sheet too');
  assert.equal(at(readRow, 'F'), undefined);

  const entries = sheetOf(out, 2);
  assert.deepEqual(entries[0].map((cell) => cell[1]), ['Date', 'Transfer', 'Debit account', 'Credit account', 'Amount', 'Code', 'Document']);
  const posted = s.state.ledger.transfers.filter((transfer) => transfer.posted && transfer.pendingId == null);
  assert.equal(entries.length - 1, posted.length);
  assert.ok(entries.slice(1).some((row) => at(row, 'F') === 'RECEIPT'));

  const summary = summaryOf(out);
  assert.deepEqual([...summary.keys()], ['Item', 'Period', 'Events', 'Changes', 'Log chain', 'Ledger chain', 'Ledger last checksum', 'Exported at (UTC ISO)', 'Audit sheet sha256']);
  assert.equal(summary.get('Period'), '2000-01-01 to 2100-12-31');
  assert.equal(summary.get('Events'), expectedEvents.length);
  assert.equal(summary.get('Changes'), 4);
  assert.equal(summary.get('Log chain'), `verified ${expectedEvents.length} events`);
  assert.equal(summary.get('Ledger chain'), 'ok');
  assert.equal(summary.get('Ledger last checksum'), String(s.state.ledger.lastChecksum));
  assert.match(summary.get('Exported at (UTC ISO)'), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(summary.get('Audit sheet sha256'), sha(JSON.stringify(auditSheetRows(expectedEvents))));
  assert.match(summary.get('Audit sheet sha256'), /^[0-9a-f]{64}$/);

  const viaTool = await s.tool('export_xlsx', { report: 'audit_trail', ...EVERYTHING });
  assert.equal(viaTool.ok, true, JSON.stringify(viaTool));
  assert.equal(viaTool.data.report, 'audit_trail');
  assert.match(viaTool.data.fileName, /^myca-audit-trail-2000-01-01-to-2100-12-31\.xlsx$/);
  s.state.ledger.transfers[0].amount += 1n;
  assert.match(summaryOf(reportSheet(s.state, 'audit_trail', EVERYTHING)).get('Ledger chain'), /^broken at /);
});

test('the Excel report builds on fresh books with the month in its name, and shows the month asked for', async () => {
  const fresh = createState();
  const out = reportSheet(fresh, 'audit_trail', {});
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.match(out.data.fileName, /^myca-audit-trail-\d{4}-\d{2}\.xlsx$/);
  assert.deepEqual(out.data.sheets, [{ name: 'Audit trail', rows: 0 }, { name: 'Entries', rows: 0 }, { name: 'Summary', rows: 8 }]);
  const summary = summaryOf(out);
  assert.equal(summary.get('Events'), 0);
  assert.equal(summary.get('Log chain'), 'verified 0 events');
  assert.equal(summary.get('Audit sheet sha256'), sha('[]'));
  const october = reportSheet(fresh, 'audit_trail', { period: '2026-10' });
  assert.equal(october.data.fileName, 'myca-audit-trail-2026-10.xlsx');
  assert.equal(reportSheet(fresh, 'audit_trail', { from: 'x' }).error, 'INVALID_DATE');
  assert.equal(reportSheet(fresh, 'audit_trail', { period: 'later' }).error, 'BAD_PERIOD');
  const us = createState();
  us.company = { name: 'Maple Street Bakery', country: 'US', gstin: '', state: '', ein: '12-3456789' };
  assert.equal(reportSheet(us, 'audit_trail', {}).ok, true);
});

test('the Excel only carries the events of the active client', async () => {
  const state = createState();
  assert.equal(createInvoice(state, { date: '2026-10-05', partyName: 'Kiran Stores', lines: [{ description: 'Goods', qty: 1, rate: 1000, gstRate: 18 }] }).ok, true);
  appendAuditEvent(state, { actorId: 'a', action: 'tool.create_invoice', at: '2026-10-05T09:00:00.000Z', beforeHash: 'a', afterHash: 'b', metadata: {} });
  appendAuditEvent(state, { actorId: 'a', action: 'tool.create_invoice', at: '2026-10-05T09:00:00.000Z', beforeHash: 'a', afterHash: 'b', metadata: {}, clientId: 'CL-9' });
  const mine = reportSheet(state, 'audit_trail', { period: '2026-10' });
  assert.equal(mine.data.sheets[0].rows, 1);
  state.activeClientId = 'CL-9';
  const theirs = reportSheet(state, 'audit_trail', { period: '2026-10' });
  assert.equal(theirs.data.sheets[0].rows, 1);
});

test('on the hosted service the note says reads are kept in the hosted log', async () => {
  const state = createState();
  const kept = process.env.MYCA_HOSTED;
  try {
    process.env.MYCA_HOSTED = '1';
    assert.equal((await runTool(state, 'audit_trail', {})).data.note, `${NOTE} Reads are kept in the hosted audit log, not here.`);
    process.env.MYCA_HOSTED = '0';
    assert.equal((await runTool(state, 'audit_trail', {})).data.note, NOTE);
    delete process.env.MYCA_HOSTED;
    assert.equal((await runTool(state, 'audit_trail', {})).data.note, NOTE);
  } finally {
    if (kept === undefined) delete process.env.MYCA_HOSTED;
    else process.env.MYCA_HOSTED = kept;
  }
});

test('a broken ledger shows in the ledger verdict with where it broke', async () => {
  const { s } = await story();
  s.state.ledger.transfers[0].amount += 1n;
  const data = (await runTool(s.state, 'audit_trail', EVERYTHING)).data;
  assert.equal(data.ledger.ok, false);
  assert.equal(typeof data.ledger.error, 'string');
  assert.ok(data.ledger.at !== undefined);
  assert.equal(data.chain.ok, true, 'the log itself is still intact');
});
