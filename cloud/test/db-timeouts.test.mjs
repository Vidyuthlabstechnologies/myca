import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, sessionOptions } from '../src/db.mjs';

const URL_ = process.env.MYCA_TEST_DATABASE_URL || 'postgres://myca@127.0.0.1:54329/postgres';

test('timeouts become session options only when asked for', () => {
  assert.equal(sessionOptions(), '');
  assert.equal(sessionOptions({ statementTimeoutMs: 30000, lockTimeoutMs: 8000, idleInTransactionMs: 60000 }), '-c statement_timeout=30000 -c lock_timeout=8000 -c idle_in_transaction_session_timeout=60000');
  assert.equal(sessionOptions({ statementTimeoutMs: -1, lockTimeoutMs: 1.5 }), '');
});

test('a slow statement is stopped by the database, and the pool carries on', async () => {
  const db = createDb(URL_, { max: 1, statementTimeoutMs: 300 });
  try {
    const shown = await db.query('show statement_timeout');
    assert.equal(shown.rows[0].statement_timeout, '300ms');
    await assert.rejects(db.query('select pg_sleep(3)'), (err) => err.code === '57014');
    assert.equal((await db.query('select 1 as ok')).rows[0].ok, 1, 'the pool still works afterwards');
  } finally {
    await db.close();
  }
});

test('a request that waits too long for a row lock gives up as busy while the holder is unaffected', async () => {
  const db = createDb(URL_, { max: 3, lockTimeoutMs: 400 });
  try {
    await db.query('create temp table if not exists x (id int)').catch(() => {});
    await db.query('drop table if exists lock_probe');
    await db.query('create table lock_probe (id int primary key, v int)');
    await db.query('insert into lock_probe values (1, 0)');
    const holder = await db.tx(async (q) => {
      await q('select * from lock_probe where id = 1 for update');
      const started = Date.now();
      const waiter = db.tx(async (q2) => q2('select * from lock_probe where id = 1 for update'));
      await assert.rejects(waiter, (err) => err.message === 'SERVER_BUSY' && err.statusCode === 503);
      return Date.now() - started;
    });
    assert.ok(holder >= 300 && holder < 3000, `gave up after ${holder} ms`);
  } finally {
    await db.query('drop table if exists lock_probe').catch(() => {});
    await db.close();
  }
});

test('migrations are not cut short by the server timeouts', async () => {
  const db = createDb(URL_, { max: 1, statementTimeoutMs: 50, lockTimeoutMs: 50 });
  try {
    const seen = await db.tx(async (q) => {
      await q('set local statement_timeout = 0');
      const r = await q('show statement_timeout');
      return r.rows[0].statement_timeout;
    });
    assert.equal(seen, '0');
  } finally {
    await db.close();
  }
});
