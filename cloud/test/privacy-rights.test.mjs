import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers.mjs';
import { PRIVACY_NOTICE, LEGAL_INDIA } from '../src/consent.mjs';
import { PRIVACY_REPLY_DAYS } from '../src/privacy-requests.mjs';

const JOB_TOKEN = 'j'.repeat(40);
const admins = [];
let api;
before(async () => { api = await startApi({ adminUserIds: () => admins, jobToken: JOB_TOKEN }); });
after(async () => { await api.close(); });

const DAY = 24 * 60 * 60 * 1000;

test('the India notice names every DPDP item: recipients, transfers, rights, the Board, age and the grievance contact', () => {
  const text = PRIVACY_NOTICE.sections.map((s) => `${s.heading}\n${s.body}`).join('\n');
  for (const needle of ['Quicko', 'NIC', 'language model', 'outside India', 'Data Protection Board of India', 'nominate', 'withdraw', '18', 'Grievance Officer', 'CERT-In', 'one year', 'not a firm of Chartered Accountants']) {
    assert.ok(text.includes(needle), needle);
  }
  assert.equal(PRIVACY_NOTICE.requiresAdult, true);
  assert.equal(PRIVACY_NOTICE.contact.replyWithinDays, PRIVACY_REPLY_DAYS);
  assert.match(LEGAL_INDIA.company, /ML Dynamic Solutions Private Limited/);
});

test('consent to the India notice needs the 18-or-over declaration, and the declaration is recorded', async () => {
  const session = await api.signIn('+919400000101', { agree: false });
  const token = session.accessToken;
  const without = await api.call('POST', '/v1/me/consent', { token, body: { document: PRIVACY_NOTICE.document, version: PRIVACY_NOTICE.version } });
  assert.equal(without.status, 400);
  assert.equal(without.body.error, 'ADULT_REQUIRED');
  const notAdult = await api.call('POST', '/v1/me/consent', { token, body: { document: PRIVACY_NOTICE.document, version: PRIVACY_NOTICE.version, adult: 'yes' } });
  assert.equal(notAdult.body.error, 'ADULT_REQUIRED');
  const ok = await api.call('POST', '/v1/me/consent', { token, body: { document: PRIVACY_NOTICE.document, version: PRIVACY_NOTICE.version, adult: true } });
  assert.equal(ok.status, 200);
  const { rows } = await api.db.query('select adult_declared from consents where user_id = $1', [session.user.id]);
  assert.deepEqual(rows, [{ adult_declared: true }]);
});

test('a person who has not accepted the notice can still raise a grievance and see it', async () => {
  const session = await api.signIn('+919400000102', { agree: false });
  const token = session.accessToken;
  const made = await api.call('POST', '/v1/me/privacy-requests', { token, body: { kind: 'grievance', message: 'I do not want to agree but I want to complain.' } });
  assert.equal(made.status, 200);
  assert.match(made.body.request.reference, /^DPR-\d{8}-[0-9A-F]{6}$/);
  assert.equal(made.body.request.status, 'open');
  const due = new Date(made.body.request.dueAt).getTime() - new Date(made.body.request.createdAt).getTime();
  assert.equal(due, PRIVACY_REPLY_DAYS * DAY);
  const mine = await api.call('GET', '/v1/me/privacy-requests', { token });
  assert.equal(mine.status, 200);
  assert.equal(mine.body.requests.length, 1);
});

test('each kind of rights request is checked, and self-service ones say where to do it at once', async () => {
  const { accessToken: token } = await api.signIn('+919400000103');
  assert.equal((await api.call('POST', '/v1/me/privacy-requests', { token, body: { kind: 'sell-my-data' } })).body.error, 'UNKNOWN_REQUEST_KIND');
  assert.equal((await api.call('POST', '/v1/me/privacy-requests', { token, body: { kind: 'grievance' } })).body.error, 'MESSAGE_REQUIRED');
  assert.equal((await api.call('POST', '/v1/me/privacy-requests', { token, body: { kind: 'nominate', nomineeName: 'Ravi' } })).body.error, 'NOMINEE_REQUIRED');
  const nominee = await api.call('POST', '/v1/me/privacy-requests', { token, body: { kind: 'nominate', nomineeName: 'Ravi Kumar', nomineeContact: '+919400000999' } });
  assert.equal(nominee.status, 200);
  const access = await api.call('POST', '/v1/me/privacy-requests', { token, body: { kind: 'access' } });
  assert.match(access.body.selfService, /Download everything/);
  const control = await api.call('POST', '/v1/me/privacy-requests', { token, body: { kind: 'correction', message: 'bad\u0000name\u0007here' } });
  assert.equal(control.body.request.message, 'badnamehere');
});

test('only admins see the queue; an answer reaches the person; overdue requests raise an alert in the daily job', async () => {
  const person = await api.signIn('+919400000104');
  const officer = await api.signIn('+919400000105');
  const made = await api.call('POST', '/v1/me/privacy-requests', { token: person.accessToken, body: { kind: 'erasure', message: 'Please erase my old business too.' } });
  const reference = made.body.request.reference;
  assert.equal((await api.call('GET', '/v1/admin/privacy-requests', { token: officer.accessToken })).status, 404);
  admins.push(officer.user.id);
  const queue = await api.call('GET', '/v1/admin/privacy-requests', { token: officer.accessToken });
  assert.equal(queue.status, 200);
  assert.ok(queue.body.requests.some((r) => r.reference === reference && r.overdue === false));
  await api.db.query("update privacy_requests set due_at = now() - interval '1 day' where reference <> $1 and status = 'open'", [reference]);
  api.logs.length = 0;
  const run = await api.call('POST', '/v1/jobs/daily', { headers: { 'x-myca-job-token': JOB_TOKEN } });
  assert.equal(run.status, 200);
  assert.ok(run.body.purge.privacyRequestsOverdue >= 1);
  assert.ok(api.logs.some((l) => l.alert === 'PRIVACY_REQUESTS_OVERDUE'));
  assert.equal((await api.call('POST', `/v1/admin/privacy-requests/${reference}`, { token: officer.accessToken, body: { status: 'answered' } })).body.error, 'REPLY_REQUIRED');
  const answered = await api.call('POST', `/v1/admin/privacy-requests/${reference}`, { token: officer.accessToken, body: { status: 'answered', reply: 'Done: the business was erased.' } });
  assert.equal(answered.status, 200);
  const mine = await api.call('GET', '/v1/me/privacy-requests', { token: person.accessToken });
  assert.equal(mine.body.requests[0].reply, 'Done: the business was erased.');
  assert.equal(mine.body.requests[0].status, 'answered');
});

test('erasing an account keeps the request reference and dates for a year but drops what the person wrote', async () => {
  const person = await api.signIn('+919400000106');
  const made = await api.call('POST', '/v1/me/privacy-requests', { token: person.accessToken, body: { kind: 'nominate', nomineeName: 'Meena Devi', nomineeContact: 'meena@example.com', message: 'my sister' } });
  assert.equal((await api.call('DELETE', '/v1/me', { token: person.accessToken })).status, 200);
  await api.db.query("update users set deleted_at = now() - interval '31 days' where id = $1", [person.user.id]);
  const run = await api.call('POST', '/v1/jobs/daily', { headers: { 'x-myca-job-token': JOB_TOKEN } });
  assert.equal(run.status, 200);
  const { rows } = await api.db.query('select user_id, message, nominee_name, nominee_contact, kind from privacy_requests where reference = $1', [made.body.request.reference]);
  assert.deepEqual(rows, [{ user_id: null, message: '', nominee_name: '', nominee_contact: '', kind: 'nominate' }]);
});

test('legal links are given only for an https site', async () => {
  const { legalLinks } = await import('../src/consent.mjs');
  assert.deepEqual(legalLinks(''), {});
  assert.deepEqual(legalLinks('http://myca.example'), {});
  assert.equal(legalLinks('https://myca.example/').terms, 'https://myca.example/terms');
  const out = await api.call('GET', '/v1/privacy-notice');
  assert.equal(out.status, 200);
  assert.equal(out.body.notice.requiresAdult, true);
  assert.ok(out.body.notice.contact.grievanceOfficer);
});
