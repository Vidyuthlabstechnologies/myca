import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { providerEnvironment, liveCallsEnabled, testModeEnabled, productionCallsEnabled } from '../src/runtime-config.mjs';
import { performExternalAction } from '../src/action-gate.mjs';
import { SandboxClient } from '../src/sandbox-client.mjs';
import { nicHealth, IRP_HOSTS } from '../src/nic-client.mjs';
import { sendNotification } from '../src/notifications.mjs';

globalThis.fetch = async (url) => {
  throw new Error(`NETWORK_FORBIDDEN_IN_TESTS ${url}`);
};

const KEYS = ['MYCA_GSP_TEST_API_KEY', 'MYCA_PROVIDER_ENV', 'MYCA_ENABLE_LIVE_CALLS', 'MYCA_MOCK_MODE', 'MYCA_GSP_BASE_URL', 'MYCA_GSP_ENV', 'MYCA_GSP_API_KEY', 'MYCA_GSP_API_SECRET'];

async function withEnv(vars, fn) {
  const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  for (const key of KEYS) delete process.env[key];
  Object.assign(process.env, { MYCA_MOCK_MODE: '0', MYCA_ENABLE_LIVE_CALLS: '0' }, vars);
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const maker = { userId: 'ca', role: 'staff' };

test('the switch reads off, test or live, and the old live flag still means live', async () => {
  await withEnv({}, () => assert.equal(providerEnvironment(), 'off'));
  await withEnv({ MYCA_ENABLE_LIVE_CALLS: '1' }, () => assert.equal(providerEnvironment(), 'live'));
  await withEnv({ MYCA_ENABLE_LIVE_CALLS: '1', MYCA_PROVIDER_ENV: 'test' }, () => {
    assert.equal(providerEnvironment(), 'test');
    assert.equal(liveCallsEnabled(), true);
    assert.equal(testModeEnabled(), true);
    assert.equal(productionCallsEnabled(), false);
  });
  await withEnv({ MYCA_ENABLE_LIVE_CALLS: '1', MYCA_PROVIDER_ENV: 'off' }, () => assert.equal(liveCallsEnabled(), false));
  await withEnv({ MYCA_PROVIDER_ENV: 'LIVE' }, () => assert.equal(productionCallsEnabled(), true));
  await withEnv({ MYCA_PROVIDER_ENV: 'prod' }, () => assert.equal(providerEnvironment(), 'off'));
});

test('test mode sends Quicko to its test host whatever base URL is configured', async () => {
  await withEnv({ MYCA_PROVIDER_ENV: 'test', MYCA_GSP_BASE_URL: 'https://api.sandbox.co.in', MYCA_GSP_ENV: 'live' }, () => {
    const client = new SandboxClient({ saved: {}, apiKey: 'k', apiSecret: 's', baseUrl: 'https://api.sandbox.co.in', environment: 'live' });
    assert.equal(client.baseUrl, 'https://test-api.sandbox.co.in');
    assert.equal(client.environment, 'test');
  });
  await withEnv({ MYCA_PROVIDER_ENV: 'live', MYCA_GSP_BASE_URL: 'https://api.sandbox.co.in' }, () => {
    const client = new SandboxClient({ saved: {}, apiKey: 'k', apiSecret: 's' });
    assert.equal(client.baseUrl, 'https://api.sandbox.co.in');
  });
});

test('test mode sends NIC calls to the sandbox IRP even when production is configured', async () => {
  const seen = [];
  const fetchFn = async (url) => {
    seen.push(url);
    return { ok: true, status: 200, text: async () => 'ok' };
  };
  await withEnv({ MYCA_PROVIDER_ENV: 'test' }, () => nicHealth({ env: 'production' }, fetchFn));
  await withEnv({ MYCA_PROVIDER_ENV: 'live' }, () => nicHealth({ env: 'production' }, fetchFn));
  assert.ok(seen[0].startsWith(IRP_HOSTS.sandbox), seen[0]);
  assert.ok(seen[1].startsWith(IRP_HOSTS.production), seen[1]);
});

test('in test mode sandbox actions run, and actions without a sandbox are held as dry runs', async () => {
  const state = createState();
  const calls = [];
  const execute = async () => {
    calls.push(1);
    return { ok: true };
  };
  const read = await withEnv({ MYCA_PROVIDER_ENV: 'test' }, () => performExternalAction(state, { actionId: 'sandbox_status', clientId: 'self', params: {}, actor: maker }, execute));
  assert.equal(read.ok, true);
  assert.equal(calls.length, 1);
  const held = await withEnv({ MYCA_PROVIDER_ENV: 'test' }, () => performExternalAction(state, { actionId: 'notification_send', clientId: 'self', params: { messageId: 'm1' }, actor: maker }, execute));
  assert.equal(held.ok, false);
  assert.equal(held.error, 'TEST_MODE_HELD');
  assert.match(held.hint, /Test mode/);
  assert.equal(calls.length, 1);
  assert.equal(state.dryRuns.at(-1).actionId, 'notification_send');
});

test('no message reaches a real person outside live mode', async () => {
  const state = createState();
  state.outbox = [{ id: 'm1', channel: 'sms', to: '+919800000000', body: 'hello', status: 'queued' }];
  const out = await withEnv({ MYCA_PROVIDER_ENV: 'test' }, () => sendNotification(state, 'm1', { mock: false }));
  assert.equal(out.error, 'LIVE_CALLS_DISABLED');
  assert.equal(state.outbox[0].status, 'queued');
});

test('the Terraform placeholder is not a Quicko key', async () => {
  await withEnv({ MYCA_PROVIDER_ENV: 'test', MYCA_GSP_TEST_API_KEY: 'unset' }, () => {
    const client = new SandboxClient({ saved: {} });
    assert.equal(client.apiKey, '');
  });
});
