import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openSession } from '../src/session.mjs';
import { changePin } from '../src/identity.mjs';
import {
  createFileStores,
  createFileBooksStore,
  createFileDocumentStore,
  createMemoryStores,
  createMemoryBooksStore,
  createMemoryDocumentStore,
  VERSION_CONFLICT,
} from '../src/store-ports.mjs';

const SALE = {
  partyName: 'Kiran Stores',
  partyGstin: '',
  lines: [{ description: 'Supply', qty: 1, rate: 8000, gstRate: 18 }],
};

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'myca-ports-'));
}

for (const [kind, makeBooks] of [
  ['file', () => createFileBooksStore(join(tempDir(), 'state.json'))],
  ['memory', () => createMemoryBooksStore()],
]) {
  test(`${kind} books store: a save from a stale version is refused and changes nothing`, () => {
    const books = makeBooks();
    const first = books.load();
    first.state.company.name = 'First Writer';
    const saved = books.save(first.state, first.version);
    assert.equal(saved.ok, true);
    assert.notEqual(saved.version, first.version);

    const stale = books.load().state;
    stale.company.name = 'Stale Writer';
    const refused = books.save(stale, first.version);
    assert.deepEqual(refused, { ok: false, error: VERSION_CONFLICT, version: saved.version });
    assert.equal(books.load().state.company.name, 'First Writer');

    const next = books.save(stale, saved.version);
    assert.equal(next.ok, true);
    assert.equal(books.load().state.company.name, 'Stale Writer');
  });
}

for (const [kind, makeDocuments] of [
  ['file', () => createFileDocumentStore(tempDir())],
  ['memory', () => createMemoryDocumentStore()],
]) {
  test(`${kind} document store: content is addressed by its hash and verified on read`, () => {
    const documents = makeDocuments();
    const stored = documents.put('Date,Narration\n01-08-2026,UPI\n');
    assert.match(stored.sha256, /^[a-f0-9]{64}$/);
    assert.equal(stored.bytes, 30);
    assert.equal(documents.put('Date,Narration\n01-08-2026,UPI\n').sha256, stored.sha256);
    assert.equal(documents.exists(stored.sha256), true);
    assert.equal(documents.read(stored.sha256), 'Date,Narration\n01-08-2026,UPI\n');
    assert.equal(documents.readVerified(stored.sha256).ok, true);
    assert.equal(documents.read('f'.repeat(64)), null);
    assert.equal(documents.readVerified('f'.repeat(64)).error, 'DOCUMENT_BYTES_MISSING');
    assert.equal(documents.readVerified('not-a-hash').error, 'INVALID_SHA256');
    assert.equal(documents.exists('../../etc/passwd'), false);
  });
}

test('a session runs entirely on stores it is given, with no file of its own', async () => {
  const stores = createMemoryStores();
  const first = openSession(stores);
  assert.equal(first.path, '');
  const invoicesAtStart = first.state.invoices.length;
  const { preview } = await first.propose('create_invoice', SALE);
  assert.equal((await first.confirm(preview.token)).posted, true);
  await first.attachFile('bank', 'bank.csv', 'Date,Narration,Withdrawal,Deposit,Balance\n01-08-2026,UPI,100,,900\n');
  assert.equal(stores.documents.size(), 1);

  const reopened = openSession(stores);
  assert.equal(reopened.state.invoices.length, invoicesAtStart + 1);
  assert.equal(reopened.state.invoices.at(-1).partyName, 'Kiran Stores');
  assert.match(reopened.state.files.bank, /^Date,Narration/);
});

test('memory books keep PINs out of the stored document but across a reload', async () => {
  const stores = createMemoryStores();
  const session = openSession(stores);
  assert.equal(changePin(session.state, 'USR-ADMIN', '1234', '7410').ok, true);
  session.persist();
  assert.equal(stores.books.stored().includes('pinHash'), false);
  const reopened = openSession(stores);
  assert.equal((await reopened.signIn('USR-ADMIN', '7410')).ok, true);
});

test('a session refuses to overwrite books that changed underneath it', async () => {
  const path = join(tempDir(), 'state.json');
  const session = openSession(createFileStores(path));
  const text = readFileSync(path, 'utf8');
  writeFileSync(path, text.replace('"invoiceSeq"', '"invoiceSeq" '));
  await assert.rejects(session.propose('create_invoice', SALE), (err) => err.statusCode === 409 && /VERSION_CONFLICT/.test(err.message));
  assert.equal(readFileSync(path, 'utf8').includes('Kiran Stores'), false);
});

test('opening by path still works and uses the file stores', async () => {
  const path = join(tempDir(), 'state.json');
  const session = openSession(path);
  await session.updateCompany({ name: 'Test Co', gstin: '27AABCU9603R1ZN' });
  assert.equal(session.path.endsWith('state.json'), true);
  const { preview } = await session.propose('create_invoice', SALE);
  await session.confirm(preview.token);
  assert.equal(openSession(path).state.invoices.at(-1).partyName, 'Kiran Stores');
});
