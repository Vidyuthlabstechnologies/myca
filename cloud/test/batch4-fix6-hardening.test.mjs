import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import pg from 'pg';
import { createApi } from '../src/api.mjs';
import { isUuid, normalizePhone } from '../src/auth.mjs';
import { createBooksRunner } from '../src/books-runner.mjs';
import { syncOf } from '../src/ca-sync.mjs';
import { createDocumentVault } from '../src/document-vault.mjs';
import { JOB_HEADER } from '../src/jobs.mjs';
import { normaliseCode } from '../src/second-factor.mjs';
import { base32Decode, totpCode } from '../src/totp.mjs';
import { createWhatsApp } from '../src/whatsapp.mjs';
import { startApi, SALE, SECRET, BOOKS_KEY } from './helpers.mjs';

const ADMIN_URL = process.env.MYCA_TEST_DATABASE_URL || 'postgres://myca@127.0.0.1:54329/postgres';
const WHATSAPP = { verifyToken: 'verify-me', appSecret: 'app-secret', phoneNumberId: '1234', accessToken: 'tok' };
const JOB_TOKEN = 'job-token-for-batch4-hardening-0123456789abcdef0123456789';
const NO_ROW_UUID = '11111111-1111-4111-8111-111111111111';
const STEP_MS = 30_000;
const HOUR_MS = 60 * 60 * 1000;

const replies = [];
const whatsappSender = { async sendText(phone, text) { replies.push({ phone, text }); } };

let api;
before(async () => { api = await startApi({ whatsapp: WHATSAPP, whatsappSender, jobToken: JOB_TOKEN }); });
after(async () => { await api.close(); });

let nextPhone = 9200000000;
const freshPhone = () => `+91${nextPhone++}`;
let nextMessage = 1;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const biz = (who, rest) => `/v1/businesses/${who.businessId}${rest ? `/${rest}` : ''}`;
const deviceIdOf = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).dev;

async function until(done, what) {
  for (let waited = 0; waited < 10_000; waited += 10) {
    if (await done()) return;
    await sleep(10);
  }
  assert.fail(`timed out waiting for ${what}`);
}

const lockWaiters = async () => (await api.db.query("select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'")).rows[0].n;
const openTransactions = async () => (await api.db.query("select count(*)::int as n from pg_stat_activity where datname = current_database() and state like 'idle in transaction%'")).rows[0].n;
const crashRows = async (on = api) => (await on.db.query('select count(*)::int as n from crash_reports')).rows[0].n;

function holdBooksRow(businessId, lock = 'update') {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  let locked;
  const ready = new Promise((resolve) => { locked = resolve; });
  const done = api.db.tx(async (q) => {
    await q(`select 1 from books where business_id = $1 for ${lock}`, [businessId]);
    locked();
    await held;
  });
  return { ready: Promise.race([ready, done]), release, done };
}

async function whileWaitingForTheBooks(businessId, send, during = async () => {}) {
  const hold = holdBooksRow(businessId);
  await hold.ready;
  let pending;
  try {
    pending = send();
    await until(async () => (await lockWaiters()) >= 1, 'the request to wait for the books lock');
    await during();
  } finally {
    hold.release();
    await hold.done;
  }
  return pending;
}

function signed(body) {
  const raw = JSON.stringify(body);
  return { raw, headers: { 'x-hub-signature-256': `sha256=${createHmac('sha256', WHATSAPP.appSecret).update(raw).digest('hex')}` } };
}

const incoming = (from, id, text) => ({ object: 'whatsapp_business_account', entry: [{ id: '1', changes: [{ value: { messaging_product: 'whatsapp', messages: [{ from, id, timestamp: '1', type: 'text', text: { body: text } }] }, field: 'messages' }] }] });
const whatsappAsk = (phone, text) => api.call('POST', '/v1/whatsapp/webhook', signed(incoming(phone.slice(1), `wamid.batch4.${nextMessage++}`, text)));

async function twoDevices() {
  const phone = freshPhone();
  const first = await api.ownerWithBusiness(phone, { name: 'Flight Traders', state: '29' });
  const second = await api.signIn(phone);
  return { phone, first, second, businessId: first.businessId };
}

async function sharedAccountant() {
  const owner = await api.ownerWithBusiness(freshPhone(), { name: 'Shared Traders', state: '29' });
  const caPhone = freshPhone();
  const invited = await api.call('POST', biz(owner, 'invitations'), { token: owner.token, body: { phone: caPhone, role: 'accountant' } });
  assert.equal(invited.status, 200, invited.text);
  const first = await api.signIn(caPhone);
  const me = await api.call('GET', '/v1/me', { token: first.accessToken });
  const joined = await api.call('POST', `/v1/invitations/${me.body.invitations[0].id}/accept`, { token: first.accessToken });
  assert.equal(joined.status, 200, joined.text);
  const second = await api.signIn(caPhone);
  const shared = await api.call('POST', biz(owner, 'ca-sync'), { token: owner.token, body: { mode: 'daily' } });
  assert.equal(shared.status, 200, shared.text);
  return { owner, caPhone, first, second, businessId: owner.businessId };
}

async function footprint(businessId) {
  const found = await api.db.query('select (select version from books where business_id = $1) as version, (select count(*)::int from audit_log where business_id = $1) as audits', [businessId]);
  return found.rows[0];
}

async function freePort() {
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

function rawGet(port, target) {
  return new Promise((resolve) => {
    let answer = '';
    const socket = net.connect(port, '127.0.0.1', () => socket.write(`GET ${target} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`));
    socket.setEncoding('utf8');
    socket.setTimeout(10_000, () => socket.destroy());
    socket.on('data', (chunk) => { answer += chunk; });
    socket.on('error', () => {});
    socket.on('close', () => resolve(answer));
  });
}

async function bootServer() {
  const name = `myca_t_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`create database ${name}`);
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  const port = await freePort();
  const child = spawn(process.execPath, [fileURLToPath(new URL('../src/server.mjs', import.meta.url))], {
    env: { PATH: process.env.PATH, MYCA_DATABASE_URL: url.toString(), MYCA_TOKEN_SECRET: SECRET, MYCA_BOOKS_KEY: BOOKS_KEY, MYCA_DEV_OTP: '1', PORT: String(port), MYCA_LISTEN_HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const server = { port, output: '', exit: null };
  child.stdout.on('data', (chunk) => { server.output += chunk; });
  child.stderr.on('data', (chunk) => { server.output += chunk; });
  child.on('exit', (code, signal) => { server.exit = { code, signal }; });
  server.stop = async () => {
    if (!server.exit) {
      child.kill('SIGTERM');
      for (let waited = 0; waited < 5000 && !server.exit; waited += 20) await sleep(20);
      if (!server.exit) child.kill('SIGKILL');
      for (let waited = 0; waited < 2000 && !server.exit; waited += 20) await sleep(20);
    }
    await admin.query(`drop database if exists ${name} with (force)`);
    await admin.end();
  };
  for (let waited = 0; waited < 20_000 && !server.exit && !server.output.includes('"listening"'); waited += 50) await sleep(50);
  if (!server.output.includes('"listening"')) {
    await server.stop();
    assert.fail(`the server did not start: ${server.output}`);
  }
  return server;
}

function fakeResponse() {
  const sent = { status: 0, headers: {}, body: '', ended: false, destroyed: false };
  return {
    sent,
    get headersSent() { return sent.status !== 0; },
    writeHead(status, headers) { sent.status = status; sent.headers = headers; },
    end(body) { sent.body = String(body ?? ''); sent.ended = true; },
    destroy() { sent.destroyed = true; },
  };
}

const fakeRequest = (url, method = 'GET') => ({ method, url, headers: {}, socket: { remoteAddress: '127.0.0.1' } });

function inProcessHandler(log) {
  return createApi({ db: api.db, secret: SECRET, otpSender: api.sender, booksKey: BOOKS_KEY, now: () => api.clock.now, log });
}

const BAD_TARGETS = ['//', '//[', '//%', '//%zz', '//:80', '//a%20b', '//example.com:99999', 'http://[::1/v1/health'];

test('CLOUD-1: a request target that cannot be parsed is answered 404 NOT_FOUND and the process keeps serving other requests', async () => {
  const server = await bootServer();
  try {
    for (const target of BAD_TARGETS) {
      const answer = await rawGet(server.port, target);
      if (!answer) await sleep(500);
      assert.match(answer, /^HTTP\/1\.1 404 /, `${target} -> ${JSON.stringify(answer)} (process ${JSON.stringify(server.exit)}): ${server.output.slice(-400)}`);
      assert.ok(answer.includes('{"ok":false,"error":"NOT_FOUND"}'), `${target} -> ${answer}`);
      assert.equal(server.exit, null, `the process is still up after ${target}`);
      const health = await rawGet(server.port, '/v1/health');
      assert.match(health, /^HTTP\/1\.1 200 /, `${target} then /v1/health -> ${JSON.stringify(health)}`);
    }
    assert.equal(server.output.split('"path":"(unreadable)"').length - 1, BAD_TARGETS.length, 'each unreadable target is logged without a path');
    assert.equal(server.output.includes('INTERNAL_ERROR') || /TypeError|ERR_INVALID_URL/.test(server.output), false, 'no crash is logged for them');
  } finally {
    await server.stop();
  }
});

test('CLOUD-1: the handler answers an unreadable target like any unknown path, logs it as (unreadable) and records no crash', async () => {
  const logs = [];
  const handler = inProcessHandler((entry) => logs.push(entry));
  const crashesBefore = await crashRows();
  const unknown = fakeResponse();
  await handler(fakeRequest('/nothing/here'), unknown);
  assert.equal(unknown.sent.status, 404);
  assert.deepEqual(JSON.parse(unknown.sent.body), { ok: false, error: 'NOT_FOUND' });
  for (const target of BAD_TARGETS) {
    const res = fakeResponse();
    await handler(fakeRequest(target), res);
    assert.equal(res.sent.status, 404, target);
    assert.equal(res.sent.body, unknown.sent.body, `${target} gets the body any unknown path gets`);
    assert.equal(res.sent.headers['content-type'], 'application/json');
    const line = logs.at(-1);
    assert.deepEqual({ method: line.method, path: line.path, status: line.status }, { method: 'GET', path: '(unreadable)', status: 404 }, target);
    assert.equal(logs.some((entry) => entry.error), false, 'no stack is logged');
  }
  const readable = fakeResponse();
  await handler(fakeRequest(`/v1/businesses/${NO_ROW_UUID}/snapshot`), readable);
  assert.equal(logs.at(-1).path, '/v1/businesses/:id/snapshot', 'a readable target still logs its path with ids hidden');
  assert.equal(await crashRows(), crashesBefore, 'no crash record is written');
});

test('CLOUD-1: whatever goes wrong after the route has answered ends in a plain 500, never in an unhandled rejection', async () => {
  const handler = inProcessHandler(() => { throw new Error('the log sink is down'); });
  const res = fakeResponse();
  await assert.doesNotReject(handler(fakeRequest('/v1/health'), res));
  assert.equal(res.sent.ended, true);
  assert.equal(res.sent.status, 500);
  assert.deepEqual(JSON.parse(res.sent.body), { ok: false, error: 'INTERNAL_ERROR' });
});

test('CLOUD-1: an answer that cannot be written as JSON is a plain 500 with the connection kept, because it is written before the headers go out', async () => {
  const circular = {};
  circular.self = circular;
  const handler = createApi({ billing: { plans: () => circular }, db: api.db, secret: SECRET, otpSender: api.sender, booksKey: BOOKS_KEY, now: () => api.clock.now, log: () => {} });
  const res = fakeResponse();
  await assert.doesNotReject(handler(fakeRequest('/v1/plans'), res));
  assert.equal(res.sent.destroyed, false, 'the connection is not cut');
  assert.equal(res.sent.ended, true);
  assert.equal(res.sent.status, 500);
  assert.equal(res.sent.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(res.sent.body), { ok: false, error: 'INTERNAL_ERROR' });
});

test('CLOUD-1: once the headers are out, a failure ends the connection instead of writing a second answer', async () => {
  const handler = createApi({ billing: { plans: () => ({ ok: true }) }, db: api.db, secret: SECRET, otpSender: api.sender, booksKey: BOOKS_KEY, now: () => api.clock.now, log: () => {} });
  const res = fakeResponse();
  res.end = () => { throw new Error('the socket is gone'); };
  await assert.doesNotReject(handler(fakeRequest('/v1/plans'), res));
  assert.equal(res.sent.destroyed, true, 'the connection is ended');
  assert.equal(res.sent.status, 200, 'no second status line is written');
});

const LIVE_REQUESTS = {
  propose: async () => ({ method: 'POST', action: 'propose', body: { name: 'create_invoice', args: SALE } }),
  confirm: async ({ second, businessId }) => {
    const held = await api.call('POST', `/v1/businesses/${businessId}/propose`, { token: second.accessToken, body: { name: 'create_invoice', args: SALE } });
    assert.equal(held.status, 200, held.text);
    return { method: 'POST', action: 'confirm', body: { token: held.body.preview.token } };
  },
  discard: async () => ({ method: 'POST', action: 'discard', body: {} }),
  ask: async () => ({ method: 'POST', action: 'ask', body: { message: 'who owes me?' } }),
  uploads: async () => ({ method: 'POST', action: 'uploads', body: { name: 'bill.txt', content: 'Supplier: Kiran Stores' } }),
  replace: async ({ first, businessId }) => {
    const exported = await api.call('GET', `/v1/businesses/${businessId}/export`, { token: first.token });
    assert.equal(exported.status, 200, exported.text);
    return { method: 'POST', action: 'replace', body: exported.body };
  },
  query: async () => ({ method: 'POST', action: 'query', body: { name: 'business_summary', args: {} } }),
  snapshot: async () => ({ method: 'GET', action: 'snapshot' }),
};

const REVOKED = { ok: false, error: 'UNAUTHENTICATED', reason: 'DEVICE_REVOKED' };

async function signOutSecond(who) {
  const out = await api.call('POST', `/v1/me/devices/${deviceIdOf(who.second.accessToken)}/sign-out`, { token: who.first.token || who.first.accessToken });
  assert.equal(out.status, 200, out.text);
  assert.equal((await api.call('GET', '/v1/me', { token: who.second.accessToken })).status, 401, 'the device is refused at once');
}

async function assertLockReleased(who) {
  const next = await Promise.race([
    api.call('POST', biz(who, 'ask'), { token: who.first.token, body: { message: 'who owes me?' } }),
    sleep(5000).then(() => 'blocked'),
  ]);
  assert.notEqual(next, 'blocked', 'the books lock was released');
  assert.equal(next.status, 200, next.text);
  assert.equal(await openTransactions(), 0, 'no transaction is left open');
}

test('CLOUD-2: a request that was waiting for the books lock when its device was signed out answers 401 DEVICE_REVOKED and writes nothing', async () => {
  for (const [name, build] of Object.entries(LIVE_REQUESTS)) {
    const who = await twoDevices();
    const request = await build(who);
    const before = await footprint(who.businessId);
    const deviceAudits = async () => (await api.db.query('select count(*)::int as n from audit_log where device_id = $1', [deviceIdOf(who.second.accessToken)])).rows[0].n;
    const auditedBefore = await deviceAudits();
    const out = await whileWaitingForTheBooks(
      who.businessId,
      () => api.call(request.method, biz(who, request.action), { token: who.second.accessToken, body: request.body }),
      () => signOutSecond(who),
    );
    assert.equal(out.status, 401, `${name}: ${out.text}`);
    assert.deepEqual(out.body, REVOKED, name);
    assert.deepEqual(await footprint(who.businessId), before, `${name} wrote no books and no audit row`);
    assert.equal(await deviceAudits(), auditedBefore, `${name} left no audit row for the revoked device`);
    await assertLockReleased(who);
  }
});

test('CLOUD-2: the same holds for an accountant on the shared view: ask, query and snapshot read the shared books under the live lock', async () => {
  const requests = {
    ask: { method: 'POST', action: 'ask', body: { message: 'who owes me?' } },
    query: { method: 'POST', action: 'query', body: { name: 'business_summary', args: {} } },
    snapshot: { method: 'GET', action: 'snapshot' },
  };
  for (const [name, request] of Object.entries(requests)) {
    const who = await sharedAccountant();
    const before = await footprint(who.businessId);
    const out = await whileWaitingForTheBooks(
      who.businessId,
      () => api.call(request.method, biz(who, request.action), { token: who.second.accessToken, body: request.body }),
      () => signOutSecond(who),
    );
    assert.equal(out.status, 401, `${name}: ${out.text}`);
    assert.deepEqual(out.body, REVOKED, name);
    assert.deepEqual(await footprint(who.businessId), before, `${name} wrote nothing`);
    assert.equal(await openTransactions(), 0, 'no transaction is left open');
  }
});

test('CLOUD-2: a device that is not signed out is unaffected, on the live books and on the shared view', async () => {
  for (const name of ['confirm', 'ask', 'snapshot', 'query', 'replace']) {
    const who = await twoDevices();
    const request = await LIVE_REQUESTS[name](who);
    const out = await whileWaitingForTheBooks(who.businessId, () => api.call(request.method, biz(who, request.action), { token: who.second.accessToken, body: request.body }));
    assert.equal(out.status, 200, `${name}: ${out.text}`);
    if (name === 'confirm') assert.equal(out.body.posted, true, out.text);
    if (name === 'confirm') assert.equal((await api.books(who.businessId)).invoices.length, 1);
  }
  const who = await sharedAccountant();
  for (const request of [{ method: 'GET', action: 'snapshot' }, { method: 'POST', action: 'ask', body: { message: 'who owes me?' } }]) {
    const out = await whileWaitingForTheBooks(who.businessId, () => api.call(request.method, biz(who, request.action), { token: who.second.accessToken, body: request.body }));
    assert.equal(out.status, 200, `${request.action}: ${out.text}`);
  }
});

test('CLOUD-2: a request whose account was deleted while it waited is refused as well, without the device being signed out', async () => {
  const who = await twoDevices();
  const userId = who.first.user.id;
  const before = await footprint(who.businessId);
  const out = await whileWaitingForTheBooks(
    who.businessId,
    () => api.call('POST', biz(who, 'ask'), { token: who.second.accessToken, body: { message: 'who owes me?' } }),
    () => api.db.query('update users set deleted_at = $2 where id = $1', [userId, new Date(api.clock.now)]),
  );
  assert.equal(out.status, 401, out.text);
  assert.deepEqual(out.body, REVOKED);
  assert.deepEqual(await footprint(who.businessId), before);
  const device = await api.db.query('select revoked_at from devices where id = $1', [deviceIdOf(who.second.accessToken)]);
  assert.equal(device.rows[0].revoked_at, null, 'it was the deleted account that stopped the request');
});

test('CLOUD-2: signing out the current device stays refused, and the other one is still ended at once', async () => {
  const who = await twoDevices();
  const own = await api.call('POST', `/v1/me/devices/${deviceIdOf(who.first.token)}/sign-out`, { token: who.first.token });
  assert.equal(own.status, 409, own.text);
  assert.equal(own.body.error, 'CURRENT_DEVICE');
  assert.equal((await api.call('GET', '/v1/me', { token: who.first.token })).status, 200);
  await signOutSecond(who);
});

test('CLOUD-2: jobs and WhatsApp carry no device, so a person with no signed-in device is still answered and their books still run', async () => {
  const phone = freshPhone();
  const owner = await api.ownerWithBusiness(phone, { name: 'No Device Traders', state: '29' });
  assert.equal((await api.call('POST', '/v1/auth/logout', { token: owner.token })).status, 200);
  assert.equal((await api.call('GET', '/v1/me', { token: owner.token })).status, 401);
  const sent = replies.length;
  const asked = await whatsappAsk(phone, 'who owes me?');
  assert.equal(asked.status, 200, asked.text);
  assert.equal(asked.body.results[0].replied, true, asked.text);
  assert.equal(replies.length, sent + 1);
  const daily = await api.call('POST', '/v1/jobs/daily', { headers: { [JOB_HEADER]: JOB_TOKEN } });
  assert.equal(daily.status, 200, daily.text);
  assert.deepEqual(daily.body.failed, []);
  assert.equal(daily.body.ran + daily.body.skipped, daily.body.businesses);
  assert.ok(daily.body.ran >= 1, daily.text);
});

async function watchedRunners() {
  const who = await twoDevices();
  const shared = await sharedAccountant();
  const statements = [];
  const watched = { ...api.db, tx: (run) => api.db.tx((q) => run((text, params) => { statements.push(String(text)); return q(text, params); })) };
  const runner = createBooksRunner({ db: watched, now: () => api.clock.now, vault: createDocumentVault({ now: () => api.clock.now }), booksKey: BOOKS_KEY });
  const exported = (await api.call('GET', biz(who, 'export'), { token: who.first.token })).body;
  const contextOf = (person) => ({ userId: person.second.user.id, deviceId: deviceIdOf(person.second.accessToken), requestId: 'spy' });
  const runs = {
    withBooks: (context) => runner.withBooks(who.businessId, context, async (session) => session.snapshot()),
    withReadOnlyBooks: (context) => runner.withReadOnlyBooks(who.businessId, context, async (session) => session.snapshot()),
    replaceBooks: (context) => runner.replaceBooks(who.businessId, context, { version: 1, state: exported.books, documents: exported.documents, exportedAt: exported.exportedAt }),
    withSharedBooks: (context) => runner.withSharedBooks(shared.businessId, context, async (session) => session.snapshot()),
  };
  const contexts = { withBooks: contextOf(who), withReadOnlyBooks: contextOf(who), replaceBooks: contextOf(who), withSharedBooks: contextOf(shared) };
  return { who, shared, statements, runs, contexts };
}

test('CLOUD-2: the sign-in check is one lookup when the books are read and one more at the end when they are written, and none when no device is named', async () => {
  const { statements, runs, contexts } = await watchedRunners();
  const unnamed = { userId: null, deviceId: null, requestId: 'spy' };
  const lookups = () => statements.filter((text) => /\bdevices\b/.test(text)).length;
  const writes = { withBooks: true, replaceBooks: true };
  for (const [name, run] of Object.entries(runs)) {
    statements.length = 0;
    await run(contexts[name]);
    assert.equal(lookups(), writes[name] ? 2 : 1, `${name} looks the device up ${writes[name] ? 'twice' : 'once'}`);
    if (writes[name]) assert.match(statements.at(-1), /from devices d join users u/, `${name} looks it up last, right before it commits`);
    statements.length = 0;
    await run(unnamed);
    assert.equal(lookups(), 0, `${name} looks nothing up when no device is named`);
  }
});

test('CLOUD-2: a refused request runs nothing but the lock and the lookup, so no share is refreshed and no book is opened for it', async () => {
  const { who, shared, statements, runs, contexts } = await watchedRunners();
  await signOutSecond(who);
  await signOutSecond(shared);
  for (const [name, run] of Object.entries(runs)) {
    statements.length = 0;
    await assert.rejects(run(contexts[name]), (err) => err.statusCode === 401 && err.body?.reason === 'DEVICE_REVOKED', name);
    assert.equal(statements.length, 2, `${name} ran ${JSON.stringify(statements)}`);
    assert.match(statements[0], /from books where business_id = \$1 for (update|share)/, name);
    assert.match(statements[1], /from devices d join users u/, name);
  }
  assert.equal(await openTransactions(), 0, 'no transaction is left open');
});

async function gatedWriter(name) {
  const who = await twoDevices();
  const uploaded = await api.call('POST', biz(who, 'uploads'), { token: who.first.token, body: { name: 'bill.txt', content: 'Supplier: Kiran Stores' } });
  assert.equal(uploaded.status, 200, uploaded.text);
  const exported = (await api.call('GET', biz(who, 'export'), { token: who.first.token })).body;
  const created = await api.call('POST', '/v1/businesses', { token: who.first.token, body: { name: 'Restore Target', state: '29' } });
  assert.equal(created.status, 200, created.text);
  const targetId = created.body.business.id;
  const context = { userId: who.second.user.id, deviceId: deviceIdOf(who.second.accessToken), requestId: 'running' };
  const actor = { actor: { userId: who.second.user.id, role: 'owner', name: 'Asha' } };
  let reached;
  const inside = new Promise((resolve) => { reached = resolve; });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const vault = createDocumentVault({ now: () => api.clock.now });
  const gated = { ...vault, write: async (...args) => { reached(); await gate; return vault.write(...args); } };
  const runner = createBooksRunner({ db: api.db, now: () => api.clock.now, vault: gated, booksKey: BOOKS_KEY });
  const businessId = name === 'withBooks' ? who.businessId : targetId;
  const start = name === 'withBooks'
    ? () => runner.withBooks(businessId, context, (session) => session.uploadDocument('late.txt', 'A bill that arrives late', actor))
    : () => runner.replaceBooks(businessId, context, { version: 1, state: exported.books, documents: exported.documents, exportedAt: exported.exportedAt });
  return { who, businessId, inside, release, start };
}

const documentsOf = async (businessId) => (await api.db.query('select count(*)::int as n from documents where business_id = $1', [businessId])).rows[0].n;

test('CLOUD-2: a request that is past the first check when its device is signed out is refused before it commits and changes nothing, whichever way it writes the books', async () => {
  for (const name of ['withBooks', 'replaceBooks']) {
    const { who, businessId, inside, release, start } = await gatedWriter(name);
    const before = await footprint(businessId);
    const documentsBefore = await documentsOf(businessId);
    const running = start();
    let outcome;
    try {
      await Promise.race([inside, running.catch(() => {})]);
      await signOutSecond(who);
    } finally {
      release();
      outcome = await running.then(() => null, (err) => err);
    }
    assert.ok(outcome, `${name} committed after its device was signed out`);
    assert.equal(outcome.statusCode, 401, `${name}: ${outcome.message}`);
    assert.deepEqual(outcome.body, REVOKED, name);
    assert.deepEqual(await footprint(businessId), before, `${name} changed no books and wrote no audit row`);
    assert.equal(await documentsOf(businessId), documentsBefore, `${name} stored no document`);
    assert.equal(await openTransactions(), 0, 'no transaction is left open');
  }
});

test('CLOUD-2: a request whose device stays signed in commits when it is held at the same point', async () => {
  for (const name of ['withBooks', 'replaceBooks']) {
    const { businessId, inside, release, start } = await gatedWriter(name);
    const before = await footprint(businessId);
    const documentsBefore = await documentsOf(businessId);
    const running = start();
    await Promise.race([inside, running.catch(() => {})]);
    release();
    await running;
    assert.equal(Number((await footprint(businessId)).version), Number(before.version) + 1, `${name} committed once`);
    assert.ok((await documentsOf(businessId)) > documentsBefore, `${name} stored its document`);
  }
});

const PREFIXES = ['msme udyam', 'tds withheld', 'audit trail from', 'check 26as', 'paid', 'invoice for', 'gst', 'sold', 'lock the books'];
const PADDINGS = { spaces: ' ', tabs: '\t', newlines: '\n', 'no-break spaces': ' ', 'CRLF line ends': '\r\n' };
const padded = (prefix, pad) => `${prefix}${pad.repeat(Math.ceil(1950 / pad.length))}x`.slice(0, 2000);

function loopWatch() {
  let last = performance.now();
  let worst = 0;
  const timer = setInterval(() => {
    const at = performance.now();
    worst = Math.max(worst, at - last);
    last = at;
  }, 10);
  return { stop() { clearInterval(timer); return worst; } };
}

async function oneShot(send) {
  const watch = loopWatch();
  const started = performance.now();
  const out = await send();
  const ms = performance.now() - started;
  return { out, ms, gap: watch.stop() };
}

async function withinBounds(send) {
  let last;
  for (let attempt = 1; attempt <= 3; attempt++) {
    last = await oneShot(send);
    if (last.ms < 1000 && last.gap < 200) return last;
    if (last.ms > 3000) return last;
  }
  return last;
}

async function standsStill(send, victim) {
  let last;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const started = performance.now();
    const answered = send().then((out) => ({ out, ms: performance.now() - started }));
    await sleep(300);
    const other = await victim();
    const victimMs = performance.now() - (started + 300);
    last = { ...(await answered), victimMs, victimStatus: other.status };
    if (last.ms < 1000 && victimMs < 200) return last;
    if (last.ms > 3000) return last;
  }
  return last;
}

function assertQuick(result, what) {
  assert.equal(result.out.status, 200, `${what}: ${result.out.text}`);
  assert.ok(result.ms < 1000, `${what} took ${Math.round(result.ms)} ms`);
  assert.ok(result.gap < 200, `${what} held the event loop for ${Math.round(result.gap)} ms`);
}

async function eachPadded(send, what) {
  for (const prefix of PREFIXES) {
    for (const [kind, pad] of Object.entries(PADDINGS)) {
      assertQuick(await withinBounds(() => send(padded(prefix, pad))), `${what} "${prefix}" + ${kind}`);
    }
  }
}

async function assertOthersAreNotHeld(send, what) {
  const bystander = await api.signIn(freshPhone());
  for (const [kind, pad] of Object.entries(PADDINGS)) {
    const result = await standsStill(() => send(padded('tds withheld', pad)), () => api.call('GET', '/v1/me', { token: bystander.accessToken }));
    assert.equal(result.victimStatus, 200);
    assert.ok(result.ms < 1000, `${what} + ${kind}: the padded message took ${Math.round(result.ms)} ms`);
    assert.ok(result.victimMs < 200, `${what} + ${kind}: another user's GET /v1/me issued 300 ms in took ${Math.round(result.victimMs)} ms`);
  }
}

test('CLOUD-3: a whitespace-padded message in the live ask is answered in milliseconds and does not hold the API for others', async () => {
  const owner = await api.ownerWithBusiness(freshPhone(), { name: 'Padded Traders', state: '29' });
  const ask = (message) => api.call('POST', biz(owner, 'ask'), { token: owner.token, body: { message } });
  await eachPadded(ask, 'ask');
  await assertOthersAreNotHeld(ask, 'ask');
});

test('CLOUD-3: the same holds for the ask on the shared view', async () => {
  const who = await sharedAccountant();
  const ask = (message) => api.call('POST', biz(who, 'ask'), { token: who.first.accessToken, body: { message } });
  assert.equal((await ask('who owes me?')).status, 200, 'the ask reaches the shared books');
  await eachPadded(ask, 'shared ask');
  await assertOthersAreNotHeld(ask, 'shared ask');
});

test('CLOUD-3: the same holds for the WhatsApp webhook, on the live books and on the shared view', async () => {
  const phone = freshPhone();
  await api.ownerWithBusiness(phone, { name: 'WhatsApp Traders', state: '29' });
  const live = (message) => whatsappAsk(phone, message);
  const spoken = await live('who owes me?');
  assert.equal(spoken.body.results[0].replied, true, spoken.text);
  await eachPadded(live, 'WhatsApp');
  await assertOthersAreNotHeld(live, 'WhatsApp');

  const who = await sharedAccountant();
  const shared = (message) => whatsappAsk(who.caPhone, message);
  const before = replies.length;
  const first = await shared('who owes me?');
  assert.equal(first.body.results[0].replied, true, first.text);
  assert.equal(replies.length, before + 1);
  await eachPadded(shared, 'WhatsApp shared');
  await assertOthersAreNotHeld(shared, 'WhatsApp shared');
});

test('CLOUD-3: only runs of four or more whitespace characters are cut to their first character, after the 2000-character cut', async () => {
  const { chatText } = await import('../src/chat-text.mjs');
  const normal = 'invoice Kiran Stores\n8000 GST 18%\n\nbill   Acme 500';
  assert.equal(chatText(normal), normal);
  assert.equal(chatText('a b  c   d'), 'a b  c   d');
  assert.equal(chatText('a\tb\t\t\tc'), 'a\tb\t\t\tc');
  assert.equal(chatText('a    b'), 'a b');
  assert.equal(chatText('a\n\n\n\nb'), 'a\nb');
  assert.equal(chatText('a \t\n b'), 'a b');
  assert.equal(chatText('a     b'), 'a b');
  assert.equal(chatText('a\r\n\r\nb'), 'a\rb');
  assert.equal(chatText('a\r\nb'), 'a\r\nb');
  assert.equal(chatText(`x${' '.repeat(3000)}y`), 'x ');
  assert.equal(chatText('z'.repeat(2500)).length, 2000);
  assert.equal(chatText(' '.repeat(2000)), ' ');
  assert.equal(chatText(''), '');
  assert.equal(chatText(null), '');
  assert.equal(chatText(undefined), '');
  assert.equal(chatText(12345), '12345');
  assert.equal(chatText({ toString: 1 }), '');
  const started = performance.now();
  for (const prefix of PREFIXES) for (const pad of Object.values(PADDINGS)) chatText(padded(prefix, pad));
  assert.ok(performance.now() - started < 200, 'cutting the runs is linear');
});

test('CLOUD-3: an ordinary message reaches the planner unchanged and a padded one reaches it cut, live and on WhatsApp', async () => {
  const phone = freshPhone();
  const owner = await api.ownerWithBusiness(phone, { name: 'Plain Traders', state: '29' });
  const lastHeard = async () => (await api.books(owner.businessId)).chatRecent.at(-1).user;
  const plain = 'who owes me?\nthe big ones first\n\nand   on credit';
  const asked = await api.call('POST', biz(owner, 'ask'), { token: owner.token, body: { message: plain } });
  assert.equal(asked.status, 200, asked.text);
  assert.equal(await lastHeard(), plain);
  const padding = await api.call('POST', biz(owner, 'ask'), { token: owner.token, body: { message: `who owes me?${' '.repeat(300)}and\n\n\n\n\non credit` } });
  assert.equal(padding.status, 200, padding.text);
  assert.equal(await lastHeard(), 'who owes me? and\non credit');

  const heard = [];
  const fake = async (businessId, context, run) => run({ chat: async (text) => { heard.push(text); return { reply: 'noted' }; } }, { asOf: new Date(api.clock.now) });
  const whatsapp = createWhatsApp({ db: api.db, withBooks: fake, withSharedBooks: fake, syncOf, config: WHATSAPP, sender: whatsappSender, now: () => api.clock.now });
  const hear = async (from, text) => {
    const { raw, headers } = signed(incoming(from.slice(1), `wamid.batch4.${nextMessage++}`, text));
    return whatsapp.receive('direct', Buffer.from(raw), headers['x-hub-signature-256']);
  };
  assert.equal((await hear(phone, plain)).ok, true);
  assert.equal((await hear(phone, `who owes me?${'\t'.repeat(900)}and${'\r\n'.repeat(300)}more`)).ok, true);
  assert.equal((await hear(phone, `${' '.repeat(2500)}`)).ok, true);
  assert.deepEqual(heard, [plain, 'who owes me?\tand\rmore', ' ']);
  const who = await sharedAccountant();
  assert.equal((await hear(who.caPhone, plain)).ok, true);
  assert.equal((await hear(who.caPhone, `who owes me?${' '.repeat(900)}now`)).ok, true);
  assert.deepEqual(heard.slice(3), [plain, 'who owes me? now']);
});

test('CLOUD-3: a message of 2000 spaces, or one that cannot be read as text, is refused like an empty one', async () => {
  const owner = await api.ownerWithBusiness(freshPhone(), { name: 'Blank Traders', state: '29' });
  const who = await sharedAccountant();
  const crashesBefore = await crashRows();
  for (const [token, path] of [[owner.token, biz(owner, 'ask')], [who.first.accessToken, biz(who, 'ask')]]) {
    const empty = await api.call('POST', path, { token, body: { message: '' } });
    assert.equal(empty.status, 400);
    assert.equal(empty.body.error, 'MESSAGE_REQUIRED');
    for (const message of [' '.repeat(2000), '\n'.repeat(2000), ' ', undefined, null, { toString: 1 }]) {
      const out = await api.call('POST', path, { token, body: { message } });
      assert.equal(out.status, 400, JSON.stringify(message));
      assert.deepEqual(out.body, empty.body, JSON.stringify(message));
    }
  }
  assert.equal(await crashRows(), crashesBefore, 'no crash is recorded');
  const phone = freshPhone();
  await api.ownerWithBusiness(phone, { name: 'Blank WhatsApp Traders', state: '29' });
  const one = await whatsappAsk(phone, ' ');
  const many = await whatsappAsk(phone, ' '.repeat(2000));
  assert.equal(many.status, 200, many.text);
  assert.deepEqual(many.body.results, one.body.results);
  assert.equal(replies.at(-1).text, replies.at(-2).text, 'the blank message is answered the same however long it is');
});

const ODD_SHAPES = [{ toString: 1 }, {}, { a: 1 }, [], [[]], true, false, null, 1e21, -5];

function assertNotACode(out, label) {
  assert.equal(out.status, 400, `${label}: ${out.text}`);
  assert.ok(['INVALID_CODE', 'INVALID_PHONE'].includes(out.body.error), `${label}: ${out.text}`);
}

test('CLOUD-4: isUuid accepts only a string that is a uuid', () => {
  const id = '3f2b8c1e-5d4a-4b6e-9a1c-7e8d9f0a1b2c';
  assert.equal(isUuid(id), true);
  assert.equal(isUuid(id.toUpperCase()), true);
  const refused = [[id], [[id]], { toString: () => id }, { toString: 1 }, 1, 0, null, undefined, true, false, {}, [], ` ${id}`, `${id} `, `${id}\n`, `${id}x`, id.replace(/-/g, ''), '١٢٣٤٥٦٧٨-١٢٣٤-١٢٣٤-١٢٣٤-١٢٣٤٥٦٧٨٩٠١٢', 'a'.repeat(100_000), ''];
  for (const given of refused) assert.equal(isUuid(given), false, String(typeof given === 'string' ? given.slice(0, 40) : JSON.stringify(given)));
});

test('CLOUD-4: normalizePhone reads a string or a finite number and treats every other value as empty', () => {
  assert.equal(normalizePhone('9876543210'), '+919876543210');
  assert.equal(normalizePhone(' +91 (98765) 43-210 '), '+919876543210');
  assert.equal(normalizePhone(9876543210), '+919876543210');
  assert.equal(normalizePhone('09876543210'), '+919876543210');
  const empty = [null, undefined, true, false, {}, { toString: 1 }, { toString: () => '9876543210' }, [], ['9876543210'], [[9876543210]], NaN, Infinity, -Infinity, '', '   ', '١٢٣٤٥٦٧٨٩٠', '98765 4321', `9${'8'.repeat(100_000)}`, `+91${' '.repeat(100_000)}9876543210x`, '9876543210\u0000'];
  for (const given of empty) assert.equal(normalizePhone(given), '', String(typeof given === 'string' ? given.slice(0, 40) : JSON.stringify(given)));
});

test('CLOUD-4: normaliseCode reads a string or a finite number and treats every other value as empty', () => {
  assert.equal(normaliseCode(' 123 456 '), '123456');
  assert.equal(normaliseCode('ABCDE-FGHJK'), 'abcdefghjk');
  assert.equal(normaliseCode(123456), '123456');
  assert.equal(normaliseCode('12-34 56'), '123456');
  const empty = [null, undefined, true, false, {}, { toString: 1 }, { toString: () => '123456' }, [], ['123456'], [[123456]], NaN, Infinity, ''];
  for (const given of empty) assert.equal(normaliseCode(given), '', JSON.stringify(given));
  assert.equal(normaliseCode('1'.repeat(100_000)).length, 100_000);
  assert.equal(normaliseCode('١٢٣٤٥٦'), '١٢٣٤٥٦');
});

test('CLOUD-4: hostile JSON on the sign-in routes answers the 400 a wrong value gets, with no crash record and no stack in the log', async () => {
  const phone = freshPhone();
  const session = await api.signIn(phone);
  const begun = await api.call('POST', '/v1/me/second-step/begin', { token: session.accessToken });
  const secret = begun.body.secret;
  assert.equal((await api.call('POST', '/v1/me/second-step/confirm', { token: session.accessToken, body: { code: totpCode(base32Decode(secret), api.clock.now) } })).status, 200);
  api.clock.advance(STEP_MS);
  const otp = await api.call('POST', '/v1/auth/otp', { body: { phone } });
  const first = await api.call('POST', '/v1/auth/verify', { body: { challengeId: otp.body.challengeId, phone, code: api.sender.last().code, deviceLabel: 'hostile phone' } });
  assert.equal(first.body.secondStep, true, first.text);
  const challengeId = first.body.challengeId;
  const verifyChallenge = (await api.call('POST', '/v1/auth/otp', { body: { phone } })).body.challengeId;
  const crashesBefore = await crashRows();
  const logsBefore = api.logs.length;

  const hostileIds = [...ODD_SHAPES, [challengeId], [[challengeId]], 5, 'x'];
  const hostileCodes = [...ODD_SHAPES, ['123456'], [totpCode(base32Decode(secret), api.clock.now)]];
  for (const value of hostileIds) {
    assertNotACode(await api.call('POST', '/v1/auth/second-step', { body: { challengeId: value, code: '123456' } }), `second-step challengeId ${JSON.stringify(value)}`);
    assertNotACode(await api.call('POST', '/v1/auth/verify', { body: { challengeId: value, phone, code: '123456' } }), `verify challengeId ${JSON.stringify(value)}`);
  }
  for (const value of hostileCodes) {
    assertNotACode(await api.call('POST', '/v1/auth/second-step', { body: { challengeId, code: value } }), `second-step code ${JSON.stringify(value)}`);
    assertNotACode(await api.call('POST', '/v1/auth/verify', { body: { challengeId: verifyChallenge, phone, code: value } }), `verify code ${JSON.stringify(value)}`);
  }
  for (const value of [...ODD_SHAPES, [phone], [[phone]]]) {
    assertNotACode(await api.call('POST', '/v1/auth/verify', { body: { challengeId: verifyChallenge, phone: value, code: '123456' } }), `verify phone ${JSON.stringify(value)}`);
    const requested = await api.call('POST', '/v1/auth/otp', { body: { phone: value } });
    assert.equal(requested.status, 400, `otp phone ${JSON.stringify(value)}: ${requested.text}`);
    assert.equal(requested.body.error, 'INVALID_PHONE', JSON.stringify(value));
  }
  const attempts = await api.db.query('select attempts from second_step_challenges where id = $1', [challengeId]);
  assert.equal(attempts.rows[0].attempts, 0, 'malformed values are refused before they count');
  assert.equal(await crashRows(), crashesBefore, 'no crash record');
  assert.deepEqual(api.logs.slice(logsBefore).filter((entry) => entry.error), [], 'no stack in the log');
  assert.equal(api.logs.slice(logsBefore).some((entry) => entry.status === 500), false);
});

test('CLOUD-4: hostile JSON on the second-step settings routes is a wrong code, not a server error', async () => {
  const crashesBefore = await crashRows();
  const logsBefore = api.logs.length;
  const enrolling = await api.signIn(freshPhone());
  for (const value of [...ODD_SHAPES, ['000000']]) {
    const begun = await api.call('POST', '/v1/me/second-step/begin', { token: enrolling.accessToken });
    assert.equal(begun.status, 200, begun.text);
    const out = await api.call('POST', '/v1/me/second-step/confirm', { token: enrolling.accessToken, body: { code: value } });
    assertNotACode(out, `confirm ${JSON.stringify(value)}`);
    assert.equal(out.body.attemptsRemaining, 4, JSON.stringify(value));
  }
  const phone = freshPhone();
  const session = await api.signIn(phone);
  const begun = await api.call('POST', '/v1/me/second-step/begin', { token: session.accessToken });
  const confirmed = await api.call('POST', '/v1/me/second-step/confirm', { token: session.accessToken, body: { code: totpCode(base32Decode(begun.body.secret), api.clock.now) } });
  assert.equal(confirmed.status, 200, confirmed.text);
  for (const route of ['disable', 'recovery-codes']) {
    for (const value of [...ODD_SHAPES, ['000000']]) {
      await api.db.query('update user_totp set attempts = 0, failed_at = null where user_id = $1', [session.user.id]);
      const out = await api.call('POST', `/v1/me/second-step/${route}`, { token: session.accessToken, body: { code: value } });
      assertNotACode(out, `${route} ${JSON.stringify(value)}`);
      assert.equal(out.body.attemptsRemaining, 4, `${route} ${JSON.stringify(value)}`);
    }
  }
  assert.equal((await api.call('GET', '/v1/me/second-step', { token: session.accessToken })).body.enabled, true, 'nothing was switched off');
  assert.equal(await crashRows(), crashesBefore, 'no crash record');
  assert.deepEqual(api.logs.slice(logsBefore).filter((entry) => entry.error), [], 'no stack in the log');
});

test('CLOUD-5: a challenge the nightly clean-up has removed is answered CODE_EXPIRED, as it was before; a malformed id or code shape stays INVALID_CODE and a used challenge stays CODE_USED', async () => {
  const gone = await startApi({ jobToken: JOB_TOKEN });
  try {
    const phone = '+919400000001';
    const session = await gone.signIn(phone);
    const begun = await gone.call('POST', '/v1/me/second-step/begin', { token: session.accessToken });
    const secret = begun.body.secret;
    const codeNow = () => totpCode(base32Decode(secret), gone.clock.now);
    assert.equal((await gone.call('POST', '/v1/me/second-step/confirm', { token: session.accessToken, body: { code: codeNow() } })).status, 200);
    const firstStep = async () => {
      const otp = await gone.call('POST', '/v1/auth/otp', { body: { phone } });
      return gone.call('POST', '/v1/auth/verify', { body: { challengeId: otp.body.challengeId, phone, code: gone.sender.last().code, deviceLabel: 'overnight phone' } });
    };
    const secondStep = (challengeId, code) => gone.call('POST', '/v1/auth/second-step', { body: { challengeId, code, deviceLabel: 'overnight phone' } });

    gone.clock.advance(STEP_MS);
    const used = await firstStep();
    assert.equal((await secondStep(used.body.challengeId, codeNow())).status, 200);
    const replay = await secondStep(used.body.challengeId, codeNow());
    assert.equal(replay.body.error, 'CODE_USED', 'a challenge that was used keeps CODE_USED');

    gone.clock.advance(STEP_MS);
    const challenge = await firstStep();
    assert.equal(challenge.body.secondStep, true, challenge.text);
    gone.clock.advance(6 * 60_000);
    const late = await secondStep(challenge.body.challengeId, codeNow());
    assert.equal(late.status, 400);
    assert.equal(late.body.error, 'CODE_EXPIRED');

    gone.clock.advance(25 * HOUR_MS);
    const daily = await gone.call('POST', '/v1/jobs/daily', { headers: { [JOB_HEADER]: JOB_TOKEN } });
    assert.equal(daily.status, 200, daily.text);
    assert.ok(daily.body.purge.secondStepRows >= 1, 'the clean-up removed the challenge');
    const row = await gone.db.query('select count(*)::int as n from second_step_challenges where id = $1', [challenge.body.challengeId]);
    assert.equal(row.rows[0].n, 0);
    const stale = await secondStep(challenge.body.challengeId, codeNow());
    assert.equal(stale.status, 400);
    assert.deepEqual(stale.body, { ok: false, error: 'CODE_EXPIRED' }, 'the same answer the challenge got at six minutes');
    const never = await secondStep(NO_ROW_UUID, codeNow());
    assert.deepEqual(never.body, { ok: false, error: 'CODE_EXPIRED' });

    for (const [id, code] of [['x', codeNow()], [challenge.body.challengeId.slice(1), codeNow()], [NO_ROW_UUID, '1234'], [NO_ROW_UUID, 'abcde-fghjk-m'], [NO_ROW_UUID, ''], [NO_ROW_UUID, undefined], [{ toString: 1 }, codeNow()], [[NO_ROW_UUID], codeNow()]]) {
      const out = await secondStep(id, code);
      assert.equal(out.status, 400, JSON.stringify([id, code]));
      assert.equal(out.body.error, 'INVALID_CODE', JSON.stringify([id, code]));
    }
    assert.equal(await crashRows(gone), 0);
  } finally {
    await gone.close();
  }
});
