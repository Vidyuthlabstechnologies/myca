import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  return state;
}

const MTR = [
  'Order Id,Shipment Date,Transaction Type,Ship To State,Sku,Quantity,Tax Exclusive Gross,Total Tax Amount,Tax Rate,Invoice Amount',
  '403-1,2026-09-03,Shipment,KARNATAKA,SKU-A,2,2000.00,100.00,5,2100.00',
  '403-2,2026-09-03,Shipment,KARNATAKA,SKU-B,1,500.00,25.00,5,525.00',
  '403-3,2026-09-04,Shipment,DELHI,SKU-A,1,1000.00,50.00,5,1050.00',
  '403-3,2026-09-08,Refund,DELHI,SKU-A,-1,-1000.00,-50.00,5,-1050.00',
].join('\n');

const SETTLEMENT = [
  'settlement-id,transaction-type,order-id,amount-type,amount-description,amount,posted-date',
  '555,Order,403-1,ItemPrice,Principal,2000.00,2026-09-03',
  '555,Order,403-1,ItemPrice,Tax,100.00,2026-09-03',
  '555,Order,403-1,ItemFees,Commission,-300.00,2026-09-03',
  '555,Order,403-2,ItemPrice,Principal,500.00,2026-09-03',
  '555,Order,403-2,ItemPrice,Tax,25.00,2026-09-03',
  '555,Order,403-2,ItemFees,Commission,-400.00,2026-09-03',
  '555,Order,403-3,ItemPrice,Principal,1000.00,2026-09-04',
  '555,Order,403-3,ItemPrice,Tax,50.00,2026-09-04',
  '555,other-transaction,,,Storage Fee,-73.50,2026-09-30',
].join('\n');

test('SKU costs, stock moved by orders and returns, and margins by SKU and channel with fees allocated from the settlement; a losing SKU and negative stock are exceptions', async () => {
  const state = books();
  assert.match((await chat(state, 'cost of SKU-A is 450')).reply, /SKU-A: cost ₹450\.00 per unit/);
  const sheet = await runTool(state, 'import_sku_costs', { csv: 'SKU,Product name,HSN,Unit cost\nSKU-B,Cotton scarf,5205,480\nSKU-C,Gift box,4819,30' });
  assert.equal(sheet.data.updated, 2);
  assert.equal(state.skus['SKU-B'].name, 'Cotton scarf');

  const stockIn = await chat(state, 'stock in SKU-A 2 at amazon');
  assert.equal(stockIn.awaitingConfirmation, true, stockIn.reply);
  assert.match((await chat(state, 'yes')).reply, /Added 2 of SKU-A at amazon; now 2 there\./);

  const orders = await runTool(state, 'import_marketplace_orders', { csv: MTR, channel: 'amazon' });
  assert.equal(orders.ok, true, JSON.stringify(orders));
  assert.equal(orders.data.credited.length, 1);
  const stock = await runTool(state, 'stock_position', {});
  const skuA = stock.data.rows.find((row) => row.sku === 'SKU-A');
  assert.equal(skuA.qty, 0, '2 in, 3 sold, 1 returned');
  assert.deepEqual(stock.data.negative, [{ sku: 'SKU-B', location: 'amazon', qty: -1 }]);

  const settled = await runTool(state, 'import_settlement', { csv: SETTLEMENT, channel: 'amazon', bankAmount: 2901.5 });
  assert.equal(settled.ok, true, JSON.stringify(settled));
  const margins = await runTool(state, 'sku_margins', { period: '2026-09' });
  assert.equal(margins.ok, true, JSON.stringify(margins));
  const a = margins.data.rows.find((row) => row.sku === 'SKU-A');
  const b = margins.data.rows.find((row) => row.sku === 'SKU-B');
  assert.equal(a.units, 3);
  assert.equal(a.returnedUnits, 1);
  assert.equal(a.net, 2000);
  assert.equal(a.fees, 300 + 42 + 21, 'the commission on 403-1 plus the storage fee allocated pro rata to 403-1 (60%) and 403-3 (30%)');
  assert.equal(a.cogs, 900, 'two units at 450 after the return');
  assert.equal(a.margin, 737);
  assert.equal(b.net, 500);
  assert.equal(b.fees, 400 + 10.5);
  assert.equal(b.cogs, 480);
  assert.equal(b.margin, -390.5);
  assert.equal(margins.data.byChannel.amazon.margin, 346.5);
  assert.deepEqual(margins.data.negative.map((row) => row.sku), ['SKU-B']);

  const words = await chat(state, 'margins by sku for 2026-09');
  assert.match(words.reply, /Margins for September 2026: net sales ₹2,500\.00, fees ₹773\.50, cost of goods ₹1,380\.00, margin ₹346\.50 \(13\.86%\)\./, words.reply);
  assert.match(words.reply, /Lowest: SKU-B -₹390\.50 \(-78\.1%\)/);
  const exceptions = await runTool(state, 'exceptions', {});
  const codes = exceptions.data.exceptions.map((row) => row.code);
  assert.ok(codes.includes('NEGATIVE_MARGIN'), JSON.stringify(codes));
  assert.ok(codes.includes('STOCK_NEGATIVE'), JSON.stringify(codes));
  assert.equal(exceptions.data.exceptions.find((row) => row.code === 'NEGATIVE_MARGIN').moneyAtRisk, 390.5);

  assert.equal((await runTool(state, 'record_stock', { sku: 'SKU-B', qty: 0 })).error, 'BAD_QTY');
  assert.equal((await runTool(state, 'set_sku_cost', { sku: 'SKU-Z' })).error, 'NOTHING_TO_CHANGE');
  const copy = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.equal(copy.skus['SKU-A'].cost, 450);
  assert.equal(copy.stockMoves.length, 5);
});
