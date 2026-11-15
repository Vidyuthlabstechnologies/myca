import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers.mjs';
import { PRIVACY_NOTICE, PRIVACY_NOTICE_AE, PRIVACY_NOTICE_AE_AR, PRIVACY_NOTICE_MY, noticeFor, noticesFor } from '../src/consent.mjs';

let api;
before(async () => { api = await startApi(); });
after(async () => { await api.close(); });

const text = (notice) => notice.sections.map((section) => `${section.heading}\n${section.body}`).join('\n');

test('the UAE notice states the PDPL basis, Doha storage under Article 23, the two roles, retention and rights', () => {
  const body = text(PRIVACY_NOTICE_AE);
  assert.equal(PRIVACY_NOTICE_AE.region, 'AE');
  assert.equal(PRIVACY_NOTICE_AE.requiresAdult, true);
  assert.match(PRIVACY_NOTICE_AE.law, /Federal Decree-Law No\. 45 of 2021/);
  assert.match(PRIVACY_NOTICE_AE.controller, /^ML Dynamic Solutions Private Limited/);
  assert.match(body, /Doha, Qatar \(region me-central1\)/);
  assert.match(body, /Article 23/);
  assert.match(body, /not a registered tax agent/);
  assert.match(body, /EmaraTax/);
  assert.match(body, /checked by the MyCA server/);
  assert.doesNotMatch(body, /checked on your device/);
  assert.match(body, /at least 5 years/);
  assert.match(body, /7 years for Corporate Tax/);
  assert.match(body, /30 days/);
  assert.match(body, /UAE Data Office/);
  assert.match(PRIVACY_NOTICE_AE.status, /Draft for legal review/);
  assert.equal(PRIVACY_NOTICE_AE.dataProtectionOfficer.confirmed, false);
  assert.doesNotMatch(body, /Data Protection Board|GSTIN|DPDP|PDPA|LHDN/, 'nothing from the Indian or Malaysian notice leaks into the UAE one');
});

test('the Arabic notice says the same, section by section, under the same version', () => {
  assert.equal(PRIVACY_NOTICE_AE_AR.language, 'ar');
  assert.equal(PRIVACY_NOTICE_AE_AR.version, PRIVACY_NOTICE_AE.version);
  assert.equal(PRIVACY_NOTICE_AE_AR.sections.length, PRIVACY_NOTICE_AE.sections.length);
  const body = text(PRIVACY_NOTICE_AE_AR);
  for (const phrase of ['المرسوم بقانون اتحادي رقم 45 لسنة 2021', 'المادة 23', 'الدوحة، قطر', 'me-central1', 'إمارات تاكس', 'خمس سنوات', 'سبع سنوات', '30 يومًا', 'مكتب الإمارات للبيانات']) assert.ok(body.includes(phrase), phrase);
  assert.deepEqual(PRIVACY_NOTICE_AE_AR.storage, PRIVACY_NOTICE_AE.storage);
});

test('noticeFor gives the UAE notice for AE, in Arabic when asked, and noticesFor keeps it to UAE servers', () => {
  assert.equal(noticeFor('AE'), PRIVACY_NOTICE_AE);
  assert.equal(noticeFor(' ae ', 'en'), PRIVACY_NOTICE_AE);
  assert.equal(noticeFor('AE', 'ar'), PRIVACY_NOTICE_AE_AR);
  assert.equal(noticeFor('AE', 'AR-ae'), PRIVACY_NOTICE_AE_AR);
  assert.equal(noticeFor('IN', 'ar'), PRIVACY_NOTICE);
  assert.deepEqual(noticesFor(['AE']), [PRIVACY_NOTICE_AE]);
  assert.deepEqual(noticesFor(['IN']), [PRIVACY_NOTICE]);
  assert.deepEqual(noticesFor(['MY', 'AE']), [PRIVACY_NOTICE_MY, PRIVACY_NOTICE_AE]);
});

test('the UAE notice is served before sign-in, a UAE mobile can sign in, and accepting the notice opens the books', async () => {
  const english = await api.call('GET', '/v1/privacy-notice?region=AE');
  assert.equal(english.status, 200);
  assert.equal(english.body.notice.version, PRIVACY_NOTICE_AE.version);
  const arabic = await api.call('GET', '/v1/privacy-notice?region=AE&lang=ar');
  assert.equal(arabic.body.notice.language, 'ar');
  const session = await api.signIn('+971501234901', { agree: false });
  assert.ok(session.accessToken, 'a +971 number signs in');
  assert.equal((await api.call('GET', '/v1/businesses', { token: session.accessToken })).status, 403);
  const agreed = await api.call('POST', '/v1/me/consent', { token: session.accessToken, body: { document: 'privacy', version: PRIVACY_NOTICE_AE.version, adult: true } });
  assert.equal(agreed.status, 200, agreed.text);
  assert.equal((await api.call('GET', '/v1/businesses', { token: session.accessToken })).status, 200);
});
