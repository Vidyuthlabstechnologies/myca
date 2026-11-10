import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers.mjs';

const admins = [];
let api;
before(async () => { api = await startApi({ adminUserIds: () => admins }); });
after(async () => { await api.close(); });

test('an allow-listed admin reads a crash digest by version without a database connection; everyone else gets 404', async () => {
  const reporter = await api.signIn('+919600000061');
  for (const version of ['1.0.1+2', '1.0.1+2', '1.0.0+1']) {
    const sent = await api.call('POST', '/v1/crash-reports', { token: reporter.accessToken, body: { reports: [{ kind: 'flutter', appVersion: version, type: 'StateError', message: 'Bad state: no element', stack: '#0 main (package:myca/main.dart:10)\n#1 run' }] } });
    assert.equal(sent.status, 200, sent.text);
  }
  const refused = await api.call('GET', '/v1/admin/crashes', { token: reporter.accessToken });
  assert.equal(refused.status, 404);
  const admin = await api.signIn('+919600000062');
  admins.push(admin.user.id);
  const digest = await api.call('GET', '/v1/admin/crashes?days=7', { token: admin.accessToken });
  assert.equal(digest.status, 200, digest.text);
  assert.equal(digest.body.days, 7);
  assert.ok(digest.body.versions.length >= 1);
  assert.ok(digest.body.versions.every((entry) => entry.signatures.every((row) => !('userId' in row))), 'no user ids in the digest');
  assert.ok(api.logs.some((entry) => entry.admin === 'crash-digest' && entry.userId === admin.user.id), 'the read is logged');
});
