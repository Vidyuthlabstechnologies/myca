import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createApi } from '../src/api.mjs';
import { createGoogleKeys } from '../src/google.mjs';
import { PRIVACY_NOTICE } from '../src/consent.mjs';
import { startApi, googleToken, SECRET, GOOGLE_CLIENT, TEST_GOOGLE_KEYS } from './helpers.mjs';

let api;
before(async () => { api = await startApi(); });
after(async () => { await api.close(); });

const google = (idToken) => api.call('POST', '/v1/auth/google', { body: { idToken, deviceLabel: 'Pixel 7' } });
const users = async () => (await api.db.query('select id, phone, google_sub, email, name from users order by created_at')).rows;

test('the app can ask which sign-in methods are on', async () => {
  const out = await api.call('GET', '/v1/auth/methods');
  assert.deepEqual(out.body, { ok: true, phone: true, google: true, oidc: false });
});

test('a valid Google token signs a new user in, with their name and a session, and asks for consent', async () => {
  const out = await google(googleToken({ sub: '1001', name: 'Asha Rao', email: 'asha@example.com' }));
  assert.equal(out.status, 200, out.text);
  assert.ok(out.body.accessToken && out.body.refreshToken);
  assert.equal(out.body.user.name, 'Asha Rao');
  assert.equal(out.body.user.isNew, true);
  assert.equal(out.body.consent.accepted, false);
  const [row] = (await users()).filter((user) => user.google_sub === '1001');
  assert.equal(row.phone, null);
  assert.equal(row.email, 'asha@example.com');

  const again = await google(googleToken({ sub: '1001', name: 'Someone Else' }));
  assert.equal(again.body.user.id, out.body.user.id);
  assert.equal(again.body.user.isNew, false);
  assert.equal(again.body.user.name, 'Asha Rao', 'a later Google name does not overwrite the one kept');
});

test('a Google user works like any other: consent, a business, the books, no invitations', async () => {
  const signed = (await google(googleToken({ sub: '1002' }))).body;
  const token = signed.accessToken;
  assert.equal((await api.call('POST', '/v1/me/consent', { token, body: { document: PRIVACY_NOTICE.document, version: PRIVACY_NOTICE.version, adult: true } })).status, 200);
  const created = await api.call('POST', '/v1/businesses', { token, body: { name: 'Rao Textiles', state: '29' } });
  assert.equal(created.status, 200, created.text);
  const snapshot = await api.call('GET', `/v1/businesses/${created.body.business.id}/snapshot`, { token });
  assert.equal(snapshot.body.company.name, 'Rao Textiles');
  const me = await api.call('GET', '/v1/me', { token });
  assert.deepEqual(me.body.invitations, []);
});

test('forged, foreign, expired or malformed tokens are refused and create no one', async () => {
  const before = (await users()).length;
  const stranger = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  const cases = [
    [googleToken({ sub: '2001' }, { privateKey: stranger }), 'INVALID_GOOGLE_TOKEN'],
    [googleToken({ sub: '2002' }, { kid: 'unknown-kid' }), 'INVALID_GOOGLE_TOKEN'],
    [googleToken({ sub: '2003', aud: 'someone-else.apps.googleusercontent.com' }), 'WRONG_AUDIENCE'],
    [googleToken({ sub: '2004', iss: 'https://evil.example' }), 'INVALID_GOOGLE_TOKEN'],
    [googleToken({ sub: '2005', exp: Math.floor(Date.now() / 1000) - 3600 }), 'GOOGLE_TOKEN_EXPIRED'],
    [googleToken({ sub: '2006' }, { alg: 'none' }), 'INVALID_GOOGLE_TOKEN'],
    ['not-a-token', 'INVALID_GOOGLE_TOKEN'],
    [undefined, 'INVALID_GOOGLE_TOKEN'],
  ];
  for (const [token, error] of cases) {
    const out = await google(token);
    assert.equal(out.status, 400, `${error}: ${out.text}`);
    assert.equal(out.body.error, error);
  }
  assert.equal((await users()).length, before);
});

test('an unverified email is not stored', async () => {
  await google(googleToken({ sub: '1003', email: 'unverified@example.com', email_verified: false }));
  const [row] = (await users()).filter((user) => user.google_sub === '1003');
  assert.equal(row.email, null);
});

test('without an SMS sender the service starts on Google alone and says phone sign-in is off', async () => {
  const googleOnly = await startApi({ phone: false });
  try {
    assert.deepEqual((await googleOnly.call('GET', '/v1/auth/methods')).body, { ok: true, phone: false, google: true, oidc: false });
    const otp = await googleOnly.call('POST', '/v1/auth/otp', { body: { phone: '9876543210' } });
    assert.equal(otp.status, 503);
    assert.equal(otp.body.error, 'PHONE_SIGN_IN_UNAVAILABLE');
  } finally {
    await googleOnly.close();
  }
  assert.throws(() => createApi({ db: api.db, secret: SECRET, otpSender: null, googleClientIds: [] }), /no sign-in method/);
  assert.doesNotThrow(() => createApi({ db: api.db, secret: SECRET, otpSender: null, googleClientIds: [GOOGLE_CLIENT], googleKeys: TEST_GOOGLE_KEYS }));
});

test('Google signing keys are fetched once, cached for their max-age, and refetched for a new key', async () => {
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
  let clock = 0;
  let fetches = 0;
  let served = [jwk];
  const fetchImpl = async () => {
    fetches += 1;
    return { ok: true, headers: new Headers({ 'cache-control': 'public, max-age=100' }), json: async () => ({ keys: served }) };
  };
  const keys = createGoogleKeys({ fetchImpl, now: () => clock });
  assert.ok(await keys.get('k1'));
  assert.ok(await keys.get('k1'));
  assert.equal(fetches, 1);
  assert.equal(await keys.get('k2'), null);
  assert.equal(fetches, 1, 'an unknown key within a minute of the last load does not refetch');
  clock = 61 * 1000;
  assert.equal(await keys.get('k2'), null);
  assert.equal(fetches, 2, 'after a minute an unknown key triggers one refetch');
  clock = 161 * 1000;
  served = [{ ...jwk, kid: 'k2' }];
  assert.ok(await keys.get('k2'));
  assert.equal(await keys.get('k1'), null, 'a rotated-out key is gone');
});
