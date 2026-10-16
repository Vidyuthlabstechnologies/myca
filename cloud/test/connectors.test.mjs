import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setChannelClient, ChannelClient } from '../../platform/src/channel-client.mjs';
import { sealSecrets, openSecrets, connectorKeyFromEnv } from '../src/connectors.mjs';
import { JOB_HEADER } from '../src/jobs.mjs';
import { startApi } from './helpers.mjs';

const KEY = 'connector-key-for-tests-0123456789abcdef0123456789abcdef';
const JOB_TOKEN = 'job-token-for-tests-0123456789abcdef0123456789';
const AMAZON_TSV = ['settlement-id\ttransaction-type\torder-id\tamount-type\tamount-description\tamount\tposted-date', '555\tOrder\t403-1\tItemPrice\tPrincipal\t1000.00\t2026-09-03', '555\tOrder\t403-1\tItemFees\tCommission\t-150.00\t2026-09-03'].join('\n');

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

let api;
let asha;
let bala;
before(async () => {
  api = await startApi({ connectorKey: KEY, jobToken: JOB_TOKEN });
  asha = await api.ownerWithBusiness('+919400000021', { name: 'Asha Traders', state: '29' });
  bala = await api.ownerWithBusiness('+919400000022', { name: 'Bala Stores', state: '27' });
});
after(async () => { await api.close(); setChannelClient(null); });

const get = (who, action) => api.call('GET', `/v1/businesses/${who.businessId}/${action}`, { token: who.token });
const post = (who, action, body) => api.call('POST', `/v1/businesses/${who.businessId}/${action}`, { token: who.token, body });

test('secrets are sealed per business with the service key and never shown back', async () => {
  const sealed = sealSecrets(KEY, asha.businessId, { refreshToken: 'Atzr|r' });
  assert.deepEqual(openSecrets(KEY, asha.businessId, sealed), { refreshToken: 'Atzr|r' });
  assert.deepEqual(openSecrets(KEY, bala.businessId, sealed), {}, 'another business cannot open it');
  assert.deepEqual(openSecrets('x'.repeat(40), asha.businessId, sealed), {});
  assert.equal(connectorKeyFromEnv({ MYCA_CONNECTOR_KEY: 'unset' }), '');

  const before = await get(asha, 'connectors');
  assert.equal(before.status, 200, before.text);
  assert.equal(before.body.enabled, true);
  assert.equal(before.body.connectors.find((c) => c.channel === 'amazon').configured, false);
  const saved = await post(asha, 'connectors', { channel: 'amazon', clientId: 'amzn1.app', clientSecret: 'shh', refreshToken: 'Atzr|refresh', marketplaceId: 'A21TJRUUN4KGV', region: 'IN' });
  assert.equal(saved.status, 200, saved.text);
  assert.equal(saved.body.configured, true);
  assert.equal(saved.body.clientSecret, 'set');
  assert.equal(saved.text.includes('shh'), false);
  const row = (await api.db.query('select fields, secrets from business_connectors where business_id = $1', [asha.businessId])).rows[0];
  assert.equal(JSON.stringify(row).includes('shh'), false, 'the database holds ciphertext only');
  assert.equal(row.fields.marketplaceId, 'A21TJRUUN4KGV');
  const partial = await post(asha, 'connectors', { channel: 'amazon', marketplaceId: 'A21TJRUUN4KGX' });
  assert.equal(partial.body.configured, true, 'a later save keeps the secrets already stored');
  assert.equal((await post(asha, 'connectors', { channel: 'flipkart' })).body.error, 'UNKNOWN_CONNECTOR');
  for (const bad of [{ channel: 'shopify', shopDomain: 'metadata.google.internal', accessToken: 't' }, { channel: 'shopify', shopDomain: 'evil.example/..', accessToken: 't' }, { channel: 'amazon', region: 'XX' }, { channel: 'zoho', dc: 'internal' }]) {
    const refused = await post(asha, 'connectors', bad);
    assert.equal(refused.body.error, 'INVALID_FIELD', JSON.stringify(bad));
  }
  assert.equal((await api.db.query("select 1 from business_connectors where business_id = $1 and channel <> 'amazon'", [asha.businessId])).rowCount, 0, 'a refused save stores nothing');
  assert.equal((await api.call('GET', `/v1/businesses/${asha.businessId}/connectors`, { token: bala.token })).status, 404);
  const audit = await api.db.query("select metadata from audit_log where business_id = $1 and action = 'connector.saved'", [asha.businessId]);
  assert.equal(audit.rowCount, 2);
  assert.equal(JSON.stringify(audit.rows[0].metadata).includes('shh'), false);
});

test('a pull is a dry run until MYCA_ENABLE_CHANNEL_PULLS is on; with it the report lands as a file with a reminder and the watermark moves', async () => {
  const off = await post(asha, 'connector-sync', { to: '2026-09-15' });
  assert.equal(off.status, 200, off.text);
  assert.equal(off.body.data.fetched, 0);
  assert.equal(off.body.data.results[0].ok, false);
  assert.equal(off.body.data.results[0].error, 'LIVE_CALLS_DISABLED');

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
  const on = await withEnv({ MYCA_ENABLE_CHANNEL_PULLS: '1', MYCA_ENABLE_LIVE_CALLS: '0' }, () => post(asha, 'connector-sync', { to: '2026-09-15' }));
  assert.equal(on.status, 200, on.text);
  assert.equal(on.body.data.fetched, 2, on.text);
  const [settlement, orders] = on.body.data.results;
  assert.equal(settlement.ok, true);
  assert.equal(settlement.rows, 2);
  assert.equal(orders.ok, true, 'the fake answers every report with the same file');
  assert.ok(calls.some((c) => c.includes('/auth/o2/token')), 'the Amazon token was fetched with the stored refresh token');
  const watermark = (await api.db.query('select last_fetched_to from business_connectors where business_id = $1', [asha.businessId])).rows[0].last_fetched_to;
  assert.equal(watermark, '2026-09-15');
  const books = (await api.db.query('select state from books where business_id = $1', [asha.businessId])).rows[0].state;
  assert.ok((books.reminders || []).some((r) => /Amazon.*settlement report/.test(r.text)), JSON.stringify(books.reminders));
  const stored = await api.db.query('select sha256 from documents where business_id = $1', [asha.businessId]);
  assert.equal(stored.rowCount, 1, 'the report is kept as a document');
  const held = await post(asha, 'propose', { name: 'import_settlement', args: { documentSha256: stored.rows[0].sha256, channel: 'amazon' } });
  assert.equal(held.body.awaitingConfirmation, true, held.text);
  assert.equal((await post(bala, 'connector-sync', {})).body.error, 'NO_CONNECTORS');
});

test('the daily job pulls for every business with connectors when the switch is on', async () => {
  const daily = await withEnv({ MYCA_ENABLE_CHANNEL_PULLS: '1' }, () => api.call('POST', '/v1/jobs/daily', { headers: { [JOB_HEADER]: JOB_TOKEN } }));
  assert.equal(daily.status, 200, daily.text);
  assert.equal(typeof daily.body.pulled, 'number');
});

test('without a connector key the service says so and stores nothing', async () => {
  const plain = await startApi();
  try {
    const owner = await plain.ownerWithBusiness('+919400000023', { name: 'No Key', state: '29' });
    const listed = await plain.call('GET', `/v1/businesses/${owner.businessId}/connectors`, { token: owner.token });
    assert.equal(listed.body.enabled, false);
    const saved = await plain.call('POST', `/v1/businesses/${owner.businessId}/connectors`, { token: owner.token, body: { channel: 'amazon', clientId: 'x' } });
    assert.equal(saved.body.error, 'CONNECTORS_UNAVAILABLE');
  } finally {
    await plain.close();
  }
});
