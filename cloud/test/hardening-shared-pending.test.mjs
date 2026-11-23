import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi, SALE } from './helpers.mjs';

let api;
let owner;
let staff;
before(async () => {
  api = await startApi();
  owner = await api.ownerWithBusiness('+919520000001', { name: 'Shared Pending Traders', state: '29' });
  const phone = '+919520000002';
  await api.call('POST', `/v1/businesses/${owner.businessId}/invitations`, { token: owner.token, body: { phone, role: 'staff' } });
  const signed = await api.signIn(phone);
  const invitation = (await api.call('GET', '/v1/me', { token: signed.accessToken })).body.invitations[0];
  await api.call('POST', `/v1/invitations/${invitation.id}/accept`, { token: signed.accessToken });
  staff = { token: signed.accessToken };
});
after(async () => { await api.close(); });

const biz = (rest) => `/v1/businesses/${owner.businessId}/${rest}`;
const invoiceCount = async () => (await api.call('GET', biz('snapshot'), { token: owner.token })).body.invoices.length;

test("one member's yes in chat does not post another member's preview", async () => {
  const before = await invoiceCount();
  const held = await api.call('POST', biz('propose'), { token: owner.token, body: { name: 'create_invoice', args: SALE } });
  assert.equal(held.body.awaitingConfirmation, true, held.text);

  const stranger = await api.call('POST', biz('ask'), { token: staff.token, body: { message: 'yes' } });
  assert.equal(stranger.status, 200, stranger.text);
  assert.notEqual(stranger.body.posted, true, stranger.text);
  assert.equal(await invoiceCount(), before, 'the staff member did not post the owner\'s invoice');

  const declined = await api.call('POST', biz('ask'), { token: staff.token, body: { message: 'no' } });
  assert.equal(declined.status, 200, declined.text);

  const mine = await api.call('POST', biz('confirm'), { token: owner.token, body: { token: held.body.preview.token } });
  assert.equal(mine.status, 200, mine.text);
  assert.equal(mine.body.posted, true, 'the owner\'s preview survived the other member\'s yes and no');
  assert.equal(await invoiceCount(), before + 1);
});

test("another member's code does not confirm or discard a preview that is not theirs", async () => {
  const before = await invoiceCount();
  const held = await api.call('POST', biz('propose'), { token: owner.token, body: { name: 'create_invoice', args: SALE } });
  const token = held.body.preview.token;

  const wrong = await api.call('POST', biz('confirm'), { token: staff.token, body: { token } });
  assert.notEqual(wrong.body.posted, true, wrong.text);
  assert.equal(await invoiceCount(), before);

  await api.call('POST', biz('discard'), { token: staff.token, body: {} });
  const mine = await api.call('POST', biz('confirm'), { token: owner.token, body: { token } });
  assert.equal(mine.body.posted, true, mine.text);
  assert.equal(await invoiceCount(), before + 1);
});
