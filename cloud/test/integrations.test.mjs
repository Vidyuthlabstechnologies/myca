import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyKeySlots, integrationReport, keyKind, keyProblems, providerModeOf, slotName } from '../src/integrations.mjs';

const PROD = { MYCA_ENVIRONMENT: 'production', MYCA_COUNTRIES: 'IN' };
const QUICKO_TEST = { MYCA_GSP_TEST_API_KEY: 'key_test_abc', MYCA_GSP_TEST_API_SECRET: 'secret_test_abc' };
const QUICKO_LIVE = { MYCA_GSP_LIVE_API_KEY: 'key_live_abc', MYCA_GSP_LIVE_API_SECRET: 'secret_live_abc' };

test('key kinds are told apart by their prefix', () => {
  assert.equal(keyKind('key_live_x'), 'live');
  assert.equal(keyKind('sk_live_x'), 'live');
  assert.equal(keyKind('rk_test_x'), 'test');
  assert.equal(keyKind('whsec_x'), '');
  assert.equal(slotName('MYCA_STRIPE_SECRET_KEY', 'live'), 'MYCA_STRIPE_LIVE_SECRET_KEY');
});

test('the provider mode is one switch: test, live or off, with simulated on top', () => {
  assert.equal(providerModeOf({ MYCA_PROVIDER_ENV: 'test' }), 'test');
  assert.equal(providerModeOf({ MYCA_PROVIDER_ENV: 'live', MYCA_MOCK_MODE: '1' }), 'simulated');
  assert.equal(providerModeOf({ MYCA_ENABLE_LIVE_CALLS: '1' }), 'live');
  assert.equal(providerModeOf({}), 'off');
});

test('sandbox with both slots filled starts, and the live keys are taken out of the process', () => {
  const env = { ...PROD, MYCA_PROVIDER_ENV: 'test', ...QUICKO_TEST, ...QUICKO_LIVE, MYCA_STRIPE_TEST_SECRET_KEY: 'sk_test_1', MYCA_STRIPE_TEST_WEBHOOK_SECRET: 'whsec_t', MYCA_STRIPE_LIVE_SECRET_KEY: 'sk_live_1', MYCA_STRIPE_LIVE_WEBHOOK_SECRET: 'whsec_l' };
  assert.deepEqual(keyProblems(env), []);
  applyKeySlots(env);
  assert.equal(env.MYCA_GSP_API_KEY, 'key_test_abc');
  assert.equal(env.MYCA_STRIPE_SECRET_KEY, 'sk_test_1');
  assert.equal(env.MYCA_STRIPE_WEBHOOK_SECRET, 'whsec_t');
  assert.equal(env.MYCA_GSP_ENV, 'test');
  for (const name of Object.keys(env)) assert.ok(!name.includes('_LIVE_'), `${name} is gone in sandbox`);
  assert.ok(!Object.values(env).some((v) => keyKind(v) === 'live'), 'no live key value is left anywhere');
});

test('going live is one switch: the same settings with MYCA_PROVIDER_ENV=live use the live slots', () => {
  const env = { ...PROD, MYCA_PROVIDER_ENV: 'live', ...QUICKO_TEST, ...QUICKO_LIVE, MYCA_GSP_ENV: '' };
  assert.deepEqual(keyProblems(env), []);
  applyKeySlots(env);
  assert.equal(env.MYCA_GSP_API_KEY, 'key_live_abc');
  assert.equal(env.MYCA_GSP_API_SECRET, 'secret_live_abc');
  assert.equal(env.MYCA_GSP_ENV, 'live');
  assert.equal(env.MYCA_GSP_TEST_API_KEY, undefined);
});

test('a live key in a test slot, or a test key in a live slot, refuses to start', () => {
  const swapped = keyProblems({ ...PROD, MYCA_PROVIDER_ENV: 'test', MYCA_GSP_TEST_API_KEY: 'key_live_x', MYCA_GSP_TEST_API_SECRET: 's', MYCA_STRIPE_LIVE_SECRET_KEY: 'sk_test_y' });
  assert.ok(swapped.some((p) => p.startsWith('MYCA_GSP_TEST_API_KEY holds a live key')));
  assert.ok(swapped.some((p) => p.startsWith('MYCA_STRIPE_LIVE_SECRET_KEY holds a test key')));
});

test('an unslotted live key while in sandbox, or test key while live, refuses to start', () => {
  const sandbox = keyProblems({ ...PROD, MYCA_PROVIDER_ENV: 'test', MYCA_GSP_API_KEY: 'key_live_x', MYCA_GSP_API_SECRET: 's' });
  assert.match(sandbox.join('\n'), /MYCA_GSP_API_KEY holds a live key but the service runs in test mode/);
  const live = keyProblems({ ...PROD, MYCA_PROVIDER_ENV: 'live', MYCA_STRIPE_SECRET_KEY: 'sk_test_x', MYCA_STRIPE_WEBHOOK_SECRET: 'whsec', ...QUICKO_LIVE });
  assert.match(live.join('\n'), /MYCA_STRIPE_SECRET_KEY holds a test key but the service runs live/);
  const off = keyProblems({ MYCA_ENVIRONMENT: 'staging', MYCA_STRIPE_SECRET_KEY: 'sk_live_x' });
  assert.match(off.join('\n'), /runs in off mode/);
});

test('a slotted test key wins over a stale unslotted live key, and the live value never reaches the code', () => {
  const env = { ...PROD, MYCA_PROVIDER_ENV: 'test', ...QUICKO_TEST, MYCA_GSP_API_KEY: 'key_live_old', MYCA_GSP_API_SECRET: 'old' };
  assert.deepEqual(keyProblems(env), []);
  applyKeySlots(env);
  assert.equal(env.MYCA_GSP_API_KEY, 'key_test_abc');
});

test('live slots outside production refuse to start', () => {
  const problems = keyProblems({ MYCA_ENVIRONMENT: 'staging', ...QUICKO_LIVE });
  assert.ok(problems.some((p) => /MYCA_GSP_LIVE_API_KEY is set on a staging server/.test(p)));
});

test('half a key refuses to start: a key without its secret, Stripe without its webhook secret, a partner without its key', () => {
  const problems = keyProblems({ ...PROD, MYCA_COUNTRIES: 'US', MYCA_PROVIDER_ENV: 'test', MYCA_GSP_TEST_API_KEY: 'key_test_x', MYCA_STRIPE_TEST_SECRET_KEY: 'sk_test_x', MYCA_US_FILER_TEST_BASE_URL: 'https://sandbox.partner.example' });
  const text = problems.join('\n');
  assert.match(text, /MYCA_GSP_API_KEY is set for test mode but MYCA_GSP_API_SECRET is not.*MYCA_GSP_TEST_API_SECRET/);
  assert.match(text, /MYCA_STRIPE_SECRET_KEY is set for test mode but MYCA_STRIPE_WEBHOOK_SECRET is not/);
  assert.match(text, /MYCA_US_FILER_BASE_URL is set for test mode but MYCA_US_FILER_API_KEY is not/);
});

test('live mode for India without the live Quicko keys refuses to start', () => {
  const problems = keyProblems({ ...PROD, MYCA_PROVIDER_ENV: 'live', ...QUICKO_TEST });
  assert.match(problems.join('\n'), /Live mode needs Sandbox by Quicko: set MYCA_GSP_LIVE_API_KEY, MYCA_GSP_LIVE_API_SECRET/);
});

test('MYCA_GSP_ENV that contradicts the provider mode refuses to start', () => {
  const problems = keyProblems({ ...PROD, MYCA_PROVIDER_ENV: 'test', MYCA_GSP_ENV: 'live', ...QUICKO_TEST });
  assert.match(problems.join('\n'), /MYCA_GSP_ENV is live but MYCA_PROVIDER_ENV is test/);
});

test('the report names what each integration reaches without printing any key', () => {
  const env = { ...PROD, MYCA_COUNTRIES: 'IN', MYCA_PROVIDER_ENV: 'test', ...QUICKO_TEST };
  const report = integrationReport(env);
  assert.equal(report.mode, 'test');
  const quicko = report.integrations.find((r) => r.id === 'quicko');
  assert.equal(quicko.status, 'ready');
  assert.match(quicko.runsAgainst, /test host/);
  assert.equal(report.integrations.find((r) => r.id === 'nic-einvoice').status, 'ready');
  assert.ok(!report.integrations.some((r) => r.id === 'stripe'), 'US-only integrations are not listed for an India server');
  assert.ok(!JSON.stringify(report).includes('key_test_abc'));
});

test('the API process itself refuses to start on mixed keys, before it touches the database', async () => {
  const { spawn } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const child = spawn(process.execPath, [fileURLToPath(new URL('../src/server.mjs', import.meta.url))], {
    env: { PATH: process.env.PATH, MYCA_DATABASE_URL: 'postgres://nobody@127.0.0.1:1/none', MYCA_TOKEN_SECRET: 'x'.repeat(48), MYCA_PROVIDER_ENV: 'test', MYCA_GSP_API_KEY: 'key_live_real', MYCA_GSP_API_SECRET: 'secret' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (c) => { output += c; });
  child.stderr.on('data', (c) => { output += c; });
  const code = await new Promise((resolve) => child.on('exit', resolve));
  assert.notEqual(code, 0);
  assert.match(output, /Provider keys are mixed or incomplete/);
  assert.match(output, /MYCA_GSP_API_KEY holds a live key/);
  assert.ok(!output.includes('key_live_real'), 'the key itself is never printed');
});
