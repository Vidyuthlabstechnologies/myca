import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi, SALE } from './helpers.mjs';

let api;
let asha;
before(async () => {
  api = await startApi();
  asha = await api.ownerWithBusiness('+919110000001', { name: 'Asha Traders', state: '29' });
});
after(async () => { await api.close(); });

const biz = (rest) => `/v1/businesses/${asha.businessId}/${rest}`;

test('an owner replaces the hosted books with a download or a Windows backup; it is verified, stored and audited; staff cannot', async () => {
  const held = await api.call('POST', biz('propose'), { token: asha.token, body: { name: 'create_invoice', args: SALE } });
  await api.call('POST', biz('confirm'), { token: asha.token, body: { token: held.body.preview.token } });
  await api.call('POST', biz('uploads'), { token: asha.token, body: { name: 'bill.txt', content: 'Supplier: Kiran Stores' } });
  const exported = (await api.call('GET', biz('export'), { token: asha.token })).body;
  assert.equal(exported.books.invoices.length, 1);

  const held2 = await api.call('POST', biz('propose'), { token: asha.token, body: { name: 'create_invoice', args: { ...SALE, partyName: 'Second Party' } } });
  await api.call('POST', biz('confirm'), { token: asha.token, body: { token: held2.body.preview.token } });
  assert.equal((await api.call('GET', biz('snapshot'), { token: asha.token })).body.invoices.length, 2);

  const replaced = await api.call('POST', biz('replace'), { token: asha.token, body: exported });
  assert.equal(replaced.status, 200, replaced.text);
  assert.equal(replaced.body.replaced, true);
  assert.equal(replaced.body.restored.invoices, 1);
  const snapshot = (await api.call('GET', biz('snapshot'), { token: asha.token })).body;
  assert.equal(snapshot.invoices.length, 1);
  assert.equal(snapshot.invoices[0].partyName, 'Kiran Stores');
  const audited = await api.db.query("select metadata from audit_log where business_id = $1 and action = 'books.replaced'", [asha.businessId]);
  assert.equal(audited.rowCount, 1);
  assert.equal(audited.rows[0].metadata.before.invoices, 2);
  assert.equal(audited.rows[0].metadata.after.invoices, 1);

  const tampered = JSON.parse(JSON.stringify(exported));
  const sha = Object.keys(tampered.documents)[0];
  tampered.documents[sha] = 'changed';
  const refused = await api.call('POST', biz('replace'), { token: asha.token, body: tampered });
  assert.equal(refused.body.error, 'INVALID_BACKUP');
  assert.equal(refused.body.reason, 'DOCUMENT_HASH_MISMATCH');
  const junk = await api.call('POST', biz('replace'), { token: asha.token, body: { hello: 'world' } });
  assert.equal(junk.body.error, 'INVALID_BACKUP');

  const sent = await api.call('POST', biz('invitations'), { token: asha.token, body: { phone: '+919110000002', role: 'staff' } });
  const staff = await api.signIn('+919110000002');
  await api.call('POST', `/v1/invitations/${sent.body.invitation.id}/accept`, { token: staff.accessToken });
  const denied = await api.call('POST', biz('replace'), { token: staff.accessToken, body: exported });
  assert.equal(denied.status, 403);
});
