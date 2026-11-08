import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi, SALE } from './helpers.mjs';

let api;
before(async () => { api = await startApi(); });
after(async () => { await api.close(); });

const APP_KEYS = ['ok', 'company', 'invoices', 'purchases', 'expenses', 'creditNotes', 'quotes', 'customerTerms', 'role', 'user'];
const GUJARAT_MILLS = '24AAACG1234F1Z5';

const RENT = { id: 'EXP-0001', date: '2026-10-03', head: '5110', headName: 'Rent', description: 'Shop rent for October', payee: 'Mehta Estates', amount: 12000, gstRate: 0, inputCredit: false, mode: 'bank', tag: { source: 'chosen', why: 'You chose Rent.' } };
const CARTRIDGES = { id: 'EXP-0002', date: '2026-10-04', head: '5190', headName: 'Office and stationery', description: 'Printer cartridges', payee: 'Ink House', amount: 1180, gstRate: 18, inputCredit: true, mode: 'bank', tag: { source: 'chosen', why: 'You chose Office and stationery.' } };
const COURIER = { id: 'EXP-0003', date: '2026-10-08', head: '5210', headName: 'Freight and delivery', description: 'Courier charges', payee: 'Blue Dart', amount: 450, gstRate: 0, inputCredit: false, mode: 'bank', tag: { source: 'chosen', why: 'You chose Freight and delivery.' } };
const RETURNED = { id: 'CN-0001', date: '2026-10-06', invoiceId: 'INV-0001', partyName: 'Kiran Stores', reason: 'Two chairs came back', total: 1180, cancels: false };
const DISCOUNT = { id: 'CN-0002', date: '2026-10-09', invoiceId: 'INV-0001', partyName: 'Kiran Stores', reason: 'Late delivery discount', total: 590, cancels: false };
const CHAIRS = { id: 'QT-0001', date: '2026-10-05', partyName: 'Kiran Stores', partyGstin: '', total: 17700, validUntil: '2026-11-04', status: 'open', invoiceId: '', kind: 'quote' };
const JIG = { id: 'DC-0001', date: '2026-10-07', partyName: 'Rao Fabrication', partyGstin: '', total: 5900, validUntil: '2026-11-06', status: 'open', invoiceId: '', kind: 'challan', reason: 'job-work' };
const DESKS = { id: 'QT-0002', date: '2026-10-10', partyName: 'Sethi Furnishings', partyGstin: '', total: 9440, validUntil: '2026-10-25', status: 'open', invoiceId: '', kind: 'quote' };
const TERMS = { 'name:kiran stores': 30, [`gstin:${GUJARAT_MILLS}`]: 45, 'name:counter sales': 0 };

let serial = 0;
const at = (b, action) => `/v1/businesses/${b.id}/${action}`;

async function join(owner, phone, role) {
  const sent = await api.call('POST', `/v1/businesses/${owner.businessId}/invitations`, { token: owner.token, body: { phone, role } });
  assert.equal(sent.status, 200, sent.text);
  const person = await api.signIn(phone);
  const invite = (await api.call('GET', '/v1/me', { token: person.accessToken })).body.invitations[0];
  const accepted = await api.call('POST', `/v1/invitations/${invite.id}/accept`, { token: person.accessToken });
  assert.equal(accepted.status, 200, accepted.text);
  return { token: person.accessToken };
}

async function setup() {
  serial += 1;
  const n = String(serial).padStart(2, '0');
  const owner = await api.ownerWithBusiness(`+9197100000${n}`, { name: `Lists Traders ${n}`, state: '29' });
  const staff = await join(owner, `+9197200000${n}`, 'staff');
  const accountant = await join(owner, `+9197300000${n}`, 'accountant');
  return { id: owner.businessId, owner: { token: owner.token }, staff, accountant };
}

async function post(b, who, name, args) {
  const held = await api.call('POST', at(b, 'propose'), { token: who.token, body: { name, args } });
  assert.equal(held.status, 200, held.text);
  assert.ok(held.body.preview, `${name} was held for confirmation: ${held.text}`);
  const done = await api.call('POST', at(b, 'confirm'), { token: who.token, body: { token: held.body.preview.token } });
  assert.equal(done.body.posted, true, done.text);
}

async function snapshotOf(b, who) {
  const out = await api.call('GET', at(b, 'snapshot'), { token: who.token });
  assert.equal(out.status, 200, out.text);
  return out.body;
}

async function queried(b, who, name) {
  const out = await api.call('POST', at(b, 'query'), { token: who.token, body: { name } });
  assert.equal(out.status, 200, out.text);
  return out.body;
}

async function firstEntries(b, who) {
  await post(b, who, 'create_invoice', { ...SALE, date: '2026-10-01' });
  await post(b, who, 'post_expense', { narration: 'Shop rent for October', amount: 12000, head: '5110', payee: 'Mehta Estates', date: '2026-10-03' });
  await post(b, who, 'post_expense', { narration: 'Printer cartridges', amount: 1180, gstRate: 18, supplierGstin: '29ABCDE1234F1Z5', head: '5190', payee: 'Ink House', date: '2026-10-04' });
  await post(b, who, 'create_credit_note', { invoiceId: 'INV-0001', amount: 1180, reason: 'Two chairs came back', date: '2026-10-06' });
  await post(b, who, 'create_quote', { partyName: 'Kiran Stores', lines: [{ description: 'Chairs', qty: 10, rate: 1500, gstRate: 18 }], date: '2026-10-05', validDays: 30 });
  await post(b, who, 'create_quote', { partyName: 'Rao Fabrication', kind: 'challan', reason: 'job-work', lines: [{ description: 'Cutting jig', qty: 1, rate: 5000, gstRate: 18 }], date: '2026-10-07' });
  await post(b, who, 'set_payment_terms', { partyName: 'Kiran Stores', days: 30 });
  await post(b, who, 'set_payment_terms', { partyName: 'Gujarat Mills', partyGstin: GUJARAT_MILLS, days: 45 });
  await post(b, who, 'set_payment_terms', { partyName: 'Counter Sales', days: 0 });
}

async function laterEntries(b, who) {
  await post(b, who, 'post_expense', { narration: 'Courier charges', amount: 450, head: '5210', payee: 'Blue Dart', date: '2026-10-08' });
  await post(b, who, 'create_credit_note', { invoiceId: 'INV-0001', amount: 590, reason: 'Late delivery discount', date: '2026-10-09' });
  await post(b, who, 'create_quote', { partyName: 'Sethi Furnishings', lines: [{ description: 'Desks', qty: 2, rate: 4000, gstRate: 18 }], date: '2026-10-10', validDays: 15 });
  await post(b, who, 'set_payment_terms', { partyName: 'Sethi Furnishings', days: 15 });
}

function assertRows(actual, wanted, label) {
  assert.ok(Array.isArray(actual), `${label}: the snapshot carries the list`);
  assert.deepEqual(actual.map((row) => row.id), wanted.map((row) => row.id), `${label}: the ids, in the order they were booked`);
  for (const want of wanted) {
    const row = actual.find((item) => item.id === want.id);
    assert.deepEqual(Object.fromEntries(Object.keys(want).map((key) => [key, row[key]])), want, `${label}: ${want.id} carries the fields the app reads`);
  }
}

async function assertSameAsTools(b, who, snap, label) {
  assert.deepEqual(snap.expenses, (await queried(b, who, 'list_expenses')).data, `${label}: expenses are exactly what list_expenses returns`);
  assert.deepEqual(snap.creditNotes, (await queried(b, who, 'list_credit_notes')).data, `${label}: credit notes are exactly what list_credit_notes returns`);
  const rows = (await queried(b, who, 'list_quotes')).data.quotes;
  assert.deepEqual(snap.quotes.map((quote) => quote.id).sort(), rows.map((row) => row.id).sort(), `${label}: the same sales documents as list_quotes`);
  for (const quote of snap.quotes) {
    const row = rows.find((item) => item.id === quote.id);
    assert.deepEqual(Object.fromEntries(Object.keys(quote).map((key) => [key, row[key]])), quote, `${label}: ${quote.id} is the stored document list_quotes shows`);
  }
}

test('the owner\'s snapshot lists the expenses, credit notes, quotes and customer terms the app reads', async () => {
  const b = await setup();
  await firstEntries(b, b.owner);
  const snap = await snapshotOf(b, b.owner);
  assertRows(snap.expenses, [RENT, CARTRIDGES], 'expenses');
  assertRows(snap.creditNotes, [RETURNED], 'credit notes');
  assertRows(snap.quotes, [CHAIRS, JIG], 'quotes');
  assert.deepEqual(snap.customerTerms, TERMS);
  assert.equal(snap.customerTerms['name:counter sales'], 0, 'terms of zero days (due on receipt) are kept, not dropped');
  assert.equal(snap.invoices.length, 1);
  assert.equal(snap.role, 'owner');
});

test('the four lists come after purchases, the old keys keep their order, and nothing else is added', async () => {
  const b = await setup();
  await firstEntries(b, b.owner);
  const snap = await snapshotOf(b, b.owner);
  assert.deepEqual(Object.keys(snap), APP_KEYS);
});

test('books with none of the four still answer empty lists and an empty terms map', async () => {
  const b = await setup();
  const snap = await snapshotOf(b, b.owner);
  assert.deepEqual(snap.expenses, []);
  assert.deepEqual(snap.creditNotes, []);
  assert.deepEqual(snap.quotes, []);
  assert.deepEqual(snap.customerTerms, {});
  assert.deepEqual(Object.keys(snap), APP_KEYS);
});

test('staff read the same four lists as the owner, as the query tools return them, and still no employees', async () => {
  const b = await setup();
  await firstEntries(b, b.owner);
  await post(b, b.owner, 'add_employee', { name: 'Ravi Kumar', joinedOn: '2026-09-01', components: [{ name: 'Basic', amount: 47311 }] });
  await post(b, b.staff, 'post_expense', { narration: 'Courier charges', amount: 450, head: '5210', payee: 'Blue Dart', date: '2026-10-08' });
  const snap = await snapshotOf(b, b.staff);
  assert.equal(snap.role, 'staff');
  assertRows(snap.expenses, [RENT, CARTRIDGES, COURIER], 'expenses');
  assertRows(snap.creditNotes, [RETURNED], 'credit notes');
  assertRows(snap.quotes, [CHAIRS, JIG], 'quotes');
  assert.deepEqual(snap.customerTerms, TERMS);
  const owners = await snapshotOf(b, b.owner);
  for (const key of ['expenses', 'creditNotes', 'quotes', 'customerTerms']) assert.deepEqual(snap[key], owners[key], `staff and owner agree on ${key}`);
  await assertSameAsTools(b, b.staff, snap, 'staff');
  assert.deepEqual(Object.keys(snap), APP_KEYS);
  const text = JSON.stringify(snap);
  assert.equal(text.includes('Ravi Kumar'), false, 'no employee name');
  assert.equal(text.includes('47311'), false, 'no salary');
  assert.equal(JSON.stringify(owners).includes('Ravi Kumar'), false, 'not even the owner\'s snapshot carries employees');
});

test('the accountant on live books reads the same four lists as the owner and as the query tools', async () => {
  const b = await setup();
  await firstEntries(b, b.owner);
  await post(b, b.owner, 'add_employee', { name: 'Ravi Kumar', joinedOn: '2026-09-01', components: [{ name: 'Basic', amount: 47311 }] });
  const snap = await snapshotOf(b, b.accountant);
  assert.equal(snap.role, 'accountant');
  assert.equal(snap.sharedAsOf, undefined);
  assertRows(snap.expenses, [RENT, CARTRIDGES], 'expenses');
  assertRows(snap.creditNotes, [RETURNED], 'credit notes');
  assertRows(snap.quotes, [CHAIRS, JIG], 'quotes');
  assert.deepEqual(snap.customerTerms, TERMS);
  const owners = await snapshotOf(b, b.owner);
  for (const key of ['expenses', 'creditNotes', 'quotes', 'customerTerms']) assert.deepEqual(snap[key], owners[key], `accountant and owner agree on ${key}`);
  await assertSameAsTools(b, b.accountant, snap, 'accountant');
  assert.deepEqual(Object.keys(snap), APP_KEYS);
  const text = JSON.stringify(snap);
  assert.equal(text.includes('Ravi Kumar'), false, 'no employee name');
  assert.equal(text.includes('47311'), false, 'no salary');
});

test('the accountant\'s shared copy carries the four lists as they stood at the share, until the owner shares again', async () => {
  const b = await setup();
  await firstEntries(b, b.owner);
  const set = await api.call('POST', at(b, 'ca-sync'), { token: b.owner.token, body: { mode: 'manual' } });
  assert.equal(set.status, 200, set.text);
  await laterEntries(b, b.owner);

  const shared = await snapshotOf(b, b.accountant);
  assert.ok(shared.sharedAsOf, 'it is the shared copy');
  assertRows(shared.expenses, [RENT, CARTRIDGES], 'shared expenses');
  assertRows(shared.creditNotes, [RETURNED], 'shared credit notes');
  assertRows(shared.quotes, [CHAIRS, JIG], 'shared quotes');
  assert.deepEqual(shared.customerTerms, TERMS, 'terms set after the share are not in the copy');
  await assertSameAsTools(b, b.accountant, shared, 'accountant on the shared copy');
  assert.deepEqual(Object.keys(shared), [...APP_KEYS, 'sharedAsOf']);

  const live = await snapshotOf(b, b.owner);
  assertRows(live.expenses, [RENT, CARTRIDGES, COURIER], 'live expenses');
  assertRows(live.creditNotes, [RETURNED, DISCOUNT], 'live credit notes');
  assertRows(live.quotes, [CHAIRS, JIG, DESKS], 'live quotes');
  assert.deepEqual(live.customerTerms, { ...TERMS, 'name:sethi furnishings': 15 });

  const again = await api.call('POST', at(b, 'ca-share'), { token: b.owner.token });
  assert.equal(again.status, 200, again.text);
  const fresh = await snapshotOf(b, b.accountant);
  assertRows(fresh.expenses, [RENT, CARTRIDGES, COURIER], 'reshared expenses');
  assertRows(fresh.creditNotes, [RETURNED, DISCOUNT], 'reshared credit notes');
  assertRows(fresh.quotes, [CHAIRS, JIG, DESKS], 'reshared quotes');
  assert.deepEqual(fresh.customerTerms, { ...TERMS, 'name:sethi furnishings': 15 });
  await assertSameAsTools(b, b.accountant, fresh, 'accountant after the owner shared again');
});
