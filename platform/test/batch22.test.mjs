import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';

const SHA = 'a'.repeat(64);

test('a reminder can carry the file it is about, which survives a save and is refused when the hash is not one', async () => {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27' };
  const noted = await runTool(state, 'add_reminder', { text: 'Bill from Ganga Mills arrived through Scanner: bill-78.jpg. Open it to check the lines and post it.', due: '2099-01-10', documentSha256: SHA, documentName: 'bill-78.jpg' });
  assert.equal(noted.ok, true, JSON.stringify(noted));
  assert.equal(noted.reminder.documentSha256, SHA);
  assert.equal(noted.reminder.documentName, 'bill-78.jpg');
  assert.deepEqual(noted.reminder.about, { kind: 'document', id: SHA, name: 'bill-78.jpg' });
  const bad = await runTool(state, 'add_reminder', { text: 'x', due: '2099-01-10', documentSha256: 'not-a-hash' });
  assert.equal(bad.error, 'INVALID_SHA256');
  assert.equal(validateAssistantToolCall('add_reminder', { text: 'x', due: '2099-01-10', documentSha256: 'ABC' }).ok, false);
  assert.equal(validateAssistantToolCall('add_reminder', { text: 'x', due: '2099-01-10', documentSha256: SHA, documentName: 'a.pdf' }).ok, true);
  const listed = await runTool(state, 'list_reminders', {});
  assert.equal(listed.data.reminders[0].documentSha256, SHA);
  const copy = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.equal(copy.reminders[0].documentSha256, SHA);
  assert.equal(copy.reminders[0].about.kind, 'document');
});
