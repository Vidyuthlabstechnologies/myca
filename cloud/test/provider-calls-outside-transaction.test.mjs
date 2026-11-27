import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createBooksRunner } from '../src/books-runner.mjs';
import { journaledCall, providerFingerprint } from '../../platform/src/provider-journal.mjs';
import { startApi, BOOKS_KEY } from './helpers.mjs';

let api;
let runner;
let clock;

before(async () => {
  api = await startApi();
  clock = { at: Date.now() };
  const vault = { read: async () => [], write: async () => {} };
  runner = createBooksRunner({ db: api.db, now: () => clock.at, vault, booksKey: BOOKS_KEY });
});
after(() => api.close());

let counter = 0;
async function business() {
  counter += 1;
  const who = await api.ownerWithBusiness(`+9198000004${String(counter).padStart(2, '0')}`);
  const device = (await api.db.query('select id, user_id from devices order by created_at desc limit 1')).rows[0];
  return { businessId: who.businessId, context: { userId: device.user_id, deviceId: device.id, requestId: `req-${counter}` }, device };
}

const versionOf = async (businessId) => Number((await api.db.query('select version from books where business_id = $1', [businessId])).rows[0].version);

function fakeProvider(calls, answer = { ok: true, status: 200, data: { ack: 'ACK-1' } }) {
  return async () => {
    calls.n += 1;
    if (calls.during) await calls.during();
    return typeof answer === 'function' ? answer(calls.n) : answer;
  };
}

const callProvider = (calls, fp = 'file-gstr1', answer) => journaledCall(providerFingerprint(fp), fakeProvider(calls, answer));

test('while the government is being called, no transaction is open and the books row is not locked', async () => {
  const { businessId, context } = await business();
  const calls = { n: 0 };
  let lockedWhileCalling = null;
  calls.during = async () => {
    const open = await api.db.query("select count(*)::int as n from pg_stat_activity where datname = current_database() and state = 'idle in transaction'");
    lockedWhileCalling = open.rows[0].n;
    const probe = await api.db.query('select version from books where business_id = $1 for update nowait', [businessId]).then(() => 'free', (err) => err.code);
    assert.equal(probe, 'free', 'the row can be locked by someone else while the call is out');
  };
  const out = await runner.withProviderBooks(businessId, context, async (session) => {
    const answer = await callProvider(calls);
    session.state.company = { ...session.state.company, filedAck: answer.data.ack };
    session.persist();
    return { ok: true, ack: answer.data.ack };
  }, { key: 'gst:gstr1:file:2026-10:X' });
  assert.deepEqual(out, { ok: true, ack: 'ACK-1' });
  assert.equal(calls.n, 1);
  assert.equal(lockedWhileCalling, 0, 'no transaction sat idle during the call');
});

test('a commit that fails after the government answered is retried without calling the government again', async () => {
  const { businessId, context, device } = await business();
  const calls = { n: 0 };
  calls.during = async () => {
    if (calls.n === 1) await api.db.query('update devices set revoked_at = now() where id = $1', [device.id]);
  };
  const work = async (session) => {
    const answer = await callProvider(calls);
    session.state.company = { ...session.state.company, filedAck: answer.data.ack };
    session.persist();
    return { ok: true, ack: answer.data.ack };
  };
  const key = 'confirm:tok-1';
  await assert.rejects(runner.withProviderBooks(businessId, context, work, { key, replayMs: 24 * 3600 * 1000 }), (err) => err.statusCode === 401);
  assert.equal(calls.n, 1);
  const before = await versionOf(businessId);
  await api.db.query('update devices set revoked_at = null where id = $1', [device.id]);
  const out = await runner.withProviderBooks(businessId, context, work, { key, replayMs: 24 * 3600 * 1000 });
  assert.deepEqual(out, { ok: true, ack: 'ACK-1' });
  assert.equal(calls.n, 1, 'the government was not called a second time');
  assert.equal(await versionOf(businessId), before + 1, 'the result was written once');
});

test('if the books change while the call is out, the work is redone on the new books and the call is not repeated', async () => {
  const { businessId, context } = await business();
  const calls = { n: 0 };
  calls.during = async () => {
    if (calls.n === 1) await api.db.query('update books set version = version + 1 where business_id = $1', [businessId]);
  };
  let runs = 0;
  const out = await runner.withProviderBooks(businessId, context, async (session) => {
    runs += 1;
    const answer = await callProvider(calls);
    session.persist();
    return { ok: true, ack: answer.data.ack };
  }, { key: 'gst:gstr3b:file:2026-10:Y' });
  assert.equal(out.ack, 'ACK-1');
  assert.equal(runs, 2, 'redone once on the changed books');
  assert.equal(calls.n, 1, 'the government was called once');
});

test('two taps at the same moment: the second is refused while the first is out, and a later repeat replays the answer', async () => {
  const { businessId, context } = await business();
  const calls = { n: 0 };
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  calls.during = () => gate;
  const key = 'confirm:tok-double';
  const first = runner.withProviderBooks(businessId, context, async (session) => {
    const answer = await callProvider(calls);
    session.persist();
    return { ok: true, ack: answer.data.ack };
  }, { key });
  for (let n = 0; n < 50 && calls.n === 0; n += 1) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(calls.n, 1);
  await assert.rejects(runner.withProviderBooks(businessId, context, async () => ({ ok: true }), { key }), (err) => err.statusCode === 409 && err.body.error === 'PROVIDER_CALL_IN_PROGRESS');
  release();
  assert.equal((await first).ack, 'ACK-1');
  calls.during = null;
  const again = await runner.withProviderBooks(businessId, context, async (session) => {
    const answer = await callProvider(calls);
    session.persist();
    return { ok: true, ack: answer.data.ack };
  }, { key });
  assert.equal(again.ack, 'ACK-1');
  assert.equal(calls.n, 1, 'the repeat did not call the government again');
});

test('a refused or failed call is not remembered, so trying again really tries again', async () => {
  const { businessId, context } = await business();
  const calls = { n: 0 };
  const work = async (session) => {
    const answer = await callProvider(calls, 'save', (n) => (n === 1 ? { ok: false, error: 'GSP_DOWN' } : { ok: true, status: 200, data: { ack: 'OK-2' } }));
    session.persist();
    return answer;
  };
  const key = 'gst:gstr1:save:2026-10:Z';
  assert.equal((await runner.withProviderBooks(businessId, context, work, { key })).ok, false);
  assert.equal((await runner.withProviderBooks(businessId, context, work, { key })).data.ack, 'OK-2');
  assert.equal(calls.n, 2);
});

test('without a key nothing is claimed or remembered, and the books are still written only if unchanged', async () => {
  const { businessId, context } = await business();
  const calls = { n: 0 };
  const out = await runner.withProviderBooks(businessId, context, async (session) => {
    const answer = await callProvider(calls);
    session.persist();
    return answer.data;
  });
  assert.equal(out.ack, 'ACK-1');
  assert.equal((await api.db.query('select count(*)::int as n from provider_journal where business_id = $1', [businessId])).rows[0].n, 0);
});

test('what is remembered is sealed like the books and is gone after its time', async () => {
  const { businessId, context } = await business();
  const calls = { n: 0 };
  const key = 'gst:gstr1:save:2026-11:S';
  await runner.withProviderBooks(businessId, context, async (session) => {
    await callProvider(calls, 'save', { ok: true, status: 200, data: { taxpayer: 'SECRET-TAXPAYER-NAME' } });
    session.persist();
    return { ok: true };
  }, { key });
  const stored = await api.db.query('select response from provider_journal where business_id = $1 and key = $2 and seq = 1', [businessId, key]);
  assert.equal(stored.rowCount, 1);
  assert.doesNotMatch(JSON.stringify(stored.rows[0].response), /SECRET-TAXPAYER-NAME/);
  clock.at += 31 * 60 * 1000;
  await runner.withProviderBooks(businessId, context, async (session) => {
    await callProvider(calls, 'save', { ok: true, status: 200, data: { taxpayer: 'SECOND' } });
    session.persist();
    return { ok: true };
  }, { key });
  assert.equal(calls.n, 2, 'after thirty minutes the same step is a new request');
});

test('a claim left by a crashed request does not block for ever', async () => {
  const { businessId, context } = await business();
  const key = 'confirm:tok-crash';
  await api.db.query("insert into provider_journal (business_id, key, seq, fingerprint, response, created_at) values ($1, $2, 0, 'claim', '{}'::jsonb, to_timestamp($3 / 1000.0))", [businessId, key, clock.at]);
  await assert.rejects(runner.withProviderBooks(businessId, context, async () => ({ ok: true }), { key }), (err) => err.statusCode === 409);
  clock.at += 3 * 60 * 1000;
  const out = await runner.withProviderBooks(businessId, context, async (session) => { session.persist(); return { ok: true }; }, { key });
  assert.equal(out.ok, true);
});

test('the pending tool can be read without a lock so confirm can choose the right path', async () => {
  const { businessId } = await business();
  assert.equal(await runner.pendingToolName(businessId), '');
});
