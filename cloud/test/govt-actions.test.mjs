import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, generateKeyPairSync, createCipheriv } from 'node:crypto';
import { clearNicSession } from '../../platform/src/nic-client.mjs';
import { startApi } from './helpers.mjs';

const KEY = 'connector-key-for-tests-0123456789abcdef0123456789';
const SEK = randomBytes(32).toString('base64');
const PEM = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } }).publicKey;
const calls = [];
const realFetch = globalThis.fetch;

function aesEcb(obj) {
  const cipher = createCipheriv('aes-256-ecb', Buffer.from(SEK, 'base64'), null);
  return Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]).toString('base64');
}

function fakeProviders(url, init) {
  const text = String(url);
  calls.push(text);
  if (text.includes('/eivital/v1.04/auth')) return new Response(JSON.stringify({ Status: 1, Data: { AuthToken: 'NIC-TOKEN', Sek: SEK, TokenExpiry: new Date(Date.now() + 3600000).toISOString() } }), { status: 200 });
  if (text.includes('/eicore/v1.03/Invoice')) return new Response(JSON.stringify({ Status: 1, Data: aesEcb({ Irn: (text.includes('gstsandbox') ? 'SANDBOXIRN' : 'LIVEIRN').padEnd(64, '0'), AckNo: 112610000000001, AckDt: '2026-11-05 10:00:00', SignedQRCode: 'qr' }) }), { status: 200 });
  return new Response(JSON.stringify({ message: 'no route' }), { status: 404 });
}

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
let owner;
let accountant;
let n = 0;
before(async () => {
  globalThis.fetch = async (url, init) => (String(url).startsWith('http://127.0.0.1') || String(url).startsWith('http://localhost') ? realFetch(url, init) : fakeProviders(url, init));
  api = await startApi({ connectorKey: KEY });
  owner = await api.ownerWithBusiness('+919400000071', { name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN' });
  const invited = await api.call('POST', `/v1/businesses/${owner.businessId}/invitations`, { token: owner.token, body: { phone: '+919400000072', role: 'accountant' } });
  assert.equal(invited.status, 200, invited.text);
  const ravi = await api.signIn('+919400000072');
  const accepted = await api.call('POST', `/v1/invitations/${invited.body.invitation.id}/accept`, { token: ravi.accessToken });
  assert.equal(accepted.status, 200, accepted.text);
  accountant = { token: ravi.accessToken, businessId: owner.businessId };
});
after(async () => {
  await api.close();
  globalThis.fetch = realFetch;
});
beforeEach(() => {
  calls.length = 0;
  clearNicSession();
});

const post = (who, action, body) => api.call('POST', `/v1/businesses/${who.businessId}/${action}`, { token: who.token, body });
const get = (who, action) => api.call('GET', `/v1/businesses/${who.businessId}/${action}`, { token: who.token });

async function b2bSale() {
  n += 1;
  const held = await post(owner, 'propose', { name: 'create_invoice', args: { partyName: `Retail Mart ${n}`, partyGstin: '27AAACH7409R1Z1', lines: [{ description: 'Fabric', hsn: '5208', qty: 1, rate: 1000 * n, gstRate: 5 }] } });
  assert.equal(held.status, 200, held.text);
  const posted = await post(owner, 'confirm', { token: held.body.preview.token });
  assert.equal(posted.body.posted, true, posted.text);
  const books = await api.books(owner.businessId);
  return books.invoices.at(-1).id;
}

const nicKeys = (environment) => ({ channel: 'nic', clientId: 'NIC-CLIENT', clientSecret: 'nic-secret', username: 'apiuser', password: 'P@ss', gstin: '27AABCU9603R1ZN', publicKeyPem: PEM.replace(/\n/g, ' '), environment });

test('test mode: the business\'s own NIC sandbox keys issue a sandbox IRN with no approval, never on the production IRP', async () => {
  await withEnv({ MYCA_PROVIDER_ENV: 'test', MYCA_MOCK_MODE: '0' }, async () => {
    const invoiceId = await b2bSale();
    const missing = await post(owner, 'einvoice', { invoiceId });
    assert.equal(missing.body.error, 'NIC_NOT_CONNECTED');
    const saved = await post(owner, 'connectors', nicKeys('production'));
    assert.equal(saved.status, 200, saved.text);
    assert.equal(saved.body.mode, 'live');
    assert.equal(saved.body.password, 'set');
    const out = await post(owner, 'einvoice', { invoiceId });
    assert.equal(out.status, 200, out.text);
    assert.equal(out.body.ok, true, out.text);
    assert.equal(out.body.mode, 'test');
    assert.equal(out.body.chosenMode, 'live');
    assert.equal(out.body.sandbox, true);
    assert.ok(calls.length > 0 && calls.every((url) => url.includes('gstsandbox.nic.in')), calls.join(' '));
    const inv = (await api.books(owner.businessId)).invoices.find((i) => i.id === invoiceId);
    assert.equal(inv.sandboxIrn, 'SANDBOXIRN'.padEnd(64, '0'));
    assert.equal(inv.irn, undefined);
    assert.ok(!JSON.stringify(out.body).includes('nic-secret'));
  });
});

test('live mode: the owner\'s switch sends it to the production IRP only after someone else approves', async () => {
  await withEnv({ MYCA_PROVIDER_ENV: 'live', MYCA_MOCK_MODE: '0' }, async () => {
    await post(owner, 'connectors', nicKeys('production'));
    const invoiceId = await b2bSale();
    const blocked = await post(owner, 'einvoice', { invoiceId });
    assert.equal(blocked.body.error, 'APPROVAL_REQUIRED', blocked.text);
    assert.equal(calls.length, 0);

    const asked = await post(owner, 'approvals', { operation: 'einvoice', invoiceId });
    assert.equal(asked.body.ok, true, asked.text);
    const approvalId = asked.body.approval.approvalId;
    const self = await post(owner, 'approvals', { approvalId, decision: 'approve' });
    assert.equal(self.body.error, 'MAKER_CHECKER_VIOLATION');
    const approved = await post(accountant, 'approvals', { approvalId, decision: 'approve' });
    assert.equal(approved.body.approval.status, 'approved', approved.text);
    const list = await get(owner, 'approvals');
    assert.equal(list.body.approvals[0].approvalId, approvalId);

    const issued = await post(owner, 'einvoice', { invoiceId });
    assert.equal(issued.body.ok, true, issued.text);
    assert.equal(issued.body.mode, 'live');
    assert.ok(calls.some((url) => url.startsWith('https://einvoice1.gst.gov.in')), calls.join(' '));
    const inv = (await api.books(owner.businessId)).invoices.find((i) => i.id === invoiceId);
    assert.equal(inv.irn, 'LIVEIRN'.padEnd(64, '0'));

    await post(owner, 'connectors', { channel: 'nic', environment: 'sandbox' });
    calls.length = 0;
    clearNicSession();
    const next = await b2bSale();
    const sandbox = await post(owner, 'einvoice', { invoiceId: next });
    assert.equal(sandbox.body.ok, true, sandbox.text);
    assert.equal(sandbox.body.mode, 'test');
    assert.ok(calls.every((url) => url.includes('gstsandbox.nic.in')), calls.join(' '));
  });
});

test('the GSTIN check uses the business\'s Quicko key on the test host in test mode, and other requests make no calls', async () => {
  await withEnv({ MYCA_PROVIDER_ENV: 'live', MYCA_MOCK_MODE: '0' }, async () => {
    const saved = await post(owner, 'connectors', { channel: 'quicko', apiKey: 'key_test_123', apiSecret: 'secret_test_456', environment: 'sandbox' });
    assert.equal(saved.status, 200, saved.text);
    const out = await post(owner, 'gstin-check', { gstin: '27AAACH7409R1Z1' });
    assert.equal(out.status, 200, out.text);
    assert.equal(out.body.mode, 'test');
    assert.ok(calls.length > 0 && calls.every((url) => url.startsWith('https://test-api.sandbox.co.in')), calls.join(' '));
    assert.equal((await api.call('GET', '/v1/health')).body.providerMode, 'live');
    calls.length = 0;
    const chat = await post(owner, 'ask', { message: 'check sandbox status' });
    assert.equal(chat.status, 200, chat.text);
    assert.equal(calls.length, 0, calls.join(' '));
  });
});
