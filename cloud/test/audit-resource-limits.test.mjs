import { createHmac, generateKeyPairSync, createSign } from 'node:crypto';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi, OIDC_ISSUER, OIDC_CLIENT } from './helpers.mjs';
import { cleanCrashReport } from '../src/crash-reports.mjs';
import { environmentProblem, plainHttpUrls } from '../src/environment.mjs';
import { createOidcVerifier } from '../src/oidc.mjs';
import { createWahaSender } from '../src/waha.mjs';
import { smsSenderFromEnv } from '../src/sms-sender.mjs';
import { JOB_HEADER, WHATSAPP_MESSAGE_DAYS } from '../src/jobs.mjs';
import { LIMITS } from '../src/rate-limits.mjs';

const JOB_TOKEN = 'job-token-for-resource-limit-tests-0123456789';
const CONFIG = { verifyToken: 'verify-me', appSecret: 'app-secret', phoneNumberId: '1234', accessToken: 'tok' };
const DAY_MS = 24 * 60 * 60 * 1000;
let api;
const replies = [];
const sender = { async sendText(phone, text) { replies.push({ phone, text }); } };

before(async () => {
  api = await startApi({ whatsapp: CONFIG, whatsappSender: sender, jobToken: JOB_TOKEN });
  await api.ownerWithBusiness('+919700000041', { name: 'Asha Traders', state: '29' });
});
after(async () => { await api.close(); });

function signed(body) {
  const raw = JSON.stringify(body);
  return { raw, headers: { 'x-hub-signature-256': `sha256=${createHmac('sha256', CONFIG.appSecret).update(raw).digest('hex')}` } };
}

function incoming(from, id, text) {
  return { object: 'whatsapp_business_account', entry: [{ id: '1', changes: [{ value: { messaging_product: 'whatsapp', messages: [{ from, id, timestamp: '1', type: 'text', text: { body: text } }] }, field: 'messages' }] }] };
}

async function write(from, id, text) {
  const { raw, headers } = signed(incoming(from, id, text));
  const out = await api.call('POST', '/v1/whatsapp/webhook', { raw, headers });
  assert.equal(out.status, 200, out.text);
  return out.body.results[0];
}

test('the largest crash report the route accepts is cleaned quickly, whatever it is filled with', () => {
  for (const unit of ['eyJa.', 'http://a', 'a@', '"', '1,', 'rs 1']) {
    const filler = unit.repeat(Math.floor(63000 / unit.length));
    const started = Date.now();
    const out = cleanCrashReport({ kind: 'flutter', type: 'StateError', appVersion: '1.0.0', message: filler, stack: filler });
    const took = Date.now() - started;
    assert.equal(out.ok, true);
    assert.ok(took < 1500, `${JSON.stringify(unit)} took ${took} ms`);
    assert.ok(out.report.message.length <= 300);
    assert.ok(out.report.stack.split('\n').every((line) => line.length <= 300));
  }
  const frames = Array.from({ length: 5000 }, (_, i) => `#${i} f (package:myca/a.dart:${i + 1}:1)`).join('\n');
  const many = cleanCrashReport({ kind: 'flutter', type: 'StateError', appVersion: '1.0.0', message: 'x', stack: frames });
  assert.equal(many.report.stack.split('\n').length, 40);
  assert.equal(many.report.stack.split('\n')[39], '#39 f (package:myca/a.dart:40:1)');
});

test('a cut made inside a long line never leaves half a secret behind', () => {
  const token = `eyJhbGciOiJIUzI1NiJ9.${'a'.repeat(40)}.${'b'.repeat(40)}`;
  const message = `${'word '.repeat(790)}${token} ${'tail '.repeat(40)}`;
  const out = cleanCrashReport({ kind: 'flutter', type: 'StateError', appVersion: '1.0.0', message, stack: message });
  assert.equal(out.ok, true);
  for (const text of [out.report.message, out.report.stack]) {
    assert.equal(text.includes('eyJ'), false, text.slice(-80));
    assert.equal(text.includes('aaaa'), false, text.slice(-80));
  }
});

test('outside local development an operator URL may not be plain http, carry a user name or password, or point at a cloud metadata address', () => {
  const base = { MYCA_ENVIRONMENT: 'production' };
  assert.equal(environmentProblem({ ...base, MYCA_WAHA_URL: 'https://waha.example.in', MYCA_GSP_BASE_URL: 'https://api.sandbox.co.in', MYCA_OIDC_ISSUER: 'https://login.example.in/realms/myca', MYCA_OIDC_JWKS_URL: 'https://login.example.in/keys' }), '');
  assert.equal(environmentProblem({ ...base, MYCA_WAHA_URL: 'https://waha.internal:3000' }), '', 'a private gateway the operator runs is allowed');
  const refused = {
    MYCA_GSP_BASE_URL: 'http://api.sandbox.co.in',
    MYCA_OIDC_ISSUER: 'http://login.example.in/realms/myca',
    MYCA_OIDC_JWKS_URL: 'http://login.example.in/keys',
    MYCA_WAHA_URL: 'https://operator:hunter2@waha.example.in',
    MYCA_EMAIL_RELAY_URL: 'https://169.254.169.254/latest/meta-data/',
    MYCA_MODEL_BASE_URL: 'https://metadata.google.internal/computeMetadata/v1/',
    NVIDIA_NIM_BASE_URL: 'https://[fd00:ec2::254]/v1',
    MYCA_PUBLIC_URL: 'https://[::ffff:169.254.169.254]/',
  };
  for (const [name, value] of Object.entries(refused)) {
    const problem = environmentProblem({ ...base, [name]: value });
    assert.match(problem, new RegExp(name), name);
    assert.match(problem, /metadata address/);
    assert.equal(problem.includes('hunter2'), false, 'the value is never echoed');
  }
  assert.deepEqual(plainHttpUrls({ MYCA_WAHA_URL: 'http://localhost:3000', MYCA_OIDC_ISSUER: 'unset' }), []);
  assert.equal(environmentProblem({ MYCA_EMAIL_RELAY_URL: 'https://169.254.169.254/' }), '', 'local development is not restricted');
});

test('OIDC discovery follows no redirect and takes a keys link only when it is https on a public host or on the issuer\'s own host', async () => {
  const key = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = key.publicKey.export({ format: 'jwk' });
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = (issuer) => {
    const seconds = Math.floor(Date.now() / 1000);
    const signing = `${part({ alg: 'RS256', kid: 'k1', typ: 'JWT' })}.${part({ iss: issuer, aud: OIDC_CLIENT, sub: 'u1', email: 'ravi@example.com', email_verified: true, iat: seconds, exp: seconds + 600 })}`;
    return `${signing}.${createSign('RSA-SHA256').update(signing).sign(key.privateKey).toString('base64url')}`;
  };
  const attempt = async (issuer, keysLink) => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith('/.well-known/openid-configuration')) return new Response(JSON.stringify({ jwks_uri: keysLink }), { status: 200 });
      return new Response(JSON.stringify({ keys: [{ ...jwk, kid: 'k1', use: 'sig' }] }), { status: 200 });
    };
    const out = await createOidcVerifier({ issuer, clientIds: [OIDC_CLIENT], fetchImpl }).verify(token(issuer));
    return { out, calls };
  };

  const good = await attempt(OIDC_ISSUER, 'https://login.example.test/keys');
  assert.equal(good.out.ok, true, JSON.stringify(good.out));
  assert.equal(good.calls.length, 2);
  assert.ok(good.calls.every((call) => call.init.redirect === 'error'));

  const own = await attempt('https://keycloak.corp/realms/myca', 'https://keycloak.corp/realms/myca/certs');
  assert.equal(own.out.ok, true, 'a private identity server may publish keys on its own host');

  for (const link of ['http://login.example.test/keys', 'https://169.254.169.254/latest/meta-data/', 'https://10.0.0.5/keys', 'https://localhost/keys', 'https://[::1]/keys', 'https://metadata.google.internal/keys', 'https://user:pass@login.example.test/keys', 'file:///etc/passwd', '']) {
    const bad = await attempt(OIDC_ISSUER, link);
    assert.equal(bad.out.ok, false, link);
    assert.equal(bad.out.error, 'ISSUER_UNREACHABLE', link);
    assert.equal(bad.calls.length, 1, `${link} was never requested`);
  }
  const inside = await attempt('https://keycloak.corp/realms/myca', 'https://other.corp/keys');
  assert.equal(inside.out.ok, false, 'another inside host is not taken from the discovery document');
});

test('the WhatsApp gateway and SMS senders follow no redirect', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url: String(url), init }); return { ok: true, status: 201, text: async () => '{}' }; };
  await createWahaSender({ baseUrl: 'https://wa.example.in/', apiKey: 'k', session: 'myca', fetchImpl }).sendText('+919700000011', 'hello');
  await smsSenderFromEnv({ MYCA_SMS_PROVIDER: 'msg91', MYCA_SMS_MSG91_AUTHKEY: 'key', MYCA_SMS_MSG91_TEMPLATE_ID: 'tpl' }, { fetchImpl }).send('+919700000011', '123456');
  assert.ok(calls.length >= 2);
  assert.ok(calls.every((call) => call.init.redirect === 'error'), JSON.stringify(calls.map((call) => call.init.redirect)));
});

test('a number that belongs to no business gets two replies a day and then silence, and each message is still recorded once', async () => {
  assert.deepEqual(LIMITS.whatsappStranger, { max: 2, windowSeconds: 86400 });
  const before = replies.length;
  const results = [];
  for (let i = 0; i < 6; i += 1) results.push(await write('919700000777', `wamid.stranger.${i}`, 'hello'));
  assert.deepEqual(results.map((r) => r.replied), [true, true, false, false, false, false]);
  assert.ok(results.slice(2).every((r) => r.rateLimited === true));
  assert.equal(replies.length - before, 2);
  assert.ok(replies.slice(before).every((r) => r.phone === '+919700000777' && /not a member/.test(r.text)));
  const again = await write('919700000777', 'wamid.stranger.0', 'hello');
  assert.equal(again.duplicate, true);
  const other = await write('919700000778', 'wamid.other.0', 'hello');
  assert.equal(other.replied, true, 'another number has its own allowance');
  api.clock.advance(DAY_MS + 1000);
  const next = await write('919700000777', 'wamid.stranger.next', 'hello');
  assert.equal(next.replied, true, 'the allowance returns a day later');
});

test('a member who keeps asking for the business list is answered thirty times an hour', async () => {
  const member = '+919700000042';
  const owner = await api.ownerWithBusiness(member, { name: 'Bala Stores', state: '33' });
  const second = await api.call('POST', '/v1/businesses', { token: owner.token, body: { name: 'Bala Exports', state: '27' } });
  assert.equal(second.status, 200, second.text);
  const before = replies.length;
  const results = [];
  for (let i = 0; i < LIMITS.whatsappMenu.max + 3; i += 1) results.push(await write('919700000042', `wamid.menu.${i}`, 'switch'));
  assert.equal(results.filter((r) => r.replied).length, LIMITS.whatsappMenu.max);
  assert.equal(replies.length - before, LIMITS.whatsappMenu.max);
  assert.ok(results.slice(LIMITS.whatsappMenu.max).every((r) => r.replied === false && r.rateLimited === true));
});

test('the nightly job forgets WhatsApp message ids after thirty days and keeps newer ones', async () => {
  assert.equal(WHATSAPP_MESSAGE_DAYS, 30);
  await api.db.query('delete from whatsapp_messages');
  const at = (days) => new Date(api.clock.now - days * DAY_MS).toISOString();
  await api.db.query('insert into whatsapp_messages (id, received_at) values ($1, $2), ($3, $4), ($5, $6)', ['old-1', at(45), 'old-2', at(31), 'new-1', at(29)]);
  const job = await api.call('POST', '/v1/jobs/daily', { headers: { [JOB_HEADER]: JOB_TOKEN } });
  assert.equal(job.status, 200, job.text);
  assert.equal(job.body.purge.whatsappRows, 2, JSON.stringify(job.body.purge));
  const left = (await api.db.query('select id from whatsapp_messages')).rows.map((row) => row.id);
  assert.deepEqual(left, ['new-1']);
});
