import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { clearIrpSessions } from '../../platform/src/sandbox-client.mjs';
import { startApi } from './helpers.mjs';

const KEY = 'connector-key-for-tests-0123456789abcdef0123456789';
const calls = [];
const hostOf = (url) => new URL(url).host;
const realFetch = globalThis.fetch;

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function fakeProviders(url, init = {}) {
  const text = String(url);
  calls.push(text);
  const target = new URL(text);
  const live = target.host === 'api.sandbox.co.in';
  if (!['api.sandbox.co.in', 'test-api.sandbox.co.in'].includes(target.host)) return reply({ message: 'no route' }, 404);
  if (target.pathname === '/authenticate') return reply({ access_token: 'platform-token', expires_in: 3600 });
  if (target.pathname === '/gst/compliance/e-way-bill/tax-payer/authenticate') return reply({ code: 200, data: { Status: 1, access_token: 'irp-token', expiry: Date.now() + 3600000 } });
  if (target.pathname === '/gst/compliance/e-invoice/tax-payer/invoice') {
    return reply({ code: 200, data: { Status: 1, Data: { Irn: (live ? 'LIVEIRN' : 'SANDBOXIRN').padEnd(64, '0'), AckNo: 112610000000001, AckDt: '2026-11-05 10:00:00', SignedQRCode: 'qr' } } });
  }
  if (target.pathname === '/gst/compliance/e-way-bill/consignor/bill') return reply({ code: 200, data: { alert: null, data: { ewayBillNo: live ? 291010077005 : 991010077005, ewayBillDate: '11/11/2026 05:00:00 PM', validUpto: '12/11/2026 11:59:00 PM' }, status: '1' } });
  if (/\/consignor\/bill\/\d+\/cancel$/.test(target.pathname)) return reply({ code: 200, data: { alert: null, data: { cancelDate: '11/11/2026 07:56:00 PM' }, status: '1' } });
  return reply({ message: 'no route' }, 404);
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
  owner = await api.ownerWithBusiness('+919400000071', { name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', address: 'Plot 4, MIDC, Pune 411019', city: 'Pune', pin: '411019' });
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
  clearIrpSessions();
});

const post = (who, action, body) => api.call('POST', `/v1/businesses/${who.businessId}/${action}`, { token: who.token, body });
const get = (who, action) => api.call('GET', `/v1/businesses/${who.businessId}/${action}`, { token: who.token });

async function b2bSale() {
  n += 1;
  const held = await post(owner, 'propose', { name: 'create_invoice', args: { partyName: `Retail Mart ${n}`, partyGstin: '27AAACH7409R1Z1', partyAddress: '12 FC Road, Pune 411004', lines: [{ description: 'Fabric', hsn: '5208', qty: 1, rate: 1000 * n, gstRate: 5 }] } });
  assert.equal(held.status, 200, held.text);
  const posted = await post(owner, 'confirm', { token: held.body.preview.token });
  assert.equal(posted.body.posted, true, posted.text);
  const books = await api.books(owner.businessId);
  return books.invoices.at(-1).id;
}

const irpUser = (environment) => ({ channel: 'nic', username: 'apiuser', password: 'P@ss', gstin: '27AABCU9603R1ZN', environment });
const quickoKey = (environment) => ({ channel: 'quicko', apiKey: environment === 'production' ? 'key_live_123' : 'key_test_123', apiSecret: 'secret_456', environment });

test('test mode: the e-invoice goes through Quicko on its test host with no approval, and never lands in the real IRN', async () => {
  await withEnv({ MYCA_PROVIDER_ENV: 'test', MYCA_MOCK_MODE: '0' }, async () => {
    const invoiceId = await b2bSale();
    const missing = await post(owner, 'einvoice', { invoiceId });
    assert.equal(missing.body.error, 'NIC_NOT_CONNECTED');
    assert.match(missing.body.hint, /Sandbox by Quicko/);
    const saved = await post(owner, 'connectors', irpUser('production'));
    assert.equal(saved.status, 200, saved.text);
    assert.equal(saved.body.mode, 'live');
    assert.equal(saved.body.password, 'set');
    assert.equal((await post(owner, 'connectors', quickoKey('production'))).status, 200);
    const out = await post(owner, 'einvoice', { invoiceId });
    assert.equal(out.status, 200, out.text);
    assert.equal(out.body.ok, true, out.text);
    assert.equal(out.body.mode, 'test');
    assert.equal(out.body.chosenMode, 'live');
    assert.equal(out.body.provider, 'sandbox');
    assert.ok(calls.length > 0 && calls.every((url) => hostOf(url) === 'test-api.sandbox.co.in'), calls.join(' '));
    const inv = (await api.books(owner.businessId)).invoices.find((i) => i.id === invoiceId);
    assert.equal(inv.sandboxIrn, 'SANDBOXIRN'.padEnd(64, '0'));
    assert.equal(inv.irn, undefined);
    assert.ok(!JSON.stringify(out.body).includes('P@ss'));
  });
});

test('live mode: the owner\'s switch sends the e-invoice to Quicko live only after someone else approves', async () => {
  await withEnv({ MYCA_PROVIDER_ENV: 'live', MYCA_MOCK_MODE: '0' }, async () => {
    await post(owner, 'connectors', irpUser('production'));
    await post(owner, 'connectors', quickoKey('production'));
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
    assert.ok(calls.length > 0 && calls.every((url) => hostOf(url) === 'api.sandbox.co.in'), calls.join(' '));
    const inv = (await api.books(owner.businessId)).invoices.find((i) => i.id === invoiceId);
    assert.equal(inv.irn, 'LIVEIRN'.padEnd(64, '0'));

    await post(owner, 'connectors', { channel: 'nic', environment: 'sandbox' });
    calls.length = 0;
    clearIrpSessions();
    const next = await b2bSale();
    const sandbox = await post(owner, 'einvoice', { invoiceId: next });
    assert.equal(sandbox.body.ok, true, sandbox.text);
    assert.equal(sandbox.body.mode, 'test');
    assert.ok(calls.every((url) => hostOf(url) === 'test-api.sandbox.co.in'), calls.join(' '));
  });
});

test('e-way bill: generated from the invoice through Quicko after approval, then cancelled, all at /ewaybill', async () => {
  await withEnv({ MYCA_PROVIDER_ENV: 'live', MYCA_MOCK_MODE: '0' }, async () => {
    await post(owner, 'connectors', irpUser('production'));
    await post(owner, 'connectors', quickoKey('production'));
    n += 1;
    const held = await post(owner, 'propose', { name: 'create_invoice', args: { partyName: `Gujarat Mills ${n}`, partyGstin: '24AAACF7856R1ZY', partyAddress: '7 Ring Road, Surat 395002', lines: [{ description: 'Cotton cloth', hsn: '5208', qty: 100, rate: 1000, gstRate: 5 }] } });
    assert.equal(held.status, 200, held.text);
    assert.equal((await post(owner, 'confirm', { token: held.body.preview.token })).body.posted, true);
    const invoiceId = (await api.books(owner.businessId)).invoices.at(-1).id;
    const transport = await post(owner, 'propose', { name: 'set_transport', args: { invoiceId, vehicleNo: 'MH12AB1234', distanceKm: 260 } });
    assert.equal(transport.status, 200, transport.text);
    assert.equal((await post(owner, 'confirm', { token: transport.body.preview.token })).status, 200);

    assert.equal((await post(owner, 'ewaybill', { op: 'teleport', invoiceId })).body.error, 'UNKNOWN_EWB_OP');
    const blocked = await post(owner, 'ewaybill', { op: 'generate', invoiceId });
    assert.equal(blocked.body.error, 'APPROVAL_REQUIRED', blocked.text);
    assert.equal(calls.length, 0);
    const asked = await post(owner, 'approvals', { operation: 'ewaybill_generate', invoiceId });
    assert.equal(asked.body.ok, true, asked.text);
    assert.equal((await post(accountant, 'approvals', { approvalId: asked.body.approval.approvalId, decision: 'approve' })).body.approval.status, 'approved');
    const out = await post(owner, 'ewaybill', { op: 'generate', invoiceId });
    assert.equal(out.body.ok, true, out.text);
    assert.equal(out.body.data.ewbNo, '291010077005');
    assert.equal(out.body.data.via, 'invoice');
    assert.ok(calls.some((url) => url.endsWith('/gst/compliance/e-way-bill/consignor/bill')), calls.join(' '));
    assert.ok(calls.every((url) => hostOf(url) === 'api.sandbox.co.in'), calls.join(' '));
    let inv = (await api.books(owner.businessId)).invoices.find((i) => i.id === invoiceId);
    assert.equal(inv.ewbNo, '291010077005');

    const cancelAsk = await post(owner, 'approvals', { operation: 'ewaybill_cancel', invoiceId, reasonCode: 2 });
    assert.equal(cancelAsk.body.ok, true, cancelAsk.text);
    await post(accountant, 'approvals', { approvalId: cancelAsk.body.approval.approvalId, decision: 'approve' });
    const cancelled = await post(owner, 'ewaybill', { op: 'cancel', invoiceId, reasonCode: 2 });
    assert.equal(cancelled.body.ok, true, cancelled.text);
    inv = (await api.books(owner.businessId)).invoices.find((i) => i.id === invoiceId);
    assert.equal(inv.ewbNo, undefined);
    assert.equal(inv.ewbHistory[0].ewbNo, '291010077005');
  });
});

test('the GSTIN check uses the business\'s Quicko key on the test host in test mode, and other requests make no calls', async () => {
  await withEnv({ MYCA_PROVIDER_ENV: 'live', MYCA_MOCK_MODE: '0' }, async () => {
    const saved = await post(owner, 'connectors', { channel: 'quicko', apiKey: 'key_test_123', apiSecret: 'secret_test_456', environment: 'sandbox' });
    assert.equal(saved.status, 200, saved.text);
    const out = await post(owner, 'gstin-check', { gstin: '27AAACH7409R1Z1' });
    assert.equal(out.status, 200, out.text);
    assert.equal(out.body.mode, 'test');
    assert.ok(calls.length > 0 && calls.every((url) => hostOf(url) === 'test-api.sandbox.co.in'), calls.join(' '));
    assert.equal((await api.call('GET', '/v1/health')).body.providerMode, 'live');
    calls.length = 0;
    const chat = await post(owner, 'ask', { message: 'check sandbox status' });
    assert.equal(chat.status, 200, chat.text);
    assert.equal(calls.length, 0, calls.join(' '));
  });
});
