import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers.mjs';
import { PRIVACY_NOTICE } from '../src/consent.mjs';

let api;
before(async () => { api = await startApi(); });
after(async () => { await api.close(); });

const agree = (token, body = { document: PRIVACY_NOTICE.document, version: PRIVACY_NOTICE.version }) => api.call('POST', '/v1/me/consent', { token, body });

test('the privacy notice can be read before signing in', async () => {
  const out = await api.call('GET', '/v1/privacy-notice');
  assert.equal(out.status, 200);
  assert.equal(out.body.notice.version, PRIVACY_NOTICE.version);
  assert.ok(out.body.notice.sections.length >= 5);
  assert.match(out.body.notice.controller, /ML Dynamic Solutions Private Limited/);
});

test('sign-in says whether the current notice was accepted, and books are closed until it is', async () => {
  const session = await api.signIn('+919400000001', { agree: false });
  assert.deepEqual(session.consent, { document: 'privacy', version: PRIVACY_NOTICE.version, accepted: false });
  const token = session.accessToken;
  for (const [method, path, body] of [['GET', '/v1/businesses'], ['POST', '/v1/businesses', { name: 'Asha Traders', state: '29' }], ['PATCH', '/v1/me', { name: 'Asha' }]]) {
    const out = await api.call(method, path, { token, body });
    assert.equal(out.status, 403, `${method} ${path}`);
    assert.deepEqual(out.body, { ok: false, error: 'CONSENT_REQUIRED', document: 'privacy', version: PRIVACY_NOTICE.version });
  }
  const me = await api.call('GET', '/v1/me', { token });
  assert.equal(me.status, 200);
  assert.equal(me.body.consent.accepted, false);
  assert.equal((await api.call('POST', '/v1/crash-reports', { token, body: { reports: [{ kind: 'flutter', type: 'StateError', stack: '#0 f (package:myca/a.dart:1:1)' }] } })).status, 200);
});

test('accepting an outdated notice is refused; accepting the current one opens the books, once', async () => {
  const session = await api.signIn('+919400000002', { agree: false });
  const token = session.accessToken;
  const stale = await agree(token, { document: 'privacy', version: 'draft-2020-01-01' });
  assert.equal(stale.status, 400);
  assert.equal(stale.body.error, 'NOTICE_CHANGED');
  assert.equal((await agree(token)).status, 200);
  assert.equal((await agree(token)).status, 200);
  const { rows } = await api.db.query('select version, device_id from consents where user_id = $1', [session.user.id]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].version, PRIVACY_NOTICE.version);
  assert.ok(rows[0].device_id, 'the device that accepted is recorded');
  assert.equal((await api.call('POST', '/v1/businesses', { token, body: { name: 'Asha Traders', state: '29' } })).status, 200);
  const again = await api.signIn('+919400000002', { agree: false });
  assert.equal(again.consent.accepted, true, 'remembered across sign-ins');
});
