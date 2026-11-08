import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { createInvoice, createPurchase } from '../src/invoice.mjs';
import { chat } from '../src/router.mjs';
import { planLocalToolCall } from '../src/assistant-contract.mjs';
import { planEntryWithTds } from '../src/tds-intent.mjs';
import { previewOf } from '../src/chat-confirm.mjs';
import { tdsCreditCheck, tdsCreditWords } from '../src/tds-credits.mjs';
import { localToday } from '../src/dates.mjs';

function currentFinancialYearStart() {
  const [year, month] = localToday().split('-').map(Number);
  return month >= 4 ? year : year - 1;
}

function csv26as() {
  const start = currentFinancialYearStart();
  return [
    'Section,Name of Deductor,TAN of Deductor,Amount Paid/Credited,Tax Deducted,Date of Booking',
    `194C,KIRAN STORES,MUMK12345B,50000,500,${start}-10-20`,
    `194J,EASTERN CONSULTANTS LLP,EAST12345B,75000,1500,${start}-09-15`,
  ].join('\n');
}

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
  state.pendingFile = { kind: '26as', name: 'Form26AS.csv', content: csv26as() };
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

function booksWithSuppliers() {
  const state = books();
  state.company = { ...state.company, tan: 'MUMA12345B', tdsDeductor: true };
  for (const [partyName, partyGstin, supplierInvoiceNo, date, rate, gstRate] of [
    ['Fabric Co', '27AABCT1332L1ZE', 'F-101', '2026-10-05', 10000, 5],
    ['Acme Steel', '27AAACA1234B1Z9', 'A-1', '2026-10-08', 20000, 18],
    ['IMS Logistics', '29AABCI1234J1ZL', 'IL-1', '2026-10-10', 7000, 18],
  ]) {
    const out = createPurchase(state, { date, partyName, partyGstin, supplierInvoiceNo, lines: [{ description: 'Goods', hsn: '5208', qty: 1, rate, gstRate }] });
    assert.equal(out.ok, true, JSON.stringify(out));
  }
  return state;
}

function stepsOf(reply) {
  const first = /first say "received (\S+) against (\S+)"/.exec(String(reply || ''));
  const then = /then say "record tds withheld (\S+) on (\S+) under (\S+)"/.exec(String(reply || ''));
  return first && then ? { tds: then[1], invoice: then[2], section: then[3], cash: first[1], cashInvoice: first[2] } : null;
}

const TWO_STEP_OR_ASK = /first say "received|Say the invoice number|Say how much TDS was withheld|Say one invoice at a time|Say the date as/;

function assertSteps(plan, sentence, { tds, cash, invoice }) {
  assert.equal(plan.kind, 'reply', `${sentence}: ${JSON.stringify(plan)}`);
  const steps = stepsOf(plan.reply);
  assert.ok(steps, `${sentence}: ${plan.reply}`);
  assert.equal(steps.tds, String(tds), `${sentence}: the TDS amount in the example is ${steps.tds}`);
  assert.equal(steps.cash, String(cash), `${sentence}: the cash amount in the example is ${steps.cash}`);
  if (invoice) {
    assert.equal(steps.invoice, invoice, sentence);
    assert.equal(steps.cashInvoice, invoice, sentence);
  }
  assert.match(plan.reply, /recorded nothing/, sentence);
}

test('gap 1 (routing-11): the numbers in the printed example are the ones that were said, with a comma after the cash amount, a rupee sign or a percentage', async () => {
  const state = books();
  const cases = [
    ['received 98000, tds 2000 on INV-0001', 2000, 98000, 'INV-0001'],
    ['received ₹98,000, tds ₹2,000 on INV-0001', 2000, 98000, 'INV-0001'],
    ['INV-0001 received 98000, tds 2000 deducted', 2000, 98000, 'INV-0001'],
    ['INV-0001 paid 98000, tds deducted 2000', 2000, 98000, 'INV-0001'],
    ['received 98,000, tds 2,000 against INV-0001', 2000, 98000, 'INV-0001'],
    ['Kiran Stores paid 98000, tds 2000 withheld, INV-0001', 2000, 98000, 'INV-0001'],
    ['received 98000 tds 2000 on INV-0001', 2000, 98000, 'INV-0001'],
    ['received from Kiran Stores 98000, tds deducted 2000', 2000, 98000, 'INV-0001'],
    ['received rent from tenant 50000, tds deducted 5000', 5000, 50000, 'INV-0001'],
    ['received 98000; tds 2000 on INV-0001', 2000, 98000, 'INV-0001'],
    ['received 9,80,000, tds 20,000 on INV-0001', 20000, 980000, 'INV-0001'],
  ];
  for (const [sentence, tds, cash, invoice] of cases) {
    for (const plan of [direct(state, sentence), viaChatPlanner(state, sentence)]) assertSteps(plan, sentence, { tds, cash, invoice });
    const out = await chat(state, sentence);
    assert.equal(out.awaitingConfirmation, undefined, `${sentence}: ${out.reply}`);
    assert.deepEqual(out.tools, [], sentence);
  }
  for (const sentence of [
    'received 98000 and tds 2% deducted on INV-0001',
    'received 98000, tds 2% on INV-0001',
    'received 98000 on INV-0001 after 2 percent tds',
    'received 98000 on INV-0001 after 2% tds',
    'received 98000 for INV-0001 tds @2%',
    'received 98000 for INV-0001, tds 2% deducted',
    'received 98000 for INV-0001 (net of 2% tds)',
  ]) {
    const plan = direct(state, sentence);
    assertSteps(plan, sentence, { tds: 2000, cash: 98000, invoice: 'INV-0001' });
    assert.match(plan.reply, /\(use [^)]*the TDS amount/, `${sentence}: a percentage is not an amount, so the TDS amount is asked for`);
  }
});

test('gap 2 (neighbour paths): supplier bills, expenses and notes that mention TDS keep create_purchase, post_expense and their own replies', async () => {
  const state = booksWithSuppliers();
  const purchases = [
    ['received a bill from Fabric Co for 10000 GST 18%, tds deducted under 194J', '194J', 18],
    ['got a bill from Fabric Co for 10000 GST 18%, tds deducted under 194J', '194J', 18],
    ['received bill from Fabric Co 10000 GST 18% tds cut 194C', '194C', 18],
    ['received a bill from Fabric Co for 10000 GST 18%, tds cut under 194C', '194C', 18],
    ['got bill from Fabric Co 10000 GST 18% tds deducted 194C', '194C', 18],
    ['got a purchase invoice from Fabric Co 10000 GST 18%, they cut tds under 194C', '194C', 18],
    ['bill from Fabric Co 10000 GST 18% tds deducted under 194C received today', '194C', 18],
    ['purchase from Fabric Co 10000 GST 18% receipt attached, tds cut under 194C', '194C', 18],
    ['bought cloth from Fabric Co 10000 GST 5%, got receipt, tds deducted 194C', '194C', 5],
    ['bill from Fabric Co 10000 GST 18% their invoice INV-2045, tds deducted under 194C', '194C', 18],
    ['purchase from Fabric Co 10000 GST 18% supplier invoice INV-2045 tds deducted 194C', '194C', 18],
    ['bill from Fabric Co INV-2045 10000 GST 18% tds deducted under 194C', '194C', 18],
  ];
  for (const [sentence, section, gstRate] of purchases) {
    const plan = viaChatPlanner(state, sentence);
    assert.equal(plan.name, 'create_purchase', `${sentence}: ${JSON.stringify(plan)}`);
    assert.equal(plan.args.tdsSection, section, sentence);
    assert.equal(plan.args.lines[0].rate, 10000, sentence);
    assert.equal(plan.args.lines[0].gstRate, gstRate, sentence);
  }
  const expenses = [
    ['paid 5000 for audit, receipt attached, tds deducted under 194J', '194J'],
    ['paid 5000 for audit fees, got receipt, tds cut under 194J', '194J'],
    ['spent 5000 on audit fees, tds deducted under 194J, receipt in drawer', '194J'],
  ];
  for (const [sentence, section] of expenses) {
    const plan = viaChatPlanner(state, sentence);
    assert.equal(plan.name, 'post_expense', `${sentence}: ${JSON.stringify(plan)}`);
    assert.equal(plan.args.amount, 5000, sentence);
    assert.equal(plan.args.tdsSection, section, sentence);
  }
  const noSection = viaChatPlanner(state, 'got a bill from IMS Logistics 7000 GST 18%, they cut tds');
  assert.equal(noSection.kind, 'reply', JSON.stringify(noSection));
  assert.match(noSection.reply, /Say which TDS section applies/);
  assert.match(noSection.reply, /recorded nothing/);

  const note = viaChatPlanner(state, 'credit note INV-0001 5000 damaged goods, customer deducted tds');
  assert.equal(note.kind, 'reply', JSON.stringify(note));
  assert.match(note.reply, /credit note for INV-0001/);
  const debit = viaChatPlanner(state, 'debit note to Fabric Co 5000 GST 18% invoice INV-2045 tds deducted');
  assert.equal(debit.kind, 'reply', JSON.stringify(debit));
  assert.match(debit.reply, /debit note/);

  for (const sentence of [
    'paid Fabric Co for invoice INV-0001, tds deducted 100 under 194C',
    'paid Fabric Co for invoice 55, tds deducted 100 under 194C',
    'paid Fabric Co 9900 on invoice 55, tds cut',
    'paid Acme Steel 20000 for invoice 12 and deducted tds 400',
    'paid Fabric Co 10000 against their invoice INV-2045, deducted tds 100',
    'paid Fabric Co 9000, deducted tds 1000',
    'got rent receipt for 50000, tds deducted 5000 under 194I',
    'rent paid 50000, got receipt, deducted tds 5000 under 194I',
    'purchase from Fabric Co 10000 GST 5% receipt no 55 tds deducted 194C',
    'received invoice from Fabric Co 10000 GST 18% tds cut under 194C',
    'got invoice from Acme Steel 20000 GST 18% tds deducted 194C',
    'received audit fee bill 60000 GST 18% from Audit Associates tds 194J deducted',
    'paid Kiran Stores 5000, tds deducted',
    'received tds certificate from Kiran Stores',
    'got tds certificate for INV-0001',
    'received 5000 tds refund from income tax',
    'received tds return acknowledgement',
    'we deducted TDS 1000 from Fabric Co payment',
    'we deducted tds 1000 from INV-0001',
    'tds withheld by us 5000 on BILL-0001 under 194C',
    'run payroll, deducted tds 2000 on salary',
  ]) {
    for (const plan of [direct(state, sentence), viaChatPlanner(state, sentence)]) {
      assert.notEqual(plan.name, 'record_tds_withheld', `${sentence}: ${JSON.stringify(plan)}`);
      assert.doesNotMatch(String(plan.reply || ''), TWO_STEP_OR_ASK, `${sentence}: ${plan.reply}`);
    }
  }

  const held = await chat(state, 'received a bill from Fabric Co for 10000 GST 18%, tds cut under 194C');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.equal(held.preview.tool, 'create_purchase', held.reply);
  assert.equal(state.pendingChatAction?.args?.tdsSection, '194C');
  await chat(state, 'no');
  const spent = await chat(state, 'paid 5000 for audit, receipt attached, tds deducted under 194C');
  assert.equal(spent.awaitingConfirmation, true, spent.reply);
  assert.equal(spent.preview.tool, 'post_expense', spent.reply);
  assert.equal(state.pendingChatAction?.args?.tdsSection, '194C');
  await chat(state, 'no');
});

test('gap 3 (routing-1): a decimal amount between the words or after them is still the amount', () => {
  const state = books();
  const cases = [
    ['customer deducted ₹2,000.00 tds on INV-0001 under 194J', 2000, '194J'],
    ['customer deducted Rs. 2,000.00 tds on INV-0001 under 194J', 2000, '194J'],
    ['customer deducted 1500.50 tds on INV-0001 under 194J', 1500.5, '194J'],
    ['customer deducted 2000.00 tds on INV-0001 under 194J', 2000, '194J'],
    ['Kiran Stores withheld 1234.5 tds from INV-0001 under 194C', 1234.5, '194C'],
    ['they cut 99.99 tds on INV-0001 under 194C', 99.99, '194C'],
    ['tds of 2000.00 withheld on INV-0001 under 194J', 2000, '194J'],
    ['tds of ₹2,000.00 withheld by Kiran Stores on INV-0001 under 194J', 2000, '194J'],
    ['customer deducted 1.5k tds on INV-0001 under 194C', 1500, '194C'],
    ['customer deducted 1.5 lakhs tds on INV-0001 under 194J', 150000, '194J'],
    ['customer deducted 0.5 lakh tds on INV-0001 under 194J', 50000, '194J'],
    ['1500.50 tds deducted by customer on INV-0001 under 194J', 1500.5, '194J'],
    ['tds withheld 1500.50 on INV-0001 under 194J', 1500.5, '194J'],
    ['INV-0001: 1,250.75 tds cut by the customer', 1250.75, undefined],
  ];
  for (const [sentence, amount, section] of cases) {
    for (const plan of [direct(state, sentence), viaChatPlanner(state, sentence)]) {
      assert.equal(plan.name, 'record_tds_withheld', `${sentence}: ${JSON.stringify(plan)}`);
      assert.deepEqual(plan.args, { invoiceId: 'INV-0001', amount, ...(section ? { section } : {}) }, sentence);
    }
  }
  for (const sentence of ['customer deducted 1000 tds on INV-0001 which has gst 18%', 'customer deducted tds 1000 on invoice INV-0001 with 18% gst', 'tds withheld 1000 on INV-0001, the invoice carries IGST 18%']) {
    for (const plan of [direct(state, sentence), viaChatPlanner(state, sentence)]) {
      assert.equal(plan.name, 'record_tds_withheld', `${sentence}: ${JSON.stringify(plan)}`);
      assert.deepEqual(plan.args, { invoiceId: 'INV-0001', amount: 1000 }, sentence);
    }
  }
  for (const sentence of [
    'undo the tds of 1500.50 withheld on INV-0001',
    'the tds of 1500.50 on INV-0001 was wrong',
    'reverse the tds of ₹2,000.00 deducted on INV-0001',
    'delete the tds 2000.00 withheld on INV-0001',
  ]) {
    const plan = direct(state, sentence);
    assert.equal(plan.kind, 'reply', `${sentence}: ${JSON.stringify(plan)}`);
    assert.match(plan.reply, /cannot be reversed from chat/, sentence);
  }
  for (const sentence of ['received 97999.50 on INV-0001 after tds of 2000.50', 'received 97,999.50 against INV-0001, 2,000.50 tds cut']) {
    assertSteps(direct(state, sentence), sentence, { tds: 2000.5, cash: 97999.5, invoice: 'INV-0001' });
  }
});

test('gap 4 (routing-11): a receipt with two amounts and a TDS word never plans a silent full-invoice receipt', async () => {
  const state = books();
  const cases = [
    ['received 98000 for INV-0001 and 2000 towards tds', 2000, 98000],
    ['received 98000 for INV-0001, balance 2000 is tds', 2000, 98000],
    ['received 98000 on INV-0001 plus 2000 for tds', 2000, 98000],
    ['received 98000 on INV-0001, the remaining 2000 is tds', 2000, 98000],
    ['received 98000 on INV-0001 2000 short due to tds', 2000, 98000],
    ['received 98000 on INV-0001, 2000 deducted as tds', 2000, 98000],
    ['received 98000 for INV-0001, short by 2000 tds', 2000, 98000],
    ['received 98000 for INV-0001 and 2000 as tds', 2000, 98000],
    ['received 98000 on INV-0001 + 2000 tds', 2000, 98000],
    ['received 98000 on INV-0001 with 2000 tds', 2000, 98000],
    ['received 98000 on INV-0001, tds taken 2000', 2000, 98000],
    ['received 98000 on INV-0001 including tds 2000', 2000, 98000],
    ['received 98000 on INV-0001 excluding tds of 2000', 2000, 98000],
    ['received 98000 on INV-0001 tds 2000', 2000, 98000],
    ['received 98000 for INV-0001 (net of TDS 2000)', 2000, 98000],
    ['after tds of 2000 received 98000 against INV-0001', 2000, 98000],
  ];
  for (const [sentence, tds, cash] of cases) {
    for (const plan of [direct(state, sentence), viaChatPlanner(state, sentence)]) assertSteps(plan, sentence, { tds, cash, invoice: 'INV-0001' });
    const out = await chat(state, sentence);
    assert.equal(out.awaitingConfirmation, undefined, `${sentence}: ${out.reply}`);
    assert.deepEqual(out.tools, [], sentence);
  }
  const asked = [
    'received 98000 on INV-0001 and the rest is tds',
    'received 98000 on INV-0001 and the balance as tds',
    'received 98000 on INV-0001, tds taken by them',
    'received 98000 for INV-0001, short paid due to tds',
    'received 98000 for INV-0001, rest tds',
    'received 98000 for INV-0001, balance is tds',
    'received 100000 for INV-0001 gross of tds',
    'received 98000 on INV-0001 and they deducted tds',
    'received 98000 on INV-0001 less tds',
  ];
  for (const sentence of asked) {
    const plan = direct(state, sentence);
    assert.equal(plan.kind, 'reply', `${sentence}: ${JSON.stringify(plan)}`);
    const steps = stepsOf(plan.reply);
    assert.ok(steps, `${sentence}: ${plan.reply}`);
    assert.match(plan.reply, /\(use [^)]*the TDS amount/, sentence);
    assert.equal(steps.invoice, 'INV-0001', sentence);
  }
  const gross = direct(state, 'received 100000 for INV-0001 gross, tds 2000 deducted, net 98000');
  assert.equal(gross.kind, 'reply', JSON.stringify(gross));
  assert.equal(stepsOf(gross.reply)?.tds, '2000', gross.reply);
  assert.doesNotMatch(gross.reply, /Say how much TDS was withheld/);
  for (const sentence of [
    'received 100000 against INV-0001 with tds already recorded',
    'received 98000 on INV-0001 (tds 2000 recorded earlier)',
    'received 98000 against INV-0001, tds of 2000 is already in the books',
    'received 98000 on INV-0001, tds recorded separately',
    'received 98000 against INV-0001, tds certificate awaited',
    'received 98000 on INV-0001, tds 2000, already recorded',
    'received 98000 on INV-0001, tds 2000 has been recorded',
    'received 98000 on INV-0001, tds 2000 was already recorded',
    'received 98000 on INV-0001, I already recorded the tds of 2000',
  ]) {
    const plan = direct(state, sentence);
    assert.equal(plan.name, 'record_receipt', `${sentence}: ${JSON.stringify(plan)}`);
    assert.equal(plan.args.invoiceId, 'INV-0001', sentence);
  }
  for (const sentence of [
    'received 98000 against INV-0001 after tds 2000, gst already paid',
    'received 98000 on INV-0001 after tds 2000, customer already paid the rest',
    'received 98000 on INV-0001 after tds 2000 and gst already paid',
    'received 98000 on INV-0001, tds 2000 already deducted by customer',
    'received 98000 on INV-0001, tds 2000 already deducted',
    'received 98000 on INV-0001 with 2000 tds, invoice already booked',
    'received 98000 on INV-0001, 2000 tds cut, already told the customer',
    'received 98000 against INV-0001, tds of 2000 is already in',
    'received 98000 against INV-0001, tds 2000 pending certificate',
    'received 98000 on INV-0001, tds 2000 deducted, certificate awaited',
    'received 98000 on INV-0001, tds 2000 deducted, cert pending',
    'INV-0001 paid 98000, tds 2000, cert pending',
  ]) {
    for (const plan of [direct(state, sentence), viaChatPlanner(state, sentence)]) assertSteps(plan, sentence, { tds: 2000, cash: 98000, invoice: 'INV-0001' });
  }
  for (const [sentence, tds, cash] of [
    ['received 118000 on INV-0001 incl 18% gst, tds 2000', 2000, 118000],
    ['received 98000 on INV-0001 (gst 18% included), tds 2000 cut', 2000, 98000],
    ['INV-0001: received 116000 including gst @18%, tds 2000 deducted', 2000, 116000],
    ['received 98000 against INV-0001 after tds 2000 (invoice has GST 18%)', 2000, 98000],
    ['received 98000 on INV-0001, tds 2000 on the base amount excluding gst 18%', 2000, 98000],
    ['Kiran Stores paid 98000 on INV-0001 net of tds 2000, gst 18% included', 2000, 98000],
  ]) {
    for (const plan of [direct(state, sentence), viaChatPlanner(state, sentence)]) assertSteps(plan, sentence, { tds, cash, invoice: 'INV-0001' });
    const out = await chat(state, sentence);
    assert.equal(out.awaitingConfirmation, undefined, `${sentence}: ${out.reply}`);
    assert.deepEqual(out.tools, [], sentence);
  }
  assert.deepEqual(receiptsOf(state, 'INV-0001'), []);
});

test('gap 5 (routing-1, routing-11): payment-style wording from a customer reaches the same two steps, and a TDS amount with a customer but no invoice asks for the invoice', async () => {
  const state = books();
  const cases = [
    ['Kiran Stores sent 98000, tds 2000 cut', 2000, 98000],
    ['neft 98000 from Kiran Stores for INV-0001, tds 2000', 2000, 98000, 'INV-0001'],
    ['cheque 98000 from Kiran Stores for INV-0001 after tds 2000', 2000, 98000, 'INV-0001'],
    ['98000 credited in bank from Kiran Stores after 2000 tds', 2000, 98000],
    ['Kiran Stores credited 98000 to my account after deducting 2000 tds', 2000, 98000],
    ['settled INV-0001: 98000 cash and 2000 TDS', 2000, 98000, 'INV-0001'],
    ['INV-0001 settled 98000 + 2000 tds', 2000, 98000, 'INV-0001'],
    ['INV-0001 cleared with 2000 tds and 98000 cash', 2000, 98000, 'INV-0001'],
    ['payment from Kiran Stores 98000 less tds 2000', 2000, 98000],
    ['payment of 98000 from Kiran Stores after tds of 2000', 2000, 98000],
    ['Kiran Stores payment 98000 after 2000 tds', 2000, 98000],
    ['upi 98000 from Kiran Stores, tds 2000 cut', 2000, 98000],
    ['rtgs 98000 from Kiran Stores for INV-0001 net of tds 2000', 2000, 98000, 'INV-0001'],
    ['paid 98000 against INV-0001, tds 2000 cut', 2000, 98000, 'INV-0001'],
    ['paid 98000 on INV-0001 after tds 2000', 2000, 98000, 'INV-0001'],
    ['paid 98000 for INV-0001 less 2000 tds', 2000, 98000, 'INV-0001'],
    ['paid by Kiran Stores 98000, tds 2000', 2000, 98000],
    ['paid by customer 98000, 2000 tds cut', 2000, 98000],
    ['paid 5000 for audit by Kiran Stores, tds 100 deducted under 194C', 100, 5000],
  ];
  for (const [sentence, tds, cash, invoice] of cases) {
    for (const plan of [direct(state, sentence), viaChatPlanner(state, sentence)]) assertSteps(plan, sentence, { tds, cash, invoice });
    const out = await chat(state, sentence);
    assert.equal(out.awaitingConfirmation, undefined, `${sentence}: ${out.reply}`);
    assert.doesNotMatch(out.reply, /payments file|unpaid invoices/, sentence);
  }
  for (const sentence of ['Kiran Stores withheld tds 1000', 'tds deducted by Kiran Stores 2000', 'Delta Projects cut 500 tds', 'Kiran Stores deducted 1.5k tds']) {
    for (const plan of [direct(state, sentence), viaChatPlanner(state, sentence)]) {
      assert.equal(plan.kind, 'reply', `${sentence}: ${JSON.stringify(plan)}`);
      assert.match(plan.reply, /Say the invoice number, like INV-0001/, sentence);
      assert.match(plan.reply, /recorded nothing/, sentence);
    }
  }
  assert.notEqual(direct(state, 'customer deducted tds').kind, 'reply');
  assert.equal(direct(state, 'tds summary').name, 'tds_summary');
  assert.notEqual(direct(state, 'Fabric Co withheld tds 1000').name, 'record_tds_withheld');
  assert.doesNotMatch(String(direct(state, 'Fabric Co withheld tds 1000').reply || ''), /Say the invoice number/);
});

test('gap 6 (routing-1): a section written with a space before its letters or glued to the word section is read in full, and never cut to a shorter section', () => {
  const state = books();
  const cases = [
    ['customer deducted 1000 tds on INV-0001 under 194 IB', '194IB'],
    ['customer deducted 1000 tds on INV-0001 under 194 ib', '194IB'],
    ['customer deducted 1000 tds on INV-0001 section 194 IA', '194IA'],
    ['customer deducted 1000 tds on INV-0001 section194C', '194C'],
    ['customer deducted 1000 tds on INV-0001 under194J', '194J'],
    ['customer deducted 1000 tds on INV-0001 sec.194C', '194C'],
    ['customer deducted 1000 tds on INV-0001 under 194IB', '194IB'],
    ['customer deducted 1000 tds on INV-0001 under 194-IB', '194IB'],
    ['customer deducted 1000 tds on INV-0001 under 194 C', '194C'],
    ['customer deducted 1000 tds on INV-0001 u/s 194C', '194C'],
    ['customer deducted 1000 tds on INV-0001 under 206AA', '206AA'],
    ['customer deducted 1000 tds on INV-0001 under 192', '192'],
  ];
  for (const [sentence, section] of cases) {
    const plan = direct(state, sentence);
    assert.equal(plan.name, 'record_tds_withheld', `${sentence}: ${JSON.stringify(plan)}`);
    assert.deepEqual(plan.args, { invoiceId: 'INV-0001', amount: 1000, section }, sentence);
  }
  for (const sentence of ['customer deducted 1000 tds on INV-0001 under 194 in October', 'customer deducted 1000 tds on INV-0001 under 194 x']) {
    const plan = direct(state, sentence);
    assert.equal(plan.name, 'record_tds_withheld', `${sentence}: ${JSON.stringify(plan)}`);
    assert.notEqual(plan.args.section, '194IN', sentence);
  }
});

test('gap 7 (routing-2): an invoice cancel with a TDS reason stays a cancel, a supplier payment cancel is not a TDS reversal, and a held TDS preview is discarded by an undo', async () => {
  const state = booksWithSuppliers();
  for (const sentence of ['cancel invoice INV-0003 because tds was wrong', 'cancel INV-0003 because the tds was wrong', 'cancel INV-0003 since tds is incorrect', 'cancel INV-0003: wrong tds', 'cancel INV-0003 - customer cut tds by mistake']) {
    for (const plan of [direct(state, sentence), viaChatPlanner(state, sentence)]) {
      assert.equal(plan.name, 'cancel_invoice', `${sentence}: ${JSON.stringify(plan)}`);
      assert.equal(plan.args.invoiceId, 'INV-0003', sentence);
    }
  }
  assert.equal(direct(state, 'cancel invoice INV-0003 because tds was wrong').args.reason, 'tds was wrong');
  for (const sentence of ['cancel INV-0001 tds withheld 500 dated 2026-10-15', "cancel INV-0001's tds", 'cancel INV-0003 tds was wrong']) {
    const plan = viaChatPlanner(state, sentence);
    assert.equal(plan.kind, 'reply', `${sentence}: ${JSON.stringify(plan)}`);
    assert.match(plan.reply, /cannot be reversed from chat/, sentence);
  }
  for (const [sentence, supplier] of [['cancel the payment to Fabric Co, tds deducted', 'Fabric Co'], ['cancel payment to Acme Steel with tds cut', 'Acme Steel'], ['remove the bill from Fabric Co, tds deducted']]) {
    const plan = viaChatPlanner(state, sentence);
    assert.doesNotMatch(String(plan.reply || ''), /cannot be reversed from chat/, `${sentence}: ${JSON.stringify(plan)}`);
    if (supplier) assert.match(String(plan.reply || ''), new RegExp(`You owe ${supplier}`), sentence);
  }

  const followers = ['cancel the tds entry', 'cancel the tds', 'undo that tds', 'no, that tds is wrong', 'never mind, remove the tds', 'that tds is wrong', 'delete the tds', 'wrong tds', 'undo the tds withheld'];
  for (const follow of followers) {
    const held = books();
    const preview = await chat(held, 'record tds withheld 1000 on INV-0001 under 194J');
    assert.equal(preview.awaitingConfirmation, true, preview.reply);
    const out = await chat(held, follow);
    assert.match(out.reply, /^Not posted: TDS of ₹1,000\.00 withheld by Kiran Stores on INV-0001/, `${follow}: ${out.reply}`);
    assert.equal(held.pendingChatAction ?? null, null, follow);
    assert.equal((await chat(held, 'yes')).reply, 'There is nothing waiting to be posted.', follow);
    assert.deepEqual(receiptsOf(held, 'INV-0001'), [], follow);
    const alone = await chat(books(), follow);
    assert.match(alone.reply, /cannot be reversed from chat/, `${follow}: ${alone.reply}`);
  }
  const other = books();
  const held = await chat(other, 'invoice Kiran Stores 8000 GST 18%');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  const undo = await chat(other, 'undo that tds');
  assert.match(undo.reply, /cannot be reversed from chat/);
  assert.equal(other.pendingChatAction?.name, 'create_invoice', 'a preview for another tool is not discarded by a TDS undo');
});

test('gap 8 (calendar): the attached 26AS flow holds on any day of the year, not only on the day the test was written', async () => {
  const RealDate = globalThis.Date;
  const startedAt = RealDate.now();
  try {
    for (const fixed of ['2026-04-01', '2026-11-06', '2027-03-31', '2027-04-01', '2028-01-15']) {
      const base = new RealDate(`${fixed}T12:00:00`).getTime();
      globalThis.Date = class extends RealDate {
        constructor(...args) {
          if (args.length === 0) super(base + (RealDate.now() - startedAt));
          else super(...args);
        }

        static now() {
          return base + (RealDate.now() - startedAt);
        }
      };
      assert.equal(localToday(), fixed);
      const state = books();
      state.pendingFile = { kind: '26as', name: 'Form26AS.csv', content: csv26as() };
      const waiting = await chat(state, 'check the 26AS file I attached');
      assert.match(waiting.reply, /^No TDS credit is on record for FY \d{4}-\d{2} yet\./, `${fixed}: ${waiting.reply}`);
      assert.match(waiting.reply, /Form26AS\.csv/, fixed);
      assert.match(waiting.reply, /say "import 26AS"/, fixed);
      const held = await chat(state, 'import 26AS');
      assert.equal(held.awaitingConfirmation, true, `${fixed}: ${held.reply}`);
      assert.equal((await chat(state, 'yes')).posted, true, fixed);
      const after = await chat(state, 'check 26AS against the books');
      assert.match(after.reply, /^26AS vs books for FY \d{4}-\d{2}: ₹2,000\.00 in 26AS/, `${fixed}: ${after.reply}`);
      const year = currentFinancialYearStart();
      assert.match(after.reply, new RegExp(`FY ${year}-${String((year + 1) % 100).padStart(2, '0')}`), fixed);
    }
  } finally {
    globalThis.Date = RealDate;
  }
});

test('gap 9 (routing-12, routing-11): on US books a customer TDS sentence is answered as India-only and never planned as a two-step', async () => {
  const state = usBooks();
  const india = /TDS withheld by customers is for India books/;
  for (const sentence of [
    'received 8000 on INV-0001 after tds of 200',
    'received 8000, tds 200 on INV-0001',
    'Kiran Stores paid 7800 on INV-0001, they cut 200 tds',
    'got 7800 after 200 tds',
    'received 7800 on INV-0001 and the rest is tds',
    'customer deducted tds on invoice 5',
    'customer deducted 200 tds on INV-0001',
    'Kiran Stores withheld tds 200',
  ]) {
    for (const plan of [direct(state, sentence), viaChatPlanner(state, sentence)]) {
      assert.equal(plan.kind === 'reply' || plan.name === 'record_tds_withheld', true, `${sentence}: ${JSON.stringify(plan)}`);
      if (plan.kind === 'reply') {
        assert.match(plan.reply, india, sentence);
        assert.doesNotMatch(plan.reply, /first say "received|Say the invoice number|Say how much TDS/, sentence);
      }
    }
    const out = await chat(state, sentence);
    assert.equal(out.awaitingConfirmation, undefined, `${sentence}: ${out.reply}`);
    assert.match(out.reply, india, `${sentence}: ${out.reply}`);
    assert.equal(out.tools.length, 0, sentence);
  }
  assert.equal(direct(state, 'received 8000 against INV-0001').name, 'record_receipt');
  assert.equal(direct(state, 'received 8000 on INV-0001, no tds').name, 'record_receipt');
  assert.deepEqual(receiptsOf(state, 'INV-0001'), []);
});
