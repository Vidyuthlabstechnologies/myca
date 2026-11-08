import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { inflateRawSync } from 'node:zlib';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { openSession } from '../src/session.mjs';
import { createMemoryStores } from '../src/store-ports.mjs';
import { runTool } from '../src/tools.mjs';
import { fmtToolResult } from '../src/router.mjs';
import { appendAuditEvent, auditEventHash, handleCaApi } from '../src/ca-api.mjs';
import { verifyAuditChain, auditTrailWords } from '../src/audit-trail.mjs';
import { reportSheet } from '../src/report-sheets.mjs';

const SALE = { partyName: 'Kiran Stores', partyGstin: '', lines: [{ description: 'Supply', qty: 1, rate: 8000, gstRate: 18 }] };
const EVERYTHING = { from: '2000-01-01', to: '2100-12-31' };
const LOCAL = 0x04034b50;
const FORGED = {
  actorId: 'USR-PARTNER',
  actorName: 'Meera Partner',
  eventId: 'AUD-000001',
  at: '2026-01-05T10:00:00.000Z',
  beforeHash: 'a'.repeat(64),
  afterHash: 'b'.repeat(64),
  hash: 'c'.repeat(64),
  prevHash: 'd'.repeat(64),
  action: 'chat.confirm',
  metadata: { tools: ['create_credit_note'], posted: true, details: [{ ids: ['CN-0099'] }] },
};

function open() {
  return openSession(createMemoryStores(), { seed: false });
}

async function story() {
  const s = open();
  assert.equal((await s.signIn('USR-ADMIN', '1234')).ok, true);
  const proposed = await s.propose('create_invoice', SALE);
  const posted = await s.confirm(proposed.preview.token);
  assert.equal(posted.posted, true, posted.reply);
  const invoiceId = posted.tools[0].result.invoice.id;
  assert.equal((await s.tool('record_receipt', { invoiceId, amount: 1000, mode: 'bank' })).ok, true);
  assert.equal((await s.tool('lock_period', { through: '2000-01-31', reason: 'January closed' })).ok, true);
  assert.equal(verifyAuditChain(s.state).ok, true);
  return s;
}

async function staffSession() {
  const s = open();
  assert.equal((await s.signIn('USR-ADMIN', '1234')).ok, true);
  assert.equal((await s.changePin('USR-ADMIN', '1234', '8642')).ok, true);
  const added = await s.caApi('POST', '/api/ca/users', { userId: 'USR-STAFF', name: 'Ravi', role: 'staff', pin: '4321' });
  assert.equal(added.ok, true, JSON.stringify(added));
  await s.signOut();
  assert.equal((await s.signIn('USR-STAFF', '4321')).ok, true);
  return s;
}

function copyOf(events) {
  return JSON.parse(JSON.stringify(events));
}

function sha(text) {
  return createHash('sha256').update(text).digest('hex');
}

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

function summaryOf(out) {
  assert.equal(out.ok, true, JSON.stringify(out));
  const xml = sheetXmls(out.data.xlsxBase64).get('xl/worksheets/sheet3.xml');
  const rows = [...xml.matchAll(/<row r="(\d+)">(.*?)<\/row>/g)].map((row) => [...row[2].matchAll(/<c r="([A-Z]+)\d+"[^>]*>(?:<is><t[^>]*>(.*?)<\/t><\/is>|<v>(.*?)<\/v>)<\/c>/g)].map((m) => (m[3] !== undefined ? Number(m[3]) : m[2])));
  return new Map(rows.map((row) => [row[0], row[1]]));
}

async function wordsOf(state) {
  const out = await runTool(state, 'audit_trail', { ...EVERYTHING, view: 'all' });
  assert.equal(out.ok, true, JSON.stringify(out));
  return auditTrailWords(out.data);
}

function jsonbOrder(value) {
  if (Array.isArray(value)) return value.map(jsonbOrder);
  if (value === null || typeof value !== 'object') return value;
  const keys = Object.keys(value).sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(keys.map((key) => [key, jsonbOrder(value[key])]));
}

test('R1-5: a newest event stripped of its seal and rewritten is a broken link, and stays one after the next real event', async () => {
  const s = await story();
  const events = s.state.auditEvents;
  const last = events.at(-1);
  assert.equal(last.action, 'tool.lock_period');
  last.actorId = 'USR-SOMEONE-ELSE';
  last.actorName = 'Someone Else';
  last.metadata = { ...last.metadata, args: ['through'] };
  delete last.hash;
  delete last.prevHash;
  const broken = verifyAuditChain(s.state);
  assert.deepEqual(broken, { ok: false, error: 'LINK_BROKEN', at: last.eventId, chained: events.length - 1, unchained: 0 });

  assert.equal((await s.tool('list_invoices', {})).ok, true);
  assert.equal(events.at(-1).prevHash, '', 'the next real event is chained from nothing, as the log has no hash to follow');
  const after = verifyAuditChain(s.state);
  assert.equal(after.ok, false);
  assert.equal(after.error, 'LINK_BROKEN');
  assert.equal(after.at, last.eventId);

  const words = await wordsOf(s.state);
  assert.match(words.split('\n')[0], new RegExp(`LOG CHAIN BROKEN at ${last.eventId}$`));
  assert.doesNotMatch(words.split('\n')[0], /log chain verified/);
  assert.equal(summaryOf(reportSheet(s.state, 'audit_trail', EVERYTHING)).get('Log chain'), `broken at ${last.eventId}`);
});

test('R1-10: editing an event and stripping the seals from it to the end of the log is a broken link at that event', async () => {
  const s = await story();
  const events = s.state.auditEvents;
  const k = 2;
  const target = events[k];
  target.metadata = { ...target.metadata, details: [{ ids: ['INV-9999'] }] };
  for (let n = k; n < events.length; n += 1) {
    delete events[n].hash;
    delete events[n].prevHash;
  }
  const broken = verifyAuditChain(s.state);
  assert.deepEqual(broken, { ok: false, error: 'LINK_BROKEN', at: target.eventId, chained: k, unchained: 0 });
  assert.match((await wordsOf(s.state)).split('\n')[0], new RegExp(`LOG CHAIN BROKEN at ${target.eventId}$`));

  const only = await story();
  const tail = only.state.auditEvents.slice(-3);
  for (const event of tail) {
    delete event.hash;
    delete event.prevHash;
  }
  const tailBroken = verifyAuditChain(only.state);
  assert.equal(tailBroken.ok, false);
  assert.equal(tailBroken.error, 'LINK_BROKEN');
  assert.equal(tailBroken.at, tail[0].eventId);
});

test('R1-5: the seal of a middle event cannot be stripped and a forged unsealed event cannot be added or slipped in', async () => {
  const s = await story();
  const original = copyOf(s.state.auditEvents);
  const fresh = () => {
    s.state.auditEvents = copyOf(original);
    return s.state.auditEvents;
  };
  const verdict = () => verifyAuditChain(s.state);

  let events = fresh();
  delete events[2].hash;
  assert.deepEqual([verdict().ok, verdict().error, verdict().at], [false, 'LINK_BROKEN', events[2].eventId], 'hash alone stripped');

  events = fresh();
  delete events[2].hash;
  delete events[2].prevHash;
  assert.deepEqual([verdict().ok, verdict().error, verdict().at], [false, 'LINK_BROKEN', events[2].eventId], 'hash and prevHash stripped');

  events = fresh();
  events[2].hash = '';
  assert.deepEqual([verdict().ok, verdict().error, verdict().at], [false, 'LINK_BROKEN', events[2].eventId], 'an empty hash is no hash');

  events = fresh();
  events.push({ eventId: 'AUD-999999', actorId: 'USR-X', clientId: 'SELF', action: 'tool.lock_period', at: '2026-01-05T10:00:00.000Z', beforeHash: 'a', afterHash: 'b', metadata: {} });
  assert.deepEqual([verdict().ok, verdict().error, verdict().at], [false, 'LINK_BROKEN', 'AUD-999999'], 'an unsealed event added at the end');

  events = fresh();
  events.splice(2, 0, { eventId: 'AUD-999998', actorId: 'USR-X', clientId: 'SELF', action: 'tool.lock_period', at: '2026-01-05T10:00:00.000Z', beforeHash: 'a', afterHash: 'b', metadata: {} });
  assert.deepEqual([verdict().ok, verdict().error, verdict().at], [false, 'LINK_BROKEN', 'AUD-999998'], 'an unsealed event slipped into the middle');

  events = fresh();
  const gone = events[2].eventId;
  const next = events[3].eventId;
  events.splice(2, 1);
  assert.equal(events.some((event) => event.eventId === gone), false);
  assert.deepEqual([verdict().ok, verdict().error, verdict().at], [false, 'LINK_BROKEN', next], 'a removed event shows at the next one');

  events = fresh();
  events[2] = null;
  const blank = verdict();
  assert.deepEqual([blank.ok, blank.error, blank.at], [false, 'LINK_BROKEN', 'entry 3'], 'an entry that is not an event is named by its place');
  assert.match((await wordsOf(s.state)).split('\n')[0], /LOG CHAIN BROKEN at entry 3$/);

  fresh();
  assert.equal(verdict().ok, true);
});

test('R1-5: events from before the chain existed stay a legacy prefix, and only the prefix', () => {
  const state = createState();
  const legacy = (n) => ({ eventId: `AUD-00000${n}`, actorId: 'api', clientId: 'SELF', action: 'documents.upload', at: '2026-01-0' + n + 'T10:00:00.000Z', beforeHash: 'a', afterHash: 'a', metadata: {} });
  state.auditEvents = [legacy(1), legacy(2), legacy(3)];
  state.auditSeq = 3;
  assert.deepEqual(verifyAuditChain(state), { ok: true, chained: 0, unchained: 3, last: '' });
  const fourth = appendAuditEvent(state, { actorId: 'USR-OWNER', action: 'tool.set_company', at: '2026-02-01T10:00:00.000Z', beforeHash: 'a', afterHash: 'b', metadata: { ok: true } });
  const fifth = appendAuditEvent(state, { actorId: 'USR-OWNER', action: 'tool.set_company', at: '2026-02-02T10:00:00.000Z', beforeHash: 'b', afterHash: 'c', metadata: { ok: true } });
  const sixth = appendAuditEvent(state, { actorId: 'USR-OWNER', action: 'tool.set_company', at: '2026-02-03T10:00:00.000Z', beforeHash: 'c', afterHash: 'd', metadata: { ok: true } });
  assert.equal(fourth.prevHash, '');
  assert.deepEqual(verifyAuditChain(state), { ok: true, chained: 3, unchained: 3, last: sixth.hash });

  state.auditEvents.push(legacy(7));
  const late = verifyAuditChain(state);
  assert.deepEqual([late.ok, late.error, late.at, late.chained, late.unchained], [false, 'LINK_BROKEN', 'AUD-000007', 3, 3], 'a legacy-looking event after the chain began is not legacy');
  state.auditEvents.pop();

  delete fifth.hash;
  delete fifth.prevHash;
  const stripped = verifyAuditChain(state);
  assert.deepEqual([stripped.ok, stripped.error, stripped.at], [false, 'LINK_BROKEN', fifth.eventId]);
});

test('R1-6 / R1-11 / R2-7: the name shown as Who is sealed, so rewriting it is a hash mismatch at that event', async () => {
  const s = await story();
  const events = s.state.auditEvents;
  const index = events.findIndex((event) => event.action === 'tool.record_receipt');
  assert.equal(events[index].actorName, 'Firm Admin');
  events[index].actorName = 'Mallory';
  const edited = verifyAuditChain(s.state);
  assert.deepEqual([edited.ok, edited.error, edited.at, edited.chained], [false, 'HASH_MISMATCH', events[index].eventId, index]);
  assert.match((await wordsOf(s.state)).split('\n')[0], new RegExp(`LOG CHAIN BROKEN at ${events[index].eventId}$`));
  events[index].actorName = 'Firm Admin';
  assert.equal(verifyAuditChain(s.state).ok, true);

  const raw = JSON.parse(JSON.stringify(serialize(s.state)));
  raw.auditEvents[2].actorName = 'Mallory';
  const reloaded = verifyAuditChain(deserialize(raw));
  assert.deepEqual([reloaded.ok, reloaded.error, reloaded.at], [false, 'HASH_MISMATCH', raw.auditEvents[2].eventId], 'an edit made in the stored books file');

  const state = createState();
  const nameless = appendAuditEvent(state, { actorId: 'USR-OWNER', action: 'tool.list_invoices', metadata: {} });
  assert.equal(nameless.actorName, '');
  assert.equal(verifyAuditChain(state).ok, true);
  nameless.actorName = 'Mallory';
  assert.equal(verifyAuditChain(state).error, 'HASH_MISMATCH', 'an event with no name cannot be given one');
});

test('the hash covers the name directly after the id, the sorted metadata and the link, and leaves the client label out', () => {
  const state = createState();
  const at = '2026-10-05T09:00:00.000Z';
  const first = appendAuditEvent(state, { actorId: 'USR-OWNER', actorName: 'Asha', action: 'tool.set_company', at, beforeHash: 'a', afterHash: 'b', metadata: { z: 1, a: { y: [3, 1, 2], b: 'x' }, n: 5n } });
  const text = '{"a":{"b":"x","y":[3,1,2]},"n":"5","z":1}';
  assert.equal(first.hash, sha([first.eventId, 'USR-OWNER', 'Asha', 'tool.set_company', at, 'a', 'b', text, ''].join('\n')));
  assert.equal(auditEventHash(first), first.hash);

  const nameless = appendAuditEvent(state, { actorId: 'USR-OWNER', action: 'tool.list_invoices', at, beforeHash: 'a', afterHash: 'a', metadata: { ok: true, args: [] } });
  assert.equal(nameless.hash, sha([nameless.eventId, 'USR-OWNER', '', 'tool.list_invoices', at, 'a', 'a', '{"args":[],"ok":true}', first.hash].join('\n')));

  const moved = appendAuditEvent(state, { actorId: 'USR-OWNER', action: 'tool.set_company', clientId: 'CL-9' });
  moved.clientId = 'CL-10';
  assert.equal(verifyAuditChain(state).ok, true, 'a client rename does not break the chain');
  assert.notEqual(auditEventHash({ ...first, actorName: 'Asha ' }), first.hash);
  assert.notEqual(auditEventHash({ ...first, actorId: 'USR-OTHER' }), first.hash);
});

test('R1-14: the hash does not depend on the order of keys, which a jsonb column changes', async () => {
  const s = await story();
  const original = copyOf(s.state.auditEvents);
  const reorder = (order) => {
    s.state.auditEvents = copyOf(original).map((event) => ({ ...event, metadata: order(event.metadata) }));
    return verifyAuditChain(s.state);
  };
  const jsonb = reorder(jsonbOrder);
  assert.equal(jsonb.ok, true, JSON.stringify(jsonb));
  assert.equal(jsonb.chained, original.length);
  const changed = s.state.auditEvents.filter((event, n) => JSON.stringify(Object.keys(event.metadata)) !== JSON.stringify(Object.keys(original[n].metadata)));
  assert.ok(changed.length >= 3, 'the reordering really moved keys');
  const backwards = reorder(function reversed(value) {
    if (Array.isArray(value)) return value.map(reversed);
    if (value === null || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().reverse().map((key) => [key, reversed(value[key])]));
  });
  assert.equal(backwards.ok, true, JSON.stringify(backwards));

  const reordered = copyOf(original).map((event) => ({ ...event, metadata: jsonbOrder(event.metadata) }));
  const confirm = reordered.find((event) => event.action === 'chat.confirm');
  confirm.metadata.ledgerClock.after = '999999';
  s.state.auditEvents = reordered;
  const edited = verifyAuditChain(s.state);
  assert.deepEqual([edited.ok, edited.error, edited.at], [false, 'HASH_MISMATCH', confirm.eventId], 'a changed value is still caught after the keys moved');

  const state = createState();
  const event = appendAuditEvent(state, { actorId: 'a', action: 'chat.confirm', metadata: { tools: ['create_invoice', 'record_receipt'] } });
  event.metadata.tools.reverse();
  assert.equal(verifyAuditChain(state).error, 'HASH_MISMATCH', 'the order of a list still matters');
});

test('R1-12: a staff session adds an event as itself, at the server time, whatever the request claims', async () => {
  const s = await staffSession();
  const events = s.state.auditEvents;
  const previous = events.at(-1);
  const count = events.length;
  const started = new Date().toISOString();
  const out = await s.caApi('POST', '/api/ca/audit-events', FORGED);
  const finished = new Date().toISOString();
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(events.length, count + 1);
  const added = out.data;
  assert.equal(added, events.at(-1));
  assert.equal(added.actorId, 'USR-STAFF');
  assert.equal(added.actorName, 'Ravi');
  assert.ok(added.at >= started && added.at <= finished, added.at);
  assert.match(added.eventId, /^AUD-\d{6}$/);
  assert.notEqual(added.eventId, FORGED.eventId);
  assert.match(added.beforeHash, /^[0-9a-f]{64}$/);
  assert.notEqual(added.beforeHash, FORGED.beforeHash);
  assert.notEqual(added.afterHash, FORGED.afterHash);
  assert.equal(added.beforeHash, added.afterHash);
  assert.notEqual(added.hash, FORGED.hash);
  assert.equal(added.prevHash, previous.hash);
  assert.equal(added.hash, auditEventHash(added));
  assert.equal(added.action, 'chat.confirm');
  assert.deepEqual(added.metadata, FORGED.metadata);
  const ids = events.map((event) => event.eventId);
  assert.equal(new Set(ids).size, ids.length, 'every event id is used once');
  assert.equal(verifyAuditChain(s.state).ok, true);

  const words = await wordsOf(s.state);
  assert.match(words, /Ravi: Posted Create credit note \(CN-0099\)/);
  assert.doesNotMatch(words, /Meera/);
  assert.equal(events.some((event) => event.actorId === 'USR-PARTNER' || event.actorName === 'Meera Partner'), false);

  const again = await s.caApi('POST', '/api/ca/audit-events', { ...FORGED, eventId: added.eventId });
  assert.equal(again.ok, true);
  assert.notEqual(again.data.eventId, added.eventId);
  const allIds = events.map((event) => event.eventId);
  assert.equal(new Set(allIds).size, allIds.length);
});

test('R1-12: the actor is the signed-in admin too, and the route still takes the action and the notes', async () => {
  const s = open();
  assert.equal((await s.signIn('USR-ADMIN', '1234')).ok, true);
  const out = await s.caApi('POST', '/api/ca/audit-events', { actorId: 'someone-else', actorName: 'Someone Else', action: 'external.review_note', clientId: 'SELF', metadata: { note: 'Checked the January file' } });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.data.actorId, 'USR-ADMIN');
  assert.equal(out.data.actorName, 'Firm Admin');
  assert.equal(out.data.action, 'external.review_note');
  assert.equal(out.data.clientId, 'SELF');
  assert.deepEqual(out.data.metadata, { note: 'Checked the January file' });
  const empty = await s.caApi('POST', '/api/ca/audit-events', null);
  assert.equal(empty.ok, true);
  assert.equal(empty.data.action, 'api_event');
  assert.equal(empty.data.actorId, 'USR-ADMIN');
  assert.equal(verifyAuditChain(s.state).ok, true);
});

test('R1-12: with nobody signed in the route refuses in plain words and adds nothing', async () => {
  const s = open();
  const events = s.state.auditEvents;
  const count = events.length;
  const out = await s.caApi('POST', '/api/ca/audit-events', FORGED);
  assert.equal(out.ok, false);
  assert.equal(out.error, 'SIGN_IN_REQUIRED');
  assert.match(out.hint, /^Sign in with your user id and PIN first/);
  assert.doesNotMatch(out.hint, /[A-Z]{2,}_[A-Z]{2,}/);
  assert.equal(fmtToolResult('audit_events', out), out.hint);
  assert.equal(events.length, count);

  assert.equal((await s.signIn('USR-ADMIN', '1234')).ok, true);
  assert.equal((await s.caApi('POST', '/api/ca/audit-events', FORGED)).ok, true);
  await s.signOut();
  const signedOut = await s.caApi('POST', '/api/ca/audit-events', FORGED);
  assert.equal(signedOut.error, 'SIGN_IN_REQUIRED');
  const afterLogout = events.length;
  assert.equal((await s.caApi('POST', '/api/ca/audit-events', null)).error, 'SIGN_IN_REQUIRED');
  assert.equal(events.length, afterLogout);
  assert.equal((await s.caApi('GET', '/api/ca/audit-events')).ok, true, 'reading the log stays open');
});

test('R1-12: appendAuditEvent refuses an event id that is already in the log, and the route never takes an id from the caller', () => {
  const state = createState();
  const first = appendAuditEvent(state, { actorId: 'a', action: 'x.y' });
  const duplicate = appendAuditEvent(state, { eventId: first.eventId, actorId: 'b', action: 'x.z' });
  assert.deepEqual(duplicate, { ok: false, error: 'DUPLICATE_ID', id: first.eventId });
  assert.equal(fmtToolResult('audit_events', duplicate), `${first.eventId} is already used in these books, so nothing was changed.`);
  assert.equal(state.auditEvents.length, 1);
  assert.equal(state.auditSeq, 1);
  assert.equal(state.auditEvents[0].actorId, 'a');

  const custom = appendAuditEvent(state, { eventId: 'REVIEW-1', actorId: 'a', action: 'x.y' });
  assert.equal(custom.eventId, 'REVIEW-1');
  assert.equal(custom.prevHash, first.hash);
  assert.deepEqual(appendAuditEvent(state, { eventId: 'REVIEW-1', actorId: 'a', action: 'x.y' }), { ok: false, error: 'DUPLICATE_ID', id: 'REVIEW-1' });
  assert.equal(state.auditEvents.length, 2);
  assert.equal(verifyAuditChain(state).ok, true);

  const posted = handleCaApi(state, 'POST', '/api/ca/audit-events', { eventId: first.eventId, actorId: 'api', action: 'x.y', at: '2020-01-01T00:00:00.000Z', beforeHash: 'f', afterHash: 'e' });
  assert.equal(posted.ok, true);
  assert.notEqual(posted.data.eventId, first.eventId);
  assert.notEqual(posted.data.at, '2020-01-01T00:00:00.000Z');
  assert.notEqual(posted.data.beforeHash, 'f');
  assert.notEqual(posted.data.afterHash, 'e');
  const ids = state.auditEvents.map((event) => event.eventId);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(verifyAuditChain(state).ok, true);
});

test('every refusal of the audit route has a sentence a person can read, and none shows a code', () => {
  assert.equal(fmtToolResult('audit_events', { ok: false, error: 'DUPLICATE_ID', id: 'AUD-000007' }), 'AUD-000007 is already used in these books, so nothing was changed.');
  assert.equal(fmtToolResult('audit_events', { ok: false, error: 'SIGN_IN_REQUIRED' }), 'Sign in with your user id and PIN first.');
  assert.equal(fmtToolResult('audit_events', { ok: false, error: 'SIGN_IN_REQUIRED', hint: 'Sign in first, please.' }), 'Sign in first, please.');
  for (const error of ['DUPLICATE_ID', 'SIGN_IN_REQUIRED']) assert.doesNotMatch(fmtToolResult('audit_events', { ok: false, error }), /That did not go through|[A-Z]{2,}_[A-Z]{2,}/);
});

test('the note says what the seal covers and what it does not', async () => {
  const note = (await runTool(createState(), 'audit_trail', {})).data.note;
  assert.match(note, /^Every change made through MyCA is listed with who made it and when\. Hashes chain each event to the one before, so an edited or removed event shows as a broken chain\./);
  assert.match(note, /not which client an event is filed under/);
  assert.match(note, /cut off the end of the log/);
  assert.match(note, /re-sealed/);
});

const NOT_SEALED = 'the client an event is filed under is not sealed';

async function firstLine(state, args = EVERYTHING) {
  const out = await runTool(state, 'audit_trail', args);
  assert.equal(out.ok, true, JSON.stringify(out));
  return auditTrailWords(out.data).split('\n')[0];
}

test('R1-11 / R2-7: the words of a verified chain say the client an event is filed under is not sealed, and a moved event still verifies', async () => {
  const s = await story();
  const chained = verifyAuditChain(s.state).chained;
  assert.ok(chained >= 4, String(chained));
  const before = await firstLine(s.state);
  assert.match(before, /^3 changes between 2000-01-01 and 2100-12-31, log chain verified/);
  assert.ok(before.endsWith(`, log chain verified (${chained} events; ${NOT_SEALED})`), before);

  const moved = s.state.auditEvents.find((event) => event.action === 'chat.confirm');
  moved.clientId = 'CL-9';
  const verdict = verifyAuditChain(s.state);
  assert.deepEqual([verdict.ok, verdict.chained], [true, chained], 'the client an event is filed under is outside the seal, on purpose');
  const after = await firstLine(s.state);
  assert.match(after, /^2 changes between /, 'the event left this client\'s trail');
  assert.ok(after.endsWith(`, log chain verified (${chained} events; ${NOT_SEALED})`), after);

  const asked = await s.chat('audit trail for this month');
  assert.equal(asked.tools[0].name, 'audit_trail');
  assert.match(asked.reply.split('\n')[0], new RegExp(`, log chain verified \\(${chained} events; ${NOT_SEALED}\\)$`), asked.reply);
  const viaTool = await runTool(s.state, 'audit_trail', EVERYTHING);
  assert.equal(fmtToolResult('audit_trail', viaTool), auditTrailWords(viaTool.data));
  assert.match(viaTool.data.note, /not which client an event is filed under/, 'the note still says it');
});

test('R1-11: the words say it only where there is a seal to speak of, not on a broken chain and not on a log with nothing chained', async () => {
  const base = { from: '2026-10-01', to: '2026-10-31', view: 'changes', count: 0, total: 0, more: false, events: [] };
  const head = '0 changes between 2026-10-01 and 2026-10-31, ';
  assert.equal(auditTrailWords({ ...base, chain: { ok: true, chained: 3, unchained: 0 } }), `${head}log chain verified (3 events; ${NOT_SEALED})`);
  assert.equal(auditTrailWords({ ...base, chain: { ok: true, chained: 1, unchained: 0 } }), `${head}log chain verified (1 event; ${NOT_SEALED})`);
  assert.equal(auditTrailWords({ ...base, view: 'all', chain: { ok: true, chained: 2 } }), `0 events, log chain verified (2 events; ${NOT_SEALED})`);
  const nothingSealed = auditTrailWords({ ...base, chain: { ok: true, chained: 0, unchained: 4 } });
  assert.equal(nothingSealed, `${head}log chain verified (0 events; 4 earlier events were recorded before sealing and are not covered)`);
  assert.ok(!nothingSealed.includes(NOT_SEALED));
  assert.equal(auditTrailWords({ ...base }), `${head}log chain verified (0 events)`);
  const broken = auditTrailWords({ ...base, chain: { ok: false, error: 'HASH_MISMATCH', at: 'AUD-000007', chained: 6, unchained: 0 } });
  assert.equal(broken, `${head}LOG CHAIN BROKEN at AUD-000007`);
  assert.doesNotMatch(broken, /sealed/);

  const fresh = await runTool(createState(), 'audit_trail', {});
  assert.equal(auditTrailWords(fresh.data), `0 changes between ${fresh.data.from} and ${fresh.data.to}, log chain verified (0 events)`);

  const s = await story();
  s.state.auditEvents.at(-1).actorName = 'Mallory';
  const tampered = await firstLine(s.state);
  assert.match(tampered, /LOG CHAIN BROKEN at AUD-\d{6}$/);
  assert.doesNotMatch(tampered, /sealed|verified/);
});

test('R1-12: the new SIGN_IN_REQUIRED sentence also words a signed-out approval request or decision, in the hint the refusal carries', async () => {
  const s = open();
  const asked = await s.tool('approval_request', { operationId: 'gst_file_gstr1_evc' });
  const decided = await s.tool('approval_decide', { approvalId: 'APR-000001', decision: 'approve' });
  for (const [name, refused] of [['approval_request', asked], ['approval_decide', decided]]) {
    assert.equal(refused.error, 'SIGN_IN_REQUIRED', name);
    const said = fmtToolResult(name, refused);
    assert.equal(said, 'Sign in with your user id and PIN first: approvals record who asked and who decided, and the two must be different people.', name);
    assert.doesNotMatch(said, /sign in required|That did not go through|[A-Z]{2,}_[A-Z]{2,}/, name);
  }
  assert.equal(s.state.auditEvents.length, 0, 'a refusal before anything ran adds nothing to the log');
});

test('R1-12: an automatic event id never repeats one that is already in the log, whatever the counter says', () => {
  const state = createState();
  appendAuditEvent(state, { eventId: 'AUD-000002', actorId: 'a', action: 'x.y' });
  appendAuditEvent(state, { actorId: 'a', action: 'x.y' });
  appendAuditEvent(state, { actorId: 'a', action: 'x.y' });
  assert.deepEqual(state.auditEvents.map((event) => event.eventId), ['AUD-000002', 'AUD-000003', 'AUD-000004']);
  assert.equal(state.auditSeq, 4);

  state.auditSeq = 1;
  assert.equal(appendAuditEvent(state, { actorId: 'a', action: 'x.y' }).eventId, 'AUD-000005', 'a counter that fell behind the log skips every id already used');
  assert.equal(state.auditSeq, 5);

  for (const lost of [NaN, 'x', -3, 2.5, Infinity]) {
    state.auditSeq = lost;
    const used = new Set(state.auditEvents.map((event) => event.eventId));
    const added = appendAuditEvent(state, { actorId: 'a', action: 'x.y' });
    assert.match(added.eventId, /^AUD-\d{6}$/, String(lost));
    assert.equal(used.has(added.eventId), false, `a counter of ${String(lost)} must not hand out a used id`);
  }

  const reloaded = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  reloaded.auditSeq = 0;
  const usedBeforeReload = new Set(reloaded.auditEvents.map((event) => event.eventId));
  const more = appendAuditEvent(reloaded, { actorId: 'a', action: 'x.y' });
  assert.equal(usedBeforeReload.has(more.eventId), false, 'a reloaded log whose counter reads zero carries on after its last id');

  for (const book of [state, reloaded]) {
    const ids = book.auditEvents.map((event) => event.eventId);
    assert.equal(new Set(ids).size, ids.length, 'every event id is used once');
    assert.equal(verifyAuditChain(book).ok, true);
  }

  const fresh = createState();
  const first = appendAuditEvent(fresh, { actorId: 'a', action: 'x.y' });
  const second = appendAuditEvent(fresh, { actorId: 'a', action: 'x.y' });
  assert.deepEqual([first.eventId, second.eventId], ['AUD-000001', 'AUD-000002'], 'the usual numbering is unchanged');
});

test('R1-11: the Summary row of the Excel audit trail carries the same sentence as the words, where something is chained', async () => {
  const s = await story();
  const chained = verifyAuditChain(s.state).chained;
  assert.ok(chained >= 4, String(chained));
  assert.equal(summaryOf(reportSheet(s.state, 'audit_trail', EVERYTHING)).get('Log chain'), `verified ${chained} events; ${NOT_SEALED}`);
  assert.ok((await firstLine(s.state)).endsWith(`(${chained} events; ${NOT_SEALED})`));
  assert.equal(summaryOf(reportSheet(createState(), 'audit_trail', {})).get('Log chain'), 'verified 0 events');
  s.state.auditEvents[2].actorName = 'Mallory';
  assert.match(summaryOf(reportSheet(s.state, 'audit_trail', EVERYTHING)).get('Log chain'), /^broken at AUD-000003$/);
});

test('R1-12: an automatic event id cannot hang or crawl, whatever the counter and the log hold', () => {
  const store = JSON.stringify(new URL('../src/store.mjs', import.meta.url).href);
  const api = JSON.stringify(new URL('../src/ca-api.mjs', import.meta.url).href);
  const script = `
    import { createState } from ${store};
    import { appendAuditEvent } from ${api};
    const out = {};
    const measure = (name, state) => {
      const started = process.hrtime.bigint();
      const id = appendAuditEvent(state, { actorId: 'a', action: 'x.y' }).eventId;
      const ids = state.auditEvents.map((event) => event.eventId);
      out[name] = { id, ms: Number(process.hrtime.bigint() - started) / 1e6, unique: new Set(ids).size === ids.length };
    };
    const withCounter = (counter, taken) => {
      const state = createState();
      for (const eventId of taken) appendAuditEvent(state, { eventId, actorId: 'a', action: 'x.y' });
      state.auditSeq = counter;
      return state;
    };
    measure('safe limit', withCounter(9007199254740991, ['AUD-9007199254740992']));
    measure('far above the cap', withCounter(1e15, ['AUD-1000000000000001']));
    measure('just below the cap', withCounter(999999999999, []));
    const long = createState();
    long.auditEvents = Array.from({ length: 40000 }, (_, n) => ({ eventId: 'AUD-' + String(n + 1).padStart(6, '0'), actorId: 'a', action: 'x.y', hash: '', prevHash: '' }));
    long.auditSeq = '0';
    measure('text zero over a long log', long);
    console.log(JSON.stringify(out));
  `;
  const ran = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 30000 });
  assert.equal(ran.status, 0, `${ran.signal || ''} ${ran.stderr}`);
  const out = JSON.parse(ran.stdout);
  assert.equal(out['safe limit'].id, 'AUD-000002');
  assert.equal(out['far above the cap'].id, 'AUD-000002');
  assert.equal(out['just below the cap'].id, 'AUD-1000000000000');
  assert.equal(out['text zero over a long log'].id, 'AUD-040001');
  for (const [name, result] of Object.entries(out)) {
    assert.equal(result.unique, true, name);
    assert.ok(result.ms < 1500, `${name} took ${result.ms} ms`);
  }
});
