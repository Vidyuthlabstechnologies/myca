import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { openSession } from '../src/session.mjs';
import { createMemoryStores } from '../src/store-ports.mjs';
import { ACTION_CLASSES } from '../src/action-gate.mjs';
import { appendAuditEvent, handleCaApi } from '../src/ca-api.mjs';
import { OUTSIDE_SENTENCES, auditEventsIn, auditTrail, auditTrailWords, auditSheetRows, verifyAuditChain } from '../src/audit-trail.mjs';
import { bookView } from '../src/book-view.mjs';
import { localToday } from '../src/dates.mjs';

const EVERYTHING = { from: '2000-01-01', to: '2100-12-31' };
const OUTCOMES = {
  done: { ok: true },
  failed: { ok: false, error: 'TALLY_UNREACHABLE' },
  unknown: { ok: false, outcomeUnknown: true },
  simulated: { ok: true, mock: true },
};

function familyOf(id) {
  return ACTION_CLASSES[id].family === 'sandbox_operation' ? 'sandbox' : 'external';
}

function plain(sentence, reason) {
  assert.equal(typeof sentence, 'string', reason);
  assert.match(sentence, /^[A-Z]/, `${reason}: starts with a capital: ${sentence}`);
  assert.doesNotMatch(sentence, /_/, `${reason}: no underscore: ${sentence}`);
  assert.doesNotMatch(sentence, /\b(?:external|sandbox|chat|user|client|documents|books_ledger)\.[a-z]/i, `${reason}: no dotted id: ${sentence}`);
  assert.doesNotMatch(sentence, /undefined|\[object|null|NaN/, `${reason}: no leaked value: ${sentence}`);
}

function eventsOf(state, view = 'all') {
  return auditEventsIn(state, EVERYTHING, { view, limit: 2000 }).events;
}

async function signedInSession() {
  const s = await openSession(createMemoryStores(), { seed: false });
  s.state.company = { ...s.state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27' };
  const signed = await s.signIn('USR-ADMIN', '1234');
  assert.equal(signed.ok, true, JSON.stringify(signed));
  return s;
}

test('E1: every outside-system action reads as a plain sentence in each outcome, and the outcomes read differently', () => {
  const state = createState();
  const ids = Object.keys(ACTION_CLASSES);
  assert.ok(ids.length >= 41);
  assert.deepEqual(ids.filter((id) => !Object.hasOwn(OUTSIDE_SENTENCES, id)), [], 'every action in the gate has a sentence');
  assert.deepEqual(Object.keys(OUTSIDE_SENTENCES).filter((id) => !Object.hasOwn(ACTION_CLASSES, id)), [], 'no sentence for an action that does not exist');
  for (const id of ids) {
    for (const [name, metadata] of Object.entries(OUTCOMES)) {
      appendAuditEvent(state, { actorId: 'usr-admin', actorName: 'Firm Admin', action: `${familyOf(id)}.${id}`, metadata: { actionId: id, ...metadata } });
    }
  }
  const events = eventsOf(state);
  assert.equal(events.length, ids.length * 4);
  for (const id of ids) {
    const mine = events.filter((event) => event.action === `${familyOf(id)}.${id}`);
    assert.equal(mine.length, 4);
    const [done, failed, unknown, simulated] = mine.map((event) => event.summary);
    for (const sentence of [done, failed, unknown, simulated]) plain(sentence, id);
    assert.match(failed, / did not go through$/, id);
    assert.match(unknown, /no answer came back, so it may not have gone through/, id);
    assert.match(simulated, / \(simulated\)$/, id);
    assert.doesNotMatch(done, /did not go through|simulated|no answer/, id);
    assert.equal(new Set([done, failed, unknown, simulated]).size, 4, id);
    assert.equal(mine[0].kind, 'change', `${id} keeps its place in the changes view`);
  }
});

test('E1: an outside-system action that has no sentence yet, and any other dotted id, falls back to words without underscores', () => {
  const state = createState();
  for (const action of ['external.future_connector_ping', 'sandbox.some_new_job', 'weird.thing_happened', 'api_event', 'documents.copy_all', 'a.b.c_d']) {
    appendAuditEvent(state, { actorId: 'usr-admin', actorName: 'Firm Admin', action, metadata: {} });
  }
  const sentences = eventsOf(state).map((event) => event.summary);
  assert.equal(sentences.length, 6);
  for (const sentence of sentences) plain(sentence, sentence);
});

test('E1: a discarded proposal, a new user, a new client, an uploaded document and a posted voucher read as sentences', async () => {
  const s = await signedInSession();
  const held = await s.propose('record_tds_withheld', { invoiceId: 'INV-0001', amount: 100, date: localToday(), section: '194C' });
  assert.ok(held);
  await s.discard();
  const root = s.state;
  const made = handleCaApi(root, 'POST', '/api/ca/users', { userId: 'USR-RAVI', name: 'Ravi', role: 'staff', actorId: 'USR-ADMIN', pin: '4321' });
  assert.equal(made.ok, true, JSON.stringify(made));
  const client = handleCaApi(root, 'POST', '/api/ca/clients', { clientId: 'ACME', name: 'Acme', actorId: 'USR-ADMIN' });
  assert.equal(client.ok, true, JSON.stringify(client));
  const doc = handleCaApi(root, 'POST', '/api/ca/clients/SELF/documents', { fileName: 'a.txt', content: 'hello', actorId: 'USR-ADMIN' });
  assert.equal(doc.ok, true, JSON.stringify(doc));
  const sale = handleCaApi(root, 'POST', '/api/ca/clients/SELF/vouchers', { type: 'sale', partyName: 'API Retail', partyGstin: '27AAACH7409R1Z1', partyState: '27', lines: [{ description: 'Goods', hsn: '5208', qty: 1, rate: 1500, gstRate: 5 }], actorId: 'USR-ADMIN' });
  assert.equal(sale.ok, true, JSON.stringify(sale));
  const buy = handleCaApi(root, 'POST', '/api/ca/clients/SELF/vouchers', { type: 'purchase', partyName: 'Fabric Co', partyGstin: '27AABCT1332L1ZE', partyState: '27', supplierInvoiceNo: 'F-101', lines: [{ description: 'Goods', hsn: '5208', qty: 1, rate: 1000, gstRate: 5 }], actorId: 'USR-ADMIN' });
  assert.equal(buy.ok, true, JSON.stringify(buy));
  const rows = eventsOf(root);
  root.activeClientId = 'ACME';
  const acme = eventsOf(root);
  root.activeClientId = 'SELF';
  const pick = (action) => [...rows, ...acme].find((event) => event.action === action);
  assert.equal(pick('chat.discard').summary, 'Discarded a proposal');
  assert.equal(pick('user.create').summary, 'Added a user (USR-RAVI, staff)');
  assert.equal(pick('client.create').summary, 'Added a client (ACME)');
  assert.equal(pick('documents.upload').summary, `Uploaded a document (${doc.data.documentId})`);
  assert.equal(pick('books_ledger.create_invoice').summary, `Posted a sales invoice (${sale.invoice.id})`);
  assert.equal(pick('books_ledger.create_purchase').summary, `Posted a purchase bill (${buy.invoice.id})`);
  for (const event of [...rows, ...acme]) plain(event.summary, event.action);
});

test('E1: the person is named, not the lowercased id, for events from the action gate and the CA routes', async () => {
  const s = await signedInSession();
  const sale = await s.tool('create_invoice', { partyName: 'Delta Projects', lines: [{ description: 'Services', qty: 1, rate: 100000, gstRate: 18 }], date: localToday() });
  assert.equal(sale.ok, true, JSON.stringify(sale));
  await s.tool('push_tally', { period: localToday().slice(0, 7) });
  handleCaApi(s.state, 'POST', '/api/ca/users', { userId: 'USR-RAVI', name: 'Ravi', role: 'staff', actorId: 'USR-ADMIN', pin: '4321' });
  const rows = eventsOf(s.state);
  const gate = rows.filter((event) => /^(external|sandbox)\./.test(event.action));
  assert.ok(gate.length >= 1, 'the Tally push left an event');
  for (const event of [...gate, rows.find((row) => row.action === 'user.create')]) {
    assert.equal(event.actorName, 'Firm Admin', event.action);
    assert.equal(event.actorId.toLowerCase(), 'usr-admin');
  }
  const trail = auditTrail(s.state, { period: 'this-month', view: 'all' });
  assert.equal(trail.ok, true);
  const words = auditTrailWords(trail.data);
  assert.match(words, /Firm Admin: Push to Tally/);
  assert.doesNotMatch(words, /usr-admin/i);
  const sheet = auditSheetRows(trail.data.events);
  assert.ok(sheet.some((row) => row[2] === 'Firm Admin' && /^Push to Tally/.test(row[4])));
  assert.ok(sheet.every((row) => row[2] !== 'usr-admin'));
});

test('E1: an event takes the name of the signed-in actor, else of the user with that id ignoring case, else stays as it was', () => {
  const state = createState();
  const named = appendAuditEvent(state, { actorId: 'usr-admin', action: 'tool.list_invoices' });
  assert.equal(named.actorName, 'Firm Admin');
  const spelled = appendAuditEvent(state, { actorId: 'USR-ADMIN', action: 'tool.list_invoices' });
  assert.equal(spelled.actorName, 'Firm Admin');
  for (const id of ['automation', 'system', 'api', 'renderer', 'nobody-here']) {
    assert.equal(appendAuditEvent(state, { actorId: id, action: 'tool.list_invoices' }).actorName, '', id);
  }
  assert.equal(appendAuditEvent(state, { actorId: 'USR-ADMIN', actorName: 'Admin as typed', action: 'tool.list_invoices' }).actorName, 'Admin as typed');
  const view = bookView(state, state, { actor: { userId: 'USR-SAM', role: 'staff', name: 'Sam Signed' } });
  assert.equal(appendAuditEvent(view, { actorId: 'usr-sam', action: 'tool.list_invoices' }).actorName, 'Sam Signed');
  assert.equal(appendAuditEvent(view, { actorId: 'USR-OTHER', action: 'tool.list_invoices' }).actorName, '');
  assert.equal(appendAuditEvent(view, { actorId: 'usr-admin', action: 'tool.list_invoices' }).actorName, 'Firm Admin');
});

test('E1: a log with old unnamed events and new named events still verifies', () => {
  const state = createState();
  appendAuditEvent(state, { actorId: 'ghost', action: 'tool.list_invoices' });
  appendAuditEvent(state, { actorId: 'usr-admin', action: 'tool.list_invoices' });
  appendAuditEvent(state, { actorId: 'usr-admin', actorName: 'Firm Admin', action: 'external.tally_push', metadata: { ok: false } });
  const verdict = verifyAuditChain(state);
  assert.equal(verdict.ok, true, JSON.stringify(verdict));
  assert.equal(verdict.chained, 3);
  const events = state.auditEvents;
  assert.equal(events[0].actorName, '');
  assert.equal(events[1].actorName, 'Firm Admin');
  events[1].actorName = 'Someone Else';
  assert.equal(verifyAuditChain(state).ok, false);
});
