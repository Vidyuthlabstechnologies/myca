#!/usr/bin/env node

import { createServer, request } from 'node:http';
import { fork } from 'node:child_process';
import { createHash, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { startUsSandbox } from '../cloud/sandbox/us-sandbox.mjs';
import { testSignInFromEnv } from '../cloud/src/test-sign-in.mjs';
import { keyProblems, applyKeySlots } from '../cloud/src/integrations.mjs';
import { createDb } from '../cloud/src/db.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const given = args.find((arg) => arg.startsWith(`--${name}=`));
  return given ? given.slice(name.length + 3) : fallback;
};
const env = process.env;
const fail = (message) => {
  console.error(message);
  process.exit(1);
};
const quiet = args.includes('--quiet');
const role = option('role', 'front');

const publicUrl = String(option('public-url', env.MYCA_SANDBOX_PUBLIC_URL || '')).replace(/\/+$/, '');
const port = Number(option('port', env.PORT || 8080));
const databaseUrl = String(env.MYCA_DATABASE_URL || '').trim();
if (!databaseUrl) fail('MYCA_DATABASE_URL is required: a Postgres database the sandbox may own (India, UK, UAE and Malaysia use <name>_world, the US <name>_us beside it).');
if (!/^https:\/\//.test(publicUrl) && !/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(`${publicUrl}/`)) fail('--public-url must be the https address of the tunnel, for example https://your-name.ngrok-free.dev');

const loopbackOnly = /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(`${publicUrl}/`);
if (!loopbackOnly && String(env.MYCA_SANDBOX_SEED || '').trim().length < 32) fail('A public sandbox needs MYCA_SANDBOX_SEED: 32 or more random characters. Sign-in tokens, the books key and the console key are derived from it, so it must stay secret.');
const listenHost = option('host', '127.0.0.1');
const derive = (label) => createHash('sha256').update(`${label}:${env.MYCA_SANDBOX_SEED || 'myca-sandbox'}`).digest('hex');
const consoleKey = String(env.MYCA_SANDBOX_CONSOLE_KEY || '').trim() || derive('console').slice(0, 16);
env.MYCA_TEST_PHONES ||= '+919000000001,+919000000002,+919000000003,+12025550143,+12025550144,+12025550145,+60123000001,+60123000002,+971501000001,+971501000002';
env.MYCA_TEST_CODE ||= '246810';
if (String(env.MYCA_ENVIRONMENT || '').trim().toLowerCase() === 'production') fail('MYCA_ENVIRONMENT is production. The sandbox never runs as production.');
env.MYCA_ENVIRONMENT = 'staging';
env.MYCA_PROVIDER_ENV = 'test';
const allowOutside = args.includes('--allow-outside');
const quickoSandbox = allowOutside && Boolean(String(env.MYCA_GSP_TEST_API_KEY || env.MYCA_GSP_API_KEY || '').trim());

const modelKey = String(env.MYCA_MODEL_API_KEY || '').trim();
const modelHost = modelKey ? new URL(String(env.MYCA_MODEL_BASE_URL || '').trim() || 'https://api.anthropic.com').hostname : '';

const GOOGLE_WEB_CLIENT = '645603112925-c1083jmk9hsiact66t2hott02ff75c3r.apps.googleusercontent.com';
const googleClientIds = String(env.MYCA_GOOGLE_CLIENT_IDS || GOOGLE_WEB_CLIENT).split(',').map((id) => id.trim()).filter((id) => id && id !== 'off');
const allowHosts = [...(modelHost ? [modelHost] : []), ...(googleClientIds.length ? ['www.googleapis.com'] : [])];

function databaseFor(country) {
  const url = new URL(databaseUrl);
  url.pathname = `${url.pathname.replace(/\/+$/, '') || '/myca_sandbox'}_${country}`;
  return url.toString();
}

async function ensureDatabase(url) {
  const name = new URL(url).pathname.slice(1);
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = createDb(adminUrl.toString(), { max: 1 });
  try {
    const found = await admin.query('select 1 from pg_database where datname = $1', [name]);
    if (!found.rows.length) await admin.query(`create database "${name.replace(/"/g, '')}"`);
  } finally {
    await admin.close();
  }
}

async function startApi(country) {
  await ensureDatabase(databaseFor(country));
  if (country === 'world' && !quickoSandbox) env.MYCA_MOCK_MODE = '1';
  const refused = keyProblems(env);
  if (refused.length) fail(`Provider keys are mixed or live, so the sandbox will not start:\n- ${refused.join('\n- ')}`);
  applyKeySlots(env);
  const testSignIn = testSignInFromEnv(env, 'staging');
  if (testSignIn.problem) fail(testSignIn.problem);
  return startUsSandbox({
    databaseUrl: databaseFor(country),
    port: 0,
    consolePort: 0,
    host: '127.0.0.1',
    route: option('route', 'partner'),
    plus: option('plus', 'card'),
    publicUrl,
    secret: String(env.MYCA_TOKEN_SECRET || '').trim() || derive(`token-${country}`),
    booksKey: String(env.MYCA_BOOKS_KEY || '').trim() || derive(`books-${country}`),
    connectorKey: String(env.MYCA_CONNECTOR_KEY || '').trim() || derive(`connector-${country}`),
    testSignIn,
    allowOutside,
    allowHosts,
    googleClientIds,
    environment: 'staging',
    log: quiet ? () => {} : (entry) => console.log(JSON.stringify({ app: country, ...entry })),
  });
}

if (role === 'world') {
  const sandbox = await startApi('world').catch((err) => fail(String(err?.message || err)));
  process.send({ apiPort: Number(new URL(sandbox.apiUrl).port) });
  process.on('disconnect', async () => {
    await sandbox.close();
    process.exit(0);
  });
} else {
  const child = fork(fileURLToPath(import.meta.url), [...args.filter((arg) => !arg.startsWith('--role=')), '--role=world'], { env: { ...env } });
  const indiaPort = await new Promise((resolve, reject) => {
    child.once('message', (message) => resolve(message.apiPort));
    child.once('exit', (code) => reject(new Error(`the India, UK, UAE and Malaysia API stopped (exit ${code})`)));
  }).catch((err) => fail(String(err?.message || err)));
  const us = await startApi('us').catch((err) => fail(String(err?.message || err)));
  const usPort = Number(new URL(us.apiUrl).port);

  const OPEN_CONSOLE = [/^\/checkout\/[^/]+$/, /^\/checkout\/[^/]+\/(pay|decline)$/, /^\/paid$/];
  const same = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
  const consoleAllowed = (req, url) => {
    if (OPEN_CONSOLE.some((re) => re.test(url.pathname))) return true;
    const cookie = String(req.headers.cookie || '').split(/;\s*/).find((part) => part.startsWith('myca_sandbox='));
    return Boolean(cookie && same(cookie.slice('myca_sandbox='.length), consoleKey));
  };
  const forward = (req, res, toPort, path) => {
    const upstream = request({ host: '127.0.0.1', port: toPort, method: req.method, path, headers: { ...req.headers, host: `127.0.0.1:${toPort}` } }, (answer) => {
      res.writeHead(answer.statusCode || 502, answer.headers);
      answer.pipe(res);
    });
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
      res.end('{"ok":false,"error":"SANDBOX_UPSTREAM"}');
    });
    req.pipe(upstream);
  };

  const front = createServer((req, res) => {
    const url = new URL(req.url, 'http://sandbox');
    const world = /^\/(in|uk|uae|my)(\/v1\/.*)$/.exec(req.url);
    if (world) return forward(req, res, indiaPort, world[2]);
    if (url.pathname.startsWith('/us/v1/')) return forward(req, res, usPort, req.url.slice(3));
    if (url.pathname.startsWith('/v1/')) return forward(req, res, usPort, req.url);
    if (url.pathname === '/' && url.searchParams.get('k')) {
      if (!same(url.searchParams.get('k'), consoleKey)) {
        res.writeHead(403, { 'content-type': 'text/plain' });
        return res.end('Wrong console key.');
      }
      res.writeHead(303, { location: '/', 'set-cookie': `myca_sandbox=${consoleKey}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${publicUrl.startsWith('https:') ? '; Secure' : ''}` });
      return res.end();
    }
    if (!consoleAllowed(req, url)) {
      res.writeHead(403, { 'content-type': 'text/html; charset=utf-8' });
      return res.end('<!doctype html><meta name="viewport" content="width=device-width"><p style="font:16px system-ui;padding:16px">MyCA sandbox. Open the console link printed on the sandbox computer (it ends in <code>/?k=...</code>).</p>');
    }
    return forward(req, res, us.consolePort, req.url);
  });
  front.keepAliveTimeout = 65000;
  await new Promise((resolve) => front.listen(port, listenHost, resolve));

  console.log(`MyCA sandbox (India, US, UK, UAE, Malaysia) is running.
  Local     http://127.0.0.1:${port}
  India app ${publicUrl}/in   (GST, e-invoice, e-way bill: ${quickoSandbox ? 'Quicko sandbox with the TEST key' : 'simulated, nothing reaches a government'})
  UK app    ${publicUrl}/uk   (HMRC MTD simulated)
  UAE app   ${publicUrl}/uae  (FTA VAT and PINT AE e-invoicing simulated)
  MY app    ${publicUrl}/my   (LHDN MyInvois simulated)
  US app    ${publicUrl}/us   (Stripe test checkout and the e-file partner are faked; play them on the console)
  Console   ${publicUrl}/?k=${consoleKey}
  AI chat   ${modelKey ? `on: ${env.MYCA_MODEL || 'claude-sonnet-5-5'} at ${modelHost} (MYCA_MODEL_API_KEY)` : 'off: set MYCA_MODEL_API_KEY (an Anthropic API key) before starting to turn it on'}
  Google    ${googleClientIds.length ? `on for ${googleClientIds.join(', ')}` : 'off'}
  Sign in   any of ${env.MYCA_TEST_PHONES} with code ${env.MYCA_TEST_CODE}
Stop with Ctrl+C. Data stays in the databases between runs.`);

  const stop = async () => {
    front.close();
    child.disconnect();
    await us.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
