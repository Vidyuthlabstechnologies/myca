import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import pg from 'pg';

const ADMIN_URL = process.env.MYCA_TEST_DATABASE_URL || 'postgres://myca@127.0.0.1:54329/postgres';
const name = `myca_t_${randomBytes(6).toString('hex')}`;
const root = fileURLToPath(new URL('../../', import.meta.url));
const port = 20000 + Math.floor(Math.random() * 20000);
const consoleKey = randomBytes(8).toString('hex');
let server;

async function reachable() {
  const client = new pg.Client({ connectionString: ADMIN_URL });
  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

async function dropAll() {
  const client = new pg.Client({ connectionString: ADMIN_URL });
  await client.connect();
  try {
    for (const suffix of ['in', 'us']) await client.query(`drop database if exists ${name}_${suffix} with (force)`);
  } finally {
    await client.end();
  }
}

after(async () => {
  if (server) {
    server.kill('SIGTERM');
    await new Promise((resolve) => server.once('exit', resolve));
  }
  if (await reachable()) await dropAll();
});

test('the India + US sandbox server answers both apps end to end behind one address', { timeout: 120000 }, async (t) => {
  if (!(await reachable())) return t.skip('no Postgres');
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  server = spawn(process.execPath, ['scripts/sandbox-server.mjs', `--port=${port}`, `--public-url=http://127.0.0.1:${port}`, '--quiet'], {
    cwd: root,
    env: { ...process.env, MYCA_DATABASE_URL: url.toString(), MYCA_SANDBOX_CONSOLE_KEY: consoleKey, MYCA_PROVIDER_ENV: '', MYCA_MOCK_MODE: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  server.stdout.on('data', (chunk) => { out += chunk; });
  server.stderr.on('data', (chunk) => { out += chunk; });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`sandbox did not start:\n${out}`)), 60000);
    const watch = setInterval(() => {
      if (out.includes('is running')) {
        clearTimeout(timer);
        clearInterval(watch);
        resolve();
      }
    }, 100);
    server.once('exit', (code) => reject(new Error(`sandbox exited ${code}:\n${out}`)));
  });
  assert.match(out, new RegExp(`/in\\b`));
  const run = await promisify(execFile)(process.execPath, ['scripts/sandbox-server-check.mjs', `http://127.0.0.1:${port}`, consoleKey], { cwd: root }).catch((err) => err);
  assert.equal(run.code ?? 0, 0, `${run.stdout}${run.stderr}`);
  assert.match(run.stdout, /54 passed, 0 failed/);

  const india = await (await fetch(`http://127.0.0.1:${port}/in/v1/health/live`)).json();
  const us = await (await fetch(`http://127.0.0.1:${port}/us/v1/health/live`)).json();
  assert.equal(india.providerMode, 'simulated');
  assert.equal(us.providerMode, 'test');
  assert.notEqual(india.environment, 'production');
  const closed = await fetch(`http://127.0.0.1:${port}/state`);
  assert.equal(closed.status, 403);
});
