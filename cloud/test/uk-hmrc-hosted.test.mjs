import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers.mjs';
import { base32Decode, totpCode } from '../src/totp.mjs';
import { ChannelClient, getChannelClient, setChannelClient } from '../../platform/src/channel-client.mjs';

const ENV = { MYCA_PROVIDER_ENV: 'test', MYCA_MOCK_MODE: '0', MYCA_HMRC_CLIENT_ID: 'cid', MYCA_HMRC_CLIENT_SECRET: 'csecret', MYCA_HMRC_REDIRECT_URI: 'https://example.org/hmrc/callback', MYCA_HMRC_TOKEN_KEY: 'q'.repeat(48), MYCA_COUNTRIES: 'GB', MYCA_REGION: 'europe-west2' };
const saved = {};
const calls = [];
let realClient;
let api;

before(async () => {
  for (const [key, value] of Object.entries(ENV)) { saved[key] = process.env[key]; process.env[key] = value; }
  realClient = getChannelClient();
  setChannelClient(new ChannelClient({
    fetchFn: async (url, init) => {
      calls.push({ url, init });
      const path = new URL(url).pathname;
      const body = path === '/oauth/token' ? { access_token: 'acc', refresh_token: 'ref', expires_in: 14400, scope: 'read:vat write:vat' }
        : path.endsWith('/obligations') ? { obligations: [{ periodKey: '18A1', start: '2026-04-01', end: '2026-06-30', due: '2026-08-07', status: 'O' }] } : null;
      return new Response(JSON.stringify(body || { code: 'NOT_FOUND' }), { status: body ? 200 : 404 });
    },
  }));
  api = await startApi();
});

after(async () => {
  setChannelClient(realClient);
  for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  await api.close();
});

test('a UK business on the hosted service connects to the HMRC sandbox and syncs its VAT obligations through confirmed writes', async () => {
  const session = await api.signIn('+919812345670');
  const created = await api.call('POST', '/v1/businesses', { token: session.accessToken, body: { name: 'Thames Joinery', country: 'GB' } });
  assert.equal(created.status, 200, created.text);
  const id = created.body.business.id;
  const post = (action, body) => api.call('POST', `/v1/businesses/${id}/${action}`, { token: session.accessToken, body });
  const run = async (name, args) => {
    const held = await post('propose', { name, args });
    assert.equal(held.status, 200, held.text);
    assert.ok(held.body.preview?.token, held.text);
    const done = await post('confirm', { token: held.body.preview.token });
    assert.equal(done.status, 200, done.text);
    return done.body;
  };
  await run('set_gb_taxpayer', { vrn: 'GB999999973', residence: 'england' });
  const estimate = await post('query', { name: 'gb_tax_estimate', args: { taxYear: '2025-26', income: { employment: 50000 } } });
  assert.equal(estimate.status, 200, estimate.text);
  assert.equal(JSON.stringify(estimate.body).includes('7486'), true, estimate.text);
  const link = await run('connect_gb_hmrc', {});
  const started = JSON.stringify(link);
  const stateValue = started.match(/"state":"([^"]+)"/)[1];
  const signIn = new URL(started.match(/"(https:\/\/[^"]+\/oauth\/authorize[^"]*)"/)[1]);
  assert.equal(signIn.host, 'test-www.tax.service.gov.uk');
  assert.equal(signIn.pathname, '/oauth/authorize');
  assert.equal(calls.length, 0, 'nothing reaches HMRC before the code comes back');
  await run('finish_gb_hmrc_connection', { code: 'code-12345678', state: stateValue });
  assert.equal(calls.length, 1, 'the confirm reached the HMRC sandbox token endpoint');
  assert.equal(new URL(calls[0].url).host, 'test-api.service.hmrc.gov.uk');
  await run('sync_gb_hmrc', { taxYear: '2026-27', device: { deviceId: '3f2b8c1a-1d2e-4f5a-9b6c-7d8e9f0a1b2c', timezone: 'UTC+00:00' } });
  const obligations = calls.find((call) => call.url.includes('/obligations'));
  assert.ok(obligations, 'the sync reached HMRC');
  assert.equal(obligations.init.headers['Gov-Client-Device-ID'], '3f2b8c1a-1d2e-4f5a-9b6c-7d8e9f0a1b2c');
  const status = await post('query', { name: 'gb_hmrc_status', args: {} });
  assert.match(status.text, /18A1/);
  const reads = calls.length;
  await post('query', { name: 'gb_hmrc_status', args: {} });
  assert.equal(calls.length, reads, 'a read answers from the synced books and never calls HMRC');
});

test('HMRC submissions need two-step sign-in where it is required, and the server reports the factor HMRC sees', async () => {
  process.env.MYCA_US_REQUIRE_SECOND_STEP = '1';
  try {
    const session = await api.signIn('+919812345671');
    const created = await api.call('POST', '/v1/businesses', { token: session.accessToken, body: { name: 'Severn Bakes', country: 'GB' } });
    const id = created.body.business.id;
    const post = (action, body) => api.call('POST', `/v1/businesses/${id}/${action}`, { token: session.accessToken, body });
    const refused = await post('propose', { name: 'submit_gb_vat_return', args: { periodKey: '18A1' } });
    assert.equal(refused.body.error, 'SECOND_STEP_REQUIRED', refused.text);
    assert.match(refused.body.hint, /HMRC/);

    const begun = await api.call('POST', '/v1/me/second-step/begin', { token: session.accessToken });
    const code = totpCode(base32Decode(begun.body.secret), api.clock.now);
    assert.equal((await api.call('POST', '/v1/me/second-step/confirm', { token: session.accessToken, body: { code } })).status, 200);
    const allowed = await post('propose', { name: 'submit_gb_vat_return', args: { periodKey: '18A1' } });
    assert.notEqual(allowed.body.error, 'SECOND_STEP_REQUIRED', allowed.text);

    const confirmRun = async (name, args) => {
      const held = await post('propose', { name, args });
      assert.ok(held.body.preview?.token, held.text);
      return post('confirm', { token: held.body.preview.token });
    };
    await confirmRun('set_gb_taxpayer', { vrn: 'GB999999973', residence: 'england' });
    const link = JSON.stringify((await confirmRun('connect_gb_hmrc', {})).body);
    await confirmRun('finish_gb_hmrc_connection', { code: 'code-87654321', state: link.match(/"state":"([^"]+)"/)[1] });
    const before = calls.length;
    const synced = await confirmRun('sync_gb_hmrc', { taxYear: '2026-27', device: { deviceId: '3f2b8c1a-1d2e-4f5a-9b6c-7d8e9f0a1b2c', timezone: 'UTC+00:00', multiFactor: [{ type: 'OTHER', timestamp: '2020-01-01T00:00:00.000Z', uniqueReference: 'made-up' }] } });
    const sent = calls.slice(before).find((call) => call.url.includes('/obligations'));
    assert.ok(sent, 'the sync reached HMRC');
    const header = sent.init.headers['Gov-Client-Multi-Factor'];
    assert.match(header, /type=TOTP/);
    assert.doesNotMatch(header, /made-up/);
  } finally {
    delete process.env.MYCA_US_REQUIRE_SECOND_STEP;
  }
});
