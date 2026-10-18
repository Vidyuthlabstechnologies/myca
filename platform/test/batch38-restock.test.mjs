import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-restock-'));
process.env.HOME = process.env.APPDATA;
process.env.MYCA_MOCK_MODE = '1';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { restockPlan } from '../src/restock.mjs';
import { recordOrderStockMoves } from '../src/sku-margins.mjs';
import { REMOTE_QUERY_TOOLS } from '../src/remote-contract.mjs';
import { localToday } from '../src/dates.mjs';

const TODAY = localToday();
function shift(days) {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  return state;
}

test('the restock plan sizes and times orders from real velocity, ignores days out of stock, and names slow movers and thin history', async () => {
  const state = books();
  await runTool(state, 'set_sku_cost', { sku: 'BX-12', cost: 18, name: 'Box 12' });
  await runTool(state, 'set_sku_cost', { sku: 'SLOW-1', cost: 500, name: 'Slow thing' });
  await runTool(state, 'record_stock', { sku: 'BX-12', qty: 400, date: shift(-60), location: 'amazon' });
  await runTool(state, 'record_stock', { sku: 'SLOW-1', qty: 40, date: shift(-60), location: 'own' });
  await runTool(state, 'record_stock', { sku: 'NEW-9', qty: 10, date: shift(-5), location: 'own' });
  for (let day = 59; day >= 0; day -= 1) recordOrderStockMoves(state, { channel: 'amazon', invoiceId: `INV-${day}`, date: shift(-day), orders: [{ sku: 'BX-12', qty: 5 }] });
  recordOrderStockMoves(state, { channel: 'amazon', invoiceId: 'INV-R', date: shift(-3), orders: [{ sku: 'BX-12', qty: 5 }], direction: 'in' });
  assert.equal((await runTool(state, 'set_sku_supply', { sku: 'BX-12', supplier: 'Ravi Packaging', leadDays: 10, pack: 50, moq: 100 })).ok, true);

  const plan = restockPlan(state).data;
  const box = plan.rows.find((r) => r.sku === 'BX-12');
  assert.equal(box.onHand, 105, '400 in, 300 sold, 5 returned');
  assert.ok(Math.abs(box.velocity28 - 4.82) < 0.05, `28-day rate ${box.velocity28}`);
  assert.equal(box.status, 'order soon', JSON.stringify(box));
  assert.match(box.why, /^runs out around .*; order within \d+ days\.$/);
  assert.equal(box.orderQty, 250, 'sixty days plus the lead at the 28-day rate, less on hand, rounded to the pack');
  assert.equal(box.orderAmount, 4500);
  const slow = plan.rows.find((r) => r.sku === 'SLOW-1');
  assert.equal(slow.status, 'slow mover');
  assert.equal(slow.tiedUp, 20000);
  assert.equal(plan.rows.find((r) => r.sku === 'NEW-9').status, 'not enough history');
  assert.ok(REMOTE_QUERY_TOOLS.has('restock_plan'));

  const words = await chat(state, 'what should I reorder?');
  assert.match(words.reply, /^1 SKU to order, about ₹4,500\.00:/, words.reply);
  assert.match(words.reply, /BX-12 \(Box 12\): 105 on hand, selling 4\.8\d a day \([0-9.]+ this week\), order soon:/);
  assert.match(words.reply, /Order 250 from Ravi Packaging \(₹4,500\.00\)\./);
  assert.match(words.reply, /SLOW-1 \(Slow thing\): 40 on hand, slow mover: nothing sold in 28 days; ₹20,000 tied up\./);
  assert.match(words.reply, /Less than a year of stock moves/);

  const held = await chat(state, 'order 250 of BX-12 from Ravi Packaging');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.match(held.reply, /Purchase order to Ravi Packaging dated .*: BX-12 x 250 at ₹18\.00 = ₹4,500\.00; total ₹4,500\.00\. Expected /, held.reply);
  assert.match(held.reply, /Nothing posts to the ledger/);
  const done = await chat(state, 'yes');
  assert.equal(done.posted, true, done.reply);
  assert.equal(state.purchaseOrders[0].id, 'PO-0001');
  assert.equal(state.purchaseOrders[0].expectedOn, shift(10));
  const after = restockPlan(state).data.rows.find((r) => r.sku === 'BX-12');
  assert.equal(after.onOrder, 250);
  assert.equal(after.orderQty, 0, 'with the order in flight nothing more is needed');
  assert.equal(after.status, 'fine');
  const back = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.equal(back.purchaseOrders.length, 1);
  assert.equal(back.skus['BX-12'].supply.leadDays, 10);
});

test('the supplier and lead time can be said in a sentence, and an unknown SKU is not ordered by accident', async () => {
  const state = books();
  await runTool(state, 'record_stock', { sku: 'TAPE-2', qty: 100, date: shift(-40), location: 'own' });
  const held = await chat(state, 'TAPE-2 comes from Kiran Traders, 5 days, pack of 12, moq 24');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.match(held.reply, /TAPE-2 \(not yet in the SKU list\): supplier Kiran Traders, lead time 5 days, pack of 12, minimum order 24\./);
  await chat(state, 'yes');
  assert.equal(state.skus['TAPE-2'].supply.pack, 12);
  const unknown = await chat(state, 'order 10 of NOPE-1 from Someone');
  assert.doesNotMatch(unknown.reply, /Purchase order/, unknown.reply);
  const noSupplier = await chat(state, 'order 24 of TAPE-2');
  assert.equal(noSupplier.awaitingConfirmation, true, 'the recorded supplier is used');
  const empty = await chat(books(), 'restock');
  assert.match(empty.reply, /No stock moves yet/, empty.reply);
});
