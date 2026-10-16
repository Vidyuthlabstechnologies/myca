import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-channels-'));
process.env.HOME = process.env.APPDATA;

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { createMemoryDocumentStore } from '../src/store-ports.mjs';
import { setChannelClient, ChannelClient } from '../src/channel-client.mjs';
import { shopifyOrdersToCsv, shopifyPayoutsToCsv, razorpayReconToCsv, loadChannelConfig } from '../src/channel-connectors.mjs';
import { parseSettlementCsv } from '../src/settlements.mjs';
import { parseOrdersCsv } from '../src/marketplace-orders.mjs';

async function withEnv(vars, fn) {
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  try { return await fn(); } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  state._documents = createMemoryDocumentStore();
  return state;
}

const AMAZON_TSV = ['settlement-id\ttransaction-type\torder-id\tamount-type\tamount-description\tamount\tposted-date', '555\tOrder\t403-1\tItemPrice\tPrincipal\t1000.00\t2026-09-03', '555\tOrder\t403-1\tItemFees\tCommission\t-150.00\t2026-09-03'].join('\n');

test('credentials sit in the local vault with secrets never shown; fetching is a dry run until live calls are on and a simulated file in mock mode; the report lands as a file with a reminder and imports from chat', async () => {
  const state = books();
  const before = await runTool(state, 'channel_connectors', {});
  assert.equal(before.data.connectors.find((c) => c.channel === 'amazon').configured, false);
  assert.match(before.data.fileOnly.flipkart, /files/);
  const saved = await runTool(state, 'set_channel_connector', { channel: 'amazon', clientId: 'amzn1.application-oa2-client.x', clientSecret: 'shh', refreshToken: 'Atzr|refresh', marketplaceId: 'A21TJRUUN4KGV', region: 'IN' });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  assert.equal(saved.data.configured, true);
  assert.equal(saved.data.clientSecret, 'set');
  assert.equal(JSON.stringify(saved).includes('shh'), false, 'secrets never appear in a reply');
  assert.equal(loadChannelConfig('amazon').refreshToken, 'Atzr|refresh', 'and decrypt back from the vault');
  assert.equal((await runTool(state, 'set_channel_connector', { channel: 'flipkart', keyId: 'x' })).error, 'UNKNOWN_CONNECTOR');
  assert.equal((await runTool(state, 'fetch_channel_report', { channel: 'razorpay', kind: 'settlement' })).error, 'CONNECTOR_NOT_CONFIGURED');
  assert.equal((await runTool(state, 'fetch_channel_report', { channel: 'razorpay', kind: 'orders' })).error, 'KIND_NOT_SUPPORTED');

  const dry = await withEnv({ MYCA_ENABLE_LIVE_CALLS: '0', MYCA_MOCK_MODE: '0' }, () => runTool(state, 'fetch_channel_report', { channel: 'amazon', kind: 'settlement', from: '2026-09-01', to: '2026-09-15' }));
  assert.equal(dry.ok, false, JSON.stringify(dry));
  assert.ok(dry.dryRun || /DRY_RUN|LIVE_CALLS/i.test(dry.error || ''), JSON.stringify(dry));

  const mock = await withEnv({ MYCA_MOCK_MODE: '1' }, () => chat(state, 'fetch amazon settlement from 2026-09-01 to 2026-09-15'));
  assert.match(mock.reply, /Simulated: amazon settlement report for 1 September 2026 to 15 September 2026 fetched: 3 rows stored as amazon-settlement-2026-09-01-to-2026-09-15\.csv/, mock.reply);
  const attachment = state.attachments['channel:amazon:settlement'];
  assert.ok(attachment?.sha256, JSON.stringify(state.attachments));
  assert.equal(attachment.mock, true);
  assert.ok(state.reminders.some((r) => r.documentSha256 === attachment.sha256), 'a reminder carries the file');
  assert.equal(loadChannelConfig('amazon').lastFetchedTo, '', 'a simulated fetch does not move the watermark');

  const held = await chat(state, 'import amazon settlement');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.match(held.reply, /Amazon settlement mock-amazon-2026-09-15/, held.reply);
  const posted = await chat(state, 'yes');
  assert.match(posted.reply, /Recorded STL-0001/, posted.reply);
});

test('live: the Amazon report is requested, polled and downloaded through the gate with a fake transport, stored and imported; the watermark moves and sync_channels continues from it', async () => {
  const state = books();
  await runTool(state, 'set_channel_connector', { channel: 'amazon', clientId: 'c', clientSecret: 's', refreshToken: 'r', marketplaceId: 'A21TJRUUN4KGV' });
  const calls = [];
  const fakeFetch = async (url, init = {}) => {
    calls.push(`${init.method || 'GET'} ${url}`);
    const json = (body, status = 200) => ({ ok: status < 300, status, headers: { get: () => '' }, text: async () => JSON.stringify(body) });
    if (url.includes('/auth/o2/token')) return json({ access_token: 'tok' });
    if (url.endsWith('/reports') && init.method === 'POST') return json({ reportId: 'R1' });
    if (url.endsWith('/reports/R1')) return json({ processingStatus: 'DONE', reportDocumentId: 'D1' });
    if (url.endsWith('/documents/D1')) return json({ url: 'https://files.example/D1' });
    if (url === 'https://files.example/D1') return { ok: true, status: 200, headers: { get: () => '' }, text: async () => AMAZON_TSV };
    return json({ errors: [{ message: 'unexpected' }] }, 500);
  };
  setChannelClient(new ChannelClient({ fetchFn: fakeFetch, pollMs: 1, pollLimit: 3 }));
  try {
    const live = await withEnv({ MYCA_ENABLE_LIVE_CALLS: '1', MYCA_MOCK_MODE: '0' }, () => runTool(state, 'fetch_channel_report', { channel: 'amazon', kind: 'settlement', from: '2026-09-01', to: '2026-09-15' }));
    assert.equal(live.ok, true, JSON.stringify(live));
    assert.equal(live.data.rows, 2);
    assert.equal(live.data.mock, false);
    assert.ok(calls.some((c) => c.startsWith('POST https://sellingpartnerapi-eu.amazon.com/reports/2021-06-30/reports')), JSON.stringify(calls));
    assert.equal(loadChannelConfig('amazon').lastFetchedTo, '2026-09-15');
    const parsed = parseSettlementCsv(state._documents.read(live.data.documentSha256));
    assert.equal(parsed.expected, 850);
    const sync = await withEnv({ MYCA_ENABLE_LIVE_CALLS: '1', MYCA_MOCK_MODE: '0' }, () => runTool(state, 'sync_channels', { to: '2026-09-30' }));
    assert.equal(sync.ok, true, JSON.stringify(sync));
    assert.ok(calls.some((c) => c.includes('dataStartTime') === false), 'range is in the body');
    assert.equal(sync.data.results.length, 2, 'settlement and orders for the one connected channel');
  } finally {
    setChannelClient(null);
  }
});

test('Shopify orders and payouts and Razorpay reconciliation are shaped into the same CSV the file imports take', () => {
  const orders = shopifyOrdersToCsv([{ orders: [{ id: 1001, name: '#1001', created_at: '2026-09-05T10:00:00+05:30', taxes_included: true, shipping_address: { province: 'Karnataka' }, line_items: [{ sku: 'SKU-A', quantity: 2, price: '590.00', total_discount: '0', tax_lines: [{ rate: 0.18, price: '180.00' }] }], refunds: [] }] }]);
  const parsedOrders = parseOrdersCsv(orders, { channel: 'shopify' });
  assert.equal(parsedOrders.ok, true, JSON.stringify(parsedOrders));
  assert.equal(parsedOrders.sales[0].state, '29');
  assert.equal(parsedOrders.sales[0].taxable, 1000);
  assert.equal(parsedOrders.sales[0].gstRate, 18);
  const payouts = shopifyPayoutsToCsv([{ transactions: [{ type: 'charge', amount: '1180.00', fee: '23.60', net: '1156.40', payout_id: 77, source_order_id: 1001, processed_at: '2026-09-06T00:00:00Z' }, { type: 'refund', amount: '-590.00', fee: '0', net: '-590.00', payout_id: 77, source_order_id: 1001, processed_at: '2026-09-07T00:00:00Z' }] }], { from: '2026-09-01', to: '2026-09-07' });
  const parsedPayout = parseSettlementCsv(payouts, { channel: 'shopify' });
  assert.equal(parsedPayout.ok, true, JSON.stringify(parsedPayout));
  assert.equal(parsedPayout.expected, 566.4);
  assert.equal(parsedPayout.totals.fee, -23.6);
  const recon = razorpayReconToCsv([{ type: 'payment', entity_id: 'pay_1', order_id: 'order_1', amount: 118000, fee: 2360, tax: 425, settlement_id: 'setl_1', settled_at: 1757116800 }, { type: 'refund', entity_id: 'rfnd_1', order_id: 'order_1', amount: 59000, settlement_id: 'setl_1', settled_at: 1757116800 }], { from: '2026-09-01', to: '2026-09-07' });
  const parsedRecon = parseSettlementCsv(recon, { channel: 'razorpay' });
  assert.equal(parsedRecon.ok, true, JSON.stringify(parsedRecon));
  assert.equal(parsedRecon.expected, 562.15);
  assert.equal(parsedRecon.totals.refund, -590);
});
