import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { base32Decode, totpCode } from '../src/totp.mjs';
import { ENROL_MAX_ATTEMPTS, RECOVERY_CODES, SECOND_STEP_MAX_ATTEMPTS, SECOND_STEP_TTL_SECONDS, createSecondFactor } from '../src/second-factor.mjs';
import { startApi, SECRET, BOOKS_KEY } from './helpers.mjs';

let api;
before(async () => { api = await startApi(); });
after(async () => { await api.close(); });

let nextPhone = 9400000000;
const freshPhone = () => `+91${nextPhone++}`;
const STEP_MS = 30_000;
const CHANGE_TRIES = 5;
const COOL_DOWN_MS = 15 * 60 * 1000;
const GAPS_TABLE = new URL('../../docs/architecture/SECURITY-AND-PRIVACY.md', import.meta.url);

const status = (token) => api.call('GET', '/v1/me/second-step', { token });
const begin = (token) => api.call('POST', '/v1/me/second-step/begin', { token });
const confirm = (token, code) => api.call('POST', '/v1/me/second-step/confirm', { token, body: { code } });
const disable = (token, code) => api.call('POST', '/v1/me/second-step/disable', { token, body: { code } });
const regenerate = (token, code) => api.call('POST', '/v1/me/second-step/recovery-codes', { token, body: { code } });
const secondStep = (challengeId, code) => api.call('POST', '/v1/auth/second-step', { body: { challengeId, code, deviceLabel: 'limits phone' } });

const current = (secret) => totpCode(base32Decode(secret), api.clock.now);
const nearCodes = (secret) => [-STEP_MS, 0, STEP_MS].map((offset) => totpCode(base32Decode(secret), api.clock.now + offset));
const wrongCode = (secret) => ['000000', '111111', '222222'].find((code) => !nearCodes(secret).includes(code));

async function firstStep(phone) {
  const otp = await api.call('POST', '/v1/auth/otp', { body: { phone } });
  assert.equal(otp.status, 200, otp.text);
  return api.call('POST', '/v1/auth/verify', { body: { challengeId: otp.body.challengeId, phone, code: api.sender.last().code, deviceLabel: 'test phone' } });
}

async function enrol(phone) {
  const session = await api.signIn(phone);
  const started = await begin(session.accessToken);
  assert.equal(started.status, 200, started.text);
  const done = await confirm(session.accessToken, current(started.body.secret));
  assert.equal(done.status, 200, done.text);
  api.clock.advance(STEP_MS);
  return { session, secret: started.body.secret, recoveryCodes: done.body.recoveryCodes };
}

async function renew(session) {
  const out = await api.call('POST', '/v1/auth/refresh', { body: { refreshToken: session.refreshToken } });
  assert.equal(out.status, 200, out.text);
  session.accessToken = out.body.accessToken;
  session.refreshToken = out.body.refreshToken;
  return session.accessToken;
}

async function useUpTries(call, token, secret) {
  for (let tried = 1; tried <= CHANGE_TRIES; tried++) {
    const out = await call(token, wrongCode(secret));
    assert.equal(out.status, 400, `try ${tried}`);
    assert.equal(out.body.error, 'INVALID_CODE', `try ${tried}`);
  }
}

async function openChallenges(userId, count) {
  const ids = [];
  for (let i = 0; i < count; i++) {
    const row = await api.db.query(
      'insert into second_step_challenges (user_id, device_label, created_at, expires_at) values ($1, $2, $3, $4) returning id',
      [userId, 'limits', new Date(api.clock.now), new Date(api.clock.now + SECOND_STEP_TTL_SECONDS * 1000)],
    );
    ids.push(row.rows[0].id);
  }
  return ids;
}

function gapRows() {
  const text = readFileSync(GAPS_TABLE, 'utf8');
  const start = text.indexOf('## 4. Gaps');
  const end = text.indexOf('\n## ', start + 1);
  return text.slice(start, end).split('\n').filter((line) => line.startsWith('|') && /two-step|second-step/i.test(line));
}

function documentedOperatorSteps() {
  const row = gapRows().find((line) => /own authenticator/i.test(line));
  assert.ok(row, 'the security gaps table has a row for a session that switches two-step on with its own authenticator');
  const steps = [...row.matchAll(/`((?:delete|update) [^`]+)`/g)].map((match) => match[1].replaceAll('...', () => '$1'));
  assert.equal(steps.length, 3, steps.join(' | '));
  return steps;
}

test('turning two-step off: five wrong codes in a row lock it, even the right code is refused, and it opens again fifteen minutes after the fifth', async () => {
  const { session, secret, recoveryCodes } = await enrol(freshPhone());
  await useUpTries(disable, session.accessToken, secret);

  const locked = await disable(session.accessToken, current(secret));
  assert.equal(locked.status, 429, locked.text);
  assert.equal(locked.body.error, 'TOO_MANY_ATTEMPTS');
  const spare = await disable(session.accessToken, recoveryCodes[0]);
  assert.equal(spare.status, 429, 'a recovery code is refused while it is locked');
  assert.equal((await status(session.accessToken)).body.enabled, true);

  api.clock.advance(10 * 60 * 1000);
  const midway = await disable(await renew(session), current(secret));
  assert.equal(midway.status, 429, 'trying again while it is locked does not start the wait over');

  api.clock.advance(COOL_DOWN_MS - 10 * 60 * 1000 - 1);
  const early = await disable(await renew(session), current(secret));
  assert.equal(early.status, 429, 'still locked one millisecond before fifteen minutes are up');

  api.clock.advance(1);
  const off = await disable(await renew(session), current(secret));
  assert.equal(off.status, 200, off.text);
  assert.deepEqual(off.body, { ok: true });
  assert.equal((await status(session.accessToken)).body.enabled, false);
});

test('new recovery codes: five wrong codes lock it, the codes in hand stay as they are, and the right code works again fifteen minutes after the fifth', async () => {
  const { session, secret, recoveryCodes } = await enrol(freshPhone());
  const held = () => api.db.query('select code_hash, used_at from recovery_codes where user_id = $1 order by code_hash', [session.user.id]);
  const before = await held();
  await useUpTries(regenerate, session.accessToken, secret);

  const locked = await regenerate(session.accessToken, current(secret));
  assert.equal(locked.status, 429, locked.text);
  assert.equal(locked.body.error, 'TOO_MANY_ATTEMPTS');
  assert.deepEqual((await held()).rows, before.rows, 'a refused request changes no recovery code');

  api.clock.advance(COOL_DOWN_MS - 1);
  const early = await regenerate(await renew(session), current(secret));
  assert.equal(early.status, 429, 'still locked one millisecond before fifteen minutes are up');

  api.clock.advance(1);
  const fresh = await regenerate(await renew(session), wrongCode(secret));
  assert.deepEqual(fresh.body, { ok: false, error: 'INVALID_CODE', attemptsRemaining: CHANGE_TRIES - 1 }, 'a wrong code after the wait counts from one');
  const renewed = await regenerate(await renew(session), current(secret));
  assert.equal(renewed.status, 200, renewed.text);
  assert.equal(renewed.body.recoveryCodes.length, RECOVERY_CODES);
  assert.equal(renewed.body.recoveryCodes.some((code) => recoveryCodes.includes(code)), false);
});

test('turning off and new recovery codes share one count, and a right code clears it', async () => {
  const { session, secret } = await enrol(freshPhone());
  const token = session.accessToken;
  for (let tried = 1; tried <= 2; tried++) assert.equal((await disable(token, wrongCode(secret))).body.attemptsRemaining, CHANGE_TRIES - tried);
  for (let tried = 3; tried <= 4; tried++) assert.equal((await regenerate(token, wrongCode(secret))).body.attemptsRemaining, CHANGE_TRIES - tried);

  const cleared = await regenerate(token, current(secret));
  assert.equal(cleared.status, 200, cleared.text);
  for (let tried = 1; tried <= 4; tried++) {
    const out = await disable(token, wrongCode(secret));
    assert.equal(out.body.error, 'INVALID_CODE', `try ${tried} after the right code`);
    assert.equal(out.body.attemptsRemaining, CHANGE_TRIES - tried, `try ${tried} after the right code`);
  }

  api.clock.advance(STEP_MS);
  assert.equal((await regenerate(token, wrongCode(secret))).body.attemptsRemaining, 0);
  assert.equal((await disable(token, current(secret))).status, 429, 'five wrong codes across both routes lock both');
  assert.equal((await regenerate(token, current(secret))).status, 429);
});

for (const kind of ['authenticator code', 'recovery code']) {
  test(`a good ${kind} at a second-step sign-in clears the lock on turning off`, async () => {
    const phone = freshPhone();
    const { session, secret, recoveryCodes } = await enrol(phone);
    await useUpTries(disable, session.accessToken, secret);
    assert.equal((await disable(session.accessToken, current(secret))).status, 429);

    const challenge = await firstStep(phone);
    assert.equal(challenge.body.secondStep, true);
    const proof = kind === 'recovery code' ? recoveryCodes[0] : current(secret);
    const signedIn = await secondStep(challenge.body.challengeId, proof);
    assert.equal(signedIn.status, 200, signedIn.text);

    const fresh = await disable(session.accessToken, wrongCode(secret));
    assert.deepEqual(fresh.body, { ok: false, error: 'INVALID_CODE', attemptsRemaining: CHANGE_TRIES - 1 });
    api.clock.advance(STEP_MS);
    const off = await disable(session.accessToken, current(secret));
    assert.equal(off.status, 200, off.text);
  });
}

test('setup tries, sign-in tries and the tries for turning two-step off are kept apart', async () => {
  const phone = freshPhone();
  const session = await api.signIn(phone);
  const started = await begin(session.accessToken);
  for (let tried = 1; tried <= CHANGE_TRIES + 1; tried++) {
    const out = await disable(session.accessToken, wrongCode(started.body.secret));
    assert.equal(out.body.error, 'NOT_ENABLED', `try ${tried} while the setup is pending`);
    assert.equal(out.body.attemptsRemaining, undefined);
  }
  for (let tried = 1; tried <= 3; tried++) {
    const out = await confirm(session.accessToken, wrongCode(started.body.secret));
    assert.equal(out.body.attemptsRemaining, ENROL_MAX_ATTEMPTS - tried);
  }
  const done = await confirm(session.accessToken, current(started.body.secret));
  assert.equal(done.status, 200, done.text);
  api.clock.advance(STEP_MS);
  const afterSetup = await disable(session.accessToken, wrongCode(started.body.secret));
  assert.equal(afterSetup.body.attemptsRemaining, CHANGE_TRIES - 1, 'the setup tries are not carried over');
  assert.equal((await regenerate(session.accessToken, current(started.body.secret))).status, 200);

  const challenge = await firstStep(phone);
  for (let tried = 1; tried <= 4; tried++) {
    const out = await secondStep(challenge.body.challengeId, wrongCode(started.body.secret));
    assert.equal(out.body.attemptsRemaining, SECOND_STEP_MAX_ATTEMPTS - tried);
  }
  const afterSignIn = await disable(session.accessToken, wrongCode(started.body.secret));
  assert.equal(afterSignIn.body.attemptsRemaining, CHANGE_TRIES - 1, 'the sign-in tries are counted on the challenge, not here');
});

test('wrong codes sent at the same moment cannot get past the limit', async () => {
  const { session, secret } = await enrol(freshPhone());
  const wrong = wrongCode(secret);
  const results = await Promise.all(Array.from({ length: 8 }, () => disable(session.accessToken, wrong)));
  const counted = results.filter((out) => out.status === 400);
  const refused = results.filter((out) => out.status === 429);
  assert.equal(counted.length, CHANGE_TRIES, results.map((out) => out.status).join(','));
  assert.equal(refused.length, results.length - CHANGE_TRIES, results.map((out) => out.status).join(','));
  assert.deepEqual(counted.map((out) => out.body.attemptsRemaining).sort(), [0, 1, 2, 3, 4]);
  assert.equal((await disable(session.accessToken, current(secret))).status, 429);
  const row = await api.db.query('select attempts from user_totp where user_id = $1', [session.user.id]);
  assert.equal(row.rows[0].attempts, CHANGE_TRIES);
});

test('input that is not even shaped like a code counts as a wrong code', async () => {
  const { session, secret } = await enrol(freshPhone());
  for (const given of [undefined, '', 'abc', '12345', 'abcde-fghjk-m']) {
    const out = await disable(session.accessToken, given);
    assert.equal(out.status, 400, String(given));
    assert.equal(out.body.error, 'INVALID_CODE', String(given));
  }
  const locked = await disable(session.accessToken, current(secret));
  assert.equal(locked.status, 429, locked.text);
});

test('the lock belongs to the account: a renewed access token is still locked, and another account is not', async () => {
  const one = await enrol(freshPhone());
  const two = await enrol(freshPhone());
  await useUpTries(regenerate, one.session.accessToken, one.secret);
  const renewed = await renew(one.session);
  const stillLocked = await regenerate(renewed, current(one.secret));
  assert.equal(stillLocked.status, 429, stillLocked.text);
  const unaffected = await regenerate(two.session.accessToken, current(two.secret));
  assert.equal(unaffected.status, 200, unaffected.text);
});

test('a wrong code is told nothing but how many tries are left, and the status route shows no count', async () => {
  const { session, secret } = await enrol(freshPhone());
  const token = session.accessToken;
  const before = await status(token);
  const bodies = [];
  for (let tried = 1; tried <= CHANGE_TRIES; tried++) bodies.push((await (tried % 2 ? disable : regenerate)(token, wrongCode(secret))).body);
  assert.deepEqual(bodies, [4, 3, 2, 1, 0].map((attemptsRemaining) => ({ ok: false, error: 'INVALID_CODE', attemptsRemaining })));
  const locked = await disable(token, wrongCode(secret));
  assert.equal(locked.status, 429);
  assert.deepEqual(locked.body, { ok: false, error: 'TOO_MANY_ATTEMPTS' });
  assert.deepEqual((await status(token)).body, before.body);
});

test('a code that was already used is answered CODE_USED at sign-in, while a made-up code and a code older than the last one used stay INVALID_CODE', async () => {
  const { session, secret } = await enrol(freshPhone());
  const key = base32Decode(secret);
  const [replayOfSetup, signIn, replayOfSignIn, ahead, behind] = await openChallenges(session.user.id, 5);

  const setupCode = totpCode(key, api.clock.now - STEP_MS);
  const spentSetup = await secondStep(replayOfSetup, setupCode);
  assert.equal(spentSetup.status, 400);
  assert.deepEqual(spentSetup.body, { ok: false, error: 'CODE_USED', attemptsRemaining: SECOND_STEP_MAX_ATTEMPTS - 1 });

  const used = current(secret);
  assert.equal((await secondStep(signIn, used)).status, 200);
  const spent = await secondStep(replayOfSignIn, used);
  assert.equal(spent.status, 400);
  assert.deepEqual(spent.body, { ok: false, error: 'CODE_USED', attemptsRemaining: SECOND_STEP_MAX_ATTEMPTS - 1 });
  const madeUp = await secondStep(replayOfSignIn, wrongCode(secret));
  assert.deepEqual(madeUp.body, { ok: false, error: 'INVALID_CODE', attemptsRemaining: SECOND_STEP_MAX_ATTEMPTS - 2 });

  let next;
  let older;
  do {
    api.clock.advance(STEP_MS);
    next = totpCode(key, api.clock.now + STEP_MS);
    older = totpCode(key, api.clock.now);
  } while (next === older);
  assert.equal((await secondStep(ahead, next)).status, 200, 'a code one step ahead is still taken');
  const stale = await secondStep(behind, older);
  assert.deepEqual(stale.body, { ok: false, error: 'INVALID_CODE', attemptsRemaining: SECOND_STEP_MAX_ATTEMPTS - 1 });
});

test('a code that was just used is answered CODE_USED when turning two-step off or renewing the recovery codes too, and it counts as a try', async () => {
  const { session, secret } = await enrol(freshPhone());
  const setupCode = totpCode(base32Decode(secret), api.clock.now - STEP_MS);
  const off = await disable(session.accessToken, setupCode);
  assert.equal(off.status, 400);
  assert.deepEqual(off.body, { ok: false, error: 'CODE_USED', attemptsRemaining: CHANGE_TRIES - 1 });
  const renewed = await regenerate(session.accessToken, setupCode);
  assert.deepEqual(renewed.body, { ok: false, error: 'CODE_USED', attemptsRemaining: CHANGE_TRIES - 2 });
  assert.equal((await status(session.accessToken)).body.enabled, true);
});

test('starting the setup over resets the wrong-code count and replaces the key: the new key turns two-step on and the old key is refused', async () => {
  const session = await api.signIn(freshPhone());
  const token = session.accessToken;
  const first = await begin(token);
  assert.equal(first.status, 200, first.text);
  const oldKey = first.body.secret;
  for (let tried = 1; tried <= ENROL_MAX_ATTEMPTS - 1; tried++) {
    const out = await confirm(token, wrongCode(oldKey));
    assert.equal(out.body.error, 'INVALID_CODE');
    assert.equal(out.body.attemptsRemaining, ENROL_MAX_ATTEMPTS - tried);
  }
  assert.equal((await api.db.query('select attempts from user_totp where user_id = $1', [session.user.id])).rows[0].attempts, ENROL_MAX_ATTEMPTS - 1);

  const again = await begin(token);
  assert.equal(again.status, 200, again.text);
  const newKey = again.body.secret;
  assert.notEqual(newKey, oldKey);
  const stored = (await api.db.query('select secret_sealed, attempts, enabled_at, last_step from user_totp where user_id = $1', [session.user.id])).rows[0];
  assert.equal(stored.attempts, 0, 'a restart gives a fresh five');
  assert.equal(stored.enabled_at, null);
  assert.equal(Number(stored.last_step), 0);
  const sealer = createSecondFactor({ db: api.db, secret: SECRET, booksKey: BOOKS_KEY });
  assert.equal(sealer.openSecret(session.user.id, stored.secret_sealed), newKey, 'the sealed key is the new one');

  for (let tried = 1; tried <= ENROL_MAX_ATTEMPTS - 2; tried++) {
    const out = await confirm(token, wrongCode(newKey));
    assert.equal(out.status, 400, `try ${tried} after the restart`);
    assert.equal(out.body.error, 'INVALID_CODE', `try ${tried} after the restart`);
    assert.equal(out.body.attemptsRemaining, ENROL_MAX_ATTEMPTS - tried, `try ${tried} after the restart`);
  }
  while (nearCodes(newKey).includes(current(oldKey))) api.clock.advance(STEP_MS);
  const stale = await confirm(token, current(oldKey));
  assert.equal(stale.status, 400, 'the abandoned key does not turn two-step on');
  assert.equal(stale.body.error, 'INVALID_CODE');
  assert.equal(stale.body.attemptsRemaining, 1);

  const done = await confirm(token, current(newKey));
  assert.equal(done.status, 200, done.text);
  assert.equal(done.body.recoveryCodes.length, RECOVERY_CODES);
  assert.equal((await status(token)).body.enabled, true);
  assert.equal((await api.db.query('select attempts from user_totp where user_id = $1', [session.user.id])).rows[0].attempts, 0);
});

test('the fifteen minutes run from the fifth wrong code, even when the first four came twenty minutes before it', async () => {
  const { session, secret } = await enrol(freshPhone());
  for (let tried = 1; tried <= CHANGE_TRIES - 1; tried++) {
    const out = await disable(session.accessToken, wrongCode(secret));
    assert.equal(out.body.attemptsRemaining, CHANGE_TRIES - tried, `try ${tried}`);
  }

  api.clock.advance(20 * 60 * 1000);
  const fifth = await disable(await renew(session), wrongCode(secret));
  assert.deepEqual(fifth.body, { ok: false, error: 'INVALID_CODE', attemptsRemaining: 0 }, 'wrong codes do not wear off, so this one is the fifth');

  const locked = await disable(await renew(session), current(secret));
  assert.equal(locked.status, 429, 'the right code is refused straight after the fifth, however long ago the first one was');
  assert.equal(locked.body.error, 'TOO_MANY_ATTEMPTS');

  api.clock.advance(COOL_DOWN_MS - 1);
  const early = await disable(await renew(session), current(secret));
  assert.equal(early.status, 429, 'still locked one millisecond before fifteen minutes after the fifth');

  api.clock.advance(1);
  const off = await disable(await renew(session), current(secret));
  assert.equal(off.status, 200, off.text);
  assert.deepEqual(off.body, { ok: true });
  assert.equal((await status(session.accessToken)).body.enabled, false);
});

test('a right recovery code used to renew the recovery codes clears the count of wrong codes, as an authenticator code does', async () => {
  const { session, secret, recoveryCodes } = await enrol(freshPhone());
  const token = session.accessToken;
  for (let tried = 1; tried <= CHANGE_TRIES - 1; tried++) {
    const out = await regenerate(token, wrongCode(secret));
    assert.equal(out.body.attemptsRemaining, CHANGE_TRIES - tried, `try ${tried}`);
  }

  const renewed = await regenerate(token, recoveryCodes[0]);
  assert.equal(renewed.status, 200, renewed.text);
  assert.equal(renewed.body.recoveryCodes.length, RECOVERY_CODES);

  const fresh = await regenerate(token, wrongCode(secret));
  assert.deepEqual(fresh.body, { ok: false, error: 'INVALID_CODE', attemptsRemaining: CHANGE_TRIES - 1 }, 'the four wrong codes before the right one are forgotten');
});

test('a wrong code at a second-step sign-in neither clears nor adds to the count of wrong codes for turning two-step off', async () => {
  const phone = freshPhone();
  const { session, secret } = await enrol(phone);
  for (let tried = 1; tried <= 3; tried++) {
    const out = await disable(session.accessToken, wrongCode(secret));
    assert.equal(out.body.attemptsRemaining, CHANGE_TRIES - tried, `try ${tried}`);
  }

  const challenge = await firstStep(phone);
  assert.equal(challenge.body.secondStep, true);
  const refused = await secondStep(challenge.body.challengeId, wrongCode(secret));
  assert.deepEqual(refused.body, { ok: false, error: 'INVALID_CODE', attemptsRemaining: SECOND_STEP_MAX_ATTEMPTS - 1 });

  const next = await disable(session.accessToken, wrongCode(secret));
  assert.deepEqual(next.body, { ok: false, error: 'INVALID_CODE', attemptsRemaining: CHANGE_TRIES - 4 }, 'three wrong codes before the sign-in and this one make four');
});

test('accepted gap: a live session alone can switch two-step on with its own authenticator, and the operator step in the security gaps table gives the owner a one-step sign-in and shuts that session out', async () => {
  const phone = freshPhone();
  const owner = await api.signIn(phone);
  const thief = { access: owner.accessToken, refresh: owner.refreshToken };
  const started = await begin(thief.access);
  assert.equal(started.status, 200, started.text);
  const enrolled = await confirm(thief.access, current(started.body.secret));
  assert.equal(enrolled.status, 200, enrolled.text);
  assert.equal(enrolled.body.recoveryCodes.length, RECOVERY_CODES);
  api.clock.advance(STEP_MS);

  const stopped = await firstStep(phone);
  assert.equal(stopped.body.secondStep, true, 'the owner is turned away at a second step');
  assert.equal(stopped.body.accessToken, undefined);

  const [deleteKey, deleteCodes, endDevices] = documentedOperatorSteps();
  assert.match(deleteKey, /user_totp/);
  assert.match(deleteCodes, /recovery_codes/);
  assert.match(endDevices, /devices/);
  await api.db.query(deleteKey, [owner.user.id]);
  await api.db.query(deleteCodes, [owner.user.id]);
  const again = await begin(thief.access);
  assert.equal(again.status, 200, 'after the two deletes alone, the live session can start over');

  await api.db.query(endDevices, [owner.user.id]);
  const dead = await begin(thief.access);
  assert.equal(dead.status, 401, dead.text);
  assert.equal(dead.body.reason, 'DEVICE_REVOKED');
  const refreshed = await api.call('POST', '/v1/auth/refresh', { body: { refreshToken: thief.refresh } });
  assert.equal(refreshed.body.error, 'DEVICE_REVOKED');
  assert.equal(refreshed.body.accessToken, undefined);

  const signedIn = await firstStep(phone);
  assert.ok(signedIn.body.accessToken, 'the owner signs in in one step');
  assert.equal(signedIn.body.secondStep, undefined);
  assert.equal((await status(signedIn.body.accessToken)).body.enabled, false);
  const restarted = await begin(signedIn.body.accessToken);
  assert.equal(restarted.status, 200, restarted.text);
  assert.equal((await confirm(signedIn.body.accessToken, current(restarted.body.secret))).status, 200);
});

test('the security gaps table records the stolen-session enrolment, what is planned for it and the operator step, and states the limit on turning two-step off', () => {
  const rows = gapRows();
  const stolen = rows.find((line) => /own authenticator/i.test(line));
  assert.ok(stolen, 'a row for a session that switches two-step on with its own authenticator');
  assert.match(stolen, /fresh/i);
  assert.match(stolen, /text/i);
  for (const word of ['user_totp', 'recovery_codes', 'revoked_at']) assert.ok(stolen.includes(word), word);
  const all = rows.join('\n');
  assert.match(all, /15 minutes/);
  assert.doesNotMatch(all, /no attempt limit/i);
});

test('a wrong second-step code at a sign-in does not lift the lock on turning two-step off', async () => {
  const phone = freshPhone();
  const { session, secret } = await enrol(phone);
  await useUpTries(disable, session.accessToken, secret);
  assert.equal((await disable(session.accessToken, current(secret))).status, 429);

  const challenge = await firstStep(phone);
  const refused = await secondStep(challenge.body.challengeId, wrongCode(secret));
  assert.equal(refused.body.error, 'INVALID_CODE');

  const still = await disable(session.accessToken, current(secret));
  assert.equal(still.status, 429, still.text);
  assert.equal(still.body.error, 'TOO_MANY_ATTEMPTS');
});

test('a made-up code shaped like a recovery code counts as a wrong code when turning two-step off or renewing recovery codes', async () => {
  const { session, secret, recoveryCodes } = await enrol(freshPhone());
  const madeUp = 'abcdefghjk';
  assert.equal(recoveryCodes.some((code) => code.replace('-', '') === madeUp), false);
  const first = await disable(session.accessToken, madeUp);
  assert.deepEqual(first.body, { ok: false, error: 'INVALID_CODE', attemptsRemaining: CHANGE_TRIES - 1 });
  const second = await regenerate(session.accessToken, 'abcde-fghjk');
  assert.deepEqual(second.body, { ok: false, error: 'INVALID_CODE', attemptsRemaining: CHANGE_TRIES - 2 });
  for (let tried = 3; tried <= CHANGE_TRIES; tried++) await disable(session.accessToken, madeUp);
  assert.equal((await disable(session.accessToken, current(secret))).status, 429);
});

for (const [kind, given] of [['a made-up recovery code', () => 'abcdefghjk'], ['a code that was already used', (secret) => totpCode(base32Decode(secret), api.clock.now - STEP_MS)]]) {
  test(`${kind} at a second-step sign-in leaves the count of wrong codes for turning two-step off alone`, async () => {
    const phone = freshPhone();
    const { session, secret } = await enrol(phone);
    for (let tried = 1; tried <= 3; tried++) await disable(session.accessToken, wrongCode(secret));
    const challenge = await firstStep(phone);
    const refused = await secondStep(challenge.body.challengeId, given(secret));
    assert.equal(refused.status, 400);
    const next = await disable(session.accessToken, wrongCode(secret));
    assert.deepEqual(next.body, { ok: false, error: 'INVALID_CODE', attemptsRemaining: CHANGE_TRIES - 4 });
  });
}
