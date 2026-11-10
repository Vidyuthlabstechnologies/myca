import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers.mjs';

const KEY = 'connector-key-for-tests-0123456789abcdef0123456789';
const JOB = 'job-token-for-gst-tests-0123456789';
const GSTIN = '27AABCU9603R1ZN';
const HOUR = 3600 * 1000;
const seen = [];
let api;
let owner;
let accountant;
let issued = 0;

function reply(data, status = 200) {
  return new Response(JSON.stringify({ code: 200, data, timestamp: Date.now(), transaction_id: 'tx' }), { status });
}

function refused(code, message) {
  return reply({ status_cd: '0', error: { error_cd: code, message } });
}

async function fakeSandbox(url, init = {}) {
  const at = new URL(String(url));
  const path = at.pathname;
  const method = init.method || 'GET';
  const auth = init.headers?.authorization || '';
  const body = init.body ? JSON.parse(init.body) : null;
  seen.push({ host: at.host, method, path, query: Object.fromEntries(at.searchParams), auth, body });
  if (path === '/authenticate') return new Response(JSON.stringify({ code: 200, data: { access_token: 'PLATFORM-TOKEN' } }), { status: 200 });
  if (auth === 'PLATFORM-TOKEN' && path === '/gst/compliance/tax-payer/otp') return reply({ status_cd: '1' });
  if (auth === 'PLATFORM-TOKEN' && path === '/gst/compliance/tax-payer/otp/verify') {
    if (at.searchParams.get('otp') !== '111111') return refused('AUTH4033', 'Invalid Session');
    issued += 1;
    return reply({ status_cd: '1', access_token: `TAXPAYER-${issued}`, token_expiry: api.clock.now + 6 * HOUR, session_expiry: api.clock.now + 6 * HOUR });
  }
  if (auth === 'PLATFORM-TOKEN' && path === '/tds/compliance/fvu/generate') return reply({ job_id: 'FVU-JOB-1', status: 'created', tan: body?.tan });
  if (!auth.startsWith('TAXPAYER-')) return new Response(JSON.stringify({ code: 401, message: 'wrong token' }), { status: 401 });
  if (path === '/gst/compliance/tax-payer/session/refresh') {
    issued += 1;
    return reply({ status_cd: '1', access_token: `TAXPAYER-${issued}`, token_expiry: api.clock.now + 6 * HOUR });
  }
  const gstr1 = path.match(/^\/gst\/compliance\/tax-payer\/gstrs\/gstr-1\/(\d{4})\/(\d{1,2})(\/file)?$/);
  if (gstr1 && method === 'POST' && !gstr1[3]) return reply({ status_cd: '1', data: { reference_id: 'REF-SAVE-1' } });
  if (gstr1 && method === 'GET') return reply({ status_cd: '1', data: { chksum: 'CHK-ALL', newSumFlag: true, sec_sum: [{ sec_nm: 'B2B', ttl_rec: 1, ttl_val: 1050, ttl_tax: 50, ttl_igst: 0, ttl_cgst: 25, ttl_sgst: 25, ttl_cess: 0, chksum: 'CHK-B2B' }] } });
  if (gstr1 && gstr1[3]) return reply({ status_cd: '1', data: { ack_num: 'AA2711260012345' } });
  if (/\/gstrs\/\d{4}\/\d{1,2}\/status$/.test(path)) return reply({ status_cd: '1', data: { action: 'SAVE', form_typ: 'R1', status_cd: 'P' } });
  if (/\/gstrs\/gstr-1\/\d{4}\/\d{1,2}\/new-proceed$/.test(path)) return reply({ status_cd: '1', data: { reference_id: 'REF-PROCEED-1' } });
  const gstr3b = path.match(/^\/gst\/compliance\/tax-payer\/gstrs\/gstr-3b\/(\d{4})\/(\d{1,2})(\/[a-z-]+)?$/);
  if (gstr3b && !gstr3b[3] && method === 'POST') return reply({ status_cd: '1', data: { reference_id: 'REF-3B-1' } });
  if (gstr3b && gstr3b[3] === '/auto-liability-calc') return reply({ status_cd: '1', data: { tx_pmt: { tx_py: [{ trans_typ: 30002, liab_ldg_id: 4417 }] } } });
  if (gstr3b && gstr3b[3] === '/offset-liability') return reply({ status_cd: '1', data: { Message: 'Payment of tax successfully done' } });
  if (gstr3b && gstr3b[3] === '/file') return reply({ status_cd: '1', data: { ack_num: 'AB2711260098765' } });
  if (path === '/gst/compliance/tax-payer/evc/otp') return reply({ status_cd: '1' });
  return new Response(JSON.stringify({ code: 404, message: 'no route' }), { status: 404 });
}

const saved = {};
before(async () => {
  for (const [name, value] of Object.entries({ MYCA_PROVIDER_ENV: 'test', MYCA_MOCK_MODE: '0', MYCA_GSP_API_KEY: 'key_test_service', MYCA_GSP_API_SECRET: 'secret_test_service', MYCA_GSP_ENV: 'test' })) {
    saved[name] = process.env[name];
    process.env[name] = value;
  }
  api = await startApi({ connectorKey: KEY, jobToken: JOB, gspFetch: fakeSandbox });
  owner = await api.ownerWithBusiness('+919400000081', { name: 'Nalanda Textiles', gstin: GSTIN, state: '27' });
  const invited = await api.call('POST', `/v1/businesses/${owner.businessId}/invitations`, { token: owner.token, body: { phone: '+919400000082', role: 'accountant' } });
  assert.equal(invited.status, 200, invited.text);
  const ravi = await api.signIn('+919400000082');
  const accepted = await api.call('POST', `/v1/invitations/${invited.body.invitation.id}/accept`, { token: ravi.accessToken });
  assert.equal(accepted.status, 200, accepted.text);
  accountant = { token: ravi.accessToken, businessId: owner.businessId };
});
after(async () => {
  await api.close();
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

const post = (who, action, body) => api.call('POST', `/v1/businesses/${who.businessId}/${action}`, { token: who.token, body });
const get = (who, action) => api.call('GET', `/v1/businesses/${who.businessId}/${action}`, { token: who.token });

function thisMonth() {
  const d = new Date(api.clock.now + 5.5 * HOUR);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function confirmTool(name, args) {
  const held = await post(owner, 'propose', { name, args });
  assert.equal(held.status, 200, held.text);
  assert.ok(held.body.preview?.token, held.text);
  const done = await post(owner, 'confirm', { token: held.body.preview.token });
  assert.equal(done.status, 200, done.text);
  return done.body;
}

async function approveReview(period) {
  const review = await post(owner, 'query', { name: 'gst_review', args: { period } });
  assert.equal(review.status, 200, review.text);
  const data = review.body.data || review.body;
  for (const step of data.steps) {
    await confirmTool('gst_review_answer', { period, step: step.id, answer: step.id === 'approve' ? 'approve' : 'correct', draftHash: data.draftHash });
  }
}

test('a business connects the GST portal once with an OTP, the token is sealed, and every GST call uses the service key on the test host', async () => {
  const before = await get(owner, 'gst-portal');
  assert.equal(before.status, 200, before.text);
  assert.equal(before.body.available, true, before.text);
  assert.equal(before.body.mode, 'test');
  assert.equal(before.body.keys, 'service');
  assert.deepEqual(before.body.sessions, []);

  const early = await post(owner, 'gst-portal', { step: 'verify', gstin: GSTIN, otp: '111111' });
  assert.equal(early.body.error, 'OTP_NOT_REQUESTED', early.text);
  const foreign = await post(owner, 'gst-portal', { step: 'otp', gstin: '29AAACH7409R1ZX', username: 'nalanda.tex' });
  assert.equal(foreign.body.error, 'UNKNOWN_REGISTRATION', foreign.text);

  const sent = await post(owner, 'gst-portal', { step: 'otp', gstin: GSTIN, username: 'nalanda.tex' });
  assert.equal(sent.status, 200, sent.text);
  assert.equal(sent.body.otpSent, true, sent.text);
  const wrong = await post(owner, 'gst-portal', { step: 'verify', gstin: GSTIN, otp: '999999' });
  assert.equal(wrong.body.ok, false, wrong.text);
  assert.equal(wrong.body.error, 'AUTH4033');

  const verified = await post(owner, 'gst-portal', { step: 'verify', gstin: GSTIN, otp: '111111' });
  assert.equal(verified.body.ok, true, verified.text);
  assert.equal(verified.body.connected, true);
  const row = (await api.db.query('select token from gst_portal_sessions where business_id = $1', [owner.businessId])).rows[0];
  assert.ok(row.token.length > 20);
  assert.doesNotMatch(row.token, /TAXPAYER/, 'the portal token is stored sealed');

  const status = await get(owner, 'gst-portal');
  assert.equal(status.body.sessions[0].connected, true, status.text);
  assert.equal(status.body.sessions[0].username, 'nalanda.tex');
  assert.ok(seen.every((call) => call.host === 'test-api.sandbox.co.in'), JSON.stringify(seen.map((c) => c.host)));
  assert.equal(seen.filter((call) => call.path === '/authenticate').length, 1, 'the Sandbox sign-in is reused across requests');
  const trail = await api.db.query("select action from audit_log where business_id = $1 and action like 'gst_portal.%' order by id", [owner.businessId]);
  assert.deepEqual(trail.rows.map((r) => r.action), ['gst_portal.otp_sent', 'gst_portal.connected']);
});

test('GSTR-1 goes save, check, submit, summary, EVC OTP and file with the portal summary, and the filing is recorded with its ARN', async () => {
  const period = thisMonth();
  await confirmTool('create_invoice', { partyName: 'Retail Mart', partyGstin: '27AAACH7409R1Z1', lines: [{ description: 'Fabric', hsn: '5208', qty: 1, rate: 1000, gstRate: 5 }] });

  const early = await post(owner, 'gst-gstr1', { step: 'submit', period });
  assert.equal(early.body.error, 'NOT_SAVED', early.text);

  seen.length = 0;
  const savedReturn = await post(owner, 'gst-gstr1', { step: 'save', period });
  assert.equal(savedReturn.body.ok, true, savedReturn.text);
  assert.equal(savedReturn.body.save.referenceId, 'REF-SAVE-1');
  const saveCall = seen.find((call) => call.method === 'POST' && /gstr-1\/\d{4}\/\d{1,2}$/.test(call.path));
  assert.equal(saveCall.auth, 'TAXPAYER-1', 'taxpayer calls carry the business\'s own portal session');
  assert.equal(saveCall.body.b2b[0].ctin, '27AAACH7409R1Z1');

  const checked = await post(owner, 'gst-gstr1', { step: 'check', period });
  assert.equal(checked.body.processing, 'processed', checked.text);
  const submitted = await post(owner, 'gst-gstr1', { step: 'submit', period });
  assert.equal(submitted.body.ok, true, submitted.text);
  const summary = await post(owner, 'gst-gstr1', { step: 'summary', period });
  assert.deepEqual(summary.body.sections.map((s) => [s.section, s.records, s.tax]), [['B2B', 1, 50]], summary.text);
  const badPan = await post(owner, 'gst-gstr1', { step: 'otp', period, pan: 'nope' });
  assert.equal(badPan.body.error, 'PAN_REQUIRED', badPan.text);
  const otp = await post(accountant, 'gst-gstr1', { step: 'otp', period, pan: 'AABCU9603R' });
  assert.equal(otp.body.sent, true, otp.text);

  const unreviewed = await post(owner, 'gst-gstr1', { step: 'file', period, otp: '222222', pan: 'AABCU9603R' });
  assert.equal(unreviewed.body.error, 'REVIEW_NOT_APPROVED', unreviewed.text);
  await approveReview(period);
  seen.length = 0;
  const filed = await post(owner, 'gst-gstr1', { step: 'file', period, otp: '222222', pan: 'AABCU9603R' });
  assert.equal(filed.body.ok, true, filed.text);
  assert.equal(filed.body.ackNum, 'AA2711260012345');
  assert.ok(filed.body.filing, filed.text);
  const fileCall = seen.find((call) => call.path.endsWith('/file'));
  assert.equal(fileCall.query.otp, '222222');
  assert.equal(fileCall.body.chksum, 'CHK-ALL', 'the file call carries the portal summary, not a guess');
  const books = await api.books(owner.businessId);
  assert.ok(books.filings.some((f) => f.returnType === 'GSTR-1' && f.arn === 'AA2711260012345'));
  const filings = await get(owner, 'gst-filings');
  assert.equal(filings.body.data.gstr1[0].filedAck, 'AA2711260012345', filings.text);
});

test('GSTR-3B goes save, liability, set-off with the portal ledger id, EVC OTP and file, and the TDS FVU job runs on the hosted server', async () => {
  const period = thisMonth();
  const early = await post(owner, 'gst-gstr3b', { step: 'offset', period });
  assert.equal(early.body.error, 'NOT_SAVED', early.text);
  seen.length = 0;
  const savedReturn = await post(owner, 'gst-gstr3b', { step: 'save', period });
  assert.equal(savedReturn.body.ok, true, savedReturn.text);
  const saveCall = seen.find((call) => call.method === 'POST' && /gstr-3b\/\d{4}\/\d{1,2}$/.test(call.path));
  assert.equal(saveCall.auth, 'TAXPAYER-1');
  assert.equal(saveCall.body.gstin, GSTIN);
  assert.equal(saveCall.body.sup_details.osup_det.camt, 25, JSON.stringify(saveCall.body));
  const liability = await post(owner, 'gst-gstr3b', { step: 'liability', period });
  assert.equal(liability.body.ok, true, liability.text);
  await approveReview(period);
  seen.length = 0;
  const paid = await post(owner, 'gst-gstr3b', { step: 'offset', period });
  assert.equal(paid.body.ok, true, paid.text);
  const offsetCall = seen.find((call) => call.path.endsWith('/offset-liability'));
  assert.equal(offsetCall.body.pdcash[0].liab_ldg_id, 4417, 'the ledger id the portal gave is sent back');
  assert.equal(offsetCall.body.pdcash[0].cpd, 25);
  const otp = await post(owner, 'gst-gstr3b', { step: 'otp', period, pan: 'AABCU9603R' });
  assert.equal(otp.body.sent, true, otp.text);
  assert.equal(seen.find((call) => call.path === '/gst/compliance/tax-payer/evc/otp').query.gstr, 'gstr-3b');
  const filed = await post(owner, 'gst-gstr3b', { step: 'file', period, otp: '333333', pan: 'AABCU9603R' });
  assert.equal(filed.body.ok, true, filed.text);
  assert.equal(filed.body.ackNum, 'AB2711260098765');
  const books = await api.books(owner.businessId);
  assert.ok(books.filings.some((f) => f.returnType === 'GSTR-3B' && f.arn === 'AB2711260098765'), JSON.stringify(books.filings));
  const unknown = await post(owner, 'gst-gstr3b', { step: 'guess', period });
  assert.deepEqual(unknown.body.steps, ['save', 'liability', 'offset', 'otp', 'file']);

  const fvu = await post(owner, 'tds-fvu', { quarter: 'Q2 2026-27', form: '26Q', tan: 'MUMN12345A' });
  assert.equal(fvu.body.ok, true, fvu.text);
  assert.equal(fvu.body.job.jobId, 'FVU-JOB-1');
  const staffless = await api.db.query("select action from audit_log where business_id = $1 and action = 'gst_portal.tds_fvu'", [owner.businessId]);
  assert.equal(staffless.rows.length, 1);
});

test('in live mode a GSTR-3B save needs a second person\'s approval asked by month, and a change to the books voids it', async () => {
  const [y, m] = thisMonth().split('-').map(Number);
  const period = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  await confirmTool('create_invoice', { partyName: 'Retail Mart', partyGstin: '27AAACH7409R1Z1', date: `${period}-10`, lines: [{ description: 'Fabric', hsn: '5208', qty: 1, rate: 800, gstRate: 5 }] });
  const before = { provider: process.env.MYCA_PROVIDER_ENV, gsp: process.env.MYCA_GSP_ENV };
  process.env.MYCA_PROVIDER_ENV = 'live';
  process.env.MYCA_GSP_ENV = 'live';
  try {
    const held = await post(owner, 'gst-gstr3b', { step: 'save', period });
    assert.equal(held.body.error, 'CA_APPROVAL_REQUIRED', held.text);
    const asked = await post(owner, 'approvals', { operation: 'gstr3b_save', period });
    assert.equal(asked.body.ok, true, asked.text);
    const approvalId = asked.body.approval.approvalId;
    assert.equal(asked.body.approval.operation, 'gstr3b_save');
    const approved = await post(accountant, 'approvals', { approvalId, decision: 'approve' });
    assert.equal(approved.body.ok, true, approved.text);
    const saved = await post(owner, 'gst-gstr3b', { step: 'save', period, caApprovalId: approvalId });
    assert.equal(saved.body.ok, true, saved.text);
    await confirmTool('create_invoice', { partyName: 'Retail Mart', partyGstin: '27AAACH7409R1Z1', date: `${period}-12`, lines: [{ description: 'Late fabric', hsn: '5208', qty: 1, rate: 300, gstRate: 5 }] });
    const stale = await post(owner, 'gst-gstr3b', { step: 'save', period, caApprovalId: approvalId });
    assert.match(String(stale.body.error), /APPROVAL/, stale.text);
  } finally {
    process.env.MYCA_PROVIDER_ENV = before.provider;
    process.env.MYCA_GSP_ENV = before.gsp;
  }
});

test('the session is refreshed by the job before it lapses, a lapsed one asks for a new OTP, and staff cannot reach the portal', async () => {
  api.clock.advance(5 * HOUR);
  const before = issued;
  const refreshed = await api.call('POST', '/v1/jobs/gst-sessions', { headers: { 'x-myca-job-token': JOB } });
  assert.equal(refreshed.status, 200, refreshed.text);
  assert.equal(refreshed.body.summary.refreshed, 1, refreshed.text);
  assert.equal(issued, before + 1);
  const wrongToken = await api.call('POST', '/v1/jobs/gst-sessions', { headers: { 'x-myca-job-token': 'nope' } });
  assert.equal(wrongToken.status, 404);

  api.clock.advance(7 * HOUR);
  owner = { ...owner, token: (await api.signIn('+919400000081')).accessToken };
  const lapsed = await post(owner, 'gst-gstr1', { step: 'check', period: thisMonth() });
  assert.equal(lapsed.body.error, 'GST_PORTAL_SESSION_ENDED', lapsed.text);
  const status = await get(owner, 'gst-portal');
  assert.equal(status.body.sessions[0].connected, false);
  assert.equal(status.body.sessions[0].needsReconnect, true, status.text);

  const invited = await api.call('POST', `/v1/businesses/${owner.businessId}/invitations`, { token: owner.token, body: { phone: '+919400000083', role: 'staff' } });
  const meena = await api.signIn('+919400000083');
  await api.call('POST', `/v1/invitations/${invited.body.invitation.id}/accept`, { token: meena.accessToken });
  const staff = await api.call('GET', `/v1/businesses/${owner.businessId}/gst-portal`, { token: meena.accessToken });
  assert.equal(staff.status, 403, staff.text);

  const gone = await post(owner, 'gst-portal', { step: 'disconnect', gstin: GSTIN });
  assert.equal(gone.body.disconnected, true, gone.text);
});
