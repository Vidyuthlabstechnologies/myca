import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-us-efile-'));
process.env.HOME = process.env.APPDATA;
process.env.MYCA_MOCK_MODE = '0';
process.env.MYCA_ENABLE_LIVE_CALLS = '0';
delete process.env.MYCA_PROVIDER_ENV;
for (const key of ['MYCA_IRS_ETIN', 'MYCA_IRS_EFIN', 'MYCA_IRS_SOFTWARE_ID', 'MYCA_IRS_APP_SYS_ID', 'MYCA_IRS_CERT_PATH', 'MYCA_IRS_KEY_PATH']) delete process.env[key];

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { propose } from '../src/router.mjs';
import { buildMefSubmission, makeSubmissionId, nameControl, routingNumberValid, returnDigest } from '../src/us-mef-xml.mjs';
import { storeZip, readStoreZip, transmissionZip } from '../src/us-mef-zip.mjs';
import { simulateAcknowledgement, SANDBOX_TRIGGERS } from '../src/us-mef-sim.mjs';
import { parseAcknowledgements, mefHeader, IrsMefClient } from '../src/us-mef-client.mjs';
import { performExternalAction, ACTION_CLASSES } from '../src/action-gate.mjs';
import { signUsReturn, fileUsReturn, usEfileStatus, fetchUsEfileAcks, openPendingArgs, rejectionsOf, efileMode } from '../src/us-efile.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';

globalThis.fetch = async (url) => {
  throw new Error(`NETWORK_FORBIDDEN_IN_TESTS ${url}`);
};

function computed1040(overrides = {}) {
  return {
    taxYear: 2025,
    filingStatus: 'mfj',
    taxpayer: { firstName: 'Maya', lastName: "O'Neil", ssn: '400011234', dob: '1988-04-02', occupation: 'Baker' },
    spouse: { firstName: 'Ravi', lastName: "O'Neil", ssn: '400025678', dob: '1987-09-12', occupation: 'Engineer' },
    address: { line1: '12 Elm St', city: 'Austin', state: 'TX', zip: '78701' },
    dependents: [{ firstName: 'Asha', lastName: "O'Neil", ssn: '400039012', relationship: 'daughter', ctcEligible: true }],
    lines: { '1a': 85000, '1z': 85000, '9': 85000, '11': 85000, '12': 31500, '14': 31500, '15': 53500, '16': 5916, '19': 2200, '21': 2200, '22': 3716, '24': 3716, '25a': 6200, '25d': 6200, '33': 6200, '34': 2484, '35a': 2484 },
    schedules: {},
    w2s: [{ ein: '123456789', employerName: 'Hill Country Foods', wages: 85000, fedWithheld: 6200 }],
    ...overrides,
  };
}

const SIGNATURE = { taxpayer: { pin: '12345', priorYearAgi: 80000 }, spouse: { pin: '54321', priorYearAgi: 80000 }, date: '2026-02-10' };
const REFUND = { method: 'direct_deposit', routing: '021000021', account: '000123456789', accountType: 'checking' };

function usState() {
  const state = createState();
  state.company = { ...state.company, name: "O'Neil household", country: 'US', state: 'TX', gstin: '' };
  return state;
}

function signArgs(extra = {}) {
  return { taxYear: 2025, taxpayerPin: '12345', spousePin: '54321', priorYear: { taxpayer: { agi: 80000 }, spouse: { agi: 80000 } }, consent8879: true, refund: REFUND, ...extra };
}

test('routing numbers are checked with the ABA checksum and prefix', () => {
  assert.equal(routingNumberValid('021000021'), true);
  assert.equal(routingNumberValid('011000015'), true);
  assert.equal(routingNumberValid('021000022'), false);
  assert.equal(routingNumberValid('991000021'), false);
  assert.equal(routingNumberValid('12345'), false);
});

test('name controls and submission ids follow the MeF shapes', () => {
  assert.equal(nameControl("O'Neil"), 'ONEI');
  assert.equal(nameControl('De La Rosa'), 'DELA');
  assert.equal(nameControl('Ng'), 'NG');
  const id = makeSubmissionId('123456', '2026-02-10', 42);
  assert.equal(id, '12345620260410000016');
  assert.match(id, /^\d{13}[a-z0-9]{7}$/);
  assert.equal(makeSubmissionId('12345', '2026-02-10', 1), '');
});

test('a complete joint return builds a MeF submission with header, 1040, W-2 and direct deposit', () => {
  const built = buildMefSubmission({ ...computed1040(), refund: REFUND }, { efin: '123456', softwareId: '12345678', submissionId: makeSubmissionId('123456', '2026-02-10', 1), timestamp: '2026-02-10T15:00:00+00:00', signature: SIGNATURE });
  assert.equal(built.ok, true, JSON.stringify(built.problems));
  const { xml, manifest } = built;
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?><Return xmlns="http:\/\/www.irs.gov\/efile" returnVersion="2025v/);
  for (const piece of ['<TaxYr>2025</TaxYr>', '<ReturnTypeCd>1040</ReturnTypeCd>', '<PrimarySSN>400011234</PrimarySSN>', '<SpouseSSN>400025678</SpouseSSN>', '<PrimaryNameControlTxt>ONEI</PrimaryNameControlTxt>', '<NameLine1Txt>MAYA &amp; RAVI O&#39;NEIL</NameLine1Txt>', '<PrimarySignaturePIN>12345</PrimarySignaturePIN>', '<SpouseSignaturePIN>54321</SpouseSignaturePIN>', '<PrimaryPriorYearAGIAmt>80000</PrimaryPriorYearAGIAmt>', '<IndividualReturnFilingStatusCd>2</IndividualReturnFilingStatusCd>', '<WagesAmt>85000</WagesAmt>', '<AdjustedGrossIncomeAmt>85000</AdjustedGrossIncomeAmt>', '<RefundAmt>2484</RefundAmt><RoutingTransitNum>021000021</RoutingTransitNum><BankAccountTypeCd>1</BankAccountTypeCd><DepositorAccountNum>000123456789</DepositorAccountNum>', '<DependentSSN>400039012</DependentSSN>', '<DependentRelationshipCd>DAUGHTER</DependentRelationshipCd>', '<EligibleForChildTaxCreditInd>X</EligibleForChildTaxCreditInd>', '<EmployerEIN>123456789</EmployerEIN>', '<EmployerNameControlTxt>HILL</EmployerNameControlTxt>', '<ReturnData documentCnt="2">']) {
    assert.ok(xml.includes(piece), piece);
  }
  assert.ok(xml.indexOf('<OverpaidAmt>') < xml.indexOf('<RefundAmt>'));
  assert.ok(manifest.includes('<FederalSubmissionTypeCd>1040</FederalSubmissionTypeCd>'));
  assert.ok(manifest.includes(`<SubmissionId>${built.submissionId}</SubmissionId>`));
  assert.equal(built.returnHash, returnDigest(computed1040()));
});

test('an incomplete return lists every problem with the screen that fixes it and builds nothing', () => {
  const bad = computed1040({ taxpayer: { firstName: 'Maya', lastName: 'Smith', ssn: '000112222' }, address: { line1: '', city: 'Austin', state: 'Texas', zip: '787' }, lines: { '1a': 85000.4, '99': 5 }, schedules: { K1: {} } });
  const built = buildMefSubmission({ ...bad, refund: { ...REFUND, routing: '021000022' } }, { efin: '123456', softwareId: '12345678', submissionId: makeSubmissionId('123456', '2026-02-10', 1), timestamp: 'x', signature: { taxpayer: { pin: '00000' }, date: '2026-02-10' } });
  assert.equal(built.ok, false);
  assert.equal(built.xml, undefined);
  const codes = built.problems.map((p) => `${p.code}:${p.step}`);
  for (const expected of ['SSN_INVALID:profile', 'ADDRESS_INVALID:profile', 'NOT_WHOLE_DOLLARS:review', 'UNMAPPED_LINE:review', 'UNSUPPORTED_SCHEDULE:forms', 'SIGNATURE_PIN_MISSING:sign']) {
    assert.ok(codes.includes(expected), `${expected} in ${codes.join(', ')}`);
  }
  for (const p of built.problems) assert.ok(p.message && p.fix, p.code);
});

test('Schedule C and SE lines map to their MeF documents', () => {
  const withC = computed1040({ filingStatus: 'single', spouse: null, dependents: [], schedules: { C: [{ businessName: 'Luna Bakery', activityCode: '311810', lines: { '1': 40000, '28': 12000, '31': 28000 } }], SE: [{ owner: 'taxpayer', lines: { '2': 28000, '12': 3956, '13': 1978 } }], '1': { '3': 28000, '15': 1978, '26': 1978 }, '2': { '4': 3956, '21': 3956 } } });
  const built = buildMefSubmission(withC, { efin: '123456', softwareId: '12345678', submissionId: makeSubmissionId('123456', '2026-02-10', 1), timestamp: 't', signature: { taxpayer: { pin: '12345', priorYearPin: '11111' }, date: '2026-02-10' } });
  assert.equal(built.ok, true, JSON.stringify(built.problems));
  assert.ok(built.xml.includes('<IRS1040ScheduleC documentId="IRS1040ScheduleC-1"><BusinessNameLine1Txt>Luna Bakery</BusinessNameLine1Txt><PrincipalBusinessActivityCd>311810</PrincipalBusinessActivityCd><TotalGrossReceiptsAmt>40000</TotalGrossReceiptsAmt>'));
  assert.ok(built.xml.includes('<SelfEmploymentTaxAmt>3956</SelfEmploymentTaxAmt>'));
  assert.ok(built.xml.includes('<DeductibleSelfEmploymentTaxAmt>1978</DeductibleSelfEmploymentTaxAmt>'));
  assert.ok(built.xml.includes('<PrimaryPriorYearPIN>11111</PrimaryPriorYearPIN>'));
  assert.ok(!built.xml.includes('SpouseSSN'));
});

test('the transmission zip holds one zip per submission with the manifest and the return', () => {
  const zip = storeZip([{ name: 'a.txt', data: 'hello' }, { name: 'b/c.xml', data: '<x/>' }]);
  assert.deepEqual(readStoreZip(zip).map((e) => [e.name, e.data.toString()]), [['a.txt', 'hello'], ['b/c.xml', '<x/>']]);
  const outer = transmissionZip([{ submissionId: 'S1', manifest: '<m/>', xml: '<r/>' }]);
  const [inner] = readStoreZip(outer);
  assert.equal(inner.name, 'S1.zip');
  assert.deepEqual(readStoreZip(inner.data).map((e) => e.name), ['manifest/manifest.xml', 'xml/submission.xml']);
});

test('sandbox: sign, file, then the status shows the acceptance', async () => {
  const state = usState();
  const computedReturn = async () => ({ ok: true, data: computed1040() });
  assert.equal(efileMode(), 'sandbox');
  assert.equal(usEfileStatus(state, { taxYear: 2025 }).status, 'not_filed');
  const filedEarly = await fileUsReturn(state, { taxYear: 2025 }, null, { computedReturn });
  assert.equal(filedEarly.error, 'NOT_SIGNED');
  const signed = await signUsReturn(state, signArgs(), null, { computedReturn });
  assert.equal(signed.ok, true, JSON.stringify(signed));
  assert.equal(signed.signed.account, '****6789');
  assert.equal(signed.signed.refund, 2484);
  assert.ok(!JSON.stringify(state.usEfile).includes('000123456789'), 'account sealed');
  assert.ok(!JSON.stringify(state.usEfile).includes('54321'), 'PIN sealed');
  assert.equal(usEfileStatus(state, { taxYear: 2025 }).status, 'signed');
  const filed = await fileUsReturn(state, { taxYear: 2025 }, null, { computedReturn, now: '2026-02-10T15:00:00.000Z' });
  assert.equal(filed.status, 'submitted');
  assert.equal(filed.mode, 'sandbox');
  assert.match(filed.submissionId, /^0000002026041[a-z0-9]{7}$/);
  const status = usEfileStatus(state, { taxYear: 2025 });
  assert.equal(status.status, 'accepted');
  assert.equal(status.submissionId, filed.submissionId);
  assert.equal(status.acceptedAt, '2026-02-10T15:00:00.000Z');
  assert.deepEqual(status.rejections, []);
  assert.equal((await fileUsReturn(state, { taxYear: 2025 }, null, { computedReturn })).error, 'ALREADY_ACCEPTED');
  assert.equal((await signUsReturn(state, signArgs(), null, { computedReturn })).error, 'ALREADY_ACCEPTED');
  assert.ok(state.auditEvents.some((e) => e.action === 'us_efile.submit'));
  assert.ok(!JSON.stringify({ e: state.usEfile, a: state.auditEvents, d: state.dryRuns || [] }).includes('400011234'), 'no SSN kept in the books');
});

test('sandbox: a prior-year AGI mismatch is rejected with the fix and the sign screen; re-signing and refiling clears it', async () => {
  const state = usState();
  const computedReturn = async () => ({ ok: true, data: computed1040() });
  await signUsReturn(state, signArgs({ priorYear: { taxpayer: { agi: SANDBOX_TRIGGERS.priorYearAgiMismatch }, spouse: { agi: 80000 } } }), null, { computedReturn });
  await fileUsReturn(state, { taxYear: 2025 }, null, { computedReturn });
  const rejected = usEfileStatus(state, { taxYear: 2025 });
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.rejections[0].code, 'IND-031-04');
  assert.equal(rejected.rejections[0].step, 'sign');
  assert.match(rejected.rejections[0].fix, /prior-year AGI/);
  const resigned = await signUsReturn(state, signArgs(), null, { computedReturn });
  assert.equal(resigned.ok, true);
  await fileUsReturn(state, { taxYear: 2025 }, null, { computedReturn });
  const accepted = usEfileStatus(state, { taxYear: 2025 });
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.attempts, 2);
});

test('the simulator raises the IP PIN, name, duplicate dependent and duplicate return rejections', () => {
  const sub = (computed, signature = SIGNATURE) => buildMefSubmission(computed, { efin: '123456', softwareId: '12345678', submissionId: makeSubmissionId('123456', '2026-02-10', 1), timestamp: 't', signature });
  const ipPin = sub(computed1040({ taxpayer: { ...computed1040().taxpayer, ssn: '400010909' } }));
  assert.deepEqual(simulateAcknowledgement(ipPin).errors.map((e) => e.ruleNumber), ['IND-181-01']);
  const named = sub(computed1040({ taxpayer: { ...computed1040().taxpayer, lastName: 'Zzmismatch' }, filingStatus: 'single', spouse: null }), { taxpayer: { pin: '12345', priorYearAgi: 1 }, date: '2026-02-10' });
  assert.deepEqual(simulateAcknowledgement(named).errors.map((e) => e.ruleNumber), ['R0000-500-01']);
  const dup = sub(computed1040({ dependents: [{ firstName: 'Duplicate', lastName: 'Kid', ssn: '400049999', relationship: 'son' }] }));
  assert.deepEqual(simulateAcknowledgement(dup).errors.map((e) => e.ruleNumber), ['IND-507-01']);
  const again = sub(computed1040());
  assert.deepEqual(simulateAcknowledgement(again, { acceptedSsns: new Set(['400011234']) }).errors.map((e) => e.ruleNumber), ['R0000-902-01']);
  assert.deepEqual(rejectionsOf([{ ruleNumber: 'X-1', message: 'm' }]), [{ code: 'X-1', message: 'm', fix: rejectionsOf([{ ruleNumber: 'X-1', message: 'm' }])[0].fix, step: 'review' }]);
});

test('a return that changed after signing is refused until it is signed again', async () => {
  const state = usState();
  let wages = 85000;
  const computedReturn = async () => ({ ok: true, data: computed1040({ lines: { ...computed1040().lines, '1a': wages } }) });
  await signUsReturn(state, signArgs(), null, { computedReturn });
  wages = 86000;
  const out = await fileUsReturn(state, { taxYear: 2025 }, null, { computedReturn });
  assert.equal(out.error, 'RETURN_CHANGED_SINCE_SIGNING');
  assert.equal(out.step, 'sign');
});

test('signing refuses a bad PIN, missing prior-year AGI, missing consent, and a bad routing number', async () => {
  const state = usState();
  const computedReturn = async () => ({ ok: true, data: computed1040() });
  assert.equal((await signUsReturn(state, signArgs({ consent8879: false }), null, { computedReturn })).error, 'CONSENT_REQUIRED');
  const bad = await signUsReturn(state, signArgs({ taxpayerPin: '00000', priorYear: {}, refund: { ...REFUND, routing: '021000022' } }), null, { computedReturn });
  assert.equal(bad.error, 'SIGNATURE_INVALID');
  assert.deepEqual(bad.problems.map((p) => p.code).sort(), ['PRIOR_YEAR_VERIFICATION_MISSING', 'PRIOR_YEAR_VERIFICATION_MISSING', 'ROUTING_INVALID', 'SIGNATURE_PIN_INVALID']);
  assert.equal(usEfileStatus(state, { taxYear: 2025 }).status, 'not_filed');
  const owed = async () => ({ ok: true, data: computed1040({ lines: { ...computed1040().lines, '34': 0, '35a': 0, '37': 500 } }) });
  const noPayment = await signUsReturn(state, signArgs({ refund: undefined }), null, { computedReturn: owed });
  assert.deepEqual(noPayment.problems.map((p) => p.code), ['PAYMENT_METHOD_MISSING']);
  const later = await signUsReturn(state, signArgs({ refund: undefined, payment: { method: 'later' } }), null, { computedReturn: owed });
  assert.equal(later.ok, true);
});

test('without the 1040 engine the tools say so instead of filing', async () => {
  const state = usState();
  const out = await runTool(state, 'sign_us_return', signArgs());
  if (out.ok === false) assert.ok(['US_RETURN_ENGINE_MISSING', 'RETURN_NOT_COMPUTED', 'RETURN_YEAR_MISMATCH'].includes(out.error), out.error);
  const status = await runTool(state, 'us_efile_status', { taxYear: 2025 });
  assert.equal(status.ok, true);
  assert.equal(status.data.mode, 'sandbox');
  const setup = await runTool(state, 'us_efile_setup', {});
  assert.equal(setup.data.configured, false);
  assert.ok(setup.data.missing.includes('MYCA_IRS_EFIN'));
  const india = createState();
  assert.equal((await runTool(india, 'us_efile_status', { taxYear: 2025 })).error, 'NOT_FOR_COUNTRY');
});

test('the phone proposes signing with sealed PINs and bank details; confirming opens them again', () => {
  const state = usState();
  const out = propose(state, 'sign_us_return', signArgs());
  assert.equal(out.awaitingConfirmation, true, JSON.stringify(out));
  const held = JSON.stringify(state.pendingChatAction);
  assert.ok(!held.includes('54321') && !held.includes('000123456789'), 'pending args are sealed');
  const opened = openPendingArgs('sign_us_return', state.pendingChatAction.args);
  assert.equal(opened.spousePin, '54321');
  assert.equal(validateAssistantToolCall('sign_us_return', opened).ok, true);
  assert.equal(propose(usState(), 'file_us_return', { taxYear: 2025 }).blocked, true);
  assert.equal(isRemoteQuery('us_efile_status'), true);
  assert.equal(isRemoteQuery('file_us_return'), false);
});

test('the IRS actions go through the gate: dry run when off, approval needed when live', async () => {
  assert.equal(ACTION_CLASSES.irs_mef_send.actionClass, 'write');
  assert.equal(ACTION_CLASSES.irs_mef_send.irreversible, true);
  const state = usState();
  const calls = [];
  const off = await performExternalAction(state, { actionId: 'irs_mef_send', params: { submissionId: 'S' }, actor: { userId: 'owner' } }, async () => { calls.push(1); return { ok: true }; });
  assert.equal(off.error, 'LIVE_CALLS_DISABLED');
  process.env.MYCA_PROVIDER_ENV = 'live';
  try {
    const live = await performExternalAction(state, { actionId: 'irs_mef_send', params: { submissionId: 'S' }, actor: { userId: 'owner' } }, async () => { calls.push(1); return { ok: true }; });
    assert.equal(live.error, 'APPROVAL_REQUIRED');
    assert.equal(efileMode(), 'sandbox', 'live switch alone is not live filing without IRS credentials');
  } finally {
    delete process.env.MYCA_PROVIDER_ENV;
  }
  assert.deepEqual(calls, []);
  assert.deepEqual(await fetchUsEfileAcks(state), { ok: true, checked: 0, updated: [] });
});

test('MeF client: unconfigured refuses before any network, header and acknowledgement parsing', async () => {
  const client = new IrsMefClient({ settings: { etin: '', efin: '', softwareId: '', appSysId: '', certPresent: false, keyPresent: false, baseUrl: 'https://example.invalid' } });
  const out = await client.sendSubmissions({ zip: Buffer.from(''), submissionIds: ['S'] });
  assert.equal(out.error, 'IRS_MEF_NOT_CONFIGURED');
  assert.ok(out.missing.includes('MYCA_IRS_ETIN'));
  const header = mefHeader({ etin: '12345', appSysId: 'APP1', action: 'SendSubmissions', messageId: 'M1', timestamp: '2026-01-01T00:00:00Z', testIndicator: true });
  assert.ok(header.includes('<TestCd>T</TestCd>') && header.includes('<ETIN>12345</ETIN>'));
  const acks = parseAcknowledgements('<x:AcknowledgementList><x:Acknowledgement><x:SubmissionId>S1</x:SubmissionId><x:AcceptanceStatusTxt>Rejected</x:AcceptanceStatusTxt><x:StatusDt>2026-02-11</x:StatusDt><x:ValidationErrorGrp><x:RuleNum>IND-031-04</x:RuleNum><x:SeverityCd>Reject and Stop</x:SeverityCd><x:ErrorMessageTxt>AGI</x:ErrorMessageTxt></x:ValidationErrorGrp></x:Acknowledgement></x:AcknowledgementList>');
  assert.deepEqual(acks, [{ submissionId: 'S1', status: 'Rejected', statusDate: '2026-02-11', taxYear: null, errors: [{ ruleNumber: 'IND-031-04', severity: 'Reject and Stop', message: 'AGI', xpath: '' }] }]);
});
