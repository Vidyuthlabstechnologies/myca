import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createState, serialize } from '../src/store.mjs';
import { handleCaApi } from '../src/ca-api.mjs';
import { openSession } from '../src/session.mjs';
import { newBook, serializeBook } from '../src/books.mjs';
import { documentsDir, putDocument, readDocument, documentExists } from '../src/document-store.mjs';

function stateIn(prefix) {
  const state = createState();
  state._dataDir = mkdtempSync(join(tmpdir(), prefix));
  return state;
}

function legacyHash(content) {
  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
}

function docRecord(documentId, clientId, fileName, content, sha256) {
  return {
    documentId, clientId, kind: 'general', fileName, contentType: 'text/plain',
    uploadedAt: '2026-09-01T00:00:00.000Z', bytes: Buffer.byteLength(content, 'utf8'), sha256,
  };
}

function writeStateFile(dir, patch) {
  const path = join(dir, 'state.json');
  const raw = {
    ...JSON.parse(JSON.stringify(serialize(createState()))),
    clients: [{ clientId: 'ACME', name: 'Acme' }],
    extraBooks: { ACME: serializeBook(newBook({ name: 'Acme' })) },
    ...patch,
  };
  writeFileSync(path, JSON.stringify(raw));
  return { path, text: readFileSync(path, 'utf8') };
}

function preMigrationCopies(dir) {
  return readdirSync(dir).filter((name) => name !== 'state.json' && name.endsWith('.json'));
}

async function contentOf(sess, clientId, documentId) {
  const read = await sess.caApi('GET', `/api/ca/clients/${clientId}/documents/${documentId}`);
  return read.ok ? read.data.content : read.error;
}

test('documents: ids and upload times are always server-assigned', () => {
  const state = stateIn('myca-doc-ids-');
  const up = handleCaApi(state, 'POST', '/api/ca/clients/SELF/documents', {
    documentId: 'DOC-999999', uploadedAt: '2001-01-01T00:00:00.000Z', fileName: 'a.txt', content: 'A',
  });
  assert.equal(up.ok, true);
  assert.notEqual(up.data.documentId, 'DOC-999999');
  assert.notEqual(up.data.uploadedAt, '2001-01-01T00:00:00.000Z');
});

test('documents: one client cannot overwrite another client\'s document content', () => {
  const state = stateIn('myca-doc-swap-');
  handleCaApi(state, 'POST', '/api/ca/clients', { clientId: 'ACME', name: 'Acme' });
  handleCaApi(state, 'POST', '/api/ca/clients', { clientId: 'BETA', name: 'Beta' });
  const acme = handleCaApi(state, 'POST', '/api/ca/clients/ACME/documents', { fileName: 'a.txt', content: 'ACME CONTENT' });
  handleCaApi(state, 'POST', '/api/ca/clients/BETA/documents', { documentId: acme.data.documentId, fileName: 'b.txt', content: 'BETA CONTENT' });
  const read = handleCaApi(state, 'GET', `/api/ca/clients/ACME/documents/${acme.data.documentId}`);
  assert.equal(read.data.content, 'ACME CONTENT');
});

test('documents: a tampered file on disk is reported, never served', () => {
  const state = stateIn('myca-doc-tamper-');
  const up = handleCaApi(state, 'POST', '/api/ca/clients/SELF/documents', { fileName: 'a.txt', content: 'ORIGINAL' });
  writeFileSync(join(documentsDir(state._dataDir), `${up.data.sha256}.txt`), 'TAMPERED', 'utf8');
  const read = handleCaApi(state, 'GET', `/api/ca/clients/SELF/documents/${up.data.documentId}`);
  assert.deepEqual(read, { ok: false, error: 'DOCUMENT_INTEGRITY_FAILED' });
});

test('documents: only a 64-hex sha256 can address the store', () => {
  const dir = mkdtempSync(join(tmpdir(), 'myca-doc-path-'));
  writeFileSync(join(dir, 'secret.txt'), 'SECRET', 'utf8');
  assert.equal(readDocument(dir, '../secret'), null);
  assert.equal(documentExists(dir, '../secret'), false);
});

test('documents: a half-written file is repaired on the next put', () => {
  const dir = mkdtempSync(join(tmpdir(), 'myca-doc-repair-'));
  const first = putDocument(dir, 'FULL CONTENT');
  writeFileSync(first.path, 'FULL', 'utf8');
  putDocument(dir, 'FULL CONTENT');
  assert.equal(readFileSync(first.path, 'utf8'), 'FULL CONTENT');
});

test('documents: a state whose documentSeq lags its ids still gives each new upload its own id', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'myca-doc-seq-'));
  const self = putDocument(dir, 'SELF-1');
  const acme = putDocument(dir, 'ACME-1');
  const { path } = writeStateFile(dir, {
    documents: [
      docRecord('DOC-000001', 'SELF', 's1.txt', 'SELF-1', self.sha256),
      docRecord('DOC-000002', 'ACME', 'a1.txt', 'ACME-1', acme.sha256),
    ],
    documentSeq: 1,
    activeClientId: 'ACME',
  });
  const sess = openSession(path);
  const saved = await sess.tool('save_document', { kind: 'k', fileName: 'a2.txt', content: 'ACME-2 NEW' });
  assert.equal(saved.ok, true);
  assert.equal(['DOC-000001', 'DOC-000002'].includes(saved.data.documentId), false);
  assert.equal((await sess.tool('get_document', { documentId: saved.data.documentId })).data.content, 'ACME-2 NEW');
  assert.equal(await contentOf(sess, 'ACME', saved.data.documentId), 'ACME-2 NEW');
  const posted = await sess.caApi('POST', '/api/ca/clients/ACME/documents', { fileName: 'a3.txt', content: 'ACME-3 HTTP' });
  assert.equal(await contentOf(sess, 'ACME', posted.data.documentId), 'ACME-3 HTTP');
  assert.equal(await contentOf(sess, 'ACME', 'DOC-000002'), 'ACME-1');
});

test('documents: duplicate ids from older states are renumbered on load, keeping a pre-migration copy', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'myca-doc-dup-'));
  const self = putDocument(dir, 'SELF-1');
  const first = putDocument(dir, 'ACME-1');
  const second = putDocument(dir, 'ACME-2');
  const { path, text } = writeStateFile(dir, {
    documents: [
      docRecord('DOC-000001', 'SELF', 's1.txt', 'SELF-1', self.sha256),
      docRecord('DOC-000002', 'ACME', 'a1.txt', 'ACME-1', first.sha256),
      docRecord('DOC-000002', 'ACME', 'a2.txt', 'ACME-2', second.sha256),
    ],
    documentSeq: 1,
  });
  const sess = openSession(path);
  const ids = sess.state.documents.map((doc) => doc.documentId);
  assert.equal(new Set(ids).size, 3);
  assert.deepEqual(ids.slice(0, 2), ['DOC-000001', 'DOC-000002']);
  assert.equal(sess.state.documents[2].legacyDocumentId, 'DOC-000002');
  assert.equal(await contentOf(sess, 'ACME', 'DOC-000002'), 'ACME-1');
  assert.equal(await contentOf(sess, 'ACME', ids[2]), 'ACME-2');
  const posted = await sess.caApi('POST', '/api/ca/clients/ACME/documents', { fileName: 'a3.txt', content: 'ACME-3' });
  assert.equal(ids.includes(posted.data.documentId), false);
  assert.equal(await contentOf(sess, 'ACME', posted.data.documentId), 'ACME-3');
  const copies = preMigrationCopies(dir);
  assert.equal(copies.length, 1);
  assert.equal(readFileSync(join(dir, copies[0]), 'utf8'), text);
  const reopened = openSession(path);
  assert.deepEqual(reopened.state.documents.slice(0, 3).map((doc) => doc.documentId), ids);
  assert.equal(preMigrationCopies(dir).length, 1);
});

test('documents: files filed before the document store read back after open and reopen', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'myca-doc-legacy-'));
  const content = 'FILED BEFORE STORE';
  const { path } = writeStateFile(dir, {
    documents: [docRecord('DOC-000001', 'SELF', 'old.txt', content, legacyHash(content))],
    documentSeq: 1,
    files: { 'DOC-000001': content },
  });
  const sess = openSession(path);
  assert.equal(await contentOf(sess, 'SELF', 'DOC-000001'), content);
  assert.equal((await sess.tool('get_document', { documentId: 'DOC-000001' })).data.content, content);
  const reopened = openSession(path);
  assert.equal(await contentOf(reopened, 'SELF', 'DOC-000001'), content);
});

test('documents: a pre-store document already moved to a root attachment reads back', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'myca-doc-legacy-att-'));
  const content = 'FILED BEFORE STORE, RESAVED';
  const stored = putDocument(dir, content);
  const { path } = writeStateFile(dir, {
    documents: [docRecord('DOC-000001', 'SELF', 'old.txt', content, legacyHash(content))],
    documentSeq: 1,
    attachments: { 'DOC-000001': { kind: 'DOC-000001', name: 'DOC-000001', sha256: stored.sha256, bytes: stored.bytes, at: '2026-09-01T00:00:00.000Z' } },
  });
  const sess = openSession(path);
  assert.equal(await contentOf(sess, 'SELF', 'DOC-000001'), content);
  const reopened = openSession(path);
  assert.equal(await contentOf(reopened, 'SELF', 'DOC-000001'), content);
});

test('documents: legacy bytes are relinked only to the record whose hash they match', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'myca-doc-legacy-dup-'));
  const { path } = writeStateFile(dir, {
    documents: [
      docRecord('DOC-000001', 'SELF', 'old.txt', 'OLD', legacyHash('OLD')),
      docRecord('DOC-000001', 'SELF', 'new.txt', 'NEW', legacyHash('NEW')),
    ],
    files: { 'DOC-000001': 'NEW' },
  });
  const sess = openSession(path);
  const renumbered = sess.state.documents[1].documentId;
  assert.notEqual(renumbered, 'DOC-000001');
  assert.equal(await contentOf(sess, 'SELF', 'DOC-000001'), 'DOCUMENT_BYTES_MISSING');
  assert.equal(await contentOf(sess, 'SELF', renumbered), 'NEW');
});
