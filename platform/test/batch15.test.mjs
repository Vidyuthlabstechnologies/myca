import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize } from '../src/store.mjs';
import { openSession } from '../src/session.mjs';
import { createMemoryBooksStore, createMemoryDocumentStore } from '../src/store-ports.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';

function session() {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27' };
  const books = createMemoryBooksStore({ text: JSON.stringify(serialize(state)), version: 0 });
  const documents = createMemoryDocumentStore([]);
  return openSession({ books, documents, path: '' }, { seed: false });
}

test('a question to the CA can carry up to five uploaded files, named, and refuses a file that was never uploaded', async () => {
  const s = session();
  await s.tool('create_invoice', { partyName: 'Kiran Stores', lines: [{ description: 'Consulting', hsn: '9983', qty: 1, rate: 10000, gstRate: 18 }], date: '2026-09-01' });
  const up = await s.uploadDocument('agreement.txt', 'Rate agreed at 10,000 per visit');
  assert.equal(up.ok, true);
  const asked = await s.tool('ask_ca', { subject: { kind: 'invoice', id: 'INV-0001' }, note: 'Is the rate right?', documents: [{ sha256: up.sha256, name: 'agreement.txt' }] }, { actor: { userId: 'u1', role: 'owner', name: 'Asha' } });
  assert.equal(asked.ok, true, JSON.stringify(asked));
  assert.deepEqual(asked.request.attachments, [{ sha256: up.sha256, name: 'agreement.txt' }]);
  const listed = await s.tool('list_ca_requests', {});
  assert.match(listed.data.requests[0].text, /- Attached: agreement\.txt/);
  assert.deepEqual(listed.data.requests[0].attachments, [{ sha256: up.sha256, name: 'agreement.txt' }]);

  const missing = await s.tool('ask_ca', { subject: { kind: 'invoice', id: 'INV-0001' }, note: 'x', documents: [{ sha256: 'a'.repeat(64) }] });
  assert.equal(missing.error, 'ATTACHMENT_NOT_UPLOADED');
  const bad = await s.tool('ask_ca', { subject: { kind: 'invoice', id: 'INV-0001' }, note: 'x', documents: [{ sha256: 'nope' }] });
  assert.equal(bad.error, 'BAD_ATTACHMENT');
  const many = await s.tool('ask_ca', { subject: { kind: 'invoice', id: 'INV-0001' }, note: 'x', documents: Array.from({ length: 6 }, () => ({ sha256: up.sha256 })) });
  assert.equal(many.error, 'TOO_MANY_ATTACHMENTS');
  assert.equal(validateAssistantToolCall('ask_ca', { subject: { kind: 'other' }, note: 'x', documents: [{ sha256: up.sha256, name: 'a' }] }).ok, true);
  assert.equal(validateAssistantToolCall('ask_ca', { subject: { kind: 'other' }, note: 'x', documents: [{ sha256: 'short' }] }).ok, false);
  const plain = await s.tool('ask_ca', { subject: { kind: 'invoice', id: 'INV-0001' }, note: 'no file' });
  assert.equal(plain.ok, true);
  assert.equal(plain.request.attachments, undefined);
});
