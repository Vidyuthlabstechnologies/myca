import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/api.mjs';
import { startApi, SALE, SECRET } from './helpers.mjs';

let api;
let owner;
before(async () => {
  api = await startApi();
  owner = await api.ownerWithBusiness('+919200000001', { name: 'Kaveri Hardware', state: '29' });
});
after(async () => { await api.close(); });

const post = (action, body, who = owner) => api.call('POST', `/v1/businesses/${who.businessId}/${action}`, { token: who.token, body });
const snapshot = async (who = owner) => (await api.call('GET', `/v1/businesses/${who.businessId}/snapshot`, { token: who.token })).body;
const version = async (who = owner) => (await api.db.query('select version from books where business_id = $1', [who.businessId])).rows[0].version;

test('a preview survives between requests and posts with engine figures', async () => {
  const held = await post('propose', { name: 'create_invoice', args: SALE });
  assert.equal(held.status, 200, held.text);
  assert.equal(held.body.awaitingConfirmation, true);
  assert.equal(held.body.preview.figures.total, 9440);
  assert.equal((await snapshot()).invoices.length, 0);

  const posted = await post('confirm', { token: held.body.preview.token });
  assert.equal(posted.body.posted, true, posted.text);
  const books = await snapshot();
  assert.deepEqual(books.invoices.map((i) => [i.id, i.partyName, i.total, i.cgst, i.sgst]), [['INV-0001', 'Kiran Stores', 9440, 720, 720]]);

  const replay = await post('confirm', { token: held.body.preview.token });
  assert.equal(replay.body.replayed, true);
  assert.equal(replay.body.reply, posted.body.reply);
  assert.equal((await snapshot()).invoices.length, 1);
});

test('two confirmations of one preview at the same moment post exactly once', async () => {
  const before = (await snapshot()).invoices.length;
  const held = await post('propose', { name: 'create_invoice', args: SALE });
  const token = held.body.preview.token;
  const results = await Promise.all(Array.from({ length: 6 }, () => post('confirm', { token })));
  assert.equal(results.every((r) => r.status === 200 && r.body.posted === true), true);
  assert.equal(results.filter((r) => r.body.replayed !== true).length, 1);
  const books = await snapshot();
  assert.equal(books.invoices.length, before + 1);
  assert.equal(new Set(books.invoices.map((i) => i.id)).size, books.invoices.length);
});

test('requests arriving together are applied one after another with none lost', async () => {
  const startVersion = await version();
  const startAudit = (await api.db.query('select count(*)::int as n from audit_log where business_id = $1', [owner.businessId])).rows[0].n;
  const burst = await Promise.all(Array.from({ length: 16 }, (_, i) => post('query', { name: i % 2 ? 'gst_payable' : 'deadlines' })));
  assert.equal(burst.every((r) => r.status === 200 && r.body.ok === true), true);
  assert.equal(await version(), startVersion + 16);
  const endAudit = (await api.db.query('select count(*)::int as n from audit_log where business_id = $1', [owner.businessId])).rows[0].n;
  assert.equal(endAudit, startAudit + 16);
  const trial = await post('query', { name: 'trial_balance' });
  assert.equal(trial.body.ok, true);
});

test('figures come from the engine: a sale changes GST payable by its tax', async () => {
  const before = (await post('query', { name: 'gst_payable' })).body.data.payable;
  const held = await post('propose', { name: 'create_invoice', args: SALE });
  await post('confirm', { token: held.body.preview.token });
  const after = (await post('query', { name: 'gst_payable' })).body.data.payable;
  assert.equal(after - before, 1440);
});

test('a discarded preview posts nothing, and its token is dead', async () => {
  const before = (await snapshot()).invoices.length;
  const held = await post('propose', { name: 'create_invoice', args: SALE });
  assert.match((await post('discard', {})).body.reply, /^Not posted: /);
  const late = await post('confirm', { token: held.body.preview.token });
  assert.notEqual(late.body.posted, true);
  assert.equal((await snapshot()).invoices.length, before);
});

test('only safe actions can be proposed, and query refuses anything that writes', async () => {
  for (const [name, error] of [
    ['seed_demo', 'NOT_PROPOSABLE'],
    ['govt_generate_irn', 'NOT_PROPOSABLE'],
    ['govt_save_credentials', 'NOT_PROPOSABLE'],
    ['approval_decide', 'NOT_PROPOSABLE'],
    ['', 'NOT_PROPOSABLE'],
  ]) {
    const out = await post('propose', { name, args: {} });
    assert.equal(out.status, 400, name);
    assert.equal(out.body.error, error, name);
  }
  for (const name of ['create_invoice', 'seed_demo', 'set_company', 'govt_probe', 'save_document']) {
    const out = await post('query', { name, args: SALE });
    assert.equal(out.body.error, 'NOT_QUERYABLE', name);
  }
  const blocked = await post('propose', { name: 'create_invoice', args: { ...SALE, lines: [{ description: 'x', qty: 1, rate: 100 }] } });
  assert.notEqual(blocked.body.awaitingConfirmation, true);
});

test('the audit log records who did what from which device, and cannot be edited', async () => {
  const held = await post('propose', { name: 'create_invoice', args: SALE });
  const confirmed = await post('confirm', { token: held.body.preview.token });
  const rows = await api.db.query(
    'select user_id, device_id, request_id, action from audit_log where business_id = $1 order by id desc limit 2',
    [owner.businessId],
  );
  assert.deepEqual(rows.rows.map((r) => r.action), ['chat.confirm', 'chat.propose']);
  assert.equal(rows.rows[0].user_id, owner.user.id);
  assert.equal(rows.rows[0].request_id, confirmed.requestId);
  assert.match(rows.rows[0].device_id, /^[0-9a-f-]{36}$/);
  await assert.rejects(api.db.query('update audit_log set action = $1', ['tampered']), /append-only/);
  await assert.rejects(api.db.query('delete from audit_log'), /append-only/);
  await assert.rejects(api.db.query('truncate audit_log'), /append-only/);
});

test('the engine actor is the signed-in member, whatever the request claims', async () => {
  const held = await post('propose', { name: 'create_invoice', args: SALE });
  await post('discard', {});
  const state = (await api.db.query('select state from books where business_id = $1', [owner.businessId])).rows[0].state;
  const last = state.auditEvents.at(-1);
  assert.equal(last.action, 'chat.discard');
  assert.equal(last.actorId, owner.user.id);
  assert.equal(held.status, 200);
});

test('stored books carry no PIN material and no file contents', async () => {
  const text = JSON.stringify((await api.db.query('select state from books where business_id = $1', [owner.businessId])).rows[0].state);
  for (const field of ['pinHash', 'pinSalt', 'lockedUntil']) assert.equal(text.includes(field), false, field);
});

test('oversized and malformed bodies are refused before anything runs', async () => {
  const startVersion = await version();
  const huge = await api.call('POST', `/v1/businesses/${owner.businessId}/ask`, { token: owner.token, raw: JSON.stringify({ message: 'x'.repeat(1024 * 1024 + 10) }) }).catch((err) => ({ status: 413, body: { error: String(err.cause?.code || err.message) } }));
  assert.equal(huge.status, 413);
  assert.equal((await post('ask', { message: '   ' })).body.error, 'MESSAGE_REQUIRED');
  assert.equal((await api.call('POST', `/v1/businesses/${owner.businessId}/query`, { token: owner.token, raw: '[1,2' })).body.error, 'INVALID_JSON');
  assert.equal(await version(), startVersion);
});

test('logs carry no amounts, names, phone numbers or business ids', async () => {
  const text = JSON.stringify(api.logs);
  for (const secret of ['Kiran', 'Kaveri', '9440', '9200000001', owner.businessId, owner.token]) {
    assert.equal(text.includes(secret), false, secret);
  }
  assert.match(text, /"path":"\/v1\/businesses\/:id\/confirm"/);
});

test('the service refuses to start with live provider calls switched on', () => {
  const previous = process.env.MYCA_ENABLE_LIVE_CALLS;
  process.env.MYCA_ENABLE_LIVE_CALLS = '1';
  try {
    assert.throws(() => createApi({ db: api.db, secret: SECRET, otpSender: api.sender }), /live provider calls/);
  } finally {
    if (previous === undefined) delete process.env.MYCA_ENABLE_LIVE_CALLS;
    else process.env.MYCA_ENABLE_LIVE_CALLS = previous;
  }
});

test('a supplier bill can be paid from the phone, previewed first, and is part paid after', async () => {
  const shop = await api.ownerWithBusiness('+919200000077', { name: 'Kaveri Textiles', state: '29' });
  const bill = await post('propose', { name: 'create_purchase', args: { partyName: 'Fabric Co', date: '2026-09-01', lines: [{ description: 'Cloth', qty: 1, rate: 10000, gstRate: 5 }] } }, shop);
  assert.equal((await post('confirm', { token: bill.body.preview.token }, shop)).body.posted, true);
  const held = await post('propose', { name: 'record_payment', args: { billId: 'BILL-0001', amount: 4000, date: '2026-09-10' } }, shop);
  assert.equal(held.status, 200, held.text);
  assert.equal(held.body.preview.figures.remaining, 6500);
  assert.equal((await snapshot(shop)).purchases[0].payments, undefined);
  assert.equal((await post('confirm', { token: held.body.preview.token }, shop)).body.posted, true);
  const [paid] = (await snapshot(shop)).purchases;
  assert.equal(paid.status, 'partial');
  assert.deepEqual(paid.payments, [{ amount: 4000, date: '2026-09-10', mode: 'bank' }]);
});
