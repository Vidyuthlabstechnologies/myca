import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi, SALE } from './helpers.mjs';
import { JOB_HEADER } from '../src/jobs.mjs';

const JOB_TOKEN = 'job-token-for-tests-0123456789abcdef0123456789';

let api;
let owner;
before(async () => {
  api = await startApi({ jobToken: JOB_TOKEN });
  owner = await api.ownerWithBusiness('+919200000031', { name: 'Kaveri Hardware', state: '29' });
  const held = await api.call('POST', `/v1/businesses/${owner.businessId}/propose`, { token: owner.token, body: { name: 'create_invoice', args: SALE } });
  await api.call('POST', `/v1/businesses/${owner.businessId}/confirm`, { token: owner.token, body: { token: held.body.preview.token } });
});
after(async () => { await api.close(); });

const daily = (headers) => api.call('POST', '/v1/jobs/daily', { headers });

test('the daily job runs the checks for every business once, is idempotent, and is refused without the job token', async () => {
  const refused = await daily({});
  assert.equal(refused.status, 404, refused.text);
  const wrong = await daily({ [JOB_HEADER]: 'nope' });
  assert.equal(wrong.status, 404, wrong.text);

  const first = await daily({ [JOB_HEADER]: JOB_TOKEN });
  assert.equal(first.status, 200, first.text);
  assert.equal(first.body.businesses, 1);
  assert.equal(first.body.ran, 1);
  assert.equal(first.body.failed.length, 0);
  assert.deepEqual(first.body.billing, { checked: 0, changed: 0, failed: 0 }, 'the daily job reports its Play renewal check');

  const status = await api.call('POST', `/v1/businesses/${owner.businessId}/query`, { token: owner.token, body: { name: 'automation_status', args: {} } });
  assert.equal(status.status, 200, status.text);
  assert.match(status.body.data.lastRun, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(status.body.data.last.chain.ok, true);

  const again = await daily({ [JOB_HEADER]: JOB_TOKEN });
  assert.equal(again.body.skipped, 1);
  assert.equal(again.body.ran, 0);

  const audited = await api.db.query("select count(*)::int as n from audit_log where business_id = $1 and action = 'tool.run_automation'", [owner.businessId]);
  assert.equal(audited.rows[0].n, 2, 'each run is audited');
});
