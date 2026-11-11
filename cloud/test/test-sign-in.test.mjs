import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers.mjs';
import { testSignInFromEnv } from '../src/test-sign-in.mjs';
import { PRIVACY_NOTICE } from '../src/consent.mjs';

const started = [];
after(async () => { for (const api of started) await api.close(); });

async function boot(options) {
  const api = await startApi(options);
  started.push(api);
  return api;
}

async function signInWith(api, phone, code) {
  const otp = await api.call('POST', '/v1/auth/otp', { body: { phone } });
  if (otp.status !== 200) return otp;
  return api.call('POST', '/v1/auth/verify', { body: { challengeId: otp.body.challengeId, phone, code, deviceLabel: 'reviewer phone' } });
}

test('staging test phones accept the fixed code without any SMS, and nobody else does', async () => {
  const testSignIn = testSignInFromEnv({ MYCA_TEST_PHONES: '+919400000001, 9400000002', MYCA_TEST_CODE: '480213' }, 'staging');
  assert.equal(testSignIn.problem, '');
  const api = await boot({ phone: false, testSignIn, environment: 'staging' });
  const methods = await api.call('GET', '/v1/auth/methods');
  assert.equal(methods.body.phone, true);
  const listed = await signInWith(api, '+919400000002', '480213');
  assert.equal(listed.status, 200, listed.text);
  assert.ok(listed.body.accessToken);
  assert.equal(api.sender.sent.length, 0, 'no SMS is sent');
  const stranger = await api.call('POST', '/v1/auth/otp', { body: { phone: '+919400000003' } });
  assert.equal(stranger.status, 503, 'a number not on the list cannot ask for a code when no SMS provider is set');
  assert.equal(stranger.body.error, 'PHONE_SIGN_IN_UNAVAILABLE');
  assert.ok(api.logs.some((entry) => entry.auth === 'fixed-code-challenge' && entry.kind === 'test' && !JSON.stringify(entry).includes('9400000002')));
});

test('with an SMS sender a number off the list gets a random code and the fixed code does not work for it', async () => {
  const testSignIn = testSignInFromEnv({ MYCA_TEST_PHONES: '+919400000011', MYCA_TEST_CODE: '480213' }, 'staging');
  const api = await boot({ testSignIn, environment: 'staging' });
  const otp = await api.call('POST', '/v1/auth/otp', { body: { phone: '+919400000012' } });
  assert.equal(otp.status, 200);
  const sent = api.sender.last();
  assert.equal(sent.phone, '+919400000012');
  if (sent.code !== '480213') {
    const refused = await api.call('POST', '/v1/auth/verify', { body: { challengeId: otp.body.challengeId, phone: '+919400000012', code: '480213' } });
    assert.equal(refused.status, 400);
    assert.equal(refused.body.error, 'INVALID_CODE');
  }
});

test('test phones are refused in production, the reviewer number works only when the flag is on, and weak codes are refused', () => {
  assert.match(testSignInFromEnv({ MYCA_TEST_PHONES: '+919400000001', MYCA_TEST_CODE: '480213' }, 'production').problem, /refused in production/);
  const off = testSignInFromEnv({ MYCA_REVIEWER_PHONE: '+919400000021', MYCA_REVIEWER_CODE: '480213' }, 'production');
  assert.equal(off.enabled, false, 'without MYCA_REVIEWER_SIGN_IN the reviewer number is an ordinary number');
  assert.match(testSignInFromEnv({ MYCA_REVIEWER_SIGN_IN: 'on', MYCA_REVIEWER_PHONE: '+919400000021', MYCA_REVIEWER_CODE: '123456' }, 'production').problem, /too easy/);
  assert.match(testSignInFromEnv({ MYCA_TEST_PHONES: '+919400000001', MYCA_TEST_CODE: '12' }, 'staging').problem, /six digits/);
  const on = testSignInFromEnv({ MYCA_REVIEWER_SIGN_IN: 'on', MYCA_REVIEWER_PHONE: '9400000021', MYCA_REVIEWER_CODE: '480213' }, 'production');
  assert.equal(on.problem, '');
  assert.equal(on.isReviewer('+919400000021'), true);
  assert.equal(on.fixedFor('+919400000022'), null);
});

test('the Play reviewer signs in with the fixed code, only ever gets demo businesses with sample books, and cannot reach live services', async () => {
  const testSignIn = testSignInFromEnv({ MYCA_REVIEWER_SIGN_IN: 'on', MYCA_REVIEWER_PHONE: '+919400000031', MYCA_REVIEWER_CODE: '480213' }, 'production');
  const api = await boot({ phone: false, testSignIn, environment: 'production' });
  const signed = await signInWith(api, '+919400000031', '480213');
  assert.equal(signed.status, 200, signed.text);
  const token = signed.body.accessToken;
  await api.call('POST', '/v1/me/consent', { token, body: { document: PRIVACY_NOTICE.document, version: PRIVACY_NOTICE.version } });
  const created = await api.call('POST', '/v1/businesses', { token, body: { name: 'Real Looking Co', state: '27' } });
  assert.equal(created.status, 200, created.text);
  assert.equal(created.body.business.demo, true, 'whatever the reviewer asks for is a demo business');
  assert.match(created.body.business.name, /^Demo/);
  assert.ok(created.body.seeded > 10);
  const blocked = await api.call('POST', `/v1/businesses/${created.body.business.id}/gst-portal`, { token, body: {} });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.error, 'DEMO_BUSINESS');
  const wrongCode = await signInWith(api, '+919400000031', '480214');
  assert.equal(wrongCode.status, 400);
});

test('a demo business is built through the engines, is exempt from billing, blocks live services and is retired when unused', async () => {
  const api = await boot({ jobToken: 'job-token-for-demo-tests-0123456789abcdef', billing: undefined });
  const owner = await api.signIn('+919400000041');
  const created = await api.call('POST', '/v1/businesses', { token: owner.accessToken, body: { demo: true } });
  assert.equal(created.status, 200, created.text);
  const id = created.body.business.id;
  const books = await api.books(id);
  assert.equal(books.invoices.length, 6);
  assert.ok(books.invoices.every((invoice) => Number.isFinite(invoice.total) || Number.isFinite(invoice.grandTotal) || invoice.lines.length));
  const sold = await api.call('POST', `/v1/businesses/${id}/query`, { token: owner.accessToken, body: { name: 'trial_balance', args: {} } });
  assert.equal(sold.status, 200, sold.text);
  const listed = await api.call('GET', '/v1/businesses', { token: owner.accessToken });
  assert.equal(listed.body.businesses.find((b) => b.id === id).demo, true);
  const entitlement = await api.call('GET', `/v1/businesses/${id}/subscription`, { token: owner.accessToken });
  assert.equal(entitlement.body.demo, true);
  assert.equal(entitlement.body.trial, null);
  for (const action of ['gst-gstr1', 'einvoice', 'connectors', 'invitations', 'subscription']) {
    const refused = await api.call('POST', `/v1/businesses/${id}/${action}`, { token: owner.accessToken, body: {} });
    assert.equal(refused.status, 403, action);
    assert.equal(refused.body.error, 'DEMO_BUSINESS', action);
  }
  const audited = await api.db.query("select metadata from audit_log where business_id = $1 and action = 'demo_business_created'", [id]);
  assert.equal(audited.rowCount, 1);
  assert.ok(audited.rows[0].metadata.source);

  api.clock.advance(31 * 24 * 60 * 60 * 1000);
  const ran = await api.call('POST', '/v1/jobs/daily', { headers: { 'x-myca-job-token': 'job-token-for-demo-tests-0123456789abcdef' } });
  assert.equal(ran.status, 200, ran.text);
  assert.equal(ran.body.purge.demoRetired, 1);
  const gone = await api.call('GET', '/v1/businesses', { token: (await api.signIn('+919400000041')).accessToken });
  assert.equal(gone.body.businesses.some((b) => b.id === id), false);
});

test('a global hourly cap on codes stops SMS pumping and raises an alarm first', async () => {
  const api = await boot({ otpGlobalPerHour: 5 });
  for (let i = 0; i < 5; i += 1) {
    const sent = await api.call('POST', '/v1/auth/otp', { body: { phone: `+91950000000${i}` }, headers: { 'x-forwarded-for': `10.0.0.${i}` } });
    assert.equal(sent.status, 200, sent.text);
  }
  const capped = await api.call('POST', '/v1/auth/otp', { body: { phone: '+919500000009' }, headers: { 'x-forwarded-for': '10.0.0.9' } });
  assert.equal(capped.status, 429);
  assert.ok(api.logs.some((entry) => entry.alarm === 'otp-global-cap-80'));
  assert.ok(api.logs.some((entry) => entry.alarm === 'otp-global-cap'));
});
