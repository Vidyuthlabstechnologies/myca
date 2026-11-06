import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { base32Decode, totpCode } from '../src/totp.mjs';
import { ENROL_MAX_ATTEMPTS, RECOVERY_CODES, SECOND_STEP_MAX_ATTEMPTS, SECOND_STEP_TTL_SECONDS, createSecondFactor } from '../src/second-factor.mjs';
import { ACCESS_TTL_SECONDS, keyedHash } from '../src/tokens.mjs';
import { PRIVACY_NOTICE } from '../src/consent.mjs';
import { JOB_HEADER } from '../src/jobs.mjs';
import { startApi, googleToken, SECRET, BOOKS_KEY, OIDC_ISSUER, OIDC_CLIENT } from './helpers.mjs';

let api;
before(async () => { api = await startApi(); });
after(async () => { await api.close(); });

let nextPhone = 9300000000;
const freshPhone = () => `+91${nextPhone++}`;
const CODE_SHAPE = /^[abcdefghjkmnpqrstuvwxyz2-9]{5}-[abcdefghjkmnpqrstuvwxyz2-9]{5}$/;
const STEP_MS = 30_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const JOB_TOKEN = 'job-token-for-second-step-0123456789abcdef0123456789';
const NIL_UUID = '00000000-0000-4000-8000-000000000000';

const status = (token, on = api) => on.call('GET', '/v1/me/second-step', { token });
const begin = (token, on = api) => on.call('POST', '/v1/me/second-step/begin', { token });
const confirm = (token, code, on = api) => on.call('POST', '/v1/me/second-step/confirm', { token, body: { code } });
const disable = (token, code, on = api) => on.call('POST', '/v1/me/second-step/disable', { token, body: { code } });
const regenerate = (token, code, on = api) => on.call('POST', '/v1/me/second-step/recovery-codes', { token, body: { code } });
const secondStep = (challengeId, code, deviceLabel = 'second phone', on = api) => on.call('POST', '/v1/auth/second-step', { body: { challengeId, code, deviceLabel } });

const current = (secret, on = api) => totpCode(base32Decode(secret), on.clock.now);
const nearCodes = (secret, on = api) => [-STEP_MS, 0, STEP_MS].map((offset) => totpCode(base32Decode(secret), on.clock.now + offset));
const wrongCode = (secret, on = api) => ['000000', '111111', '222222'].find((code) => !nearCodes(secret, on).includes(code));

async function firstStep(phone, on = api) {
  const otp = await on.call('POST', '/v1/auth/otp', { body: { phone } });
  assert.equal(otp.status, 200, otp.text);
  return on.call('POST', '/v1/auth/verify', { body: { challengeId: otp.body.challengeId, phone, code: on.sender.last().code, deviceLabel: 'test phone' } });
}

async function enrol(phone, on = api) {
  const session = await on.signIn(phone);
  const started = await begin(session.accessToken, on);
  assert.equal(started.status, 200, started.text);
  const done = await confirm(session.accessToken, current(started.body.secret, on), on);
  assert.equal(done.status, 200, done.text);
  on.clock.advance(STEP_MS);
  return { session, token: session.accessToken, secret: started.body.secret, recoveryCodes: done.body.recoveryCodes };
}

test('enrolment: begin hands out the key once, confirm with the authenticator code turns two-step on and gives eight recovery codes', async () => {
  const phone = freshPhone();
  const session = await api.signIn(phone);
  const token = session.accessToken;
  assert.deepEqual((await status(token)).body, { ok: true, enabled: false, enabledAt: null, recoveryCodesLeft: 0 });

  const started = await begin(token);
  assert.equal(started.status, 200, started.text);
  const { secret, uri, account } = started.body;
  assert.match(secret, /^[A-Z2-7]{32}$/);
  assert.equal(account, phone);
  assert.equal(uri, `otpauth://totp/MyCA:${encodeURIComponent(phone)}?secret=${secret}&issuer=MyCA&algorithm=SHA1&digits=6&period=30`);

  const wrong = await confirm(token, wrongCode(secret));
  assert.equal(wrong.status, 400);
  assert.equal(wrong.body.error, 'INVALID_CODE');
  assert.equal(wrong.body.attemptsRemaining, ENROL_MAX_ATTEMPTS - 1);
  assert.equal((await status(token)).body.enabled, false);

  const done = await confirm(token, current(secret));
  assert.equal(done.status, 200, done.text);
  assert.equal(done.body.recoveryCodes.length, RECOVERY_CODES);
  for (const code of done.body.recoveryCodes) assert.match(code, CODE_SHAPE);
  assert.equal(new Set(done.body.recoveryCodes).size, RECOVERY_CODES);
  assert.equal(done.text.includes(secret), false, 'the key is shown at begin only');

  const on = await status(token);
  assert.equal(on.body.enabled, true);
  assert.equal(on.body.recoveryCodesLeft, RECOVERY_CODES);
  assert.match(on.body.enabledAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(on.text.includes(secret), false);

  const again = await begin(token);
  assert.equal(again.status, 409);
  assert.equal(again.body.error, 'ALREADY_ENABLED');
  assert.equal((await confirm(token, current(secret))).body.error, 'NOT_ENROLLING');

  const stored = await api.db.query('select secret_sealed, attempts, last_step from user_totp where user_id = $1', [session.user.id]);
  assert.match(stored.rows[0].secret_sealed, /^v1\./, 'the key is sealed at rest');
  assert.equal(stored.rows[0].secret_sealed.includes(secret), false);
  assert.equal(stored.rows[0].attempts, 0);
  assert.ok(stored.rows[0].last_step > 0, 'the step used to enrol is remembered');
  const hashes = await api.db.query('select code_hash from recovery_codes where user_id = $1', [session.user.id]);
  assert.equal(hashes.rows.length, RECOVERY_CODES);
  const dump = JSON.stringify(hashes.rows);
  for (const code of done.body.recoveryCodes) assert.equal(dump.includes(code.replace('-', '')), false, 'recovery codes are stored hashed');
  assert.deepEqual(
    hashes.rows.map((row) => row.code_hash).sort(),
    done.body.recoveryCodes.map((code) => keyedHash(SECRET, code.replace('-', ''))).sort(),
    'each code is stored as a keyed hash of its plain form',
  );
});

test('a setup that was started but not confirmed is not two-step: status stays off and sign-in is still one step', async () => {
  const phone = freshPhone();
  const token = (await api.signIn(phone)).accessToken;
  const started = await begin(token);
  assert.equal(started.status, 200, started.text);
  assert.deepEqual((await status(token)).body, { ok: true, enabled: false, enabledAt: null, recoveryCodesLeft: 0 });
  const plain = await firstStep(phone);
  assert.equal(plain.status, 200, plain.text);
  assert.ok(plain.body.accessToken, 'sign-in is one step until the first code is confirmed');
  assert.equal(plain.body.secondStep, undefined);
  assert.equal((await disable(token, current(started.body.secret))).body.error, 'NOT_ENABLED');
  assert.equal((await regenerate(token, current(started.body.secret))).body.error, 'NOT_ENABLED');
  const again = await begin(token);
  assert.equal(again.status, 200, 'a setup that was never confirmed can be started again');
  assert.notEqual(again.body.secret, started.body.secret);
});

test('five wrong codes during setup throw the setup away, and a new begin starts afresh', async () => {
  const token = (await api.signIn(freshPhone())).accessToken;
  const started = await begin(token);
  const secret = started.body.secret;
  const shapeless = await confirm(token, 'abc');
  assert.equal(shapeless.body.error, 'INVALID_CODE');
  assert.equal(shapeless.body.attemptsRemaining, ENROL_MAX_ATTEMPTS - 1);
  for (let i = 2; i < ENROL_MAX_ATTEMPTS; i++) {
    const out = await confirm(token, wrongCode(secret));
    assert.equal(out.body.error, 'INVALID_CODE');
    assert.equal(out.body.attemptsRemaining, ENROL_MAX_ATTEMPTS - i);
  }
  const last = await confirm(token, wrongCode(secret));
  assert.equal(last.status, 400);
  assert.equal(last.body.error, 'ENROLMENT_RESTART');
  assert.equal((await confirm(token, current(secret))).body.error, 'NOT_ENROLLING');
  assert.equal((await status(token)).body.enabled, false);
  const restarted = await begin(token);
  assert.equal(restarted.status, 200);
  assert.notEqual(restarted.body.secret, secret);
  assert.equal((await confirm(token, current(restarted.body.secret))).status, 200);
  assert.equal((await status(token)).body.enabled, true);
});

test('with two-step on, the phone code gives a challenge and the authenticator code gives the session; a code works once', async () => {
  const phone = freshPhone();
  const { session, secret } = await enrol(phone);
  const first = await firstStep(phone);
  assert.equal(first.status, 200, first.text);
  assert.equal(first.body.secondStep, true);
  assert.match(first.body.challengeId, /^[0-9a-f-]{36}$/);
  assert.equal(first.body.expiresInSeconds, SECOND_STEP_TTL_SECONDS);
  assert.equal(first.body.accessToken, undefined);
  assert.equal(first.body.refreshToken, undefined);
  assert.deepEqual(first.body.user, { id: session.user.id, name: '', isNew: false });
  assert.equal(first.body.consent.accepted, true);

  const code = current(secret);
  const signedIn = await secondStep(first.body.challengeId, `${code.slice(0, 3)} ${code.slice(3)}`);
  assert.equal(signedIn.status, 200, signedIn.text);
  assert.ok(signedIn.body.accessToken && signedIn.body.refreshToken);
  assert.equal(signedIn.body.expiresInSeconds, ACCESS_TTL_SECONDS);
  assert.deepEqual(signedIn.body.user, { id: session.user.id, name: '', isNew: false });
  assert.equal(signedIn.body.usedRecoveryCode, false);
  assert.equal(signedIn.body.recoveryCodesLeft, RECOVERY_CODES);
  assert.equal(signedIn.body.consent.accepted, true);
  const me = await api.call('GET', '/v1/me', { token: signedIn.body.accessToken });
  assert.equal(me.status, 200, me.text);
  assert.equal(me.body.user.id, session.user.id);

  const replay = await secondStep(first.body.challengeId, code);
  assert.equal(replay.body.error, 'CODE_USED');
  const second = await firstStep(phone);
  const reused = await secondStep(second.body.challengeId, code);
  assert.equal(reused.status, 400);
  assert.equal(reused.body.error, 'INVALID_CODE', 'the same authenticator code is not accepted twice');
  api.clock.advance(STEP_MS);
  const fresh = await secondStep(second.body.challengeId, current(secret));
  assert.equal(fresh.status, 200, fresh.text);
  const devices = await api.db.query('select label from devices where user_id = $1 order by created_at', [session.user.id]);
  assert.deepEqual(devices.rows.map((row) => row.label), ['test phone', 'second phone', 'second phone']);
  const challenges = await api.db.query('select * from second_step_challenges where user_id = $1', [session.user.id]);
  assert.equal(JSON.stringify(challenges.rows).includes(code), false, 'no code is ever stored on a challenge');
});

test('wrong second-step codes are counted, the sixth try is refused even when right, and a challenge expires after five minutes', async () => {
  const phone = freshPhone();
  const { secret } = await enrol(phone);
  const first = await firstStep(phone);
  const wrong = wrongCode(secret);
  for (let i = 0; i < SECOND_STEP_MAX_ATTEMPTS; i++) {
    const out = await secondStep(first.body.challengeId, wrong);
    assert.equal(out.status, 400);
    assert.equal(out.body.error, 'INVALID_CODE');
    assert.equal(out.body.attemptsRemaining, SECOND_STEP_MAX_ATTEMPTS - i - 1);
  }
  const locked = await secondStep(first.body.challengeId, current(secret));
  assert.equal(locked.status, 429);
  assert.equal(locked.body.error, 'TOO_MANY_ATTEMPTS');

  const second = await firstStep(phone);
  api.clock.advance(301000);
  const late = await secondStep(second.body.challengeId, current(secret));
  assert.equal(late.body.error, 'CODE_EXPIRED');

  const bodies = [
    {},
    { challengeId: 'x', code: '123456' },
    { challengeId: second.body.challengeId, code: '1234' },
    { challengeId: second.body.challengeId, code: 'abcde-fghjk-m' },
    { challengeId: '11111111-1111-4111-8111-111111111111', code: '123456' },
  ];
  for (const body of bodies) {
    const out = await api.call('POST', '/v1/auth/second-step', { body });
    assert.equal(out.status, 400, JSON.stringify(body));
    assert.equal(out.body.error, 'INVALID_CODE', JSON.stringify(body));
  }
  const attempts = await api.db.query('select attempts from second_step_challenges where id = $1', [second.body.challengeId]);
  assert.equal(attempts.rows[0].attempts, 0, 'malformed and late codes are refused before they count');
});

async function openChallenges(userId, count) {
  const ids = [];
  for (let i = 0; i < count; i++) {
    const row = await api.db.query(
      'insert into second_step_challenges (user_id, device_label, created_at, expires_at) values ($1, $2, $3, $4) returning id',
      [userId, 'racer', new Date(api.clock.now), new Date(api.clock.now + SECOND_STEP_TTL_SECONDS * 1000)],
    );
    ids.push(row.rows[0].id);
  }
  return ids;
}

test('eight sign-ins racing with the same authenticator code let exactly one in', async () => {
  const { session, secret } = await enrol(freshPhone());
  const ids = await openChallenges(session.user.id, 8);
  const code = current(secret);
  const results = await Promise.all(ids.map((id) => secondStep(id, code)));
  assert.equal(results.filter((result) => result.status === 200).length, 1, results.map((result) => result.status).join(','));
  for (const result of results.filter((item) => item.status !== 200)) {
    assert.equal(result.status, 400);
    assert.equal(result.body.error, 'INVALID_CODE');
  }
});

test('eight sign-ins racing with the same recovery code let exactly one in, and it is spent once', async () => {
  const { session, recoveryCodes, token } = await enrol(freshPhone());
  const ids = await openChallenges(session.user.id, 8);
  const results = await Promise.all(ids.map((id) => secondStep(id, recoveryCodes[3])));
  assert.equal(results.filter((result) => result.status === 200).length, 1, results.map((result) => result.status).join(','));
  for (const result of results.filter((item) => item.status !== 200)) {
    assert.equal(result.status, 400);
    assert.equal(result.body.error, 'INVALID_CODE');
  }
  assert.equal((await status(token)).body.recoveryCodesLeft, RECOVERY_CODES - 1);
});

test('a recovery code signs in once, however it is typed, and the count of codes left drops', async () => {
  const phone = freshPhone();
  const { recoveryCodes, token } = await enrol(phone);
  const first = await firstStep(phone);
  const typed = ` ${recoveryCodes[0].toUpperCase().replace('-', ' ')} `;
  const signedIn = await secondStep(first.body.challengeId, typed);
  assert.equal(signedIn.status, 200, signedIn.text);
  assert.equal(signedIn.body.usedRecoveryCode, true);
  assert.equal(signedIn.body.recoveryCodesLeft, RECOVERY_CODES - 1);
  assert.equal((await status(token)).body.recoveryCodesLeft, RECOVERY_CODES - 1);

  const second = await firstStep(phone);
  const again = await secondStep(second.body.challengeId, recoveryCodes[0]);
  assert.equal(again.body.error, 'INVALID_CODE', 'a recovery code is spent after one use');
  assert.equal(again.body.attemptsRemaining, SECOND_STEP_MAX_ATTEMPTS - 1);
  const next = await secondStep(second.body.challengeId, recoveryCodes[1]);
  assert.equal(next.status, 200, next.text);
  assert.equal(next.body.recoveryCodesLeft, RECOVERY_CODES - 2);

  const third = await firstStep(phone);
  const madeUp = await secondStep(third.body.challengeId, 'aaaaa-aaaaa');
  assert.equal(madeUp.body.error, 'INVALID_CODE');
  const used = await api.db.query('select count(*)::int as n from recovery_codes r join users u on u.id = r.user_id where u.phone = $1 and r.used_at is not null', [phone]);
  assert.equal(used.rows[0].n, 2);
});

test('Google sign-in also stops at the second step when it is on', async () => {
  const google = () => api.call('POST', '/v1/auth/google', { body: { idToken: googleToken({ sub: 'totp-google-1', name: 'Asha Rao' }), deviceLabel: 'Pixel 7' } });
  const signed = await google();
  assert.ok(signed.body.accessToken, signed.text);
  const token = signed.body.accessToken;
  assert.equal((await api.call('POST', '/v1/me/consent', { token, body: { document: PRIVACY_NOTICE.document, version: PRIVACY_NOTICE.version } })).status, 200);
  const started = await begin(token);
  assert.equal(started.status, 200, started.text);
  assert.equal(started.body.account, 'asha@example.com', 'a Google user is named by email in the authenticator app');
  assert.equal((await confirm(token, current(started.body.secret))).status, 200);
  api.clock.advance(STEP_MS);
  const again = await google();
  assert.equal(again.status, 200, again.text);
  assert.equal(again.body.secondStep, true);
  assert.equal(again.body.accessToken, undefined);
  assert.deepEqual(again.body.user, { id: signed.body.user.id, name: 'Asha Rao', isNew: false });
  assert.equal(again.body.consent.accepted, true);
  const done = await secondStep(again.body.challengeId, current(started.body.secret), 'Pixel 7');
  assert.equal(done.status, 200, done.text);
  assert.equal((await api.call('GET', '/v1/me', { token: done.body.accessToken })).body.user.name, 'Asha Rao');
  const labels = await api.db.query('select label from devices where user_id = $1 order by created_at', [signed.body.user.id]);
  assert.deepEqual(labels.rows.map((row) => row.label), ['Pixel 7', 'Pixel 7']);
});

test('OpenID Connect sign-in also stops at the second step when it is on', async () => {
  const key = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const keys = { get: async (kid) => (kid === 'second-step-kid' ? key.publicKey : null) };
  const idToken = () => {
    const seconds = Math.floor(Date.now() / 1000);
    const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const signing = `${part({ alg: 'RS256', kid: 'second-step-kid', typ: 'JWT' })}.${part({ iss: OIDC_ISSUER, aud: OIDC_CLIENT, sub: 'ss-oidc-1', email: 'ravi@example.com', email_verified: true, name: 'Ravi Kumar', iat: seconds, exp: seconds + 3600 })}`;
    return `${signing}.${createSign('RSA-SHA256').update(signing).sign(key.privateKey).toString('base64url')}`;
  };
  const other = await startApi({ oidc: { issuer: OIDC_ISSUER, clientIds: [OIDC_CLIENT] }, oidcKeys: keys });
  try {
    const oidc = () => other.call('POST', '/v1/auth/oidc', { body: { idToken: idToken(), deviceLabel: 'Pixel 8' } });
    const signed = await oidc();
    assert.ok(signed.body.accessToken, signed.text);
    const token = signed.body.accessToken;
    assert.equal((await other.call('POST', '/v1/me/consent', { token, body: { document: PRIVACY_NOTICE.document, version: PRIVACY_NOTICE.version } })).status, 200);
    const started = await begin(token, other);
    assert.equal(started.status, 200, started.text);
    assert.equal(started.body.account, 'ravi@example.com');
    assert.equal((await confirm(token, current(started.body.secret, other), other)).status, 200);
    other.clock.advance(STEP_MS);
    const again = await oidc();
    assert.equal(again.status, 200, again.text);
    assert.equal(again.body.secondStep, true);
    assert.equal(again.body.accessToken, undefined);
    assert.deepEqual(again.body.user, { id: signed.body.user.id, name: 'Ravi Kumar', isNew: false });
    assert.equal(again.body.consent.accepted, true);
    const done = await secondStep(again.body.challengeId, current(started.body.secret, other), 'Pixel 8', other);
    assert.equal(done.status, 200, done.text);
    assert.equal((await other.call('GET', '/v1/me', { token: done.body.accessToken })).body.user.id, signed.body.user.id);
  } finally {
    await other.close();
  }
});

test('turning two-step off needs a code and makes sign-in one step again; new recovery codes retire the old ones', async () => {
  const phone = freshPhone();
  const { session, secret, recoveryCodes, token } = await enrol(phone);
  assert.equal((await regenerate(token, wrongCode(secret))).body.error, 'INVALID_CODE');
  const renewed = await regenerate(token, current(secret));
  assert.equal(renewed.status, 200, renewed.text);
  assert.equal(renewed.body.recoveryCodes.length, RECOVERY_CODES);
  assert.equal(renewed.body.recoveryCodes.some((code) => recoveryCodes.includes(code)), false);
  assert.equal((await status(token)).body.recoveryCodesLeft, RECOVERY_CODES);
  const first = await firstStep(phone);
  assert.equal((await secondStep(first.body.challengeId, recoveryCodes[0])).body.error, 'INVALID_CODE', 'an old recovery code is dead');
  assert.equal((await secondStep(first.body.challengeId, renewed.body.recoveryCodes[0])).status, 200);

  assert.equal((await disable(token, wrongCode(secret))).body.error, 'INVALID_CODE');
  assert.equal((await disable(token, 'aaaaa-aaaaa')).body.error, 'INVALID_CODE');
  assert.equal((await status(token)).body.enabled, true);
  const off = await disable(token, renewed.body.recoveryCodes[1]);
  assert.equal(off.status, 200, off.text);
  assert.deepEqual(off.body, { ok: true });
  assert.deepEqual((await status(token)).body, { ok: true, enabled: false, enabledAt: null, recoveryCodesLeft: 0 });
  assert.equal((await disable(token, current(secret))).body.error, 'NOT_ENABLED');
  assert.equal((await regenerate(token, current(secret))).body.error, 'NOT_ENABLED');
  const left = await api.db.query(
    'select (select count(*)::int from user_totp where user_id = $1) as totp, (select count(*)::int from recovery_codes where user_id = $1) as codes',
    [session.user.id],
  );
  assert.deepEqual(left.rows[0], { totp: 0, codes: 0 });

  const plain = await firstStep(phone);
  assert.equal(plain.status, 200, plain.text);
  assert.ok(plain.body.accessToken, 'sign-in is one step again');
  assert.equal(plain.body.secondStep, undefined);
  assert.ok((await api.signIn(phone)).accessToken);
});

test('turning two-step off with the authenticator code works too, and a new setup can start afterwards', async () => {
  const { session, secret, token } = await enrol(freshPhone());
  const code = current(secret);
  const off = await disable(token, code);
  assert.equal(off.status, 200, off.text);
  assert.equal((await status(token)).body.enabled, false);
  const again = await begin(token);
  assert.equal(again.status, 200, 'a new setup can start after turning it off');
  const row = await api.db.query('select enabled_at, last_step, attempts from user_totp where user_id = $1', [session.user.id]);
  assert.equal(row.rows[0].enabled_at, null);
  assert.equal(Number(row.rows[0].last_step), 0);
  assert.equal(row.rows[0].attempts, 0);
});

test('deleting the account removes the authenticator key, the recovery codes and any open challenge, so the number signs in afresh in one step', async () => {
  const phone = freshPhone();
  const { session, token, secret } = await enrol(phone);
  const pending = await firstStep(phone);
  assert.equal(pending.body.secondStep, true);
  const deleted = await api.call('DELETE', '/v1/me', { token });
  assert.equal(deleted.status, 200, deleted.text);
  const left = await api.db.query(
    `select (select count(*)::int from user_totp where user_id = $1) as totp,
            (select count(*)::int from recovery_codes where user_id = $1) as codes,
            (select count(*)::int from second_step_challenges where user_id = $1) as challenges`,
    [session.user.id],
  );
  assert.deepEqual(left.rows[0], { totp: 0, codes: 0, challenges: 0 });
  const stale = await secondStep(pending.body.challengeId, current(secret));
  assert.equal(stale.body.error, 'INVALID_CODE');
  const again = await firstStep(phone);
  assert.equal(again.status, 200, again.text);
  assert.ok(again.body.accessToken, 'the number is not asked for an authenticator it no longer has');
  assert.equal(again.body.secondStep, undefined);
});

test('the authenticator key is sealed per user under the service key, and kept plain only when the service has no key', async () => {
  const phone = freshPhone();
  const { session, secret } = await enrol(phone);
  const stored = (await api.db.query('select secret_sealed from user_totp where user_id = $1', [session.user.id])).rows[0].secret_sealed;
  const sealer = createSecondFactor({ db: api.db, secret: SECRET, booksKey: BOOKS_KEY });
  assert.equal(sealer.openSecret(session.user.id, stored), secret);
  assert.throws(() => sealer.openSecret(NIL_UUID, stored), /could not be opened/, 'another user\'s key does not open it');
  assert.throws(() => createSecondFactor({ db: api.db, secret: SECRET, booksKey: `wrong-${BOOKS_KEY}` }).openSecret(session.user.id, stored), /could not be opened/);
  assert.throws(() => createSecondFactor({ db: api.db, secret: SECRET, booksKey: '' }).openSecret(session.user.id, stored), /no MYCA_BOOKS_KEY/);
  assert.notEqual(sealer.sealSecret(session.user.id, secret), sealer.sealSecret(session.user.id, secret), 'a fresh nonce every time');

  const local = await startApi({ booksKey: '' });
  try {
    const kept = await enrol(freshPhone(), local);
    const plain = (await local.db.query('select secret_sealed from user_totp where user_id = $1', [kept.session.user.id])).rows[0].secret_sealed;
    assert.equal(plain, kept.secret, 'with no service key the key is stored as it is, for local development only');
    const challenge = await firstStep((await local.db.query('select phone from users where id = $1', [kept.session.user.id])).rows[0].phone, local);
    assert.equal(challenge.body.secondStep, true);
    const done = await secondStep(challenge.body.challengeId, current(kept.secret, local), 'local phone', local);
    assert.equal(done.status, 200, done.text);
  } finally {
    await local.close();
  }
});

test('the nightly job deletes second-step challenges older than a day and keeps newer ones', async () => {
  const jobs = await startApi({ jobToken: JOB_TOKEN });
  try {
    const phone = freshPhone();
    const { session } = await enrol(phone, jobs);
    const old = await firstStep(phone, jobs);
    assert.equal(old.body.secondStep, true);
    jobs.clock.advance(2 * DAY_MS);
    const recent = await firstStep(phone, jobs);
    assert.equal(recent.body.secondStep, true);
    const job = await jobs.call('POST', '/v1/jobs/daily', { headers: { [JOB_HEADER]: JOB_TOKEN } });
    assert.equal(job.status, 200, job.text);
    assert.equal(job.body.purge.secondStepRows, 1, JSON.stringify(job.body.purge));
    const left = await jobs.db.query('select id from second_step_challenges where user_id = $1', [session.user.id]);
    assert.deepEqual(left.rows.map((row) => row.id), [recent.body.challengeId]);
  } finally {
    await jobs.close();
  }
});

test('the second-step settings sit behind the privacy notice like every other account route', async () => {
  const silent = await api.signIn(freshPhone(), { agree: false });
  for (const [method, path] of [['GET', '/v1/me/second-step'], ['POST', '/v1/me/second-step/begin'], ['GET', '/v1/me/devices']]) {
    const out = await api.call(method, path, { token: silent.accessToken });
    assert.equal(out.status, 403, `${method} ${path}`);
    assert.equal(out.body.error, 'CONSENT_REQUIRED');
  }
  assert.equal((await api.call('GET', '/v1/me/second-step/nothing', { token: silent.accessToken })).status, 403);
});
