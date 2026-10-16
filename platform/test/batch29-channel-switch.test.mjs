import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-pulls-'));
process.env.HOME = process.env.APPDATA;

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { createMemoryDocumentStore } from '../src/store-ports.mjs';
import { runTool } from '../src/tools.mjs';
import { performExternalAction } from '../src/action-gate.mjs';
import { setChannelClient, ChannelClient } from '../src/channel-client.mjs';
import { syncChannels } from '../src/channel-connectors.mjs';
import { channelPullsEnabled } from '../src/runtime-config.mjs';
import { checkConnectorField } from '../src/channel-connectors.mjs';

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

test('MYCA_ENABLE_CHANNEL_PULLS opens only read pulls on the channel family; government, model and channel writes still need the live switch', async () => {
  const state = books();
  const OFF = { MYCA_ENABLE_LIVE_CALLS: '0', MYCA_MOCK_MODE: '0', MYCA_ENABLE_CHANNEL_PULLS: '1' };
  assert.equal(await withEnv(OFF, async () => channelPullsEnabled()), true);
  const actor = { userId: 'owner', role: 'owner' };
  const ran = [];
  const execute = async () => { ran.push(1); return { ok: true, data: {} }; };
  const pull = await withEnv(OFF, () => performExternalAction(state, { actionId: 'channel_fetch_report', params: { channel: 'amazon' }, actor }, execute));
  assert.equal(pull.ok, true, JSON.stringify(pull));
  assert.equal(ran.length, 1);
  for (const actionId of ['nic_health', 'gst_return_status', 'nim_ask', 'zoho_push_invoices']) {
    const out = await withEnv(OFF, () => performExternalAction(state, { actionId, params: {}, actor }, execute));
    assert.equal(out.ok, false, actionId);
    assert.equal(out.error, 'LIVE_CALLS_DISABLED', actionId);
  }
  assert.equal(ran.length, 1);
});

test('host-bearing connector fields are checked against a fixed shape on both the desktop and the hosted save, and the Shopify client refuses any other host', async () => {
  const state = books();
  assert.equal((await runTool(state, 'set_channel_connector', { channel: 'shopify', shopDomain: 'metadata.google.internal', accessToken: 't' })).error, 'INVALID_FIELD');
  assert.equal((await runTool(state, 'set_channel_connector', { channel: 'shopify', shopDomain: 'nalanda.myshopify.com', accessToken: 't' })).data.configured, true);
  assert.equal((await runTool(state, 'set_channel_connector', { channel: 'amazon', region: 'XX' })).error, 'INVALID_FIELD');
  assert.equal(checkConnectorField('dc', 'internal').ok, false);
  assert.equal(checkConnectorField('dc', 'in').ok, true);
  assert.equal(checkConnectorField('unknownField', 'anything').ok, true);
  const calls = [];
  const client = new ChannelClient({ fetchFn: async (url, init = {}) => { calls.push({ url, redirect: init.redirect }); return { ok: true, status: 200, headers: { get: () => '' }, text: async () => '{"orders":[]}' }; } });
  assert.equal((await client.shopify({ config: { shopDomain: '169.254.169.254', accessToken: 't' }, kind: 'orders', from: '2026-09-01', to: '2026-09-02' })).error, 'SHOPIFY_HOST_REFUSED');
  assert.equal(calls.length, 0);
  const fine = await client.shopify({ config: { shopDomain: 'nalanda.myshopify.com', accessToken: 't' }, kind: 'orders', from: '2026-09-01', to: '2026-09-02' });
  assert.equal(fine.ok, true);
  assert.equal(calls[0].redirect, 'manual');
});

test('a sync with explicit connectors uses the given credentials and reports back through the callback instead of the local vault', async () => {
  const state = books();
  const calls = [];
  const fakeFetch = async (url, init = {}) => {
    calls.push(`${init.method || 'GET'} ${url}`);
    const json = (body, status = 200) => ({ ok: status < 300, status, headers: { get: () => '' }, text: async () => JSON.stringify(body) });
    if (url.includes('/auth/o2/token')) return json({ access_token: 'tok' });
    if (url.includes('/payments/v1/')) return json({ items: [] });
    return json({ errors: [{ message: 'unexpected' }] }, 500);
  };
  setChannelClient(new ChannelClient({ fetchFn: fakeFetch, pollMs: 1, pollLimit: 2 }));
  try {
    const marks = [];
    const connectors = [{ channel: 'razorpay', lastFetchedTo: '', config: { keyId: 'rzp_k', keySecret: 'rzp_s', enabled: true }, onFetched: async (to) => marks.push(to) }];
    const out = await withEnv({ MYCA_ENABLE_LIVE_CALLS: '0', MYCA_MOCK_MODE: '0', MYCA_ENABLE_CHANNEL_PULLS: '1' }, () => syncChannels(state, { to: '2026-09-30' }, { actor: { userId: 'owner' }, connectors }));
    assert.equal(out.ok, true);
    assert.equal(out.data.results.length, 1);
    assert.equal(out.data.results[0].channel, 'razorpay');
    assert.ok(calls.some((c) => c.includes('api.razorpay.com')), calls.join('\n'));
    assert.deepEqual(marks, [], 'an empty report does not move the watermark');
    const dry = await withEnv({ MYCA_ENABLE_LIVE_CALLS: '0', MYCA_MOCK_MODE: '0', MYCA_ENABLE_CHANNEL_PULLS: '0' }, () => syncChannels(state, { to: '2026-09-30' }, { actor: { userId: 'owner' }, connectors }));
    assert.equal(dry.data.results[0].ok, false);
    assert.equal(dry.data.results[0].error, 'LIVE_CALLS_DISABLED');
    const none = await runTool(state, 'channel_connectors', {});
    assert.equal(none.data.connectors.find((c) => c.channel === 'razorpay').configured, false, 'nothing was written to the local vault');
  } finally {
    setChannelClient(null);
  }
});
