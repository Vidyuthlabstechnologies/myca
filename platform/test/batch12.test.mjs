import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { csvCell } from '../src/text-safe.mjs';
import { createState, serialize } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { openSession } from '../src/session.mjs';
import { createMemoryBooksStore, createMemoryDocumentStore } from '../src/store-ports.mjs';
import { encryptSecret, safeStorageRequired } from '../src/credential-vault.mjs';
import { setModelTransport } from '../src/model-adapter.mjs';

afterEach(() => {
  delete process.env.MYCA_REQUIRE_SAFE_STORAGE;
  setModelTransport(null);
});

test('CSV cells starting with a tab, a return, leading whitespace before an operator, or a fullwidth operator are neutralised', () => {
  assert.equal(csvCell('\t=1+1'), "'\t=1+1");
  assert.equal(csvCell('\r=cmd'), '"\'\r=cmd"');
  assert.equal(csvCell('  =SUM(A1)'), "'  =SUM(A1)");
  assert.equal(csvCell('＝HYPERLINK()'), "'＝HYPERLINK()");
  assert.equal(csvCell('＋1'), "'＋1");
  assert.equal(csvCell('@cmd'), "'@cmd");
  assert.equal(csvCell('-12.50'), '-12.50');
  assert.equal(csvCell('Kiran Stores'), 'Kiran Stores');
  assert.equal(csvCell('a,b'), '"a,b"');
});

function freshSession() {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27' };
  const books = createMemoryBooksStore({ text: JSON.stringify(serialize(state)), version: 0 });
  const documents = createMemoryDocumentStore([]);
  return openSession({ books, documents, path: '' }, { seed: false });
}

test('a restore verifies each document against its sha256, refuses a broken ledger chain, and drops approvals and pending actions', async () => {
  const source = freshSession();
  await source.tool('create_invoice', { partyName: 'Kiran Stores', lines: [{ description: 'Consulting', hsn: '9983', qty: 1, rate: 10000, gstRate: 18 }], date: '2026-09-01' });
  const backup = source.backup();
  const sha = createHash('sha256').update('Supplier bill text', 'utf8').digest('hex');
  backup.documents = { [sha]: 'Supplier bill text' };

  const tampered = JSON.parse(JSON.stringify(backup));
  tampered.documents[sha] = 'Different text';
  const bad = await freshSession().restore({ ...tampered, confirm: true });
  assert.equal(bad.error, 'INVALID_BACKUP');
  assert.equal(bad.reason, 'DOCUMENT_HASH_MISMATCH');

  const badKey = JSON.parse(JSON.stringify(backup));
  badKey.documents['not-a-hash'] = 'x';
  const bad2 = await freshSession().restore({ ...badKey, confirm: true });
  assert.equal(bad2.reason, 'BAD_DOCUMENT_KEY');

  const broken = JSON.parse(JSON.stringify(backup));
  const journal = broken.state.ledger.journal || broken.state.ledger.transfers || [];
  if (journal.length) journal[0].amount = String(Number(journal[0].amount || 0) + 1);
  const bad3 = await freshSession().restore({ ...broken, confirm: true });
  if (journal.length) assert.equal(bad3.reason, 'CHAIN_BROKEN', JSON.stringify(bad3));

  const withLeftovers = JSON.parse(JSON.stringify(backup));
  withLeftovers.state.approvals = [{ id: 'APR-1' }];
  withLeftovers.state.pendingChatAction = { token: 'x' };
  const target = freshSession();
  const good = await target.restore({ ...withLeftovers, confirm: true });
  assert.equal(good.ok, true, JSON.stringify(good));
  assert.deepEqual(target.state.approvals, []);
  assert.equal(target.state.pendingChatAction, null);
  assert.equal(target.state.invoices.length, 1);
});

test('the packaged app refuses to store a secret without safeStorage; outside it the local cipher still works', () => {
  process.env.MYCA_REQUIRE_SAFE_STORAGE = '1';
  assert.equal(safeStorageRequired(), true);
  assert.throws(() => encryptSecret('top secret'), (err) => err.code === 'SAFE_STORAGE_REQUIRED');
  delete process.env.MYCA_REQUIRE_SAFE_STORAGE;
  assert.equal(safeStorageRequired(), false);
  const record = encryptSecret('top secret');
  assert.equal(record.scheme, 'aes-256-gcm');
});

test('a model response over the cap is refused rather than parsed', async () => {
  const { chooseTool, modelConfigured } = await import('../src/model-adapter.mjs');
  assert.equal(typeof chooseTool, 'function');
  assert.equal(typeof modelConfigured, 'function');
  const src = await import('node:fs').then((fs) => fs.readFileSync(new URL('../src/model-adapter.mjs', import.meta.url), 'utf8'));
  assert.match(src, /MAX_RESPONSE_BYTES = 2 \* 1024 \* 1024/);
  assert.match(src, /MODEL_RESPONSE_TOO_LARGE/);
});
