import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guardedFetch, runSmoke } from '../src/sandbox-smoke.mjs';

const KEYS = {
  MYCA_GSP_TEST_API_KEY: 'key_test_smoke',
  MYCA_GSP_TEST_API_SECRET: 'secret_test_smoke',
  MYCA_SMOKE_IRP_USER: 'irp_user',
  MYCA_SMOKE_IRP_PASSWORD: 'irp_pass',
  MYCA_SMOKE_IRP_GSTIN: '27AABCU9603R1ZN',
  MYCA_STRIPE_TEST_SECRET_KEY: 'sk_test_smoke',
  MYCA_SMOKE_PLAID_CLIENT_ID: 'plaid-client',
  MYCA_SMOKE_PLAID_SECRET: 'plaid-secret',
  MYCA_SMOKE_GUSTO_ACCESS_TOKEN: 'gusto-token',
  MYCA_SMOKE_TAXJAR_TOKEN: 'taxjar-token',
  MYCA_WAHA_URL: 'https://waha.myca.example',
  MYCA_WAHA_API_KEY: 'waha-key',
  NVIDIA_NIM_API_KEY: 'nvapi-smoke',
  MYCA_US_FILER_TEST_BASE_URL: 'https://sandbox.partner.example',
  MYCA_US_FILER_TEST_API_KEY: 'partner-key',
};

const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function fakeSandboxes(seen) {
  return async (url, init = {}) => {
    const u = new URL(String(url));
    seen.push({ host: u.hostname, path: u.pathname, body: init.body ? String(init.body) : '' });
    if (u.hostname === 'test-api.sandbox.co.in') {
      if (u.pathname === '/authenticate') return reply(200, { access_token: 'platform-token', expires_in: 3600 });
      if (u.pathname.endsWith('/public/gstin/search')) return reply(200, { data: { data: { lgnm: 'Sample Traders', sts: 'Active' } } });
      if (u.pathname.endsWith('/e-way-bill/tax-payer/authenticate')) return reply(200, { data: { Status: 1, access_token: 'irp-token', expiry: Date.now() + 3600_000 } });
      if (u.pathname.endsWith('/e-invoice/tax-payer/invoice')) return reply(200, { data: { Status: 1, Data: { Irn: 'a'.repeat(64), AckNo: 1 } } });
    }
    if (u.hostname === 'api.stripe.com') return reply(200, { object: 'balance', livemode: false });
    if (u.hostname === 'sandbox.plaid.com') {
      if (u.pathname === '/sandbox/public_token/create') return reply(200, { public_token: 'public-sandbox-1' });
      if (u.pathname === '/item/public_token/exchange') return reply(200, { access_token: 'access-sandbox-1' });
      if (u.pathname === '/transactions/sync') return reply(200, { added: [{ date: '2026-11-01', amount: 12 }], next_cursor: 'c', has_more: false });
    }
    if (u.hostname === 'api.gusto-demo.com') return reply(200, { resource: { uuid: 'demo-company' } });
    if (u.hostname === 'api.sandbox.taxjar.com') return reply(200, { rate: { combined_rate: '0.1025' } });
    if (u.hostname === 'waha.myca.example') return reply(200, { name: 'default', status: 'WORKING' });
    if (u.hostname === 'integrate.api.nvidia.com') return reply(200, { data: [{ id: 'meta/llama' }] });
    if (u.hostname === 'sandbox.partner.example') return reply(200, { ok: true });
    return reply(404, {});
  };
}

test('every integration passes its sandbox smoke check against sandbox hosts only', async () => {
  const seen = [];
  const out = await runSmoke(KEYS, { fetchFn: fakeSandboxes(seen) });
  for (const r of out.results) assert.equal(r.status, 'passed', `${r.id}: ${r.detail}`);
  assert.equal(out.ok, true);
  assert.deepEqual(out.results.map((r) => r.id), ['quicko', 'nic-einvoice-rcm', 'stripe', 'plaid', 'gusto', 'taxjar', 'waha', 'ai-model', 'us-filer']);
  const irn = seen.find((s) => s.path.endsWith('/e-invoice/tax-payer/invoice'));
  const payload = JSON.parse(irn.body);
  assert.equal(payload.TranDtls.RegRev, 'Y', 'the IRN request is a reverse charge self-invoice');
  assert.ok(!seen.some((s) => s.host === 'api.sandbox.co.in' || s.host === 'production.plaid.com'), 'no production host was called');
});

test('without keys every check is skipped, not passed', async () => {
  const out = await runSmoke({}, { fetchFn: async () => { throw new Error('nothing should be called'); } });
  assert.ok(out.results.every((r) => r.status === 'skipped'));
});

test('a live key anywhere stops the smoke run before anything is sent', async () => {
  let calls = 0;
  const out = await runSmoke({ ...KEYS, MYCA_GSP_TEST_API_KEY: 'key_live_oops' }, { fetchFn: async () => { calls += 1; return reply(200, {}); } });
  assert.equal(out.ok, false);
  assert.match(out.refused, /MYCA_GSP_TEST_API_KEY/);
  assert.equal(calls, 0);
});

test('the request guard refuses production and unknown hosts', async () => {
  const fetch = guardedFetch(async () => reply(200, {}));
  await assert.rejects(fetch('https://api.sandbox.co.in/authenticate'), /production host/);
  await assert.rejects(fetch('https://production.plaid.com/x'), /production host/);
  await assert.rejects(fetch('https://evil.example/x'), /not a known sandbox host/);
  assert.equal((await fetch('https://sandbox.plaid.com/x')).status, 200);
});

test('a failing sandbox is reported as failed with its reason', async () => {
  const out = await runSmoke({ MYCA_STRIPE_TEST_SECRET_KEY: 'sk_test_x' }, { fetchFn: async () => reply(401, { error: { message: 'Invalid API Key provided' } }) });
  const stripe = out.results.find((r) => r.id === 'stripe');
  assert.equal(stripe.status, 'failed');
  assert.match(stripe.detail, /401 Invalid API Key/);
  assert.equal(out.ok, false);
});

test('the API runs the smoke test nightly with the keys it holds, only in test mode and only with the job token', async () => {
  const { startApi } = await import('./helpers.mjs');
  const { JOB_HEADER } = await import('../src/jobs.mjs');
  const seen = [];
  const api = await startApi({ jobToken: 'job-token-for-smoke-0123456789abcdef', smokeFetch: fakeSandboxes(seen) });
  const saved = { ...process.env };
  try {
    const run = (headers) => api.call('POST', '/v1/jobs/sandbox-smoke', { headers });
    assert.equal((await run({})).status, 404, 'without the job token it does not exist');
    Object.assign(process.env, { MYCA_PROVIDER_ENV: 'test', MYCA_MOCK_MODE: '0', MYCA_GSP_API_KEY: 'key_test_server', MYCA_GSP_API_SECRET: 'secret_test_server' });
    const out = await run({ [JOB_HEADER]: 'job-token-for-smoke-0123456789abcdef' });
    assert.equal(out.status, 200, out.text);
    assert.equal(out.body.passed, true, out.text);
    assert.equal(out.body.results.find((r) => r.id === 'quicko').status, 'passed', 'the server\'s own test key is used');
    assert.equal(out.body.results.find((r) => r.id === 'plaid').status, 'skipped');
    assert.ok(seen.every((s) => s.host !== 'api.sandbox.co.in'));
    assert.ok(api.logs.some((l) => l.job === 'sandbox-smoke' && /passed/.test(l.quicko)), 'the result is in the log');
    assert.ok(!JSON.stringify(api.logs).includes('key_test_server'), 'no key is logged');

    process.env.MYCA_PROVIDER_ENV = 'live';
    seen.length = 0;
    const live = await run({ [JOB_HEADER]: 'job-token-for-smoke-0123456789abcdef' });
    assert.match(live.body.skipped, /runs in live mode/);
    assert.equal(seen.length, 0, 'nothing is called while live');
  } finally {
    for (const key of ['MYCA_PROVIDER_ENV', 'MYCA_MOCK_MODE', 'MYCA_GSP_API_KEY', 'MYCA_GSP_API_SECRET']) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
    await api.close();
  }
});
