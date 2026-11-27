import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';
import { foldForSearch } from '../src/sku-margins.mjs';
import { localToday } from '../src/dates.mjs';

async function shop() {
  const state = createState();
  const items = [
    ['SAKHAR', 'साखर', 45, 5, 'KGS'],
    ['SUGAR', 'Sugar loose', 44, 5, 'KGS'],
    ['ATTA-5', 'Aashirvaad atta 5 kg', 260, 5, 'PAC', '8901234567890'],
    ['PARLE', 'Parle-G biscuit', 10, 18, 'PCS'],
    ['TEA', 'Brooke Bond tea', 140, 5, 'PAC'],
  ];
  for (const [sku, name, price, gstRate, unit, barcode] of items) {
    const saved = await runTool(state, 'set_sku_cost', { sku, name, price, gstRate, unit, ...(barcode ? { barcode } : {}) });
    assert.equal(saved.ok, true, JSON.stringify(saved));
    await runTool(state, 'record_stock', { sku, qty: 50 });
  }
  return state;
}

const names = (result) => result.data.items.map((item) => item.name);

test('typing part of a name finds the item, whatever the case or script', async () => {
  const state = await shop();
  assert.deepEqual(names(await runTool(state, 'search_items', { query: 'sug' })), ['Sugar loose']);
  assert.deepEqual(names(await runTool(state, 'search_items', { query: 'PARLE' })), ['Parle-G biscuit']);
  assert.deepEqual(names(await runTool(state, 'search_items', { query: 'साखर' })), ['साखर']);
  assert.deepEqual(names(await runTool(state, 'search_items', { query: 'साख' })), ['साखर']);
});

test('a word in the middle of a name matches, and a name that starts with the text comes first', async () => {
  const state = await shop();
  assert.deepEqual(names(await runTool(state, 'search_items', { query: 'bond' })), ['Brooke Bond tea']);
  const found = names(await runTool(state, 'search_items', { query: 'a' }));
  assert.equal(found[0], 'Aashirvaad atta 5 kg');
});

test('a barcode or SKU typed whole comes first', async () => {
  const state = await shop();
  assert.equal((await runTool(state, 'search_items', { query: '8901234567890' })).data.items[0].sku, 'ATTA-5');
  assert.equal((await runTool(state, 'search_items', { query: 'tea' })).data.items[0].sku, 'TEA');
});

test('each result carries what a bill line needs', async () => {
  const state = await shop();
  const [row] = (await runTool(state, 'search_items', { query: 'sugar' })).data.items;
  assert.deepEqual(row, { sku: 'SUGAR', name: 'Sugar loose', barcode: '', hsn: '', gstRate: 5, price: 44, unit: 'KGS', tracked: true, onHand: 50, lowStock: false });
});

test('with no text it lists what sells most, then the rest, capped by the limit', async () => {
  const state = await shop();
  const today = localToday();
  state.stockMoves.push({ sku: 'TEA', qty: -1, date: today, location: 'main' }, { sku: 'TEA', qty: -1, date: today, location: 'main' }, { sku: 'PARLE', qty: -1, date: today, location: 'main' });
  const result = await runTool(state, 'search_items', { limit: 3 });
  assert.equal(result.data.favourites, true);
  assert.deepEqual(result.data.items.map((item) => item.sku), ['TEA', 'PARLE', 'ATTA-5']);
  assert.equal(result.data.more, true);
});

test('an old sale does not make an item a favourite', async () => {
  const state = await shop();
  state.stockMoves.push({ sku: 'TEA', qty: -1, date: '2020-01-01', location: 'main' });
  assert.notEqual((await runTool(state, 'search_items', {})).data.items[0].sku, 'TEA');
});

test('nothing matches gives an empty list, not an error', async () => {
  const state = await shop();
  const result = await runTool(state, 'search_items', { query: 'zzzz' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.items, []);
});

test('accents and spacing are ignored, and the limit is bounded', async () => {
  assert.equal(foldForSearch('  Café   AU Lait '), 'cafe au lait');
  assert.equal(foldForSearch('साखर'), 'साखर');
  const state = await shop();
  assert.equal((await runTool(state, 'search_items', { query: ' s u g ' })).data.items.length, 0);
  assert.equal((await runTool(state, 'search_items', { limit: 9999 })).data.items.length, 5);
});

test('it is a read-only remote query the assistant may call', () => {
  assert.equal(isRemoteQuery('search_items'), true);
  assert.equal(validateAssistantToolCall('search_items', { query: 'sug', limit: 5 }).ok, true);
  assert.equal(validateAssistantToolCall('search_items', { query: 'sug', extra: 1 }).ok, false);
  assert.equal(validateAssistantToolCall('search_items', { limit: 31 }).ok, false);
});
