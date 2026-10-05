import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openSession } from '../src/session.mjs';
import { serialize } from '../src/store.mjs';
import { createMemoryStores } from '../src/store-ports.mjs';
import { chat } from '../src/router.mjs';

const BANK = 'Date,Narration,Withdrawal,Deposit,Balance\n01-08-2026,UPI rent,100,,900\n02-08-2026,NEFT sale,,500,1400\n';
const MARKER = 'UPI rent';

function open(stores = createMemoryStores()) {
  return { stores, session: openSession(stores, { seed: false }) };
}

function stored(session) {
  return JSON.stringify(serialize(session.state));
}

test('an uploaded file is previewed and imported by its hash', async () => {
  const { session, stores } = open();
  const upload = await session.uploadDocument('bank.csv', BANK);
  assert.equal(upload.ok, true);
  assert.match(upload.sha256, /^[a-f0-9]{64}$/);
  assert.equal(stores.documents.read(upload.sha256), BANK);

  const held = await session.propose('import_bank', { documentSha256: upload.sha256, type: 'csv' });
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.match(held.preview.summary, /2 rows parsed/);
  assert.deepEqual(session.state.pendingChatAction.args, { documentSha256: upload.sha256, type: 'csv' });

  const posted = await session.confirm(held.preview.token);
  assert.equal(posted.posted, true, posted.reply);
  assert.equal(posted.tools[0].name, 'import_bank');
});

test('a waiting import survives a reopen, and the books never hold the file', async () => {
  const { session, stores } = open();
  const upload = await session.uploadDocument('bank.csv', BANK);
  const held = await session.propose('import_bank', { documentSha256: upload.sha256, type: 'csv' });
  assert.equal(stored(session).includes(MARKER), false);
  assert.equal(stores.books.stored().includes(MARKER), false);

  const reopened = openSession(stores, { seed: false });
  assert.equal(reopened.state.pendingChatAction.token, held.preview.token);
  const posted = await reopened.confirm(held.preview.token);
  assert.equal(posted.posted, true, posted.reply);
});

test('content sent inline is moved to the document store before the preview is held', async () => {
  const { session, stores } = open();
  const held = await session.propose('import_bank', { content: BANK, type: 'csv' });
  assert.equal(held.awaitingConfirmation, true, held.reply);
  const args = session.state.pendingChatAction.args;
  assert.equal('content' in args, false);
  assert.equal(stores.documents.read(args.documentSha256), BANK);
  assert.equal(stored(session).includes(MARKER), false);
  assert.equal((await session.confirm(held.preview.token)).posted, true);
});

test('a file attached in chat is also held by reference', async () => {
  const { session } = open();
  await session.attachFile('bank', 'bank.csv', BANK);
  const held = await chat(session.state, 'import the bank statement');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.equal(JSON.stringify(session.state.pendingChatAction).includes(MARKER), false);
  assert.match(session.state.pendingChatAction.args.documentSha256, /^[a-f0-9]{64}$/);
});

test('a hash with no file behind it, or a malformed one, posts nothing', async () => {
  const { session } = open();
  for (const [sha, error] of [['f'.repeat(64), 'DOCUMENT_BYTES_MISSING'], ['../etc/passwd', 'INVALID_SHA256'], ['', 'INVALID_SHA256'], [42, 'INVALID_SHA256']]) {
    const out = await session.propose('import_bank', { documentSha256: sha, type: 'csv' });
    assert.equal(out.blocked, true, String(sha));
    assert.equal(out.error, error, String(sha));
    assert.equal(session.state.pendingChatAction, null);
  }
});

test('a file that disappears between preview and confirm stops the import', async () => {
  const stores = createMemoryStores();
  const { session } = open(stores);
  const upload = await session.uploadDocument('bank.csv', BANK);
  const held = await session.propose('import_bank', { documentSha256: upload.sha256, type: 'csv' });
  const emptied = { ...stores, documents: createMemoryStores().documents };
  const reopened = openSession(emptied, { seed: false });
  const out = await reopened.confirm(held.preview.token);
  assert.equal(out.posted, false);
  assert.equal(out.error, 'DOCUMENT_BYTES_MISSING');
});

test('an empty upload is refused and uploads are audited without their contents', async () => {
  const { session } = open();
  assert.equal((await session.uploadDocument('empty.csv', '')).error, 'EMPTY_FILE');
  assert.equal((await session.uploadDocument('x.csv', { not: 'text' })).error, 'EMPTY_FILE');
  await session.uploadDocument('bank.csv', BANK, { actor: { userId: 'USR-OWNER', role: 'admin' } });
  const event = session.state.auditEvents.at(-1);
  assert.equal(event.action, 'file.upload');
  assert.equal(event.actorId, 'USR-OWNER');
  assert.equal(event.metadata.name, 'bank.csv');
  assert.equal(JSON.stringify(event).includes(MARKER), false);
});

test('the reference only applies to imports', async () => {
  const { session } = open();
  const upload = await session.uploadDocument('bank.csv', BANK);
  const out = await session.propose('create_invoice', { documentSha256: upload.sha256, partyName: 'X', partyGstin: '', lines: [{ description: 'x', qty: 1, rate: 1, gstRate: 5 }] });
  assert.equal(out.blocked, true);
  assert.equal(session.state.invoices.length, 0);
});
