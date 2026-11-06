import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat, propose, confirmPending } from '../src/router.mjs';
import { needsConfirmation, previewOf } from '../src/chat-confirm.mjs';
import { localToday } from '../src/dates.mjs';

const AS_OF = '2026-10-05';
const ROW = 'MSME bills inside their limit';

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27' };
  return state;
}

const BILL = (date, no, name = 'Fabric Co', gstin = '27AAACF1234A1Z5') => ({ partyName: name, partyGstin: gstin, lines: [{ description: 'Cloth', hsn: '5208', qty: 10, rate: 1000, gstRate: 5 }], date, supplierInvoiceNo: no });

const msmeReminders = (state) => (state.reminders || []).filter((item) => String(item.source || '').startsWith('msme:'));
const closeRow = (close) => close.data.checklist.find((item) => item.item === ROW);

test('the daily run reminds the owner a week before an MSME pay-by date, once per bill, naming the bill', async () => {
  const state = books();
  await runTool(state, 'set_supplier_terms', { partyName: 'Fabric Co', msme: true, udyam: 'UDYAM-MH-12-1234567', category: 'small' });
  const bill = await runTool(state, 'create_purchase', BILL('2026-09-30', 'F-1'));
  assert.equal(bill.invoice.dueDate, '2026-10-15');
  const first = await runTool(state, 'run_automation', { asOf: AS_OF });
  assert.equal(first.ok, true, JSON.stringify(first));
  const made = msmeReminders(state);
  assert.equal(made.length, 1, JSON.stringify(state.reminders));
  assert.equal(made[0].source, 'msme:BILL-0001:2026-10-15');
  assert.equal(made[0].due, '2026-10-08');
  assert.deepEqual(made[0].about, { kind: 'bill', id: 'BILL-0001', name: 'Fabric Co' });
  assert.equal(made[0].text, 'Pay Fabric Co ₹10,500.00 on BILL-0001 by 2026-10-15 (MSME limit)');
  assert.equal(made[0].createdBy, 'automation');
  assert.equal(made[0].done, null);
  assert.ok(first.data.run.reminders.some((item) => item.text === made[0].text && item.due === '2026-10-08'));
  const skipped = await runTool(state, 'run_automation', { asOf: AS_OF });
  assert.equal(skipped.data.skipped, true, 'the daily run does not repeat itself on the same day');
  const again = await runTool(state, 'run_automation', { asOf: AS_OF, force: true });
  assert.equal(again.ok, true);
  assert.equal(msmeReminders(state).length, 1, 'the same bill is never reminded twice');
  assert.equal(again.data.run.reminders.filter((item) => /MSME limit/.test(item.text)).length, 0);
  const next = await runTool(state, 'run_automation', { asOf: '2026-10-06' });
  assert.equal(next.data.run.reminders.filter((item) => /MSME limit/.test(item.text)).length, 0, 'a later day does not repeat the reminder either');
  assert.equal(msmeReminders(state).length, 1);
  const listed = await runTool(state, 'list_reminders', { today: '2026-10-08' });
  const due = listed.data.reminders.find((item) => item.source === 'msme:BILL-0001:2026-10-15');
  assert.equal(due.state, 'today');
  assert.equal(due.about.id, 'BILL-0001');
});

test('a pay-by date closer than a week is reminded today, a paid bill and a bill past its date are not', async () => {
  const state = books();
  await runTool(state, 'set_supplier_terms', { partyName: 'Fabric Co', msme: true });
  await runTool(state, 'create_purchase', BILL('2026-09-23', 'F-1'));
  await runTool(state, 'create_purchase', BILL('2026-09-28', 'F-2'));
  await runTool(state, 'create_purchase', BILL('2026-09-01', 'F-3'));
  const paid = await runTool(state, 'record_payment', { billId: 'BILL-0002', date: AS_OF });
  assert.equal(paid.ok, true, JSON.stringify(paid));
  await runTool(state, 'run_automation', { asOf: AS_OF });
  const made = msmeReminders(state);
  assert.deepEqual(made.map((item) => [item.source, item.due]), [['msme:BILL-0001:2026-10-08', AS_OF]]);
});

test('the alert looks two weeks ahead: a pay-by date up to 21 days away is reminded on its alert day and a further one waits', async () => {
  const state = books();
  await runTool(state, 'set_supplier_terms', { partyName: 'Fabric Co', msme: true, days: 45 });
  await runTool(state, 'create_purchase', BILL('2026-08-28', 'F-1'));
  await runTool(state, 'create_purchase', BILL('2026-09-11', 'F-2'));
  await runTool(state, 'create_purchase', BILL('2026-09-12', 'F-3'));
  const dues = await runTool(state, 'supplier_dues', { asOf: AS_OF });
  assert.deepEqual(dues.data.bills.map((row) => [row.billId, row.payBy]), [['BILL-0001', '2026-10-12'], ['BILL-0002', '2026-10-26'], ['BILL-0003', '2026-10-27']]);
  await runTool(state, 'run_automation', { asOf: AS_OF });
  assert.deepEqual(msmeReminders(state).map((item) => [item.source, item.due]), [['msme:BILL-0001:2026-10-12', AS_OF], ['msme:BILL-0002:2026-10-26', '2026-10-19']]);
  const later = await runTool(state, 'run_automation', { asOf: '2026-10-06' });
  assert.equal(later.ok, true);
  assert.deepEqual(msmeReminders(state).map((item) => item.source), ['msme:BILL-0001:2026-10-12', 'msme:BILL-0002:2026-10-26', 'msme:BILL-0003:2026-10-27']);
  assert.equal(msmeReminders(state)[2].due, '2026-10-20');
});

test('the pay-by date is part of the reminder key, so changed terms raise a fresh reminder and a long supplier name never drops it', async () => {
  const state = books();
  const name = 'Sri Venkata Lakshmi Narasimha Textile Manufacturing And Trading Company Private Limited Of Coimbatore Tamil Nadu India Head Office';
  assert.ok(name.length > 120);
  await runTool(state, 'set_supplier_terms', { partyName: name, partyGstin: '27AAACF1234A1Z5', msme: true });
  const bill = await runTool(state, 'create_purchase', BILL('2026-09-30', 'F-1', name));
  assert.equal(bill.ok, true, JSON.stringify(bill));
  await runTool(state, 'run_automation', { asOf: AS_OF });
  const first = msmeReminders(state);
  assert.equal(first.length, 1, JSON.stringify(state.reminders));
  assert.ok(first[0].text.startsWith(`Pay ${name.slice(0, 60)} ₹`), first[0].text);
  assert.ok(first[0].text.length < 200);
  assert.equal(first[0].source, 'msme:BILL-0001:2026-10-15');
  await runTool(state, 'set_supplier_terms', { partyName: name, partyGstin: '27AAACF1234A1Z5', days: 20 });
  await runTool(state, 'run_automation', { asOf: AS_OF, force: true });
  assert.deepEqual(msmeReminders(state).map((item) => [item.source, item.due]), [['msme:BILL-0001:2026-10-15', '2026-10-08'], ['msme:BILL-0001:2026-10-20', '2026-10-13']]);
});

test('an MSME bill past its limit is a high exception that resolves itself when the bill is paid, and the payment run still offers the bill', async () => {
  const state = books();
  await runTool(state, 'set_supplier_terms', { partyName: 'Fabric Co', msme: true });
  await runTool(state, 'create_purchase', BILL('2026-09-01', 'F-1'));
  const close = await runTool(state, 'daily_close', { asOf: AS_OF });
  assert.equal(close.ok, true, JSON.stringify(close));
  const open = await runTool(state, 'exceptions', { asOfDate: AS_OF });
  const raised = open.data.exceptions.find((item) => item.code === 'MSME_PAST_LIMIT');
  assert.ok(raised, JSON.stringify(open.data.exceptions));
  assert.equal(raised.severity, 'high');
  assert.equal(raised.source, 'msme');
  assert.equal(raised.moneyAtRisk, 10500);
  assert.equal(raised.key, 'msme:past-limit:BILL-0001');
  assert.match(raised.title, /^Fabric Co BILL-0001 is past the MSMED pay-by date$/);
  assert.match(raised.why, /16 September 2026/);
  assert.match(raised.why, /₹10,500\.00 is still outstanding and is not deductible until it is paid \(Section 43B\(h\)\)/);
  assert.equal(raised.evidence.billId, 'BILL-0001');
  assert.equal(raised.evidence.payBy, '2026-09-16');
  assert.equal(raised.evidence.supplier, 'Fabric Co');
  assert.equal(raised.evidence.gstin, '27AAACF1234A1Z5');
  assert.equal(raised.evidence.billIds, undefined, 'the payment run must not hold the bill back');
  assert.equal(raised.evidence.invoiceNo, undefined);
  assert.deepEqual(raised.ruleIds, ['msme.payment-days@2026-09-01']);
  const run = await runTool(state, 'payment_run', { asOf: AS_OF });
  assert.equal(run.ok, true, JSON.stringify(run));
  assert.ok(run.data.proposed.some((row) => row.billId === 'BILL-0001' && row.bucket === 'msme-limit'), JSON.stringify(run.data));
  assert.deepEqual(run.data.held, []);
  assert.deepEqual(closeRow(close), { item: ROW, ok: false, detail: '1 open, 1 past the limit' });
  assert.ok(close.data.needsYou.includes(ROW));
  const automated = await runTool(state, 'run_automation', { asOf: AS_OF });
  assert.equal(msmeReminders(state).length, 0, 'a bill already past its date gets the exception, not a reminder');
  assert.equal(automated.data.run.close.status, 'needs you');

  const paid = await runTool(state, 'record_payment', { billId: 'BILL-0001', date: AS_OF });
  assert.equal(paid.ok, true, JSON.stringify(paid));
  const after = await runTool(state, 'daily_close', { asOf: AS_OF });
  assert.deepEqual(closeRow(after), { item: ROW, ok: true, detail: 'none open' });
  const resolved = await runTool(state, 'exceptions', { asOfDate: AS_OF, status: 'resolved' });
  const gone = resolved.data.exceptions.find((item) => item.code === 'MSME_PAST_LIMIT');
  assert.equal(gone.resolution, 'no_longer_detected');
  assert.equal((await runTool(state, 'exceptions', { asOfDate: AS_OF })).data.exceptions.some((item) => item.code === 'MSME_PAST_LIMIT'), false);
});

test('a supplier that is not marked MSME raises no MSME exception however late the bill is', async () => {
  const state = books();
  await runTool(state, 'set_supplier_terms', { partyName: 'Fabric Co', days: 15 });
  await runTool(state, 'create_purchase', BILL('2026-09-01', 'F-1'));
  const dues = await runTool(state, 'supplier_dues', { asOf: AS_OF });
  assert.equal(dues.data.bills[0].overdue, true);
  assert.equal(dues.data.bills[0].msme, false);
  const open = await runTool(state, 'exceptions', { asOfDate: AS_OF });
  assert.equal(open.data.exceptions.some((item) => item.code === 'MSME_PAST_LIMIT'), false);
  const close = await runTool(state, 'daily_close', { asOf: AS_OF });
  assert.deepEqual(closeRow(close), { item: ROW, ok: true, detail: 'none open' });
  await runTool(state, 'run_automation', { asOf: AS_OF });
  assert.equal(msmeReminders(state).length, 0);
});

test('the daily close row counts open MSME bills and only fails when one is past the limit', async () => {
  const state = books();
  const none = await runTool(state, 'daily_close', { asOf: AS_OF });
  assert.deepEqual(closeRow(none), { item: ROW, ok: true, detail: 'none open' });
  const names = none.data.checklist.map((item) => item.item);
  assert.equal(names[names.indexOf('Bank lines matched') + 1], ROW, 'the row follows the bank lines row');
  await runTool(state, 'set_supplier_terms', { partyName: 'Fabric Co', msme: true, days: 45 });
  await runTool(state, 'create_purchase', BILL('2026-09-28', 'F-1'));
  await runTool(state, 'create_purchase', BILL('2026-10-01', 'F-2'));
  const inside = await runTool(state, 'daily_close', { asOf: AS_OF });
  assert.deepEqual(closeRow(inside), { item: ROW, ok: true, detail: '2 open, 0 past the limit' });
  assert.equal(inside.data.needsYou.includes(ROW), false);
  const late = await runTool(state, 'daily_close', { asOf: '2026-11-13' });
  assert.deepEqual(closeRow(late), { item: ROW, ok: false, detail: '2 open, 1 past the limit' });
  assert.ok(late.data.needsYou.includes(ROW));

  const fresh = books();
  await runTool(fresh, 'set_supplier_terms', { partyName: 'Fabric Co', msme: true, days: 45 });
  await runTool(fresh, 'create_purchase', BILL(localToday(), 'F-9'));
  const words = await chat(fresh, 'are the books closed?');
  assert.match(words.reply, /✓ MSME bills inside their limit: 1 open, 0 past the limit/, words.reply);
});

test('marking a supplier MSME is confirmed first: the preview says what changes, blockers read as sentences, and chat waits for a yes', async () => {
  const state = books();
  assert.equal(needsConfirmation('set_supplier_terms'), true);
  const msme = previewOf(state, 'set_supplier_terms', { partyName: 'Fabric Co', msme: true, udyam: 'UDYAM-MH-12-1234567', category: 'small', days: 30 });
  assert.deepEqual(msme.blockers, []);
  assert.equal(msme.summary, 'Mark Fabric Co as an MSME supplier (small, Udyam UDYAM-MH-12-1234567) to be paid within 30 days');
  assert.deepEqual(msme.effects, ['New bills from them get a pay-by date 30 days from the bill date; MyCA reminds you a week before it. Nothing is posted.']);
  assert.deepEqual(msme.figures, { days: 30 });
  const statutory = previewOf(state, 'set_supplier_terms', { partyName: 'Fabric Co', msme: true });
  assert.equal(statutory.summary, 'Mark Fabric Co as an MSME supplier (category not given, Udyam not given) to be paid within 15 days');
  assert.deepEqual(statutory.figures, { days: 15 });
  const plain = previewOf(state, 'set_supplier_terms', { partyName: 'Steel Co', days: 60 });
  assert.equal(plain.summary, "Set Steel Co's terms to 60 days");
  assert.deepEqual(plain.effects, ['New bills from them get a pay-by date 60 days from the bill date. Nothing is posted.']);
  assert.deepEqual(plain.figures, { days: 60 });
  assert.deepEqual(previewOf(state, 'set_supplier_terms', { partyName: 'Fabric Co', udyam: 'UDYAM-12' }).blockers, ['A Udyam number looks like UDYAM-XX-00-0000000.']);
  assert.deepEqual(previewOf(state, 'set_supplier_terms', { partyName: 'Fabric Co', msme: true, days: 60 }).blockers, ['An MSME supplier must be paid within 45 days, so the agreed days cannot be more than 45.']);
  assert.deepEqual(previewOf(state, 'set_supplier_terms', { partyName: 'Fabric Co', days: 400 }).blockers, ['Agreed days must be a whole number from 0 to 365.']);
  assert.deepEqual(previewOf(state, 'set_supplier_terms', { partyName: 'Fabric Co', category: 'large' }).blockers, ['The category is micro, small or medium.']);
  assert.deepEqual(previewOf(state, 'set_supplier_terms', {}).blockers, ['Say which supplier.']);
  assert.deepEqual(previewOf(state, 'set_supplier_terms', { partyName: 'Fabric Co' }).blockers, ['Give the agreed days, or mark the supplier as MSME.']);

  const refused = await chat(state, 'Fabric Co is MSME, 60 days');
  assert.equal(refused.posted, false);
  assert.equal(refused.awaitingConfirmation, undefined);
  assert.match(refused.reply, /An MSME supplier must be paid within 45 days, so the agreed days cannot be more than 45\./);

  const said = await chat(state, 'Fabric Co is MSME, 30 days');
  assert.equal(said.awaitingConfirmation, true, JSON.stringify(said));
  assert.equal(said.posted, false);
  assert.equal(said.preview.tool, 'set_supplier_terms');
  assert.match(said.reply, /Mark Fabric Co as an MSME supplier/);
  assert.equal(Object.keys(state.supplierTerms).length, 0, 'nothing is saved before the yes');
  const yes = await chat(state, 'yes');
  assert.equal(yes.posted, true, JSON.stringify(yes));
  const saved = Object.values(state.supplierTerms);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].msme, true);
  assert.equal(saved[0].days, 30);
  const unmarked = previewOf(state, 'set_supplier_terms', { partyName: 'Fabric Co', msme: false });
  assert.equal(unmarked.summary, 'Fabric Co is no longer marked MSME');
  assert.deepEqual(unmarked.figures, { days: 30 });
  assert.deepEqual(unmarked.effects, ['New bills from them get a pay-by date 30 days from the bill date, without the MSME limit or its reminder. Nothing is posted.']);

  const udyam = await chat(state, "Steel Co's udyam number is UDYAM-GJ-01-0000001");
  assert.equal(udyam.awaitingConfirmation, true, JSON.stringify(udyam));
  assert.match(udyam.reply, /Mark Steel Co as an MSME supplier \(category not given, Udyam UDYAM-GJ-01-0000001\) to be paid within 15 days/);
  const no = await chat(state, 'no');
  assert.equal(no.posted, false);
  assert.equal(Object.keys(state.supplierTerms).length, 1, 'a discarded preview saves nothing');
});

test('the app can propose supplier terms: the form gets a preview and the same token confirms it', async () => {
  const state = books();
  const out = await propose(state, 'set_supplier_terms', { partyName: 'Fabric Co', partyGstin: '27AAACF1234A1Z5', msme: true, udyam: 'UDYAM-MH-12-1234567', category: 'micro', days: 30 });
  assert.equal(out.awaitingConfirmation, true, JSON.stringify(out));
  assert.equal(out.error, undefined);
  assert.equal(out.preview.tool, 'set_supplier_terms');
  assert.match(out.preview.summary, /^Mark Fabric Co as an MSME supplier \(micro, Udyam UDYAM-MH-12-1234567\) to be paid within 30 days$/);
  assert.deepEqual(out.preview.figures, { days: 30 });
  assert.equal(Object.keys(state.supplierTerms).length, 0);
  const done = await confirmPending(state, out.preview.token);
  assert.equal(done.posted, true, JSON.stringify(done));
  assert.deepEqual(Object.values(state.supplierTerms), [{ msme: true, udyam: 'UDYAM-MH-12-1234567', category: 'micro', days: 30 }]);
  const blocked = await propose(state, 'set_supplier_terms', { partyName: 'Fabric Co', partyGstin: '27AAACF1234A1Z5', msme: true, days: 90 });
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.awaitingConfirmation, undefined);
  assert.match(blocked.reply, /cannot be more than 45/);
});

test('US books get no MSME reminders, exceptions or checklist row', async () => {
  const state = createState();
  state.company = { ...state.company, name: 'Luna Bakery LLC', country: 'US', state: 'TX', gstin: '' };
  state.purchases.push({ id: 'BILL-0001', date: '2026-09-01', partyName: 'Micro Dyes', partyGstin: '', partyState: '', lines: [], taxable: 1000, cgst: 0, sgst: 0, igst: 0, total: 1000, status: 'posted', kind: 'purchase', transferIds: [] });
  const marked = await runTool(state, 'set_supplier_terms', { partyName: 'Micro Dyes', msme: true });
  assert.equal(marked.ok, true, JSON.stringify(marked));
  const dues = await runTool(state, 'supplier_dues', { asOf: AS_OF });
  assert.equal(dues.data.msme.overdue, 1, 'the dues tool itself still reports the bill');
  const run = await runTool(state, 'run_automation', { asOf: AS_OF });
  assert.equal(run.ok, true, JSON.stringify(run));
  assert.equal(msmeReminders(state).length, 0);
  assert.equal(run.data.run.close.checklist.some((item) => item.item === ROW), false);
  const open = await runTool(state, 'exceptions', { asOfDate: AS_OF });
  assert.equal(open.data.exceptions.some((item) => item.code === 'MSME_PAST_LIMIT'), false, JSON.stringify(open.data.exceptions));
  const close = await runTool(state, 'daily_close', { asOf: AS_OF });
  assert.equal(closeRow(close), undefined);
});
