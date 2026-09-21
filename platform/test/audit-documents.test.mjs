import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createState } from '../src/store.mjs';
import { handleCaApi } from '../src/ca-api.mjs';
import { documentsDir, putDocument, readDocument, documentExists } from '../src/document-store.mjs';

function stateIn(prefix) {
  const state = createState();
  state._dataDir = mkdtempSync(join(tmpdir(), prefix));
  return state;
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
