import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi, googleToken } from './helpers.mjs';

let api;
before(async () => {
  api = await startApi({ rateLimits: { signIn: { max: 3, windowSeconds: 600 }, ask: { max: 2, windowSeconds: 3600 }, crash: { max: 2, windowSeconds: 3600 }, upload: { max: 2, windowSeconds: 3600 } } });
});
after(async () => { await api.close(); });

test('sign-in attempts are limited per client address with Retry-After, and the window resets', async () => {
  const from = { 'x-forwarded-for': '203.0.113.7' };
  for (let i = 0; i < 3; i += 1) {
    const out = await api.call('POST', '/v1/auth/google', { body: { idToken: googleToken({ sub: `30000000000000000000${i}` }) }, headers: from });
    assert.equal(out.status, 200, out.text);
  }
  const res = await fetch(`${api.base}/v1/auth/google`, { method: 'POST', headers: { 'content-type': 'application/json', ...from }, body: JSON.stringify({ idToken: googleToken() }) });
  assert.equal(res.status, 429);
  assert.ok(Number(res.headers.get('retry-after')) > 0);
  const body = await res.json();
  assert.equal(body.error, 'TOO_MANY_REQUESTS');
  const elsewhere = await api.call('POST', '/v1/auth/google', { body: { idToken: googleToken() }, headers: { 'x-forwarded-for': '203.0.113.8' } });
  assert.equal(elsewhere.status, 200, 'another address is not affected');
  api.clock.advance(601 * 1000);
  const later = await api.call('POST', '/v1/auth/google', { body: { idToken: googleToken() }, headers: from });
  assert.equal(later.status, 200, 'the next window is open again');
});

test('chat, uploads and crash reports are limited per signed-in person', async () => {
  const owner = await api.ownerWithBusiness('+919600000051');
  const ask = () => api.call('POST', `/v1/businesses/${owner.businessId}/ask`, { token: owner.token, body: { message: 'what are my sales this month' } });
  assert.equal((await ask()).status, 200);
  assert.equal((await ask()).status, 200);
  assert.equal((await ask()).status, 429);
  const crash = () => api.call('POST', '/v1/crash-reports', { token: owner.token, body: { reports: [{ kind: 'flutter', type: 'StateError', message: 'boom', stack: 'at x' }] } });
  await crash();
  await crash();
  assert.equal((await crash()).status, 429);
  const upload = () => api.call('POST', `/v1/businesses/${owner.businessId}/uploads`, { token: owner.token, body: { name: 'a.csv', content: 'a,b\n1,2\n' } });
  await upload();
  await upload();
  assert.equal((await upload()).status, 429);
  const other = await api.ownerWithBusiness('+919600000052');
  assert.equal((await api.call('POST', `/v1/businesses/${other.businessId}/ask`, { token: other.token, body: { message: 'what are my sales this month' } })).status, 200, 'someone else is not affected');
});
