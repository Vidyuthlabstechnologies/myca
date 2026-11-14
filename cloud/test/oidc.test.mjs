import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { createOidcVerifier, oidcConfigFromEnv, createJwksKeys } from '../src/oidc.mjs';
import { createApi } from '../src/api.mjs';
import { PRIVACY_NOTICE } from '../src/consent.mjs';
import { startApi, SECRET, OIDC_ISSUER, OIDC_CLIENT } from './helpers.mjs';

const KEY = generateKeyPairSync('rsa', { modulusLength: 2048 });
const KEYS = { get: async (kid) => (kid === 'realm-kid' ? KEY.publicKey : null) };

function idToken(claims = {}, { kid = 'realm-kid', privateKey = KEY.privateKey, alg = 'RS256' } = {}) {
  const seconds = Math.floor(Date.now() / 1000);
  const body = { iss: OIDC_ISSUER, aud: OIDC_CLIENT, sub: 'f3a1', email: 'ravi@example.com', email_verified: true, name: 'Ravi Kumar', iat: seconds, exp: seconds + 3600, ...claims };
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const signing = `${part({ alg, kid, typ: 'JWT' })}.${part(body)}`;
  const signature = createSign('RSA-SHA256').update(signing).sign(privateKey).toString('base64url');
  return `${signing}.${signature}`;
}

let api;
before(async () => { api = await startApi({ oidc: { issuer: OIDC_ISSUER, clientIds: [OIDC_CLIENT] }, oidcKeys: KEYS }); });
after(async () => { await api.close(); });

const oidc = (token) => api.call('POST', '/v1/auth/oidc', { body: { idToken: token, deviceLabel: 'Pixel 8' } });

test('the methods list names the issuer when OIDC sign-in is on', async () => {
  const out = await api.call('GET', '/v1/auth/methods');
  assert.deepEqual(out.body, { ok: true, phone: true, google: true, oidc: true, oidcIssuer: OIDC_ISSUER });
});

test('a token from the configured issuer signs a user in, keeps them across sign-ins, and the user works like any other', async () => {
  const out = await oidc(idToken());
  assert.equal(out.status, 200, out.text);
  assert.equal(out.body.user.name, 'Ravi Kumar');
  assert.equal(out.body.user.isNew, true);
  assert.equal(out.body.consent.accepted, false);
  const row = (await api.db.query("select phone, google_sub, oidc_issuer, oidc_sub, email from users where oidc_sub = 'f3a1'")).rows[0];
  assert.equal(row.phone, null);
  assert.equal(row.google_sub, null);
  assert.equal(row.oidc_issuer, OIDC_ISSUER);
  assert.equal(row.email, 'ravi@example.com');
  const again = await oidc(idToken({ name: 'Other Name' }));
  assert.equal(again.body.user.id, out.body.user.id);
  assert.equal(again.body.user.isNew, false);
  const token = again.body.accessToken;
  assert.equal((await api.call('POST', '/v1/me/consent', { token, body: { document: PRIVACY_NOTICE.document, version: PRIVACY_NOTICE.version, adult: true } })).status, 200);
  const created = await api.call('POST', '/v1/businesses', { token, body: { name: 'Kumar Agencies', state: '36' } });
  assert.equal(created.status, 200, created.text);
});

test('the same subject at another issuer is another person', async () => {
  const other = await startApi({ oidc: { issuer: 'https://other.example.test', clientIds: [OIDC_CLIENT] }, oidcKeys: KEYS });
  try {
    const out = await other.call('POST', '/v1/auth/oidc', { body: { idToken: idToken({ iss: 'https://other.example.test' }) } });
    assert.equal(out.status, 200, out.text);
    assert.equal(out.body.user.isNew, true);
  } finally {
    await other.close();
  }
});

test('forged, foreign, expired or malformed tokens are refused and create no one', async () => {
  const before = (await api.db.query('select count(*)::int as n from users')).rows[0].n;
  const stranger = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  const cases = [
    [idToken({ sub: 'x1' }, { privateKey: stranger }), 'INVALID_ID_TOKEN'],
    [idToken({ sub: 'x2' }, { kid: 'unknown' }), 'INVALID_ID_TOKEN'],
    [idToken({ sub: 'x3', aud: 'someone-else' }), 'WRONG_AUDIENCE'],
    [idToken({ sub: 'x4', iss: 'https://accounts.google.com' }), 'INVALID_ID_TOKEN'],
    [idToken({ sub: 'x5', exp: Math.floor(Date.now() / 1000) - 3600 }), 'ID_TOKEN_EXPIRED'],
    [idToken({ sub: 'x6' }, { alg: 'none' }), 'INVALID_ID_TOKEN'],
    ['nope', 'INVALID_ID_TOKEN'],
  ];
  for (const [token, error] of cases) {
    const out = await oidc(token);
    assert.equal(out.body.error, error, out.text);
  }
  assert.equal((await api.db.query('select count(*)::int as n from users')).rows[0].n, before);
});

test('without an issuer the route is off, the env reader ignores "unset", and the server still needs one sign-in method', async () => {
  const off = await api.call('POST', '/v1/auth/oidc', { body: { idToken: idToken() } });
  assert.equal(off.status, 200);
  const plain = await startApi();
  try {
    const out = await plain.call('POST', '/v1/auth/oidc', { body: { idToken: idToken() } });
    assert.equal(out.body.error, 'OIDC_SIGN_IN_UNAVAILABLE');
  } finally {
    await plain.close();
  }
  assert.deepEqual(oidcConfigFromEnv({ MYCA_OIDC_ISSUER: 'unset', MYCA_OIDC_CLIENT_IDS: 'unset' }), { issuer: '', clientIds: [], jwksUrl: '' });
  assert.deepEqual(oidcConfigFromEnv({ MYCA_OIDC_ISSUER: 'https://id.example/', MYCA_OIDC_CLIENT_IDS: 'a, b' }), { issuer: 'https://id.example', clientIds: ['a', 'b'], jwksUrl: '' });
  assert.throws(() => createApi({ db: api.db, secret: SECRET, otpSender: null, googleClientIds: [], oidc: {} }), /no sign-in method/);
});

test('keys are found through discovery when no JWKS url is given, and cached', async () => {
  const jwk = KEY.publicKey.export({ format: 'jwk' });
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).endsWith('/.well-known/openid-configuration')) return new Response(JSON.stringify({ jwks_uri: 'https://login.example.test/keys' }), { status: 200 });
    if (String(url) === 'https://login.example.test/keys') return new Response(JSON.stringify({ keys: [{ ...jwk, kid: 'realm-kid', use: 'sig' }] }), { status: 200, headers: { 'cache-control': 'max-age=600' } });
    return new Response('no', { status: 404 });
  };
  const verifier = createOidcVerifier({ issuer: OIDC_ISSUER, clientIds: [OIDC_CLIENT], fetchImpl });
  const first = await verifier.verify(idToken());
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.issuer, OIDC_ISSUER);
  const second = await verifier.verify(idToken({ sub: 'g2' }));
  assert.equal(second.sub, 'g2');
  assert.deepEqual(calls, [`${OIDC_ISSUER}/.well-known/openid-configuration`, 'https://login.example.test/keys']);
  const unreachable = createOidcVerifier({ issuer: OIDC_ISSUER, clientIds: [OIDC_CLIENT], keys: createJwksKeys({ url: 'https://down.example/keys', fetchImpl: async () => { throw new Error('down'); } }) });
  assert.equal((await unreachable.verify(idToken())).error, 'ISSUER_UNREACHABLE');
});
