import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-costing-'));
process.env.HOME = process.env.APPDATA;
process.env.MYCA_MOCK_MODE = '1';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { previewOf } from '../src/chat-confirm.mjs';
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
  state.company = { ...state.company, name: 'Sharma Medical', gstin: '27AABCU9603R1ZN', state: '27' };
  return state;
}

test('without a chosen method stock is valued at the recorded SKU cost as before, and the method tool says how to choose', async () => {
  const state = books();
  await runTool(state, 'set_sku_cost', { sku: 'RICE', cost: 40 });
  await runTool(state, 'record_stock', { sku: 'RICE', qty: 10, date: shift(-20), unitCost: 50 });
  const position = await runTool(state, 'stock_position', {});
  assert.equal(position.data.value, 400, 'recorded cost, not the lot cost, until a method is chosen');
  const costing = await runTool(state, 'inventory_costing', {});
  assert.equal(costing.ok, true);
  assert.equal(costing.data.method, '');
  assert.match(costing.data.hint, /FIFO or weighted average/);
});

test('FIFO: existing stock becomes an opening lot at the recorded cost, later lots carry their own cost, sales consume the oldest first', async () => {
  const state = books();
  await runTool(state, 'set_sku_cost', { sku: 'RICE', cost: 40, name: 'Rice 1 kg', unit: 'kg' });
  await runTool(state, 'record_stock', { sku: 'RICE', qty: 10, date: shift(-30) });
  const before = (await runTool(state, 'stock_position', {})).data.value;
  const chosen = await runTool(state, 'set_costing_method', { method: 'fifo' });
  assert.equal(chosen.ok, true, JSON.stringify(chosen));
  assert.equal(chosen.method, 'fifo');
  assert.equal((await runTool(state, 'stock_position', {})).data.value, before, 'choosing a method does not change what is on hand');
  const audit = state.auditEvents.filter((event) => event.action === 'inventory.costing_method');
  assert.equal(audit.length, 1);
  assert.equal(audit[0].metadata.method, 'fifo');
  assert.equal(audit[0].metadata.previous, '');

  await runTool(state, 'record_stock', { sku: 'RICE', qty: 10, date: shift(-20), unitCost: 50 });
  await runTool(state, 'record_stock', { sku: 'RICE', qty: -15, date: shift(-10), note: 'Sold' });
  const position = await runTool(state, 'stock_position', {});
  assert.equal(position.data.rows[0].qty, 5);
  assert.equal(position.data.value, 250, '5 left from the ₹50 lot');
  const costing = (await runTool(state, 'inventory_costing', { from: shift(-15), to: TODAY })).data;
  assert.equal(costing.method, 'fifo');
  const rice = costing.items.find((row) => row.sku === 'RICE');
  assert.equal(rice.qty, 5);
  assert.equal(rice.value, 250);
  assert.equal(rice.unit, 'KGS');
  assert.deepEqual(rice.lots.map((lot) => [lot.qty, lot.unitCost]), [[5, 50]]);
  assert.equal(costing.cogs.total, 650, '10 × 40 plus 5 × 50');
  assert.match(costing.basis, /AS 2/);

  const valued = await runTool(state, 'value_inventory', { asOf: TODAY });
  assert.equal(valued.ok, true, JSON.stringify(valued));
  assert.equal(valued.valuation.value, 250);
  assert.equal(valued.valuation.method, 'fifo');
});

test('weighted average re-averages on each receipt and issues at the running average', async () => {
  const state = books();
  assert.equal((await runTool(state, 'set_costing_method', { method: 'average' })).ok, true);
  await runTool(state, 'record_stock', { sku: 'OIL', qty: 10, date: shift(-30), unitCost: 100 });
  await runTool(state, 'record_stock', { sku: 'OIL', qty: 10, date: shift(-20), unitCost: 120 });
  await runTool(state, 'record_stock', { sku: 'OIL', qty: -5, date: shift(-15) });
  await runTool(state, 'record_stock', { sku: 'OIL', qty: 5, date: shift(-10), unitCost: 140 });
  const oil = (await runTool(state, 'inventory_costing', { from: shift(-30), to: TODAY })).data.items.find((row) => row.sku === 'OIL');
  assert.equal(oil.qty, 20);
  assert.equal(oil.value, 2350, '15 at 110 plus 5 at 140');
  assert.equal(oil.unitCost, 117.5);
  const cogs = (await runTool(state, 'inventory_costing', { from: shift(-30), to: TODAY })).data.cogs;
  assert.equal(cogs.total, 550);
});

test('LIFO is refused, a change of method needs a reason and is audited, and the same method twice is refused', async () => {
  const state = books();
  assert.equal((await runTool(state, 'set_costing_method', { method: 'lifo' })).error, 'METHOD_NOT_ALLOWED');
  assert.equal((await runTool(state, 'set_costing_method', { method: 'fifo' })).ok, true);
  assert.equal((await runTool(state, 'set_costing_method', { method: 'fifo' })).error, 'ALREADY_SET');
  const noReason = await runTool(state, 'set_costing_method', { method: 'average' });
  assert.equal(noReason.error, 'REASON_REQUIRED');
  const preview = previewOf(state, 'set_costing_method', { method: 'average' });
  assert.ok(preview.blockers.length);
  const changed = await runTool(state, 'set_costing_method', { method: 'average', reason: 'Auditor advised weighted average for the pharmacy line' });
  assert.equal(changed.ok, true);
  assert.equal(state.inventoryCosting.history.length, 2);
  const audit = state.auditEvents.filter((event) => event.action === 'inventory.costing_method');
  assert.equal(audit.length, 2);
  assert.equal(audit[1].metadata.previous, 'fifo');
  assert.match(audit[1].metadata.reason, /Auditor/);
  const round = deserialize(serialize(state));
  assert.equal(round.inventoryCosting.method, 'average');
});

test('the costing method is an India tool', async () => {
  const state = createState();
  state.company = { name: 'Maple Street Bakery', country: 'US', gstin: '', state: '', ein: '12-3456789' };
  assert.equal((await runTool(state, 'set_costing_method', { method: 'fifo' })).error, 'NOT_FOR_COUNTRY');
});

test('margins by SKU take cost of goods from the lots the orders consumed', async () => {
  const state = books();
  await runTool(state, 'set_costing_method', { method: 'fifo' });
  await runTool(state, 'set_sku_cost', { sku: 'MUG', cost: 999 });
  await runTool(state, 'record_stock', { sku: 'MUG', qty: 2, date: '2026-10-01', unitCost: 100, location: 'amazon' });
  await runTool(state, 'record_stock', { sku: 'MUG', qty: 2, date: '2026-10-02', unitCost: 200, location: 'amazon' });
  state.invoices.push({ id: 'INV-9001', source: 'marketplace', channel: 'amazon', date: '2026-10-05', status: 'open', orders: [{ orderId: 'A-1', sku: 'MUG', qty: 3, taxable: 900 }] });
  state.stockMoves.push({ date: '2026-10-05', sku: 'MUG', qty: -3, location: 'amazon', kind: 'out', ref: 'INV-9001', note: 'Sold on amazon, order A-1' });
  const margins = await runTool(state, 'sku_margins', { period: '2026-10' });
  const mug = margins.data.rows.find((row) => row.sku === 'MUG');
  assert.equal(mug.cogs, 400, 'two at 100 and one at 200, not three at the recorded 999');
});

test('items carry a GST unit (UQC) and a reorder level; invoices and the GSTR-1 HSN summary use the unit', async () => {
  const state = books();
  assert.equal((await runTool(state, 'set_sku_cost', { sku: 'SUGAR', name: 'Sugar', unit: 'furlongs' })).error, 'BAD_UNIT');
  const saved = await runTool(state, 'set_sku_cost', { sku: 'SUGAR', name: 'Sugar', unit: 'kg', reorderLevel: 20, price: 45, gstRate: 5, hsn: '1701' });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  assert.equal(saved.unit, 'KGS');
  assert.equal(saved.reorderLevel, 20);
  const found = await runTool(state, 'find_item', { code: 'SUGAR' });
  assert.equal(found.data.unit, 'KGS');
  assert.equal(found.data.reorderLevel, 20);
  assert.ok(REMOTE_QUERY_TOOLS.has('stock_alerts'));
  assert.ok(REMOTE_QUERY_TOOLS.has('inventory_costing'));

  await runTool(state, 'record_stock', { sku: 'SUGAR', qty: 50, date: shift(-5), unitCost: 38 });
  const sale = await runTool(state, 'create_invoice', { partyName: 'Walk-in customer', date: shift(-1), lines: [{ description: 'Sugar', sku: 'SUGAR', hsn: '1701', qty: 2, rate: 45, gstRate: 5 }] });
  assert.equal(sale.ok, true, JSON.stringify(sale));
  assert.equal(sale.invoice.lines[0].unit, 'KGS');
  assert.equal(sale.invoice.lines[0].sku, 'SUGAR');
  const moves = state.stockMoves.filter((move) => move.ref === sale.invoice.id);
  assert.deepEqual(moves.map((move) => move.qty), [-2]);
  const { hsnSummary } = await import('../src/gstr1-tables.mjs');
  const summary = hsnSummary([{ doc: sale.invoice, sign: 1 }], { fp: `${shift(-1).slice(5, 7)}${shift(-1).slice(0, 4)}`, aato: 0 });
  const rows = summary.table.hsn_b2c || summary.table.data;
  assert.equal(rows[0].uqc, 'KGS');
  const { invoiceToNicPayload } = await import('../src/nic-config.mjs');
  const payload = invoiceToNicPayload(state.company, sale.invoice);
  assert.equal(payload.ItemList[0].Unit, 'KGS');

  const cancelled = await runTool(state, 'cancel_invoice', { invoiceId: sale.invoice.id, reason: 'Wrong item' });
  assert.equal(cancelled.ok, true, JSON.stringify(cancelled));
  assert.equal((await runTool(state, 'find_item', { code: 'SUGAR' })).data.onHand, 50, 'cancelling puts the stock back');
});

test('a purchase bill with SKU lines stocks in a lot at the bill rate with its batch and expiry', async () => {
  const state = books();
  await runTool(state, 'set_costing_method', { method: 'fifo' });
  const bill = await runTool(state, 'create_purchase', { partyName: 'Cipla Distributors', date: shift(-3), lines: [{ description: 'Paracetamol 500 strip', sku: 'PCM500', hsn: '3004', qty: 100, rate: 12.5, gstRate: 12, batch: 'b2401', expiry: '2027-03' }] });
  assert.equal(bill.ok, true, JSON.stringify(bill));
  const lot = state.stockMoves.find((move) => move.ref === bill.invoice.id);
  assert.equal(lot.qty, 100);
  assert.equal(lot.unitCost, 12.5);
  assert.equal(lot.batch, 'B2401');
  assert.equal(lot.expiry, '2027-03-31');
});

test('batches with expiry: selling an expired batch warns, the alerts list what expires within 30 days, what has expired and what is below its reorder level', async () => {
  const state = books();
  await runTool(state, 'set_sku_cost', { sku: 'SYRUP', name: 'Cough syrup', unit: 'BTL', reorderLevel: 30, cost: 60 });
  assert.equal((await runTool(state, 'record_stock', { sku: 'SYRUP', qty: 10, date: shift(-90), batch: 'OLD1', expiry: shift(-2) })).ok, true);
  await runTool(state, 'record_stock', { sku: 'SYRUP', qty: 12, date: shift(-60), batch: 'MID2', expiry: shift(20) });
  await runTool(state, 'record_stock', { sku: 'SYRUP', qty: 40, date: shift(-30), batch: 'NEW3', expiry: shift(400) });
  assert.equal((await runTool(state, 'record_stock', { sku: 'SYRUP', qty: 5, date: shift(-1), expiry: 'soon' })).error, 'INVALID_EXPIRY');
  assert.equal((await runTool(state, 'record_stock', { sku: 'SYRUP', qty: -1, batch: 'NOPE' })).error, 'UNKNOWN_BATCH');

  const preview = previewOf(state, 'record_stock', { sku: 'SYRUP', qty: -2, batch: 'OLD1' });
  assert.equal(preview.blockers.length, 0);
  assert.ok(preview.effects.some((line) => /OLD1 expired on/.test(line)), JSON.stringify(preview));
  const sold = await runTool(state, 'record_stock', { sku: 'SYRUP', qty: -2, batch: 'OLD1' });
  assert.equal(sold.ok, true);
  assert.equal(sold.warnings[0].code, 'EXPIRED_BATCH');

  const fefo = await runTool(state, 'record_stock', { sku: 'SYRUP', qty: -1 });
  assert.equal(fefo.warnings[0].code, 'EXPIRED_BATCH', 'without a batch the earliest expiry goes first, and that one has expired');

  await runTool(state, 'record_stock', { sku: 'SYRUP', qty: -30, batch: 'NEW3' });
  const alerts = (await runTool(state, 'stock_alerts', {})).data;
  assert.deepEqual(alerts.expired.map((row) => [row.sku, row.batch, row.qty]), [['SYRUP', 'OLD1', 7]]);
  assert.deepEqual(alerts.expiring.map((row) => [row.sku, row.batch, row.qty, row.daysLeft]), [['SYRUP', 'MID2', 12, 20]]);
  assert.deepEqual(alerts.lowStock.map((row) => [row.sku, row.onHand, row.reorderLevel, row.unit]), [['SYRUP', 29, 30, 'BTL']]);
  const words = await chat(state, 'what is expiring soon');
  assert.match(words.reply, /MID2/);

  const restock = await runTool(state, 'restock_plan', {});
  const row = restock.data.rows.find((r) => r.sku === 'SYRUP');
  assert.equal(row.reorderLevel, 30);
  assert.equal(row.belowReorder, true);
  assert.ok(row.orderQty > 0, JSON.stringify(row));
  assert.match(row.why, /reorder level/);
});

test('an invoice that sells an expired batch says so in its preview', async () => {
  const state = books();
  await runTool(state, 'set_sku_cost', { sku: 'DROPS', name: 'Eye drops', unit: 'BTL', price: 80, gstRate: 12, hsn: '3004' });
  await runTool(state, 'record_stock', { sku: 'DROPS', qty: 5, date: shift(-60), batch: 'E1', expiry: shift(-1) });
  const preview = previewOf(state, 'create_invoice', { partyName: 'Walk-in customer', lines: [{ description: 'Eye drops', sku: 'DROPS', hsn: '3004', qty: 1, rate: 80, gstRate: 12 }] });
  assert.ok(preview.effects.some((line) => /E1 expired on/.test(line)), JSON.stringify(preview.effects));
  assert.ok(preview.effects.some((line) => /Stock out: 1 BTL of DROPS/.test(line)), JSON.stringify(preview.effects));
});

test('moving stock between locations is not a sale, item details survive later edits and imports, and chat chooses the method with a preview', async () => {
  const state = books();
  await runTool(state, 'set_costing_method', { method: 'fifo' });
  await runTool(state, 'set_sku_supply', { sku: 'MUG', supplier: 'Ravi', leadDays: 5 });
  await runTool(state, 'set_sku_cost', { sku: 'MUG', cost: 100, barcode: '8901234500011', unit: 'pcs' });
  await runTool(state, 'import_sku_costs', { csv: 'sku,cost\nMUG,110\n' });
  assert.equal(state.skus.MUG.barcode, '8901234500011');
  assert.equal(state.skus.MUG.unit, 'PCS');
  assert.equal(state.skus.MUG.supply.supplier, 'Ravi');
  await runTool(state, 'record_stock', { sku: 'MUG', qty: 10, date: shift(-10), unitCost: 100 });
  const moved = await runTool(state, 'record_stock', { sku: 'MUG', qty: 4, location: 'own', toLocation: 'amazon', date: shift(-5) });
  assert.equal(moved.ok, true, JSON.stringify(moved));
  const costing = (await runTool(state, 'inventory_costing', { from: shift(-30), to: TODAY })).data;
  assert.equal(costing.cogs.total, 0);
  assert.equal(costing.items.find((row) => row.sku === 'MUG').value, 1000);
  const position = (await runTool(state, 'stock_position', { sku: 'MUG' })).data.rows;
  assert.deepEqual(position.map((row) => [row.location, row.qty]), [['amazon', 4], ['own', 6]]);

  const fresh = books();
  const held = await chat(fresh, 'cost inventory by weighted average');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.match(held.reply, /weighted average/);
  const lifo = await chat(fresh, 'use LIFO');
  assert.match(lifo.reply, /not allowed/i);
});

test('a counter sale of an item whose stock is not tracked keeps the SKU on the line and moves no stock', async () => {
  const state = books();
  await runTool(state, 'set_sku_cost', { sku: 'PEN', name: 'Pen', unit: 'NOS', price: 10, gstRate: 18, hsn: '9608' });
  const sale = await runTool(state, 'create_invoice', { partyName: 'Walk-in customer', lines: [{ description: 'Pen', sku: 'PEN', hsn: '9608', qty: 3, rate: 10, gstRate: 18 }] });
  assert.equal(sale.ok, true, JSON.stringify(sale));
  assert.equal(sale.invoice.lines[0].sku, 'PEN');
  assert.equal(sale.invoice.lines[0].unit, 'NOS');
  assert.equal(state.stockMoves.length, 0);
});
