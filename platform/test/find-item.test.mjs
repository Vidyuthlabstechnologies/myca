import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';

test('a saved barcode finds the item with its price, GST rate and stock', async () => {
  const state = createState();
  const saved = await runTool(state, 'set_sku_cost', { sku: 'TEA-250', name: 'Assam tea 250 g', cost: 90, price: 140, gstRate: 5, hsn: '0902', barcode: '8901234567890' });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  await runTool(state, 'record_stock', { sku: 'TEA-250', qty: 24 });
  const byBarcode = await runTool(state, 'find_item', { code: ' 8901234567890 ' });
  assert.deepEqual(byBarcode.data, { found: true, code: '8901234567890', sku: 'TEA-250', name: 'Assam tea 250 g', barcode: '8901234567890', hsn: '0902', gstRate: 5, price: 140, cost: 90, unit: '', reorderLevel: null, onHand: 24, lowStock: false, batches: [], tracked: true });
  const bySku = await runTool(state, 'find_item', { code: 'tea-250' });
  assert.equal(bySku.data.sku, 'TEA-250');
  const unknown = await runTool(state, 'find_item', { code: '123456' });
  assert.equal(unknown.data.found, false);
});

test('a barcode belongs to one item and must look like one', async () => {
  const state = createState();
  await runTool(state, 'set_sku_cost', { sku: 'A', name: 'A', barcode: '8901234567890' });
  assert.equal((await runTool(state, 'set_sku_cost', { sku: 'B', name: 'B', barcode: '8901234567890' })).error, 'BARCODE_IN_USE');
  assert.equal((await runTool(state, 'set_sku_cost', { sku: 'B', barcode: '12' })).error, 'BAD_BARCODE');
  const priceOnly = await runTool(state, 'set_sku_cost', { sku: 'A', price: 10 });
  assert.equal(priceOnly.ok, true);
  assert.equal(priceOnly.barcode, '8901234567890');
  assert.equal(isRemoteQuery('find_item'), true);
  assert.equal(validateAssistantToolCall('find_item', { code: '8901234567890' }).ok, true);
});
