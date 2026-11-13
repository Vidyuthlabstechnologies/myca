import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SandboxClient, clearIrpSessions } from '../src/sandbox-client.mjs';
import { clearNicSession, encryptPayload, nicGetIrn, nicSession } from '../src/nic-client.mjs';

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

function fakeIrp() {
  const calls = [];
  const state = { refuse: false };
  let sek = '';
  const fetchFn = async (url, opts) => {
    const signIn = url.endsWith('/eivital/v1.04/auth');
    calls.push({ signIn, token: opts.headers.AuthToken || '' });
    if (signIn) {
      if (state.refuse) return { ok: true, status: 200, text: async () => JSON.stringify({ Status: 0, ErrorDetails: [{ ErrorCode: '1005', ErrorMessage: 'Invalid Token' }] }) };
      sek = randomBytes(32).toString('base64');
      return { ok: true, status: 200, text: async () => JSON.stringify({ Status: 1, Data: { AuthToken: 'token-of-alpha', Sek: sek, TokenExpiry: new Date(Date.now() + 3600000).toISOString() } }) };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ Status: 1, Data: encryptPayload({ Irn: 'IRN-X' }, sek) }) };
  };
  return { calls, state, fetchFn };
}

test('a direct NIC session is never used for a caller who gives another password or client secret', async () => {
  clearNicSession();
  const dir = mkdtempSync(join(tmpdir(), 'myca-nic-held-'));
  const before = process.env.APPDATA;
  process.env.APPDATA = dir;
  try {
    const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
    const { saveNicPublicKey } = await import('../src/nic-config.mjs');
    saveNicPublicKey(publicKey);
    const alpha = { env: 'sandbox', clientId: 'client-1', clientSecret: 'cs', username: 'alpha', password: 'p', gstin: GSTIN };
    const irp = fakeIrp();
    assert.equal((await nicGetIrn('IRN-X', alpha, irp.fetchFn, { allowLive: true })).ok, true);
    assert.equal(nicSession(alpha).active, true);
    assert.equal(nicSession({ ...alpha, password: 'a-guess' }).active, false);
    assert.equal(nicSession({ ...alpha, clientSecret: 'a-guess' }).active, false);
    assert.equal(nicSession({ ...alpha, password: '' }).active, false);

    irp.state.refuse = true;
    for (const guess of [{ password: 'a-guess' }, { clientSecret: 'a-guess' }]) {
      const made = irp.calls.length;
      const borrowed = await nicGetIrn('IRN-X', { ...alpha, ...guess }, irp.fetchFn, { allowLive: true });
      assert.equal(borrowed.ok, false, JSON.stringify(borrowed));
      assert.deepEqual(irp.calls.slice(made), [{ signIn: true, token: '' }], 'they are made to sign in, and the owner\'s token is not sent for them');
    }

    const signIns = irp.calls.filter((call) => call.signIn).length;
    assert.equal((await nicGetIrn('IRN-X', alpha, irp.fetchFn, { allowLive: true })).ok, true);
    assert.equal(irp.calls.filter((call) => call.signIn).length, signIns, 'the owner still reuses their own session');
    assert.equal(irp.calls.at(-1).token, 'token-of-alpha');
  } finally {
    process.env.APPDATA = before;
    clearNicSession();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a failed sign-in with a guessed password does not throw away the owner\'s e-invoice session', async () => {
  clearIrpSessions();
  const fake = fakeSandbox({ secretOf: { key_shared: 'secret_shared' }, passwordOf: { alpha_api: 'right-password' } });
  const owner = client(fake, { irpUser: { username: 'alpha_api', password: 'right-password', gstin: GSTIN } });
  assert.equal((await owner.ewbRequest('/gst/compliance/e-way-bill/tax-payer/bill/331001', { method: 'GET' })).ok, true);
  for (let round = 0; round < 3; round += 1) {
    const other = client(fake, { irpUser: { username: 'alpha_api', password: `a-guess-${round}`, gstin: GSTIN } });
    assert.equal((await other.ewbRequest('/gst/compliance/e-way-bill/tax-payer/bill/331001', { method: 'GET' })).ok, false);
  }
  const signIns = fake.calls.filter((call) => call.path.endsWith('/tax-payer/authenticate') && call.body.password === 'right-password').length;
  const again = client(fake, { irpUser: { username: 'alpha_api', password: 'right-password', gstin: GSTIN } });
  assert.equal((await again.ewbRequest('/gst/compliance/e-way-bill/tax-payer/bill/331001', { method: 'GET' })).ok, true);
  assert.equal(fake.calls.filter((call) => call.path.endsWith('/tax-payer/authenticate') && call.body.password === 'right-password').length, signIns);
  clearIrpSessions();
});
