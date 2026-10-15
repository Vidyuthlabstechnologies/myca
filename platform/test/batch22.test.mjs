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

test('the assistant log keeps payroll and salary messages and replies out, and only the owner or an admin reads or corrects it', async () => {
  const { chat } = await import('../src/router.mjs');
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27' };
  await chat(state, 'who owes me?');
  await chat(state, 'raise Ravi salary to 65000 from next month');
  const log = await runTool(state, 'eval_events', {});
  assert.equal(log.ok, true);
  const salary = log.data.events.find((event) => /payroll or salary message/.test(event.input));
  assert.ok(salary, JSON.stringify(log.data.events));
  assert.equal(salary.reply, '');
  assert.doesNotMatch(JSON.stringify(log.data.events), /65,?000|Ravi/);
  state.__actor = { userId: 'USR-STAFF', role: 'staff' };
  assert.equal((await runTool(state, 'eval_events', {})).error, 'OWNER_ONLY');
  assert.equal((await runTool(state, 'correct_eval', { id: log.data.events[0].id, note: 'x' })).error, 'OWNER_ONLY');
  state.__actor = { userId: 'USR-ADMIN', role: 'admin' };
  assert.equal((await runTool(state, 'eval_events', {})).ok, true);
  delete state.__actor;
});
