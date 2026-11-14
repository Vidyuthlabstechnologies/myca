import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi, googleToken } from './helpers.mjs';
import { JOB_HEADER } from '../src/jobs.mjs';
import { PRIVACY_NOTICE } from '../src/consent.mjs';

const JOB_TOKEN = 'job-token-for-erasure-tests-0123456789abcdef';
const DAY = 24 * 60 * 60 * 1000;

let api;
before(async () => { api = await startApi({ jobToken: JOB_TOKEN }); });
after(async () => { await api.close(); });

async function everyTextCell() {
  const tables = await api.db.query(
    `select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`,
  );
  const rows = [];
  for (const { table_name: table } of tables.rows) {
    const found = await api.db.query(`select row_to_json(t)::text as row from "${table}" t`);
    for (const row of found.rows) rows.push({ table, row: row.row });
  }
  return rows;
}

function holding(rows, needle) {
  return rows.filter((entry) => entry.row.includes(needle)).map((entry) => entry.table);
}

test('deleting an account erases the person from every table after the grace period', async () => {
  const phone = '+919300000071';
  const owner = await api.ownerWithBusiness(phone, { name: 'Leaving Traders', state: '29' });
  const other = await api.ownerWithBusiness('+919300000072', { name: 'Staying Stores', state: '29' });
  const invited = await api.call('POST', `/v1/businesses/${other.businessId}/invitations`, { token: other.token, body: { phone, role: 'staff' } });
  assert.equal(invited.status, 200, invited.text);
  const me = await api.call('GET', '/v1/me', { token: owner.token });
  const invitationId = me.body.invitations[0].id;
  assert.equal((await api.call('POST', `/v1/invitations/${invitationId}/accept`, { token: owner.token })).status, 200);
  await api.call('GET', `/v1/businesses/${other.businessId}/snapshot`, { token: owner.token });
  const backInvite = await api.call('POST', `/v1/businesses/${owner.businessId}/invitations`, { token: owner.token, body: { phone: '+919300000072', role: 'staff' } });
  assert.equal(backInvite.status, 200, backInvite.text);

  const googleSub = '220169484474386276999';
  const email = 'leaving.person@example.com';
  const google = await api.call('POST', '/v1/auth/google', { body: { idToken: googleToken({ sub: googleSub, email, name: 'Leaving Person' }), deviceLabel: 'pixel' } });
  assert.equal(google.status, 200, google.text);
  await api.call('POST', '/v1/me/consent', { token: google.body.accessToken, body: { document: PRIVACY_NOTICE.document, version: PRIVACY_NOTICE.version, adult: true } });

  const userId = owner.user.id;
  const googleUserId = google.body.user.id;
  assert.ok(holding(await everyTextCell(), phone).length > 0, 'the phone is stored before deletion');

  assert.equal((await api.call('DELETE', '/v1/me', { token: owner.token })).status, 200);
  assert.equal((await api.call('DELETE', '/v1/me', { token: google.body.accessToken })).status, 200);
  const requested = await api.db.query("select count(*)::int as n from audit_log where user_id = $1 and action = 'member.account_deletion_requested'", [userId]);
  assert.equal(requested.rows[0].n, 2, 'the request is audited in each business the person belonged to');
  const requestedMeta = await api.db.query("select metadata::text as m from audit_log where action = 'member.account_deletion_requested'");
  for (const row of requestedMeta.rows) assert.ok(!row.m.includes(phone), 'the audit event carries no personal data');

  const early = await api.call('POST', '/v1/jobs/daily', { headers: { [JOB_HEADER]: JOB_TOKEN } });
  assert.equal(early.status, 200, early.text);
  assert.equal(early.body.purge.users, 0, 'nothing is erased inside the grace period');

  api.clock.advance(31 * DAY);
  const due = await api.call('POST', '/v1/jobs/daily', { headers: { [JOB_HEADER]: JOB_TOKEN } });
  assert.equal(due.status, 200, due.text);
  assert.equal(due.body.purge.users, 2, due.text);
  assert.deepEqual(due.body.purge.failed, []);

  const rows = await everyTextCell();
  assert.deepEqual(holding(rows, phone), [], 'no table holds the phone number');
  assert.deepEqual(holding(rows, phone.slice(3)), [], 'no table holds the bare digits');
  assert.deepEqual(holding(rows, email), [], 'no table holds the email');
  assert.deepEqual(holding(rows, googleSub), [], 'no table holds the Google subject');
  for (const id of [userId, googleUserId]) {
    assert.deepEqual(holding(rows, id).filter((table) => table !== 'audit_log'), [], 'only the audit trail keeps the bare id as a tombstone');
  }
  const users = await api.db.query('select count(*)::int as n from users where id = any($1)', [[userId, googleUserId]]);
  assert.equal(users.rows[0].n, 0);
  const staying = await api.db.query('select created_by from businesses where id = $1', [other.businessId]);
  assert.equal(staying.rowCount, 1, 'a business someone else owns stays');
  const gone = await api.db.query('select 1 from businesses where id = $1', [owner.businessId]);
  assert.equal(gone.rowCount, 0, 'the business only they owned is purged');

  const again = await api.call('POST', '/v1/jobs/daily', { headers: { [JOB_HEADER]: JOB_TOKEN } });
  assert.equal(again.body.purge.users, 0, 'the purge is idempotent');
});

test('signing in during the grace period cancels the account deletion', async () => {
  const phone = '+919300000073';
  await api.ownerWithBusiness(phone, { name: 'Changed Mind', state: '29' });
  const session = await api.signIn(phone);
  assert.equal((await api.call('DELETE', '/v1/me', { token: session.accessToken })).status, 200);
  api.clock.advance(5 * DAY);
  await api.signIn(phone);
  api.clock.advance(30 * DAY);
  const due = await api.call('POST', '/v1/jobs/daily', { headers: { [JOB_HEADER]: JOB_TOKEN } });
  assert.equal(due.body.purge.users, 0);
  const still = await api.db.query('select deleted_at from users where phone = $1', [phone]);
  assert.equal(still.rowCount, 1);
  assert.equal(still.rows[0].deleted_at, null);
});
