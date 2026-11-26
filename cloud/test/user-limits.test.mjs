import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryLimiter } from '../src/rate-limits.mjs';
import { MAX_OWNED_BUSINESSES } from '../src/businesses.mjs';
import { startApi } from './helpers.mjs';

let api;

before(async () => {
  api = await startApi();
});
after(() => api.close());

test('the memory limiter counts per key per window and says when to come back', () => {
  let now = 1_000_000;
  const limiter = createMemoryLimiter({ max: 3, windowMs: 60_000, now: () => now });
  assert.deepEqual([1, 2, 3].map(() => limiter.take('a').ok), [true, true, true]);
  const refused = limiter.take('a');
  assert.equal(refused.ok, false);
  assert.ok(refused.retryAfterSeconds >= 1 && refused.retryAfterSeconds <= 60);
  assert.equal(limiter.take('b').ok, true, 'another user is unaffected');
  now += 60_000;
  assert.equal(limiter.take('a').ok, true, 'a new window starts fresh');
});

test('the memory limiter never grows without bound', () => {
  let now = 0;
  const limiter = createMemoryLimiter({ max: 1, windowMs: 1000, now: () => now, maxKeys: 100 });
  for (let i = 0; i < 100; i += 1) limiter.take(`u${i}`);
  now += 5000;
  for (let i = 0; i < 100; i += 1) assert.equal(limiter.take(`v${i}`).ok, true);
});

test('one account can own at most ten businesses, and the eleventh is refused plainly', async () => {
  const who = await api.signIn('+919800000201');
  const make = (n) => api.call('POST', '/v1/businesses', { token: who.accessToken, body: { name: `Shop ${n}`, state: '27' } });
  for (let n = 1; n <= MAX_OWNED_BUSINESSES; n += 1) assert.equal((await make(n)).status, 200, `business ${n}`);
  const over = await make(11);
  assert.equal(over.status, 403);
  assert.equal(over.body.error, 'BUSINESS_LIMIT');
  assert.equal(over.body.max, MAX_OWNED_BUSINESSES);
  assert.match(over.body.hint, /most one account can have/);
  const listed = await api.call('GET', '/v1/businesses', { token: who.accessToken });
  assert.equal(listed.body.businesses.length, MAX_OWNED_BUSINESSES);
});

test('a burst of simultaneous creates still stops at the cap', async () => {
  const who = await api.signIn('+919800000202');
  const results = await Promise.all(Array.from({ length: 16 }, (_, n) => api.call('POST', '/v1/businesses', { token: who.accessToken, body: { name: `Burst ${n}`, state: '27' } })));
  assert.equal(results.filter((r) => r.status === 200).length, MAX_OWNED_BUSINESSES);
  assert.equal(results.filter((r) => r.body.error === 'BUSINESS_LIMIT').length, 16 - MAX_OWNED_BUSINESSES);
});

test('one user cannot send an unbounded stream of requests, and other users keep working', async () => {
  const noisy = await api.signIn('+919800000203');
  const calm = await api.signIn('+919800000204');
  let refused = null;
  for (let n = 0; n < 1600 && !refused; n += 1) {
    const r = await api.call('GET', '/v1/me', { token: noisy.accessToken });
    if (r.status === 429) refused = r;
  }
  assert.ok(refused, 'the noisy user is eventually limited');
  assert.equal(refused.body.error, 'RATE_LIMITED');
  assert.ok(refused.body.retryAfterSeconds >= 1);
  assert.equal((await api.call('GET', '/v1/me', { token: calm.accessToken })).status, 200);
});
