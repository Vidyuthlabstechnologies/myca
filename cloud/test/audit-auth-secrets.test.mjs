import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createApi } from '../src/api.mjs';
import { isSealed, openState, sealState } from '../src/books-seal.mjs';
import { resealAll } from '../src/books-reseal.mjs';
import { openSecrets, sealSecrets } from '../src/connectors.mjs';
import { createSecondFactor } from '../src/second-factor.mjs';
import { base32Decode, totpCode } from '../src/totp.mjs';
import { startApi, BOOKS_KEY, SECRET } from './helpers.mjs';

const NEW_KEY = 'new-books-key-fedcba9876543210fedcba9876543210';
const OTHER_KEY = 'other-books-key-00112233445566778899aabbccddeeff';
const NEW_SECRET = 'a-new-token-secret-that-is-long-enough-9876543210';

let api;
before(async () => { api = await startApi(); });
after(async () => { await api.close(); });

let nextPhone = 9300000000;
const freshPhone = () => `+91${nextPhone++}`;

function shortTag(sealed, bytes = 4) {
  const parts = sealed.split('.');
  const at = parts.length - 2;
  parts[at] = Buffer.from(parts[at], 'base64url').subarray(0, bytes).toString('base64url');
  return parts.join('.');
}

async function enrol(on) {
  const session = await on.signIn(freshPhone());
  const started = await on.call('POST', '/v1/me/second-step/begin', { token: session.accessToken });
  assert.equal(started.status, 200, started.text);
  const done = await on.call('POST', '/v1/me/second-step/confirm', { token: session.accessToken, body: { code: totpCode(base32Decode(started.body.secret), on.clock.now) } });
  assert.equal(done.status, 200, done.text);
  return { userId: session.user.id, secret: started.body.secret };
}

const stored = async (on, table, businessId) => (await on.db.query(`select version, state from ${table} where business_id = $1`, [businessId])).rows[0];
const share = (on, businessId) => on.db.query("insert into shared_books (business_id, version, state, as_of, shared_at, reason) select business_id, version, state, now(), now(), 'manual' from books where business_id = $1", [businessId]);
const totpRow = async (on, userId) => (await on.db.query('select secret_sealed from user_totp where user_id = $1', [userId])).rows[0].secret_sealed;

test('a sealed value whose check is cut to four bytes is refused: the books, the authenticator key and the connector secrets', () => {
  const books = sealState(BOOKS_KEY, 'business-1', JSON.stringify({ sales: [] }));
  assert.deepEqual(openState(BOOKS_KEY, 'business-1', books), { sales: [] });
  for (const bytes of [4, 8, 12, 15]) {
    assert.throws(() => openState(BOOKS_KEY, 'business-1', shortTag(books, bytes)), (error) => error.code === 'BOOKS_KEY_WRONG', `${bytes} bytes`);
  }

  const factor = createSecondFactor({ db: api.db, secret: SECRET, booksKey: BOOKS_KEY });
  const key = factor.sealSecret('user-1', 'JBSWY3DPEHPK3PXP');
  assert.equal(factor.openSecret('user-1', key), 'JBSWY3DPEHPK3PXP');
  assert.throws(() => factor.openSecret('user-1', shortTag(key)), /could not be opened/);

  const connector = sealSecrets(OTHER_KEY, 'business-1', { token: 'value' });
  assert.deepEqual(openSecrets(OTHER_KEY, 'business-1', connector), { token: 'value' });
  assert.deepEqual(openSecrets(OTHER_KEY, 'business-1', shortTag(connector)), {});
});

test('re-sealing: a dry run changes nothing, --apply moves the books, the shared copy and the authenticator keys to the new key, and a second run finds nothing left', async () => {
  const on = await startApi();
  try {
    const first = await on.ownerWithBusiness(freshPhone());
    const second = await on.ownerWithBusiness(freshPhone(), { name: 'Bharat Stores', state: '27' });
    const plain = await on.ownerWithBusiness(freshPhone(), { name: 'Chitra Mills', state: '33' });
    await share(on, first.businessId);
    const opened = { first: await on.books(first.businessId), second: await on.books(second.businessId), plain: await on.books(plain.businessId) };
    await on.db.query('update books set state = $2::jsonb where business_id = $1', [plain.businessId, JSON.stringify(opened.plain)]);
    const person = await enrol(on);
    const before = { books: await stored(on, 'books', first.businessId), shared: await stored(on, 'shared_books', first.businessId), totp: await totpRow(on, person.userId) };

    const dry = await resealAll({ db: on.db, oldKey: BOOKS_KEY, newKey: NEW_KEY });
    assert.deepEqual(dry, {
      applied: false,
      books: { rows: 3, resealed: 2, sealedForTheFirstTime: 1, alreadyUnderNewKey: 0 },
      shared_books: { rows: 1, resealed: 1, sealedForTheFirstTime: 0, alreadyUnderNewKey: 0 },
      user_totp: { rows: 1, resealed: 1, sealedForTheFirstTime: 0, alreadyUnderNewKey: 0 },
    });
    assert.deepEqual(await stored(on, 'books', first.businessId), before.books, 'a dry run writes nothing');
    assert.deepEqual(await stored(on, 'shared_books', first.businessId), before.shared);
    assert.equal(await totpRow(on, person.userId), before.totp);
    assert.equal(isSealed((await stored(on, 'books', plain.businessId)).state), false);

    const applied = await resealAll({ db: on.db, oldKey: BOOKS_KEY, newKey: NEW_KEY, apply: true });
    assert.deepEqual(applied, { ...dry, applied: true });
    for (const [name, business] of [['first', first], ['second', second], ['plain', plain]]) {
      const row = await stored(on, 'books', business.businessId);
      assert.ok(isSealed(row.state), `${name} is sealed`);
      assert.deepEqual(openState(NEW_KEY, business.businessId, row.state), opened[name], `${name} opens with the new key to the same books`);
      assert.throws(() => openState(BOOKS_KEY, business.businessId, row.state), (error) => error.code === 'BOOKS_KEY_WRONG', `${name} no longer opens with the old key`);
    }
    assert.equal((await stored(on, 'books', first.businessId)).version, before.books.version, 'the version is not touched, so no phone sees a conflict');
    const shared = await stored(on, 'shared_books', first.businessId);
    assert.deepEqual(openState(NEW_KEY, first.businessId, shared.state), opened.first);
    assert.equal(shared.version, before.shared.version);
    const key = await totpRow(on, person.userId);
    assert.equal(createSecondFactor({ db: on.db, secret: SECRET, booksKey: NEW_KEY }).openSecret(person.userId, key), person.secret);
    assert.throws(() => createSecondFactor({ db: on.db, secret: SECRET, booksKey: BOOKS_KEY }).openSecret(person.userId, key), /could not be opened/);

    const again = await resealAll({ db: on.db, oldKey: BOOKS_KEY, newKey: NEW_KEY, apply: true });
    assert.deepEqual(again, {
      applied: true,
      books: { rows: 3, resealed: 0, sealedForTheFirstTime: 0, alreadyUnderNewKey: 3 },
      shared_books: { rows: 1, resealed: 0, sealedForTheFirstTime: 0, alreadyUnderNewKey: 1 },
      user_totp: { rows: 1, resealed: 0, sealedForTheFirstTime: 0, alreadyUnderNewKey: 1 },
    });
  } finally {
    await on.close();
  }
});

test('re-sealing: one row that the old key cannot open stops the run and nothing is written, the rows before it included', async () => {
  const on = await startApi();
  try {
    const a = await on.ownerWithBusiness(freshPhone());
    const b = await on.ownerWithBusiness(freshPhone(), { name: 'Bharat Stores', state: '27' });
    const [good, bad] = [a.businessId, b.businessId].sort();
    const books = await on.books(bad);
    await on.db.query('update books set state = $2::jsonb where business_id = $1', [bad, JSON.stringify(sealState(OTHER_KEY, bad, JSON.stringify(books)))]);
    const before = await stored(on, 'books', good);
    await assert.rejects(resealAll({ db: on.db, oldKey: BOOKS_KEY, newKey: NEW_KEY, apply: true }), (error) => error.code === 'BOOKS_KEY_WRONG');
    assert.deepEqual(await stored(on, 'books', good), before, 'the row that came first is as it was');
    assert.deepEqual(openState(BOOKS_KEY, good, (await stored(on, 'books', good)).state), await on.books(good));
  } finally {
    await on.close();
  }
});

test('re-sealing refuses a missing, short or unchanged new key, and a sealed row when no old key is given', async () => {
  await assert.rejects(resealAll({ db: api.db, oldKey: BOOKS_KEY, newKey: '' }), /new key is required/);
  await assert.rejects(resealAll({ db: api.db, oldKey: BOOKS_KEY, newKey: 'short' }), /at least 32/);
  await assert.rejects(resealAll({ db: api.db, oldKey: BOOKS_KEY, newKey: BOOKS_KEY }), /same as the old one/);
  await api.ownerWithBusiness(freshPhone());
  await assert.rejects(resealAll({ db: api.db, oldKey: '', newKey: NEW_KEY, apply: true }), (error) => error.code === 'BOOKS_KEY_MISSING');
});

test('changing the token secret ends every access token at once, but a refresh token still works: only revoking the devices signs people out', async () => {
  const session = await api.signIn(freshPhone());
  const handler = createApi({ db: api.db, secret: NEW_SECRET, otpSender: api.sender, booksKey: BOOKS_KEY, now: () => api.clock.now, log: () => {} });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, { token, body } = {}) => {
    const res = await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  try {
    assert.equal((await call('GET', '/v1/me', { token: session.accessToken })).status, 401, 'the old access token is refused');
    const refreshed = await call('POST', '/v1/auth/refresh', { body: { refreshToken: session.refreshToken } });
    assert.equal(refreshed.status, 200, 'the refresh token is a plain hash, so it outlives the secret');
    assert.equal((await call('GET', '/v1/me', { token: refreshed.body.accessToken })).status, 200);

    await api.db.query('update devices set revoked_at = now() where revoked_at is null');
    const ended = await call('POST', '/v1/auth/refresh', { body: { refreshToken: refreshed.body.refreshToken } });
    assert.equal(ended.body.error, 'DEVICE_REVOKED');
    assert.equal((await call('GET', '/v1/me', { token: refreshed.body.accessToken })).status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('the re-seal command reports without writing, writes only with --apply, never prints a key, and stops without a new key', async () => {
  const on = await startApi();
  try {
    const owner = await on.ownerWithBusiness(freshPhone());
    const books = await on.books(owner.businessId);
    const url = new URL(process.env.MYCA_TEST_DATABASE_URL || 'postgres://myca@127.0.0.1:54329/postgres');
    url.pathname = `/${(await on.db.query('select current_database() as name')).rows[0].name}`;
    const run = (env, args = []) => spawnSync(process.execPath, [fileURLToPath(new URL('../src/reseal.mjs', import.meta.url)), ...args], { env: { PATH: process.env.PATH, MYCA_DATABASE_URL: url.toString(), ...env }, encoding: 'utf8' });

    const refused = run({ MYCA_BOOKS_KEY: BOOKS_KEY });
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /MYCA_BOOKS_KEY_NEW is required/);

    const dry = run({ MYCA_BOOKS_KEY: BOOKS_KEY, MYCA_BOOKS_KEY_NEW: NEW_KEY });
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /"books":\{"rows":1,"resealed":1/);
    assert.match(dry.stdout, /Nothing was changed/);
    assert.deepEqual(await on.books(owner.businessId), books, 'still under the old key');

    const applied = run({ MYCA_BOOKS_KEY: BOOKS_KEY, MYCA_BOOKS_KEY_NEW: NEW_KEY }, ['--apply']);
    assert.equal(applied.status, 0, applied.stderr);
    assert.match(applied.stdout, /"applied":true/);
    assert.deepEqual(openState(NEW_KEY, owner.businessId, (await stored(on, 'books', owner.businessId)).state), books);
    for (const out of [refused, dry, applied]) {
      assert.equal(`${out.stdout}${out.stderr}`.includes(BOOKS_KEY), false);
      assert.equal(`${out.stdout}${out.stderr}`.includes(NEW_KEY), false);
    }

    const wrong = run({ MYCA_BOOKS_KEY: OTHER_KEY, MYCA_BOOKS_KEY_NEW: BOOKS_KEY }, ['--apply']);
    assert.notEqual(wrong.status, 0, 'the wrong old key stops the run');
    assert.deepEqual(openState(NEW_KEY, owner.businessId, (await stored(on, 'books', owner.businessId)).state), books);
  } finally {
    await on.close();
  }
});
