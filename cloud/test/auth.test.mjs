import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, OTP_MAX_ATTEMPTS, OTP_MAX_PER_HOUR, OTP_TTL_SECONDS } from '../src/auth.mjs';
import { ACCESS_TTL_SECONDS, signAccessToken, verifyAccessToken, assertSecret } from '../src/tokens.mjs';
import { createApi } from '../src/api.mjs';
import { startApi, SECRET } from './helpers.mjs';

let api;
before(async () => { api = await startApi(); });
after(async () => { await api.close(); });

let nextPhone = 9000000000;
const freshPhone = () => `+91${nextPhone++}`;

async function challenge(phone) {
  const otp = await api.call('POST', '/v1/auth/otp', { body: { phone } });
  assert.equal(otp.status, 200, otp.text);
  return { challengeId: otp.body.challengeId, code: api.sender.last().code, response: otp };
}

test('phone numbers are normalised to +91, a +1 number is kept for MyCA US, and anything else is refused', () => {
  assert.equal(normalizePhone('9876543210'), '+919876543210');
  assert.equal(normalizePhone('+91 98765 43210'), '+919876543210');
  assert.equal(normalizePhone('09876543210'), '+919876543210');
  assert.equal(normalizePhone('919876543210'), '+919876543210');
  assert.equal(normalizePhone('+1 415 555 0100'), '+14155550100');
  for (const bad of ['', '12345', '5876543210', '98765432101', '+1 015 555 0100', '+44 20 7946 0958', 'abcdefghij', null]) {
    assert.equal(normalizePhone(bad), '', String(bad));
  }
});

test('access tokens verify, expire, and fail when altered or signed with another secret', () => {
  const now = 1_800_000_000_000;
  const ids = { userId: '11111111-1111-4111-8111-111111111111', deviceId: '22222222-2222-4222-8222-222222222222' };
  const token = signAccessToken(ids, SECRET, now);
  assert.deepEqual({ ...verifyAccessToken(token, SECRET, now), expiresAt: 0 }, { ok: true, ...ids, expiresAt: 0 });
  assert.equal(verifyAccessToken(token, SECRET, now + ACCESS_TTL_SECONDS * 1000).error, 'TOKEN_EXPIRED');
  assert.equal(verifyAccessToken(token, `${SECRET}x`, now).error, 'BAD_SIGNATURE');
  const [prefix, body, mac] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ sub: ids.deviceId, dev: ids.deviceId, exp: 9e9 })).toString('base64url');
  assert.equal(verifyAccessToken(`${prefix}.${forged}.${mac}`, SECRET, now).error, 'BAD_SIGNATURE');
  assert.equal(verifyAccessToken(`${prefix}.${body}`, SECRET, now).error, 'MALFORMED_TOKEN');
  assert.equal(verifyAccessToken('', SECRET, now).error, 'MALFORMED_TOKEN');
  assert.throws(() => assertSecret('short'), /at least 32/);
  assert.throws(() => createApi({ db: api.db, secret: 'short', otpSender: api.sender }), /at least 32/);
});

test('a code sent to the phone signs the owner in, and the code is never in a response', async () => {
  const phone = freshPhone();
  const { challengeId, code, response } = await challenge(phone);
  assert.match(code, /^\d{6}$/);
  assert.equal(response.text.includes(code), false);
  assert.equal(response.body.expiresInSeconds, OTP_TTL_SECONDS);
  const verified = await api.call('POST', '/v1/auth/verify', { body: { challengeId, phone, code } });
  assert.equal(verified.status, 200, verified.text);
  assert.equal(verified.body.user.isNew, true);
  const me = await api.call('GET', '/v1/me', { token: verified.body.accessToken });
  assert.equal(me.status, 200);
  assert.deepEqual(me.body.businesses, []);
  assert.equal(JSON.stringify(me.body).includes(phone.slice(-10)), false, 'the phone number is not echoed back');

  const again = await api.signIn(phone);
  assert.equal(again.user.isNew, false);
  assert.equal(again.user.id, verified.body.user.id);
});

test('the database holds no phone number or code in the challenge table', async () => {
  const phone = freshPhone();
  const { code } = await challenge(phone);
  const rows = await api.db.query('select * from otp_challenges order by created_at desc limit 1');
  const stored = JSON.stringify(rows.rows[0]);
  assert.equal(stored.includes(phone), false);
  assert.equal(stored.includes(phone.slice(-10)), false);
  assert.equal(stored.includes(code), false);
});

test('a used code cannot be used again', async () => {
  const phone = freshPhone();
  const { challengeId, code } = await challenge(phone);
  assert.equal((await api.call('POST', '/v1/auth/verify', { body: { challengeId, phone, code } })).status, 200);
  const replay = await api.call('POST', '/v1/auth/verify', { body: { challengeId, phone, code } });
  assert.equal(replay.body.error, 'CODE_USED');
});

test('wrong codes are counted, and after the limit even the right code fails', async () => {
  const phone = freshPhone();
  const { challengeId, code } = await challenge(phone);
  const wrong = code === '000000' ? '111111' : '000000';
  for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
    const out = await api.call('POST', '/v1/auth/verify', { body: { challengeId, phone, code: wrong } });
    assert.equal(out.body.error, 'INVALID_CODE');
    assert.equal(out.body.attemptsRemaining, OTP_MAX_ATTEMPTS - i - 1);
  }
  const locked = await api.call('POST', '/v1/auth/verify', { body: { challengeId, phone, code } });
  assert.equal(locked.status, 429);
  assert.equal(locked.body.error, 'TOO_MANY_ATTEMPTS');
});

test('a code expires, and a newer code retires the older one', async () => {
  const phone = freshPhone();
  const first = await challenge(phone);
  const second = await challenge(phone);
  const stale = await api.call('POST', '/v1/auth/verify', { body: { challengeId: first.challengeId, phone, code: first.code } });
  assert.equal(stale.body.error, 'CODE_USED');
  api.clock.advance(OTP_TTL_SECONDS * 1000 + 1);
  const late = await api.call('POST', '/v1/auth/verify', { body: { challengeId: second.challengeId, phone, code: second.code } });
  assert.equal(late.body.error, 'CODE_EXPIRED');
});

test('a code issued for one phone cannot sign in another', async () => {
  const mine = freshPhone();
  const theirs = freshPhone();
  const { challengeId, code } = await challenge(mine);
  const out = await api.call('POST', '/v1/auth/verify', { body: { challengeId, phone: theirs, code } });
  assert.equal(out.body.error, 'INVALID_CODE');
});

test('requests for codes are limited per phone per hour', async () => {
  const phone = freshPhone();
  for (let i = 0; i < OTP_MAX_PER_HOUR; i++) await challenge(phone);
  const sentBefore = api.sender.sent.length;
  const blocked = await api.call('POST', '/v1/auth/otp', { body: { phone } });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.error, 'TOO_MANY_REQUESTS');
  assert.equal(api.sender.sent.length, sentBefore, 'no SMS is sent once limited');
  api.clock.advance(60 * 60 * 1000 + 1);
  assert.equal((await api.call('POST', '/v1/auth/otp', { body: { phone } })).status, 200);
});

test('malformed sign-in requests are refused without a lookup', async () => {
  assert.equal((await api.call('POST', '/v1/auth/otp', { body: { phone: '12345' } })).body.error, 'INVALID_PHONE');
  for (const body of [{}, { challengeId: 'x', phone: '9876543210', code: '123456' }, { challengeId: '11111111-1111-4111-8111-111111111111', phone: '9876543210', code: '12ab56' }]) {
    assert.equal((await api.call('POST', '/v1/auth/verify', { body })).body.error, 'INVALID_CODE');
  }
  assert.equal((await api.call('POST', '/v1/auth/verify', { raw: '{not json' })).body.error, 'INVALID_JSON');
});

test('an access token stops working after fifteen minutes and refresh issues a new pair', async () => {
  const session = await api.signIn(freshPhone());
  api.clock.advance(ACCESS_TTL_SECONDS * 1000 + 1);
  const expired = await api.call('GET', '/v1/me', { token: session.accessToken });
  assert.equal(expired.status, 401);
  assert.equal(expired.body.reason, 'TOKEN_EXPIRED');
  const refreshed = await api.call('POST', '/v1/auth/refresh', { body: { refreshToken: session.refreshToken } });
  assert.equal(refreshed.status, 200, refreshed.text);
  assert.notEqual(refreshed.body.refreshToken, session.refreshToken);
  assert.equal((await api.call('GET', '/v1/me', { token: refreshed.body.accessToken })).status, 200);
});

test('reusing a rotated refresh token revokes the device, including its live access token', async () => {
  const session = await api.signIn(freshPhone());
  const rotated = await api.call('POST', '/v1/auth/refresh', { body: { refreshToken: session.refreshToken } });
  assert.equal(rotated.status, 200);
  const stolen = await api.call('POST', '/v1/auth/refresh', { body: { refreshToken: session.refreshToken } });
  assert.equal(stolen.body.error, 'REFRESH_TOKEN_REUSED');
  const afterTheft = await api.call('POST', '/v1/auth/refresh', { body: { refreshToken: rotated.body.refreshToken } });
  assert.equal(afterTheft.body.error, 'DEVICE_REVOKED');
  const access = await api.call('GET', '/v1/me', { token: rotated.body.accessToken });
  assert.equal(access.status, 401);
  assert.equal(access.body.reason, 'DEVICE_REVOKED');
});

test('refresh tokens are stored only as hashes and unknown ones are refused', async () => {
  const session = await api.signIn(freshPhone());
  const rows = await api.db.query('select token_hash from refresh_tokens');
  assert.equal(rows.rows.some((row) => row.token_hash === session.refreshToken), false);
  assert.equal((await api.call('POST', '/v1/auth/refresh', { body: { refreshToken: 'made-up' } })).body.error, 'INVALID_REFRESH_TOKEN');
  assert.equal((await api.call('POST', '/v1/auth/refresh', { body: {} })).body.error, 'INVALID_REFRESH_TOKEN');
});

test('logging out ends that device only', async () => {
  const phone = freshPhone();
  const phoneA = await api.signIn(phone);
  const phoneB = await api.signIn(phone);
  assert.equal((await api.call('POST', '/v1/auth/logout', { token: phoneA.accessToken })).status, 200);
  assert.equal((await api.call('GET', '/v1/me', { token: phoneA.accessToken })).status, 401);
  assert.equal((await api.call('GET', '/v1/me', { token: phoneB.accessToken })).status, 200);
});

test('deleting the account ends access at once and marks solely-owned businesses for deletion', async () => {
  const owner = await api.ownerWithBusiness(freshPhone());
  assert.equal((await api.call('DELETE', '/v1/me', { token: owner.token })).status, 200);
  assert.equal((await api.call('GET', '/v1/me', { token: owner.token })).status, 401);
  const marked = await api.db.query('select deletion_requested_at from businesses where id = $1', [owner.businessId]);
  assert.notEqual(marked.rows[0].deletion_requested_at, null);
  const books = await api.db.query('select 1 from books where business_id = $1', [owner.businessId]);
  assert.equal(books.rowCount, 1, 'the books are held, not erased');
});

test('every protected route needs a token', async () => {
  const protectedRoutes = [
    ['GET', '/v1/me'],
    ['GET', '/v1/businesses'],
    ['POST', '/v1/businesses'],
    ['GET', '/v1/businesses/11111111-1111-4111-8111-111111111111/snapshot'],
    ['GET', '/v1/me/second-step'],
    ['POST', '/v1/me/second-step/begin'],
    ['POST', '/v1/me/second-step/confirm'],
    ['POST', '/v1/me/second-step/disable'],
    ['POST', '/v1/me/second-step/recovery-codes'],
    ['GET', '/v1/me/devices'],
    ['POST', '/v1/me/devices/sign-out-others'],
    ['POST', '/v1/me/devices/11111111-1111-4111-8111-111111111111/sign-out'],
  ];
  for (const [method, path] of protectedRoutes) {
    const out = await api.call(method, path, { body: method === 'POST' ? {} : undefined });
    assert.equal(out.status, 401, `${method} ${path}`);
    assert.equal(out.body.error, 'UNAUTHENTICATED');
  }
  const health = await api.call('GET', '/v1/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.providerMode, 'off');
  assert.equal((await api.call('GET', '/nope')).status, 404);
});
