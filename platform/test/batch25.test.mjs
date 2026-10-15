import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { trialBalance, listAccounts } from '../src/ledger.mjs';
import { localToday } from '../src/dates.mjs';

const TODAY = localToday();

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  return state;
}

test('inventory is valued at recorded cost and the change posts to Inventory against Change in inventory; a fall posts the other way; uncosted SKUs are named; valuations are dated forward only', async () => {
  const state = books();
  assert.equal((await runTool(state, 'value_inventory', { asOf: '2026-09-30' })).error, 'NO_STOCK');
  await runTool(state, 'set_sku_cost', { sku: 'SKU-A', cost: 400 });
  await runTool(state, 'record_stock', { sku: 'SKU-A', qty: 100, location: 'own', date: '2026-09-01' });
  await runTool(state, 'record_stock', { sku: 'SKU-B', qty: 10, location: 'own', date: '2026-09-01' });
  const held = await chat(state, 'value inventory at 2026-09-30');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.match(held.reply, /Inventory at 30 September 2026: ₹40,000\.00 across 1 SKU at recorded cost; change ₹40,000\.00\./, held.reply);
  assert.match(held.reply, /Left out, no cost set: SKU-B \(10\)/);
  const posted = await chat(state, 'yes');
  assert.match(posted.reply, /Posted ₹40,000\.00 to Inventory against Change in inventory, so cost of goods this period falls by that much\./, posted.reply);
  let accounts = Object.fromEntries(listAccounts(state.ledger).map((a) => [a.code, a]));
  assert.equal(accounts['1300'].debitsPosted, 40000);
  assert.equal(accounts['5005'].creditsPosted, 40000);
  assert.equal(trialBalance(state.ledger).balanced, true);
  assert.equal((await runTool(state, 'value_inventory', { asOf: '2026-09-30' })).error, 'NOT_AFTER_LAST');
  assert.equal((await runTool(state, 'value_inventory', { asOf: '2099-01-01' })).error, 'FUTURE_DATE');

  await runTool(state, 'record_stock', { sku: 'SKU-A', qty: -30, location: 'own', date: '2026-10-05', note: 'Sold' });
  await runTool(state, 'set_sku_cost', { sku: 'SKU-B', cost: 50 });
  const again = await runTool(state, 'value_inventory', { asOf: TODAY });
  assert.equal(again.ok, true, JSON.stringify(again));
  assert.equal(again.valuation.value, 28500, '70 × 400 plus 10 × 50');
  assert.equal(again.valuation.delta, -11500);
  accounts = Object.fromEntries(listAccounts(state.ledger).map((a) => [a.code, a]));
  assert.equal(accounts['1300'].creditsPosted, 11500);
  assert.equal(accounts['5005'].debitsPosted, 11500);
  assert.equal(trialBalance(state.ledger).balanced, true);
  const listed = await runTool(state, 'inventory_valuations', {});
  assert.equal(listed.data.valuations.length, 2);
  assert.equal(listed.data.latest.value, 28500);
  assert.equal(listed.data.unposted, 0);
  const words = await chat(state, 'what is my stock worth?');
  assert.match(words.reply, /Inventory last valued .* at ₹28,500\.00; on hand now ₹28,500\.00, unchanged\./, words.reply);
  const close = await runTool(state, 'daily_close', { asOf: TODAY });
  const check = close.data.checklist.find((row) => row.item === 'Inventory valued');
  assert.equal(check.ok, true, JSON.stringify(check));
  const copy = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.equal(copy.inventoryValuations.length, 2);
});
