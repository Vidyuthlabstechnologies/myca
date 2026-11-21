import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';
import { needsConfirmation, previewOf } from '../src/chat-confirm.mjs';
import { publicCatalogue, priceStoreOrder, receiveStoreOrder, slugProblem, slugFromName, indianMobile, itemId, recordStoreLink, orderText } from '../src/catalogue.mjs';

async function shop() {
  const state = createState();
  state.company = { ...(state.company || {}), name: 'Sharma Kirana', gstin: '27AABCU9603R1ZN', state: '27', country: 'IN' };
  for (const item of [
    { sku: 'TEA-250', name: 'Assam tea 250 g', cost: 90, price: 100, gstRate: 5, hsn: '0902' },
    { sku: 'SOAP', name: 'Neem soap', cost: 20, price: 40, gstRate: 18, hsn: '3401' },
    { sku: 'RICE', name: 'Basmati rice 1 kg', cost: 70 },
    { sku: 'SECRET', name: 'Wholesale only', cost: 5, price: 9, gstRate: 12 },
  ]) assert.equal((await runTool(state, 'set_sku_cost', item)).ok, true);
  await runTool(state, 'record_stock', { sku: 'TEA-250', qty: 3 });
  await runTool(state, 'record_stock', { sku: 'SOAP', qty: 2 });
  await runTool(state, 'record_stock', { sku: 'SOAP', qty: -2 });
  return state;
}

async function openShop() {
  const state = await shop();
  const set = await runTool(state, 'catalogue_settings', { enabled: true, storeName: 'Sharma Kirana', description: 'Daily needs', whatsapp: '+91 98765 43210', city: 'Pune', showStock: true });
  assert.equal(set.ok, true, JSON.stringify(set));
  const items = await runTool(state, 'catalogue_items', { items: [{ sku: 'tea-250', published: true, category: 'Tea', description: 'Strong leaf tea' }, { sku: 'SOAP', published: true, category: 'Bath' }, { sku: 'RICE', published: true }] });
  assert.equal(items.ok, true, JSON.stringify(items));
  return state;
}

test('the public catalogue holds only published items and the store public fields', async () => {
  const state = await openShop();
  const snap = publicCatalogue(state);
  assert.equal(snap.enabled, true);
  assert.deepEqual(snap.store, { name: 'Sharma Kirana', description: 'Daily needs', city: 'Pune', address: '', whatsapp: '919876543210' });
  assert.deepEqual(snap.items.map((item) => item.name), ['Neem soap', 'Assam tea 250 g', 'Basmati rice 1 kg']);
  const tea = snap.items.find((item) => item.name === 'Assam tea 250 g');
  assert.deepEqual(tea, { id: itemId('TEA-250'), name: 'Assam tea 250 g', category: 'Tea', description: 'Strong leaf tea', price: 105, priceWords: '₹105.00 incl. GST', inStock: true });
  assert.equal(snap.items.find((item) => item.name === 'Neem soap').inStock, false);
  const rice = snap.items.find((item) => item.name === 'Basmati rice 1 kg');
  assert.equal(rice.price, null);
  assert.equal(rice.priceWords, 'Price on request');
  assert.equal('inStock' in rice, false);
  const text = JSON.stringify(snap);
  for (const secret of ['27AABCU9603R1ZN', 'Wholesale only', '"cost"', '0902', 'TEA-250', '"qty"', '"hsn"', '"sku"']) assert.equal(text.includes(secret), false, `snapshot leaks ${secret}`);
  for (const value of [90, 20, 70]) assert.equal(snap.items.some((item) => item.price === value), false);
});

test('the GSTIN shows only when the owner chose it, prices only when shown', async () => {
  const state = await openShop();
  await runTool(state, 'catalogue_settings', { showGstin: true, showPrices: false });
  const snap = publicCatalogue(state);
  assert.equal(snap.store.gstin, '27AABCU9603R1ZN');
  assert.equal(snap.items.some((item) => 'price' in item || 'priceWords' in item), false);
  await runTool(state, 'catalogue_settings', { enabled: false });
  assert.deepEqual(publicCatalogue(state), { enabled: false });
});

test('the store is India only', async () => {
  const state = await openShop();
  state.company.country = 'US';
  assert.deepEqual(publicCatalogue(state), { enabled: false });
  const out = await runTool(state, 'catalogue_view', {});
  assert.equal(out.ok, false);
});

test('settings are checked: WhatsApp number, link name, reserved words', async () => {
  const state = await shop();
  assert.equal((await runTool(state, 'catalogue_settings', { enabled: true })).error, 'WHATSAPP_REQUIRED');
  assert.equal((await runTool(state, 'catalogue_settings', { whatsapp: '12345' })).error, 'BAD_WHATSAPP');
  assert.equal((await runTool(state, 'catalogue_settings', { whatsapp: '9876543210', slug: 'admin' })).error, 'SLUG_RESERVED');
  assert.equal((await runTool(state, 'catalogue_settings', { whatsapp: '9876543210', slug: 'Bad Slug!' })).error, 'BAD_SLUG');
  assert.equal(slugProblem('ab'), 'BAD_SLUG');
  assert.equal(slugProblem('a'.repeat(41)), 'BAD_SLUG');
  assert.equal(slugProblem('-abc'), 'BAD_SLUG');
  assert.equal(slugProblem('ab--c'), 'BAD_SLUG');
  assert.equal(slugProblem('sharma-kirana-2'), null);
  assert.equal(slugFromName('Sharma Kirana & Sons!'), 'sharma-kirana-sons');
  assert.equal(slugFromName('Shop'), 'shop-shop');
  assert.equal(slugFromName('दुकान'), 'my-shop');
  assert.equal(indianMobile('09876543210'), '9876543210');
  assert.equal(indianMobile('919876543210'), '9876543210');
  assert.equal(indianMobile('5876543210'), '');
  const set = await runTool(state, 'catalogue_settings', { enabled: true, whatsapp: '9876543210' });
  assert.equal(set.ok, true);
  assert.equal(set.slug, 'sharma-kirana');
  assert.equal((await runTool(state, 'catalogue_items', { items: [{ sku: 'NOPE', published: true }] })).error, 'SKU_NOT_FOUND');
});

test('staff cannot change the store', async () => {
  const state = await shop();
  state.__actor = { userId: 'u-staff', role: 'accountant' };
  assert.equal((await runTool(state, 'catalogue_settings', { whatsapp: '9876543210' })).error, 'OWNER_ONLY');
  assert.equal((await runTool(state, 'catalogue_items', { items: [{ sku: 'SOAP', published: true }] })).error, 'OWNER_ONLY');
});

test('an order is priced from the snapshot, never from the buyer', async () => {
  const state = await openShop();
  const snap = publicCatalogue(state);
  const tea = itemId('TEA-250');
  const rice = itemId('RICE');
  const priced = priceStoreOrder(snap, { buyerName: 'Meena', buyerPhone: '98200 12345', lines: [{ id: tea, qty: 2 }, { id: rice, qty: 1 }], note: 'Deliver after 6' });
  assert.equal(priced.ok, true, JSON.stringify(priced));
  assert.deepEqual(priced.order.lines, [{ id: tea, name: 'Assam tea 250 g', qty: 2, price: 105, amount: 210 }, { id: rice, name: 'Basmati rice 1 kg', qty: 1, price: null, amount: null }]);
  assert.equal(priced.order.total, 210);
  assert.equal(priced.order.priced, false);
  assert.equal(priced.order.buyerPhone, '9820012345');
  assert.equal(priceStoreOrder(snap, { buyerName: 'Meena', buyerPhone: '9820012345', lines: [{ id: tea, qty: 1, price: 1 }] }).error, 'BAD_LINE');
  assert.equal(priceStoreOrder(snap, { buyerName: 'Meena', buyerPhone: '9820012345', total: 1, lines: [{ id: tea, qty: 1 }] }).error, 'BAD_ORDER');
  assert.equal(priceStoreOrder(snap, { buyerName: 'Meena', buyerPhone: '12345', lines: [{ id: tea, qty: 1 }] }).error, 'BAD_PHONE');
  assert.equal(priceStoreOrder(snap, { buyerName: 'Meena', buyerPhone: '9820012345', lines: [{ id: tea, qty: 1000 }] }).error, 'BAD_QUANTITY');
  assert.equal(priceStoreOrder(snap, { buyerName: 'Meena', buyerPhone: '9820012345', lines: [{ id: tea, qty: 1.5 }] }).error, 'BAD_QUANTITY');
  assert.equal(priceStoreOrder(snap, { buyerName: 'Meena', buyerPhone: '9820012345', lines: Array.from({ length: 51 }, () => ({ id: tea, qty: 1 })) }).error, 'TOO_MANY_LINES');
  assert.equal(priceStoreOrder(snap, { buyerName: 'Meena', buyerPhone: '9820012345', lines: [{ id: tea, qty: 1 }, { id: tea, qty: 1 }] }).error, 'DUPLICATE_LINE');
  assert.equal(priceStoreOrder(snap, { buyerName: 'Meena', buyerPhone: '9820012345', lines: [{ id: itemId('SECRET'), qty: 1 }] }).error, 'ITEM_UNAVAILABLE');
  assert.equal(priceStoreOrder(snap, { buyerName: 'Meena', buyerPhone: '9820012345', lines: [{ id: itemId('SOAP'), qty: 1 }] }).error, 'ITEM_OUT_OF_STOCK');
  assert.equal(priceStoreOrder(snap, { buyerName: '', buyerPhone: '9820012345', lines: [{ id: tea, qty: 1 }] }).error, 'NAME_REQUIRED');
  assert.equal(priceStoreOrder(snap, { buyerName: { toString: () => 'x' }, buyerPhone: '9820012345', lines: [{ id: tea, qty: 1 }] }).error, 'BAD_ORDER');
  assert.equal(priceStoreOrder({ enabled: false }, { buyerName: 'Meena', buyerPhone: '9820012345', lines: [{ id: tea, qty: 1 }] }).error, 'STORE_CLOSED');
  assert.match(orderText('Sharma Kirana', priced.order), /2 x Assam tea 250 g = ₹210\.00/);
});

test('an accepted order becomes a quote at the saved prices; declined and fulfilled close it', async () => {
  const state = await openShop();
  const tea = itemId('TEA-250');
  const priced = priceStoreOrder(publicCatalogue(state), { buyerName: 'Meena', buyerPhone: '9820012345', lines: [{ id: tea, qty: 2 }] });
  const received = receiveStoreOrder(state, priced.order, { ref: 'r1', receivedAt: '2026-11-21T10:00:00Z' });
  assert.equal(received.ok, true);
  assert.equal(received.order.id, 'ORD-0001');
  assert.equal(state.auditEvents.at(-1).action, 'store.order_received');
  const listed = await runTool(state, 'store_orders', { status: 'new' });
  assert.equal(listed.data.orders.length, 1);
  assert.equal(listed.data.orders[0].lines[0].sku, 'TEA-250');
  assert.equal(needsConfirmation('store_order_action'), true);
  const preview = previewOf(state, 'store_order_action', { id: 'ORD-0001', action: 'accept' });
  assert.deepEqual(preview.blockers, []);
  assert.equal(preview.figures.total, 210);
  const accepted = await runTool(state, 'store_order_action', { id: 'ORD-0001', action: 'accept' });
  assert.equal(accepted.ok, true, JSON.stringify(accepted));
  const quote = state.quotes.find((q) => q.id === accepted.quoteId);
  assert.equal(quote.partyName, 'Meena');
  assert.equal(quote.total, 210);
  assert.equal(quote.lines[0].rate, 100);
  assert.equal(state.auditEvents.at(-1).action, 'store.order_answered');
  assert.equal((await runTool(state, 'store_order_action', { id: 'ORD-0001', action: 'decline' })).error, 'ORDER_ALREADY_ANSWERED');
  assert.equal((await runTool(state, 'store_order_action', { id: 'ORD-0001', action: 'fulfil' })).status, 'fulfilled');
  assert.equal((await runTool(state, 'store_order_action', { id: 'ORD-0001', action: 'fulfil' })).error, 'ORDER_CLOSED');
  const rice = priceStoreOrder(publicCatalogue(state), { buyerName: 'Ravi', buyerPhone: '9820012345', lines: [{ id: itemId('RICE'), qty: 1 }] });
  receiveStoreOrder(state, rice.order, {});
  assert.equal((await runTool(state, 'store_order_action', { id: 'ORD-0002', action: 'accept' })).error, 'PRICE_REQUIRED');
  assert.equal((await runTool(state, 'store_order_action', { id: 'ORD-0002', action: 'decline' })).status, 'declined');
});

test('the tools are wired: schemas, remote queries, previews, link', async () => {
  const state = await openShop();
  assert.equal(isRemoteQuery('catalogue_view'), true);
  assert.equal(isRemoteQuery('store_orders'), true);
  assert.equal(isRemoteQuery('store_order_action'), false);
  assert.equal(validateAssistantToolCall('catalogue_settings', { enabled: true, slug: 'sharma' }).ok, true);
  assert.equal(validateAssistantToolCall('catalogue_settings', { cost: 1 }).ok, false);
  assert.equal(validateAssistantToolCall('store_order_action', { id: 'ORD-0001', action: 'refund' }).ok, false);
  for (const name of ['catalogue_settings', 'catalogue_items', 'store_order_action']) assert.equal(needsConfirmation(name), true);
  assert.match(previewOf(state, 'catalogue_settings', { slug: 'sharma-store' }).summary, /\/s\/sharma-store/);
  assert.match(previewOf(state, 'catalogue_items', { items: [{ sku: 'SOAP', published: false }] }).summary, /hidden/);
  recordStoreLink(state, 'sharma-kirana');
  const view = await runTool(state, 'catalogue_view', {});
  assert.equal(view.data.link.slug, 'sharma-kirana');
  assert.equal(view.data.link.path, '/s/sharma-kirana');
  assert.equal(view.data.published, 3);
  assert.equal(view.data.items.some((item) => 'cost' in item), false);
  assert.deepEqual(view.data.problems.map((p) => p.sku), ['RICE']);
  const us = createState();
  us.company = { name: 'Maple', country: 'US', gstin: '', state: '' };
  assert.equal((await runTool(us, 'catalogue_view', {})).error, 'NOT_FOR_COUNTRY');
});

test('the store survives a save and load', async () => {
  const { serialize, deserialize } = await import('../src/store.mjs');
  const state = await openShop();
  assert.equal(typeof deserialize, 'function');
  const again = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.equal(publicCatalogue(again).items.length, 3);
});

test('an accepted store order invoiced from its quote takes the goods out of stock, with the unit', async () => {
  const state = await openShop();
  await runTool(state, 'set_sku_cost', { sku: 'TEA-250', unit: 'pcs' });
  const priced = priceStoreOrder(publicCatalogue(state), { buyerName: 'Meena', buyerPhone: '9820012345', lines: [{ id: itemId('TEA-250'), qty: 2 }] });
  receiveStoreOrder(state, priced.order, { ref: 'r1', receivedAt: '2026-11-21T10:00:00Z' });
  const accepted = await runTool(state, 'store_order_action', { id: 'ORD-0001', action: 'accept' });
  const quote = state.quotes.find((q) => q.id === accepted.quoteId);
  assert.equal(quote.lines[0].sku, 'TEA-250');
  assert.equal(quote.lines[0].unit, 'PCS');
  const preview = previewOf(state, 'convert_quote', { id: quote.id });
  assert.ok(preview.effects.some((line) => /Stock out: 2 PCS of TEA-250/.test(line)), JSON.stringify(preview.effects));
  const made = await runTool(state, 'convert_quote', { id: quote.id });
  assert.equal(made.ok, true, JSON.stringify(made));
  assert.equal(made.invoice.lines[0].sku, 'TEA-250');
  assert.equal(made.invoice.lines[0].unit, 'PCS');
  const out = state.stockMoves.filter((move) => move.ref === made.invoice.id);
  assert.deepEqual(out.map((move) => [move.sku, move.qty]), [['TEA-250', -2]]);
  assert.equal((await runTool(state, 'stock_position', { sku: 'TEA-250' })).data.rows[0].qty, 1);
});

test('a quote made by hand with item codes moves stock when it becomes an invoice', async () => {
  const state = await shop();
  const made = await runTool(state, 'create_quote', { partyName: 'Kiran Stores', lines: [{ description: 'Assam tea 250 g', sku: 'tea-250', qty: 1, rate: 100, gstRate: 5 }] });
  assert.equal(made.ok, true, JSON.stringify(made));
  assert.equal(made.quote.lines[0].sku, 'TEA-250');
  const invoiced = await runTool(state, 'convert_quote', { id: made.quote.id });
  assert.equal(invoiced.ok, true, JSON.stringify(invoiced));
  assert.deepEqual(state.stockMoves.filter((move) => move.ref === invoiced.invoice.id).map((move) => move.qty), [-1]);
});
