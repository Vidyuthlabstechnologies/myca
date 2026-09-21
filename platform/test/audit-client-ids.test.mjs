import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openSession } from '../src/session.mjs';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { newBook, serializeBook } from '../src/books.mjs';

function freshSession() {
  return openSession(join(mkdtempSync(join(tmpdir(), 'myca-client-ids-')), 'MyCA', 'state.json'));
}

test('C4: a prototype-named client id gets its own isolated book', async () => {
  const sess = freshSession();
  const selfInvoices = sess.state.invoices.length;
  assert.equal((await sess.tool('add_client', { clientId: 'constructor', name: 'Ctor' })).ok, true);
  assert.equal((await sess.tool('set_active_client', { clientId: 'constructor' })).ok, true);
  const inv = await sess.tool('create_invoice', { partyName: 'X', partyState: '27', lines: [{ description: 's', qty: 1, rate: 100, gstRate: 5 }] });
  assert.equal(inv.ok, true);
  assert.equal(sess.state.invoices.length, selfInvoices);
  assert.equal(sess.state.extraBooks.CONSTRUCTOR.invoices.length, 1);
  assert.equal(Object.hasOwn(Object, 'invoiceSeq'), false);
  assert.equal(Object.hasOwn(Object.prototype, 'invoiceSeq'), false);
});

test('C4: invalid client ids are rejected by the tool and the CA API', async () => {
  const sess = freshSession();
  for (const clientId of ['__proto__', 'a', 'has space', 'X'.repeat(33), 'SELF', 'self']) {
    const out = await sess.tool('add_client', { clientId, name: 'Bad' });
    assert.equal(out.ok, false, clientId);
  }
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
  const state = deserialize(raw);
  assert.equal(state.clients[0].clientId, 'CL-3');
  assert.equal(Object.getPrototypeOf(state.extraBooks), null);
  assert.equal(Object.hasOwn(state.extraBooks, 'CL-3'), true);
  assert.equal(state.activeClientId, 'CL-3');
});
