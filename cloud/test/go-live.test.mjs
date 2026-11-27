import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { goLiveProblem, goLiveReadiness, wantsLive } from '../src/go-live.mjs';

const SECRET = 'x'.repeat(40);

function ready(overrides = {}) {
  return {
    MYCA_ENVIRONMENT: 'production',
    MYCA_PROVIDER_ENV: 'live',
    MYCA_MOCK_MODE: '0',
    MYCA_GSP_ENV: 'live',
    MYCA_GSP_LIVE_API_KEY: 'key_live_abc123',
    MYCA_GSP_LIVE_API_SECRET: 'secret_live_abc123',
    MYCA_GOOGLE_CLIENT_IDS: 'web.apps.googleusercontent.com',
    MYCA_SMS_PROVIDER: 'msg91',
    MYCA_SMS_MSG91_AUTHKEY: 'authkey',
    MYCA_SMS_MSG91_TEMPLATE_ID: 'template-1',
    MYCA_PUBLIC_URL: 'https://api.myca.example',
    MYCA_TOKEN_SECRET: SECRET,
    MYCA_BOOKS_KEY: SECRET,
    MYCA_CONNECTOR_KEY: SECRET,
    MYCA_JOB_TOKEN: SECRET,
    MYCA_PLAY_PACKAGE: 'com.mldynamic.myca',
    MYCA_PLAY_SERVICE_ACCOUNT_JSON: '{"client_email":"x"}',
    MYCA_PLAY_PRODUCT_PRO: 'myca_pro_monthly',
    MYCA_ADMIN_USER_IDS: '00000000-0000-0000-0000-000000000001',
    MYCA_MODEL_API_KEY: 'model',
    MYCA_EMAIL_RELAY_URL: 'https://mail.example',
    ...overrides,
  };
}

const ids = (env) => goLiveReadiness(env).gaps.map((item) => item.id);

test('a complete live configuration is ready, with nothing to fix', () => {
  const report = goLiveReadiness(ready());
  assert.deepEqual(report.gaps, []);
  assert.equal(report.ready, true);
  assert.equal(report.live, true);
  assert.deepEqual(report.warnings, []);
  assert.equal(goLiveProblem(ready()), '');
});

test('test and simulated modes are not asked for anything', () => {
  for (const mode of ['test', 'off']) {
    assert.equal(wantsLive({ MYCA_PROVIDER_ENV: mode }), false);
    assert.equal(goLiveProblem({ MYCA_PROVIDER_ENV: mode }), '');
  }
  assert.equal(goLiveProblem({ MYCA_PROVIDER_ENV: 'live', MYCA_MOCK_MODE: '1' }), '', 'simulated wins, so there is nothing live to guard');
});

test('each missing requirement is named on its own, so the owner sees every gap at once', () => {
  const cases = [
    [{ MYCA_ENVIRONMENT: 'staging' }, 'ENVIRONMENT'],
    [{ MYCA_GSP_ENV: 'test' }, 'GSP_ENV'],
    [{ MYCA_GSP_LIVE_API_KEY: '' }, 'GSP_LIVE_KEYS'],
    [{ MYCA_GSP_LIVE_API_SECRET: 'unset' }, 'GSP_LIVE_KEYS'],
    [{ MYCA_TEST_PHONES: '9876543210' }, 'TEST_PHONES'],
    [{ MYCA_DEV_OTP: '1' }, 'DEV_OTP'],
    [{ MYCA_TEST_CODE: '123456' }, 'TEST_CODE'],
    [{ MYCA_GOOGLE_CLIENT_IDS: '' }, 'GOOGLE_CLIENT_IDS'],
    [{ MYCA_SMS_MSG91_TEMPLATE_ID: '' }, 'SMS_MSG91'],
    [{ MYCA_PUBLIC_URL: '' }, 'PUBLIC_URL'],
    [{ MYCA_PUBLIC_URL: 'http://api.example' }, 'PUBLIC_URL'],
    [{ MYCA_TOKEN_SECRET: 'short' }, 'SECRET_TOKEN_SECRET'],
    [{ MYCA_BOOKS_KEY: '' }, 'SECRET_BOOKS_KEY'],
    [{ MYCA_CONNECTOR_KEY: '' }, 'SECRET_CONNECTOR_KEY'],
    [{ MYCA_JOB_TOKEN: '' }, 'SECRET_JOB_TOKEN'],
    [{ MYCA_PLAY_SERVICE_ACCOUNT_JSON: '' }, 'PLAY_BILLING'],
    [{ MYCA_PLAY_PACKAGE: '' }, 'PLAY_BILLING'],
  ];
  for (const [change, expected] of cases) {
    assert.ok(ids(ready(change)).includes(expected), `${JSON.stringify(change)} should name ${expected}, got ${ids(ready(change))}`);
  }
});

test('twilio needs all of its three settings', () => {
  const twilio = { MYCA_SMS_PROVIDER: 'twilio', MYCA_SMS_MSG91_AUTHKEY: '', MYCA_SMS_MSG91_TEMPLATE_ID: '' };
  assert.ok(ids(ready(twilio)).includes('SMS_TWILIO'));
  assert.deepEqual(ids(ready({ ...twilio, MYCA_SMS_TWILIO_SID: 'AC1', MYCA_SMS_TWILIO_TOKEN: 'tok', MYCA_SMS_TWILIO_FROM: '+15550001111' })), []);
});

test('no phone sign-in is a warning, not a blocker, because Google sign-in alone is a valid launch', () => {
  const env = ready({ MYCA_SMS_PROVIDER: '', MYCA_SMS_MSG91_AUTHKEY: '', MYCA_SMS_MSG91_TEMPLATE_ID: '' });
  const report = goLiveReadiness(env);
  assert.equal(report.ready, true);
  assert.ok(report.warnings.some((line) => /Phone sign-in is off/.test(line)));
});

test('missing admin, model and email are warnings that do not stop a launch', () => {
  const report = goLiveReadiness(ready({ MYCA_ADMIN_USER_IDS: '', MYCA_MODEL_API_KEY: '', MYCA_EMAIL_RELAY_URL: '' }));
  assert.equal(report.ready, true);
  assert.equal(report.warnings.length, 3);
});

test('a live key in the test slot and other key mix-ups are caught by the existing key check and surfaced here', () => {
  const report = goLiveReadiness(ready({ MYCA_GSP_LIVE_API_KEY: 'key_test_abc123' }));
  assert.ok(report.gaps.some((item) => item.id === 'PROVIDER_KEYS'), JSON.stringify(report.gaps));
});

test('the startup refusal lists every gap in plain words and says the running version stays up', () => {
  const message = goLiveProblem({ MYCA_PROVIDER_ENV: 'live' });
  assert.match(message, /Live mode is switched on, but \d+ things are not ready/);
  assert.match(message, /the running version stays up/);
  assert.match(message, /Google client id/);
  assert.match(message, /public https address/);
  assert.equal(goLiveProblem(ready({ MYCA_GOOGLE_CLIENT_IDS: '' })).includes('one thing is not ready'), true);
});

test('the key check run with --live reports readiness, exits 0 when ready and 1 with the fixes when not', () => {
  const dir = mkdtempSync(join(tmpdir(), 'golive-'));
  const root = new URL('../..', import.meta.url).pathname;
  const full = join(dir, 'ready.env');
  writeFileSync(full, Object.entries({ ...ready(), MYCA_PROVIDER_ENV: 'test', MYCA_GSP_ENV: '' }).map(([k, v]) => `${k}=${v}`).join('\n'));
  const ok = spawnSync(process.execPath, ['scripts/check-keys.mjs', full, '--live'], { encoding: 'utf8', cwd: root });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /every requirement for live mode is in place/);
  const partial = join(dir, 'partial.env');
  writeFileSync(partial, 'MYCA_ENVIRONMENT=production\nMYCA_PROVIDER_ENV=test\n');
  const bad = spawnSync(process.execPath, ['scripts/check-keys.mjs', partial, '--live'], { encoding: 'utf8', cwd: root });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /Not ready to go live: \d+ things to fix/);
  assert.match(bad.stdout, /Fix: /);
  const asGiven = spawnSync(process.execPath, ['scripts/check-keys.mjs', partial], { encoding: 'utf8', cwd: root });
  assert.equal(asGiven.status, 0, 'without --live a test-mode server is not asked for live things');
});
