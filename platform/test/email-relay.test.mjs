import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import relay from '../../email-relay/src/index.js';

const TOKEN = 'relay-token-0123456789abcdef';
const RELAY_SOURCE = readFileSync(new URL('../../email-relay/src/index.js', import.meta.url), 'utf8');
const realFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = () => { throw new Error('the relay test must not reach the network'); };
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubEnv(overrides = {}) {
  const sent = [];
  const env = {
    RELAY_TOKEN: TOKEN,
    ALLOWED_FROM_DOMAIN: 'yourfirm.in',
    EMAIL: { send: async (message) => { sent.push(message); return { messageId: `msg-${sent.length}` }; } },
    ...overrides,
  };
  return { env, sent };
}

function post(body, { auth = `Bearer ${TOKEN}`, method = 'POST' } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (auth !== null) headers.authorization = auth;
  return new Request('https://relay.example.test/', { method, headers, body: method === 'GET' ? undefined : JSON.stringify(body) });
}

const MESSAGE = { from: 'compliance@yourfirm.in', to: 'client@example.com', subject: 'Invoice INV-0001', text: 'Please find the invoice.' };

async function call(env, body = MESSAGE, options) {
  const res = await relay.fetch(post(body, options), env);
  return { status: res.status, body: await res.json() };
}

test('relay: a successful send returns id, which the MyCA client reads, and keeps messageId', async () => {
  const { env, sent } = stubEnv();
  const out = await call(env);
  assert.equal(out.status, 200);
  assert.deepEqual(out.body, { ok: true, id: 'msg-1', messageId: 'msg-1' });
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].to, ['client@example.com']);
  assert.deepEqual(sent[0].from, { email: 'compliance@yourfirm.in', name: 'MyCA' });
});

test('relay: the sender-domain check is on by default and refuses to send while ALLOWED_FROM_DOMAIN is unset', async () => {
  for (const overrides of [{ ALLOWED_FROM_DOMAIN: '' }, { ALLOWED_FROM_DOMAIN: '   ' }, { ALLOWED_FROM_DOMAIN: undefined }]) {
    const { env, sent } = stubEnv(overrides);
    const out = await call(env);
    assert.equal(out.status, 503);
    assert.equal(out.body.ok, false);
    assert.equal(out.body.error, 'FROM_DOMAIN_NOT_CONFIGURED');
    assert.equal(sent.length, 0);
  }
  const committed = readFileSync(new URL('../../email-relay/wrangler.jsonc', import.meta.url), 'utf8');
  assert.match(committed, /"ALLOWED_FROM_DOMAIN":\s*""/, 'the committed default stays empty, so a fresh deploy sends nothing until the owner sets it');
});

test('relay: only the exact allowed sender domain passes', async () => {
  for (const from of ['ceo@evil.test', 'ceo@yourfirm.in.evil.test', 'ceo@mail.yourfirm.in', 'ceo@notyourfirm.in']) {
    const { env, sent } = stubEnv();
    const out = await call(env, { ...MESSAGE, from });
    assert.equal(out.status, 403, from);
    assert.equal(out.body.error, 'FROM_DOMAIN_NOT_ALLOWED');
    assert.equal(sent.length, 0);
  }
  const { env } = stubEnv({ ALLOWED_FROM_DOMAIN: 'YourFirm.in' });
  assert.equal((await call(env, { ...MESSAGE, from: 'Compliance@YOURFIRM.IN' })).status, 200);
});

test('relay: at most 10 recipients per send', async () => {
  const ten = Array.from({ length: 10 }, (_, i) => `c${i}@example.com`);
  const ok = stubEnv();
  assert.equal((await call(ok.env, { ...MESSAGE, to: ten })).status, 200);
  assert.equal(ok.sent[0].to.length, 10);
  for (const to of [[...ten, 'c10@example.com'], [...ten, 'c10@example.com'].join(','), Array.from({ length: 500 }, (_, i) => `v${i}@victim.test`)]) {
    const { env, sent } = stubEnv();
    const out = await call(env, { ...MESSAGE, to });
    assert.equal(out.status, 400);
    assert.equal(out.body.error, 'TOO_MANY_RECIPIENTS');
    assert.equal(out.body.max, 10);
    assert.equal(sent.length, 0);
  }
});

test('relay: the bearer token is required and compared in constant time', async () => {
  const cases = [null, '', 'Bearer', 'Bearer ', `Bearer ${TOKEN}x`, `Bearer ${TOKEN.slice(0, -1)}`, `Bearer ${TOKEN.slice(0, -1)}X`, `bearer  ${TOKEN}`, TOKEN];
  for (const auth of cases) {
    const { env, sent } = stubEnv();
    const out = await call(env, MESSAGE, { auth });
    assert.equal(out.status, 401, String(auth));
    assert.equal(out.body.error, 'UNAUTHORIZED');
    assert.equal(sent.length, 0);
  }
  const unset = stubEnv({ RELAY_TOKEN: '' });
  assert.equal((await call(unset.env, MESSAGE, { auth: 'Bearer ' })).status, 503);
  assert.doesNotMatch(RELAY_SOURCE, /[!=]==?\s*`Bearer \$\{/, 'the header is not compared with a short-circuiting string compare');
  assert.match(RELAY_SOURCE, /crypto\.subtle\.digest\('SHA-256'/, 'both sides are hashed to a fixed length before comparing');
});

test('relay: CR and LF are stripped from fromName and subject', async () => {
  const { env, sent } = stubEnv();
  const out = await call(env, { ...MESSAGE, fromName: 'CEO\r\nBcc: x@evil.test', subject: 'Pay now\r\nBcc: y@evil.test\n' });
  assert.equal(out.status, 200);
  assert.equal(sent[0].from.name, 'CEO Bcc: x@evil.test');
  assert.equal(sent[0].subject, 'Pay now Bcc: y@evil.test');
  for (const value of [sent[0].from.name, sent[0].subject]) assert.doesNotMatch(value, /[\r\n]/);
  const blank = stubEnv();
  assert.equal((await call(blank.env, { ...MESSAGE, subject: '\r\n' })).body.error, 'SUBJECT_REQUIRED');
});

test('relay: request validation and provider errors', async () => {
  const { env } = stubEnv();
  assert.equal((await relay.fetch(post(null, { method: 'GET' }), env)).status, 405);
  assert.equal((await call(env, { ...MESSAGE, from: 'not-an-address' })).body.error, 'INVALID_FROM');
  assert.equal((await call(env, { ...MESSAGE, to: [] })).body.error, 'INVALID_TO');
  assert.equal((await call(env, { ...MESSAGE, to: 'a@example.com\r\nb@example.com' })).body.error, 'INVALID_TO');
  const failing = stubEnv({ EMAIL: { send: async () => { const err = new Error('sender not verified'); err.code = 'E_SENDER_NOT_VERIFIED'; throw err; } } });
  const out = await call(failing.env);
  assert.equal(out.status, 502);
  assert.deepEqual(out.body, { ok: false, error: 'E_SENDER_NOT_VERIFIED' });
});
