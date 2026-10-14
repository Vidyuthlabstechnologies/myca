import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_BUSINESS_BYTES } from '../src/api.mjs';
import { startApi, SALE } from './helpers.mjs';

let api;
let asha;
before(async () => {
  api = await startApi();
  asha = await api.ownerWithBusiness('+919600000001', { name: 'Asha Traders', state: '29' });
  await api.call('PATCH', '/v1/me', { token: asha.token, body: { name: 'Asha' } });
});
after(async () => { await api.close(); });

const biz = (owner, rest) => `/v1/businesses/${owner.businessId}${rest ? `/${rest}` : ''}`;
const version = async (who) => (await api.db.query('select version from books where business_id = $1', [who.businessId])).rows[0].version;

async function joinedMember(phone, role = 'staff') {
  const sent = await api.call('POST', biz(asha, 'invitations'), { token: asha.token, body: { phone, role } });
  assert.equal(sent.status, 200, sent.text);
  const person = await api.signIn(phone);
  const joined = await api.call('POST', `/v1/invitations/${sent.body.invitation.id}/accept`, { token: person.accessToken });
  assert.equal(joined.status, 200, joined.text);
  const me = (await api.call('GET', '/v1/me', { token: person.accessToken })).body;
  return { token: person.accessToken, id: me.user.id, invitation: sent.body };
}

test('an invitation is texted to the invited number from a fixed template that carries no typed names', async () => {
  const ravi = await joinedMember('+919600000002', 'accountant');
  assert.equal(ravi.invitation.notified, true);
  const text = api.sender.sent.find((row) => row.text);
  assert.ok(text, 'an SMS with text was sent');
  assert.equal(text.text, 'You have been invited to a business on MyCA as accountant. Install MyCA and sign in with this number to see it.');
  assert.doesNotMatch(text.text, /Asha/);
});

test("an owner changes a member's role, may make a second owner, and the last owner cannot be demoted", async () => {
  const ravi = await joinedMember('+919600000003', 'staff');
  const refused = await api.call('PATCH', biz(asha, `members/${ravi.id}`), { token: ravi.token, body: { role: 'owner' } });
  assert.equal(refused.body.error, 'OWNER_ONLY');
  const promoted = await api.call('PATCH', biz(asha, `members/${ravi.id}`), { token: asha.token, body: { role: 'owner' } });
  assert.equal(promoted.status, 200, promoted.text);
  assert.deepEqual([promoted.body.was, promoted.body.role], ['staff', 'owner']);
  const members = (await api.call('GET', biz(asha, 'members'), { token: asha.token })).body.members;
  assert.equal(members.filter((m) => m.role === 'owner').length, 2);
  const demoteSelf = await api.call('PATCH', biz(asha, `members/${ravi.id}`), { token: ravi.token, body: { role: 'accountant' } });
  assert.equal(demoteSelf.status, 200, demoteSelf.text);
  const last = await api.call('PATCH', biz(asha, `members/${(await api.call('GET', '/v1/me', { token: asha.token })).body.user.id}`), { token: asha.token, body: { role: 'staff' } });
  assert.equal(last.body.error, 'LAST_OWNER');
  const bad = await api.call('PATCH', biz(asha, `members/${ravi.id}`), { token: asha.token, body: { role: 'boss' } });
  assert.equal(bad.body.error, 'INVALID_ROLE');
  const audited = await api.db.query("select metadata from audit_log where business_id = $1 and action = 'member.role_changed' order by id", [asha.businessId]);
  assert.equal(audited.rowCount, 2);
  assert.deepEqual(audited.rows[0].metadata.to, 'owner');
});

test('a query or a snapshot no longer rewrites the books row, while a write still does', async () => {
  const before = await version(asha);
  await api.call('GET', biz(asha, 'snapshot'), { token: asha.token });
  await api.call('POST', biz(asha, 'query'), { token: asha.token, body: { name: 'business_summary', args: {} } });
  assert.equal(await version(asha), before, 'reads leave the version alone');
  const audited = await api.db.query("select count(*)::int as n from audit_log where business_id = $1 and action = 'tool.business_summary'", [asha.businessId]);
  assert.equal(audited.rows[0].n, 1, 'the read is still audited');
  const held = await api.call('POST', biz(asha, 'propose'), { token: asha.token, body: { name: 'create_invoice', args: SALE } });
  await api.call('POST', biz(asha, 'confirm'), { token: asha.token, body: { token: held.body.preview.token } });
  assert.ok((await version(asha)) > before);
});

test('uploads stop at the per-business storage cap', async () => {
  const total = await api.db.query('select coalesce(sum(bytes), 0)::bigint as total from documents where business_id = $1', [asha.businessId]);
  await api.db.query(
    'insert into documents (business_id, sha256, content, bytes) values ($1, $2, $3, $4)',
    [asha.businessId, 'a'.repeat(64), 'x', MAX_BUSINESS_BYTES - Number(total.rows[0].total) - 10],
  );
  const refused = await api.call('POST', biz(asha, 'uploads'), { token: asha.token, body: { name: 'big.csv', content: 'Date,Amount\n'.repeat(5) } });
  assert.equal(refused.status, 413, refused.text);
  assert.equal(refused.body.error, 'STORAGE_FULL');
  await api.db.query('delete from documents where business_id = $1 and sha256 = $2', [asha.businessId, 'a'.repeat(64)]);
  const ok = await api.call('POST', biz(asha, 'uploads'), { token: asha.token, body: { name: 'small.csv', content: 'Date,Amount\n' } });
  assert.equal(ok.status, 200, ok.text);
});

test('an owner deletes the business; it disappears for every member and only an owner may do it', async () => {
  const owner = await api.ownerWithBusiness('+919600000010', { name: 'Closing Shop', state: '29' });
  const sent = await api.call('POST', `/v1/businesses/${owner.businessId}/invitations`, { token: owner.token, body: { phone: '+919600000011', role: 'staff' } });
  const staff = await api.signIn('+919600000011');
  await api.call('POST', `/v1/invitations/${sent.body.invitation.id}/accept`, { token: staff.accessToken });
  const refused = await api.call('DELETE', `/v1/businesses/${owner.businessId}`, { token: staff.accessToken });
  assert.equal(refused.status, 403);
  const deleted = await api.call('DELETE', `/v1/businesses/${owner.businessId}`, { token: owner.token });
  assert.equal(deleted.status, 200, deleted.text);
  assert.equal(deleted.body.deleted, true);
  const mine = (await api.call('GET', '/v1/me', { token: owner.token })).body.businesses;
  assert.ok(!mine.some((b) => b.id === owner.businessId));
  const theirs = (await api.call('GET', '/v1/me', { token: staff.accessToken })).body.businesses;
  assert.ok(!theirs.some((b) => b.id === owner.businessId));
  const gone = await api.call('GET', `/v1/businesses/${owner.businessId}/snapshot`, { token: owner.token });
  assert.equal(gone.status, 404);
  const again = await api.call('DELETE', `/v1/businesses/${owner.businessId}`, { token: owner.token });
  assert.equal(again.status, 404);
});
