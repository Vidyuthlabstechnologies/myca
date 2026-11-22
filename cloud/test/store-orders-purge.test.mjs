import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers.mjs';
import { JOB_HEADER } from '../src/jobs.mjs';
import { itemId } from '../../platform/src/catalogue.mjs';

const JOB_TOKEN = 'job-token-for-tests-0123456789abcdef0123456789';

let api;
before(async () => { api = await startApi({ jobToken: JOB_TOKEN }); });
after(async () => { await api.close(); });

async function posted(who, name, args) {
  const held = await api.call('POST', `/v1/businesses/${who.businessId}/propose`, { token: who.token, body: { name, args } });
  assert.ok(held.body.preview?.token, held.text);
  const done = await api.call('POST', `/v1/businesses/${who.businessId}/confirm`, { token: who.token, body: { token: held.body.preview.token } });
  assert.equal(done.body.posted, true, done.text);
  return done.body;
}

test('the daily job drops declined and fulfilled store orders after the keep period, from the books and the table', async () => {
  const owner = await api.ownerWithBusiness('+919850007701', { name: 'Old Orders', state: '29', gstin: '' });
  await posted(owner, 'set_sku_cost', { sku: 'TEA', name: 'Tea', cost: 90, price: 100, gstRate: 5 });
  await posted(owner, 'catalogue_items', { items: [{ sku: 'TEA', published: true }] });
  await posted(owner, 'catalogue_settings', { enabled: true, whatsapp: '9876543210' });
  for (const phone of ['9820011111', '9820022222']) {
    const placed = await api.call('POST', '/v1/store/old-orders/orders', { headers: { 'x-forwarded-for': '203.0.113.90' }, body: { buyerName: 'Buyer', buyerPhone: phone, lines: [{ id: itemId('TEA'), qty: 1 }] } });
    assert.equal(placed.status, 200, placed.text);
  }
  await posted(owner, 'store_order_action', { id: 'ORD-0001', action: 'decline' });
  api.clock.advance(91 * 24 * 60 * 60 * 1000);
  const ran = await api.call('POST', '/v1/jobs/daily', { headers: { [JOB_HEADER]: JOB_TOKEN } });
  assert.equal(ran.status, 200, ran.text);
  assert.equal(ran.body.purge.storeOrderRows, 1);
  const rows = (await api.db.query('select order_no, status from store_orders where business_id = $1 order by order_no', [owner.businessId])).rows;
  assert.deepEqual(rows, [{ order_no: 'ORD-0002', status: 'new' }]);
  const books = await api.books(owner.businessId);
  assert.deepEqual(books.catalogue.orders.map((order) => order.id), ['ORD-0002']);
});
