import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createDb } from '../src/db.mjs';

const DATABASE_URL = process.env.MYCA_TEST_DATABASE_URL || 'postgres://myca@127.0.0.1:54329/postgres';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(done, what) {
  for (let waited = 0; waited < 10_000; waited += 10) {
    if (done()) return;
    await sleep(10);
  }
  assert.fail(`timed out waiting for ${what}`);
}

async function endBackend(pid) {
  const admin = new pg.Client({ connectionString: DATABASE_URL });
  await admin.connect();
  try {
    const ended = await admin.query('select pg_terminate_backend($1) as ended', [pid]);
    assert.equal(ended.rows[0].ended, true);
  } finally {
    await admin.end();
  }
}

test('a pooled connection the database ends while it is idle is reported to the caller, not thrown, and the next query opens a new one', async () => {
  const reported = [];
  const db = createDb(DATABASE_URL, { max: 2, onError: (err) => reported.push(err.message) });
  try {
    const pid = (await db.query('select pg_backend_pid() as pid')).rows[0].pid;
    await endBackend(pid);
    await until(() => reported.length > 0, 'the pool to report the lost connection');
    assert.match(reported[0], /terminating connection due to administrator command/);
    const next = (await db.query('select pg_backend_pid() as pid')).rows[0].pid;
    assert.notEqual(next, pid);
  } finally {
    await db.close();
  }
});

test('with no reporter given the pool still carries on when the database ends an idle connection', async () => {
  const db = createDb(DATABASE_URL, { max: 2 });
  try {
    const pid = (await db.query('select pg_backend_pid() as pid')).rows[0].pid;
    await endBackend(pid);
    await sleep(200);
    const next = (await db.query('select pg_backend_pid() as pid')).rows[0].pid;
    assert.notEqual(next, pid);
  } finally {
    await db.close();
  }
});
