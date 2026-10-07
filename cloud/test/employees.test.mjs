import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers.mjs';

let api;
before(async () => { api = await startApi(); });
after(async () => { await api.close(); });

test('over the API only the owner can add or see employees; staff and accountants are refused', async () => {
  const owner = await api.ownerWithBusiness('+919700000001', { name: 'Pay Traders', state: '29' });
  const at = (action) => `/v1/businesses/${owner.businessId}/${action}`;
  const held = await api.call('POST', at('propose'), { token: owner.token, body: { name: 'add_employee', args: { name: 'Ravi Kumar', joinedOn: '2026-09-01', components: [{ name: 'Basic', amount: 25000 }] } } });
  assert.equal(held.status, 200, held.text);
  assert.equal((await api.call('POST', at('confirm'), { token: owner.token, body: { token: held.body.preview.token } })).body.posted, true);
  const mine = await api.call('POST', at('query'), { token: owner.token, body: { name: 'list_employees' } });
  assert.equal(mine.body.data.monthlyTotal, 25000);

  for (const [phone, role] of [['+919700000002', 'staff'], ['+919700000003', 'accountant']]) {
    await api.call('POST', at('invitations'), { token: owner.token, body: { phone, role } });
    const member = await api.signIn(phone);
    const invite = (await api.call('GET', '/v1/me', { token: member.accessToken })).body.invitations[0];
    await api.call('POST', `/v1/invitations/${invite.id}/accept`, { token: member.accessToken });
    const listed = await api.call('POST', at('query'), { token: member.accessToken, body: { name: 'list_employees' } });
    assert.equal(listed.body.error, 'SALARIES_PRIVATE', role);
    assert.equal(JSON.stringify(listed.body).includes('25000'), false, `${role} sees no salary`);
    const add = await api.call('POST', at('propose'), { token: member.accessToken, body: { name: 'add_employee', args: { name: 'X', joinedOn: '2026-09-01', components: [{ name: 'Basic', amount: 1 }] } } });
    assert.match(add.body.reply, /Only the owner/, role);
    const snap = await api.call('GET', at('snapshot'), { token: member.accessToken });
    assert.equal(JSON.stringify(snap.body).includes('Ravi Kumar'), false, `${role}'s snapshot carries no employees`);
  }
});
