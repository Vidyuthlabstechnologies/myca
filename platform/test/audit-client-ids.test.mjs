import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { openSession } from '../src/session.mjs';
import { createState, serialize, deserialize, loadState } from '../src/store.mjs';
import { newBook, serializeBook, isValidClientId, getBook } from '../src/books.mjs';
import { createInvoice } from '../src/invoice.mjs';
import { handleCaApi, setActiveClient } from '../src/ca-api.mjs';
import { journal } from '../src/ledger.mjs';

const LINE = { description: 's', qty: 1, rate: 100, gstRate: 5 };

function statePath() {
  return join(mkdtempSync(join(tmpdir(), 'myca-client-ids-')), 'MyCA', 'state.json');
}

function freshSession() {
  return openSession(statePath());
}

function bookWithInvoice(partyName) {
  const book = newBook({ name: partyName, state: '27' });
  assert.equal(createInvoice(book, { date: '2026-08-01', partyName, partyState: '27', lines: [LINE] }).ok, true);
  return serializeBook(book);
}

function writeLegacyState(path, patch) {
  mkdirSync(dirname(path), { recursive: true });
  const raw = { ...JSON.parse(JSON.stringify(serialize(createState()))), ...patch };
  writeFileSync(path, JSON.stringify(raw));
  return readFileSync(path, 'utf8');
}

function partyNames(book) {
  return book.invoices.map((invoice) => invoice.partyName);
}

test('C4: a prototype-named client id gets its own isolated book', async () => {
  const sess = freshSession();
  const selfInvoices = sess.state.invoices.length;
  assert.equal((await sess.tool('add_client', { clientId: 'constructor', name: 'Ctor' })).ok, true);
  assert.equal((await sess.tool('set_active_client', { clientId: 'constructor' })).ok, true);
  const inv = await sess.tool('create_invoice', { partyName: 'X', partyState: '27', lines: [LINE] });
  assert.equal(inv.ok, true);
  assert.equal(sess.state.invoices.length, selfInvoices);
  assert.equal(sess.state.extraBooks.CONSTRUCTOR.invoices.length, 1);
  assert.equal(Object.hasOwn(Object, 'invoiceSeq'), false);
  assert.equal(Object.hasOwn(Object.prototype, 'invoiceSeq'), false);
});

test('C4: invalid client ids are rejected by the tool and the CA API', async () => {
  const sess = freshSession();
  const cases = [
    ['__proto__', 'INVALID_CLIENT_ID'],
    ['a', 'INVALID_CLIENT_ID'],
    ['has space', 'INVALID_CLIENT_ID'],
    ['X'.repeat(33), 'INVALID_CLIENT_ID'],
    ['SELF', 'CLIENT_EXISTS'],
    ['self', 'CLIENT_EXISTS'],
  ];
  for (const [clientId, error] of cases) {
    const out = await sess.tool('add_client', { clientId, name: 'Bad' });
    assert.equal(out.ok, false, clientId);
    assert.equal(out.error, error, clientId);
  }
  assert.deepEqual(sess.state.clients, []);
  const api = await sess.caApi('POST', '/api/ca/clients', { clientId: '__proto__', name: 'Bad' });
  assert.equal(api.ok, false);
  assert.equal(api.error, 'INVALID_CLIENT_ID');
  assert.equal(Object.hasOwn(Object.prototype, 'invoiceSeq'), false);
});

test('C4: client ids are upper-cased so every lookup is exact', async () => {
  const sess = freshSession();
  const added = await sess.tool('add_client', { clientId: 'cl-9', name: 'Nine' });
  assert.equal(added.data.client.clientId, 'CL-9');
  const switched = await sess.tool('set_active_client', { clientId: 'cl-9' });
  assert.equal(switched.data.activeClientId, 'CL-9');
  const docs = await sess.caApi('GET', '/api/ca/clients/cl-9/documents');
  assert.equal(docs.data.clientId, 'CL-9');
});

test('C4: every client route resolves the id once, so a lower-case path reads and logs under the canonical id', async () => {
  const sess = freshSession();
  assert.equal((await sess.caApi('POST', '/api/ca/clients', { clientId: 'CL-9', name: 'Nine' })).ok, true);
  const posted = await sess.caApi('POST', '/api/ca/clients/cl-9/vouchers', { partyName: 'X', partyState: '27', lines: [LINE] });
  assert.equal(posted.ok, true);
  const upper = await sess.caApi('GET', '/api/ca/clients/CL-9/audit-events');
  assert.equal(upper.data.auditEvents.some((event) => event.action === 'books_ledger.create_invoice'), true);
  assert.deepEqual(await sess.caApi('GET', '/api/ca/clients/cl-9/audit-events'), upper);
  const ledger = await sess.caApi('GET', '/api/ca/clients/cl-9/ledger');
  assert.equal(ledger.data.clientId, 'CL-9');
  assert.deepEqual(ledger, await sess.caApi('GET', '/api/ca/clients/CL-9/ledger'));
  const balance = await sess.caApi('GET', '/api/ca/clients/cl-9/trial-balance');
  assert.equal(balance.data.clientId, 'CL-9');
  const access = await sess.caApi('GET', '/api/ca/clients/self/access');
  assert.equal(access.data.clientId, 'SELF');
  assert.equal(access.data.users.length, 1);
  assert.deepEqual(access, await sess.caApi('GET', '/api/ca/clients/SELF/access'));
});

test('C4: a blank client id on a CA route is not found instead of meaning the firm own books', async () => {
  const sess = freshSession();
  const selfInvoices = sess.state.invoices.length;
  for (const segment of ['%20', '%09%20']) {
    await assert.rejects(sess.caApi('POST', `/api/ca/clients/${segment}/vouchers`, { partyName: 'X', partyState: '27', lines: [LINE] }), /CLIENT_NOT_FOUND/);
    await assert.rejects(sess.caApi('GET', `/api/ca/clients/${segment}/ledger`), /CLIENT_NOT_FOUND/);
    await assert.rejects(sess.caApi('GET', `/api/ca/clients/${segment}/documents`), /CLIENT_NOT_FOUND/);
  }
  assert.equal(sess.state.invoices.length, selfInvoices);
  assert.throws(() => getBook(sess.state, ''), /CLIENT_NOT_FOUND/);
  assert.throws(() => getBook(sess.state, '   '), /CLIENT_NOT_FOUND/);
  assert.equal(getBook(sess.state, 'self'), sess.state);
  assert.deepEqual(setActiveClient(sess.state, '  '), { ok: true, activeClientId: 'SELF' });
});

test('C4: an active client id naming no loaded client falls back to the firm own books on load', async () => {
  for (const activeClientId of ['GONE', 'ORPHAN', '__proto__', 'constructor', 42]) {
    const path = statePath();
    writeLegacyState(path, {
      clients: [{ clientId: 'CL-1', name: 'One' }],
      extraBooks: { ORPHAN: bookWithInvoice('P-orphan') },
      activeClientId,
    });
    const sess = openSession(path);
    assert.equal(sess.state.activeClientId, 'SELF', String(activeClientId));
    assert.deepEqual(partyNames(sess.state.extraBooks.ORPHAN), ['P-orphan']);
    assert.equal((await sess.tool('list_clients', {})).ok, true);
    assert.equal((await sess.tool('set_active_client', { clientId: 'cl-1' })).data.activeClientId, 'CL-1');
  }
});

test('C4: migration gives blank, prototype-named, punctuated and over-long legacy ids distinct valid ids', () => {
  const raw = serialize(createState());
  raw.clients = [
    { clientId: '', name: 'Blank' },
    { clientId: 'constructor', name: 'Ctor' },
    { clientId: 'toString', name: 'ToStr' },
    { clientId: 'acme.', name: 'Dot' },
    { clientId: 'ACME', name: 'Upper' },
    { clientId: 'x'.repeat(40), name: 'Long' },
  ];
  raw.extraBooks = { constructor: bookWithInvoice('P-ctor'), '': bookWithInvoice('P-blank'), ACME: bookWithInvoice('P-ACME') };
  const state = deserialize(raw);
  const ids = state.clients.map((client) => client.clientId);
  assert.deepEqual(ids, ['CLIENT', 'CONSTRUCTOR', 'TOSTRING', 'ACME-2', 'ACME', 'X'.repeat(32)]);
  for (const id of ids) assert.equal(isValidClientId(id), true, id);
  assert.deepEqual(state.clients.map((client) => client.legacyClientId), ['', 'constructor', 'toString', 'acme.', undefined, 'x'.repeat(40)]);
  assert.deepEqual(partyNames(getBook(state, 'constructor')), ['P-ctor']);
  assert.deepEqual(partyNames(getBook(state, 'CLIENT')), ['P-blank']);
  assert.deepEqual(partyNames(getBook(state, 'ACME')), ['P-ACME']);
  assert.deepEqual(partyNames(getBook(state, 'ACME-2')), []);
  assert.equal(Object.hasOwn(Object.prototype, 'invoiceSeq'), false);
});

test('C4: a pre-migration copy is kept only when loading rewrites client data', () => {
  const clean = statePath();
  writeLegacyState(clean, { clients: [{ clientId: 'CL-1', name: 'One' }], extraBooks: { 'CL-1': bookWithInvoice('P-1') } });
  openSession(clean);
  assert.deepEqual(readdirSync(dirname(clean)).filter((name) => name.endsWith('.json')), ['state.json']);
  const malformed = statePath();
  const original = writeLegacyState(malformed, { clients: { not: 'an array' }, extraBooks: { 'CL-1': bookWithInvoice('P-1') } });
  openSession(malformed);
  const copies = readdirSync(dirname(malformed)).filter((name) => name !== 'state.json' && name.endsWith('.json'));
  assert.equal(copies.length, 1);
  assert.equal(readFileSync(join(dirname(malformed), copies[0]), 'utf8'), original);
  openSession(malformed);
  assert.equal(readdirSync(dirname(malformed)).filter((name) => name !== 'state.json' && name.endsWith('.json')).length, 1);
});

test('C4: a backup carrying an invalid client id is refused', async () => {
  const sess = freshSession();
  const backup = sess.backup();
  backup.state.clients = [{ clientId: '__proto__', name: 'Evil' }];
  backup.confirm = true;
  assert.deepEqual(await sess.restore(backup), { ok: false, error: 'INVALID_BACKUP' });
});

test('C4: legacy lower-case client ids are normalised on load into a null-prototype map', () => {
  const raw = serialize(createState());
  raw.clients = [{ clientId: 'cl-3', name: 'Three' }];
  raw.extraBooks = { 'cl-3': serializeBook(newBook({ name: 'Three' })) };
  raw.activeClientId = 'cl-3';
  raw.documents = [{ documentId: 'DOC-000001', clientId: 'cl-3', kind: 'general', fileName: 'a.txt' }];
  raw.auditEvents = [{ eventId: 'AUD-000001', actorId: 'api', clientId: 'cl-3', action: 'documents.upload' }];
  raw.firmUsers = [{ userId: 'USR-STAFF', name: 'Staff', role: 'staff', clientIds: ['SELF', 'cl-3'] }];
  const state = deserialize(raw);
  assert.equal(state.clients[0].clientId, 'CL-3');
  assert.equal(state.clients[0].legacyClientId, 'cl-3');
  assert.equal(Object.getPrototypeOf(state.extraBooks), null);
  assert.equal(Object.hasOwn(state.extraBooks, 'CL-3'), true);
  assert.equal(state.activeClientId, 'CL-3');
  state.files['DOC-000001'] = 'filed';
  assert.deepEqual(handleCaApi(state, 'GET', '/api/ca/clients/CL-3/documents').data.documents.map((doc) => doc.documentId), ['DOC-000001']);
  assert.equal(handleCaApi(state, 'GET', '/api/ca/clients/CL-3/documents/DOC-000001').data.content, 'filed');
  assert.deepEqual(handleCaApi(state, 'GET', '/api/ca/clients/CL-3/audit-events').data.auditEvents.map((event) => event.eventId), ['AUD-000001']);
  assert.deepEqual(handleCaApi(state, 'GET', '/api/ca/clients/CL-3/access').data.users.map((user) => user.userId), ['USR-STAFF']);
});

test('C4: case-variant legacy client ids keep separate books through open and save', () => {
  const path = statePath();
  const original = writeLegacyState(path, {
    clients: [{ clientId: 'acme', name: 'Lower' }, { clientId: 'ACME', name: 'Upper' }],
    extraBooks: { acme: bookWithInvoice('P-acme'), ACME: bookWithInvoice('P-ACME') },
  });
  const sess = openSession(path);
  const byName = Object.fromEntries(sess.state.clients.map((client) => [client.name, client]));
  assert.equal(byName.Upper.clientId, 'ACME');
  assert.equal(byName.Lower.clientId, 'ACME-2');
  assert.equal(byName.Lower.legacyClientId, 'acme');
  const reloaded = loadState(path);
  assert.deepEqual(partyNames(reloaded.extraBooks.ACME), ['P-ACME']);
  assert.deepEqual(partyNames(reloaded.extraBooks['ACME-2']), ['P-acme']);
  assert.equal(journal(reloaded.extraBooks.ACME.ledger).length > 0, true);
  assert.equal(journal(reloaded.extraBooks['ACME-2'].ledger).length > 0, true);
  const copies = readdirSync(dirname(path)).filter((name) => name !== 'state.json' && name.endsWith('.json'));
  assert.equal(copies.length, 1);
  assert.equal(readFileSync(join(dirname(path), copies[0]), 'utf8'), original);
});

test('C4: legacy ids outside the new pattern are migrated on open instead of refused', async () => {
  const path = statePath();
  writeLegacyState(path, {
    clients: [{ clientId: 'self', name: 'Self Traders' }, { clientId: 'Sharma & Co', name: 'Sharma' }, { clientId: 'A', name: 'Ay' }],
    extraBooks: { self: bookWithInvoice('P-self'), 'Sharma & Co': bookWithInvoice('P-sharma'), A: bookWithInvoice('P-a') },
    activeClientId: 'Sharma & Co',
  });
  const sess = openSession(path);
  const ids = Object.fromEntries(sess.state.clients.map((client) => [client.legacyClientId, client.clientId]));
  assert.deepEqual(ids, { self: 'SELF-2', 'Sharma & Co': 'SHARMA-CO', A: 'A-2' });
  for (const id of Object.values(ids)) assert.equal(isValidClientId(id), true, id);
  assert.deepEqual(partyNames(sess.state.extraBooks['SELF-2']), ['P-self']);
  assert.deepEqual(partyNames(sess.state.extraBooks['SHARMA-CO']), ['P-sharma']);
  assert.deepEqual(partyNames(sess.state.extraBooks['A-2']), ['P-a']);
  assert.equal(partyNames(sess.state).includes('P-self'), false);
  assert.equal(sess.state.activeClientId, 'SHARMA-CO');
  const ledger = await sess.caApi('GET', '/api/ca/clients/SHARMA-CO/ledger');
  assert.equal(ledger.data.rows.length > 0, true);
});

test('C4: restoring a legacy backup keeps case-variant and non-conforming clients apart', async () => {
  const sess = freshSession();
  const backup = sess.backup();
  backup.state.clients = [{ clientId: 'acme', name: 'Lower' }, { clientId: 'ACME', name: 'Upper' }, { clientId: 'Sharma & Co', name: 'Sharma' }];
  backup.state.extraBooks = { acme: bookWithInvoice('P-acme'), ACME: bookWithInvoice('P-ACME'), 'Sharma & Co': bookWithInvoice('P-sharma') };
  backup.confirm = true;
  assert.equal((await sess.restore(backup)).ok, true);
  assert.deepEqual(sess.state.clients.map((client) => client.clientId), ['ACME-2', 'ACME', 'SHARMA-CO']);
  assert.deepEqual(partyNames(sess.state.extraBooks['ACME-2']), ['P-acme']);
  assert.deepEqual(partyNames(sess.state.extraBooks.ACME), ['P-ACME']);
  assert.deepEqual(partyNames(sess.state.extraBooks['SHARMA-CO']), ['P-sharma']);
});

test('C4: a malformed client list loads as empty instead of throwing', () => {
  const raw = serialize(createState());
  raw.clients = { not: 'an array' };
  raw.extraBooks = 'not an object';
  const state = deserialize(raw);
  assert.deepEqual(state.clients, []);
  assert.deepEqual(Object.keys(state.extraBooks), []);
});

test('C4: a state the server cannot open is reported instead of crashing startup', () => {
  const home = mkdtempSync(join(tmpdir(), 'myca-server-open-'));
  const path = join(home, 'MyCA', 'state.json');
  const original = writeLegacyState(path, { clients: [{ clientId: '__proto__', name: 'Evil' }] });
  const server = new URL('../src/server.mjs', import.meta.url).href;
  const script = [
    `const { startServer } = await import(${JSON.stringify(server)});`,
    'const started = await startServer(0);',
    "const res = await fetch(`http://127.0.0.1:${started.port}/api/snapshot`, { headers: { 'x-myca-client': 'renderer' } });",
    'console.log(JSON.stringify({ started, status: res.status, body: await res.json() }));',
    'process.exit(0);',
  ].join('\n');
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, APPDATA: home, HOME: home },
    encoding: 'utf8',
    timeout: 30000,
  });
  assert.equal(child.status, 0, child.stderr);
  const out = JSON.parse(child.stdout.trim().split('\n').pop());
  assert.match(out.started.error, /INVALID_CLIENT_ID/);
  assert.equal(out.status, 503);
  assert.match(out.body.error, /INVALID_CLIENT_ID/);
  assert.equal(readFileSync(path, 'utf8'), original);
});
