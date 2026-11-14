import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers.mjs';
import { PRIVACY_NOTICE, PRIVACY_NOTICE_MY, PRIVACY_NOTICE_MY_MS, PRIVACY_NOTICE_US, noticeFor } from '../src/consent.mjs';

let api;
before(async () => { api = await startApi(); });
after(async () => { await api.close(); });

const text = (notice) => notice.sections.map((section) => `${section.heading}\n${section.body}`).join('\n');

test('the Malaysian notice states the PDPA basis, the controller, Singapore storage under section 129, retention, rights, breach notice and the DPO', () => {
  const body = text(PRIVACY_NOTICE_MY);
  assert.match(PRIVACY_NOTICE_MY.law, /Personal Data Protection Act 2010.*Amendment\) Act 2024/);
  assert.match(PRIVACY_NOTICE_MY.controller, /^ML Dynamic Solutions Private Limited/);
  assert.match(body, /Google Cloud servers in Singapore \(region asia-southeast1\)/);
  assert.match(body, /Section 129 of the PDPA/);
  assert.match(body, /seven years/);
  assert.match(body, /section 82 of the Income Tax Act 1967/);
  assert.match(body, /Sales Tax Act 2018 and the Service Tax Act 2018/);
  for (const right of ['access', 'correct', 'data portability', 'withdraw your consent']) assert.match(body, new RegExp(right), right);
  assert.match(body, /Personal Data Protection Commissioner within 72 hours/);
  assert.match(body, /dpo@/);
  assert.match(body, /to be confirmed before release/);
  assert.match(body, /LHDN/);
  assert.deepEqual(PRIVACY_NOTICE_MY.storage, { provider: 'Google Cloud', region: 'asia-southeast1', place: 'Singapore', transferBasis: 'PDPA section 129' });
  assert.equal(PRIVACY_NOTICE_MY.retention.years, 7);
  assert.equal(PRIVACY_NOTICE_MY.breachNotification.commissionerWithinHours, 72);
  assert.equal(PRIVACY_NOTICE_MY.breachNotification.usersWithinDays, 7);
  assert.match(body, /we tell you within 7 days of notifying the Commissioner/);
  assert.equal(PRIVACY_NOTICE_MY.dataProtectionOfficer.confirmed, false);
  assert.match(PRIVACY_NOTICE_MY.status, /Draft for legal review/);
  assert.doesNotMatch(body, /Data Protection Board|GSTIN|DPDP|GST figures/, 'nothing from the Indian notice leaks into the Malaysian one');
});

test('the Malay notice says the same in Bahasa Malaysia, section by section, under the same version', () => {
  assert.equal(PRIVACY_NOTICE_MY_MS.language, 'ms');
  assert.equal(PRIVACY_NOTICE_MY_MS.version, PRIVACY_NOTICE_MY.version);
  assert.equal(PRIVACY_NOTICE_MY_MS.sections.length, PRIVACY_NOTICE_MY.sections.length);
  const body = text(PRIVACY_NOTICE_MY_MS);
  for (const phrase of ['Akta Perlindungan Data Peribadi 2010', 'Seksyen 129', 'Singapura', 'asia-southeast1', 'tujuh tahun', 'seksyen 82 Akta Cukai Pendapatan 1967', 'dalam masa 72 jam', 'dalam masa 7 hari selepas memaklumkan Pesuruhjaya', 'Pesuruhjaya Perlindungan Data Peribadi', 'dpo@', 'akan disahkan sebelum diterbitkan']) assert.ok(body.includes(phrase), phrase);
  assert.deepEqual(PRIVACY_NOTICE_MY_MS.storage, PRIVACY_NOTICE_MY.storage);
  assert.equal(PRIVACY_NOTICE_MY_MS.controller, PRIVACY_NOTICE_MY.controller);
});

test('noticeFor picks the notice by region and language, case-blind, and falls back to English for Malaysia', () => {
  assert.equal(noticeFor('MY'), PRIVACY_NOTICE_MY);
  assert.equal(noticeFor('my'), PRIVACY_NOTICE_MY);
  assert.equal(noticeFor(' MY ', 'en'), PRIVACY_NOTICE_MY);
  assert.equal(noticeFor('MY', 'ms'), PRIVACY_NOTICE_MY_MS);
  assert.equal(noticeFor('MY', 'MS-my'), PRIVACY_NOTICE_MY_MS);
  assert.equal(noticeFor('MY', 'ta'), PRIVACY_NOTICE_MY);
  assert.equal(noticeFor('US', 'ms'), PRIVACY_NOTICE_US);
  assert.equal(noticeFor('IN', 'ms'), PRIVACY_NOTICE);
  assert.equal(noticeFor(undefined), PRIVACY_NOTICE);
  assert.equal(noticeFor('ZZ'), PRIVACY_NOTICE);
});

test('the Malaysian notice is served before sign-in in English and Malay, and accepting it opens the books', async () => {
  const english = await api.call('GET', '/v1/privacy-notice?region=MY');
  assert.equal(english.status, 200);
  assert.equal(english.body.notice.version, PRIVACY_NOTICE_MY.version);
  assert.equal(english.body.notice.language, 'en');
  const malay = await api.call('GET', '/v1/privacy-notice?region=MY&lang=ms');
  assert.equal(malay.status, 200);
  assert.equal(malay.body.notice.language, 'ms');
  assert.match(malay.body.notice.title, /data peribadi/);
  const session = await api.signIn('+919400000901', { agree: false });
  assert.equal((await api.call('GET', '/v1/businesses', { token: session.accessToken })).status, 403);
  const agreed = await api.call('POST', '/v1/me/consent', { token: session.accessToken, body: { document: 'privacy', version: PRIVACY_NOTICE_MY.version } });
  assert.equal(agreed.status, 200, agreed.text);
  assert.equal(agreed.body.version, PRIVACY_NOTICE_MY.version);
  assert.equal((await api.call('GET', '/v1/businesses', { token: session.accessToken })).status, 200);
});
