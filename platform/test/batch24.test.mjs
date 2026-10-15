import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';

test('the stock history lists the movements of a SKU newest first with the on-hand figure, and answers in chat', async () => {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  await runTool(state, 'record_stock', { sku: 'SKU-A', qty: 100, location: 'own', date: '2026-09-01', note: 'Opening count' });
  await runTool(state, 'record_stock', { sku: 'SKU-A', qty: -30, location: 'own', date: '2026-09-05', note: 'Sent to Amazon' });
  await runTool(state, 'record_stock', { sku: 'SKU-B', qty: 5, location: 'own', date: '2026-09-06' });
  const moves = await runTool(state, 'stock_moves', { sku: 'sku-a' });
  assert.equal(moves.ok, true);
  assert.equal(moves.data.onHand, 70);
  assert.deepEqual(moves.data.moves.map((m) => m.qty), [-30, 100]);
  assert.equal(moves.data.total, 3);
  const words = await chat(state, 'stock history for SKU-A');
  assert.match(words.reply, /SKU-A: 70 on hand after 2 movements\./, words.reply);
  assert.match(words.reply, /· 5 September 2026: -30 SKU-A at own, Sent to Amazon/);
  assert.match((await chat(state, 'stock movements')).reply, /All SKUs: 75 on hand after 3 movements/);
});
