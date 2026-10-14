import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { setModelTransport } from '../src/model-adapter.mjs';

const toolUse = (name, input) => ({ content: [{ type: 'tool_use', id: 'tu_1', name, input }] });

afterEach(() => setModelTransport(null));

test('the model sees the last exchanges of this business as context, capped at six, and the memory survives a save', async () => {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27' };
  await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', lines: [{ description: 'Consulting', hsn: '9983', qty: 1, rate: 10000, gstRate: 18 }], date: '2026-09-01' });
  const seen = [];
  setModelTransport(async (body) => {
    seen.push(body.messages);
    return { ok: true, response: toolUse('business_summary', {}) };
  });
  const first = await chat(state, 'how are things looking financially');
  assert.equal(first.viaModel, true);
  assert.equal(seen[0].length, 1);
  const second = await chat(state, 'and compared to that, what about now');
  assert.equal(second.viaModel, true);
  assert.equal(seen[1].length, 3, 'the prior turn is sent before the new message');
  assert.deepEqual(seen[1].map((m) => m.role), ['user', 'assistant', 'user']);
  assert.equal(seen[1][0].content, 'how are things looking financially');
  assert.equal(seen[1][1].content, first.reply.slice(0, 500));
  for (let i = 0; i < 8; i += 1) await chat(state, `round ${i} how is it going`);
  assert.equal(state.chatRecent.length, 6);
  assert.equal(seen[seen.length - 1].length, 13);
  const copy = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.equal(copy.chatRecent.length, 6);
  assert.equal(copy.chatRecent[5].user, 'round 7 how is it going');
  const keyword = await chat(state, 'who owes me?');
  assert.equal(keyword.viaModel, undefined, 'rule-matched messages never go to the model');
  assert.equal(state.chatRecent[5].user, 'who owes me?', 'but they are remembered too');
});
