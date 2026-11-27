import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { releaseConfigProblems, serviceFacts } from '../src/release-config.mjs';

const CLIENT = '645603112925-web.apps.googleusercontent.com';

function description(env = {}, url = 'https://myca-api-541813254937.asia-south1.run.app') {
  const all = { MYCA_GOOGLE_CLIENT_IDS: CLIENT, MYCA_PROVIDER_ENV: 'live', MYCA_ENVIRONMENT: 'production', MYCA_PUBLIC_URL: 'https://api.myca.example', ...env };
  return {
    status: { url },
    spec: { template: { spec: { containers: [{ env: [...Object.entries(all).filter(([, v]) => v !== null).map(([name, value]) => ({ name, value })), { name: 'MYCA_BOOKS_KEY', valueFrom: { secretKeyRef: { name: 'k' } } }] }] } } },
  };
}

const app = (overrides = {}) => ({ cloudUrl: 'https://api.myca.example', googleServerClientId: CLIENT, ...overrides });
const check = (desc, application = app(), requireLive = false) => releaseConfigProblems({ app: application, service: serviceFacts(desc), requireLive });

test('plain environment values are read and secret references are not mistaken for values', () => {
  const facts = serviceFacts(description());
  assert.equal(facts.env.MYCA_GOOGLE_CLIENT_IDS, CLIENT);
  assert.equal(Object.hasOwn(facts.env, 'MYCA_BOOKS_KEY'), false);
  assert.deepEqual(facts.addresses, ['https://myca-api-541813254937.asia-south1.run.app']);
});

test('an app and a server that agree pass', () => {
  const report = check(description());
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.match(report.notes.join(' '), /live mode/);
});

test('a Google client id the server does not accept is the failure that would break sign-in for everyone', () => {
  const report = check(description(), app({ googleServerClientId: 'other.apps.googleusercontent.com' }));
  assert.equal(report.ok, false);
  assert.match(report.problems[0], /Sign-in would fail for everyone/);
  assert.ok(report.problems[0].includes('other.apps.googleusercontent.com'));
});

test('a server with no Google client id, or an app with none, is refused with its own reason', () => {
  assert.match(check(description({ MYCA_GOOGLE_CLIENT_IDS: null })).problems[0], /accepts no Google client id/);
  assert.match(check(description(), app({ googleServerClientId: '' })).problems[0], /no Google client id/);
});

test('a server that accepts several client ids passes when the app uses any one of them', () => {
  assert.equal(check(description({ MYCA_GOOGLE_CLIENT_IDS: `x.apps.googleusercontent.com, ${CLIENT}` })).ok, true);
});

test('the app must call the address the server is reached at, either the public one or the Cloud Run one', () => {
  assert.equal(check(description(), app({ cloudUrl: 'https://myca-api-541813254937.asia-south1.run.app' })).ok, true);
  const wrong = check(description(), app({ cloudUrl: 'https://old.myca.example' }));
  assert.equal(wrong.ok, false);
  assert.match(wrong.problems[0], /will call old\.myca\.example/);
  assert.match(check(description(), app({ cloudUrl: '' })).problems[0], /no https server address/);
});

test('a server still in test mode is a note by default and a refusal when the release requires live', () => {
  const test = description({ MYCA_PROVIDER_ENV: 'test' });
  const soft = check(test);
  assert.equal(soft.ok, true);
  assert.match(soft.notes.join(' '), /test portal/);
  const hard = check(test, app(), true);
  assert.equal(hard.ok, false);
  assert.match(hard.problems[0], /requires live/);
});

test('a release must never point at a staging server', () => {
  const report = check(description({ MYCA_ENVIRONMENT: 'staging' }));
  assert.equal(report.ok, false);
  assert.match(report.problems.join(' '), /staging stack, not production/);
});

test('the command prints errors the workflow shows and exits non-zero on a mismatch', () => {
  const dir = mkdtempSync(join(tmpdir(), 'release-'));
  const file = join(dir, 'service.json');
  writeFileSync(file, JSON.stringify(description()));
  const base = ['../scripts/check-release-config.mjs', '--service', file, '--cloud-url', 'https://api.myca.example'];
  const ok = spawnSync(process.execPath, [...base, '--google-client-id', CLIENT], { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /The app and the server agree/);
  const bad = spawnSync(process.execPath, [...base, '--google-client-id', 'wrong.apps.googleusercontent.com'], { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /::error::The app is built with Google client id/);
  const none = spawnSync(process.execPath, ['../scripts/check-release-config.mjs'], { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname });
  assert.equal(none.status, 2);
});
