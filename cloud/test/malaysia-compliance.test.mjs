import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers.mjs';
import { PRIVACY_NOTICE_MY, PRIVACY_NOTICE_MY_MS } from '../src/consent.mjs';
import { setMyInvoisSandboxClock, MYINVOIS_SANDBOX_VALIDATION_MS } from '../../platform/src/countries/malaysia/myinvois-sandbox.mjs';
import { clearMyInvoisTokens } from '../../platform/src/countries/malaysia/myinvois-client.mjs';

const ENV = { MYCA_PROVIDER_ENV: 'off', MYCA_MOCK_MODE: '0', MYCA_MYINVOIS_CLIENT_ID: '', MYCA_MYINVOIS_CLIENT_SECRET: '', MYCA_MYINVOIS_CERT_PATH: '', MYCA_MYINVOIS_KEY_PATH: '', MYCA_MYINVOIS_SANDBOX: '1', MYCA_COUNTRIES: 'MY', MYCA_REGION: 'asia-southeast1' };
const saved = {};
let api;
let clock = Date.now();

before(async () => {
  for (const [key, value] of Object.entries(ENV)) { saved[key] = process.env[key]; process.env[key] = value; }
  setMyInvoisSandboxClock(() => clock);
  clearMyInvoisTokens();
  api = await startApi();
});

after(async () => {
  setMyInvoisSandboxClock(null);
  clearMyInvoisTokens();
  for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  await api.close();
});

const text = (notice) => notice.sections.map((section) => `${section.heading}\n${section.body}`).join('\n');

test('the Malaysian notice names every recipient and the US transfer, uses the amended "data controller" term, and asks for explicit consent to sensitive data', () => {
  for (const notice of [PRIVACY_NOTICE_MY, PRIVACY_NOTICE_MY_MS]) {
    assert.equal(notice.requiresAdult, true);
    assert.deepEqual(notice.sensitiveConsent, { document: 'my-sensitive-data' });
    assert.equal(notice.version, 'my-draft-2026-11-23');
  }
  const english = text(PRIVACY_NOTICE_MY);
  for (const phrase of ['data controller (called the data user before the 2024 amendments)', 'Anthropic, in the United States', 'MyKad numbers masked', 'Google Play', 'section 129(3)', 'zakat you pay, which shows your religious belief', 'explicit consent', 'We answer within 21 days', 'aged 18 or over', 'another data controller (data portability)']) assert.ok(english.includes(phrase), phrase);
  assert.doesNotMatch(english, /We are the data user/);
  const malay = text(PRIVACY_NOTICE_MY_MS);
  for (const phrase of ['pengawal data (dahulu dipanggil pengguna data', 'Anthropic, di Amerika Syarikat', 'Google Play', 'seksyen 129(3)', 'persetujuan nyata', 'dalam masa 21 hari', '18 tahun ke atas', 'pengawal data lain (kemudahalihan data)']) assert.ok(malay.includes(phrase), phrase);
  assert.equal(PRIVACY_NOTICE_MY_MS.sections.length, PRIVACY_NOTICE_MY.sections.length, 'both languages carry the same sections');
});

test('accepting the Malaysian notice needs the 18+ declaration and the separate sensitive-data tick, and records both', async () => {
  const session = await api.signIn('+60123000111', { agree: false });
  const post = (body) => api.call('POST', '/v1/me/consent', { token: session.accessToken, body: { document: 'privacy', version: PRIVACY_NOTICE_MY.version, ...body } });
  assert.equal((await post({})).body.error, 'ADULT_REQUIRED');
  assert.equal((await post({ adult: true })).body.error, 'SENSITIVE_CONSENT_REQUIRED');
  assert.equal((await post({ adult: true, sensitive: 'yes' })).body.error, 'SENSITIVE_CONSENT_REQUIRED', 'only a real true counts as explicit consent');
  const agreed = await post({ adult: true, sensitive: true });
  assert.equal(agreed.status, 200, agreed.text);
  const rows = await api.db.query('select document, version, adult_declared from consents where version = $1 order by document', [PRIVACY_NOTICE_MY.version]);
  assert.deepEqual(rows.rows.map((row) => row.document), ['my-sensitive-data', 'privacy']);
  assert.ok(rows.rows.every((row) => row.version === PRIVACY_NOTICE_MY.version && row.adult_declared === true));
  assert.equal((await api.call('GET', '/v1/businesses', { token: session.accessToken })).status, 200);
});

test('a status check keeps what LHDN says: validated e-invoices stop showing as submitted, and the cancel window is known', async () => {
  const session = await api.signIn('+60123000222', { agree: false });
  assert.equal((await api.call('POST', '/v1/me/consent', { token: session.accessToken, body: { document: 'privacy', version: PRIVACY_NOTICE_MY.version, adult: true, sensitive: true } })).status, 200);
  const created = await api.call('POST', '/v1/businesses', { token: session.accessToken, body: { name: 'Kedai Contoh', country: 'MY' } });
  assert.equal(created.status, 200, created.text);
  const id = created.body.business.id;
  const post = (action, body) => api.call('POST', `/v1/businesses/${id}/${action}`, { token: session.accessToken, body });
  const run = async (name, args) => {
    const held = await post('propose', { name, args });
    assert.equal(held.status, 200, held.text);
    assert.ok(held.body.preview?.token, held.text);
    const done = await post('confirm', { token: held.body.preview.token });
    assert.equal(done.status, 200, done.text);
    return done.body;
  };
  await run('set_my_einvoice_profile', { name: 'Kedai Contoh Sdn Bhd', tin: 'C20830570210', idType: 'BRN', idValue: '202001234567', msic: '46510', phone: '+60123456789', address: { lines: ['Lot 66'], city: 'Kuala Lumpur', state: 'Selangor' } });
  const issued = await run('issue_my_einvoice', { number: 'INV-MY-1', buyer: { name: 'Pelanggan Bhd', tin: 'C10987654320', idValue: '199901000111', address: { city: 'Shah Alam', state: '10' } }, lines: [{ description: 'Consulting', classification: '022', quantity: 1, unitPrice: 1000, taxType: '02', taxRateBasisPoints: 800 }] });
  const issuedText = JSON.stringify(issued);
  const submissionUid = issuedText.match(/"submissionUid":"([A-Z0-9]{26})"/)?.[1];
  assert.ok(submissionUid, issuedText);
  clock += MYINVOIS_SANDBOX_VALIDATION_MS + 1000;
  const status = await post('query', { name: 'my_einvoice_status', args: { submissionUid } });
  assert.equal(status.status, 200, status.text);
  assert.match(JSON.stringify(status.body), /"status":"Valid"/i, status.text);
  const listed = await post('query', { name: 'my_einvoices', args: {} });
  assert.equal(listed.status, 200, listed.text);
  const row = listed.body.data.documents.find((doc) => doc.number === 'INV-MY-1');
  assert.equal(row.status, 'valid', 'the validated status was kept in the books');
  assert.ok(row.cancellableUntil, 'the 72-hour cancel window is known once the validation time is kept');
});
