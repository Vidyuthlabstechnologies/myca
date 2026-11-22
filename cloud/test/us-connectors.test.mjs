import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setChannelClient, ChannelClient } from '../../platform/src/channel-client.mjs';
import { startApi } from './helpers.mjs';

const KEY = 'connector-key-for-tests-0123456789abcdef0123456789';
const JOB_TOKEN = 'job-token-for-tests-0123456789abcdef';

async function withEnv(vars, fn) {
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

let api;
let luna;
let other;
before(async () => {
  api = await startApi({ connectorKey: KEY, jobToken: JOB_TOKEN });
  luna = await api.ownerWithBusiness('+919400000031', { name: 'Luna Bakery LLC', country: 'US' });
  other = await api.ownerWithBusiness('+919400000032', { name: 'Other Shop', country: 'US' });
});
after(async () => { await api.close(); setChannelClient(null); });

const post = (who, action, body) => api.call('POST', `/v1/businesses/${who.businessId}/${action}`, { token: who.token, body });
const get = (who, action) => api.call('GET', `/v1/businesses/${who.businessId}/${action}`, { token: who.token });

function fakeTransport(log) {
  return async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : {};
    log.push({ url, body, auth: init.headers?.authorization || '' });
    const json = (status, data) => ({ ok: status < 400, status, headers: { get: () => '' }, text: async () => JSON.stringify(data) });
    if (url === 'https://sandbox.plaid.com/link/token/create') return body.secret === 'plaid-secret-1234' ? json(200, { link_token: 'link-sandbox-123', expiration: '2026-10-22T10:00:00Z' }) : json(400, { error_code: 'INVALID_API_KEYS' });
    if (url === 'https://sandbox.plaid.com/item/public_token/exchange') return body.public_token === 'public-sandbox-abcdefgh' ? json(200, { access_token: 'access-sandbox-xyz', item_id: 'item-1' }) : json(400, { error_code: 'INVALID_PUBLIC_TOKEN' });
    if (url === 'https://sandbox.plaid.com/transactions/sync') return json(200, { added: [{ transaction_id: 't1', date: '2026-10-20', name: 'HEB GROCERY', amount: 86.4 }], modified: [], removed: [], next_cursor: 'cur-9', has_more: false });
    if (url.startsWith('https://api.sandbox.taxjar.com/v2/rates/78701')) return json(200, { rate: { zip: '78701', state: 'TX', county: 'TRAVIS', city: 'AUSTIN', state_rate: '0.0625', county_rate: '0.0', city_rate: '0.01', special_rate: '0.01', combined_rate: '0.0825', freight_taxable: true } });
    if (url === 'https://api.gusto-demo.com/oauth/token') return body.code === 'code-777' ? json(200, { access_token: 'gusto-access-1', refresh_token: 'gusto-refresh-1', expires_in: 7200 }) : json(400, { error: 'invalid_grant' });
    if (url === 'https://api.gusto-demo.com/v1/token_info') return json(200, { resource: { type: 'Company', uuid: 'company-uuid-9' } });
    return json(404, { raw: 'no route' });
  };
}

test('the hosted API links Plaid for one business with its own sealed keys: link token, exchange, then a pull that moves the cursor on that business only', async () => {
  const log = [];
  setChannelClient(new ChannelClient({ fetchFn: fakeTransport(log) }));
  await withEnv({ MYCA_ENABLE_CHANNEL_PULLS: '1', MYCA_MOCK_MODE: '0' }, async () => {
    const saved = await post(luna, 'connectors', { channel: 'plaid', clientId: 'plaid-client-1', secret: 'plaid-secret-1234', environment: 'sandbox' });
    assert.equal(saved.status, 200, saved.text);
    assert.equal(saved.body.configured, false, 'no bank linked yet');
    assert.equal(saved.body.country, 'US');
    const token = await post(luna, 'plaid-link-token', {});
    assert.equal(token.status, 200, token.text);
    assert.equal(token.body.data.linkToken, 'link-sandbox-123');
    const bad = await post(luna, 'plaid-exchange', { publicToken: 'nope' });
    assert.equal(bad.body.error, 'BAD_PUBLIC_TOKEN');
    const linked = await post(luna, 'plaid-exchange', { publicToken: 'public-sandbox-abcdefgh' });
    assert.equal(linked.status, 200, linked.text);
    assert.equal(linked.body.data.itemId, 'item-1');
    const listed = await get(luna, 'connectors');
    const plaid = listed.body.connectors.find((c) => c.channel === 'plaid');
    assert.equal(plaid.configured, true);
    assert.equal(plaid.accessToken, 'set');
    const pulled = await post(luna, 'connector-sync', { to: '2026-10-21' });
    assert.equal(pulled.status, 200, pulled.text);
    assert.equal(pulled.body.data.fetched, 1, pulled.text);
    const row = (await api.db.query('select fields from business_connectors where business_id = $1 and channel = $2', [luna.businessId, 'plaid'])).rows[0];
    assert.equal(row.fields.cursor, 'cur-9', 'the cursor is kept on the business row');
    assert.equal((await get(other, 'connectors')).body.connectors.find((c) => c.channel === 'plaid').configured, false, 'another business sees nothing of it');
    assert.ok(!JSON.stringify(listed.body).includes('access-sandbox-xyz'));
  });
});

test('the Gusto connection runs through the hosted callback with a state that names the business and is used once; TaxJar records the rate in that business\'s books', async () => {
  const log = [];
  setChannelClient(new ChannelClient({ fetchFn: fakeTransport(log) }));
  await withEnv({ MYCA_ENABLE_CHANNEL_PULLS: '1', MYCA_MOCK_MODE: '0', MYCA_PUBLIC_URL: 'https://api.myca.example' }, async () => {
    await post(luna, 'connectors', { channel: 'gusto', clientId: 'gusto-client-1', clientSecret: 'gusto-secret-1', environment: 'demo' });
    const steered = await post(luna, 'gusto-connect', { redirectUri: 'https://attacker.example/steal' });
    assert.equal(new URL(steered.body.data.url).searchParams.get('redirect_uri'), 'https://api.myca.example/v1/oauth/gusto/callback', 'a redirect address in the request is ignored');
    const connect = await post(luna, 'gusto-connect', {});
    assert.equal(connect.status, 200, connect.text);
    const url = new URL(connect.body.data.url);
    assert.equal(url.searchParams.get('redirect_uri'), 'https://api.myca.example/v1/oauth/gusto/callback');
    const oauthState = url.searchParams.get('state');
    assert.ok(oauthState.startsWith(`${luna.businessId}.`), oauthState);
    const wrong = await api.call('GET', `/v1/oauth/gusto/callback?code=code-777&state=${luna.businessId}.${'f'.repeat(32)}`, {});
    assert.match(wrong.text, /Gusto was not connected/);
    assert.match(wrong.text, /OAUTH_STATE_MISMATCH/);
    const done = await api.call('GET', `/v1/oauth/gusto/callback?code=code-777&state=${oauthState}`, {});
    assert.equal(done.status, 200, done.text);
    assert.match(done.text, /Gusto is connected/);
    const listed = await get(luna, 'connectors');
    const gusto = listed.body.connectors.find((c) => c.channel === 'gusto');
    assert.equal(gusto.configured, true);
    assert.equal(gusto.companyUuid, 'company-uuid-9');
    assert.equal(gusto.accessToken, 'set');
    assert.equal(gusto.oauthState, '');
    const replay = await api.call('GET', `/v1/oauth/gusto/callback?code=code-777&state=${oauthState}`, {});
    assert.match(replay.text, /Gusto was not connected/);

    await post(luna, 'connectors', { channel: 'taxjar', apiToken: 'taxjar-sandbox-token-1', environment: 'sandbox' });
    const rate = await post(luna, 'taxjar-rate', { zip: '78701', city: 'Austin', state: 'TX' });
    assert.equal(rate.status, 200, rate.text);
    assert.equal(rate.body.data.ratePercent, 8.25);
    assert.equal(rate.body.data.recorded, true);
    const books = await api.books(luna.businessId);
    assert.ok((books.salesTaxRates || []).some((r) => r.code === 'TX-AUSTIN' && r.ratePercent === 8.25), JSON.stringify(books.salesTaxRates));
    assert.equal((await post(other, 'taxjar-rate', { zip: '78701' })).body.error, 'CONNECTOR_NOT_CONFIGURED');
  });
});
