import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { previewOf } from '../src/chat-confirm.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';
import { validateAssistantToolCall, planLocalToolCall } from '../src/assistant-contract.mjs';
import { occurrenceDate } from '../src/recurring.mjs';
import { runDailyAutomation } from '../src/automation.mjs';
import { toolServesCountry } from '../src/country.mjs';

const fabric = { description: 'Cotton fabric', hsn: '5208', qty: 100, rate: 500, gstRate: 5 };
const rent = { description: 'Shop rent', hsn: '997212', qty: 1, rate: 25000, gstRate: 18 };

test('proforma invoices, sales orders and delivery challans number on their own and post nothing', async () => {
  const state = createState();
  const proforma = await runTool(state, 'create_quote', { kind: 'proforma', partyName: 'ABC Ltd', lines: [fabric], date: '2026-10-01' });
  const order = await runTool(state, 'create_quote', { kind: 'order', partyName: 'ABC Ltd', lines: [fabric], date: '2026-10-01' });
  const challan = await runTool(state, 'create_quote', { kind: 'challan', reason: 'job-work', partyName: 'Kiran Dyers', lines: [fabric], date: '2026-10-02' });
  const quote = await runTool(state, 'create_quote', { partyName: 'ABC Ltd', lines: [fabric], date: '2026-10-01' });
  assert.deepEqual([proforma.quote.id, order.quote.id, challan.quote.id, quote.quote.id], ['PI-0001', 'SO-0001', 'DC-0001', 'QT-0001']);
  assert.equal(challan.quote.reason, 'job-work');
  assert.equal(proforma.quote.total, 52500);
  assert.equal(state.ledger.transfers.length, 0);
  const second = await runTool(state, 'create_quote', { kind: 'proforma', partyName: 'XYZ', lines: [fabric], date: '2026-10-03' });
  assert.equal(second.quote.id, 'PI-0002');
  const challans = await runTool(state, 'list_quotes', { kind: 'challan' });
  assert.deepEqual(challans.data.quotes.map((row) => [row.id, row.title]), [['DC-0001', 'Delivery challan']]);
  const doc = await runTool(state, 'quote_document', { id: 'DC-0001' });
  assert.equal(doc.data.documentTitle, 'Delivery challan');
  assert.equal(doc.data.reason, 'job-work');
  assert.equal((await runTool(state, 'create_quote', { kind: 'receipt', partyName: 'A', lines: [fabric] })).error, 'BAD_KIND');
  assert.equal((await runTool(state, 'create_quote', { kind: 'challan', reason: 'gift', partyName: 'A', lines: [fabric] })).error, 'BAD_CHALLAN_REASON');
});

test('orders and challans close the right way and only sales become invoices', async () => {
  const state = createState();
  await runTool(state, 'create_quote', { kind: 'order', partyName: 'ABC Ltd', lines: [fabric], date: '2026-10-01' });
  await runTool(state, 'create_quote', { kind: 'challan', reason: 'job-work', partyName: 'Kiran Dyers', lines: [fabric], date: '2026-10-01' });
  await runTool(state, 'create_quote', { kind: 'challan', reason: 'approval', partyName: 'Mehta Stores', lines: [fabric], date: '2026-10-01' });
  assert.equal((await runTool(state, 'mark_quote', { id: 'SO-0001', outcome: 'accepted' })).error, 'BAD_OUTCOME');
  assert.equal((await runTool(state, 'convert_quote', { id: 'DC-0001' })).error, 'CHALLAN_NOT_A_SALE');
  assert.equal((await runTool(state, 'mark_quote', { id: 'DC-0001', outcome: 'returned' })).quote.status, 'returned');
  assert.equal((await runTool(state, 'mark_quote', { id: 'DC-0001', outcome: 'cancelled' })).error, 'ALREADY_CLOSED');
  const sold = await runTool(state, 'convert_quote', { id: 'DC-0002', date: '2026-10-20' });
  assert.equal(sold.ok, true, JSON.stringify(sold));
  assert.equal(sold.invoice.quoteId, 'DC-0002');
  assert.equal(sold.invoice.total, 52500);
  const ordered = await runTool(state, 'convert_quote', { id: 'SO-0001', date: '2026-10-21' });
  assert.equal(ordered.ok, true);
  assert.equal((await runTool(state, 'mark_quote', { id: 'SO-0001', outcome: 'cancelled' })).error, 'ALREADY_INVOICED');
  assert.match(previewOf(state, 'convert_quote', { id: 'DC-0001' }).blockers[0], /already closed|job work/i);
});

test('chat makes proformas, orders and challans and refers to them by number', () => {
  const state = createState();
  assert.deepEqual(planLocalToolCall(state, 'proforma ABC Ltd 50000 for consulting GST 18%').args.kind, 'proforma');
  assert.deepEqual(planLocalToolCall(state, 'sales order ABC Ltd 10 chairs at 2000 GST 18%').args.kind, 'order');
  const challan = planLocalToolCall(state, 'delivery challan Kiran Dyers 50000 for fabric GST 5% for job work');
  assert.deepEqual([challan.name, challan.args.kind, challan.args.reason], ['create_quote', 'challan', 'job-work']);
  assert.deepEqual(planLocalToolCall(state, 'DC-0001 returned').args, { id: 'DC-0001', outcome: 'returned' });
  assert.deepEqual(planLocalToolCall(state, 'SO-0002 cancelled').args, { id: 'SO-0002', outcome: 'cancelled' });
  assert.equal(planLocalToolCall(state, 'convert PI-0001 to invoice').name, 'convert_quote');
  assert.notEqual(planLocalToolCall(state, 'deposited TDS 12000, challan 0510308 05112026 12345').name, 'create_quote');
  assert.equal(validateAssistantToolCall('mark_quote', { id: 'DC-0001', outcome: 'returned' }).ok, true);
  assert.equal(validateAssistantToolCall('create_quote', { partyName: 'A', lines: [fabric], kind: 'challan', reason: 'job-work' }).ok, true);
});

test('a month repeats on the same day and keeps to the end of short months', () => {
  assert.equal(occurrenceDate('2026-01-31', 'month', 1), '2026-02-28');
  assert.equal(occurrenceDate('2026-01-31', 'month', 2), '2026-03-31');
  assert.equal(occurrenceDate('2026-11-15', 'quarter', 1), '2027-02-15');
  assert.equal(occurrenceDate('2026-11-15', 'week', 2), '2026-11-29');
  assert.equal(occurrenceDate('2028-02-29', 'year', 1), '2029-02-28');
  assert.equal(occurrenceDate('2026-10-31', 'half-year', 1), '2027-04-30');
});

test('a repeating invoice is posted on each date by the daily run, once, until it ends', async () => {
  const state = createState();
  const made = await runTool(state, 'add_recurring', { kind: 'invoice', every: 'month', startDate: '2026-08-01', endDate: '2026-10-31', partyName: 'ABC Ltd', lines: [rent] });
  assert.equal(made.ok, true, JSON.stringify(made));
  assert.equal(made.schedule.id, 'RP-0001');
  assert.deepEqual(made.next, ['2026-08-01', '2026-09-01', '2026-10-01']);
  assert.equal(state.invoices.length, 0);
  const first = await runTool(state, 'run_recurring', { asOf: '2026-09-15' });
  assert.deepEqual(first.data.made.map((row) => row.date), ['2026-08-01', '2026-09-01']);
  assert.equal(state.invoices.length, 2);
  assert.deepEqual(state.invoices.map((inv) => inv.date), ['2026-08-01', '2026-09-01']);
  assert.equal(state.invoices[0].total, 29500);
  const again = await runTool(state, 'run_recurring', { asOf: '2026-09-15' });
  assert.equal(again.data.made.length, 0);
  runDailyAutomation(state, { asOf: '2026-12-01' });
  assert.equal(state.invoices.length, 3);
  const listed = await runTool(state, 'list_recurring', {});
  assert.equal(listed.data.schedules[0].status, 'ended');
  assert.equal(listed.data.schedules[0].count, 3);
  assert.ok(state.auditEvents.some((event) => event.action === 'recurring_posted' && event.metadata.scheduleId === 'RP-0001'));
});

test('a repeating expense and bill post on their dates, and a stopped one makes nothing more', async () => {
  const state = createState();
  await runTool(state, 'add_recurring', { kind: 'bill', every: 'month', startDate: '2026-09-05', partyName: 'Shree Properties', lines: [rent] });
  await runTool(state, 'add_recurring', { kind: 'expense', every: 'month', startDate: '2026-09-10', amount: 1180, narration: 'Broadband', payee: 'Airtel' });
  await runTool(state, 'run_recurring', { asOf: '2026-10-12' });
  assert.equal(state.purchases.length, 2);
  assert.equal(state.expenses.length, 2);
  assert.deepEqual(state.expenses.map((row) => row.date), ['2026-09-10', '2026-10-10']);
  assert.equal((await runTool(state, 'stop_recurring', { id: 'RP-0002' })).ok, true);
  assert.equal((await runTool(state, 'stop_recurring', { id: 'RP-0002' })).error, 'ALREADY_STOPPED');
  await runTool(state, 'run_recurring', { asOf: '2026-11-12' });
  assert.equal(state.purchases.length, 3);
  assert.equal(state.expenses.length, 2);
});

test('a repeating entry is checked before it is saved, and a failed date is retried, not skipped', async () => {
  const state = createState();
  assert.equal((await runTool(state, 'add_recurring', { kind: 'invoice', every: 'month', partyName: 'A', lines: [{ ...rent, gstRate: undefined }] })).error, 'RATE_REQUIRED');
  assert.equal((await runTool(state, 'add_recurring', { kind: 'invoice', every: 'fortnight', partyName: 'A', lines: [rent] })).error, 'BAD_EVERY');
  assert.equal((await runTool(state, 'add_recurring', { kind: 'invoice', every: 'month', startDate: '2026-10-01', endDate: '2026-09-01', partyName: 'A', lines: [rent] })).error, 'END_BEFORE_START');
  assert.deepEqual(previewOf(state, 'add_recurring', { kind: 'bill', every: 'month', lines: [rent] }).blockers, ['Say who the bill is from.']);
  const preview = previewOf(state, 'add_recurring', { kind: 'invoice', every: 'quarter', startDate: '2026-12-01', partyName: 'ABC Ltd', lines: [rent] });
  assert.match(preview.summary, /every quarter from 2026-12-01\. Next dates: 2026-12-01, 2027-03-01, 2027-06-01/);
  await runTool(state, 'add_recurring', { kind: 'invoice', every: 'month', startDate: '2026-08-01', partyName: 'ABC Ltd', lines: [rent] });
  await runTool(state, 'lock_period', { through: '2026-08-31' });
  const blocked = await runTool(state, 'run_recurring', { asOf: '2026-09-10' });
  assert.deepEqual(blocked.data.failed, [{ id: 'RP-0001', date: '2026-08-01', error: 'PERIOD_LOCKED' }]);
  assert.equal(state.invoices.length, 0);
  assert.equal(state.recurring[0].nextDate, '2026-08-01');
});

test('repeating entries survive a save, read remotely, and chat sets them up', async () => {
  const state = createState();
  await runTool(state, 'add_recurring', { kind: 'invoice', every: 'month', startDate: '2026-08-01', partyName: 'ABC Ltd', lines: [rent] });
  const back = deserialize(serialize(state));
  assert.equal(back.recurring.length, 1);
  assert.equal(back.recurring[0].id, 'RP-0001');
  assert.equal(isRemoteQuery('list_recurring'), true);
  assert.equal(isRemoteQuery('add_recurring'), false);
  assert.equal(toolServesCountry('add_recurring', 'US'), true);
  const plan = planLocalToolCall(state, 'repeat invoice to ABC Ltd 25000 for rent GST 18% every month from 2026-12-01');
  assert.deepEqual([plan.name, plan.args.every, plan.args.startDate, plan.args.partyName], ['add_recurring', 'month', '2026-12-01', 'ABC Ltd']);
  assert.equal(validateAssistantToolCall('add_recurring', plan.args).ok, true);
  assert.equal(planLocalToolCall(state, 'stop RP-0001').name, 'stop_recurring');
  assert.equal(planLocalToolCall(state, 'show repeating entries').name, 'list_recurring');
  const reply = await chat(state, 'show repeating entries');
  assert.match(JSON.stringify(reply), /RP-0001/);
});
