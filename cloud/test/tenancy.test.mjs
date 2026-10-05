import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi, SALE } from './helpers.mjs';

let api;
let asha;
let bala;
before(async () => {
  api = await startApi();
  asha = await api.ownerWithBusiness('+919100000001', { name: 'Asha Traders', state: '29' });
  bala = await api.ownerWithBusiness('+919100000002', { name: 'Bala Stores', gstin: '27AABCU9603R1ZN' });
});
after(async () => { await api.close(); });

const path = (businessId, action) => `/v1/businesses/${businessId}/${action}`;

test('a new business starts with its own name, no demo data and no invoices', async () => {
  const mine = await api.call('GET', path(asha.businessId, 'snapshot'), { token: asha.token });
  assert.equal(mine.status, 200, mine.text);
  assert.equal(mine.body.company.name, 'Asha Traders');
  assert.equal(mine.body.company.gstin, '');
  assert.equal(mine.body.company.state, '29');
  assert.deepEqual(mine.body.invoices, []);
  assert.deepEqual(mine.body.purchases, []);
  assert.equal(mine.body.role, 'owner');
  assert.equal(mine.text.includes('Nalanda'), false);

  const theirs = await api.call('GET', path(bala.businessId, 'snapshot'), { token: bala.token });
  assert.equal(theirs.body.company.gstin, '27AABCU9603R1ZN');
  assert.equal(theirs.body.company.state, '27');
});

test('a business needs a name, a valid GSTIN if one is given, and a state otherwise', async () => {
  const cases = [
    [{ name: '', state: '29' }, 'COMPANY_NAME_REQUIRED'],
    [{ name: 'X', gstin: '27AABCU9603R1ZX' }, 'INVALID_GSTIN'],
    [{ name: 'X' }, 'STATE_REQUIRED'],
    [{ name: 'X', state: 'KA' }, 'INVALID_STATE_CODE'],
  ];
  for (const [body, error] of cases) {
    const out = await api.call('POST', '/v1/businesses', { token: asha.token, body });
    assert.equal(out.status, 400, JSON.stringify(body));
    assert.equal(out.body.error, error, JSON.stringify(body));
  }
  const listed = await api.call('GET', '/v1/businesses', { token: asha.token });
  assert.deepEqual(listed.body.businesses.map((b) => b.name), ['Asha Traders']);
});

test('one owner cannot reach another business by any route, even with a valid token and the right id', async () => {
  const held = await api.call('POST', path(bala.businessId, 'propose'), { token: bala.token, body: { name: 'create_invoice', args: SALE } });
  const token = held.body.preview.token;
  const attempts = [
    ['GET', 'snapshot', undefined],
    ['GET', 'members', undefined],
    ['POST', 'propose', { name: 'create_invoice', args: SALE }],
    ['POST', 'confirm', { token }],
    ['POST', 'discard', {}],
    ['POST', 'query', { name: 'gst_payable' }],
    ['POST', 'ask', { message: 'what is my gst payable' }],
    ['POST', 'company', { name: 'Taken Over' }],
  ];
  for (const [method, action, body] of attempts) {
    const out = await api.call(method, path(bala.businessId, action), { token: asha.token, body });
    assert.equal(out.status, 404, `${method} ${action}`);
    assert.equal(out.body.error, 'BUSINESS_NOT_FOUND', `${method} ${action}`);
  }
  const still = await api.call('POST', path(bala.businessId, 'confirm'), { token: bala.token, body: { token } });
  assert.equal(still.body.posted, true, 'the real owner preview survived every attempt');
  const balaBooks = await api.call('GET', path(bala.businessId, 'snapshot'), { token: bala.token });
  assert.equal(balaBooks.body.company.name, 'Bala Stores');
  assert.equal(balaBooks.body.invoices.length, 1);
});

test('a token confirmed against the wrong business posts nothing anywhere', async () => {
  const held = await api.call('POST', path(bala.businessId, 'propose'), { token: bala.token, body: { name: 'create_invoice', args: SALE } });
  const before = (await api.call('GET', path(asha.businessId, 'snapshot'), { token: asha.token })).body.invoices.length;
  const crossed = await api.call('POST', path(asha.businessId, 'confirm'), { token: asha.token, body: { token: held.body.preview.token } });
  assert.equal(crossed.status, 200);
  assert.notEqual(crossed.body.posted, true);
  const after = (await api.call('GET', path(asha.businessId, 'snapshot'), { token: asha.token })).body.invoices.length;
  assert.equal(after, before);
  await api.call('POST', path(bala.businessId, 'discard'), { token: bala.token, body: {} });
});

test('unknown and malformed business ids look exactly like someone else business', async () => {
  for (const id of ['11111111-1111-4111-8111-111111111111', 'not-a-uuid', '..%2F..%2Fetc', `${asha.businessId}x`]) {
    const out = await api.call('GET', path(id, 'snapshot'), { token: asha.token });
    assert.equal(out.status, 404, id);
    assert.equal(out.body.error, 'BUSINESS_NOT_FOUND', id);
  }
});

test('each business numbers its own documents from one', async () => {
  for (const owner of [asha, bala]) {
    const held = await api.call('POST', path(owner.businessId, 'propose'), { token: owner.token, body: { name: 'create_invoice', args: SALE } });
    assert.equal(held.status, 200, held.text);
    await api.call('POST', path(owner.businessId, 'confirm'), { token: owner.token, body: { token: held.body.preview.token } });
  }
  const mine = await api.call('GET', path(asha.businessId, 'snapshot'), { token: asha.token });
  const theirs = await api.call('GET', path(bala.businessId, 'snapshot'), { token: bala.token });
  assert.deepEqual(mine.body.invoices.map((i) => i.id), ['INV-0001']);
  assert.deepEqual(theirs.body.invoices.map((i) => i.id), ['INV-0001', 'INV-0002']);
});

test('only an owner can change the business profile, and a member sees only their businesses', async () => {
  const ravi = await api.signIn('+919100000003');
  await api.db.query("insert into memberships (user_id, business_id, role) values ($1, $2, 'staff')", [ravi.user.id, asha.businessId]);
  const listed = await api.call('GET', '/v1/businesses', { token: ravi.accessToken });
  assert.deepEqual(listed.body.businesses.map((b) => [b.name, b.role]), [['Asha Traders', 'staff']]);

  const denied = await api.call('POST', path(asha.businessId, 'company'), { token: ravi.accessToken, body: { name: 'Ravi Was Here' } });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error, 'OWNER_ONLY');
  const allowed = await api.call('POST', path(asha.businessId, 'company'), { token: asha.token, body: { name: 'Asha Traders Pvt Ltd', ledger: null, invoiceSeq: 9 } });
  assert.equal(allowed.status, 200, allowed.text);
  const snapshot = await api.call('GET', path(asha.businessId, 'snapshot'), { token: ravi.accessToken });
  assert.equal(snapshot.body.company.name, 'Asha Traders Pvt Ltd');
  assert.equal(snapshot.body.role, 'staff');
  assert.equal(snapshot.body.invoices.length, 1, 'profile update did not touch the books');
  assert.equal((await api.call('GET', path(bala.businessId, 'snapshot'), { token: ravi.accessToken })).status, 404);

  const members = await api.call('GET', path(asha.businessId, 'members'), { token: asha.token });
  assert.deepEqual(members.body.members.map((m) => m.role).sort(), ['owner', 'staff']);
  assert.equal(JSON.stringify(members.body).includes('9100000003'), false, 'member lists carry no phone numbers');
});

test('a business marked for deletion is unreachable to its members', async () => {
  const gone = await api.ownerWithBusiness('+919100000004', { name: 'Closing Down', state: '33' });
  const stillIn = await api.signIn('+919100000005');
  await api.db.query("insert into memberships (user_id, business_id, role) values ($1, $2, 'staff')", [stillIn.user.id, gone.businessId]);
  await api.call('DELETE', '/v1/me', { token: gone.token });
  const out = await api.call('GET', path(gone.businessId, 'snapshot'), { token: stillIn.accessToken });
  assert.equal(out.status, 404);
});

test('the state list comes from the dated rules and leaves out non-places', async () => {
  const out = await api.call('GET', '/v1/reference/states', { token: asha.token });
  assert.equal(out.status, 200, out.text);
  const byCode = Object.fromEntries(out.body.states.map((s) => [s.code, s.name]));
  assert.equal(byCode['29'], 'Karnataka');
  assert.equal(byCode['27'], 'Maharashtra');
  assert.equal(byCode['97'], undefined);
  assert.equal(byCode['99'], undefined);
  assert.ok(out.body.states.length >= 30);
  assert.equal((await api.call('GET', '/v1/reference/states')).status, 401);
});
