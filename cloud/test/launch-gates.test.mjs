import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi, BOOKS_KEY, SALE } from './helpers.mjs';
import { openState, sealState, isSealed } from '../src/books-seal.mjs';
import { JOB_HEADER, DELETION_GRACE_DAYS } from '../src/jobs.mjs';

const JOB_TOKEN = 'job-token-for-gates-0123456789abcdef0123456789';
let api;
before(async () => { api = await startApi({ jobToken: JOB_TOKEN }); });
after(async () => { await api.close(); });

const biz = (who, action) => `/v1/businesses/${who.businessId}/${action}`;
async function sell(owner) {
  const held = await api.call('POST', biz(owner, 'propose'), { token: owner.token, body: { name: 'create_invoice', args: SALE } });
  const done = await api.call('POST', biz(owner, 'confirm'), { token: owner.token, body: { token: held.body.preview.token } });
  assert.equal(done.body.posted, true, done.text);
}

test('the books column holds nothing readable without the key, opens with it, refuses the wrong one, and seals a legacy plain row on the next write', async () => {
  const owner = await api.ownerWithBusiness('+919700000201', { name: 'Sealed Traders', state: '29' });
  await sell(owner);
  const raw = (await api.db.query('select state::text as text, state from books where business_id = $1', [owner.businessId])).rows[0];
  assert.ok(isSealed(raw.state), 'the column holds a sealed string');
  assert.doesNotMatch(raw.text, /Kiran Stores|invoices|Sealed Traders/, 'no party, no field name, no business name in the clear');
  const opened = openState(BOOKS_KEY, owner.businessId, raw.state);
  assert.equal(opened.invoices.length, 1);
  assert.equal((await api.books(owner.businessId)).invoices[0].partyName, SALE.partyName);
  assert.throws(() => openState(`wrong-${BOOKS_KEY}`, owner.businessId, raw.state), /could not be opened/);
  assert.throws(() => openState('', owner.businessId, raw.state), /no MYCA_BOOKS_KEY/);
  const other = sealState(BOOKS_KEY, '00000000-0000-4000-8000-000000000000', JSON.stringify(opened));
  assert.throws(() => openState(BOOKS_KEY, owner.businessId, other), /could not be opened/, 'a row sealed for one business does not open under another');

  await api.db.query('update books set state = $2::jsonb where business_id = $1', [owner.businessId, JSON.stringify(opened)]);
  const plain = (await api.db.query('select state from books where business_id = $1', [owner.businessId])).rows[0].state;
  assert.equal(isSealed(plain), false);
  const snapshot = await api.call('GET', biz(owner, 'snapshot'), { token: owner.token });
  assert.equal(snapshot.status, 200, snapshot.text);
  assert.equal(snapshot.body.invoices.length, 1, 'a plain row from before the key still opens');
  await sell(owner);
  const resealed = (await api.db.query('select state from books where business_id = $1', [owner.businessId])).rows[0].state;
  assert.ok(isSealed(resealed), 'the first write after the key seals it');
  assert.equal((await api.books(owner.businessId)).invoices.length, 2);
});

test('every request to a business is in the access log, and only the owner can read who looked', async () => {
  const owner = await api.ownerWithBusiness('+919700000202', { name: 'Watched Traders', state: '29' });
  await api.call('POST', biz(owner, 'invitations'), { token: owner.token, body: { phone: '+919700000203', role: 'staff' } });
  const staff = await api.signIn('+919700000203');
  const me = await api.call('GET', '/v1/me', { token: staff.accessToken });
  await api.call('POST', `/v1/invitations/${me.body.invitations[0].id}/accept`, { token: staff.accessToken });
  await api.call('GET', biz(owner, 'snapshot'), { token: staff.accessToken });
  await api.call('GET', biz(owner, 'snapshot'), { token: owner.token });
  await sell(owner);
  const log = await api.call('GET', `${biz(owner, 'access')}?days=7`, { token: owner.token });
  assert.equal(log.status, 200, log.text);
  const actions = log.body.access.map((r) => `${r.role}:${r.method}:${r.action}`);
  assert.ok(actions.includes('staff:GET:snapshot'), JSON.stringify(actions));
  assert.ok(actions.includes('owner:POST:propose') && actions.includes('owner:POST:confirm'));
  assert.ok(log.body.access.every((r) => r.at && r.userId), 'every row says who and when');
  assert.match(log.body.note, /pgaudit/);
  const refused = await api.call('GET', biz(owner, 'access'), { token: staff.accessToken });
  assert.equal(refused.status, 403);
});

test('a business asked to be deleted is purged after the grace period with its books and documents, not before; old codes and crash reports go too', async () => {
  const owner = await api.ownerWithBusiness('+919700000204', { name: 'Leaving Traders', state: '29' });
  await sell(owner);
  const upload = await api.call('POST', biz(owner, 'uploads'), { token: owner.token, body: { name: 'bill.txt', content: 'Supplier: Kiran\nTotal: 1180' } });
  assert.equal(upload.status, 200, upload.text);
  const gone = await api.call('DELETE', `/v1/businesses/${owner.businessId}`, { token: owner.token });
  assert.equal(gone.status, 200, gone.text);
  await api.db.query("insert into crash_reports (fingerprint, app_version, kind, error_type, message, stack, occurrences, first_seen, last_seen) values ('old', '1.0', 'flutter', 'E', 'm', 's', 1, now() - interval '200 days', now() - interval '120 days')");
  const early = await api.call('POST', '/v1/jobs/daily', { headers: { [JOB_HEADER]: JOB_TOKEN } });
  assert.equal(early.status, 200, early.text);
  assert.equal(early.body.purge.businesses, 0, 'inside the grace period nothing is purged');
  assert.equal((await api.db.query('select count(*)::int as n from books where business_id = $1', [owner.businessId])).rows[0].n, 1);
  assert.equal(early.body.purge.crashRows, 1, 'a crash report older than ninety days goes');
  api.clock.advance((DELETION_GRACE_DAYS + 1) * 24 * 60 * 60 * 1000);
  const late = await api.call('POST', '/v1/jobs/daily', { headers: { [JOB_HEADER]: JOB_TOKEN } });
  assert.equal(late.status, 200, late.text);
  assert.equal(late.body.purge.businesses, 1, JSON.stringify(late.body.purge));
  assert.equal(late.body.purge.documents, 1);
  for (const table of ['books', 'documents', 'audit_log', 'access_log', 'memberships']) {
    assert.equal((await api.db.query(`select count(*)::int as n from ${table} where business_id = $1`, [owner.businessId])).rows[0].n, 0, table);
  }
  assert.equal((await api.db.query('select count(*)::int as n from businesses where id = $1', [owner.businessId])).rows[0].n, 0);
  const after = await api.call('GET', biz(owner, 'snapshot'), { token: owner.token });
  assert.ok([401, 404].includes(after.status), `the books are gone for the owner too (${after.status})`);
});
