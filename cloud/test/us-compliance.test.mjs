import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi, BOOKS_KEY } from './helpers.mjs';
import { base32Decode, totpCode } from '../src/totp.mjs';
import { storedState } from '../src/books-seal.mjs';
import { JOB_HEADER } from '../src/jobs.mjs';
import { createConsent, noticesFor, PRIVACY_NOTICE, PRIVACY_NOTICE_US } from '../src/consent.mjs';
import { createUsConsents, usConsentForms, formHasBlanks, renderConsent, consentPeriod, PARTNER_TINS, EXPERT_REVIEW, PLUS_USE, TIGTA_STATEMENT, US_PREPARER_NAME } from '../src/us-7216.mjs';
import { usRecordsHeldUntil } from '../src/us-retention.mjs';
import { usSecondStepRequired } from '../src/us-safeguards.mjs';
import { redactTinsDeep } from '../../platform/src/us-identity.mjs';

const FILER_ENV = {
  MYCA_US_FILER: 'column-tax',
  MYCA_US_FILER_BASE_URL: 'https://api.partner.example',
  MYCA_US_FILER_API_KEY: 'key_test_compliance',
  MYCA_US_FILER_WEBHOOK_SECRET: 'whsec-compliance-0123456789abcdef',
  MYCA_US_FILER_SEND_TINS: '1',
  MYCA_PROVIDER_ENV: 'test',
};
const JOB_TOKEN = 'job-token-for-us-compliance-0123456789abcdef0123456789';
const DAY = 24 * 60 * 60 * 1000;
const sessions = [];
const realFetch = globalThis.fetch;
let api;
let nextPhone = 9400000700;

before(async () => {
  Object.assign(process.env, FILER_ENV);
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://api.partner.example/')) {
      sessions.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ id: `cu_${sessions.length}`, user_url: `https://file.partner.example/s/${sessions.length}` }), { status: 200 });
    }
    return realFetch(url, init);
  };
  api = await startApi({ jobToken: JOB_TOKEN });
});

after(async () => {
  globalThis.fetch = realFetch;
  for (const key of [...Object.keys(FILER_ENV), 'MYCA_US_REQUIRE_SECOND_STEP']) delete process.env[key];
  await api.close();
});

async function household() {
  const session = await api.signIn(`+91${nextPhone++}`);
  const created = await api.call('POST', '/v1/businesses', { token: session.accessToken, body: { name: 'Jordan Rivera', country: 'US', kind: 'household' } });
  assert.equal(created.status, 200, created.text);
  return { token: session.accessToken, userId: session.user.id, businessId: created.body.business.id };
}
const post = (who, action, body) => api.call('POST', `/v1/businesses/${who.businessId}/${action}`, { token: who.token, body });

async function write(who, name, args) {
  const proposed = await post(who, 'propose', { name, args });
  assert.equal(proposed.status, 200, proposed.text);
  if (!proposed.body.preview?.token) return proposed.body;
  const confirmed = await post(who, 'confirm', { token: proposed.body.preview.token });
  assert.equal(confirmed.status, 200, confirmed.text);
  return confirmed.body;
}

async function preparedReturn(who) {
  await write(who, 'set_us_taxpayer', { taxYear: '2026', filingStatus: 'single', taxpayer: { firstName: 'Jordan', lastName: 'Rivera', ssn: '400-12-3456', dateOfBirth: '1990-04-02', occupation: 'Designer' }, address: { line1: '1 Main St', city: 'Austin', state: 'TX', zip: '78701' } });
  await write(who, 'add_us_tax_form', { taxYear: '2026', kind: 'W-2', payer: 'Hill Studio', payerTin: '12-3456789', fields: { wages: 60000, federalWithheld: 6000, socialSecurityWages: 60000, socialSecurityTax: 3720, medicareWages: 60000, medicareTax: 870 } });
}

const consents = (who) => api.call('GET', '/v1/me/us-consents', { token: who.token });
const sign = (who, body) => api.call('POST', '/v1/me/us-consents', { token: who.token, body });

test('every 7216 consent carries the Rev. Proc. 2013-14 statements, the preparer, the recipient and the TIGTA line, each on its own form', () => {
  const forms = usConsentForms({ partner: { provider: 'column-tax', label: 'Column Tax' } });
  assert.deepEqual(forms.map((f) => f.document), [PARTNER_TINS, EXPERT_REVIEW, PLUS_USE]);
  for (const form of forms) {
    assert.match(form.body[0], /^Federal law requires this consent form be provided to you\./);
    assert.ok(form.body.includes(TIGTA_STATEMENT), form.document);
    const text = renderConsent(form, { signedName: 'Jordan Rivera', signedAt: '2026-11-14T00:00:00.000Z', validUntil: '2027-11-14' });
    assert.ok(text.includes(`Tax return preparer: ${US_PREPARER_NAME}`));
    assert.ok(text.includes('Taxpayer: Jordan Rivera'));
    assert.ok(text.includes('valid until 2027-11-14'));
  }
  const tins = forms[0];
  assert.equal(tins.kind, 'disclose');
  assert.match(tins.body.join(' '), /disclose to Column Tax/);
  assert.match(tins.body.join(' '), /If you do not sign it you can still file/);
  assert.equal(forms[2].kind, 'use');
  assert.match(forms[2].body[0], /we cannot use your tax return information/);
  assert.match(forms[1].body[1], /we may decline to provide you with tax return preparation services/);
  assert.notEqual(usConsentForms({ partner: { provider: 'april', label: 'April' } })[0].version, tins.version, 'a consent naming one partner does not cover another');
  assert.equal(formHasBlanks(tins), true, 'the preparer is still a blank for the owner to fill');
});

test('the consent period defaults to one year and refuses past, malformed or over-long dates', () => {
  const now = Date.parse('2026-11-14T10:00:00Z');
  assert.equal(consentPeriod(undefined, now).until, now + 365 * DAY);
  assert.equal(consentPeriod('2026-11-13', now).error, 'CONSENT_DATE_PAST');
  assert.equal(consentPeriod('2026-02-30', now).error, 'CONSENT_DATE_INVALID');
  assert.equal(consentPeriod('2031-01-01', now).error, 'CONSENT_TOO_LONG');
  assert.equal(new Date(consentPeriod('2027-04-15', now).until).toISOString(), '2027-04-15T23:59:59.999Z');
});

test('a filer signs a 7216 consent by typing a name, the exact text is kept, it is audited, and it can be withdrawn', async () => {
  const who = await household();
  const listed = await consents(who);
  assert.equal(listed.status, 200, listed.text);
  const form = listed.body.consents.find((c) => c.document === PARTNER_TINS);
  assert.equal(form.signed, null);
  assert.equal(form.final, false);
  assert.match(form.text, /Column Tax/);

  assert.equal((await sign(who, { document: PARTNER_TINS, version: form.version, signedName: ' ' })).body.error, 'SIGNATURE_REQUIRED');
  assert.equal((await sign(who, { document: PARTNER_TINS, version: form.version, signedName: '12345' })).body.error, 'SIGNATURE_REQUIRED');
  assert.equal((await sign(who, { document: PARTNER_TINS, version: 'old', signedName: 'Jordan Rivera' })).body.error, 'CONSENT_CHANGED');
  assert.equal((await sign(who, { document: 'marketing', version: form.version, signedName: 'Jordan Rivera' })).body.error, 'CONSENT_UNKNOWN');

  const signed = await sign(who, { document: PARTNER_TINS, version: form.version, signedName: 'Jordan  Rivera' });
  assert.equal(signed.status, 200, signed.text);
  assert.equal(signed.body.validUntil, new Date(api.clock.now + 365 * DAY).toISOString());
  const row = (await api.db.query('select signed_name, consent_text, text_sha256, device_id from us_7216_consents where user_id = $1', [who.userId])).rows[0];
  assert.equal(row.signed_name, 'Jordan Rivera');
  assert.equal(row.text_sha256, signed.body.textSha256);
  assert.match(row.consent_text, /Signed electronically by typing the name "Jordan Rivera"/);
  assert.ok(row.device_id);
  const audited = await api.db.query("select metadata from audit_log where business_id = $1 and action = 'us_7216.consent_signed'", [who.businessId]);
  assert.equal(audited.rowCount, 1);
  assert.ok(!JSON.stringify(audited.rows[0].metadata).includes('Jordan'), 'the audit row carries no name');

  assert.ok((await consents(who)).body.consents.find((c) => c.document === PARTNER_TINS).signed);
  const withdrawn = await api.call('DELETE', `/v1/me/us-consents/${PARTNER_TINS}`, { token: who.token });
  assert.equal(withdrawn.body.revoked, true);
  assert.equal((await consents(who)).body.consents.find((c) => c.document === PARTNER_TINS).signed, null);
  assert.equal((await api.db.query("select 1 from audit_log where business_id = $1 and action = 'us_7216.consent_revoked'", [who.businessId])).rowCount, 1);
});

test('a consent lapses at the end of its period', async () => {
  const who = await household();
  const form = (await consents(who)).body.consents.find((c) => c.document === PLUS_USE);
  const until = new Date(api.clock.now + 2 * DAY).toISOString().slice(0, 10);
  assert.equal((await sign(who, { document: PLUS_USE, version: form.version, signedName: 'Jordan Rivera', validUntil: until })).status, 200);
  const store = createUsConsents({ db: api.db, now: () => api.clock.now });
  assert.equal(await store.valid(who.userId, PLUS_USE), true);
  const later = createUsConsents({ db: api.db, now: () => api.clock.now + 3 * DAY });
  assert.equal(await later.valid(who.userId, PLUS_USE), false);
});

test('in production a consent with a blank name on it cannot be signed', async () => {
  const who = await household();
  const store = createUsConsents({ db: api.db, now: () => api.clock.now, environment: 'production' });
  const form = (await store.list(who.userId)).consents.find((c) => c.document === PARTNER_TINS);
  assert.equal((await store.sign(who.userId, null, { document: PARTNER_TINS, version: form.version, signedName: 'Jordan Rivera' })).error, 'CONSENT_NOT_FINAL');
  const filled = createUsConsents({ db: api.db, now: () => api.clock.now, environment: 'production', forms: () => [{ ...usConsentForms()[0], body: ['Filled in.'], title: 'Consent' }] });
  assert.equal((await filled.sign(who.userId, null, { document: PARTNER_TINS, version: form.version, signedName: 'Jordan Rivera' })).ok, true);
});

test('SSNs reach the e-file partner only when the operator allows it and the filer has signed the 7216 consent; a caller cannot claim it', async () => {
  const who = await household();
  await preparedReturn(who);
  const before = sessions.length;
  await write(who, 'file_us_return', { taxYear: 2026, shareTins: true });
  assert.equal(sessions.length, before + 1);
  assert.equal(sessions.at(-1).prefill.taxpayer.ssn, undefined, 'no consent, no SSN, whatever the caller sends');

  const form = (await consents(who)).body.consents.find((c) => c.document === PARTNER_TINS);
  assert.equal((await sign(who, { document: PARTNER_TINS, version: form.version, signedName: 'Jordan Rivera' })).status, 200);
  await write(who, 'file_us_return', { taxYear: 2026 });
  assert.equal(sessions.at(-1).prefill.taxpayer.ssn, '400123456', 'with the signed consent the SSN is prefilled');

  await api.call('DELETE', `/v1/me/us-consents/${PARTNER_TINS}`, { token: who.token });
  await write(who, 'file_us_return', { taxYear: 2026 });
  assert.equal(sessions.at(-1).prefill.taxpayer.ssn, undefined, 'a withdrawn consent stops the disclosure');
});

test('with the second step required, a US return cannot be signed or filed until two-step sign-in is on', async () => {
  process.env.MYCA_US_REQUIRE_SECOND_STEP = '1';
  try {
    const who = await household();
    await preparedReturn(who);
    const refused = await post(who, 'propose', { name: 'file_us_return', args: { taxYear: 2026 } });
    assert.equal(refused.body.error, 'SECOND_STEP_REQUIRED', refused.text);
    const unsigned = await post(who, 'propose', { name: 'sign_us_return', args: { taxYear: 2026 } });
    assert.equal(unsigned.body.error, 'SECOND_STEP_REQUIRED', unsigned.text);

    const begun = await api.call('POST', '/v1/me/second-step/begin', { token: who.token });
    const code = totpCode(base32Decode(begun.body.secret), api.clock.now);
    assert.equal((await api.call('POST', '/v1/me/second-step/confirm', { token: who.token, body: { code } })).status, 200);
    const allowed = await post(who, 'propose', { name: 'file_us_return', args: { taxYear: 2026 } });
    assert.notEqual(allowed.body.error, 'SECOND_STEP_REQUIRED', allowed.text);
  } finally {
    delete process.env.MYCA_US_REQUIRE_SECOND_STEP;
  }
});

test('production always requires the second step for US filing; elsewhere it is a setting', () => {
  assert.equal(usSecondStepRequired({ MYCA_ENVIRONMENT: 'production', MYCA_US_REQUIRE_SECOND_STEP: '0' }), true);
  assert.equal(usSecondStepRequired({ MYCA_ENVIRONMENT: 'staging' }), false);
  assert.equal(usSecondStepRequired({ MYCA_ENVIRONMENT: 'staging', MYCA_US_REQUIRE_SECOND_STEP: 'yes' }), true);
});

test('a return MyCA itself e-filed is held three years from the later of the due date and IRS receipt; sandbox and partner filings are not', () => {
  const live = (over) => ({ usEfile: { returns: { 2026: { submissions: [{ taxYear: 2026, transport: 'mef', mode: 'live', submittedAt: '2027-03-01T00:00:00.000Z', ...over }] } } } });
  assert.equal(usRecordsHeldUntil(live()), '2030-04-15T00:00:00.000Z');
  assert.equal(usRecordsHeldUntil(live({ submittedAt: '2027-10-10T00:00:00.000Z', ack: { acknowledgedAt: '2027-10-11T00:00:00.000Z' } })), '2030-10-11T00:00:00.000Z');
  assert.equal(usRecordsHeldUntil(live({ mode: 'sandbox' })), null);
  assert.equal(usRecordsHeldUntil(live({ transport: 'partner' })), null);
  assert.equal(usRecordsHeldUntil({}), null);
});

test('the purge keeps a deleted household while its IRS e-file records must be kept, then erases it', async () => {
  const who = await household();
  const state = await api.books(who.businessId);
  state.usEfile = { submissionSeq: 1, returns: { 2026: { taxYear: 2026, submissions: [{ submissionId: '00000020270600000001', taxYear: 2026, transport: 'mef', mode: 'live', submittedAt: new Date(api.clock.now).toISOString(), status: 'accepted' }] } } };
  await api.db.query('update books set state = $2::jsonb where business_id = $1', [who.businessId, storedState(BOOKS_KEY, who.businessId, JSON.stringify(state))]);
  await api.db.query('update businesses set deletion_requested_at = $2 where id = $1', [who.businessId, new Date(api.clock.now)]);

  api.clock.advance(31 * DAY);
  const held = await api.call('POST', '/v1/jobs/daily', { headers: { [JOB_HEADER]: JOB_TOKEN } });
  assert.equal(held.status, 200, held.text);
  assert.ok(held.body.purge.held >= 1, held.text);
  assert.deepEqual(held.body.purge.failed, []);
  assert.equal((await api.db.query('select 1 from businesses where id = $1', [who.businessId])).rowCount, 1);

  api.clock.advance(4 * 366 * DAY);
  const due = await api.call('POST', '/v1/jobs/daily', { headers: { [JOB_HEADER]: JOB_TOKEN } });
  assert.equal(due.status, 200, due.text);
  assert.equal((await api.db.query('select 1 from businesses where id = $1', [who.businessId])).rowCount, 0, 'erased once the three years are over');
});

test('a US-only deployment accepts only the US notice and says so', async () => {
  assert.deepEqual(noticesFor(['US']).map((n) => n.version), [PRIVACY_NOTICE_US.version]);
  assert.deepEqual(noticesFor(['IN']).map((n) => n.version), [PRIVACY_NOTICE.version]);
  assert.equal(noticesFor(['IN', 'US']).length, 2);
  const session = await api.signIn(`+91${nextPhone++}`, { agree: false });
  const us = createConsent({ db: api.db, now: () => api.clock.now, notices: noticesFor(['US']) });
  assert.equal((await us.status(session.user.id)).version, PRIVACY_NOTICE_US.version);
  assert.equal((await us.accept(session.user.id, null, { document: 'privacy', version: PRIVACY_NOTICE.version })).error, 'NOTICE_CHANGED');
  assert.equal((await us.accept(session.user.id, null, { document: 'privacy', version: PRIVACY_NOTICE_US.version })).ok, true);
  assert.equal(await us.accepted(session.user.id), true);
});

test('the US notice states what IRS Pub 1345 and the state privacy laws ask for, and keeps the owner blanks', () => {
  const text = PRIVACY_NOTICE_US.sections.map((s) => `${s.heading}: ${s.body}`).join('\n');
  assert.ok(text.includes('We maintain physical, electronic and procedural safeguards that comply with applicable law and federal standards.'));
  for (const needed of ['7216', 'under 13', '45 days', 'Form 8879', 'separate consent', 'United States', 'Stripe']) assert.ok(text.includes(needed), needed);
  for (const blank of ['[the US company, to be confirmed before release]', '[Column Tax or April, to be confirmed]', 'Privacy contact: [Name], [email]']) assert.ok(text.includes(blank), blank);
});

test('server log lines never carry a full SSN', () => {
  const line = JSON.stringify(redactTinsDeep({ error: 'Error: bad ssn 400-12-3456 for 400123456', path: '/v1/businesses' }));
  assert.ok(!line.includes('400-12-3456') && !line.includes('400123456'), line);
});
