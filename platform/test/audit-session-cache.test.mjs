import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SandboxClient, clearIrpSessions } from '../src/sandbox-client.mjs';
import { nicSessionKey } from '../src/nic-client.mjs';

const BASE = 'https://test-api.sandbox.co.in';
const GSTIN = '29ABCDE1234F1Z5';
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function fakeSandbox({ secretOf, passwordOf }) {
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    const path = String(url).slice(BASE.length);
    const headers = init.headers || {};
    const body = init.body ? JSON.parse(init.body) : {};
    calls.push({ path, key: headers['x-api-key'], authorization: headers.authorization || '', body });
    if (path === '/authenticate') {
      return secretOf[headers['x-api-key']] === headers['x-api-secret']
        ? json(200, { access_token: `platform-token-of-${headers['x-api-key']}`, expires_in: 3600 })
        : json(401, { message: 'Invalid API credentials' });
    }
    if (path.endsWith('/tax-payer/authenticate')) {
      return passwordOf[body.username] === body.password
        ? json(200, { data: { Status: 1, access_token: `taxpayer-token-of-${body.username}`, expiry: Date.now() + 3600000 } })
        : json(200, { data: { Status: 0, ErrorDetails: [{ ErrorCode: '238', ErrorMessage: 'Invalid login credentials' }] } });
    }
    return json(200, { data: { Status: 1, ewbNo: 331001, seenWith: headers.authorization || '' } });
  };
  return { calls, fetchFn };
}

const client = (fake, { apiKey = 'key_shared', apiSecret = 'secret_shared', irpUser }) => new SandboxClient({ apiKey, apiSecret, environment: 'test', baseUrl: BASE, fetchFn: fake.fetchFn, irpUser });

test('an e-invoice session is never handed to a caller who gives the same GSTIN and user name with another password', async () => {
  clearIrpSessions();
  const fake = fakeSandbox({ secretOf: { key_shared: 'secret_shared' }, passwordOf: { alpha_api: 'right-password' } });
  const owner = client(fake, { irpUser: { username: 'alpha_api', password: 'right-password', gstin: GSTIN } });
  const first = await owner.ewbRequest('/gst/compliance/e-way-bill/tax-payer/bill/331001', { method: 'GET' });
  assert.equal(first.ok, true, JSON.stringify(first));

  const other = client(fake, { irpUser: { username: 'alpha_api', password: 'a-guess', gstin: GSTIN } });
  const before = fake.calls.length;
  const borrowed = await other.ewbRequest('/gst/compliance/e-way-bill/tax-payer/bill/331001', { method: 'GET' });
  assert.equal(borrowed.ok, false, 'the caller without the password is refused');
  const made = fake.calls.slice(before);
  assert.equal(made.some((call) => call.authorization === 'taxpayer-token-of-alpha_api'), false, 'the owner\'s session token is not sent for them');
  assert.equal(made.some((call) => call.path.endsWith('/tax-payer/authenticate') && call.body.password === 'a-guess'), true, 'they are made to sign in with their own password');

  const again = client(fake, { irpUser: { username: 'alpha_api', password: 'right-password', gstin: GSTIN } });
  const signIns = fake.calls.filter((call) => call.path.endsWith('/tax-payer/authenticate')).length;
  assert.equal((await again.ewbRequest('/gst/compliance/e-way-bill/tax-payer/bill/331001', { method: 'GET' })).ok, true);
  assert.equal(fake.calls.filter((call) => call.path.endsWith('/tax-payer/authenticate')).length, signIns, 'the owner still reuses their own session');
  clearIrpSessions();
});

test('a Sandbox platform token is never handed to a caller who gives the same API key with another secret', async () => {
  const fake = fakeSandbox({ secretOf: { key_of_alpha: 'secret_of_alpha' }, passwordOf: {} });
  const owner = client(fake, { apiKey: 'key_of_alpha', apiSecret: 'secret_of_alpha' });
  assert.equal((await owner.request('/gst/compliance/public/gstin/search', { body: { gstin: GSTIN } })).ok, true);

  const other = client(fake, { apiKey: 'key_of_alpha', apiSecret: 'a-guess' });
  const before = fake.calls.length;
  const borrowed = await other.request('/gst/compliance/public/gstin/search', { body: { gstin: GSTIN } });
  assert.equal(borrowed.ok, false, JSON.stringify(borrowed));
  const made = fake.calls.slice(before);
  assert.equal(made.some((call) => call.authorization === 'platform-token-of-key_of_alpha'), false, 'the owner\'s platform token is not sent for them');

  const again = client(fake, { apiKey: 'key_of_alpha', apiSecret: 'secret_of_alpha' });
  const signIns = fake.calls.filter((call) => call.path === '/authenticate').length;
  assert.equal((await again.request('/gst/compliance/public/gstin/search', { body: { gstin: GSTIN } })).ok, true);
  assert.equal(fake.calls.filter((call) => call.path === '/authenticate').length, signIns, 'the owner still reuses their own token');
});

test('a direct NIC session is kept apart by password and client secret as well as by client, user and GSTIN', () => {
  const alpha = { env: 'sandbox', clientId: 'client-1', clientSecret: 'cs', username: 'alpha', password: 'p', gstin: GSTIN };
  const keys = new Set([
    nicSessionKey(alpha),
    nicSessionKey({ ...alpha, password: 'a-guess' }),
    nicSessionKey({ ...alpha, clientSecret: 'a-guess' }),
    nicSessionKey({ ...alpha, username: 'other' }),
    nicSessionKey({ ...alpha, gstin: '27AABCU9603R1ZN' }),
  ]);
  assert.equal(keys.size, 5);
  assert.equal(nicSessionKey(alpha), nicSessionKey({ ...alpha }));
  assert.match(nicSessionKey(alpha), /^[a-f0-9]{64}$/);
});
