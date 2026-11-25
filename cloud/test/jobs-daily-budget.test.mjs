import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJobs } from '../src/jobs.mjs';

function fixture({ businesses, budget, step }) {
  let ticks = 0;
  const processed = [];
  const queries = [];
  const db = {
    query: async (sql) => {
      queries.push(sql);
      if (sql.includes('from books b')) return { rowCount: businesses, rows: Array.from({ length: businesses }, (_, at) => ({ business_id: `b${at}` })) };
      if (sql.includes('count(*)')) return { rowCount: 1, rows: [{ n: 0 }] };
      return { rowCount: 0, rows: [] };
    },
  };
  const withBooks = async (businessId) => {
    processed.push(businessId);
    return { ok: true, data: { skipped: false, run: { reminders: [], warnings: [] } } };
  };
  const clock = () => {
    const now = ticks * step;
    ticks += 1;
    return now;
  };
  const jobs = createJobs({ db, withBooks, dailyBudgetMs: budget, clock, log: () => {} });
  return { jobs, processed, queries };
}

test('a daily run that outlasts its time budget stops cleanly, says how many are left, and still runs billing and the purge', async () => {
  const { jobs, processed, queries } = fixture({ businesses: 5, budget: 45000, step: 30000 });
  const summary = await jobs.daily('req-1');
  assert.equal(summary.partial, true);
  assert.equal(summary.ran, processed.length);
  assert.equal(summary.remaining, 5 - processed.length);
  assert.ok(processed.length >= 1 && processed.length < 5);
  assert.equal(queries.some((sql) => sql.includes('delete from access_log')), true, 'erasure and retention are never starved by a long business list');
  assert.deepEqual(summary.billing, { checked: 0, changed: 0, failed: 0 });
  assert.ok(summary.purge, 'the purge result is reported');
});

test('a daily run inside its budget finishes every business and does the purge', async () => {
  const { jobs, processed, queries } = fixture({ businesses: 3, budget: 45000, step: 1 });
  const summary = await jobs.daily('req-2');
  assert.equal(summary.partial, undefined);
  assert.equal(summary.ran, 3);
  assert.deepEqual(processed, ['b0', 'b1', 'b2']);
  assert.equal(queries.some((sql) => sql.includes('delete from access_log')), true);
});
