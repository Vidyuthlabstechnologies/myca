import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { createInvoice } from '../src/invoice.mjs';
import { chat } from '../src/router.mjs';
import { planLocalToolCall } from '../src/assistant-contract.mjs';
import { planEntryWithTds } from '../src/tds-intent.mjs';
import { previewOf } from '../src/chat-confirm.mjs';
import { tdsCreditCheck, tdsCreditWords } from '../src/tds-credits.mjs';
import { localToday } from '../src/dates.mjs';

const CSV_26AS = [
  'Section,Name of Deductor,TAN of Deductor,Amount Paid/Credited,Tax Deducted,Date of Booking',
  '194C,KIRAN STORES,MUMK12345B,50000,500,2026-10-20',
  '194J,EASTERN CONSULTANTS LLP,EAST12345B,75000,1500,2026-09-15',
].join('\n');

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  for (const [partyName, rate, date] of [['Kiran Stores', 100000, '2026-10-01'], ['Kiran Stores', 50000, '2026-10-05'], ['Delta Projects', 80000, '2026-10-06']]) {
    const out = createInvoice(state, { date, partyName, lines: [{ description: 'Services', qty: 1, rate, gstRate: 0 }] });
    assert.equal(out.ok, true, JSON.stringify(out));
  }
  return state;
}

function usBooks() {
  const state = createState();
  state.company = { name: 'Maple Street Bakery', country: 'US', gstin: '', state: '', ein: '12-3456789' };
  const out = createInvoice(state, { date: '2026-10-01', partyName: 'Kiran Stores', lines: [{ description: 'Cakes', qty: 1, rate: 8000, gstRate: 0 }] });
  assert.equal(out.ok, true, JSON.stringify(out));
  return state;
}

const direct = (state, sentence) => planLocalToolCall(state, sentence);
const viaChatPlanner = (state, sentence) => planEntryWithTds((text) => planLocalToolCall(state, text), sentence);
const receiptsOf = (state, id) => state.invoices.find((invoice) => invoice.id === id).receipts || [];

function previousFinancialYear() {
  const [year, month] = localToday().split('-').map(Number);
  const start = (month >= 4 ? year : year - 1) - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

function latestOccurrence(month, day) {
  const [year, thisMonth, today] = localToday().split('-').map(Number);
  const when = month > thisMonth || (month === thisMonth && day > today) ? year - 1 : year;
  return `${when}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

test('routing-1: a customer withholding TDS plans the TDS entry, with an amount said between the words or after them and the invoice on either side', () => {
  const state = books();
  const cases = [
    ['customer deducted 1000 TDS on invoice INV-0001', { invoiceId: 'INV-0001', amount: 1000 }],
    ['customer deducted 1,000 TDS on invoice INV-0001', { invoiceId: 'INV-0001', amount: 1000 }],
    ['customer deducted 1000 TDS on invoice INV-0001 section 194C', { invoiceId: 'INV-0001', amount: 1000, section: '194C' }],
    ['customer deducted 1000 tds on INV-0001 under 194C', { invoiceId: 'INV-0001', amount: 1000, section: '194C' }],
    ['INV-0001 tds withheld 500 dated 2026-10-15', { invoiceId: 'INV-0001', amount: 500, date: '2026-10-15' }],
    ['deducted tds 500 on INV-0001 under 194-C', { invoiceId: 'INV-0001', amount: 500, section: '194C' }],
    ['Kiran Stores withheld 5,000 TDS from INV-0002 under 194J', { invoiceId: 'INV-0002', amount: 5000, section: '194J' }],
    ['they cut 2000 tds on INV-0001 under 194J', { invoiceId: 'INV-0001', amount: 2000, section: '194J' }],
    ['INV-0001: 1000 tds cut by the customer', { invoiceId: 'INV-0001', amount: 1000 }],
    ['tds of 1000 withheld by Kiran Stores on INV-0001 section 194H', { invoiceId: 'INV-0001', amount: 1000, section: '194H' }],
    ['against INV-0002 the customer has deducted ₹750 as tds under 194C', { invoiceId: 'INV-0002', amount: 750, section: '194C' }],
  ];
  for (const [sentence, args] of cases) {
    for (const plan of [direct(state, sentence), viaChatPlanner(state, sentence)]) {
      assert.equal(plan.kind, 'tool', `${sentence}: ${JSON.stringify(plan)}`);
      assert.equal(plan.name, 'record_tds_withheld', `${sentence}: ${JSON.stringify(plan)}`);
      assert.deepEqual(plan.args, args, sentence);
    }
  }
});

test('routing-1: the section code, the TAN, the invoice id and a financial year are never read as the amount', () => {
  const state = books();
  const cases = [
    ['record tds withheld 2000 on INV-0001 under 194J', { invoiceId: 'INV-0001', amount: 2000, section: '194J' }],
    ['record tds withheld 2000 on INV-0001 under 194-C', { invoiceId: 'INV-0001', amount: 2000, section: '194C' }],
    ['record tds withheld 2000 on INV-0001 under 194 J', { invoiceId: 'INV-0001', amount: 2000, section: '194J' }],
    ['record tds withheld 2000 on INV-0001 section 194C', { invoiceId: 'INV-0001', amount: 2000, section: '194C' }],
    ['record tds withheld 2000 on INV-0001 u/s 206AB', { invoiceId: 'INV-0001', amount: 2000, section: '206AB' }],
    ['record tds withheld 2000 on INV-0001 under 194C, TAN MUMA12345B', { invoiceId: 'INV-0001', amount: 2000, section: '194C', tan: 'MUMA12345B' }],
    ['record tds withheld 2000 on INV-0001 under 194J tan: mumd 12345 b', { invoiceId: 'INV-0001', amount: 2000, section: '194J', tan: 'MUMD12345B' }],
    ['tds deducted 12345 on INV-0001 under 194J TAN MUMA12345B', { invoiceId: 'INV-0001', amount: 12345, section: '194J', tan: 'MUMA12345B' }],
    ['record tds withheld 195 on INV-0001 under 194J', { invoiceId: 'INV-0001', amount: 195, section: '194J' }],
    ['record tds withheld on INV-0001 under 194J for fy 2025-26 amount 2000', { invoiceId: 'INV-0001', amount: 2000, section: '194J' }],
    ['record tds withheld 2000 on INV-0001 under 194J for financial year 2026-27', { invoiceId: 'INV-0001', amount: 2000, section: '194J' }],
    ['record tds withheld 2000 on INV-0001 under 194J in fy 26-27', { invoiceId: 'INV-0001', amount: 2000, section: '194J' }],
    ['record tds withheld 2000 on INV-0001 under 194J in 2026', { invoiceId: 'INV-0001', amount: 2000, section: '194J' }],
  ];
  for (const [sentence, args] of cases) {
    const plan = direct(state, sentence);
    assert.equal(plan.name, 'record_tds_withheld', `${sentence}: ${JSON.stringify(plan)}`);
    assert.deepEqual(plan.args, args, sentence);
  }
  for (const sentence of ['record tds withheld on INV-0001 under 194J', 'record tds withheld on INV-0001 under 194-C TAN MUMA12345B', 'record tds withheld on INV-0001 under 194J in fy 2025-26']) {
    const plan = direct(state, sentence);
    assert.equal(plan.kind, 'reply', `${sentence}: ${JSON.stringify(plan)}`);
    assert.match(plan.reply, /Say how much TDS was withheld, for example "record tds withheld 2000 on INV-0001 under 194J"/, sentence);
    assert.match(plan.reply, /recorded nothing/, sentence);
  }
});

test('routing-1: a day number or a month name is not the amount, and a date said in words or with slashes reaches the tool as an ISO date', () => {
  const state = books();
  const cases = [
    ['tds withheld 500 on INV-0001 on 15 October under 194C', { invoiceId: 'INV-0001', amount: 500, section: '194C', date: latestOccurrence(10, 15) }],
    ['tds withheld 500 on INV-0001 on 15th October 2026 under 194C', { invoiceId: 'INV-0001', amount: 500, section: '194C', date: '2026-10-15' }],
    ['tds withheld 500 on INV-0001 on 15 Oct 2026', { invoiceId: 'INV-0001', amount: 500, date: '2026-10-15' }],
    ['tds withheld 500 on INV-0001 on October 15, 2026', { invoiceId: 'INV-0001', amount: 500, date: '2026-10-15' }],
    ['tds withheld 500 on INV-0001 dated 20/08/2026 under 194J', { invoiceId: 'INV-0001', amount: 500, section: '194J', date: '2026-08-20' }],
    ['tds withheld 500 on INV-0001 on 20-08-2026 under 194J', { invoiceId: 'INV-0001', amount: 500, section: '194J', date: '2026-08-20' }],
    ['tds withheld 500 on INV-0001 on 2026-08-20 under 194J', { invoiceId: 'INV-0001', amount: 500, section: '194J', date: '2026-08-20' }],
    ['customer deducted 500 tds on 3 September on INV-0002', { invoiceId: 'INV-0002', amount: 500, date: latestOccurrence(9, 3) }],
  ];
  for (const [sentence, args] of cases) {
    const plan = direct(state, sentence);
    assert.equal(plan.name, 'record_tds_withheld', `${sentence}: ${JSON.stringify(plan)}`);
    assert.deepEqual(plan.args, args, sentence);
  }
  for (const sentence of ['tds withheld 500 on INV-0001 dated 31/02/2026', 'tds withheld 500 on INV-0001 on 15/10/26', 'tds withheld 500 on INV-0001 dated 2026-13-45', 'tds withheld 500 on INV-0001 yesterday', 'tds withheld 500 on INV-0001 on 1 October and 5 October']) {
    const plan = direct(state, sentence);
    assert.equal(plan.kind, 'reply', `${sentence}: ${JSON.stringify(plan)}`);
    assert.match(plan.reply, /Say the date as YYYY-MM-DD/, sentence);
    assert.match(plan.reply, /recorded nothing/, sentence);
  }
});

test('routing-1: "invoice 5" and "INV-3" are asked for in full, and nothing is planned or posted', async () => {
  const state = books();
  for (const sentence of ['customer deducted 1000 TDS on invoice INV-3', 'Kiran Stores withheld tds 10000 on invoice 5', 'customer deducted 1000 TDS on invoice 3', 'Kiran Stores deducted 10000 tds on invoice 0005', 'tds withheld 1000 on invoice no. 3', 'Kiran Stores withheld tds 10000 on invoice INV-5']) {
    for (const plan of [direct(state, sentence), viaChatPlanner(state, sentence)]) {
      assert.equal(plan.kind, 'reply', `${sentence}: ${JSON.stringify(plan)}`);
      assert.match(plan.reply, /Say the invoice number, like INV-0001/, sentence);
      assert.match(plan.reply, /recorded nothing/, sentence);
    }
    const out = await chat(state, sentence);
    assert.deepEqual(out.tools, [], sentence);
    assert.equal(out.awaitingConfirmation, undefined, sentence);
    assert.doesNotMatch(out.reply, /GST rate|payments file/, sentence);
  }
  assert.equal(state.pendingChatAction ?? null, null);
  assert.deepEqual(receiptsOf(state, 'INV-0001'), []);
});

test('routing-1: those sentences never get the GST-rate demand or the TDS threshold monitor, and a held entry posts after yes', async () => {
  const state = books();
  const held = await chat(state, 'customer deducted 1000 TDS on invoice INV-0001 section 194C');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.match(held.reply, /TDS of ₹1,000\.00 withheld by Kiran Stores on INV-0001 \(section 194C\)/, held.reply);
  assert.doesNotMatch(held.reply, /GST rate/, held.reply);
  assert.deepEqual(receiptsOf(state, 'INV-0001'), []);
  const done = await chat(state, 'yes');
  assert.equal(done.posted, true, done.reply);
  assert.equal(done.reply, 'Recorded TDS of ₹1,000.00 withheld on INV-0001, dated 1 Oct 2026; ₹99,000.00 still owed.');
  assert.deepEqual(receiptsOf(state, 'INV-0001').map((receipt) => [receipt.mode, receipt.amount, receipt.section]), [['tds', 1000, '194C']]);

  const dated = await chat(state, 'INV-0002 tds withheld 500 dated 2026-10-15 under 194C');
  assert.equal(dated.awaitingConfirmation, true, dated.reply);
  assert.equal((await chat(state, 'yes')).posted, true);
  assert.deepEqual(receiptsOf(state, 'INV-0002').map((receipt) => [receipt.amount, receipt.date, receipt.section]), [[500, '2026-10-15', '194C']]);

  const worded = await chat(state, 'tds withheld 700 on INV-0003 on 15 Oct 2026 under 194J');
  assert.equal(worded.awaitingConfirmation, true, worded.reply);
  assert.equal((await chat(state, 'yes')).posted, true);
  assert.deepEqual(receiptsOf(state, 'INV-0003').map((receipt) => [receipt.amount, receipt.date, receipt.section]), [[700, '2026-10-15', '194J']]);

  const noSection = await chat(state, 'customer deducted 1000 TDS on invoice INV-0002');
  assert.equal(noSection.awaitingConfirmation, undefined, noSection.reply);
  assert.match(noSection.reply, /Say which TDS section the customer deducted under, like 194C or 194J\./, noSection.reply);
  assert.equal(receiptsOf(state, 'INV-0002').length, 1);

  for (const sentence of ['Kiran Stores withheld tds 10000 on invoice INV-0001 under 194J', 'customer deducted 1000 tds on INV-0001 under 194C', 'INV-0001 tds withheld 500 dated 2026-10-15']) {
    const out = await chat(state, sentence);
    assert.notEqual(out.tools?.[0]?.name, 'monitor_tds', sentence);
    assert.doesNotMatch(out.reply, /payments file|GST rate/, `${sentence}: ${out.reply}`);
    if (out.awaitingConfirmation) await chat(state, 'no');
  }
});

test('routing-1: sentences that are questions, negations or about another document keep their old routes', () => {
  const state = books();
  for (const sentence of ['was tds withheld on INV-0001?', 'did the customer withhold tds on INV-0001?', "don't record tds withheld 2000 on INV-0001 under 194J", 'how much tds was withheld on INV-0001?', 'we deduct TDS, TAN MUMA12345B', 'tds deducted this quarter', 'tds summary', 'deposited TDS 12000, challan 0510308 05112026 12345']) {
    assert.notEqual(direct(state, sentence).name, 'record_tds_withheld', sentence);
  }
  assert.equal(direct(state, 'we deduct TDS, TAN MUMA12345B').name, 'set_tds_deductor');
  assert.equal(direct(state, 'tds summary').name, 'tds_summary');
  assert.equal(direct(state, 'invoice Kiran Stores 10000 GST 18%, they will deduct tds').name, 'create_invoice');
  assert.equal(direct(state, 'sold 10000 to Kiran Stores GST 18%, they deduct tds').name, 'create_invoice');
  for (const sentence of [
    'invoice Kiran Stores 10000, they deducted tds',
    'invoice Kiran Stores 10000 for consulting, they deducted tds',
    'raise an invoice for Kiran Stores 10000, customer deducted tds',
    'Kiran Stores invoice 10000 tds cut',
    'invoice 5000 to Kiran Stores, they withheld tds',
    'I need to invoice Kiran Stores 10000, they deducted tds',
    'sold 10000 to Kiran Stores, they deducted tds',
  ]) {
    for (const plan of [direct(state, sentence), viaChatPlanner(state, sentence)]) {
      assert.equal(plan.kind, 'reply', `${sentence}: ${JSON.stringify(plan)}`);
      assert.match(plan.reply, /will not guess the GST rate/, sentence);
      assert.doesNotMatch(plan.reply, /Say the invoice number/, sentence);
    }
  }
});

test('routing-1: a statement that there was no TDS never plans an entry, an amount like 195k keeps its section, and a percentage or two invoices are asked about', () => {
  const state = books();
  for (const sentence of ['received 98000 against INV-0001 and no tds was cut', 'no tds withheld on INV-0001', 'customer did not deduct tds on INV-0001 5000', 'tds not deducted on INV-0001 2000', 'INV-0001 paid 100000, tds nil', 'received 98000 against INV-0001, tds 2000 not deducted', 'INV-0001 tds was not withheld 500']) {
    for (const plan of [direct(state, sentence), viaChatPlanner(state, sentence)]) {
      assert.notEqual(plan.name, 'record_tds_withheld', `${sentence}: ${JSON.stringify(plan)}`);
      assert.doesNotMatch(String(plan.reply || ''), /then say "record tds withheld/, sentence);
    }
  }
  assert.deepEqual(direct(state, 'tds withheld 195k on INV-0001 under 194J').args, { invoiceId: 'INV-0001', amount: 195000, section: '194J' });
  assert.deepEqual(direct(state, 'tds withheld 2k on INV-0001 under 194J').args, { invoiceId: 'INV-0001', amount: 2000, section: '194J' });
  assert.deepEqual(direct(state, 'tds withheld 2000 on INV-0001 u/s 194C(1)').args, { invoiceId: 'INV-0001', amount: 2000, section: '194C' });
  assert.deepEqual(direct(state, 'tds withheld 2000 on INV-0001 under 194IA').args, { invoiceId: 'INV-0001', amount: 2000, section: '194IA' });
  assert.deepEqual(direct(state, 'tds withheld 2000 on inv-0001 under 194j').args, { invoiceId: 'INV-0001', amount: 2000, section: '194J' });
  for (const sentence of ['tds withheld at 10% on INV-0001 of 50000', 'tds withheld 10 percent on INV-0001 of 50000']) {
    const plan = direct(state, sentence);
    assert.equal(plan.kind, 'reply', `${sentence}: ${JSON.stringify(plan)}`);
    assert.match(plan.reply, /Say how much TDS was withheld/, sentence);
  }
  const two = direct(state, 'tds withheld 1000 on INV-0001 and INV-0002');
  assert.equal(two.kind, 'reply', JSON.stringify(two));
  assert.match(two.reply, /Say one invoice at a time/);
  assert.match(two.reply, /recorded nothing/);
});

test('routing-2: undoing, reversing, removing or deleting a TDS entry never previews a second one', async () => {
  const state = books();
  assert.equal((await chat(state, 'record tds withheld 1000 on INV-0001 under 194J')).awaitingConfirmation, true);
  assert.equal((await chat(state, 'yes')).posted, true);
  assert.equal(receiptsOf(state, 'INV-0001').length, 1);

  const sentences = [
    'undo the tds withheld 1000 on INV-0001 under 194J',
    'reverse the tds deducted 1000 on INV-0001 under 194J',
    'delete tds withheld 1000 on INV-0001 section 194J',
    'revert the tds withheld on INV-0001',
    'remove the tds withheld 1000 on INV-0001',
    'the tds withheld 1000 on INV-0001 was wrong',
    'I made a mistake in the tds withheld on INV-0001',
    'cancel tds withheld 1000 on INV-0001',
    'cancel the tds deducted on INV-0001 under 194J',
    'undo tds withheld',
    'can I reverse the tds withheld on INV-0001?',
    'remove INV-0001 tds withheld 500 dated 2026-10-15',
    'delete INV-0001 tds withheld 500 dated 2026-10-15',
    'cancel INV-0001 tds withheld 500 dated 2026-10-15',
    "cancel INV-0001's tds",
    'undo tds',
    'reverse the tds',
    'remove tds',
    'delete the tds entry',
    'revert tds',
    'wrong tds',
    'mistake in tds',
    'tds was wrong',
    'undo the last tds',
    'remove the tds I recorded',
    'undo the receipt of 98000 after tds of 2000 on INV-0001',
  ];
  for (const sentence of sentences) {
    for (const plan of [direct(state, sentence), viaChatPlanner(state, sentence)]) {
      assert.equal(plan.kind, 'reply', `${sentence}: ${JSON.stringify(plan)}`);
      assert.match(plan.reply, /cannot be reversed from chat/, sentence);
      assert.match(plan.reply, /nothing was changed/, sentence);
      assert.match(plan.reply, /CA can correct it/, sentence);
      assert.doesNotMatch(plan.reply, /[A-Z]{3,}_[A-Z]{3,}/, sentence);
    }
    const out = await chat(state, sentence);
    assert.equal(out.awaitingConfirmation, undefined, sentence);
    assert.deepEqual(out.tools, [], sentence);
    assert.equal(state.pendingChatAction ?? null, null, sentence);
    const after = await chat(state, 'yes');
    assert.equal(after.reply, 'There is nothing waiting to be posted.', sentence);
  }
  assert.equal(receiptsOf(state, 'INV-0001').length, 1, 'the one entry is still the only entry');
  assert.equal(state.invoices[0].status, 'partial');
});

test('routing-2: cancelling an invoice or a reverse-charge purchase is not a TDS reversal', () => {
  const state = books();
  assert.equal(direct(state, 'cancel INV-0003 because the customer disputed it').name, 'cancel_invoice');
  assert.equal(direct(state, 'cancel INV-0003 because the customer deducted tds twice').name, 'cancel_invoice');
  assert.equal(direct(state, 'cancel invoice INV-0003').name, 'cancel_invoice');
  for (const sentence of ['reverse charge purchase from Fabric Co 10000 GST 18%, tds deducted under 194J', 'reverse charge bill from Fabric Co 10000 GST 18% tds 194C', 'RCM purchase from Fabric Co 10000 GST 18% with tds 194C']) {
    assert.equal(direct(state, sentence).name, 'create_purchase', sentence);
    const plan = viaChatPlanner(state, sentence);
    assert.equal(plan.name, 'create_purchase', `${sentence}: ${JSON.stringify(plan)}`);
    assert.match(plan.args.tdsSection, /^194[CJ]$/, sentence);
  }
  assert.doesNotMatch(String(direct(state, 'undo last entry').reply || ''), /TDS entry/);
});

test('routing-11: a receipt that also carries TDS plans nothing and says the two steps, with the numbers that were said', async () => {
  const state = books();
  const cases = [
    ['received 98000 on INV-0001 after tds of 2000', 2000, 98000, 'INV-0001'],
    ['received 98000 against INV-0001 after 2000 tds', 2000, 98000, 'INV-0001'],
    ['received 9000 against INV-0001, 1000 tds cut', 1000, 9000, 'INV-0001'],
    ['Kiran Stores paid 98000 on INV-0001, they cut 2000 tds', 2000, 98000, 'INV-0001'],
    ['received 98000 on INV-0001 and 2000 tds withheld', 2000, 98000, 'INV-0001'],
    ['got 9000 after 1000 tds', 1000, 9000, 'INV-0001'],
    ['got 9000 after tds of 1000', 1000, 9000, 'INV-0001'],
    ['received 7000 on INV-0002 less 500 tds', 500, 7000, 'INV-0002'],
  ];
  for (const [sentence, tds, cash, invoice] of cases) {
    for (const plan of [direct(state, sentence), viaChatPlanner(state, sentence)]) {
      assert.equal(plan.kind, 'reply', `${sentence}: ${JSON.stringify(plan)}`);
      assert.match(plan.reply, new RegExp(`then say "record tds withheld ${tds} on ${invoice} under 194J"`), sentence);
      assert.match(plan.reply, /section on the TDS certificate/, sentence);
      assert.match(plan.reply, new RegExp(`first say "received ${cash} against ${invoice}"`), sentence);
      assert.match(plan.reply, /recorded nothing/, sentence);
    }
    const out = await chat(state, sentence);
    assert.equal(out.awaitingConfirmation, undefined, `${sentence}: ${out.reply}`);
    assert.deepEqual(out.tools, [], sentence);
    assert.doesNotMatch(out.reply, /payments file|Receipt of/, sentence);
  }
  assert.deepEqual(receiptsOf(state, 'INV-0001'), []);
  assert.deepEqual(receiptsOf(state, 'INV-0002'), []);
});

test('routing-11: a receipt that says "net of tds" or "after tds" without an amount gets the same two steps, and the customer picks the invoice when it has only one', async () => {
  const state = books();
  for (const sentence of ['received 98000 against INV-0001 net of tds', 'received 98000 for INV-0001 after tds', 'record receipt for INV-0001 after tds']) {
    const plan = direct(state, sentence);
    assert.equal(plan.kind, 'reply', `${sentence}: ${JSON.stringify(plan)}`);
    assert.match(plan.reply, /then say "record tds withheld \d+ on INV-0001 under 194J"/, sentence);
    assert.match(plan.reply, /first say "received /, sentence);
    assert.match(plan.reply, /against INV-0001"/, sentence);
  }
  assert.match(direct(state, 'received 98000 against INV-0001 net of tds').reply, /first say "received 98000 against INV-0001"/);
  assert.match(direct(state, 'received 98000 against INV-0001 net of tds').reply, /\(use the TDS amount and the section on the TDS certificate\)/);
  assert.match(direct(state, 'received 98000 against INV-0001 after tds of 2000').reply, /\(use the section on the TDS certificate\)/);
  assert.match(direct(state, 'got 9000 after 1000 tds').reply, /\(use the invoice it belongs to and the section on the TDS certificate\)/);
  assert.match(direct(state, 'got 9000 after tds').reply, /\(use the invoice it belongs to, the TDS amount and the section on the TDS certificate\)/);
  assert.match(direct(state, 'received 98000 on INV-0001 after tds of 2000 under 194C').reply, /then say "record tds withheld 2000 on INV-0001 under 194C"/);
  const single = direct(state, 'received 9000 from Delta Projects after 1000 tds');
  assert.equal(single.kind, 'reply', JSON.stringify(single));
  assert.match(single.reply, /then say "record tds withheld 1000 on INV-0003 under 194J"/);
  assert.match(single.reply, /first say "received 9000 against INV-0003"/);
  const several = direct(state, 'Kiran Stores paid 9000 less tds');
  assert.equal(several.kind, 'reply', JSON.stringify(several));
  assert.match(several.reply, /record tds withheld \d+ on INV-0001 under 194J/);
});

test('routing-11: receipts without TDS, receipts that say there is none, and payments to suppliers keep their routes', () => {
  const state = books();
  const plain = direct(state, 'received 98000 against INV-0001');
  assert.deepEqual([plain.name, plain.args.invoiceId, plain.args.amount], ['record_receipt', 'INV-0001', 98000]);
  const none = direct(state, 'received 98000 against INV-0001, no tds');
  assert.deepEqual([none.name, none.args.invoiceId, none.args.amount], ['record_receipt', 'INV-0001', 98000]);
  assert.doesNotMatch(String(direct(state, 'received 98000 against INV-0001 without tds').reply || ''), /then say "record tds withheld/);
  assert.equal(direct(state, 'received 5000 from Delta Projects').name, 'record_receipt');
  assert.notEqual(direct(state, 'paid Fabric Co 5000 less tds 194C').kind, 'reply');
  assert.notEqual(direct(state, 'paid 5000 to Acme Steel after tds').kind, 'reply');
  assert.doesNotMatch(String(direct(state, 'received the tds certificate from Kiran Stores').reply || ''), /then say "record tds withheld/);
});

test('routing-9: natural ways of asking for the Form 26AS check reach it, and only a sentence that starts with an import command is an import', async () => {
  const state = books();
  for (const sentence of [
    'are my TDS credits in 26AS?',
    'are my tds credits in 26as',
    'TDS credit mismatch',
    'tds credit mismatch with 26AS',
    'TDS credit difference',
    'what does 26AS say vs my books',
    'what does 26AS say',
    'compare the imported 26AS with my books',
    'reconcile the 26AS I just imported',
    'check the 26AS file I attached',
    'tds credits on 26as',
    'tds credits from 26AS',
    'show my tds credits as per 26AS',
    'check my TDS credits',
    'does my 26AS match my books?',
    'check 26AS against the books',
    'reconcile TDS against 26AS',
    '26AS vs books',
    'tds credit check',
    'which TDS is missing from 26AS?',
    'tds not in 26AS',
    'did 26AS capture all my TDS?',
    'TDS credits missing in books',
    'tds credit not matching',
    'my tds credits do not match 26AS',
    'tds credit discrepancy',
  ]) {
    for (const plan of [direct(state, sentence), viaChatPlanner(state, sentence)]) {
      assert.equal(plan.kind, 'tool', `${sentence}: ${JSON.stringify(plan)}`);
      assert.equal(plan.name, 'tds_credit_check', `${sentence}: ${JSON.stringify(plan)}`);
      assert.deepEqual(plan.args, {}, sentence);
    }
  }
  for (const sentence of ['import 26AS', 'import form 26AS', 'import 26AS and check it against the books', 'please import my 26AS and compare it with the books', 'upload 26AS and check it', 'can you import 26AS and reconcile it?', 'importing 26AS and checking it']) {
    assert.notEqual(direct(state, sentence).name, 'tds_credit_check', sentence);
  }
  assert.match(direct(state, 'import 26AS and check it against the books').reply, /Attach Form 26AS/);
  for (const sentence of ["don't check 26AS", 'do not compare 26AS with the books', 'my TDS credits', 'tds credits', 'tds summary', 'tcs and tds credits', 'check my amazon tds credits', 'amazon tds credits missing', 'flipkart tds credit not matching']) {
    assert.notEqual(direct(state, sentence).name, 'tds_credit_check', sentence);
  }
  assert.equal(direct(state, 'tcs and tds credits').name, 'marketplace_credits');
  assert.equal(direct(state, 'tds credits').name, 'tds_summary');
  const out = await chat(state, 'TDS credit mismatch');
  assert.equal(out.tools[0].name, 'tds_credit_check');
  assert.doesNotMatch(out.reply, /not set up to deduct TDS|payments file/);
});

test('routing-9: a 26AS file that is attached but not imported is said in the answer, with what to say next', async () => {
  const state = books();
  state.pendingFile = { kind: '26as', name: 'Form26AS.csv', content: CSV_26AS };
  const out = await chat(state, 'check the 26AS file I attached');
  assert.equal(out.tools[0].name, 'tds_credit_check', out.reply);
  assert.match(out.reply, /^No TDS credit is on record for FY \d{4}-\d{2} yet\./, out.reply);
  assert.match(out.reply, /Form26AS\.csv/, out.reply);
  assert.match(out.reply, /not been imported/, out.reply);
  assert.match(out.reply, /say "import 26AS"/, out.reply);
  assert.equal(state.pendingFile?.name, 'Form26AS.csv', 'asking does not import or discard the file');

  const again = await chat(state, 'check 26AS against the books');
  assert.match(again.reply, /say "import 26AS"/, again.reply);

  const held = await chat(state, 'import 26AS');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.equal((await chat(state, 'yes')).posted, true);
  assert.equal(state.pendingFile, null);
  const after = await chat(state, 'check 26AS against the books');
  assert.match(after.reply, /^26AS vs books for FY \d{4}-\d{2}: ₹2,000\.00 in 26AS/, after.reply);
  assert.doesNotMatch(after.reply, /Form26AS\.csv|import 26AS/, after.reply);

  const other = books();
  other.pendingFile = { kind: 'bank', name: 'hdfc.csv', content: 'a,b' };
  const unrelated = await chat(other, 'check 26AS against the books');
  assert.doesNotMatch(unrelated.reply, /hdfc\.csv|not been imported/, unrelated.reply);
  assert.match(unrelated.reply, /^No TDS credit is on record for FY \d{4}-\d{2} yet\. Import Form 26AS/, unrelated.reply);
});

test('routing-9: the check words name an attached file only when one is waiting', () => {
  const data = tdsCreditCheck(books(), { fy: '2026-27' }).data;
  const money = (n) => `₹${n}`;
  assert.equal(data.rows.length, 0);
  const plain = tdsCreditWords(data, money);
  assert.match(plain, /^No TDS credit is on record for FY 2026-27 yet\. Import Form 26AS \(CSV or text from the income-tax portal\)/);
  assert.doesNotMatch(plain, /attached/);
  const waiting = tdsCreditWords({ ...data, pendingFile: 'Form26AS.csv' }, money);
  assert.match(waiting, /^No TDS credit is on record for FY 2026-27 yet\./);
  assert.match(waiting, /Form26AS\.csv/);
  assert.match(waiting, /say "import 26AS"/);
  const withRows = tdsCreditWords({ ...data, rows: [{ section: '194C', tan: 'MUMK12345B', deductor: 'KIRAN STORES', customer: '', quarter: 'Q3 2026-27', in26as: 500, inBooks: 0, gap: -500, status: 'not in books' }], totals: { in26as: 500, inBooks: 0, gap: -500, notInBooks: 500, notIn26as: 0 }, source: '26AS imported earlier', pendingFile: 'Form26AS.csv' }, money);
  assert.match(withRows, /^26AS vs books for FY 2026-27: ₹500 in 26AS/);
  assert.match(withRows, /Form26AS\.csv/);
  assert.match(withRows, /say "import 26AS"/);
});

test('routing-10: the financial year in the chat check is read from the ways people write it', () => {
  const state = books();
  const cases = [
    ['check 26AS for fy 2025-26', '2025-26'],
    ['check 26AS for FY2025-26', '2025-26'],
    ['check 26AS for FY 2025-2026', '2025-26'],
    ['check 26AS for financial year 2025-26', '2025-26'],
    ['check 26AS for f.y. 2025-26', '2025-26'],
    ['check 26AS for F.Y.2025-26', '2025-26'],
    ['check 26AS for 2025-26', '2025-26'],
    ['check 26AS for 2025-2026', '2025-26'],
    ['check 26AS for fy 25-26', '2025-26'],
    ['check 26AS for FY25-26', '2025-26'],
    ['check 26AS for FY 2025\u201326', '2025-26'],
    ['check 26AS for 2025\u20132026', '2025-26'],
    ['check 26AS for fy 2025/26', '2025-26'],
    ['check 26AS for financial year 2025 - 26', '2025-26'],
    ['check 26AS for AY 2026-27', '2025-26'],
    ['check 26AS for assessment year 2026-27', '2025-26'],
    ['check 26AS for a.y. 2025-26', '2024-25'],
    ['compare 26as with my books fy2026-2027', '2026-27'],
    ['check 26AS against the books for FY 2026-27', '2026-27'],
    ['are my tds credits in 26AS for 2024-25?', '2024-25'],
    ['check 26AS for last year', previousFinancialYear()],
    ['check 26AS for last financial year', previousFinancialYear()],
    ['check 26AS for the previous financial year', previousFinancialYear()],
  ];
  for (const [sentence, fy] of cases) {
    for (const plan of [direct(state, sentence), viaChatPlanner(state, sentence)]) {
      assert.equal(plan.name, 'tds_credit_check', `${sentence}: ${JSON.stringify(plan)}`);
      assert.deepEqual(plan.args, { fy }, sentence);
      assert.match(plan.args.fy, /^[0-9]{4}-[0-9]{2}$/);
    }
  }
  for (const sentence of ['check 26AS against the books', 'check 26AS for this year', 'check 26AS for 2026-10', 'check 26AS for 2025-04-01']) {
    assert.deepEqual(direct(state, sentence).args, {}, sentence);
  }
  for (const sentence of ['check 26AS for fy 2025-27', 'check 26AS for FY 2025-2027', 'check 26AS for financial year 2025-28']) {
    for (const plan of [direct(state, sentence), viaChatPlanner(state, sentence)]) {
      assert.equal(plan.kind, 'reply', `${sentence}: ${JSON.stringify(plan)}`);
      assert.match(plan.reply, /Say the financial year as two years in a row, like FY 2025-26/, sentence);
      assert.match(plan.reply, /checked nothing/, sentence);
    }
  }
});

test('routing-10: the answer is for the year that was asked, and names it', async () => {
  const state = books();
  const out = await chat(state, 'check 26AS for last year');
  assert.match(out.reply, new RegExp(`^No TDS credit is on record for FY ${previousFinancialYear()} yet\\.`), out.reply);
  const named = await chat(state, 'check 26AS for financial year 2025-26');
  assert.match(named.reply, /^No TDS credit is on record for FY 2025-26 yet\./, named.reply);
  const bare = await chat(state, 'tds credit mismatch for 2025-26');
  assert.match(bare.reply, /^No TDS credit is on record for FY 2025-26 yet\./, bare.reply);
});

test('routing-12: TDS withheld on US books is turned down when it is previewed, not after the yes', async () => {
  const state = usBooks();
  const preview = previewOf(state, 'record_tds_withheld', { invoiceId: 'INV-0001', amount: 2000, section: '194J' });
  assert.equal(preview.blockers.length, 1);
  assert.match(preview.blockers[0], /TDS withheld by customers is for India books/);
  assert.doesNotMatch(preview.blockers[0], /[A-Z]{3,}_[A-Z]{3,}/);

  const out = await chat(state, 'record tds withheld 2000 on INV-0001 under 194J');
  assert.equal(out.awaitingConfirmation, undefined, out.reply);
  assert.equal(out.blocked, true, out.reply);
  assert.match(out.reply, /TDS withheld by customers is for India books/, out.reply);
  assert.doesNotMatch(out.reply, /Reply "yes"/, out.reply);
  assert.equal(state.pendingChatAction ?? null, null);
  assert.equal((await chat(state, 'yes')).reply, 'There is nothing waiting to be posted.');
  assert.deepEqual(receiptsOf(state, 'INV-0001'), []);

  const natural = await chat(state, 'customer deducted 1000 TDS on invoice INV-0001 section 194C');
  assert.equal(natural.awaitingConfirmation, undefined, natural.reply);
  assert.match(natural.reply, /India books/, natural.reply);

  const india = books();
  const fine = previewOf(india, 'record_tds_withheld', { invoiceId: 'INV-0001', amount: 2000, section: '194J' });
  assert.deepEqual(fine.blockers, []);
  assert.equal(fine.summary, 'TDS of ₹2,000.00 withheld by Kiran Stores on INV-0001 (section 194J), dated 1 Oct 2026');
});
