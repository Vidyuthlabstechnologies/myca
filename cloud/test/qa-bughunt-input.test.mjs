import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers.mjs';

let api;

before(async () => {
  api = await startApi();
});

after(async () => {
  await api.close();
});

function crashFree(r) {
  assert.notEqual(r.status, 500, `answered 500: ${r.text}`);
}

test('a NUL character in a name, a device label, a chat message or an upload is not a 500', async () => {
  const otp = await api.call('POST', '/v1/auth/otp', { body: { phone: '9876502001' } });
  const verified = await api.call('POST', '/v1/auth/verify', { body: { challengeId: otp.body.challengeId, phone: '9876502001', code: api.sender.last().code, deviceLabel: 'Pixel\u00008' } });
  crashFree(verified);
  assert.equal(verified.status, 200);
  const label = await api.db.query('select label from devices where user_id = $1', [verified.body.user.id]);
  assert.equal(label.rows[0].label, 'Pixel8');

  const owner = await api.ownerWithBusiness('9876502002');
  const named = await api.call('PATCH', '/v1/me', { token: owner.token, body: { name: 'Asha\u0000 Rao' } });
  crashFree(named);
  assert.equal(named.body.name, 'Asha Rao');

  const company = await api.call('POST', `/v1/businesses/${owner.businessId}/company`, { token: owner.token, body: { name: 'Asha\u0000 Traders' } });
  crashFree(company);

  const created = await api.call('POST', '/v1/businesses', { token: owner.token, body: { name: 'Nul\u0000 Stores', state: '29' } });
  crashFree(created);
  assert.equal(created.body.business.name, 'Nul Stores');

  const upload = await api.call('POST', `/v1/businesses/${owner.businessId}/uploads`, { token: owner.token, body: { name: 'bank.csv', content: 'date,amount\u0000\n2026-04-01,100\n' } });
  crashFree(upload);

  const asked = await api.call('POST', `/v1/businesses/${owner.businessId}/ask`, { token: owner.token, body: { message: 'what is my\u0000 cash' } });
  crashFree(asked);
});

test('a field sent as an object with its own toString key is a wrong value, not a 500', async () => {
  const owner = await api.ownerWithBusiness('9876502003');
  const odd = { toString: 1 };
  const cases = [
    ['POST', '/v1/businesses', { name: odd, state: '29' }],
    ['PATCH', `/v1/businesses/${owner.businessId}/members/${owner.user.id}`, { role: odd }],
    ['POST', `/v1/businesses/${owner.businessId}/propose`, { name: odd }],
    ['POST', `/v1/businesses/${owner.businessId}/query`, { name: odd }],
    ['POST', `/v1/businesses/${owner.businessId}/confirm`, { token: odd }],
    ['POST', `/v1/businesses/${owner.businessId}/ca-sync`, { mode: odd }],
    ['POST', `/v1/businesses/${owner.businessId}/gstin-check`, { gstin: odd }],
    ['POST', `/v1/businesses/${owner.businessId}/ewaybill`, { op: odd }],
    ['POST', `/v1/businesses/${owner.businessId}/gst-portal`, { step: odd }],
    ['POST', `/v1/businesses/${owner.businessId}/quicko-session`, { portal: odd, pan: odd }],
    ['POST', `/v1/businesses/${owner.businessId}/subscription`, { productId: odd }],
    ['POST', `/v1/businesses/${owner.businessId}/us-waitlist`, { product: odd }],
    ['POST', '/v1/me/privacy-requests', { kind: odd }],
    ['POST', '/v1/me/referral/claim', { code: odd }],
    ['POST', '/v1/me/us-consents', { document: odd }],
    ['POST', '/v1/businesses', { name: 'Fine', state: '29', nested: { valueOf: { toString: 2 } } }],
  ];
  for (const [method, path, body] of cases) {
    const r = await api.call(method, path, { token: owner.token, body });
    crashFree(r);
  }
  const crashes = await api.db.query("select count(*)::int as n from crash_reports where kind = 'server'");
  assert.equal(crashes.rows[0].n, 0);
});
