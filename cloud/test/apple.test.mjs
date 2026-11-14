import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign, randomBytes } from 'node:crypto';
import { APPLE_ISSUER, APPLE_KEYS_URL, APPLE_BUNDLE_ID, appleClientIdsFromEnv, createAppleKeys, createAppleVerifier, hashNonce } from '../src/apple.mjs';
import { enabledServices } from '../src/environment.mjs';
import { JOB_HEADER } from '../src/jobs.mjs';
import { PRIVACY_NOTICE } from '../src/consent.mjs';
import { startApi } from './helpers.mjs';

const KEY = generateKeyPairSync('rsa', { modulusLength: 2048 });
const SERVICES_ID = 'com.mldynamic.myca.us.web';
const JOB_TOKEN = 'job-token-for-apple-tests-0123456789abcdef';
const DAY = 24 * 60 * 60 * 1000;

function fakeAppleFetch(calls = []) {
  const jwk = KEY.publicKey.export({ format: 'jwk' });
  return async (url) => {
    calls.push(String(url));
    if (String(url) !== APPLE_KEYS_URL) return new Response('no', { status: 404 });
    return new Response(JSON.stringify({ keys: [{ ...jwk, kid: 'apple-kid', use: 'sig', alg: 'RS256' }] }), { status: 200, headers: { 'cache-control': 'max-age=86400' } });
  };
}

function rawNonce() {
  return randomBytes(24).toString('base64url');
}

function appleToken(claims = {}, { kid = 'apple-kid', privateKey = KEY.privateKey, nonce } = {}) {
  const seconds = Math.floor(Date.now() / 1000);
  const body = { iss: APPLE_ISSUER, aud: APPLE_BUNDLE_ID, sub: '001234.abcdef0123456789.0420', email: 'dana@example.com', email_verified: 'true', is_private_email: 'false', iat: seconds, exp: seconds + 600, nonce_supported: true, ...claims };
  if (nonce !== undefined) body.nonce = nonce;
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const signing = `${part({ alg: 'RS256', kid })}.${part(body)}`;
  return `${signing}.${createSign('RSA-SHA256').update(signing).sign(privateKey).toString('base64url')}`;
}

function signed(claims = {}, options = {}) {
  const raw = options.raw || rawNonce();
  return { raw, token: appleToken(claims, { nonce: hashNonce(raw), ...options }) };
}

let api;
const fetchCalls = [];
before(async () => {
  api = await startApi({ appleClientIds: [APPLE_BUNDLE_ID, SERVICES_ID], appleKeys: createAppleKeys({ fetchImpl: fakeAppleFetch(fetchCalls) }), jobToken: JOB_TOKEN });
});
after(async () => { await api.close(); });

const apple = (body) => api.call('POST', '/v1/auth/apple', { body: { deviceLabel: 'iPhone 16', ...body } });
const userBySub = async (sub) => (await api.db.query('select id, phone, google_sub, oidc_issuer, oidc_sub, email, name, deleted_at from users where oidc_issuer = $1 and oidc_sub = $2', [APPLE_ISSUER, sub])).rows[0];

test('the methods list says when Apple sign-in is on', async () => {
  const out = await api.call('GET', '/v1/auth/methods');
  assert.deepEqual(out.body, { ok: true, phone: true, google: true, apple: true, oidc: false });
});

test('a valid Apple token with the matching nonce signs a new user in, with the name the app passed', async () => {
  const { raw, token } = signed();
  const out = await apple({ idToken: token, rawNonce: raw, fullName: { givenName: 'Dana', familyName: 'Whitfield' } });
  assert.equal(out.status, 200, out.text);
  assert.ok(out.body.accessToken && out.body.refreshToken);
  assert.equal(out.body.user.isNew, true);
  assert.equal(out.body.user.name, 'Dana Whitfield');
  assert.equal(out.body.consent.accepted, false);
  const row = await userBySub('001234.abcdef0123456789.0420');
  assert.equal(row.phone, null);
  assert.equal(row.google_sub, null);
  assert.equal(row.email, 'dana@example.com');
  assert.deepEqual(fetchCalls, [APPLE_KEYS_URL]);
});

test('a second sign-in without email or name finds the same account and keeps what it had', async () => {
  const { raw, token } = signed({ email: undefined, email_verified: undefined });
  const out = await apple({ idToken: token, rawNonce: raw });
  assert.equal(out.status, 200, out.text);
  assert.equal(out.body.user.isNew, false);
  assert.equal(out.body.user.name, 'Dana Whitfield');
  const row = await userBySub('001234.abcdef0123456789.0420');
  assert.equal(row.email, 'dana@example.com');
  assert.equal(row.name, 'Dana Whitfield');
  assert.deepEqual(fetchCalls, [APPLE_KEYS_URL], 'keys are cached between sign-ins');
});

test('a private relay email is kept as given, a token for the Services ID is accepted, and a missing name asks the app for one', async () => {
  const { raw, token } = signed({ sub: '009999.relay.0001', aud: SERVICES_ID, email: 'x7k2p9@privaterelay.appleid.com', is_private_email: 'true' });
  const out = await apple({ idToken: token, rawNonce: raw });
  assert.equal(out.status, 200, out.text);
  assert.equal(out.body.user.isNew, true);
  assert.equal(out.body.user.name, '');
  assert.equal((await userBySub('009999.relay.0001')).email, 'x7k2p9@privaterelay.appleid.com');
  const verifier = createAppleVerifier({ clientIds: [APPLE_BUNDLE_ID], keys: { get: async () => KEY.publicKey } });
  const direct = signed({ email: 'x7k2p9@privaterelay.appleid.com' });
  const identity = await verifier.verify(direct.token, { rawNonce: direct.raw, fullName: { givenName: ' Ana\u0000 ', familyName: null } });
  assert.equal(identity.privateRelay, true);
  assert.equal(identity.name, 'Ana');
});

test('an unverified email is not stored', async () => {
  const { raw, token } = signed({ sub: '005555.unverified', email: 'someone@example.com', email_verified: 'false' });
  const out = await apple({ idToken: token, rawNonce: raw });
  assert.equal(out.status, 200, out.text);
  assert.equal((await userBySub('005555.unverified')).email, null);
});

test('wrong audience, wrong issuer, expired, forged, bad or missing nonce are refused and create no one', async () => {
  const before = (await api.db.query('select count(*)::int as n from users')).rows[0].n;
  const stranger = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  const raw = rawNonce();
  const nonce = hashNonce(raw);
  const cases = [
    [{ idToken: appleToken({ sub: 'r1', aud: 'com.example.other' }, { nonce }), rawNonce: raw }, 'APPLE_WRONG_AUDIENCE'],
    [{ idToken: appleToken({ sub: 'r2', iss: 'https://accounts.google.com' }, { nonce }), rawNonce: raw }, 'INVALID_APPLE_TOKEN'],
    [{ idToken: appleToken({ sub: 'r3', exp: Math.floor(Date.now() / 1000) - 3600 }, { nonce }), rawNonce: raw }, 'APPLE_TOKEN_EXPIRED'],
    [{ idToken: appleToken({ sub: 'r4' }, { nonce, privateKey: stranger }), rawNonce: raw }, 'INVALID_APPLE_TOKEN'],
    [{ idToken: appleToken({ sub: 'r5' }, { nonce, kid: 'unknown' }), rawNonce: raw }, 'INVALID_APPLE_TOKEN'],
    [{ idToken: appleToken({ sub: 'r6' }, { nonce }), rawNonce: rawNonce() }, 'APPLE_NONCE_MISMATCH'],
    [{ idToken: appleToken({ sub: 'r7' }, { nonce }) }, 'APPLE_NONCE_MISMATCH'],
    [{ idToken: appleToken({ sub: 'r8' }), rawNonce: raw }, 'APPLE_NONCE_MISMATCH'],
    [{ idToken: appleToken({ sub: 'r9' }, { nonce: raw }), rawNonce: raw }, 'APPLE_NONCE_MISMATCH'],
    [{ idToken: appleToken({ sub: 'r10' }, { nonce: hashNonce('short') }), rawNonce: 'short' }, 'APPLE_NONCE_MISMATCH'],
    [{ idToken: 'nope', rawNonce: raw }, 'INVALID_APPLE_TOKEN'],
    [{ rawNonce: raw }, 'INVALID_APPLE_TOKEN'],
  ];
  for (const [body, error] of cases) {
    const out = await apple(body);
    assert.equal(out.status, 400, out.text);
    assert.equal(out.body.error, error, out.text);
  }
  assert.equal((await api.db.query('select count(*)::int as n from users')).rows[0].n, before);
});

test('an Apple account is the same person as nobody else: a Google or OIDC subject with the same id is another account', async () => {
  const { raw, token } = signed({ sub: '1001' });
  const out = await apple({ idToken: token, rawNonce: raw });
  assert.equal(out.status, 200, out.text);
  assert.equal(out.body.user.isNew, true);
  assert.equal((await api.db.query("select count(*)::int as n from users where google_sub = '1001'")).rows[0].n, 0);
});

test('when Apple cannot be reached the app is told so, and with no client ids the route is off', async () => {
  const down = await startApi({ appleClientIds: [APPLE_BUNDLE_ID], appleKeys: createAppleKeys({ fetchImpl: async () => { throw new Error('down'); } }) });
  const off = await startApi();
  try {
    const { raw, token } = signed();
    const unreachable = await down.call('POST', '/v1/auth/apple', { body: { idToken: token, rawNonce: raw } });
    assert.equal(unreachable.status, 502);
    assert.equal(unreachable.body.error, 'APPLE_UNREACHABLE');
    const refused = await off.call('POST', '/v1/auth/apple', { body: { idToken: token, rawNonce: raw } });
    assert.equal(refused.status, 503);
    assert.equal(refused.body.error, 'APPLE_SIGN_IN_UNAVAILABLE');
    assert.equal((await off.call('GET', '/v1/auth/methods')).body.apple, false);
  } finally {
    await down.close();
    await off.close();
  }
});

test('the client ids come from MYCA_APPLE_CLIENT_IDS and show in the enabled services', () => {
  assert.deepEqual(appleClientIdsFromEnv({ MYCA_APPLE_CLIENT_IDS: ' com.mldynamic.myca.us , com.mldynamic.myca.us.web ' }), [APPLE_BUNDLE_ID, SERVICES_ID]);
  assert.deepEqual(appleClientIdsFromEnv({ MYCA_APPLE_CLIENT_IDS: 'unset' }), []);
  assert.deepEqual(appleClientIdsFromEnv({}), []);
  assert.ok(enabledServices({ MYCA_APPLE_CLIENT_IDS: APPLE_BUNDLE_ID }).includes('apple-sign-in'));
  assert.ok(!enabledServices({}).includes('apple-sign-in'));
});

test('an Apple user can delete their account, is erased after the grace period, and signing in again starts a new account', async () => {
  const { raw, token } = signed({ sub: '007777.leaving', email: 'leaving@privaterelay.appleid.com' });
  const out = await apple({ idToken: token, rawNonce: raw, fullName: { givenName: 'Leaving' } });
  assert.equal(out.status, 200, out.text);
  const session = out.body.accessToken;
  assert.equal((await api.call('POST', '/v1/me/consent', { token: session, body: { document: PRIVACY_NOTICE.document, version: PRIVACY_NOTICE.version, adult: true } })).status, 200);
  const deleted = await api.call('DELETE', '/v1/me', { token: session });
  assert.equal(deleted.status, 200, deleted.text);
  assert.ok((await userBySub('007777.leaving')).deleted_at);
  assert.equal((await api.call('GET', '/v1/me', { token: session })).status, 401);
  api.clock.advance(31 * DAY);
  const purged = await api.call('POST', '/v1/jobs/daily', { headers: { [JOB_HEADER]: JOB_TOKEN } });
  assert.equal(purged.status, 200, purged.text);
  assert.equal(await userBySub('007777.leaving'), undefined);
  api.clock.advance(-31 * DAY);
  const back = signed({ sub: '007777.leaving' });
  const again = await apple({ idToken: back.token, rawNonce: back.raw });
  assert.equal(again.status, 200, again.text);
  assert.equal(again.body.user.isNew, true);
  assert.notEqual(again.body.user.id, out.body.user.id);
});
