import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createBilling } from '../src/billing.mjs';
import { DEMO_GSTIN, DEMO_NAME } from '../src/demo.mjs';
import { MAX_EXACT_AMOUNT } from '../../platform/src/assistant-tools.mjs';
import { localToday } from '../../platform/src/dates.mjs';
import { JOB_HEADER } from '../src/jobs.mjs';
import { startApi, SALE } from './helpers.mjs';

const JOB_TOKEN = 'job-token-for-business-logic-tests-0123456789';
const NOWHERE = async () => new Response('{}', { status: 404 });
let api;

before(async () => {
  api = await startApi({
    jobToken: JOB_TOKEN,
    billing: ({ db, now }) => createBilling({
      db,
      now,
      fetchImpl: NOWHERE,
      config: { packageName: 'com.mldynamic.myca', productIds: { pro: 'myca_pro_monthly' }, notifyToken: 'play-notify-token-for-tests-0123456789', serviceAccount: { clientEmail: 'play@test.iam.gserviceaccount.com', privateKey: 'unused', tokenUri: 'https://oauth2.googleapis.com/token' }, prices: { pro: 599 } },
    }),
  });
});
after(() => api.close());

const post = (who, action, body) => api.call('POST', `/v1/businesses/${who.businessId}/${action}`, { token: who.token, body });
const get = (who, action) => api.call('GET', `/v1/businesses/${who.businessId}/${action}`, { token: who.token });
const sale = (lines = SALE.lines) => ({ ...SALE, date: localToday(new Date(api.clock.now)), lines });
const another = async (who, body) => {
  const made = await api.call('POST', '/v1/businesses', { token: who.token, body });
  assert.equal(made.status, 200, made.text);
  return { ...who, businessId: made.body.business.id };
};
const invoices = async (who) => (await api.books(who.businessId)).invoices.length;
const creatorOf = async (who) => (await api.db.query('select created_by as id from businesses where id = $1', [who.businessId])).rows[0].id;
const passDays = async (who, days) => {
  const userId = await creatorOf(who);
  await api.db.query('update businesses set created_at = created_at - make_interval(days => $2) where created_by = $1', [userId, days]);
  await api.db.query('update users set trial_started_at = trial_started_at - make_interval(days => $2) where id = $1', [userId, days]);
};
const version = async (who) => Number((await api.db.query('select version from books where business_id = $1', [who.businessId])).rows[0].version);

test('a confirmation sent again reports the first posting and posts nothing more', async () => {
  const owner = await api.ownerWithBusiness('+919400000301', { name: 'Replay Traders', state: '29' });
  const held = await post(owner, 'propose', { name: 'create_invoice', args: sale() });
  const token = held.body.preview.token;
  const first = await post(owner, 'confirm', { token });
  assert.equal(first.body.posted, true, first.text);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const again = await post(owner, 'confirm', { token });
    assert.equal(again.body.replayed, true, again.text);
    assert.equal(again.body.reply, first.body.reply);
    assert.deepEqual(again.body.tools, []);
  }
  assert.equal(await invoices(owner), 1);
  const later = await post(owner, 'propose', { name: 'create_invoice', args: sale() });
  const old = await post(owner, 'confirm', { token });
  assert.equal(old.body.replayed, true, old.text);
  assert.equal(await invoices(owner), 1, 'the old code never posts the newer preview');
  assert.equal((await post(owner, 'confirm', { token: later.body.preview.token })).body.posted, true);
  assert.equal(await invoices(owner), 2);
});

test('a preview that was replaced, discarded or guessed at cannot be confirmed', async () => {
  const owner = await api.ownerWithBusiness('+919400000302', { name: 'Stale Traders', state: '29' });
  const first = await post(owner, 'propose', { name: 'create_invoice', args: sale() });
  const second = await post(owner, 'propose', { name: 'create_invoice', args: sale([{ description: 'Other', qty: 2, rate: 100, gstRate: 5 }]) });
  assert.notEqual(first.body.preview.token, second.body.preview.token);
  const stale = await post(owner, 'confirm', { token: first.body.preview.token });
  assert.equal(stale.body.error, 'TOKEN_MISMATCH', stale.text);
  assert.equal(stale.body.posted, false);
  const dropped = await post(owner, 'confirm', { token: second.body.preview.token });
  assert.equal(dropped.body.error, 'NOTHING_PENDING', 'a wrong code discards what was waiting');
  for (const token of ['', 'yes', '000000000000', 'ZZZZZZZZZZZZ', null, 12, { token: 'x' }]) {
    const guessed = await post(owner, 'confirm', { token });
    assert.notEqual(guessed.body.posted, true, JSON.stringify(token));
  }
  assert.equal(await invoices(owner), 0);
});

test('two people confirming one preview at the same moment post it once', async () => {
  const owner = await api.ownerWithBusiness('+919400000303', { name: 'Pair Traders', state: '29' });
  const invited = await post(owner, 'invitations', { phone: '+919400000304', role: 'staff' });
  assert.equal(invited.status, 200, invited.text);
  const ravi = await api.signIn('+919400000304');
  assert.equal((await api.call('POST', `/v1/invitations/${invited.body.invitation.id}/accept`, { token: ravi.accessToken })).status, 200);
  const staff = { token: ravi.accessToken, businessId: owner.businessId };
  const held = await post(owner, 'propose', { name: 'create_invoice', args: sale() });
  const token = held.body.preview.token;
  const answers = await Promise.all([owner, staff, owner, staff, owner, staff].map((who) => post(who, 'confirm', { token })));
  assert.equal(answers.filter((answer) => answer.body.posted === true && !answer.body.replayed).length, 1, JSON.stringify(answers.map((answer) => answer.body)));
  assert.equal(answers.filter((answer) => answer.body.replayed === true).length, 5);
  assert.equal(await invoices(owner), 1);
  const books = await api.books(owner.businessId);
  assert.equal(books.invoices[0].id, 'INV-0001');
});

test('an amount too large to keep to the last paisa is refused before a preview is made', async () => {
  const owner = await api.ownerWithBusiness('+919400000305', { name: 'Large Traders', state: '29' });
  const before = await version(owner);
  const refusals = [
    [{ description: 'x', qty: 1e12, rate: 1e12, gstRate: 18 }],
    [{ description: 'x', qty: 1, rate: MAX_EXACT_AMOUNT * 10, gstRate: 18 }],
    [{ description: 'x', qty: MAX_EXACT_AMOUNT, rate: 2, gstRate: 18 }],
    [{ description: 'x', qty: 1, rate: MAX_EXACT_AMOUNT, gstRate: 18 }, { description: 'y', qty: 1, rate: 1, gstRate: 18 }],
    [{ description: 'x', qty: 1, rate: Number.MAX_VALUE, gstRate: 18 }],
    [{ description: 'x', qty: -1, rate: 100, gstRate: 18 }],
    [{ description: 'x', qty: 1, rate: -100, gstRate: 18 }],
    [{ description: 'x', qty: 0, rate: 100, gstRate: 18 }],
  ];
  for (const lines of refusals) {
    const held = await post(owner, 'propose', { name: 'create_invoice', args: sale(lines) });
    assert.equal(held.body.blocked, true, held.text);
    assert.equal(held.body.preview, undefined, held.text);
  }
  const large = await post(owner, 'propose', { name: 'create_invoice', args: sale([{ description: 'x', qty: 1e12, rate: 1e12, gstRate: 18 }]) });
  assert.match(large.body.reply, /too large to keep exactly/);
  const expense = await post(owner, 'propose', { name: 'post_expense', args: { amount: MAX_EXACT_AMOUNT * 10, narration: 'Rent', mode: 'bank' } });
  assert.equal(expense.body.blocked, true, expense.text);
  assert.equal(await invoices(owner), 0);

  const held = await post(owner, 'propose', { name: 'create_invoice', args: sale([{ description: 'Plant', qty: 1, rate: MAX_EXACT_AMOUNT, gstRate: 18 }]) });
  assert.ok(held.body.preview?.token, held.text);
  const done = await post(owner, 'confirm', { token: held.body.preview.token });
  assert.equal(done.body.posted, true, done.text);
  const invoice = done.body.tools[0].result.invoice;
  assert.equal(invoice.total, MAX_EXACT_AMOUNT * 1.18);
  assert.equal(Math.round(invoice.total * 100), Math.round(invoice.taxable * 100) + Math.round(invoice.cgst * 100) + Math.round(invoice.sgst * 100));
  assert.ok(Number.isSafeInteger(Math.round(invoice.total * 100)), 'the largest allowed total is still an exact number of paise');
  assert.ok(await version(owner) > before);
});

test('the free trial runs once for a person: a second business, or one made after deleting the first, does not start it again', async () => {
  const owner = await api.ownerWithBusiness('+919400000306', { name: 'First Shop', state: '29' });
  assert.equal((await get(owner, 'subscription')).body.trial.daysLeft, 14);
  await passDays(owner, 5);
  const sister = await another(owner, { name: 'Sister Shop', state: '29' });
  const shared = await get(sister, 'subscription');
  assert.equal(shared.body.plan, 'pro');
  assert.equal(shared.body.trial.daysLeft, 9, 'a second business shares what is left of the trial');

  await passDays(owner, 10);
  assert.equal((await get(owner, 'subscription')).body.plan, 'lapsed');
  assert.equal((await get(sister, 'subscription')).body.plan, 'lapsed');
  const third = await another(owner, { name: 'Third Shop', state: '29' });
  const none = await get(third, 'subscription');
  assert.equal(none.body.plan, 'lapsed', none.text);
  assert.equal(none.body.trial, null);
  assert.equal((await post(third, 'propose', { name: 'create_invoice', args: sale() })).body.error, 'PLAN_REQUIRED');

  const userId = await creatorOf(owner);
  for (const shop of [owner, sister, third]) {
    assert.equal((await api.call('DELETE', `/v1/businesses/${shop.businessId}`, { token: owner.token })).body.deleted, true);
  }
  await api.db.query(`update businesses set deletion_requested_at = deletion_requested_at - make_interval(days => 31) where created_by = $1`, [userId]);
  const nightly = await api.call('POST', '/v1/jobs/daily', { headers: { [JOB_HEADER]: JOB_TOKEN } });
  assert.equal(nightly.body.purge.businesses, 3, nightly.text);
  assert.equal((await api.db.query('select 1 from businesses where created_by = $1', [userId])).rowCount, 0);
  assert.deepEqual((await api.call('GET', '/v1/businesses', { token: owner.token })).body.businesses, []);
  const reborn = await another(owner, { name: 'First Shop', state: '29' });
  const again = await get(reborn, 'subscription');
  assert.equal(again.body.plan, 'lapsed', again.text);
  assert.equal(again.body.trial, null);
  assert.equal((await post(reborn, 'propose', { name: 'create_invoice', args: sale() })).body.error, 'PLAN_REQUIRED');
  assert.equal((await get(reborn, 'export')).status, 200, 'a lapsed business can still be read and exported');
});

test('trying the demo first does not use up the trial, and the demo cannot become real books', async () => {
  const person = await api.signIn('+919400000307');
  const who = { token: person.accessToken };
  const demo = await another(who, { demo: true });
  await passDays(demo, 40);
  const real = await another(who, { name: 'Real Shop', state: '29' });
  assert.equal((await get(real, 'subscription')).body.trial.daysLeft, 14);

  const renamed = await post(demo, 'company', { name: 'My Real Shop', gstin: '29AAACD0001D1ZK', state: '29' });
  assert.equal(renamed.status, 403, renamed.text);
  assert.equal(renamed.body.error, 'DEMO_BUSINESS');
  const extra = await post(demo, 'propose', { name: 'set_registration', args: { gstin: '27AAACD0000D1ZP' } });
  assert.ok(extra.body.preview?.token, extra.text);
  const added = await post(demo, 'confirm', { token: extra.body.preview.token });
  assert.equal(added.status, 403, added.text);
  assert.equal(added.body.error, 'DEMO_BUSINESS');
  const books = await api.books(demo.businessId);
  assert.equal(books.company.name, DEMO_NAME);
  assert.equal(books.company.gstin, DEMO_GSTIN);
  assert.deepEqual(books.company.registrations || [], []);
  const listed = (await api.call('GET', '/v1/businesses', { token: who.token })).body.businesses.find((row) => row.id === demo.businessId);
  assert.equal(listed.name, DEMO_NAME);
  assert.equal(listed.demo, true);

  const moved = await post(demo, 'company', { address: '4, Trial Street', city: 'Mysuru', pin: '570001' });
  assert.equal(moved.status, 200, moved.text);
  const held = await post(demo, 'propose', { name: 'create_invoice', args: sale() });
  assert.equal((await post(demo, 'confirm', { token: held.body.preview.token })).body.posted, true, 'a demo can still be used to try posting');
  for (const action of ['subscription', 'replace', 'invitations', 'connectors', 'gst-gstr3b', 'einvoice']) {
    assert.equal((await post(demo, action, {})).body.error, 'DEMO_BUSINESS', action);
  }
});

test('what a plan allows is decided on the server at the moment of each write', async () => {
  const owner = await api.ownerWithBusiness('+919400000308', { name: 'Clock Shop', state: '29' });
  const held = await post(owner, 'propose', { name: 'create_invoice', args: sale() });
  await passDays(owner, 15);
  const late = await api.call('POST', `/v1/businesses/${owner.businessId}/confirm`, { token: owner.token, body: { token: held.body.preview.token, now: '2020-01-01T00:00:00Z', plan: 'pro', trial: { daysLeft: 14 } }, headers: { date: 'Wed, 01 Jan 2020 00:00:00 GMT', 'x-myca-plan': 'pro' } });
  assert.equal(late.body.error, 'PLAN_REQUIRED', late.text);
  assert.equal(await invoices(owner), 0);
  const claimed = await post(owner, 'subscription', { purchaseToken: 'forged-token', productId: 'myca_pro_monthly' });
  assert.notEqual(claimed.body.ok, true, claimed.text);
  assert.equal((await get(owner, 'subscription')).body.plan, 'lapsed');
});

test('cancelling and crediting an invoice add entries and leave every posted entry as it was', async () => {
  const owner = await api.ownerWithBusiness('+919400000309', { name: 'Ledger Shop', state: '29' });
  const confirmTool = async (name, args) => {
    const held = await post(owner, 'propose', { name, args });
    assert.ok(held.body.preview?.token, held.text);
    const done = await post(owner, 'confirm', { token: held.body.preview.token });
    assert.equal(done.body.posted, true, done.text);
    return done.body.tools[0].result;
  };
  const first = await confirmTool('create_invoice', sale());
  const second = await confirmTool('create_invoice', sale([{ description: 'Chairs', qty: 4, rate: 650, gstRate: 18 }]));
  const posted = (await api.books(owner.businessId)).ledger.transfers;
  assert.ok(posted.length > 0);
  const frozen = JSON.stringify(posted);

  await confirmTool('cancel_invoice', { invoiceId: first.invoice.id, reason: 'Entered twice' });
  await confirmTool('create_credit_note', { invoiceId: second.invoice.id, lines: [{ description: 'Chairs', qty: 1, rate: 650, gstRate: 18 }], reason: 'One chair returned' });
  const books = await api.books(owner.businessId);
  assert.ok(books.ledger.transfers.length > posted.length, 'the cancellation and the credit note are new entries');
  assert.equal(JSON.stringify(books.ledger.transfers.slice(0, posted.length)), frozen, 'no posted entry was edited or removed');
  assert.equal(books.invoices.length, 2, 'the cancelled invoice is kept');
  assert.equal(books.invoices.find((invoice) => invoice.id === first.invoice.id).status, 'cancelled');
  const gone = await post(owner, 'propose', { name: 'cancel_invoice', args: { invoiceId: first.invoice.id } });
  assert.equal(gone.body.blocked, true, 'an invoice is cancelled once');
});
