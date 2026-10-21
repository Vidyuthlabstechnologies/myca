import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-us-connectors-'));
process.env.HOME = process.env.APPDATA;
process.env.MYCA_MOCK_MODE = '0';
process.env.MYCA_ENABLE_LIVE_CALLS = '0';
process.env.MYCA_ENABLE_CHANNEL_PULLS = '1';

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { setChannelClient, ChannelClient } from '../src/channel-client.mjs';
import { loadChannelConfig } from '../src/channel-connectors.mjs';
import { plaidTransactionsToCsv, gustoPayrollsToCsv, gustoRedirectUri } from '../src/us-connectors.mjs';
import { documentsOf } from '../src/document-store.mjs';
import { createMemoryDocumentStore } from '../src/store-ports.mjs';
import { localToday } from '../src/dates.mjs';

const TODAY = localToday();
afterEach(() => { setChannelClient(null); process.env.MYCA_MOCK_MODE = '0'; });

function usBooks() {
  const state = createState();
  state.company = { ...state.company, name: 'Luna Bakery LLC', country: 'US', state: 'TX', gstin: '' };
  state._documents = createMemoryDocumentStore();
  return state;
}

function fakeTransport(log) {
  return async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : {};
    log.push({ url, method: init.method || 'GET', body, auth: init.headers?.authorization || '' });
    const json = (status, data) => ({ ok: status < 400, status, text: async () => JSON.stringify(data) });
    if (url === 'https://sandbox.plaid.com/sandbox/public_token/create') return json(200, { public_token: 'public-sandbox-abc', request_id: 'r1' });
    if (url === 'https://sandbox.plaid.com/item/public_token/exchange') return body.public_token === 'public-sandbox-abc' ? json(200, { access_token: 'access-sandbox-xyz', item_id: 'item-1' }) : json(400, { error_code: 'INVALID_PUBLIC_TOKEN' });
    if (url === 'https://sandbox.plaid.com/transactions/sync') {
      if (body.secret !== 'plaid-secret-1234' || body.access_token !== 'access-sandbox-xyz') return json(400, { error_code: 'INVALID_ACCESS_TOKEN', error_message: 'bad token' });
      if (!body.cursor) return json(200, { added: [{ transaction_id: 't1', date: TODAY, name: 'HEB GROCERY', amount: 86.4 }, { transaction_id: 't2', date: TODAY, name: 'ACH DEPOSIT CAFE LUNA', amount: -540 }, { transaction_id: 't3', date: TODAY, name: 'PENDING CARD', amount: 10, pending: true }], modified: [], removed: [], next_cursor: 'cur-1', has_more: true });
      return json(200, { added: [{ transaction_id: 't4', date: TODAY, name: 'STRIPE PAYOUT', amount: -1200.25 }], modified: [], removed: [], next_cursor: 'cur-2', has_more: false });
    }
    if (url.startsWith('https://api.sandbox.taxjar.com/v2/rates/78701')) return init.headers.authorization === 'Bearer taxjar-sandbox-token-1' ? json(200, { rate: { zip: '78701', state: 'TX', county: 'TRAVIS', city: 'AUSTIN', state_rate: '0.0625', county_rate: '0.0', city_rate: '0.01', special_rate: '0.01', combined_rate: '0.0825', freight_taxable: true } }) : json(401, { error: 'Unauthorized' });
    if (url === 'https://api.gusto-demo.com/oauth/token') return body.code === 'code-777' && body.redirect_uri === 'http://127.0.0.1:4780/api/oauth/gusto/callback' ? json(200, { access_token: 'gusto-access-1', refresh_token: 'gusto-refresh-1', expires_in: 7200 }) : json(400, { error: 'invalid_grant' });
    if (url === 'https://api.gusto-demo.com/v1/token_info') return json(200, { resource: { type: 'Company', uuid: 'company-uuid-9' } });
    if (url.startsWith('https://api.gusto-demo.com/v1/companies/company-uuid-9/payrolls')) return json(200, [{ payroll_uuid: 'pr-1', check_date: TODAY, pay_period: { start_date: '2026-10-01', end_date: '2026-10-15' }, totals: { gross_pay: '8200.00', net_pay: '6410.50', employee_taxes: '1789.50', employer_taxes: '627.30', reimbursements: '0.00' } }]);
    return json(404, { raw: 'no route' });
  };
}

test('Plaid: the saved client id and secret link a sandbox bank, the transactions sync in pages with the cursor kept, and the file imports as a US bank statement', async () => {
  const state = usBooks();
  const log = [];
  setChannelClient(new ChannelClient({ fetchFn: fakeTransport(log) }));
  const before = await runTool(state, 'plaid_link_sandbox', {});
  assert.equal(before.error, 'CONNECTOR_NOT_CONFIGURED');
  const saved = await runTool(state, 'set_channel_connector', { channel: 'plaid', clientId: 'plaid-client-1', secret: 'plaid-secret-1234', environment: 'sandbox' });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  assert.equal(saved.data.configured, false, 'no bank linked yet');
  assert.equal(saved.data.secret, 'set');
  const linked = await runTool(state, 'plaid_link_sandbox', {});
  assert.equal(linked.ok, true, JSON.stringify(linked));
  assert.equal(linked.data.itemId, 'item-1');
  assert.equal(loadChannelConfig('plaid').accessToken, 'access-sandbox-xyz');
  assert.equal(log[0].body.institution_id, 'ins_109508');
  const pulledOut = await runTool(state, 'fetch_channel_report', { channel: 'plaid', kind: 'bank', from: '2026-10-01', to: TODAY });
  assert.equal(pulledOut.ok, true, JSON.stringify(pulledOut));
  const pulled = pulledOut.data;
  assert.equal(pulled.rows, 3, 'two pages, the pending one left out');
  assert.equal(pulled.importTool, 'import_bank');
  assert.equal(loadChannelConfig('plaid').cursor, 'cur-2', 'the next pull starts where this one ended');
  const text = documentsOf(state).read(pulled.documentSha256);
  assert.match(text, /^Date,Description,Amount,Type,Ref No/);
  assert.match(text, /HEB GROCERY,86\.40,debit/);
  assert.match(text, /ACH DEPOSIT CAFE LUNA,540\.00,credit/);
  const imported = await runTool(state, 'import_bank', { content: text, type: 'csv', fileName: pulled.name });
  assert.equal(imported.ok, true, JSON.stringify(imported));
  const again = await runTool(state, 'fetch_channel_report', { channel: 'plaid', kind: 'bank', from: '2026-10-01', to: TODAY });
  assert.equal(log.at(-1).body.cursor, 'cur-2');
  assert.equal(again.ok, true);
  assert.equal(plaidTransactionsToCsv([{ date: '2026-10-02', name: 'X', amount: 0 }]).split('\n').length >= 2, true);
});

test('TaxJar: a zip code lookup records the combined rate for the jurisdiction so invoices there use it; a wrong token is refused', async () => {
  const state = usBooks();
  const log = [];
  setChannelClient(new ChannelClient({ fetchFn: fakeTransport(log) }));
  await runTool(state, 'set_channel_connector', { channel: 'taxjar', apiToken: 'taxjar-sandbox-token-1', environment: 'sandbox' });
  const rate = await runTool(state, 'taxjar_rate', { zip: '78701', city: 'Austin', state: 'TX' });
  assert.equal(rate.ok, true, JSON.stringify(rate));
  assert.equal(rate.data.ratePercent, 8.25);
  assert.equal(rate.data.code, 'TX-AUSTIN');
  assert.equal(rate.data.recorded, true);
  assert.match(log.at(-1).url, /api\.sandbox\.taxjar\.com\/v2\/rates\/78701\?city=Austin&state=TX&country=US/);
  const rates = await runTool(state, 'list_sales_tax_rates', {});
  assert.ok(rates.data.rates.some((r) => r.code === 'TX-AUSTIN' && r.ratePercent === 8.25), JSON.stringify(rates.data));
  await runTool(state, 'set_channel_connector', { channel: 'taxjar', apiToken: 'wrong-token-00000' });
  const refused = await runTool(state, 'taxjar_rate', { zip: '78701', city: 'Austin', state: 'TX' });
  assert.equal(refused.error, 'TAXJAR_ERROR');
  assert.equal((await runTool(state, 'taxjar_rate', { zip: '787' })).error, 'BAD_ZIP');
});

test('Gusto: the connect link carries a one-time state, the callback refuses a foreign state, exchanges the code for tokens and finds the company, and the payrolls pull as a stored report', async () => {
  const state = usBooks();
  const log = [];
  setChannelClient(new ChannelClient({ fetchFn: fakeTransport(log) }));
  assert.equal(gustoRedirectUri(), 'http://127.0.0.1:4780/api/oauth/gusto/callback');
  await runTool(state, 'set_channel_connector', { channel: 'gusto', clientId: 'gusto-client-1', clientSecret: 'gusto-secret-1', environment: 'demo' });
  const link = await runTool(state, 'gusto_connect_url', {});
  assert.equal(link.ok, true, JSON.stringify(link));
  const url = new URL(link.data.url);
  assert.equal(url.origin + url.pathname, 'https://api.gusto-demo.com/oauth/authorize');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:4780/api/oauth/gusto/callback');
  const oauthState = url.searchParams.get('state');
  assert.match(oauthState, /^[0-9a-f]{32}$/);
  const foreign = await runTool(state, 'gusto_callback', { code: 'code-777', state: 'f'.repeat(32) });
  assert.equal(foreign.error, 'OAUTH_STATE_MISMATCH');
  const done = await runTool(state, 'gusto_callback', { code: 'code-777', state: oauthState });
  assert.equal(done.ok, true, JSON.stringify(done));
  assert.equal(done.data.companyUuid, 'company-uuid-9');
  const cfg = loadChannelConfig('gusto');
  assert.equal(cfg.accessToken, 'gusto-access-1');
  assert.equal(cfg.oauthState, '', 'the state is single use');
  const replay = await runTool(state, 'gusto_callback', { code: 'code-777', state: oauthState });
  assert.equal(replay.error, 'OAUTH_STATE_MISMATCH');
  const pulledOut = await runTool(state, 'fetch_channel_report', { channel: 'gusto', kind: 'payroll', from: '2026-10-01', to: TODAY });
  assert.equal(pulledOut.ok, true, JSON.stringify(pulledOut));
  const pulled = pulledOut.data;
  assert.equal(pulled.importTool, '');
  const text = documentsOf(state).read(pulled.documentSha256);
  assert.match(text, /^Check Date,Period Start,Period End,Gross Pay,Net Pay/);
  assert.match(text, /8200\.00,6410\.50,1789\.50,627\.30/);
  assert.match(log.at(-1).auth, /^Bearer gusto-access-1$/);
  assert.equal(gustoPayrollsToCsv([]).split('\n').filter(Boolean).length, 1);
});

test('Track1099 keys are kept for the day the API is wired; the US connectors view masks every secret; mock mode simulates all four without a network', async () => {
  const state = usBooks();
  const saved = await runTool(state, 'set_channel_connector', { channel: 'track1099', apiToken: 'track-key-1', teamApiId: 'team-1', testMode: 'true' });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  assert.equal(saved.data.apiToken, 'set');
  const view = await runTool(state, 'us_connectors', {});
  assert.deepEqual(view.data.connectors.map((c) => c.channel), ['plaid', 'taxjar', 'gusto', 'track1099']);
  assert.ok(view.data.connectors.every((c) => !JSON.stringify(c).includes('track-key-1')));
  assert.deepEqual(view.data.gustoRedirect.desktop, ['http://127.0.0.1:4780/api/oauth/gusto/callback', 'http://localhost:4780/api/oauth/gusto/callback']);

  process.env.MYCA_MOCK_MODE = '1';
  await runTool(state, 'set_channel_connector', { channel: 'plaid', clientId: 'plaid-client-1', secret: 'plaid-secret-1234', environment: 'sandbox' });
  const linked = await runTool(state, 'plaid_link_sandbox', {});
  assert.equal(linked.data.mock, true);
  const bank = await runTool(state, 'fetch_channel_report', { channel: 'plaid', kind: 'bank' });
  assert.equal(bank.data.mock, true);
  assert.equal(bank.data.rows, 2);
  await runTool(state, 'set_channel_connector', { channel: 'taxjar', apiToken: 'taxjar-sandbox-token-1' });
  const rate = await runTool(state, 'taxjar_rate', { zip: '78701', city: 'Austin', state: 'TX' });
  assert.equal(rate.data.mock, true);
  assert.equal(rate.data.ratePercent, 8.25);
  const html = readFileSync(new URL('../desktop/renderer/keys.html', import.meta.url), 'utf8');
  for (const name of ['us_connectors', 'plaid_link_sandbox', 'taxjar_rate', 'gusto_connect_url', 'set_channel_connector', 'channel_connectors']) assert.ok(html.includes(`'${name}'`), name);
  assert.ok(html.includes('dashboard.plaid.com') && html.includes('app.taxjar.com') && html.includes('dev.gusto.com') && html.includes('track1099.com'));
});
