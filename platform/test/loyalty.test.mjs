import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool, TOOLS } from '../src/tools.mjs';
import { trialBalance } from '../src/ledger.mjs';
import { previewOf, needsConfirmation } from '../src/chat-confirm.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';
import { assistantTools } from '../src/assistant-tools.mjs';
import { toolServesCountry } from '../src/country.mjs';
import { fmtToolResult } from '../src/router.mjs';
import { invoicesToGstr1Json } from '../src/gstr1-json.mjs';
import { allocateDiscount } from '../src/invoice.mjs';
import { addMonths, replayCustomer } from '../src/loyalty.mjs';
import { PROPOSABLE } from '../../cloud/src/api.mjs';

const balanceOf = (state, code) => -Number(trialBalance(state.ledger).rows.find((r) => r.code === code)?.posted || 0);

async function shop(settings = {}) {
  const state = createState();
  const set = await runTool(state, 'loyalty_settings', { enabled: true, earnPoints: 1, earnPerRupees: 100, pointValue: 1, minRedeemPoints: 10, maxRedeemPercent: 50, expiryMonths: 12, ...settings });
  assert.equal(set.ok, true, JSON.stringify(set));
  return state;
}

const sale = (state, args) => runTool(state, 'create_invoice', { partyName: 'Asha Verma', date: '2026-04-10', lines: [{ description: 'Rice 5 kg', hsn: '1006', qty: 2, rate: 1000, gstRate: 5 }], ...args });

test('a sale to a named customer earns points on the value before GST, recorded with the invoice and an expiry date', async () => {
  const state = await shop();
  const out = await sale(state);
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.loyalty.earned, 20);
  assert.equal(out.loyalty.balance, 20);
  const entry = state.loyalty.entries[0];
  assert.deepEqual({ kind: entry.kind, partyName: entry.partyName, invoiceId: entry.invoiceId, date: entry.date, points: entry.points, expiresOn: entry.expiresOn }, { kind: 'earn', partyName: 'Asha Verma', invoiceId: out.invoice.id, date: '2026-04-10', points: 20, expiresOn: '2027-04-10' });
  assert.match(fmtToolResult('create_invoice', out), /20 points earned; balance 20/);
});

test('points can be earned on the bill total instead, and never expire when expiry is 0', async () => {
  const state = await shop({ earnOn: 'total', expiryMonths: 0 });
  const out = await sale(state);
  assert.equal(out.loyalty.earned, 21);
  assert.equal(state.loyalty.entries[0].expiresOn, null);
});

test('walk-in sales and sales while loyalty is off earn nothing', async () => {
  const state = await shop();
  const walkIn = await sale(state, { partyName: 'Walk-in customer' });
  assert.equal(walkIn.ok, true);
  assert.equal(walkIn.loyalty, undefined);
  const blank = await sale(state, { partyName: '' });
  assert.equal(blank.loyalty, undefined);
  await runTool(state, 'loyalty_settings', { enabled: false });
  const off = await sale(state);
  assert.equal(off.loyalty, undefined);
  assert.equal(state.loyalty.entries.length, 0);
});

test('redeemed points are a discount before GST: GST, the ledger, the invoice document and GSTR-1 all use the lower value', async () => {
  const state = await shop();
  await sale(state, { lines: [{ description: 'Oil', hsn: '1512', qty: 10, rate: 500, gstRate: 5 }] });
  assert.equal((await runTool(state, 'loyalty_balance', { partyName: 'Asha Verma', asOf: '2026-05-01' })).data.customer.balance, 50);
  const preview = previewOf(state, 'create_invoice', { partyName: 'Asha Verma', date: '2026-05-01', redeemPoints: 40, lines: [{ description: 'Rice', hsn: '1006', qty: 1, rate: 300, gstRate: 5 }, { description: 'Soap', hsn: '3401', qty: 1, rate: 100, gstRate: 18 }] });
  assert.deepEqual(preview.blockers, []);
  assert.match(preview.summary, /Loyalty points redeemed: 40 points, ₹40\.00 off before GST/);
  assert.equal(preview.figures.taxable, 360);
  const out = await sale(state, { date: '2026-05-01', redeemPoints: 40, lines: [{ description: 'Rice', hsn: '1006', qty: 1, rate: 300, gstRate: 5 }, { description: 'Soap', hsn: '3401', qty: 1, rate: 100, gstRate: 18 }] });
  assert.equal(out.ok, true, JSON.stringify(out));
  const inv = out.invoice;
  assert.deepEqual(inv.lines.map((l) => [l.grossTaxable, l.loyaltyDiscount, l.taxable]), [[300, 30, 270], [100, 10, 90]]);
  assert.equal(inv.taxable, 360);
  assert.equal(inv.cgst, 6.75 + 8.1);
  assert.equal(inv.sgst, 6.75 + 8.1);
  assert.equal(inv.total, 389.7);
  assert.deepEqual(inv.loyaltyRedeemed, { points: 40, value: 40 });
  assert.equal(preview.figures.total, inv.total);
  assert.equal(out.loyalty.redeemed, 40);
  assert.equal(out.loyalty.earned, 3);
  assert.equal(out.loyalty.balance, 13);
  assert.equal(balanceOf(state, '4000'), 5000 + 360);
  assert.equal(balanceOf(state, '2100'), 125 + 14.85);
  const doc = await runTool(state, 'invoice_document', { id: inv.id });
  assert.deepEqual(doc.data.discounts, [{ label: 'Loyalty points redeemed', points: 40, amount: 40, beforeGst: true }]);
  assert.equal(doc.data.grossTaxable, 400);
  assert.equal(doc.data.lines[0].loyaltyDiscount, 30);
  const html = await runTool(state, 'print_invoice', { id: inv.id });
  assert.match(html.html, /Loyalty points redeemed \(40 points\)/);
  const json = invoicesToGstr1Json(state.company, [inv], '052026');
  const b2cs = json.b2cs.map((row) => [row.rt, row.txval]).sort((a, b) => a[0] - b[0]);
  assert.deepEqual(b2cs, [[5, 270], [18, 90]]);
});

test('redemption is refused when points are short, below the minimum, over the share of the bill, or expired', async () => {
  const state = await shop({ expiryMonths: 1 });
  await sale(state);
  const base = { date: '2026-04-20', lines: [{ description: 'Dal', hsn: '0713', qty: 1, rate: 30, gstRate: 5 }] };
  assert.equal((await sale(state, { ...base, redeemPoints: 5 })).error, 'BELOW_MINIMUM');
  assert.equal((await sale(state, { ...base, redeemPoints: 25 })).error, 'POINTS_SHORT');
  const over = await sale(state, { ...base, redeemPoints: 20 });
  assert.equal(over.error, 'OVER_MAX_SHARE');
  assert.equal(over.maxPoints, 15);
  assert.equal((await sale(state, { ...base, partyName: 'Walk-in', redeemPoints: 10 })).error, 'LOYALTY_NEEDS_CUSTOMER');
  assert.equal((await sale(state, { ...base, partyName: 'Somebody New', redeemPoints: 10 })).error, 'CUSTOMER_HAS_NO_POINTS');
  const expired = await sale(state, { ...base, date: '2026-05-15', redeemPoints: 10 });
  assert.equal(expired.error, 'POINTS_EXPIRED');
  assert.equal(expired.expired, 20);
  assert.equal(state.invoices.length, 1);
  const blocked = previewOf(state, 'create_invoice', { partyName: 'Asha Verma', ...base, redeemPoints: 25 });
  assert.match(blocked.blockers.join(' '), /fewer than 25/);
  await runTool(state, 'loyalty_settings', { enabled: false });
  assert.equal((await sale(state, { ...base, redeemPoints: 10 })).error, 'LOYALTY_OFF');
});

test('a credit note takes back earned points in proportion, and a cancellation gives back points used', async () => {
  const state = await shop();
  await sale(state, { lines: [{ description: 'Oil', hsn: '1512', qty: 10, rate: 500, gstRate: 5 }] });
  const second = await sale(state, { date: '2026-05-01', redeemPoints: 40, lines: [{ description: 'Atta', hsn: '1101', qty: 1, rate: 1000, gstRate: 5 }] });
  assert.equal(second.loyalty.earned, 9);
  const half = await runTool(state, 'create_credit_note', { invoiceId: 'INV-0001', amount: 2625, date: '2026-05-05', reason: 'Half returned' });
  assert.equal(half.ok, true, JSON.stringify(half));
  assert.equal(half.loyalty.reversed, 25);
  assert.match(fmtToolResult('create_credit_note', half), /25 points earned on it taken back/);
  const cancel = await runTool(state, 'cancel_invoice', { invoiceId: second.invoice.id, date: '2026-05-06', reason: 'Wrong bill' });
  assert.equal(cancel.ok, true, JSON.stringify(cancel));
  assert.equal(cancel.loyalty.reversed, 9);
  assert.equal(cancel.loyalty.restored, 40);
  const bal = await runTool(state, 'loyalty_balance', { partyName: 'Asha Verma', asOf: '2026-05-06' });
  assert.equal(bal.data.customer.balance, 25);
  const rest = await runTool(state, 'create_credit_note', { invoiceId: 'INV-0001', date: '2026-05-07', reason: 'Rest returned' });
  assert.equal(rest.loyalty.reversed, 25);
  assert.equal((await runTool(state, 'loyalty_balance', { partyName: 'Asha Verma', asOf: '2026-05-07' })).data.customer.balance, 0);
});

test('points expire after the set months; the balance shows what expires soon and a WhatsApp line', async () => {
  const state = await shop({ expiryMonths: 6 });
  state.company.name = 'Sharma Kirana';
  await sale(state, { date: '2026-01-31' });
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  const soon = await runTool(state, 'loyalty_balance', { partyName: 'asha verma', asOf: '2026-07-15' });
  assert.equal(soon.data.customer.balance, 20);
  assert.deepEqual(soon.data.customer.expiringSoon, [{ points: 20, on: '2026-07-31' }]);
  assert.equal(soon.data.customer.whatsapp, 'Namaste Asha Verma, you have 20 loyalty points worth ₹20.00 at Sharma Kirana. 20 points expire on 2026-07-31; use them on your next visit.');
  assert.match(fmtToolResult('loyalty_balance', soon), /To send: Namaste/);
  const after = await runTool(state, 'loyalty_balance', { partyName: 'Asha Verma', asOf: '2026-07-31' });
  assert.equal(after.data.customer.balance, 0);
  assert.equal(after.data.customer.expired, 20);
});

test('oldest points are used first and a deficit from a late reversal is paid off by the next earning', () => {
  const entries = [
    { id: 'LP-1', kind: 'earn', date: '2026-01-01', points: 10, expiresOn: '2026-07-01' },
    { id: 'LP-2', kind: 'earn', date: '2026-02-01', points: 10, expiresOn: '2026-08-01', invoiceId: 'INV-2' },
    { id: 'LP-3', kind: 'redeem', date: '2026-03-01', points: -15 },
    { id: 'LP-4', kind: 'reverse', date: '2026-03-02', points: -10, invoiceId: 'INV-2' },
    { id: 'LP-5', kind: 'earn', date: '2026-03-03', points: 8, expiresOn: '2026-09-03' },
  ];
  const out = replayCustomer(entries, '2026-03-10');
  assert.equal(out.balance, 3);
  assert.equal(out.deficit, 0);
});

test('the discount is spread over the lines in proportion, to the paisa', () => {
  assert.deepEqual(allocateDiscount([10000, 20000, 30000], 1000), [167, 333, 500]);
  assert.deepEqual(allocateDiscount([100, 100, 100], 100), [34, 33, 33]);
  assert.deepEqual(allocateDiscount([0, 500], 100), [0, 100]);
});

test('all customers ranked with the outstanding points liability in rupees for the CA', async () => {
  const state = await shop({ pointValue: 0.5 });
  await sale(state);
  await sale(state, { partyName: 'Ravi Traders', lines: [{ description: 'Sugar', hsn: '1701', qty: 50, rate: 100, gstRate: 5 }] });
  const all = await runTool(state, 'loyalty_balance', { asOf: '2026-04-30' });
  assert.equal(all.ok, true);
  assert.deepEqual(all.data.customers.map((c) => [c.partyName, c.balance, c.value]), [['Ravi Traders', 50, 25], ['Asha Verma', 20, 10]]);
  assert.equal(all.data.outstandingPoints, 70);
  assert.equal(all.data.liability, 35);
  assert.match(fmtToolResult('loyalty_balance', all), /2 customers hold 70 points, worth ₹35\.00/);
});

test('a manual adjustment needs a reason, is kept in the points book and the audit trail, and cannot take away more than there is', async () => {
  const state = await shop();
  await sale(state);
  assert.equal((await runTool(state, 'loyalty_adjust', { partyName: 'Asha Verma', points: 5 })).error, 'REASON_REQUIRED');
  assert.equal((await runTool(state, 'loyalty_adjust', { partyName: 'Nobody', points: 5, reason: 'Bonus' })).error, 'CUSTOMER_NOT_FOUND');
  assert.equal((await runTool(state, 'loyalty_adjust', { partyName: 'Asha Verma', points: -50, reason: 'Fix', date: '2026-04-11' })).error, 'POINTS_SHORT');
  const preview = previewOf(state, 'loyalty_adjust', { partyName: 'Asha Verma', points: 100, reason: 'Diwali bonus', date: '2026-04-12' });
  assert.deepEqual(preview.blockers, []);
  assert.match(preview.summary, /Add 100 loyalty points to Asha Verma on 2026-04-12: Diwali bonus/);
  const added = await runTool(state, 'loyalty_adjust', { partyName: 'Asha Verma', points: 100, reason: 'Diwali bonus', date: '2026-04-12' });
  assert.equal(added.ok, true, JSON.stringify(added));
  assert.equal(added.balance, 120);
  assert.equal(added.entry.expiresOn, '2027-04-12');
  assert.match(fmtToolResult('loyalty_adjust', added), /Added 100 points to Asha Verma \(Diwali bonus\)\. Balance now 120/);
  const audit = state.auditEvents.find((e) => e.action === 'loyalty.adjust');
  assert.equal(audit.metadata.reason, 'Diwali bonus');
  assert.ok(state.auditEvents.some((e) => e.action === 'loyalty.settings'));
});

test('only the owner may change loyalty settings or adjust points', async () => {
  const state = await shop();
  await sale(state);
  state.__actor = { userId: 'staff1', role: 'staff' };
  assert.equal((await runTool(state, 'loyalty_settings', { enabled: false })).error, 'OWNER_ONLY');
  assert.equal((await runTool(state, 'loyalty_adjust', { partyName: 'Asha Verma', points: 5, reason: 'Bonus' })).error, 'OWNER_ONLY');
  assert.equal((await runTool(state, 'loyalty_balance', { partyName: 'Asha Verma' })).ok, true);
});

test('settings are checked and previewed before they change, in plain words', async () => {
  const state = createState();
  assert.equal((await runTool(state, 'loyalty_settings', {})).error, 'NOTHING_TO_CHANGE');
  assert.equal((await runTool(state, 'loyalty_settings', { enabled: true, earnOn: 'mrp' })).error, 'BAD_EARN_ON');
  assert.equal((await runTool(state, 'loyalty_settings', { enabled: true, maxRedeemPercent: 120 })).error, 'BAD_MAX_SHARE');
  assert.equal((await runTool(state, 'loyalty_settings', { enabled: true, pointValue: 0.005 })).error, 'BAD_POINT_VALUE');
  const preview = previewOf(state, 'loyalty_settings', { enabled: true, earnPoints: 2, earnPerRupees: 100, pointValue: 0.25, minRedeemPoints: 100, maxRedeemPercent: 20, expiryMonths: 6 });
  assert.deepEqual(preview.blockers, []);
  assert.equal(preview.summary, 'Loyalty points are on: customers earn 2 points for every ₹100 of the bill before GST. One point is worth ₹0.25 off a later bill, at least 100 at a time, paying up to 20% of a bill before GST; they expire 6 months after they are earned. Walk-in sales earn nothing.');
  assert.match(preview.effects.join(' '), /CGST Act s\.15\(3\)\(a\)/);
  const before = await runTool(state, 'loyalty_balance', {});
  assert.equal(before.data.settings.configured, false);
  assert.equal(before.data.settings.enabled, false);
});

test('loyalty serves India only', async () => {
  for (const name of ['loyalty_settings', 'loyalty_balance', 'loyalty_adjust']) {
    assert.equal(toolServesCountry(name, 'IN'), true, name);
    assert.equal(toolServesCountry(name, 'US'), false, name);
  }
  const us = createState();
  us.company.country = 'US';
  assert.equal((await runTool(us, 'loyalty_balance', {})).error, 'NOT_FOR_COUNTRY');
});

test('the tools are in the assistant contract, the app may query the balance and propose the writes', () => {
  assert.equal(validateAssistantToolCall('loyalty_settings', { enabled: true, earnPoints: 1, earnPerRupees: 100, earnOn: 'taxable', pointValue: 1, minRedeemPoints: 0, maxRedeemPercent: 50, expiryMonths: 12 }).ok, true);
  assert.equal(validateAssistantToolCall('loyalty_settings', { enabled: true, colour: 'red' }).ok, false);
  assert.equal(validateAssistantToolCall('loyalty_adjust', { partyName: 'Asha', points: 5 }).ok, false);
  assert.equal(validateAssistantToolCall('loyalty_adjust', { partyName: 'Asha', points: 5, reason: 'Bonus' }).ok, true);
  assert.equal(validateAssistantToolCall('loyalty_balance', { partyName: 'Asha' }).ok, true);
  assert.equal(validateAssistantToolCall('create_invoice', { partyName: 'Asha', lines: [{ description: 'x', qty: 1, rate: 10, gstRate: 5 }], redeemPoints: 10 }).ok, true);
  assert.equal(validateAssistantToolCall('create_invoice', { partyName: 'Asha', lines: [{ description: 'x', qty: 1, rate: 10, gstRate: 5 }], redeemPoints: 1.5 }).ok, false);
  assert.equal(isRemoteQuery('loyalty_balance'), true);
  assert.equal(isRemoteQuery('loyalty_adjust'), false);
  assert.equal(needsConfirmation('loyalty_settings'), true);
  assert.equal(needsConfirmation('loyalty_adjust'), true);
  assert.equal(PROPOSABLE.has('loyalty_settings'), true);
  assert.equal(PROPOSABLE.has('loyalty_adjust'), true);
  const risks = Object.fromEntries(assistantTools(TOOLS).map((t) => [t.name, t.risk]));
  assert.equal(risks.loyalty_balance, 'read_only');
  assert.equal(risks.loyalty_settings, 'writes_books');
  assert.equal(risks.loyalty_adjust, 'writes_books');
});

test('the points book is saved with the books and read back', async () => {
  const state = await shop();
  await sale(state);
  const back = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.equal(back.loyalty.settings.enabled, true);
  assert.equal(back.loyalty.entries.length, 1);
  assert.equal((await runTool(back, 'loyalty_balance', { partyName: 'Asha Verma', asOf: '2026-05-01' })).data.customer.balance, 20);
});
