import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApi } from '../src/api.mjs';
import { createCaptureSender } from '../src/auth.mjs';
import { startApi, SECRET, BOOKS_KEY } from './helpers.mjs';

let api;
before(async () => { api = await startApi(); });
after(async () => { await api.close(); });

async function serveWith(db, options = {}) {
  const handler = createApi({ db, secret: SECRET, otpSender: createCaptureSender(), booksKey: BOOKS_KEY, log: () => {}, ...options });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    get: async (path) => {
      const res = await fetch(`${base}${path}`);
      return { status: res.status, body: await res.json(), retryAfter: res.headers.get('retry-after') };
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test('the health check reads the database and reports the environment and provider mode', async () => {
  const health = await api.call('GET', '/v1/health');
  assert.equal(health.status, 200, health.text);
  assert.equal(health.body.database, 'ok');
  assert.equal(health.body.environment, 'local');
  assert.equal(health.body.providerMode, 'off');
});

test('the health check answers 503 when the database refuses, and liveness stays 200', async () => {
  const down = { query: async () => { throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }); }, tx: async () => { throw new Error('down'); } };
  const served = await serveWith(down, { environment: 'staging' });
  try {
    const health = await served.get('/v1/health');
    assert.equal(health.status, 503);
    assert.equal(health.body.error, 'DATABASE_UNAVAILABLE');
    assert.equal(health.body.environment, 'staging');
    assert.equal(health.retryAfter, '2');
    const live = await served.get('/v1/health/live');
    assert.equal(live.status, 200);
    assert.equal(live.body.environment, 'staging');
  } finally {
    await served.close();
  }
});

test('the health check gives up on a database that hangs instead of hanging itself', async () => {
  const hanging = { query: () => new Promise(() => {}), tx: () => new Promise(() => {}) };
  const served = await serveWith(hanging, { healthTimeoutMs: 100 });
  try {
    const started = Date.now();
    const health = await served.get('/v1/health');
    assert.equal(health.status, 503);
    assert.ok(Date.now() - started < 2000);
  } finally {
    await served.close();
  }
});
