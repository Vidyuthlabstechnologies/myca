import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { INVITE_TTL_DAYS, MAX_OPEN_INVITES } from '../src/members.mjs';
import { startApi, SALE } from './helpers.mjs';

let api;
let asha;
before(async () => {
  api = await startApi();
  asha = await api.ownerWithBusiness('+919500000001', { name: 'Asha Traders', state: '29' });
  await api.call('PATCH', '/v1/me', { token: asha.token, body: { name: 'Asha' } });
});
after(async () => { await api.close(); });

let nextPhone = 9510000000;
const freshPhone = () => `+91${nextPhone++}`;
const biz = (owner, rest) => `/v1/businesses/${owner.businessId}/${rest}`;
const invite = (owner, phone, role = 'staff') => api.call('POST', biz(owner, 'invitations'), { token: owner.token, body: { phone, role } });
const me = async (token) => (await api.call('GET', '/v1/me', { token })).body;

test('an invited person sees the invitation after signing in, and joins only by accepting', async () => {
  const phone = freshPhone();
  const sent = await invite(asha, phone, 'accountant');
  assert.equal(sent.status, 200, sent.text);
  assert.equal(sent.body.invitation.role, 'accountant');
  assert.equal(sent.body.invitation.phoneHint, `xxxxxxx${phone.slice(-3)}`);

  const ravi = await api.signIn(phone);
  const before = await me(ravi.accessToken);
  assert.deepEqual(before.businesses, []);
  assert.deepEqual(before.invitations.map((i) => [i.businessName, i.role, i.invitedBy]), [['Asha Traders', 'accountant', 'Asha']]);
  assert.equal((await api.call('GET', biz(asha, 'snapshot'), { token: ravi.accessToken })).status, 404, 'no access before accepting');

  const accepted = await api.call('POST', `/v1/invitations/${before.invitations[0].id}/accept`, { token: ravi.accessToken });
  assert.equal(accepted.status, 200, accepted.text);
  assert.deepEqual(accepted.body.business, { id: asha.businessId, name: 'Asha Traders', role: 'accountant' });
  const snapshot = await api.call('GET', biz(asha, 'snapshot'), { token: ravi.accessToken });
  assert.equal(snapshot.status, 200);
  assert.equal(snapshot.body.role, 'accountant');
  assert.deepEqual((await me(ravi.accessToken)).invitations, []);

  const again = await api.call('POST', `/v1/invitations/${before.invitations[0].id}/accept`, { token: ravi.accessToken });
  assert.equal(again.status, 404);
});

test('an invited member can work in the books but cannot manage people or the profile', async () => {
  const phone = freshPhone();
  await invite(asha, phone, 'staff');
  const staff = await api.signIn(phone);
  const pending = (await me(staff.accessToken)).invitations[0];
  await api.call('POST', `/v1/invitations/${pending.id}/accept`, { token: staff.accessToken });

  const held = await api.call('POST', biz(asha, 'propose'), { token: staff.accessToken, body: { name: 'create_invoice', args: SALE } });
  assert.equal(held.body.awaitingConfirmation, true, held.text);
  await api.call('POST', biz(asha, 'discard'), { token: staff.accessToken, body: {} });

  assert.equal((await invite({ ...asha, token: staff.accessToken }, freshPhone())).status, 403);
  assert.equal((await api.call('POST', biz(asha, 'company'), { token: staff.accessToken, body: { name: 'Mine Now' } })).status, 403);
  const listed = await api.call('GET', biz(asha, 'members'), { token: staff.accessToken });
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.body.invitations, [], 'only the owner sees pending invitations');
  assert.equal((await api.call('DELETE', biz(asha, `members/${asha.user.id}`), { token: staff.accessToken })).status, 403);
});

test('an invitation is bound to the invited number', async () => {
  const invited = freshPhone();
  const sent = await invite(asha, invited);
  const stranger = await api.signIn(freshPhone());
  assert.deepEqual((await me(stranger.accessToken)).invitations, []);
  for (const verb of ['accept', 'decline']) {
    const out = await api.call('POST', `/v1/invitations/${sent.body.invitation.id}/${verb}`, { token: stranger.accessToken });
    assert.equal(out.status, 404, verb);
    assert.equal(out.body.error, 'INVITATION_NOT_FOUND');
  }
  assert.equal((await api.call('GET', biz(asha, 'snapshot'), { token: stranger.accessToken })).status, 404);
  const rightful = await api.signIn(invited);
  assert.equal((await me(rightful.accessToken)).invitations.length, 1, 'the real invitee still has it');
});

test('declined, revoked and expired invitations cannot be accepted', async () => {
  const declinedPhone = freshPhone();
  await invite(asha, declinedPhone);
  const decliner = await api.signIn(declinedPhone);
  const declined = (await me(decliner.accessToken)).invitations[0];
  assert.equal((await api.call('POST', `/v1/invitations/${declined.id}/decline`, { token: decliner.accessToken })).body.declined, true);
  assert.equal((await api.call('POST', `/v1/invitations/${declined.id}/accept`, { token: decliner.accessToken })).status, 404);

  const revokedPhone = freshPhone();
  const toRevoke = await invite(asha, revokedPhone);
  assert.equal((await api.call('DELETE', biz(asha, `invitations/${toRevoke.body.invitation.id}`), { token: asha.token })).status, 200);
  const revoked = await api.signIn(revokedPhone);
  assert.deepEqual((await me(revoked.accessToken)).invitations, []);
  assert.equal((await api.call('POST', `/v1/invitations/${toRevoke.body.invitation.id}/accept`, { token: revoked.accessToken })).status, 404);

  const latePhone = freshPhone();
  const stale = await invite(asha, latePhone);
  const late = await api.signIn(latePhone);
  api.clock.advance(INVITE_TTL_DAYS * 24 * 60 * 60 * 1000 + 1000);
  const fresh = await api.signIn(latePhone);
  assert.deepEqual((await me(fresh.accessToken)).invitations, []);
  const out = await api.call('POST', `/v1/invitations/${stale.body.invitation.id}/accept`, { token: fresh.accessToken });
  assert.equal(out.body.error, 'INVITATION_EXPIRED');
  assert.ok(late.accessToken);
  asha = { ...asha, ...(await api.signIn('+919500000001')) };
  asha.token = asha.accessToken;
});

test('invitations are validated, deduplicated and limited', async () => {
  assert.equal((await invite(asha, '12345')).body.error, 'INVALID_PHONE');
  assert.equal((await invite(asha, freshPhone(), 'owner')).body.error, 'INVALID_ROLE');
  assert.equal((await invite(asha, '+919500000001')).body.error, 'ALREADY_A_MEMBER');

  const phone = freshPhone();
  const first = await invite(asha, phone, 'staff');
  const second = await invite(asha, phone, 'accountant');
  assert.notEqual(first.body.invitation.id, second.body.invitation.id);
  const person = await api.signIn(phone);
  assert.deepEqual((await me(person.accessToken)).invitations.map((i) => i.role), ['accountant'], 'the newer invitation replaces the older');

  const crowded = await api.ownerWithBusiness(freshPhone(), { name: 'Crowded', state: '33' });
  for (let i = 0; i < MAX_OPEN_INVITES; i++) assert.equal((await invite(crowded, freshPhone())).status, 200);
  assert.equal((await invite(crowded, freshPhone())).body.error, 'TOO_MANY_INVITATIONS');
});

test('the invitation table holds no phone number', async () => {
  const phone = freshPhone();
  const sent = await invite(asha, phone);
  const rows = await api.db.query('select * from invitations where id = $1', [sent.body.invitation.id]);
  const text = JSON.stringify(rows.rows[0]);
  assert.equal(text.includes(phone), false);
  assert.equal(text.includes(phone.slice(-10)), false);
  assert.equal(rows.rows[0].phone_hint, `xxxxxxx${phone.slice(-3)}`);
});

test('an owner can remove a member, a member can leave, and the last owner cannot go', async () => {
  const phone = freshPhone();
  await invite(asha, phone);
  const member = await api.signIn(phone);
  const pending = (await me(member.accessToken)).invitations[0];
  await api.call('POST', `/v1/invitations/${pending.id}/accept`, { token: member.accessToken });
  assert.equal((await api.call('GET', biz(asha, 'snapshot'), { token: member.accessToken })).status, 200);

  const removed = await api.call('DELETE', biz(asha, `members/${member.user.id}`), { token: asha.token });
  assert.equal(removed.status, 200, removed.text);
  assert.equal((await api.call('GET', biz(asha, 'snapshot'), { token: member.accessToken })).status, 404, 'access ends at once');
  assert.equal((await api.call('DELETE', biz(asha, `members/${member.user.id}`), { token: asha.token })).status, 404);

  const leaverPhone = freshPhone();
  await invite(asha, leaverPhone);
  const leaver = await api.signIn(leaverPhone);
  const invitation = (await me(leaver.accessToken)).invitations[0];
  await api.call('POST', `/v1/invitations/${invitation.id}/accept`, { token: leaver.accessToken });
  assert.equal((await api.call('DELETE', biz(asha, `members/${leaver.user.id}`), { token: leaver.accessToken })).status, 200);

  const sole = await api.call('DELETE', biz(asha, `members/${asha.user.id}`), { token: asha.token });
  assert.equal(sole.body.error, 'LAST_OWNER');
  assert.equal((await api.call('GET', biz(asha, 'snapshot'), { token: asha.token })).status, 200);
});

test('people from another business cannot invite into, list or remove from this one', async () => {
  const other = await api.ownerWithBusiness(freshPhone(), { name: 'Other Stores', state: '27' });
  const target = { ...asha, token: other.token };
  assert.equal((await invite(target, freshPhone())).status, 404);
  assert.equal((await api.call('GET', biz(asha, 'members'), { token: other.token })).status, 404);
  assert.equal((await api.call('DELETE', biz(asha, `members/${asha.user.id}`), { token: other.token })).status, 404);
  const mine = await invite(asha, freshPhone());
  assert.equal((await api.call('DELETE', biz(asha, `invitations/${mine.body.invitation.id}`), { token: other.token })).status, 404);
  assert.equal((await api.call('DELETE', biz(other, `invitations/${mine.body.invitation.id}`), { token: other.token })).status, 404);
});

test('membership changes are written to the audit log', async () => {
  const actions = (await api.db.query('select distinct action from audit_log where business_id = $1 and action like $2', [asha.businessId, 'member.%'])).rows.map((r) => r.action).sort();
  assert.deepEqual(actions, ['member.invite', 'member.invite_declined', 'member.invite_revoked', 'member.joined', 'member.left', 'member.removed']);
});
