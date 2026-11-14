import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ENGINE } from '../src/countries/malaysia/engine.mjs';
import { myInvoisMode } from '../src/countries/malaysia/myinvois-actions.mjs';
import { myInvoisSandbox, setMyInvoisSandboxClock, sandboxTinRegistered, MYINVOIS_SANDBOX_CLIENT, MYINVOIS_SANDBOX_VALIDATION_MS } from '../src/countries/malaysia/myinvois-sandbox.mjs';
import { clearMyInvoisTokens, myInvoisToken, myInvoisSubmission, submitMyInvoisDocuments, validateMyTin } from '../src/countries/malaysia/myinvois-client.mjs';
import { buildMyInvoisDocument, submissionEntry } from '../src/countries/malaysia/myinvois-document.mjs';
import { performExternalAction } from '../src/action-gate.mjs';
import { createState } from '../src/store.mjs';

const SANDBOX_ENV = { MYCA_PROVIDER_ENV: 'off', MYCA_MOCK_MODE: '0', MYCA_MYINVOIS_CLIENT_ID: '', MYCA_MYINVOIS_CLIENT_SECRET: '', MYCA_MYINVOIS_CERT_PATH: '', MYCA_MYINVOIS_KEY_PATH: '' };
const HOUR = 3600000;
const LINK = /^https:\/\/preprod\.myinvois\.hasil\.gov\.my\/[A-Z0-9]{26}\/share\/[A-Z0-9]{40}$/;

const supplier = {
  name: 'Kedai Contoh Sdn Bhd', tin: 'C20830570210', idType: 'BRN', idValue: '202001234567', msic: '46510', phone: '+60123456789',
  address: { lines: ['Lot 66'], city: 'Kuala Lumpur', state: 'Selangor' },
};
const buyer = { name: 'Pelanggan Bhd', tin: 'C10987654320', idValue: '199901000111', address: { city: 'Shah Alam', state: '10' } };
const lines = [{ description: 'Consulting', classification: '022', quantity: 1, unitPrice: 1000, taxType: '02', taxRateBasisPoints: 800 }];

let saved = {};
let clock = 0;

beforeEach(() => {
  saved = Object.fromEntries(Object.keys(SANDBOX_ENV).map((key) => [key, process.env[key]]));
  Object.assign(process.env, SANDBOX_ENV);
  clock = Date.now();
  setMyInvoisSandboxClock(() => clock);
  clearMyInvoisTokens();
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  setMyInvoisSandboxClock(null);
  clearMyInvoisTokens();
});

function business() {
  const state = createState();
  assert.equal(ENGINE.run.set_my_einvoice_profile(state, supplier).ok, true);
  return state;
}

function actions(state) {
  return (state.auditEvents || []).map((event) => event.action);
}

function counting(state) {
  const calls = [];
  const sandbox = myInvoisSandbox(state);
  const send = async (url, init = {}) => {
    calls.push({ path: new URL(url).pathname, method: init.method || 'GET' });
    return sandbox(url, init);
  };
  return { calls, send };
}

function config(send, tin = supplier.tin) {
  return { environment: 'test', clientId: MYINVOIS_SANDBOX_CLIENT.clientId, clientSecret: MYINVOIS_SANDBOX_CLIENT.clientSecret, onBehalfOf: tin, transport: send };
}

function documentFor(number, extra = {}) {
  const iso = new Date(clock).toISOString();
  const built = buildMyInvoisDocument({ number, issueDate: iso.slice(0, 10), issueTime: `${iso.slice(11, 19)}Z`, supplier, buyer, lines, ...extra });
  assert.equal(built.ok, true, JSON.stringify(built.problems));
  return built.document;
}

async function issueAndValidate(state, number, extra = {}) {
  const sent = await ENGINE.run.issue_my_einvoice(state, { number, buyer, lines, ...extra });
  assert.equal(sent.ok, true, JSON.stringify(sent));
  clock += MYINVOIS_SANDBOX_VALIDATION_MS + 1;
  const status = await ENGINE.run.my_einvoice_status(state, { submissionUid: sent.data.submissionUid });
  assert.equal(status.ok, true);
  return { sent, status };
}

test('with no MyInvois client id and live calls not on, the built-in sandbox answers', () => {
  assert.equal(myInvoisMode(), 'sandbox');
  process.env.MYCA_MYINVOIS_CLIENT_ID = 'real-client';
  assert.equal(myInvoisMode(), 'off');
  process.env.MYCA_PROVIDER_ENV = 'live';
  process.env.MYCA_MYINVOIS_CLIENT_ID = '';
  assert.equal(myInvoisMode(), 'live', 'production never falls back to the simulator');
  process.env.MYCA_MOCK_MODE = '1';
  assert.equal(myInvoisMode(), 'mock');
});

test('the action gate refuses a simulator while production calls are on', async () => {
  const state = createState();
  const request = { actionId: 'myinvois_status', clientId: 'SELF', actor: { userId: 'owner' }, params: { submissionUid: 'X' }, simulator: async () => new Response('{}') };
  process.env.MYCA_PROVIDER_ENV = 'live';
  const refused = await performExternalAction(state, request, async () => ({ ok: true }));
  assert.equal(refused.error, 'SIMULATOR_NOT_ALLOWED');
  process.env.MYCA_PROVIDER_ENV = 'off';
  const ran = await performExternalAction(state, request, async () => ({ ok: true, data: {} }));
  assert.equal(ran.ok, true);
  assert.equal(ran.simulated, true);
  assert.ok(actions(state).includes('external.myinvois_status'), 'a simulated call is still audited');
});

test('a token is reused until it expires, and an expired token is replaced once after a 401', async () => {
  const state = createState();
  const { calls, send } = counting(state);
  const first = await myInvoisToken(config(send));
  const second = await myInvoisToken(config(send));
  assert.equal(first.token, second.token);
  assert.equal(calls.filter((call) => call.path === '/connect/token').length, 1);
  assert.match(first.token, /^sbx\./);
  clock += 3601 * 1000;
  const read = await myInvoisSubmission(config(send), { submissionUid: 'AAAAAAAAAAAAAAAAAAAAAAAAAA' });
  assert.equal(read.error, 'MYINVOIS_REJECTED');
  assert.equal(read.lhdn.error.errorCode, 'NotFound', 'the call went through on a fresh token and reached the submission lookup');
  assert.equal(calls.filter((call) => call.path === '/connect/token').length, 2);
  const login = await myInvoisSandbox(state)('https://preprod-api.myinvois.hasil.gov.my/connect/token', { method: 'POST', body: 'grant_type=password' });
  assert.equal(login.status, 400);
  const noToken = await myInvoisSandbox(state)('https://preprod-api.myinvois.hasil.gov.my/api/v1.0/documents/recent', { method: 'GET' });
  assert.equal(noToken.status, 401);
  const forged = await myInvoisSandbox(state)('https://preprod-api.myinvois.hasil.gov.my/api/v1.0/documents/recent', { method: 'GET', headers: { Authorization: 'Bearer sbx.e30.forged' } });
  assert.equal(forged.status, 401);
});

test('submission limits: 100 documents, 5 MB a submission, 300 KB a document, a matching hash', async () => {
  const state = createState();
  const sandbox = myInvoisSandbox(state);
  const login = await (await sandbox('https://preprod-api.myinvois.hasil.gov.my/connect/token', { method: 'POST', headers: { onbehalfof: supplier.tin }, body: 'grant_type=client_credentials&client_id=a&client_secret=b&scope=InvoicingAPI' })).json();
  assert.equal(login.expires_in, 3600);
  const post = (body) => sandbox('https://preprod-api.myinvois.hasil.gov.my/api/v1.0/documentsubmissions/', { method: 'POST', headers: { Authorization: `Bearer ${login.access_token}` }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const entry = submissionEntry(documentFor('INV-L1'), 'INV-L1');
  const many = Array.from({ length: 101 }, (_, index) => ({ ...entry, codeNumber: `N${index}` }));
  let out = await post({ documents: many });
  assert.equal(out.status, 400);
  assert.equal((await out.json()).error.errorCode, 'MaximumSizeExceeded');
  out = await post('x'.repeat(5 * 1024 * 1024 + 1));
  assert.equal(out.status, 400);
  assert.equal((await out.json()).error.errorCode, 'MaximumSizeExceeded');
  out = await post({ documents: [] });
  assert.equal((await out.json()).error.errorCode, 'BadStructure');
  const big = Buffer.from(JSON.stringify({ pad: 'y'.repeat(300 * 1024) })).toString('base64');
  out = await post({ documents: [{ format: 'JSON', document: big, documentHash: 'x', codeNumber: 'BIG' }, { ...entry, documentHash: '0'.repeat(64) }] });
  assert.equal(out.status, 202);
  const body = await out.json();
  assert.equal(body.submissionUID, null, 'nothing accepted, so no submission');
  assert.deepEqual(body.rejectedDocuments.map((doc) => doc.error.errorCode), ['MaximumSizeExceeded', 'BadArgument']);
  const client = await submitMyInvoisDocuments(config(async () => { throw new Error('must not send'); }), { documents: Array.from({ length: 101 }, (_, index) => ({ document: documentFor(`C${index}`), codeNumber: `C${index}` })) });
  assert.equal(client.error, 'SUBMISSION_TOO_LARGE_OR_EMPTY', 'the client refuses before anything is sent');
});

test('an identical submission within 10 minutes is refused with Retry-After, and after that the document is a duplicate', async () => {
  const state = createState();
  const { send } = counting(state);
  const document = documentFor('INV-D1');
  const first = await submitMyInvoisDocuments(config(send), { documents: [{ document, codeNumber: 'INV-D1' }] });
  assert.equal(first.ok, true);
  clock += 9 * 60 * 1000;
  const again = await submitMyInvoisDocuments(config(send), { documents: [{ document, codeNumber: 'INV-D1' }] });
  assert.equal(again.lhdn.error.errorCode, 'DuplicateSubmission');
  assert.equal(again.status, 422);
  assert.equal(again.retryAfterSeconds, 60);
  clock += 61 * 1000;
  const later = await submitMyInvoisDocuments(config(send), { documents: [{ document, codeNumber: 'INV-D1' }] });
  assert.equal(later.ok, true);
  clock += MYINVOIS_SANDBOX_VALIDATION_MS;
  const read = await myInvoisSubmission(config(send), { submissionUid: later.data.submissionUid });
  assert.equal(read.data.overallStatus, 'Invalid');
  const fresh = await myInvoisSubmission(config(send), { submissionUid: first.data.submissionUid });
  assert.equal(fresh.data.overallStatus, 'Valid');
});

test('another taxpayer cannot submit for the business or read its documents', async () => {
  const state = createState();
  const { send } = counting(state);
  const document = documentFor('INV-X1');
  const wrong = await submitMyInvoisDocuments(config(send, 'C11111111110'), { documents: [{ document, codeNumber: 'INV-X1' }] });
  assert.equal(wrong.lhdn.error.errorCode, 'IncorrectSubmitter');
  const mine = await submitMyInvoisDocuments(config(send), { documents: [{ document, codeNumber: 'INV-X1' }] });
  const theirs = await myInvoisSubmission(config(send, 'C11111111110'), { submissionUid: mine.data.submissionUid });
  assert.equal(theirs.lhdn.error.errorCode, 'NotFound');
});

test('issue, read in progress then valid, details, the QR share link, and the book listing', async () => {
  const state = business();
  const sent = await ENGINE.run.issue_my_einvoice(state, { number: 'INV-1', buyer, lines });
  assert.equal(sent.ok, true);
  assert.equal(sent.simulated, true);
  assert.equal(sent.data.environment, 'sandbox');
  assert.match(sent.data.uuid, /^[A-Z0-9]{26}$/);
  const early = await ENGINE.run.my_einvoice_status(state, { submissionUid: sent.data.submissionUid });
  assert.equal(early.data.overallStatus, 'InProgress');
  assert.equal(early.data.documents[0].link, '');
  clock += MYINVOIS_SANDBOX_VALIDATION_MS;
  const done = await ENGINE.run.my_einvoice_status(state, { submissionUid: sent.data.submissionUid });
  assert.equal(done.data.overallStatus, 'Valid');
  assert.match(done.data.documents[0].link, LINK);
  const details = await ENGINE.run.my_einvoice_details(state, { uuid: sent.data.uuid });
  assert.equal(details.data.status, 'Valid');
  assert.equal(details.data.totalPayable, 1080);
  assert.equal(details.data.issuer.tin, supplier.tin);
  assert.equal(details.data.receiver.tin, buyer.tin);
  assert.deepEqual(details.data.errors, []);
  assert.match(details.data.sandboxNotes[0], /not signed/);
  const book = ENGINE.run.my_einvoices(state, {});
  assert.equal(book.data.total, 1);
  assert.equal(book.data.documents[0].status, 'valid');
  assert.match(book.data.documents[0].link, LINK);
  assert.ok(book.data.documents[0].cancellableUntil > new Date(clock).toISOString());
  assert.equal(ENGINE.run.my_einvoices(state, { status: 'cancelled' }).data.total, 0);
  assert.equal(ENGINE.run.my_einvoices(state, { status: 'lost' }).error, 'BAD_STATUS');
  assert.equal(ENGINE.run.my_einvoices(state, { limit: 0 }).error, 'BAD_LIMIT');
  assert.equal(ENGINE.run.my_einvoices(state, { from: '14/11/2026' }).error, 'BAD_DATE');
  assert.match(ENGINE.words.my_einvoices(book), /1 e-invoice issued/);
  assert.equal((await ENGINE.run.issue_my_einvoice(state, { number: 'INV-1', buyer, lines })).error, 'EINVOICE_ALREADY_SENT');
  assert.equal((await ENGINE.run.my_einvoice_details(state, { uuid: 'bad' })).error, 'BAD_DOCUMENT_UUID');
  assert.equal((await ENGINE.run.my_einvoice_details(state, { uuid: 'AAAAAAAAAAAAAAAAAAAAAAAAAA' })).error, 'EINVOICE_NOT_FOUND');
  for (const name of ['external.myinvois_submit', 'my_einvoice_submitted', 'external.myinvois_status', 'my_einvoice_status_changed', 'external.myinvois_details']) assert.ok(actions(state).includes(name), name);
});

test('an invalid document comes back with LHDN-shaped validation errors', async () => {
  const state = business();
  const ghost = { ...buyer, tin: 'C10000000000' };
  assert.equal(sandboxTinRegistered(ghost.tin), false);
  const sent = await ENGINE.run.issue_my_einvoice(state, { number: 'INV-BAD', buyer: ghost, lines });
  clock += MYINVOIS_SANDBOX_VALIDATION_MS;
  const status = await ENGINE.run.my_einvoice_status(state, { submissionUid: sent.data.submissionUid });
  assert.equal(status.data.overallStatus, 'Invalid');
  const details = await ENGINE.run.my_einvoice_details(state, { uuid: sent.data.uuid });
  assert.equal(details.data.status, 'Invalid');
  assert.equal(details.data.link, '');
  assert.deepEqual(details.data.errors.map((error) => [error.step, error.code]), [['Step04-Taxpayer Validator', 'TP302']]);
  assert.match(details.data.errors[0].path, /AccountingCustomerParty/);
  assert.equal(ENGINE.run.my_einvoices(state, { status: 'invalid' }).data.total, 1);
  const retry = await ENGINE.run.issue_my_einvoice(state, { number: 'INV-BAD', buyer, lines });
  assert.equal(retry.ok, true, 'an invalid e-invoice number can be sent again once fixed');
});

test('an issue time more than 72 hours before submission is too old', async () => {
  const state = business();
  clock += 73 * HOUR;
  const sent = await ENGINE.run.issue_my_einvoice(state, { number: 'INV-OLD', buyer, lines });
  clock += MYINVOIS_SANDBOX_VALIDATION_MS;
  const details = await ENGINE.run.my_einvoice_details(state, { uuid: sent.data.uuid });
  assert.deepEqual(details.data.errors.map((error) => error.code), ['CF321']);
});

test('cancel within 72 hours of validation only, once, and never while a credit note refers to it', async () => {
  const state = business();
  const { sent } = await issueAndValidate(state, 'INV-C1');
  const credit = await ENGINE.run.issue_my_einvoice(state, { type: 'credit-note', number: 'CN-1', buyer, lines: [{ ...lines[0], unitPrice: 100 }], original: { uuid: sent.data.uuid, number: 'INV-C1' } });
  assert.equal(credit.ok, true);
  clock += MYINVOIS_SANDBOX_VALIDATION_MS;
  assert.equal((await ENGINE.run.my_einvoice_status(state, { submissionUid: credit.data.submissionUid })).data.overallStatus, 'Valid');
  const blocked = await ENGINE.run.cancel_my_einvoice(state, { uuid: sent.data.uuid, reason: 'wrong buyer' });
  assert.equal(blocked.error, 'EINVOICE_HAS_ACTIVE_NOTES');
  assert.equal(blocked.lhdnCode, 'ActiveReferencingDocuments');
  assert.equal((await ENGINE.run.cancel_my_einvoice(state, { uuid: credit.data.uuid, reason: 'not needed' })).ok, true);
  const cancelled = await ENGINE.run.cancel_my_einvoice(state, { uuid: sent.data.uuid, reason: 'wrong buyer' });
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.data.status, 'cancelled');
  assert.equal((await ENGINE.run.cancel_my_einvoice(state, { uuid: sent.data.uuid, reason: 'again' })).error, 'EINVOICE_WRONG_STATE');
  assert.equal((await ENGINE.run.my_einvoice_details(state, { uuid: sent.data.uuid })).data.status, 'Cancelled');
  assert.equal((await ENGINE.run.cancel_my_einvoice(state, { uuid: sent.data.uuid, reason: '' })).error, 'CANCEL_REASON_REQUIRED');
  assert.equal((await ENGINE.run.cancel_my_einvoice(state, { uuid: sent.data.uuid, reason: 'x'.repeat(301) })).error, 'CANCEL_REASON_REQUIRED');
  assert.ok(actions(state).includes('my_einvoice_cancelled'));

  const { sent: late } = await issueAndValidate(state, 'INV-C2');
  clock += 72 * HOUR + 1000;
  const closed = await ENGINE.run.cancel_my_einvoice(state, { uuid: late.data.uuid, reason: 'too late' });
  assert.equal(closed.error, 'WINDOW_CLOSED');
  assert.equal(closed.lhdnCode, 'OperationPeriodOver');
  assert.match(closed.hint, /credit note/);
});

test('a received e-invoice is listed with its rejection deadline and can be rejected once, within 72 hours', async () => {
  const state = business();
  const seeded = ENGINE.run.simulate_my_received_einvoice(state, { supplier: { tin: 'C10987654320', name: 'Pembekal Sdn Bhd' }, number: 'SUP-1', total: 108, tax: 8 });
  assert.equal(seeded.ok, true);
  const inbox = await ENGINE.run.my_received_einvoices(state, {});
  assert.equal(inbox.data.total, 1);
  assert.equal(inbox.data.documents[0].status, 'valid');
  assert.equal(inbox.data.documents[0].supplier.name, 'Pembekal Sdn Bhd');
  assert.ok(inbox.data.documents[0].rejectableUntil);
  assert.equal((await ENGINE.run.my_received_einvoices(state, { pageSize: 101 })).error, 'BAD_PAGE');
  assert.equal((await ENGINE.run.my_received_einvoices(state, { pageNo: 0 })).error, 'BAD_PAGE');
  const rejected = await ENGINE.run.reject_my_einvoice(state, { uuid: seeded.data.uuid, reason: 'The quantity is wrong.' });
  assert.equal(rejected.ok, true);
  assert.equal(rejected.data.status, 'rejection requested');
  assert.equal((await ENGINE.run.reject_my_einvoice(state, { uuid: seeded.data.uuid, reason: 'again' })).error, 'EINVOICE_WRONG_STATE');
  const listed = await ENGINE.run.my_received_einvoices(state, {});
  assert.equal(listed.data.documents[0].status, 'rejection requested');
  assert.equal(listed.data.documents[0].rejectionReason, 'The quantity is wrong.');
  assert.ok(actions(state).includes('my_einvoice_rejected'));
  assert.ok(actions(state).includes('my_einvoice_sandbox_received'));

  const old = ENGINE.run.simulate_my_received_einvoice(state, { supplier: { tin: 'C10987654320', name: 'Pembekal Sdn Bhd' }, number: 'SUP-2', total: 50 });
  clock += 73 * HOUR;
  const closed = await ENGINE.run.reject_my_einvoice(state, { uuid: old.data.uuid, reason: 'late' });
  assert.equal(closed.error, 'WINDOW_CLOSED');
  assert.match(closed.hint, /credit note/);

  const { sent } = await issueAndValidate(state, 'INV-OWN');
  assert.equal((await ENGINE.run.reject_my_einvoice(state, { uuid: sent.data.uuid, reason: 'mine' })).error, 'EINVOICE_NOT_YOURS');
  assert.equal((await ENGINE.run.reject_my_einvoice(state, { uuid: seeded.data.uuid, reason: '' })).error, 'REJECT_REASON_REQUIRED');
  const missing = ENGINE.run.simulate_my_received_einvoice(state, { supplier: { tin: 'EI00000000010', name: '' }, number: '', total: -1 });
  assert.deepEqual(missing.problems.map((problem) => problem.field), ['supplier.tin', 'supplier.name', 'number', 'total', 'tax']);
  process.env.MYCA_MYINVOIS_CLIENT_ID = 'real-client';
  assert.equal(ENGINE.run.simulate_my_received_einvoice(state, { supplier: { tin: 'C10987654320', name: 'x' }, number: 'S', total: 1 }).error, 'SANDBOX_ONLY');
  assert.deepEqual(ENGINE.preview.simulate_my_received_einvoice(state, {}).blockers, ['Only in the built-in MyInvois sandbox.']);
});

test('TIN validation: format first, then the identity number shape, then the sandbox register', async () => {
  const state = business();
  assert.equal((await ENGINE.run.validate_my_tin(state, { tin: 'C10987654320', idType: 'BRN', idValue: '199901000111' })).data.lhdn, 'valid');
  assert.equal((await ENGINE.run.validate_my_tin(state, { tin: 'C10000000000', idType: 'BRN', idValue: '199901000111' })).data.lhdn, 'not found');
  assert.equal((await ENGINE.run.validate_my_tin(state, { tin: 'IG12345678901', idType: 'NRIC', idValue: '900101-14-5678' })).data.lhdn, 'valid');
  assert.equal((await ENGINE.run.validate_my_tin(state, { tin: 'C10987654320', idType: 'NRIC', idValue: '900101145678' })).data.lhdn, 'not found', 'a company TIN does not go with a MyKad');
  const badNric = await ENGINE.run.validate_my_tin(state, { tin: 'IG12345678901', idType: 'NRIC', idValue: '901301145678' });
  assert.equal(badNric.data.idFormat, false);
  assert.equal(badNric.data.idError, 'NRIC_BAD_BIRTH_DATE');
  assert.equal((await ENGINE.run.validate_my_tin(state, { tin: 'IG12345678901', idType: 'NRIC', idValue: '900101005678' })).data.idError, 'NRIC_BAD_PLACE_CODE');
  assert.equal((await ENGINE.run.validate_my_tin(state, { tin: 'C10987654320', idType: 'BRN', idValue: '12' })).data.idError, 'BRN_BAD_FORMAT');
  assert.equal((await ENGINE.run.validate_my_tin(state, { tin: 'C10987654320', idType: 'BRN', idValue: '' })).data.idError, 'ID_VALUE_REQUIRED');
  for (const tin of ['', 'X123', 'C123', 'IG1234', 'c10987654320x']) assert.equal((await ENGINE.run.validate_my_tin(state, { tin, idValue: '199901000111' })).data.format, false, tin);
  assert.equal((await ENGINE.run.validate_my_tin(state, { tin: 'c10987654320', idValue: '199901000111' })).data.lhdn, 'valid', 'lower case is accepted');
  const raw = await validateMyTin(config(counting(state).send), { tin: 'C10987654320', idType: 'MYKAD', idValue: '1' });
  assert.equal(raw.ok, false);
});

test('a consolidated monthly e-invoice goes to the general public with classification 004, late only when acknowledged', async () => {
  const state = business();
  const today = new Date(Date.now() + 8 * HOUR);
  const thisMonth = today.toISOString().slice(0, 7);
  const back = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, 1)).toISOString().slice(0, 7);
  const receipts = [{ description: 'Counter sales', amount: 5000, taxType: '01', taxRateBasisPoints: 1000, transactions: 120, largestTransaction: 400, receipts: 'R0001-R0120' }];
  assert.equal((await ENGINE.run.issue_my_consolidated_einvoice(state, { month: thisMonth, lines: receipts })).error, 'CONSOLIDATION_MONTH_NOT_ENDED');
  const closed = await ENGINE.run.issue_my_consolidated_einvoice(state, { month: back, lines: receipts });
  assert.equal(closed.error, 'CONSOLIDATION_WINDOW_CLOSED');
  assert.match(closed.why, /within 7 days/);
  assert.match(ENGINE.preview.issue_my_consolidated_einvoice(state, { month: back, lines: receipts }).blockers[0], /within 7 days/);
  const preview = ENGINE.preview.issue_my_consolidated_einvoice(state, { month: back, lines: receipts, acknowledgeLate: true });
  assert.deepEqual(preview.blockers, []);
  assert.match(preview.effects[0], /late/);
  const sent = await ENGINE.run.issue_my_consolidated_einvoice(state, { month: back, lines: receipts, acknowledgeLate: true, lateReason: 'POS export failed' });
  assert.equal(sent.ok, true, JSON.stringify(sent));
  assert.equal(sent.data.kind, 'consolidated');
  assert.equal(sent.data.buyer.tin, 'EI00000000010');
  assert.equal(sent.data.number, `CONS-${back.replace('-', '')}`);
  assert.equal(sent.data.late, true);
  assert.equal(sent.data.period.frequency, 'Monthly');
  assert.equal(sent.data.totals.payable, 5500);
  clock += MYINVOIS_SANDBOX_VALIDATION_MS;
  const details = await ENGINE.run.my_einvoice_details(state, { uuid: sent.data.uuid });
  assert.equal(details.data.status, 'Valid', JSON.stringify(details.data.errors));
  assert.ok(actions(state).includes('my_einvoice_consolidated_late'));
  const big = await ENGINE.run.issue_my_consolidated_einvoice(state, { month: back, number: 'CONS-BIG', acknowledgeLate: true, lines: [{ amount: 20000, transactions: 2, largestTransaction: 10000.01 }] });
  assert.equal(big.error, 'EINVOICE_FIELDS_MISSING');
  assert.match(big.problems[0].why, /RM10,000 needs its own e-invoice/);
  const unsure = await ENGINE.run.issue_my_consolidated_einvoice(state, { month: back, number: 'CONS-U', acknowledgeLate: true, lines: [{ amount: 900, transactions: 3 }] });
  assert.equal(unsure.problems[0].field, 'lines[0].largestTransaction');
  const edge = ENGINE.preview.issue_my_consolidated_einvoice(state, { month: back, number: 'CONS-EDGE', acknowledgeLate: true, lines: [{ amount: 10000 }] });
  assert.deepEqual(edge.blockers, [], 'exactly RM10,000 may still be consolidated');
  const banned = await ENGINE.run.issue_my_consolidated_einvoice(state, { month: back, acknowledgeLate: true, activity: 'electricity', lines: receipts });
  assert.equal(banned.error, 'CONSOLIDATION_NOT_ALLOWED');
  assert.equal((await ENGINE.run.issue_my_einvoice(state, { number: 'X', buyer, lines, consolidated: true })).error, 'USE_CONSOLIDATED_TOOL');
  assert.deepEqual(ENGINE.preview.issue_my_einvoice(state, { number: 'X', buyer, lines, consolidated: true }).blockers.length, 1);
});

test('a self-billed e-invoice for a foreign supplier in US dollars carries the exchange rate and EI00000000030', async () => {
  const state = business();
  const foreign = { name: 'Acme Cloud Inc', phone: '+14155550100', address: { lines: ['1 Market St'], city: 'San Francisco', country: 'USA' } };
  const usd = [{ description: 'Cloud hosting, October', classification: '036', unitPrice: 250, taxType: '06' }];
  const preview = ENGINE.preview.issue_my_self_billed_einvoice(state, { number: 'SB-1', supplier: foreign, lines: usd, currency: 'USD', exchangeRate: 4.4123 });
  assert.deepEqual(preview.blockers, [], JSON.stringify(preview));
  assert.match(preview.summary, /USD 250\.00 \(RM1,103\.08 at 4\.4123\)/);
  assert.match(preview.effects[0], /EI00000000030/);
  const sent = await ENGINE.run.issue_my_self_billed_einvoice(state, { number: 'SB-1', supplier: foreign, lines: usd, currency: 'USD', exchangeRate: 4.4123 });
  assert.equal(sent.ok, true, JSON.stringify(sent));
  assert.equal(sent.data.kind, 'self-billed');
  assert.equal(sent.data.type, 'self-billed-invoice');
  assert.equal(sent.data.supplier.tin, 'EI00000000030');
  assert.equal(sent.data.buyer.tin, supplier.tin);
  assert.equal(sent.data.totals.payableMyr, 1103.08);
  clock += MYINVOIS_SANDBOX_VALIDATION_MS;
  const details = await ENGINE.run.my_einvoice_details(state, { uuid: sent.data.uuid });
  assert.equal(details.data.status, 'Valid', JSON.stringify(details.data.errors));
  assert.equal(details.data.type, 'Self-billed Invoice');
  const noRate = await ENGINE.run.issue_my_self_billed_einvoice(state, { number: 'SB-2', supplier: foreign, lines: usd, currency: 'USD' });
  assert.equal(noRate.problems[0].field, 'exchangeRate');
  const tooPrecise = ENGINE.preview.issue_my_self_billed_einvoice(state, { number: 'SB-3', supplier: foreign, lines: usd, currency: 'USD', exchangeRate: 4.1234567 });
  assert.match(tooPrecise.blockers[0], /six decimal/);
  const myrRate = ENGINE.preview.issue_my_self_billed_einvoice(state, { number: 'SB-4', supplier: foreign, lines: usd, exchangeRate: 4.4 });
  assert.match(myrRate.blockers.join(' '), /ringgit invoice has no exchange rate/);
  const noteWithout = await ENGINE.run.issue_my_self_billed_einvoice(state, { type: 'self-billed-credit-note', number: 'SBC-1', supplier: foreign, lines: usd, currency: 'USD', exchangeRate: 4.4 });
  assert.equal(noteWithout.problems[0].field, 'original.uuid');
  const self = await ENGINE.run.issue_my_self_billed_einvoice(state, { number: 'SB-5', supplier: { ...supplier }, lines: usd });
  assert.match(JSON.stringify(self.problems), /different supplier/);
  assert.equal((await ENGINE.run.issue_my_self_billed_einvoice(state, { type: 'invoice', number: 'SB-6', supplier: foreign, lines: usd })).error, 'BAD_TYPE');
  assert.equal((await ENGINE.run.issue_my_self_billed_einvoice(createState(), { number: 'SB-7', supplier: foreign, lines: usd })).error, 'EINVOICE_PROFILE_MISSING');
  assert.equal((await ENGINE.run.issue_my_self_billed_einvoice(state, { number: 'SB-8', lines: usd })).error, 'EINVOICE_FIELDS_MISSING');
  const ordinary = await ENGINE.run.issue_my_einvoice(state, { number: 'FX-1', buyer: { ...buyer, tin: 'EI00000000020', address: { city: 'Singapore', country: 'SGP', state: '17' } }, lines, currency: 'SGD', exchangeRate: 3.45 });
  assert.equal(ordinary.ok, true, JSON.stringify(ordinary));
  assert.equal(ordinary.data.totals.payableMyr, 3726);
});
