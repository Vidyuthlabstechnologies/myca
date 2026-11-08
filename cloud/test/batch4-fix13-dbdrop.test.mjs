import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createApi } from '../src/api.mjs';
import { createCaptureSender } from '../src/auth.mjs';
import { createDb, migrate } from '../src/db.mjs';
import { PRIVACY_NOTICE } from '../src/consent.mjs';
import { BOOKS_KEY, SECRET } from './helpers.mjs';

const ADMIN_URL = process.env.MYCA_TEST_DATABASE_URL || 'postgres://myca@127.0.0.1:54329/postgres';
const HERE = dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const BUSY = { ok: false, error: 'SERVER_BUSY' };

async function admin(sql, params = []) {
  const client = new pg.Client({ connectionString: ADMIN_URL });
  client.on('error', () => {});
  await client.connect();
  try {
    return await client.query(sql, params);
  } finally {
    await client.end();
  }
}

function watchUncaught() {
  const seen = [];
  const listener = (err) => seen.push(err);
  process.on('uncaughtException', listener);
  return { seen, stop: () => process.removeListener('uncaughtException', listener) };
}

function expectBusy(err, what) {
  assert.ok(err instanceof Error, `${what}: an error`);
  assert.equal(err.statusCode, 503, `${what}: ${err.message}`);
  assert.deepEqual(err.body, BUSY, what);
  assert.equal(err.message, 'SERVER_BUSY', what);
}

async function settle(promise) {
  return promise.then((value) => ({ value }), (error) => ({ error }));
}

function swap(target, name, replacement) {
  const original = target[name];
  target[name] = replacement(original);
  return () => {
    target[name] = original;
  };
}

function queryText(args) {
  return typeof args[0] === 'string' ? args[0] : String(args[0]?.text ?? '');
}

function beforeQuery(match, act) {
  let used = 0;
  const restore = swap(pg.Client.prototype, 'query', (original) => function query(...args) {
    if (match(queryText(args), used)) {
      used += 1;
      return Promise.resolve(act(this)).then(() => original.apply(this, args));
    }
    return original.apply(this, args);
  });
  return { restore, used: () => used };
}

async function withDatabase(fn, { max = 3, migrated = false } = {}) {
  const name = `myca_t_${randomBytes(6).toString('hex')}`;
  await admin(`create database ${name}`);
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  const errors = [];
  const db = createDb(url.toString(), { max, onError: (err) => errors.push(err) });
  const watcher = new pg.Client({ connectionString: url.toString() });
  watcher.on('error', () => {});
  await watcher.connect();
  const backends = async () => (await watcher.query('select count(*)::int as n from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()', [name])).rows[0].n;
  const killBackend = async (pid) => {
    await watcher.query('select pg_terminate_backend($1)', [pid]);
    await sleep(150);
  };
  const killAll = async () => {
    await watcher.query('select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()', [name]);
    await sleep(200);
  };
  try {
    if (migrated) await migrate(db);
    return await fn({ db, url: url.toString(), name, errors, watcher, backends, killBackend, killAll });
  } finally {
    await Promise.race([db.close().catch(() => {}), sleep(2000)]);
    await watcher.end().catch(() => {});
    await admin(`drop database if exists ${name} with (force)`);
  }
}

const pidOf = async (q) => (await q('select pg_backend_pid() as pid')).rows[0].pid;

const POINTS = {
  begin: async (world) => {
    const hook = beforeQuery((text) => text === 'begin', (client) => world.killBackend(client.processID));
    try {
      return await settle(world.db.tx(async (q) => (await q('select 1')).rowCount));
    } finally {
      hook.restore();
    }
  },
  statement: async (world) => settle(world.db.tx(async (q) => {
    const pid = await pidOf(q);
    const running = settle(q('select pg_sleep(10)'));
    await sleep(80);
    await world.killBackend(pid);
    const out = await running;
    if (out.error) throw out.error;
    return out.value;
  })),
  between: async (world) => settle(world.db.tx(async (q) => {
    const pid = await pidOf(q);
    await q('select 1');
    await world.killBackend(pid);
    return q('select 2');
  })),
  commit: async (world) => {
    const hook = beforeQuery((text) => text === 'commit', (client) => world.killBackend(client.processID));
    try {
      return await settle(world.db.tx(async (q) => (await q('select 1')).rowCount));
    } finally {
      hook.restore();
    }
  },
};

for (const [point, drop] of Object.entries(POINTS)) {
  test(`D1: a connection that dies at ${point} rejects with SERVER_BUSY, raises no uncaught exception, is discarded, and the next transaction works`, async () => {
    const guard = watchUncaught();
    try {
      await withDatabase(async (world) => {
        assert.equal((await world.db.tx((q) => q('select 1'))).rowCount, 1);
        assert.equal(await world.backends(), 1, 'one pooled connection before');
        const out = await drop(world);
        assert.ok(out.error, `the transaction rejected at ${point}`);
        expectBusy(out.error, point);
        const next = await world.db.tx(async (q) => (await q('select 42 as n')).rows[0].n);
        assert.equal(next, 42, 'the pool serves the next transaction on a fresh connection');
        await sleep(150);
        assert.equal(await world.backends(), 1, 'the dead connection was discarded, not kept');
        assert.equal(guard.seen.length, 0, guard.seen.map((err) => err.message).join(' | '));
      });
    } finally {
      guard.stop();
    }
  });
}

test('D1: the process that holds the transaction exits 0 when its connection is killed and it closes the pool', async () => {
  await withDatabase(async (world) => {
    const script = `
      import { createDb } from ${JSON.stringify(join(HERE, '..', 'src', 'db.mjs'))};
      const db = createDb(${JSON.stringify(world.url)}, { max: 2 });
      let busy = '';
      try {
        await db.tx(async (q) => {
          const pid = (await q('select pg_backend_pid() as pid')).rows[0].pid;
          console.log('PID ' + pid);
          await q('select pg_sleep(10)');
        });
      } catch (err) {
        busy = err.statusCode + ' ' + (err.body && err.body.error);
      }
      const again = await db.tx((q) => q('select 1 as n'));
      console.log('RESULT ' + busy + ' ' + again.rows[0].n);
      await db.close();
    `;
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err += chunk; });
    const exited = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })));
    let pid = 0;
    for (let waited = 0; !pid && waited < 5000; waited += 25) {
      const found = out.match(/PID (\d+)/);
      if (found) pid = Number(found[1]);
      else await sleep(25);
    }
    assert.ok(pid, `the child reported its backend: ${out} ${err}`);
    await sleep(80);
    await world.watcher.query('select pg_terminate_backend($1)', [pid]);
    const done = await Promise.race([exited, sleep(8000).then(() => ({ code: 'still running' }))]);
    if (done.code === 'still running') child.kill('SIGKILL');
    assert.equal(done.code, 0, `exit code with stderr: ${err.slice(0, 400)}`);
    assert.match(out, /RESULT 503 SERVER_BUSY 1/);
  });
});

test('D1: five concurrent transactions of which two lose their connection: those two answer SERVER_BUSY, the other three complete', async () => {
  const guard = watchUncaught();
  try {
    await withDatabase(async (world) => {
      const pids = [];
      const runs = Array.from({ length: 5 }, (_, index) => settle(world.db.tx(async (q) => {
        pids[index] = await pidOf(q);
        await q('select pg_sleep(0.6)');
        return index;
      })));
      for (let waited = 0; pids.filter(Boolean).length < 3 && waited < 3000; waited += 20) await sleep(20);
      const first = pids.map((pid, index) => [pid, index]).filter(([pid]) => pid).slice(0, 2);
      assert.equal(first.length, 2);
      for (const [pid] of first) await world.watcher.query('select pg_terminate_backend($1)', [pid]);
      const done = await Promise.all(runs);
      const lost = done.filter((item) => item.error);
      const kept = done.filter((item) => !item.error);
      assert.equal(lost.length, 2, done.map((item) => item.error?.message ?? item.value).join(','));
      assert.equal(kept.length, 3);
      for (const item of lost) expectBusy(item.error, 'a lost connection');
      assert.equal((await world.db.tx((q) => q('select 1'))).rowCount, 1);
      assert.equal(guard.seen.length, 0);
    }, { max: 3 });
  } finally {
    guard.stop();
  }
});

test('D1: a handler that throws a plain error inside a transaction still rejects with that error unchanged, and the connection is reused', async () => {
  await withDatabase(async (world) => {
    const first = await world.db.tx(pidOf);
    const boom = new Error('boom');
    const out = await settle(world.db.tx(async () => {
      throw boom;
    }));
    assert.equal(out.error, boom);
    assert.equal(out.error.statusCode, undefined);
    const typed = Object.assign(new Error('NOT_FOUND'), { statusCode: 404, body: { ok: false, error: 'NOT_FOUND' } });
    const second = await settle(world.db.tx(async () => {
      throw typed;
    }));
    assert.equal(second.error, typed);
    assert.equal(await world.db.tx(pidOf), first, 'the same pooled connection served the next transaction');
    assert.equal(await world.backends(), 1);
  });
});

test('D1: a transaction that fails for a reason of its own rolls back and keeps its connection', async () => {
  await withDatabase(async (world) => {
    await world.db.tx((q) => q('create table t (a int primary key)'));
    const first = await world.db.tx(pidOf);
    const duplicate = await settle(world.db.tx(async (q) => {
      await q('insert into t values (1)');
      await q('insert into t values (1)');
    }));
    assert.equal(duplicate.error.code, '23505');
    assert.equal(duplicate.error.statusCode, undefined);
    assert.equal((await world.db.tx((q) => q('select count(*)::int as n from t'))).rows[0].n, 0, 'rolled back');
    assert.equal(await world.db.tx(pidOf), first);
  });
});

const FAMILY = [
  ...['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', '08000', '08001', '08003', '08004', '08006', '57P01', '57P02', '57P03', '53300'].map((code) => ({ label: `code ${code}`, make: () => Object.assign(new Error(`failed with ${code}`), { code }) })),
  ...['Connection terminated unexpectedly', 'Client has encountered a connection error and is not queryable', 'timeout exceeded when trying to connect', 'Connection terminated due to connection timeout'].map((message) => ({ label: message, make: () => new Error(message) })),
];

const OUTSIDE = [
  { label: 'unique violation 23505', make: () => Object.assign(new Error('duplicate key value'), { code: '23505' }) },
  { label: 'syntax error 42601', make: () => Object.assign(new Error('syntax error at or near "selec"'), { code: '42601' }) },
  { label: 'serialization failure 40001', make: () => Object.assign(new Error('could not serialize access'), { code: '40001' }) },
  { label: 'cancelled by the database 57014', make: () => Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' }) },
  { label: 'a plain error', make: () => new Error('boom') },
  { label: 'a code outside the family with a message inside it', make: () => Object.assign(new Error('Connection terminated unexpectedly'), { code: '23505' }) },
];

async function through(world, where, err) {
  if (where === 'query') {
    const restore = swap(pg.Pool.prototype, 'query', () => () => Promise.reject(err));
    try {
      return await settle(world.db.query('select 1'));
    } finally {
      restore();
    }
  }
  if (where === 'acquire') {
    const restore = swap(pg.Pool.prototype, 'connect', () => () => Promise.reject(err));
    try {
      return await settle(world.db.tx((q) => q('select 1')));
    } finally {
      restore();
    }
  }
  const text = { begin: 'begin', statement: 'select 7', commit: 'commit' }[where];
  const hook = swap(pg.Client.prototype, 'query', (original) => function query(...args) {
    if (queryText(args) === text) return Promise.reject(err);
    return original.apply(this, args);
  });
  try {
    return await settle(world.db.tx((q) => q('select 7')));
  } finally {
    hook();
  }
}

for (const where of ['query', 'acquire', 'begin', 'statement', 'commit']) {
  test(`D2: every connection failure is SERVER_BUSY at ${where}, and nothing outside the family is touched`, async () => {
    await withDatabase(async (world) => {
      for (const member of FAMILY) {
        const cause = member.make();
        const out = await through(world, where, cause);
        assert.ok(out.error, `${member.label}: rejected`);
        expectBusy(out.error, `${member.label} at ${where}`);
        assert.equal(out.error.cause, cause, `${member.label}: the original error is kept as the cause`);
      }
      for (const other of OUTSIDE) {
        const cause = other.make();
        const out = await through(world, where, cause);
        assert.equal(out.error, cause, `${other.label} at ${where}: the same error object comes back`);
        assert.equal(out.error.statusCode, undefined, other.label);
        assert.equal(out.error.body, undefined, other.label);
      }
    });
  });
}

test('D2: a rollback that fails after another error never replaces that error', async () => {
  await withDatabase(async (world) => {
    const boom = new Error('boom');
    const reset = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
    const hook = swap(pg.Client.prototype, 'query', (original) => function query(...args) {
      if (queryText(args) === 'rollback') return Promise.reject(reset);
      return original.apply(this, args);
    });
    try {
      const plain = await settle(world.db.tx(async () => {
        throw boom;
      }));
      assert.equal(plain.error, boom, 'a handler error stays the handler error');
      const typed = Object.assign(new Error('NOT_FOUND'), { statusCode: 404, body: { ok: false, error: 'NOT_FOUND' } });
      const handled = await settle(world.db.tx(async () => {
        throw typed;
      }));
      assert.equal(handled.error, typed);
    } finally {
      hook();
    }
    const lost = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });
    const both = swap(pg.Client.prototype, 'query', (original) => function query(...args) {
      const text = queryText(args);
      if (text === 'select 9') return Promise.reject(lost);
      if (text === 'rollback') return Promise.reject(reset);
      return original.apply(this, args);
    });
    try {
      const out = await settle(world.db.tx((q) => q('select 9')));
      expectBusy(out.error, 'the statement error, translated, not the rollback error');
      assert.equal(out.error.cause, lost);
    } finally {
      both();
    }
    assert.equal((await world.db.tx((q) => q('select 1'))).rowCount, 1);
  });
});

test('D2: a database nobody listens on answers SERVER_BUSY to a query and to a transaction, with the refusal as its cause', async () => {
  const closed = await new Promise((resolve) => {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
  const db = createDb(`postgres://myca@127.0.0.1:${closed}/none`, { max: 2 });
  try {
    const asked = await settle(db.query('select 1'));
    expectBusy(asked.error, 'query on a closed port');
    assert.equal(asked.error.cause.code, 'ECONNREFUSED');
    const held = await settle(db.tx((q) => q('select 1')));
    expectBusy(held.error, 'tx on a closed port');
    assert.equal(held.error.cause.code, 'ECONNREFUSED');
  } finally {
    await db.close().catch(() => {});
  }
});

test('D2: a connection killed while it sat idle in the pool does not fail the next query: the pool drops it and the query runs on a fresh one', async () => {
  const guard = watchUncaught();
  try {
    await withDatabase(async (world) => {
      assert.equal((await world.db.query('select 1')).rowCount, 1);
      assert.equal(await world.backends(), 1);
      await world.killAll();
      const out = await settle(world.db.query('select 2 as n'));
      assert.equal(out.error, undefined, 'never a 500: pg-pool discards an errored idle client, so the query succeeds on a fresh connection');
      assert.equal(out.value.rows[0].n, 2);
      const held = await settle(world.db.tx(async (q) => (await q('select 3 as n')).rows[0].n));
      assert.equal(held.value, 3);
      assert.equal(guard.seen.length, 0);
    });
  } finally {
    guard.stop();
  }
});

test('D2: a statement the database cancels for taking too long is not a lost connection and stays as it was', async () => {
  await withDatabase(async (world) => {
    const out = await settle(world.db.tx(async (q) => {
      await q("set local statement_timeout = '50ms'");
      await q('select pg_sleep(5)');
    }));
    assert.equal(out.error.code, '57014');
    assert.equal(out.error.statusCode, undefined);
    assert.equal(out.error.body, undefined);
    assert.equal((await world.db.tx((q) => q('select 1'))).rowCount, 1);
  });
});

async function startApi({ db: wrap } = {}) {
  const name = `myca_t_${randomBytes(6).toString('hex')}`;
  await admin(`create database ${name}`);
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  const raw = createDb(url.toString(), { max: 4 });
  await migrate(raw);
  const db = wrap ? wrap(raw) : raw;
  const watcher = new pg.Client({ connectionString: url.toString() });
  watcher.on('error', () => {});
  await watcher.connect();
  const sender = createCaptureSender();
  const logs = [];
  const handler = createApi({ db, secret: SECRET, otpSender: sender, googleClientIds: [], connectorKey: 'connector-key-for-tests-0123456789abcdef0123456789', booksKey: BOOKS_KEY, now: () => Date.now(), log: (entry) => logs.push(entry) });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, { token, body } = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { unparsed: text };
    }
    return { status: res.status, body: parsed, retryAfter: res.headers.get('retry-after'), requestId: res.headers.get('x-request-id') };
  };
  const signIn = async (number) => {
    const otp = await call('POST', '/v1/auth/otp', { body: { phone: number } });
    const verified = await call('POST', '/v1/auth/verify', { body: { challengeId: otp.body.challengeId, phone: number, code: sender.last().code, deviceLabel: 'test phone' } });
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    const agreed = await call('POST', '/v1/me/consent', { token: verified.body.accessToken, body: { document: PRIVACY_NOTICE.document, version: PRIVACY_NOTICE.version } });
    assert.equal(agreed.status, 200);
    return verified.body.accessToken;
  };
  const crashes = async () => (await watcher.query('select count(*)::int as n from crash_reports')).rows[0].n;
  const close = async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await Promise.race([raw.close().catch(() => {}), sleep(2000)]);
    await watcher.end().catch(() => {});
    await admin(`drop database if exists ${name} with (force)`);
  };
  const killAll = async () => {
    await admin('select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> $2', [name, watcher.processID]);
    await sleep(200);
  };
  return { call, signIn, logs, crashes, close, killAll, name };
}

function noStack(api) {
  const text = JSON.stringify(api.logs);
  assert.doesNotMatch(text, /\n\s+at |stack|Error:/, 'no stack in the log');
}

test('D2: a request whose connection dies answers 503 SERVER_BUSY with Retry-After 2, records no crash, logs no stack, and the next request works', async () => {
  const guard = watchUncaught();
  const api = await startApi();
  try {
    const hook = beforeQuery((text) => /pg_advisory_xact_lock/.test(text), (client) => admin('select pg_terminate_backend($1)', [client.processID]).then(() => sleep(150)));
    let lost;
    try {
      lost = await api.call('POST', '/v1/auth/otp', { body: { phone: '+919810000001' } });
    } finally {
      hook.restore();
    }
    assert.equal(lost.status, 503, JSON.stringify(lost.body));
    assert.deepEqual(lost.body, BUSY);
    assert.equal(lost.retryAfter, '2');
    assert.equal(await api.crashes(), 0);
    const line = api.logs.find((entry) => entry.requestId === lost.requestId && entry.status);
    assert.equal(line.status, 503);
    assert.equal(api.logs.some((entry) => entry.status === 500 || entry.error), false);
    noStack(api);
    const again = await api.call('POST', '/v1/auth/otp', { body: { phone: '+919810000001' } });
    assert.equal(again.status, 200, JSON.stringify(again.body));
    assert.equal(guard.seen.length, 0);
  } finally {
    guard.stop();
    await api.close();
  }
});

test('D2: a request that runs one statement on a connection that dies answers 503 too, and the pool serves the next one', async () => {
  const guard = watchUncaught();
  const api = await startApi();
  try {
    const token = await api.signIn('+919810000002');
    const hook = beforeQuery((text) => /from devices d join users u/.test(text), (client) => admin('select pg_terminate_backend($1)', [client.processID]).then(() => sleep(150)));
    let lost;
    try {
      lost = await api.call('GET', '/v1/me', { token });
    } finally {
      hook.restore();
    }
    assert.equal(lost.status, 503, JSON.stringify(lost.body));
    assert.deepEqual(lost.body, BUSY);
    assert.equal(lost.retryAfter, '2');
    assert.equal(await api.crashes(), 0);
    noStack(api);
    const next = await api.call('GET', '/v1/me', { token });
    assert.equal(next.status, 200, JSON.stringify(next.body));
    assert.equal(guard.seen.length, 0);
  } finally {
    guard.stop();
    await api.close();
  }
});

test('D2: with the user in place, every pooled backend terminated, the next GET /v1/me is served (never a 500) and nothing is recorded', async () => {
  const api = await startApi();
  try {
    const token = await api.signIn('+919810000003');
    const first = await api.call('GET', '/v1/me', { token });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    await api.killAll();
    const second = await api.call('GET', '/v1/me', { token });
    assert.notEqual(second.status, 500, JSON.stringify(second.body));
    assert.equal(second.status, 200, JSON.stringify(second.body));
    assert.equal(await api.crashes(), 0);
  } finally {
    await api.close();
  }
});

test('D1: five concurrent requests of which two lose their connection: two answer 503, three answer 200, nothing is recorded as a crash', async () => {
  const guard = watchUncaught();
  const api = await startApi();
  try {
    const hook = beforeQuery((text, used) => /pg_advisory_xact_lock/.test(text) && used < 2, (client) => admin('select pg_terminate_backend($1)', [client.processID]).then(() => sleep(100)));
    let answers;
    try {
      answers = await Promise.all(Array.from({ length: 5 }, (_, index) => api.call('POST', '/v1/auth/otp', { body: { phone: `+91981000010${index}` } })));
    } finally {
      hook.restore();
    }
    const statuses = answers.map((answer) => answer.status).sort();
    assert.deepEqual(statuses, [200, 200, 200, 503, 503], JSON.stringify(answers.map((answer) => answer.body)));
    for (const answer of answers.filter((item) => item.status === 503)) {
      assert.deepEqual(answer.body, BUSY);
      assert.equal(answer.retryAfter, '2');
    }
    assert.equal(await api.crashes(), 0);
    assert.equal(guard.seen.length, 0);
  } finally {
    guard.stop();
    await api.close();
  }
});

test('D2: a request that hits a real bug is still answered 500 and recorded, so the translation is not a blanket', async () => {
  let armed = false;
  const api = await startApi({
    db: (raw) => ({
      query: (text, params) => {
        if (armed && /from devices d join users u/.test(text)) {
          armed = false;
          return Promise.reject(new TypeError('Cannot read properties of undefined'));
        }
        return raw.query(text, params);
      },
      tx: (run) => raw.tx(run),
      close: () => raw.close(),
    }),
  });
  try {
    const token = await api.signIn('+919810000004');
    armed = true;
    const bug = await api.call('GET', '/v1/me', { token });
    assert.equal(bug.status, 500, JSON.stringify(bug.body));
    assert.deepEqual(bug.body, { ok: false, error: 'INTERNAL_ERROR' });
    assert.equal(bug.retryAfter, null);
    assert.equal(await api.crashes(), 1);
    assert.equal(api.logs.some((entry) => entry.requestId === bug.requestId && /TypeError/.test(entry.error || '')), true);
  } finally {
    await api.close();
  }
});
