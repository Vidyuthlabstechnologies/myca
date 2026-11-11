import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers.mjs';

const KEY = 'connector-key-for-tests-0123456789abcdef0123456789';
let api;
let owner;
const signIns = [];

async function fakeSandbox(url, init = {}) {
  const path = new URL(String(url)).pathname;
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
  if (path === '/authenticate') return new Response(JSON.stringify({ code: 200, data: { access_token: 'PLATFORM-TOKEN' } }), { status: 200 });
  if (path === '/it/compliance/portal/tax-payer/authorize') {
    signIns.push(body.pan);
    return new Response(JSON.stringify({ code: 401, message: 'Invalid credentials' }), { status: 400 });
  }
  if (path === '/bank/IFSC0000001') return new Response(JSON.stringify({ code: 200, data: { bank: 'TEST BANK' } }), { status: 200 });
  return new Response(JSON.stringify({ code: 200, data: {} }), { status: 200 });
}

const saved = {};
before(async () => {
  for (const [name, value] of Object.entries({ MYCA_PROVIDER_ENV: 'test', MYCA_MOCK_MODE: '0', MYCA_GSP_API_KEY: 'key_test_service', MYCA_GSP_API_SECRET: 'secret_test_service', MYCA_GSP_ENV: 'test' })) {
    saved[name] = process.env[name];
    process.env[name] = value;
  }
  api = await startApi({
    connectorKey: KEY,
    gspFetch: fakeSandbox,
    rateLimits: { quickoBusiness: { max: 3, windowSeconds: 3600 }, quickoUser: { max: 3, windowSeconds: 3600 }, portalSignInBusiness: { max: 4, windowSeconds: 3600 }, portalSignInSubject: { max: 2, windowSeconds: 3600 } },
  });
  owner = await api.ownerWithBusiness('+919400000093', { name: 'Asha Traders', gstin: '29AABCU9603R1ZJ', state: '29' });
});
after(async () => {
  await api.close();
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

const post = (action, body) => api.call('POST', `/v1/businesses/${owner.businessId}/${action}`, { token: owner.token, body });

test('Quicko lookups stop with 429 once the business uses up its hourly allowance', async () => {
  for (let i = 0; i < 3; i += 1) {
    const out = await post('quicko', { tool: 'lookup_ifsc', args: { ifsc: 'IFSC0000001' } });
    assert.equal(out.status, 200, out.text);
  }
  const over = await post('quicko', { tool: 'lookup_ifsc', args: { ifsc: 'IFSC0000001' } });
  assert.equal(over.status, 429, over.text);
  assert.equal(over.body.error, 'RATE_LIMITED');
  assert.ok(over.body.retryAfterSeconds > 0);
});

test('failed portal sign-ins are capped per PAN and per business, and signing out is never blocked', async () => {
  for (let i = 0; i < 2; i += 1) {
    const out = await post('quicko-session', { portal: 'itd', pan: 'ABCDE1234F', password: `guess-${i}` });
    assert.equal(out.body.ok, false, out.text);
  }
  const samePan = await post('quicko-session', { portal: 'itd', pan: 'abcde1234f', password: 'guess-3' });
  assert.equal(samePan.status, 429, samePan.text);
  assert.deepEqual(signIns, ['ABCDE1234F', 'ABCDE1234F']);
  const other = await post('quicko-session', { portal: 'itd', pan: 'PQRSX6789K', password: 'guess' });
  assert.notEqual(other.status, 429, other.text);
  assert.equal(other.body.ok, false, other.text);
  const fourth = await post('quicko-session', { portal: 'itd', pan: 'LMNOP4321Z', password: 'guess' });
  assert.equal(fourth.status, 429, fourth.text);
  const out = await post('quicko-session', { portal: 'itd', step: 'disconnect' });
  assert.equal(out.body.disconnected, true, out.text);
});
