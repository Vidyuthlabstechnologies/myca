import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { INBOUND_HEADER } from '../src/inbound.mjs';
import { startApi } from './helpers.mjs';
import { setModelTransport } from '../../platform/src/model-adapter.mjs';

let api;
let asha;
before(async () => {
  api = await startApi();
  asha = await api.ownerWithBusiness('+919700000001', { name: 'Asha Traders', state: '29' });
});
after(async () => { setModelTransport(null); await api.close(); });

const biz = (rest) => `/v1/businesses/${asha.businessId}/${rest}`;
const SALE = { saleId: 'POS-1001', lines: [{ description: 'Tea', qty: 2, rate: 50, gstRate: 5 }] };

test('an owner creates a POS key, the secret is shown once, and a sale posts without confirmation and only once', async () => {
  const created = await api.call('POST', biz('inbound'), { token: asha.token, body: { label: 'Counter till', source: 'pos' } });
  assert.equal(created.status, 200, created.text);
  const key = created.body.key;
  assert.match(key.secret, /^mk_/);
  const listed = await api.call('GET', biz('inbound'), { token: asha.token });
  assert.equal(listed.body.keys.length, 1);
  assert.equal(listed.body.keys[0].secret, undefined, 'the secret is never listed');
  assert.equal(listed.body.keys[0].enabled, true);

  const first = await api.call('POST', '/v1/inbound/sales', { headers: { [INBOUND_HEADER]: key.secret }, body: SALE });
  assert.equal(first.status, 200, first.text);
  assert.match(first.body.invoiceId, /^INV-/);
  assert.equal(first.body.total, 105);
  assert.equal(first.body.duplicate, false);
  const again = await api.call('POST', '/v1/inbound/sales', { headers: { [INBOUND_HEADER]: key.secret }, body: SALE });
  assert.equal(again.body.duplicate, true);
  assert.equal(again.body.invoiceId, first.body.invoiceId);

  const snapshot = (await api.call('GET', biz('snapshot'), { token: asha.token })).body;
  assert.equal(snapshot.invoices.filter((inv) => inv.partyName === 'Counter sale').length, 1);
  const today = (await api.call('GET', biz('inbound'), { token: asha.token })).body.keys[0];
  assert.deepEqual([today.todayCount, today.todayTotal], [1, 105]);
  const audited = await api.db.query("select metadata from audit_log where business_id = $1 and action = 'tool.create_invoice' order by id desc limit 1", [asha.businessId]);
  assert.equal(audited.rowCount, 1);
});

test('a bad key, a wrong source, a missing sale id and a disabled key are all refused', async () => {
  const bad = await api.call('POST', '/v1/inbound/sales', { headers: { [INBOUND_HEADER]: 'mk_nope' }, body: SALE });
  assert.equal(bad.status, 401);
  const docs = (await api.call('POST', biz('inbound'), { token: asha.token, body: { label: 'Mail inbox', source: 'documents' } })).body.key;
  const wrongSource = await api.call('POST', '/v1/inbound/sales', { headers: { [INBOUND_HEADER]: docs.secret }, body: SALE });
  assert.equal(wrongSource.body.error, 'KEY_NOT_FOR_SALES');
  const pos = (await api.call('POST', biz('inbound'), { token: asha.token, body: { label: 'Second till', source: 'pos' } })).body.key;
  const noId = await api.call('POST', '/v1/inbound/sales', { headers: { [INBOUND_HEADER]: pos.secret }, body: { lines: SALE.lines } });
  assert.equal(noId.body.error, 'INVALID_SALE_ID');
  const off = await api.call('DELETE', biz(`inbound/${pos.id}`), { token: asha.token });
  assert.equal(off.status, 200, off.text);
  const afterOff = await api.call('POST', '/v1/inbound/sales', { headers: { [INBOUND_HEADER]: pos.secret }, body: { ...SALE, saleId: 'POS-2' } });
  assert.equal(afterOff.status, 401);
  const twice = await api.call('DELETE', biz(`inbound/${pos.id}`), { token: asha.token });
  assert.equal(twice.status, 404);
});

test('a forwarded document is stored and leaves a reminder, and only an owner manages keys', async () => {
  const docs = (await api.call('POST', biz('inbound'), { token: asha.token, body: { label: 'Mail inbox', source: 'documents' } })).body.key;
  const stored = await api.call('POST', '/v1/inbound/documents', { headers: { [INBOUND_HEADER]: docs.secret }, body: { name: 'bill-77.txt', content: 'Supplier: Kiran Stores\nTotal: 1180', from: 'kiran@example.com' } });
  assert.equal(stored.status, 200, stored.text);
  assert.match(stored.body.sha256, /^[a-f0-9]{64}$/);
  const reminders = await api.call('POST', biz('query'), { token: asha.token, body: { name: 'list_reminders', args: {} } });
  const texts = JSON.stringify(reminders.body);
  assert.match(texts, /bill-77\.txt/);
  assert.match(texts, /kiran@example\.com/);

  const sent = await api.call('POST', biz('invitations'), { token: asha.token, body: { phone: '+919700000002', role: 'staff' } });
  const staff = await api.signIn('+919700000002');
  await api.call('POST', `/v1/invitations/${sent.body.invitation.id}/accept`, { token: staff.accessToken });
  const refused = await api.call('POST', biz('inbound'), { token: staff.accessToken, body: { label: 'x', source: 'pos' } });
  assert.equal(refused.status, 403);
  const refusedList = await api.call('GET', biz('inbound'), { token: staff.accessToken });
  assert.equal(refusedList.status, 403);
});

test('with the model on, a document that arrives is read into a reminder that names the supplier and carries the file, so the phone opens it straight into the bill preview; the reminder holds no amount', async () => {
  const docs = (await api.call('POST', biz('inbound'), { token: asha.token, body: { label: 'Scanner', source: 'documents' } })).body.key;
  setModelTransport(async () => ({ ok: true, response: { content: [{ type: 'tool_use', id: 'tu_1', name: 'supplier_bill', input: { supplierName: 'Ganga Mills', invoiceNo: 'GM/221', date: '2026-10-03', lines: [{ description: 'Cotton yarn', hsn: '5205', qty: 10, rate: 1200, gstRate: 5 }], total: 12600, confidence: 0.9 } }] } }));
  const stored = await api.call('POST', '/v1/inbound/documents', { headers: { [INBOUND_HEADER]: docs.secret }, body: { name: 'bill-78.txt', content: 'Ganga Mills GM/221 Cotton yarn 10 x 1200', from: 'accounts@ganga.example' } });
  assert.equal(stored.status, 200, stored.text);
  assert.equal(stored.body.read, true);
  const reminders = (await api.call('POST', biz('query'), { token: asha.token, body: { name: 'list_reminders', args: {} } })).body.data.reminders;
  const noted = reminders.find((item) => item.documentSha256 === stored.body.sha256);
  assert.ok(noted, JSON.stringify(reminders));
  assert.equal(noted.text, 'Bill from Ganga Mills (GM/221) dated 2026-10-03 arrived from accounts@ganga.example through Scanner: bill-78.txt. Open it to check the lines and post it.');
  assert.equal(noted.documentName, 'bill-78.txt');
  assert.equal(noted.about.kind, 'document');
  assert.doesNotMatch(noted.text, /12,?600/);
  const again = await api.call('POST', biz('query'), { token: asha.token, body: { name: 'read_document', args: { documentSha256: stored.body.sha256 } } });
  assert.ok(again.body.data, again.text);
  assert.equal(again.body.data.proposal.args.partyName, 'Ganga Mills');
  setModelTransport(null);
  const plain = await api.call('POST', '/v1/inbound/documents', { headers: { [INBOUND_HEADER]: docs.secret }, body: { name: 'note.txt', content: 'hello' } });
  assert.equal(plain.body.read, false);
  const later = (await api.call('POST', biz('query'), { token: asha.token, body: { name: 'list_reminders', args: {} } })).body.data.reminders;
  assert.match(later.find((item) => item.documentSha256 === plain.body.sha256).text, /^A document arrived through Scanner: note\.txt\./);
});
