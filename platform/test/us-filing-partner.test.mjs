import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-us-filer-'));
process.env.HOME = process.env.APPDATA;
process.env.MYCA_MOCK_MODE = '0';
delete process.env.MYCA_PROVIDER_ENV;
for (const key of ['MYCA_US_FILER', 'MYCA_US_FILER_BASE_URL', 'MYCA_US_FILER_API_KEY', 'MYCA_US_FILER_WEBHOOK_SECRET', 'MYCA_US_FILER_SEND_TINS', 'MYCA_US_FILER_SESSION_PATH']) delete process.env[key];

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { fileUsReturn, usEfileStatus, usEfileSetup, filePreview, efileMode } from '../src/us-efile.mjs';
import { partnerPrefill, readSessionResponse, normalizePartnerEvent, partnerSignatureValid, signPartnerBody, applyPartnerEvent, parseExternalId, externalIdFor, partnerMissing, partnerSettings, efileRoute } from '../src/us-filing-partner.mjs';
import { ACTION_CLASSES } from '../src/action-gate.mjs';

globalThis.fetch = async (url) => {
  throw new Error(`NETWORK_FORBIDDEN_IN_TESTS ${url}`);
};

const SCOPE = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f607';
const SECRET = 'whsec-partner-0123456789abcdef';

function computed1040() {
  return {
    taxYear: 2026,
    filingStatus: 'mfj',
    taxpayer: { firstName: 'Maya', lastName: 'Hill', ssn: '400011234', dob: '1988-04-02', occupation: 'Baker' },
    spouse: { firstName: 'Ravi', lastName: 'Hill', ssn: '400025678', dob: '1987-09-12', occupation: 'Engineer' },
    address: { line1: '12 Elm St', city: 'Austin', state: 'TX', zip: '78701' },
    dependents: [{ firstName: 'Asha', lastName: 'Hill', ssn: '400039012', relationship: 'daughter', months: 12 }],
    lines: { '11': 85000, '24': 3716, '35a': 2484 },
    w2s: [{ owner: 'taxpayer', ein: '123456789', employerName: 'Hill Country Foods', wages: 85000, fedWithheld: 6200 }],
    forms: [{ id: 'f1', kind: 'W-2', owner: 'taxpayer', payer: 'Hill Country Foods', fields: {} }, { id: 'f2', kind: '1099-INT', owner: 'taxpayer', payer: 'Bank', payerTin: '987654321', fields: { interest: 120 } }],
  };
}

const computedReturn = async () => ({ ok: true, data: computed1040() });

function usState() {
  const state = createState();
  state.company = { ...state.company, name: 'Hill household', country: 'US', state: 'TX', gstin: '' };
  return state;
}

function usePartner(extra = {}) {
  process.env.MYCA_US_FILER = 'column-tax';
  process.env.MYCA_US_FILER_BASE_URL = 'https://api.partner.example';
  process.env.MYCA_US_FILER_API_KEY = 'key_test_123';
  process.env.MYCA_US_FILER_WEBHOOK_SECRET = SECRET;
  Object.assign(process.env, extra);
}

afterEach(() => {
  for (const key of ['MYCA_US_FILER', 'MYCA_US_FILER_BASE_URL', 'MYCA_US_FILER_API_KEY', 'MYCA_US_FILER_WEBHOOK_SECRET', 'MYCA_US_FILER_SEND_TINS', 'MYCA_PROVIDER_ENV']) delete process.env[key];
});

test('without MYCA_US_FILER the route stays MeF and nothing changes', () => {
  assert.equal(efileRoute(), 'mef');
  assert.equal(usEfileSetup().route, 'mef');
  assert.equal(usEfileStatus(usState(), { taxYear: 2026 }).route, 'mef');
});

test('settings: every missing partner setting is named, and http or a short secret is refused', () => {
  process.env.MYCA_US_FILER = 'column-tax';
  assert.deepEqual(partnerMissing(partnerSettings()), ['MYCA_US_FILER_BASE_URL', 'MYCA_US_FILER_API_KEY', 'MYCA_US_FILER_WEBHOOK_SECRET']);
  usePartner({ MYCA_US_FILER_BASE_URL: 'http://api.partner.example', MYCA_US_FILER_WEBHOOK_SECRET: 'short' });
  assert.deepEqual(partnerMissing(partnerSettings()), ['MYCA_US_FILER_BASE_URL', 'MYCA_US_FILER_WEBHOOK_SECRET']);
  usePartner({ MYCA_US_FILER: 'someone-else' });
  assert.deepEqual(partnerMissing(partnerSettings()), ['MYCA_US_FILER']);
});

test('prefill carries names, address, dependents, W-2s and other forms; SSNs only when allowed', () => {
  const plain = partnerPrefill(computed1040());
  assert.equal(plain.filing_status, 'mfj');
  assert.equal(plain.taxpayer.first_name, 'Maya');
  assert.equal(plain.taxpayer.ssn, undefined);
  assert.equal(plain.spouse.ssn, undefined);
  assert.equal(plain.dependents[0].ssn, undefined);
  assert.equal(plain.dependents[0].relationship, 'daughter');
  assert.equal(plain.w2s[0].wages, 85000);
  assert.equal(plain.w2s[0].employer_ein, '123456789');
  assert.deepEqual(plain.other_forms.map((f) => f.kind), ['1099-INT']);
  assert.equal(plain.myca_estimate.refund, 2484);
  assert.ok(!JSON.stringify(plain).includes('400011234'));
  const withTins = partnerPrefill(computed1040(), { sendTins: true, contact: { email: 'maya@example.com' } });
  assert.equal(withTins.taxpayer.ssn, '400011234');
  assert.equal(withTins.dependents[0].ssn, '400039012');
  assert.equal(withTins.taxpayer.email, 'maya@example.com');
});

test('session responses are read leniently and only an https link is kept', () => {
  assert.deepEqual(readSessionResponse({ id: 'u_1', user_url: 'https://file.partner.example/s/abc' }), { handoffUrl: 'https://file.partner.example/s/abc', sessionId: 'u_1' });
  assert.deepEqual(readSessionResponse({ data: { session_id: 's2', url: 'https://x.example/y' } }), { handoffUrl: 'https://x.example/y', sessionId: 's2' });
  assert.equal(readSessionResponse({ url: 'javascript:alert(1)' }).handoffUrl, '');
  assert.equal(readSessionResponse({ url: 'http://x.example' }).handoffUrl, '');
});

test('external ids round-trip and refuse anything else', () => {
  const id = externalIdFor(SCOPE, 2026, 'a'.repeat(24));
  assert.deepEqual(parseExternalId(id), { scope: SCOPE, taxYear: 2026, ref: 'a'.repeat(24) });
  assert.equal(parseExternalId(externalIdFor('not-a-uuid', 2026, 'b'.repeat(24))).scope, null);
  assert.equal(parseExternalId('myca.x.2026.zz'), null);
  assert.equal(parseExternalId(''), null);
});

test('webhook signatures: HMAC-SHA256 hex, with or without sha256=, compared in constant time', () => {
  const raw = Buffer.from('{"status":"accepted"}');
  const sig = signPartnerBody(raw, SECRET);
  assert.equal(partnerSignatureValid(raw, sig, SECRET), true);
  assert.equal(partnerSignatureValid(raw, `sha256=${sig}`, SECRET), true);
  assert.equal(partnerSignatureValid(Buffer.from('{"status":"rejected"}'), sig, SECRET), false);
  assert.equal(partnerSignatureValid(raw, 'nonsense', SECRET), false);
  assert.equal(partnerSignatureValid(raw, sig, ''), false);
});

test('events are normalised from several shapes', () => {
  assert.equal(normalizePartnerEvent({ type: 'return.accepted', data: { external_id: 'e1' } }).status, 'accepted');
  assert.equal(normalizePartnerEvent({ event: 'RETURN_REJECTED', external_id: 'e1', errors: [{ code: 'IND-031-04', message: 'AGI' }] }).errors[0].ruleNumber, 'IND-031-04');
  assert.equal(normalizePartnerEvent({ status: 'transmitted', user: { external_id: 'e1' } }).status, 'submitted');
  assert.equal(normalizePartnerEvent({ status: 'started', externalId: 'e1' }).status, 'in_progress');
  assert.equal(normalizePartnerEvent({ status: 'something new' }).status, null);
});

test('simulator: with a partner chosen but not configured, filing needs no MyCA signature and is accepted', async () => {
  process.env.MYCA_US_FILER = 'column-tax';
  const state = usState();
  const out = await fileUsReturn(state, { taxYear: 2026, partnerScope: SCOPE }, { userId: 'u1' }, { computedReturn, now: '2027-02-01T10:00:00.000Z' });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.route, 'partner');
  assert.equal(out.simulated, true);
  assert.equal(out.status, 'accepted');
  const status = usEfileStatus(state, { taxYear: 2026 });
  assert.equal(status.status, 'accepted');
  assert.equal(status.route, 'partner');
  assert.equal(status.mode, 'sandbox');
  assert.equal(efileMode(), 'sandbox');
  const again = await fileUsReturn(state, { taxYear: 2026 }, { userId: 'u1' }, { computedReturn });
  assert.equal(again.error, 'ALREADY_ACCEPTED');
  assert.ok(state.auditEvents.some((e) => e.action === 'us_efile.partner_start'));
});

test('partner route: a configured partner opens a session with the prefill and returns the hand-off link; webhooks move the status', async () => {
  usePartner({ MYCA_PROVIDER_ENV: 'test' });
  const state = usState();
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ id: 'cu_9', user_url: 'https://file.partner.example/s/cu_9' }) };
  };
  const out = await fileUsReturn(state, { taxYear: 2026, partnerScope: SCOPE, contact: { email: 'maya@example.com' } }, { userId: 'u1' }, { computedReturn, fetchImpl, now: '2027-02-01T10:00:00.000Z' });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.status, 'in_progress');
  assert.equal(out.handoffUrl, 'https://file.partner.example/s/cu_9');
  assert.equal(out.mode, 'sandbox');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.partner.example/v1/sessions');
  assert.equal(calls[0].init.headers.authorization, 'Bearer key_test_123');
  const sent = JSON.parse(calls[0].init.body);
  assert.match(sent.external_id, new RegExp(`^myca\\.${SCOPE}\\.2026\\.[0-9a-f]{24}$`));
  assert.equal(sent.prefill.taxpayer.email, 'maya@example.com');
  assert.equal(sent.prefill.taxpayer.ssn, undefined);

  assert.equal(usEfileStatus(state, { taxYear: 2026 }).status, 'in_progress');

  const resumed = await fileUsReturn(state, { taxYear: 2026, partnerScope: SCOPE }, { userId: 'u1' }, { computedReturn, fetchImpl });
  assert.equal(resumed.ok, true);
  assert.equal(JSON.parse(calls[1].init.body).external_id, sent.external_id, 'resuming keeps the same external id');

  const ext = sent.external_id;
  assert.equal(applyPartnerEvent(state, { externalId: ext, status: 'submitted', submissionId: '00000020270320000001' }).changed, true);
  assert.equal(usEfileStatus(state, { taxYear: 2026 }).status, 'submitted');
  assert.equal(applyPartnerEvent(state, { externalId: ext, status: 'submitted' }).changed, false, 'a repeated event changes nothing');
  assert.equal((await fileUsReturn(state, { taxYear: 2026 }, { userId: 'u1' }, { computedReturn, fetchImpl })).error, 'ALREADY_SUBMITTED');

  applyPartnerEvent(state, { externalId: ext, status: 'rejected', errors: [{ ruleNumber: 'IND-031-04', message: 'Prior-year AGI mismatch' }] });
  const rejected = usEfileStatus(state, { taxYear: 2026 });
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.rejections[0].code, 'IND-031-04');
  assert.match(rejected.rejections[0].fix, /AGI/);

  applyPartnerEvent(state, { externalId: ext, status: 'submitted' });
  applyPartnerEvent(state, { externalId: ext, status: 'accepted', at: '2027-02-03T09:00:00Z' });
  const accepted = usEfileStatus(state, { taxYear: 2026 });
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.attempts, 2);
  assert.equal(applyPartnerEvent(state, { externalId: ext, status: 'rejected' }).changed, false, 'nothing moves an accepted return back');
});

test('events for another return or with an unknown status are refused', async () => {
  process.env.MYCA_US_FILER = 'april';
  const state = usState();
  await fileUsReturn(state, { taxYear: 2026, partnerScope: SCOPE }, { userId: 'u1' }, { computedReturn });
  assert.equal(applyPartnerEvent(state, { externalId: externalIdFor(SCOPE, 2026, 'c'.repeat(24)), status: 'accepted' }).error, 'FILER_EVENT_UNKNOWN_RETURN');
  assert.equal(applyPartnerEvent(state, { externalId: externalIdFor(SCOPE, 2025, state.usEfile.returns['2026'].partner.ref), status: 'accepted' }).error, 'FILER_EVENT_UNKNOWN_RETURN');
  assert.equal(applyPartnerEvent(state, { externalId: state.usEfile.returns['2026'].partner.externalId, status: null }).error, 'FILER_EVENT_STATUS_UNKNOWN');
});

test('a partner that fails or answers without a link leaves the return unfiled', async () => {
  usePartner({ MYCA_PROVIDER_ENV: 'test' });
  const state = usState();
  const bad = await fileUsReturn(state, { taxYear: 2026, partnerScope: SCOPE }, { userId: 'u1' }, { computedReturn, fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }) });
  assert.equal(bad.error, 'FILER_SESSION_FAILED');
  const noLink = await fileUsReturn(state, { taxYear: 2026, partnerScope: SCOPE }, { userId: 'u1' }, { computedReturn, fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ id: 'x' }) }) });
  assert.equal(noLink.error, 'FILER_SESSION_NO_URL');
  assert.equal(usEfileStatus(state, { taxYear: 2026 }).status, 'not_filed');
});

test('with live calls off the session request is held as a dry run', async () => {
  usePartner();
  const state = usState();
  const out = await fileUsReturn(state, { taxYear: 2026, partnerScope: SCOPE }, { userId: 'u1' }, { computedReturn, fetchImpl: async () => { throw new Error('must not call'); } });
  assert.equal(out.ok, false);
  assert.equal(out.route, 'partner');
});

test('the preview on the partner route needs no signature and says what is passed on', () => {
  process.env.MYCA_US_FILER = 'column-tax';
  const preview = filePreview(usState(), { taxYear: 2026 });
  assert.deepEqual(preview.blockers, []);
  assert.match(preview.summary, /Column Tax/);
  assert.ok(preview.effects.some((line) => /SSN once more/.test(line)));
  assert.equal(ACTION_CLASSES.us_filer_session.actionClass, 'read');
});
