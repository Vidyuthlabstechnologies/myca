import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { createInvoice } from '../src/invoice.mjs';
import { localToday } from '../src/dates.mjs';
import { parseReminder } from '../src/reminder-intent.mjs';
import { daysBetween } from '../src/reminders.mjs';
import { previewOf } from '../src/chat-confirm.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';

const MONDAY = '2026-10-05';

function plusDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

test('reminder sentences become text, a day and what they are about', () => {
  const read = (text) => parseReminder(text, MONDAY);
  assert.deepEqual(read('remind me to call Rajesh tomorrow').args, { text: 'Call Rajesh', due: '2026-10-06' });
  assert.deepEqual(read('Remind me about INV-0002 in 3 days').args, { text: 'Follow up INV-0002', due: '2026-10-08', invoiceId: 'INV-0002' });
  assert.equal(read('remind me on 15 Oct to pay Mahesh').args.due, '2026-10-15');
  assert.equal(read('remind me on 15 Oct to pay Mahesh').args.text, 'Pay Mahesh');
  assert.equal(read('remind me Oct 3rd to renew the licence').args.due, '2027-10-03', 'a date already passed this year means next year');
  assert.equal(read('remind me next week to check the 2B').args.due, '2026-10-12');
  assert.equal(read('remind me in 2 weeks to chase BILL-0004').args.billId, 'BILL-0004');
  assert.equal(read('remind me on Friday to pay rent').args.due, '2026-10-09');
  assert.equal(read('remind me Monday to pay rent').args.due, '2026-10-12', 'a weekday means the next one, not today');
  assert.equal(read('remind me today to send the GSTR-1 file').args.due, MONDAY);
  assert.equal(read('remind me on 20-10-2026 to file').args.due, '2026-10-20');
  assert.equal(read('remind me on 31-02-2026 to file').error, 'NO_DATE', 'an impossible date is not a date');
  assert.equal(read('yaad dilana kal Suresh ko payment').args.due, '2026-10-06');
  assert.deepEqual(read('remind me to call Rajesh'), { ok: false, error: 'NO_DATE', text: 'call Rajesh' });
  assert.equal(read('remind me tomorrow').error, 'NO_TEXT');
  assert.equal(read('call Rajesh tomorrow').error, 'NOT_A_REMINDER');
  assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1);
});

test('adding, listing and completing reminders; past dates and unknown documents are refused', async () => {
  const state = createState();
  createInvoice(state, { id: 'INV-0002', date: '2026-09-01', partyName: 'Gujarat Weaves', lines: [{ description: 'Silk', hsn: '5007', qty: 1, rate: 100, gstRate: 5 }] });
  const today = localToday();
  const posted = state.ledger.transfers.length;
  const added = await runTool(state, 'add_reminder', { text: 'Chase payment', due: plusDays(today, 2), invoiceId: 'INV-0002' });
  assert.equal(added.ok, true, JSON.stringify(added));
  assert.equal(added.reminder.id, 'REM-0001');
  assert.deepEqual(added.reminder.about, { kind: 'invoice', id: 'INV-0002', name: 'Gujarat Weaves' });
  await runTool(state, 'add_reminder', { text: 'Pay rent', due: today });
  const list = (await runTool(state, 'list_reminders', {})).data;
  assert.deepEqual(list.reminders.map((r) => [r.text, r.state, r.inDays]), [['Pay rent', 'today', 0], ['Chase payment', 'later', 2]]);
  assert.equal(list.due, 1);
  const done = await runTool(state, 'complete_reminder', { id: 'rem-0002' });
  assert.equal(done.ok, true);
  assert.equal(done.reminder.done.on, today);
  assert.equal((await runTool(state, 'complete_reminder', { id: 'REM-0002' })).error, 'ALREADY_DONE');
  assert.equal((await runTool(state, 'list_reminders', {})).data.reminders.length, 1);
  assert.equal((await runTool(state, 'list_reminders', { status: 'done' })).data.reminders.length, 1);
  assert.equal((await runTool(state, 'add_reminder', { text: 'x', due: plusDays(today, -1) })).error, 'DATE_PASSED');
  assert.equal((await runTool(state, 'add_reminder', { text: 'x', due: today, invoiceId: 'INV-0009' })).error, 'INVOICE_NOT_FOUND');
  assert.equal((await runTool(state, 'add_reminder', { text: '  ', due: today })).error, 'TEXT_REQUIRED');
  assert.equal(state.ledger.transfers.length, posted, 'reminders never touch the ledger');
});

test('a reminder whose day has passed is listed as overdue', async () => {
  const state = createState();
  state.reminders = [{ id: 'REM-0001', text: 'Old', due: plusDays(localToday(), -3), createdOn: '2026-01-01', createdBy: '', done: null }];
  const row = (await runTool(state, 'list_reminders', {})).data.reminders[0];
  assert.equal(row.state, 'overdue');
  assert.equal(row.inDays, -3);
});

test('chat: "remind me … tomorrow" previews and sets on yes; no date asks; "my reminders" lists', async () => {
  const state = createState();
  const held = await chat(state, 'remind me to call Rajesh tomorrow');
  assert.equal(held.awaitingConfirmation, true, JSON.stringify(held));
  assert.match(held.preview.summary, /^Remind you tomorrow: Call Rajesh\.$/);
  assert.equal((state.reminders || []).length, 0);
  const set = await chat(state, 'yes');
  assert.equal(set.posted, true);
  assert.match(set.reply, /^Set\. On \d{4}-\d{2}-\d{2}: Call Rajesh\.$/);
  const ask = await chat(state, 'remind me to pay Mahesh');
  assert.notEqual(ask.awaitingConfirmation, true);
  assert.match(ask.reply, /When should I remind you to pay Mahesh\?/);
  assert.match((await chat(state, 'show my reminders')).reply, /^· On \d{4}-\d{2}-\d{2}: Call Rajesh \(REM-0001\)$/);
  assert.equal((await chat(state, "don't remind me to call Rajesh tomorrow")).awaitingConfirmation, undefined);
});

test('previews explain refusals; reminders persist; contracts are strict', async () => {
  const state = createState();
  assert.deepEqual(previewOf(state, 'add_reminder', { text: 'x', due: '2020-01-01' }).blockers, ['2020-01-01 has already passed.']);
  await runTool(state, 'add_reminder', { text: 'Pay rent', due: localToday() });
  const back = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.equal(back.reminders.length, 1);
  assert.equal(back.reminderSeq, 1);
  assert.equal(isRemoteQuery('list_reminders'), true);
  assert.equal(isRemoteQuery('add_reminder'), false);
  assert.equal(validateAssistantToolCall('add_reminder', { text: 'x', due: '2026-10-06' }).ok, true);
  assert.equal(validateAssistantToolCall('add_reminder', { text: 'x', due: 'tomorrow' }).ok, false);
  assert.equal(validateAssistantToolCall('complete_reminder', { id: 'INV-0001' }).ok, false);
});
