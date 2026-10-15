import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi, SALE } from './helpers.mjs';

let api;
let asha;
before(async () => {
  api = await startApi();
  asha = await api.ownerWithBusiness('+919900000001', { name: 'Asha Traders', state: '29' });
});
after(async () => { await api.close(); });

const biz = (rest) => `/v1/businesses/${asha.businessId}/${rest}`;

test('an owner downloads everything about the business in one document; staff cannot; the download is audited', async () => {
  const held = await api.call('POST', biz('propose'), { token: asha.token, body: { name: 'create_invoice', args: SALE } });
  await api.call('POST', biz('confirm'), { token: asha.token, body: { token: held.body.preview.token } });
  const up = await api.call('POST', biz('uploads'), { token: asha.token, body: { name: 'bill.txt', content: 'Supplier: Kiran Stores' } });
  assert.equal(up.status, 200, up.text);
  await api.call('POST', biz('inbound'), { token: asha.token, body: { label: 'Till', source: 'pos' } });

  const out = await api.call('GET', biz('export'), { token: asha.token });
  assert.equal(out.status, 200, out.text);
  const body = out.body;
  assert.equal(body.business.name, 'Asha Traders');
  assert.match(body.exportedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(body.books.invoices.length, 1);
  assert.equal(body.books.invoices[0].partyName, 'Kiran Stores');
  assert.deepEqual(Object.keys(body.documents), [up.body.sha256]);
  assert.equal(body.documents[up.body.sha256], 'Supplier: Kiran Stores');
  assert.equal(body.members.length, 1);
  assert.equal(body.connections.length, 1);
  assert.equal(body.connections[0].secret, undefined);
  assert.ok(body.audit.some((row) => row.action === 'tool.create_invoice'));
  assert.equal(body.books.pinHash, undefined);

  const audited = await api.db.query("select metadata from audit_log where business_id = $1 and action = 'business.exported'", [asha.businessId]);
  assert.equal(audited.rowCount, 1);
  assert.equal(audited.rows[0].metadata.documents, 1);

  const sent = await api.call('POST', biz('invitations'), { token: asha.token, body: { phone: '+919900000002', role: 'staff' } });
  const staff = await api.signIn('+919900000002');
  await api.call('POST', `/v1/invitations/${sent.body.invitation.id}/accept`, { token: staff.accessToken });
  const refused = await api.call('GET', biz('export'), { token: staff.accessToken });
  assert.equal(refused.status, 403);
});
