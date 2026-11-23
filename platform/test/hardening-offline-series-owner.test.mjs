import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { bookView } from '../src/book-view.mjs';

const DEVICE = 'phone-0001-abcdef';
const SALE = { ref: 'ref-00000001', id: 'INV-MA2627-0001', date: '2026-11-10', createdAt: '2026-11-10T10:00:00+05:30', partyName: 'Walk-in', lines: [{ description: 'Soap', qty: 2, rate: 100, gstRate: 18 }], printed: { taxable: 200, cgst: 18, sgst: 18, igst: 0, total: 236 } };

const as = (state, userId, role = 'staff') => bookView(state, state, { actor: { userId, role, name: userId } });

test('only the member who set up a phone for offline billing can sync bills under its series', async () => {
  const state = createState();
  const registered = await runTool(as(state, 'user-asha'), 'register_offline_device', { deviceId: DEVICE, deviceName: 'Counter' });
  assert.equal(registered.ok, true, JSON.stringify(registered));

  const other = await runTool(as(state, 'user-ravi'), 'post_offline_sales', { deviceId: DEVICE, sales: [SALE] });
  assert.equal(other.ok, false);
  assert.equal(other.error, 'SERIES_OF_ANOTHER_MEMBER');
  assert.equal(state.invoices.length, 0);

  assert.equal((await runTool(as(state, 'user-ravi'), 'offline_kit', { deviceId: DEVICE })).data.series, null, 'the kit does not hand the series to another member');
  assert.equal((await runTool(as(state, 'user-asha'), 'offline_kit', { deviceId: DEVICE })).data.series.code, 'MA');
  const claim = await runTool(as(state, 'user-ravi'), 'register_offline_device', { deviceId: DEVICE, deviceName: 'Counter' });
  assert.equal(claim.error, 'SERIES_OF_ANOTHER_MEMBER', 'registering again does not hand the series over');

  const mine = await runTool(as(state, 'user-asha'), 'post_offline_sales', { deviceId: DEVICE, sales: [SALE] });
  assert.equal(mine.ok, true, JSON.stringify(mine));
  assert.equal(mine.counts.posted, 1);
});

test('a series set up before members were recorded is claimed by the first member who syncs it', async () => {
  const state = createState();
  await runTool(state, 'register_offline_device', { deviceId: DEVICE, deviceName: 'Counter' });
  assert.equal(state.offlineSeries[0].memberId, undefined);
  const first = await runTool(as(state, 'user-asha'), 'post_offline_sales', { deviceId: DEVICE, sales: [SALE] });
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(state.offlineSeries[0].memberId, 'user-asha');
  assert.equal((await runTool(as(state, 'user-ravi'), 'post_offline_sales', { deviceId: DEVICE, sales: [SALE] })).error, 'SERIES_OF_ANOTHER_MEMBER');
});
