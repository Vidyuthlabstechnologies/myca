import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers.mjs';
import { LIMITS } from '../src/rate-limits.mjs';
import { itemId } from '../../platform/src/catalogue.mjs';

const sent = [];
const sender = { async sendText(phone, text) { sent.push({ phone, text }); } };

let api;
before(async () => {
  api = await startApi({ whatsappSender: sender, rateLimits: { ...LIMITS, storeOrderIp: { max: 6, windowSeconds: 3600 } } });
});
after(async () => { await api.close(); });

let serial = 0;
const at = (who, action) => `/v1/businesses/${who.businessId}/${action}`;
const ip = (n) => ({ 'x-forwarded-for': `203.0.113.${n}` });

async function post(who, name, args) {
  const held = await api.call('POST', at(who, 'propose'), { token: who.token, body: { name, args } });
  assert.equal(held.status, 200, held.text);
  assert.ok(held.body.preview, `${name} held: ${held.text}`);
  return api.call('POST', at(who, 'confirm'), { token: who.token, body: { token: held.body.preview.token } });
}

async function posted(who, name, args) {
  const done = await post(who, name, args);
  assert.equal(done.status, 200, done.text);
  assert.equal(done.body.posted, true, done.text);
  return done.body;
}

async function shop(name = 'Asha Traders', settings = {}) {
  serial += 1;
  const owner = await api.ownerWithBusiness(`+9198500000${String(serial).padStart(2, '0')}`, { name, state: '29', gstin: '' });
  await posted(owner, 'set_sku_cost', { sku: 'TEA', name: 'Assam tea <b>250 g</b>', cost: 90, price: 100, gstRate: 5 });
  await posted(owner, 'set_sku_cost', { sku: 'XSS', name: '</script><script>alert(1)</script>', cost: 1, price: 10, gstRate: 18 });
  await posted(owner, 'set_sku_cost', { sku: 'HIDDEN', name: 'Back room stock', cost: 3, price: 30, gstRate: 12 });
  await posted(owner, 'catalogue_items', { items: [{ sku: 'TEA', published: true, category: 'Tea' }, { sku: 'XSS', published: true, description: '"><img src=x onerror=alert(2)>' }] });
  await posted(owner, 'catalogue_settings', { enabled: true, whatsapp: '9876543210', city: 'Mysuru', ...settings });
  return owner;
}

async function linkOf(who) {
  return (await api.db.query('select slug, enabled, snapshot from store_links where business_id = $1', [who.businessId])).rows[0];
}

test('switching the store on publishes a snapshot row with only public fields, and the link comes back to the owner', async () => {
  const owner = await shop();
  const row = await linkOf(owner);
  assert.equal(row.slug, 'asha-traders');
  assert.equal(row.enabled, true);
  const text = JSON.stringify(row.snapshot);
  for (const secret of ['Back room stock', '"cost"', '90', owner.businessId, 'HIDDEN']) assert.equal(text.includes(secret), false, `snapshot leaks ${secret}`);
  const view = await api.call('POST', at(owner, 'query'), { token: owner.token, body: { name: 'catalogue_view' } });
  assert.equal(view.status, 200, view.text);
  assert.equal(view.body.data.link.slug, 'asha-traders');
  assert.match(view.body.data.link.url, /\/s\/asha-traders$/);
  const pub = await api.call('GET', '/v1/store/asha-traders', { headers: ip(1) });
  assert.equal(pub.status, 200, pub.text);
  assert.equal(pub.body.store.name, 'Asha Traders');
  assert.equal(pub.body.store.whatsapp, '919876543210');
  assert.equal(pub.body.items.length, 2);
  assert.equal(pub.text.includes(owner.businessId), false);
  await posted(owner, 'set_sku_cost', { sku: 'TEA', price: 200 });
  assert.equal((await linkOf(owner)).snapshot.items.find((item) => item.category === 'Tea').price, 210, 'a price change refreshes the snapshot in the same request');
});

test('the store page is escaped, mobile-first and locked down by a strict CSP', async () => {
  await shop('Page Traders');
  const res = await fetch(`${api.base}/s/page-traders`, { headers: ip(2) });
  const html = await res.text();
  assert.equal(res.status, 200);
  const csp = res.headers.get('content-security-policy');
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /script-src 'sha256-[A-Za-z0-9+/=]+'/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|https?:/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(html, /name="viewport"/);
  assert.equal(html.includes('<script>alert(1)</script>'), false);
  assert.equal(html.includes('<img src=x'), false);
  assert.match(html, /&lt;\/script&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.equal((html.match(/<script/g) || []).length, 2, 'one data block and one inline script, nothing external');
  assert.doesNotMatch(html, /<script[^>]+src=/);
  assert.match(html, /Send order on WhatsApp/);
  assert.match(html, /Place order/);
});

test('unknown, malformed, disabled and deleted stores all answer the same 404', async () => {
  const owner = await shop('Closing Traders');
  await posted(owner, 'catalogue_settings', { enabled: false });
  assert.equal((await linkOf(owner)).enabled, false);
  const answers = [];
  for (const slug of ['closing-traders', 'no-such-store', 'BAD', '..%2f..', 'a', "x'or'1'='1"]) {
    const out = await api.call('GET', `/v1/store/${slug}`, { headers: ip(3) });
    answers.push([out.status, out.text]);
  }
  for (const answer of answers) assert.deepEqual(answer, [404, '{"ok":false,"error":"NOT_FOUND"}']);
  const page = await fetch(`${api.base}/s/closing-traders`, { headers: ip(3) });
  assert.equal(page.status, 404);
  const pageText = await page.text();
  assert.equal(pageText.includes('Closing'), false);
  const order = await api.call('POST', '/v1/store/closing-traders/orders', { headers: ip(3), body: { buyerName: 'A', buyerPhone: '9876543210', lines: [] } });
  assert.equal(order.status, 404);
  const leaving = await shop('Leaving Traders');
  assert.equal((await api.call('GET', '/v1/store/leaving-traders', { headers: ip(3) })).status, 200);
  assert.equal((await api.call('DELETE', `/v1/businesses/${leaving.businessId}`, { token: leaving.token })).status, 200);
  const gone = await api.call('GET', '/v1/store/leaving-traders', { headers: ip(3) });
  assert.deepEqual([gone.status, gone.text], [404, '{"ok":false,"error":"NOT_FOUND"}']);
});

test('link names are unique: a chosen one that is taken is refused, a derived one gets a number', async () => {
  await shop('Twin Traders');
  const twin = await shop('Twin Traders');
  assert.equal((await linkOf(twin)).slug, 'twin-traders-2');
  const clash = await post(twin, 'catalogue_settings', { slug: 'twin-traders' });
  assert.equal(clash.status, 409, clash.text);
  assert.equal(clash.body.error, 'STORE_LINK_TAKEN');
  assert.equal((await linkOf(twin)).slug, 'twin-traders-2');
  await posted(twin, 'catalogue_settings', { slug: 'twin-mysuru' });
  assert.equal((await linkOf(twin)).slug, 'twin-mysuru');
  const reserved = await api.call('POST', at(twin, 'propose'), { token: twin.token, body: { name: 'catalogue_settings', args: { slug: 'admin' } } });
  assert.ok(reserved.body.preview?.blockers?.length || reserved.body.blocked, reserved.text);
});

test('an order is priced from the snapshot, saved for the owner, notified, and becomes a quote', async () => {
  const owner = await shop('Order Traders');
  const tea = itemId('TEA');
  const placed = await api.call('POST', '/v1/store/order-traders/orders', { headers: ip(4), body: { buyerName: 'Meena', buyerPhone: '+91 98200 12345', lines: [{ id: tea, qty: 2 }], note: 'After 6 pm' } });
  assert.equal(placed.status, 200, placed.text);
  assert.equal(placed.body.order.number, 'ORD-0001');
  assert.equal(placed.body.order.total, 210);
  const rows = (await api.db.query('select order_no, buyer_name, buyer_phone, status, lines from store_orders where business_id = $1', [owner.businessId])).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].buyer_phone, '9820012345');
  assert.equal(rows[0].lines[0].amount, 210);
  assert.ok(sent.some((message) => /ORD-0001/.test(message.text) && !message.text.includes('9820012345')), 'the owner is told without the buyer number in the message');
  const forged = await api.call('POST', '/v1/store/order-traders/orders', { headers: ip(4), body: { buyerName: 'Meena', buyerPhone: '9820012345', lines: [{ id: tea, qty: 2, price: 1 }] } });
  assert.equal(forged.status, 400);
  assert.equal(forged.body.error, 'BAD_LINE');
  const hidden = await api.call('POST', '/v1/store/order-traders/orders', { headers: ip(4), body: { buyerName: 'Meena', buyerPhone: '9820012345', lines: [{ id: itemId('HIDDEN'), qty: 1 }] } });
  assert.equal(hidden.body.error, 'ITEM_UNAVAILABLE');
  const phone = await api.call('POST', '/v1/store/order-traders/orders', { headers: ip(4), body: { buyerName: 'Meena', buyerPhone: '12345', lines: [{ id: tea, qty: 1 }] } });
  assert.equal(phone.body.error, 'BAD_PHONE');
  const list = await api.call('POST', at(owner, 'query'), { token: owner.token, body: { name: 'store_orders', args: { status: 'new' } } });
  assert.equal(list.body.data.orders[0].id, 'ORD-0001');
  const done = await posted(owner, 'store_order_action', { id: 'ORD-0001', action: 'accept' });
  const quoteId = done.tools[0].result.quoteId;
  assert.match(quoteId, /^QT-/);
  assert.equal((await api.db.query('select status from store_orders where business_id = $1', [owner.businessId])).rows[0].status, 'accepted');
  const books = await api.books(owner.businessId);
  assert.equal(books.quotes.find((quote) => quote.id === quoteId).total, 210);
  const audit = (await api.db.query('select action from audit_log where business_id = $1', [owner.businessId])).rows.map((row) => row.action);
  for (const action of ['store.order_received', 'store.order_answered', 'catalogue.settings_changed', 'catalogue.link_set']) assert.ok(audit.includes(action), action);
});

test('order requests are bounded: JSON only, a body budget, a strict schema and a rate limit per address', async () => {
  await shop('Busy Traders');
  const tea = itemId('TEA');
  const form = await fetch(`${api.base}/v1/store/busy-traders/orders`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', ...ip(5) }, body: 'buyerName=a' });
  assert.equal(form.status, 415);
  const big = await api.call('POST', '/v1/store/busy-traders/orders', { headers: ip(5), raw: JSON.stringify({ buyerName: 'x', buyerPhone: '9820012345', note: 'n'.repeat(20000), lines: [{ id: tea, qty: 1 }] }) });
  assert.equal(big.status, 413);
  const many = await api.call('POST', '/v1/store/busy-traders/orders', { headers: ip(5), body: { buyerName: 'Meena', buyerPhone: '9820012345', lines: Array.from({ length: 51 }, () => ({ id: tea, qty: 1 })) } });
  assert.equal(many.body.error, 'TOO_MANY_LINES');
  const qty = await api.call('POST', '/v1/store/busy-traders/orders', { headers: ip(5), body: { buyerName: 'Meena', buyerPhone: '9820012345', lines: [{ id: tea, qty: 100000 }] } });
  assert.equal(qty.body.error, 'BAD_QUANTITY');
  const statuses = [];
  for (let n = 0; n < 4; n += 1) statuses.push((await api.call('POST', '/v1/store/busy-traders/orders', { headers: ip(6), body: { buyerName: 'Ravi', buyerPhone: `982001234${n}`, lines: [{ id: tea, qty: 1 }] } })).status);
  for (let n = 0; n < 4; n += 1) statuses.push((await api.call('POST', '/v1/store/no-such-store/orders', { headers: ip(6), body: {} })).status);
  assert.deepEqual(statuses, [200, 200, 200, 200, 404, 404, 429, 429]);
});

test('only the owner changes the store or answers orders, and other people cannot read them', async () => {
  const owner = await shop('Guarded Traders');
  const invited = await api.call('POST', at(owner, 'invitations'), { token: owner.token, body: { phone: '+919850009901', role: 'staff' } });
  assert.equal(invited.status, 200, invited.text);
  const staff = await api.signIn('+919850009901');
  const invite = (await api.call('GET', '/v1/me', { token: staff.accessToken })).body.invitations[0];
  assert.equal((await api.call('POST', `/v1/invitations/${invite.id}/accept`, { token: staff.accessToken })).status, 200);
  const staffDone = await post({ businessId: owner.businessId, token: staff.accessToken }, 'catalogue_settings', { enabled: false });
  assert.equal(staffDone.body.posted, false, staffDone.text);
  assert.equal((await linkOf(owner)).enabled, true);
  const stranger = await api.ownerWithBusiness('+919850009902', { name: 'Stranger Co', state: '29' });
  const peek = await api.call('POST', at(owner, 'query'), { token: stranger.token, body: { name: 'store_orders' } });
  assert.equal(peek.status, 404);
});

test('India stores are served only by a deployment that hosts India', async () => {
  await shop('Resident Traders');
  const saved = process.env.MYCA_COUNTRIES;
  process.env.MYCA_COUNTRIES = 'US';
  try {
    assert.equal((await api.call('GET', '/v1/store/resident-traders', { headers: ip(7) })).status, 404);
  } finally {
    if (saved === undefined) delete process.env.MYCA_COUNTRIES;
    else process.env.MYCA_COUNTRIES = saved;
  }
  assert.equal((await api.call('GET', '/v1/store/resident-traders', { headers: ip(7) })).status, 200);
});

test('replacing the books from a backup refreshes the public store', async () => {
  const owner = await shop('Restored Traders');
  const exported = (await api.call('GET', at(owner, 'export'), { token: owner.token })).body;
  await posted(owner, 'catalogue_settings', { enabled: false });
  assert.equal((await linkOf(owner)).enabled, false);
  assert.equal((await api.call('GET', '/v1/store/restored-traders', { headers: ip(8) })).status, 404);
  const replaced = await api.call('POST', at(owner, 'replace'), { token: owner.token, body: exported });
  assert.equal(replaced.status, 200, replaced.text);
  const link = await linkOf(owner);
  assert.equal(link.enabled, true);
  assert.equal(link.snapshot.enabled, true);
  assert.equal((await api.call('GET', '/v1/store/restored-traders', { headers: ip(8) })).status, 200);
});

test('one phone cannot flood the inbox, and the owner gets one WhatsApp for a burst of orders, with the count', async () => {
  const owner = await shop('Flood Traders');
  const tea = itemId('TEA');
  const before = sent.length;
  const place = (n, phone) => api.call('POST', '/v1/store/flood-traders/orders', { headers: ip(20 + n), body: { buyerName: 'Spam', buyerPhone: phone, lines: [{ id: tea, qty: 1 }] } });
  for (let n = 0; n < 3; n += 1) assert.equal((await place(n, '9820099999')).status, 200);
  const blocked = await place(3, '9820099999');
  assert.equal(blocked.status, 400, blocked.text);
  assert.equal(blocked.body.error, 'TOO_MANY_OPEN_FROM_PHONE');
  assert.match(blocked.body.hint, /WhatsApp/);
  assert.equal((await place(4, '9820088888')).status, 200, 'an honest buyer still gets through');
  const alerts = sent.slice(before).filter((message) => /online store order/i.test(message.text));
  assert.equal(alerts.length, 1, JSON.stringify(alerts));
  assert.match(alerts[0].text, /ORD-0001/);
  const declined = await posted(owner, 'store_order_action', { action: 'decline', fromPhone: '9820099999' });
  assert.deepEqual(declined.tools[0].result.orderIds, ['ORD-0001', 'ORD-0002', 'ORD-0003']);
  const rows = (await api.db.query("select count(*)::int as n from store_orders where business_id = $1 and status = 'declined'", [owner.businessId])).rows[0].n;
  assert.equal(rows, 3);
  api.clock.advance(16 * 60 * 1000);
  assert.equal((await place(5, '9820077777')).status, 200);
  const later = sent.slice(before).filter((message) => /online store order/i.test(message.text));
  assert.equal(later.length, 2);
  assert.match(later[1].text, /2 online store orders waiting, newest ORD-0005/);
  assert.equal(later[1].text.includes('9820077777'), false);
});
