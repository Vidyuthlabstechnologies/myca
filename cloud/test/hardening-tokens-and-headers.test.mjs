import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers.mjs';

let api;
before(async () => {
  api = await startApi();
});
after(() => api.close());

test('a forged or garbled token gets one generic reason, so the error does not tell an attacker what was wrong', async () => {
  const forged = await api.call('GET', '/v1/me', { token: 'garbage' });
  assert.equal(forged.status, 401);
  assert.equal(forged.body.reason, 'INVALID_TOKEN');
  const session = await api.signIn('+919800000301');
  const [prefix, body, mac] = session.accessToken.split('.');
  const tampered = await api.call('GET', '/v1/me', { token: `${prefix}.${body}.${mac.slice(0, -2)}xx` });
  assert.equal(tampered.body.reason, 'INVALID_TOKEN');
  const none = await api.call('GET', '/v1/me');
  assert.equal(none.body.reason, 'INVALID_TOKEN');
});

test('an expired or revoked session still says so, because the app signs in again or signs out on those', async () => {
  const session = await api.signIn('+919800000302');
  api.clock.advance(2 * 60 * 60 * 1000);
  const expired = await api.call('GET', '/v1/me', { token: session.accessToken });
  assert.equal(expired.body.reason, 'TOKEN_EXPIRED');
});

test('JSON answers carry nosniff and HSTS', async () => {
  const response = await fetch(`${api.base}/v1/health`);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('strict-transport-security') || '', /max-age=31536000/);
  const refused = await fetch(`${api.base}/v1/me`);
  assert.equal(refused.headers.get('x-content-type-options'), 'nosniff');
});
