import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-collect-'));
process.env.HOME = process.env.APPDATA;
process.env.MYCA_MOCK_MODE = '1';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { collectionDrafts, payingScore } from '../src/collections.mjs';
import { REMOTE_QUERY_TOOLS } from '../src/remote-contract.mjs';

const TODAY = '2026-10-17';

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  return state;
}
async function sale(state, party, date, rate, extra = {}) {
  const out = await runTool(state, 'create_invoice', { partyName: party, lines: [{ description: 'Cloth', qty: 1, rate, gstRate: 5 }], date, ...extra });
  assert.equal(out.ok, true, JSON.stringify(out));
  return out.invoice;
}
async function paid(state, invoice, date) {
  const out = await runTool(state, 'record_receipt', { invoiceId: invoice.id, date, mode: 'bank' });
  assert.equal(out.ok, true, JSON.stringify(out));
}

test('overdue customers are scored from a year of paying history and get one draft each in a matching tone; recent payers are left out', async () => {
  const state = books();
  await runTool(state, 'set_payment_terms', { partyName: 'Prompt Mart', days: 30 });
  for (const [date, on] of [['2026-01-05', '2026-01-20'], ['2026-03-02', '2026-03-25'], ['2026-05-10', '2026-06-01']]) await paid(state, await sale(state, 'Prompt Mart', date, 1000), on);
  await sale(state, 'Prompt Mart', '2026-08-01', 2000);
  for (const [date, on] of [['2026-01-05', '2026-03-20'], ['2026-03-02', '2026-05-25'], ['2026-05-10', '2026-08-01']]) await paid(state, await sale(state, 'Slow Traders', date, 1000), on);
  await sale(state, 'Slow Traders', '2026-07-01', 3000);
  await sale(state, 'Slow Traders', '2026-08-15', 1500);
  await sale(state, 'New Buyer', '2026-08-20', 500);
  await sale(state, 'Just Paid', '2026-07-01', 800);
  await paid(state, await sale(state, 'Just Paid', '2026-09-01', 400), '2026-10-10');
  await sale(state, 'On Time Co', '2026-10-01', 900);
  await runTool(state, 'set_invoice_template', { bank: { name: 'HDFC Bank', account: '50100123456789', ifsc: 'HDFC0001234', upi: 'nalanda@okhdfc' } });

  assert.equal(payingScore(state, 'Prompt Mart', TODAY).score, 'good');
  assert.equal(payingScore(state, 'Slow Traders', TODAY).score, 'repeat-late');
  assert.equal(payingScore(state, 'New Buyer', TODAY).score, 'new');

  const out = collectionDrafts(state, { today: TODAY });
  assert.equal(out.ok, true);
  const names = out.data.customers.map((c) => [c.customer, c.tone, c.invoices.length]);
  assert.deepEqual(names, [['Slow Traders', 'firm', 2], ['Prompt Mart', 'gentle', 1], ['New Buyer', 'neutral', 1]]);
  assert.deepEqual(out.data.possiblyPaid.map((p) => p.customer), ['Just Paid']);
  assert.equal(out.data.total, 4725 + 2100 + 525, 'the total is the sum of the overdue invoices');
  const firm = out.data.customers[0];
  assert.match(firm.message, /^Hello Slow Traders,/);
  assert.match(firm.message, /overdue and still unpaid/);
  assert.match(firm.message, /INV-0008 dated 1 July 2026, ₹3,150\.00 \(\d+ days past 31 July 2026\)/);
  assert.match(firm.message, /Please pay ₹4,725\.00 by 20 October 2026/);
  assert.match(firm.message, /Pay to: HDFC Bank, A\/c 50100123456789, IFSC HDFC0001234, UPI nalanda@okhdfc\./);
  const gentle = out.data.customers[1];
  assert.match(gentle.message, /gentle reminder/);
  assert.match(gentle.message, /at your convenience/);
  assert.ok(REMOTE_QUERY_TOOLS.has('collection_drafts'));
});

test('chat lists who to chase, previews one reminder, records it with a follow-up, and the record survives a save', async () => {
  const state = books();
  await sale(state, 'Kiran Stores', '2026-07-01', 5000);
  await sale(state, 'Kiran Stores', '2026-08-01', 2000);
  const who = await chat(state, 'who should I chase?');
  assert.match(who.reply, /overdue from 1 customer/, who.reply);
  assert.match(who.reply, /Kiran Stores: ₹7,350\.00 across 2 invoices/, who.reply);
  assert.match(who.reply, /has not paid enough invoices yet to judge, so the draft is neutral/);
  const held = await chat(state, 'send reminder to Kiran Stores');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.match(held.reply, /Send a neutral payment reminder to Kiran Stores for ₹7,350\.00 across 2 invoices/);
  assert.match(held.reply, /MyCA sends nothing itself/);
  const done = await chat(state, 'yes');
  assert.equal(done.posted, true, done.reply);
  assert.match(done.reply, /Recorded the neutral reminder to Kiran Stores for ₹7,350\.00/);
  assert.equal(state.collectionReminders.length, 1);
  assert.equal(state.collectionReminders[0].id, 'CRM-0001');
  assert.deepEqual(state.collectionReminders[0].invoiceIds, ['INV-0001', 'INV-0002']);
  const follow = state.reminders.find((r) => /Check whether Kiran Stores paid/.test(r.text));
  assert.ok(follow, JSON.stringify(state.reminders));
  const again = await chat(state, 'remind Kiran Stores');
  assert.match(again.reply, /You last reminded them on/, again.reply);
  await chat(state, 'no');
  const hindi = await chat(state, 'Kiran Stores ko reminder bhejo');
  assert.equal(hindi.awaitingConfirmation, true, hindi.reply);
  await chat(state, 'no');
  const nobody = await chat(state, 'remind Nobody Here');
  assert.doesNotMatch(nobody.reply, /payment reminder/, nobody.reply);
  const back = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.equal(back.collectionReminders.length, 1);
  assert.equal(back.collectionReminderSeq, 1);
});

test('a customer who paid in the last fortnight, or has nothing overdue, is not chased', async () => {
  const state = books();
  const inv = await sale(state, 'Fresh Pay', '2026-07-01', 1000);
  await sale(state, 'Fresh Pay', '2026-08-01', 1000);
  await paid(state, inv, '2026-10-12');
  const held = await runTool(state, 'record_collection_reminder', { customer: 'Fresh Pay', today: TODAY });
  assert.equal(held.error, 'POSSIBLY_PAID');
  await sale(state, 'Current', '2026-10-10', 1000);
  const none = await runTool(state, 'record_collection_reminder', { customer: 'Current', today: TODAY });
  assert.equal(none.error, 'NOTHING_OVERDUE');
  const empty = collectionDrafts(books(), { today: TODAY });
  assert.equal(empty.data.customers.length, 0);
  const words = await chat(books(), 'who is overdue?');
  assert.match(words.reply, /Nobody is overdue/, words.reply);
});
