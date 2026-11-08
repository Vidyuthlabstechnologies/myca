import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { createInvoice, createPurchase } from '../src/invoice.mjs';
import { chat } from '../src/router.mjs';
import { planLocalToolCall } from '../src/assistant-contract.mjs';
import { documentProblemReply } from '../src/intent.mjs';
import { openSession } from '../src/session.mjs';
import { createMemoryStores } from '../src/store-ports.mjs';
import { localToday } from '../src/dates.mjs';

const TODAY = localToday();
const RAW_CODE = /\b[A-Z]{3,}(?:_[A-Z0-9]+)+\b/;
const JS_MESSAGE = /undefined|TypeError|ReferenceError|Cannot read|is not a function|\[object/;
const US_COMPANY = { name: 'Maple Street Bakery', country: 'US', gstin: '', state: '', pan: '', fy: '', address: '12 Maple St, Austin, TX 78701' };

function shiftDay(iso, days) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function mulberry32(seed) {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  for (const [partyName, rate, date, gstRate] of [['Kiran Stores', 100000, '2026-10-01', 0], ['TDS Experts', 8000, '2026-10-07', 18], ['Delta Projects', 80000, '2026-10-06', 0], ['Kiran Stores', 30000, '2026-10-20', 0]]) {
    const out = createInvoice(state, { date, partyName, lines: [{ description: 'Services', qty: 1, rate, gstRate }] });
    assert.equal(out.ok, true, JSON.stringify(out));
  }
  for (const [partyName, partyGstin, supplierInvoiceNo, date, rate, gstRate] of [['Fabric Co', '27AABCT1332L1ZE', 'F-101', '2026-09-05', 10000, 5], ['Acme Steel', '27AAACA1234C1Z5', 'AS-1', '2026-10-05', 40000, 18]]) {
    const out = createPurchase(state, { date, partyName, partyGstin, supplierInvoiceNo, lines: [{ description: 'Goods', hsn: '5208', qty: 1, rate, gstRate }] });
    assert.equal(out.ok, true, JSON.stringify(out));
  }
  return state;
}

function usBooks() {
  const state = createState();
  state.company = { ...US_COMPANY };
  return state;
}

async function usSession() {
  const session = openSession(createMemoryStores(), { seed: false });
  await session.signIn('USR-ADMIN', '1234');
  session.state.company = { ...US_COMPANY };
  return session;
}

const plan = (state, sentence) => planLocalToolCall(state, sentence);
const receiptsOf = (state, id) => state.invoices.find((invoice) => invoice.id === id).receipts || [];

function stepsOf(reply) {
  const first = /first say "received (\S+) against (\S+)"/.exec(String(reply || ''));
  const then = /then say "record tds withheld (\S+) on (\S+) under (\S+)"/.exec(String(reply || ''));
  return first && then ? { cash: first[1], cashInvoice: first[2], tds: then[1], invoice: then[2], section: then[3] } : null;
}

function assertSteps(reply, sentence, { cash, tds, invoice }) {
  const steps = stepsOf(reply);
  assert.ok(steps, `${sentence}: ${reply}`);
  assert.equal(steps.cash, String(cash), `${sentence}: the cash amount in the example is ${steps.cash}`);
  assert.equal(steps.tds, String(tds), `${sentence}: the TDS amount in the example is ${steps.tds}`);
  assert.equal(steps.invoice, invoice, sentence);
  assert.equal(steps.cashInvoice, invoice, sentence);
  assert.match(reply, /recorded nothing/, sentence);
}

test('R1: a US invoice or bill with a date the parser rejects is answered in words, names the date and records nothing', async () => {
  const rejected = [
    ['invoice Maple Cafe 5000 for services, tax TX dated 03/15/2026', '03/15/2026', '03/15/2026'],
    ['invoice Maple Cafe 5000 for services, tax TX on 03/15/2026', '03/15/2026', '03/15/2026'],
    ['bill from Acme Supply 3000 dated 03/15/2026', '03/15/2026', '03/15/2026'],
    ['bill from Acme Supply 3000 plus tax 240 on 31/02/2026', '31/02/2026', '31/02/2026'],
    ['invoice Maple Cafe 5000 for services, tax TX dated 2026-02-30', '2026-02-30', '30 February 2026'],
    ['bill from Acme Supply 3000 dated 2026-13-01', '2026-13-01', '2026-13-01'],
  ];
  const session = await usSession();
  for (const [sentence, said, spokenDate] of rejected) {
    const planned = plan(session.state, sentence);
    assert.equal(planned.kind, 'reply', `${sentence}: ${JSON.stringify(planned)}`);
    assert.deepEqual(planned.tools, [], sentence);
    assert.ok(planned.reply.startsWith(`${said} is not a date I can read`), `${sentence}: ${planned.reply}`);
    assert.match(planned.reply, /I have recorded nothing\.$/, sentence);
    assert.doesNotMatch(planned.reply, JS_MESSAGE, sentence);
    assert.doesNotMatch(planned.reply, RAW_CODE, sentence);
    const out = await session.chat(sentence);
    assert.ok(out.reply.startsWith(`${spokenDate} is not a date I can read`), `${sentence}: ${out.reply}`);
    assert.match(out.reply, /I have recorded nothing\.$/, sentence);
    assert.doesNotMatch(out.reply, JS_MESSAGE, sentence);
    assert.notEqual(out.awaitingConfirmation, true, sentence);
    assert.deepEqual(out.tools ?? [], [], sentence);
  }
  assert.equal(session.state.invoices.length, 0);
  assert.equal(session.state.purchases.length, 0);
  assert.equal(session.state.pendingChatAction ?? null, null);
});

test('R1: the date hint a US book gets names formats the sentence reader accepts, and both work', async () => {
  const state = usBooks();
  const asked = plan(state, 'invoice Maple Cafe 5000 for services, tax TX dated 03/15/2026');
  assert.match(asked.reply, /YYYY-MM-DD/);
  assert.match(asked.reply, /15\/03\/2026/);
  assert.doesNotMatch(asked.reply, /August|rupee|₹/);
  const session = await usSession();
  const spoken = await session.chat('invoice Maple Cafe 5000 for services, tax TX dated 03/15/2026');
  assert.match(spoken.reply, /YYYY-MM-DD/, spoken.reply);
  assert.match(spoken.reply, /15\/03\/2026/, spoken.reply);
  for (const dated of ['2026-03-15', '15/03/2026']) {
    const ok = plan(state, `invoice Maple Cafe 5000 for services, tax TX dated ${dated}`);
    assert.equal(ok.kind, 'tool', `${dated}: ${JSON.stringify(ok)}`);
    assert.equal(ok.name, 'create_invoice', dated);
    assert.equal(ok.args.taxJurisdiction, 'TX', dated);
  }
});

test('R1: the amount-too-large line names no rupees on a US book, and an India book keeps its own line', () => {
  const state = usBooks();
  for (const sentence of ['invoice Maple Cafe 99999999999 for services, tax TX', 'bill from Acme Supply 99999999999 plus tax 5']) {
    const huge = plan(state, sentence);
    assert.equal(huge.kind, 'reply', `${sentence}: ${JSON.stringify(huge)}`);
    assert.deepEqual(huge.tools, [], sentence);
    assert.match(huge.reply, /larger than I will take from a chat message/, sentence);
    assert.match(huge.reply, /I have recorded nothing\.$/, sentence);
    assert.doesNotMatch(huge.reply, /₹|rupee|crore|lakh|INR/i, `${sentence}: ${huge.reply}`);
  }
  const negative = plan(state, 'invoice Maple Cafe 5000 for services, tax TX -3');
  assert.equal(negative.kind, 'reply', JSON.stringify(negative));
  assert.match(negative.reply, /negative number cannot be part of an invoice or bill/);
  assert.match(negative.reply, /recorded nothing/);

  const india = plan(books(), 'invoice Kiran Stores 99999999999 GST 18%');
  assert.match(india.reply, /larger than I will take from a chat message \(the limit is ₹100 crore\)/);
  assert.match(documentProblemReply({ problem: 'AMOUNT_TOO_LARGE' }).reply, /₹100 crore/);
  assert.doesNotMatch(documentProblemReply({ problem: 'AMOUNT_TOO_LARGE' }, 'US').reply, /₹|rupee|crore/i);
  assert.match(documentProblemReply({ problem: 'INVALID_DATE', said: '31/13/2026' }).reply, /^31\/13\/2026 is not a date I can read; say it as 2026-08-15 or 15\/08\/2026\. I have recorded nothing\.$/);
});

test('R1: no planned sentence throws on a US book or an India book', () => {
  const india = books();
  const us = usBooks();
  const leads = ['invoice', 'bill from', 'sold', 'bought', 'purchase from', 'invoice to', 'raise bill', 'received', 'paid', 'quote'];
  const parties = ['Maple Cafe', 'Acme Supply', 'Kiran Stores', 'TDS Experts', ''];
  const amounts = ['5000', '$500', '99999999999', '-3', '0', '2k', '1,00,000', '3 pcs at 500'];
  const taxes = ['', ', tax TX', 'tax TX-AUSTIN', 'plus tax 240', 'no tax', 'tax-exempt (resale certificate)', 'GST 18%', 'for services'];
  const dates = ['', 'dated 03/15/2026', 'on 2026-02-30', 'dated 31/02/2026', 'dated 15/08/2026', 'dated 2026-13-01', 'dated 2026-10-01', 'dated March 15 2026', 'yesterday'];
  const words = ['invoice', 'bill', 'tds', '26AS', 'remind', 'me', 'check', 'received', 'paid', 'receipt', 'payment', 'sent', 'form', '16A', 'tds-free', 'exempt', 'INV-0001', 'BILL-0001', 'Kiran', 'Stores', 'TDS', 'Experts', 'Maple', 'Cafe', '2000', '9000', '1000', '0', '-5', '₹2,000', '$500', '12.5%', '2026-10', '2026-02-30', '03/15/2026', 'tax', 'TX', 'dated', 'on', 'and', 'then', 'or', 'no', 'not', '?', ',', '.', ';', ':', '(', ')', '-', '/', 'GST', '18%'];
  const next = mulberry32(4242);
  const pickFrom = (list) => list[Math.floor(next() * list.length)];
  const seen = new Set();
  const thrown = [];
  const probe = (sentence) => {
    if (seen.has(sentence)) return false;
    seen.add(sentence);
    for (const [label, state] of [['IN', india], ['US', us]]) {
      try {
        const out = planLocalToolCall(state, sentence);
        assert.ok(out && typeof out === 'object', sentence);
      } catch (error) {
        thrown.push(`${label} ${JSON.stringify(sentence)} ${error.message}`);
      }
    }
    return true;
  };
  let templates = 0;
  for (let i = 0; i < 40000 && templates < 3000; i += 1) {
    const parts = [pickFrom(leads), pickFrom(parties), pickFrom(amounts), pickFrom(taxes), pickFrom(dates)];
    if (next() < 0.3) parts.reverse();
    if (probe(parts.filter(Boolean).join(next() < 0.1 ? ', ' : ' '))) templates += 1;
  }
  let salads = 0;
  for (let i = 0; i < 40000 && salads < 3000; i += 1) {
    const length = 1 + Math.floor(next() * 12);
    if (probe(Array.from({ length }, () => pickFrom(words)).join(next() < 0.15 ? '' : ' '))) salads += 1;
  }
  assert.ok(templates >= 3000 && salads >= 3000 && seen.size >= 6000, `distinct sentences planned: ${templates} template, ${salads} word-salad, ${seen.size} in all`);
  assert.deepEqual(thrown.slice(0, 5), []);
});

test('R2: a reminder that mentions 26AS, the 26AS check, TDS withheld or a TDS credit check stays a reminder', async () => {
  const tomorrow = shiftDay(TODAY, 1);
  const later = shiftDay(TODAY, 12);
  const cases = [
    ['remind me to check 26AS tomorrow', tomorrow, /26AS/, undefined],
    [`remind me to check 26AS on ${later}`, later, /26AS/, undefined],
    ['remind me to run the 26AS check tomorrow', tomorrow, /26AS check/, undefined],
    [`set a reminder to check 26AS on ${later}`, later, /26AS/, undefined],
    [`remind me about the tds credit check on ${later}`, later, /tds credit check/i, undefined],
    [`remind me to record tds withheld 2000 on INV-0001 under 194J on ${later}`, later, /tds withheld 2000 on INV-0001/i, 'INV-0001'],
    ['remind me tomorrow to record tds withheld 2000 on INV-0001', tomorrow, /tds withheld 2000 on INV-0001/i, 'INV-0001'],
  ];
  const state = books();
  for (const [sentence, due, text, invoiceId] of cases) {
    const planned = plan(state, sentence);
    assert.equal(planned.kind, 'tool', `${sentence}: ${JSON.stringify(planned)}`);
    assert.equal(planned.name, 'add_reminder', `${sentence}: ${JSON.stringify(planned)}`);
    assert.equal(planned.args.due, due, sentence);
    assert.match(planned.args.text, text, sentence);
    assert.equal(planned.args.invoiceId, invoiceId, sentence);
  }
  for (const [sentence, due] of [['remind me to check 26AS tomorrow', tomorrow], [`remind me to record tds withheld 2000 on INV-0001 under 194J on ${later}`, later], [`remind me about the tds credit check on ${later}`, later]]) {
    const fresh = books();
    const held = await chat(fresh, sentence);
    assert.equal(held.awaitingConfirmation, true, `${sentence}: ${held.reply}`);
    assert.equal(fresh.pendingChatAction.name, 'add_reminder', sentence);
    assert.match(held.reply, /^Remind you /, `${sentence}: ${held.reply}`);
    assert.doesNotMatch(held.reply, /No TDS credit is on record|TDS of ₹/, sentence);
    const done = await chat(fresh, 'yes');
    assert.equal(done.posted, true, `${sentence}: ${done.reply}`);
    assert.equal((fresh.reminders || []).length, 1, sentence);
    assert.equal(fresh.reminders[0].due, due, sentence);
    assert.deepEqual(receiptsOf(fresh, 'INV-0001'), [], `${sentence}: a reminder records no TDS`);
  }
});

test('R2: a posting followed by a 26AS check, or by a reminder about TDS, keeps its posting route', async () => {
  const state = books();
  const cases = [
    ['invoice Kiran Stores 5000 GST 18% and check 26AS', 'create_invoice', { partyName: 'Kiran Stores' }, 'rate', 5000],
    ['invoice Kiran Stores 5000 GST 18% and check 26AS for FY 2025-26', 'create_invoice', { partyName: 'Kiran Stores' }, 'rate', 5000],
    ['invoice Kiran Stores 5000 GST 18%, remind me to check 26AS', 'create_invoice', { partyName: 'Kiran Stores' }, 'rate', 5000],
    ['paid 12000 rent and then check 26AS against the books', 'post_expense', { amount: 12000 }],
    ['received 5000 against INV-0001 and check 26AS', 'record_receipt', { invoiceId: 'INV-0001', amount: 5000 }],
    ['received 5000 against INV-0001, then reconcile TDS against 26AS', 'record_receipt', { invoiceId: 'INV-0001', amount: 5000 }],
    ['received 5000 against INV-0001 and check my tds credits', 'record_receipt', { invoiceId: 'INV-0001', amount: 5000 }],
    ['received 5000 from Kiran Stores against INV-0001, remind me about tds tomorrow', 'record_receipt', { invoiceId: 'INV-0001', amount: 5000 }],
    ['bill from Fabric Co 10000 GST 5% and compare with 26AS', 'create_purchase', { partyName: 'Fabric Co' }, 'rate', 10000],
    ['paid 5000 to Acme Steel and check tds credit mismatch', 'record_payment', { billId: 'BILL-0002', amount: 5000 }],
    ['received 5000 against INV-0001 so check 26AS', 'record_receipt', { invoiceId: 'INV-0001', amount: 5000 }],
    ['received 5000 against INV-0001 as well as check 26AS', 'record_receipt', { invoiceId: 'INV-0001', amount: 5000 }],
    ['received 5000 against INV-0001 and can you check 26AS', 'record_receipt', { invoiceId: 'INV-0001', amount: 5000 }],
    ['received 5000 against INV-0001 + check 26AS', 'record_receipt', { invoiceId: 'INV-0001', amount: 5000 }],
    ['received 5000 against INV-0001 - check 26AS', 'record_receipt', { invoiceId: 'INV-0001', amount: 5000 }],
    ['received 5000 against INV-0001, I will check 26AS later', 'record_receipt', { invoiceId: 'INV-0001', amount: 5000 }],
    ['invoice Kiran Stores 5000 GST 18% so I can check 26AS', 'create_invoice', { partyName: 'Kiran Stores' }, 'rate', 5000],
  ];
  for (const [sentence, name, args, lineKey, lineValue] of cases) {
    const planned = plan(state, sentence);
    assert.equal(planned.kind, 'tool', `${sentence}: ${JSON.stringify(planned)}`);
    assert.equal(planned.name, name, `${sentence}: ${JSON.stringify(planned)}`);
    for (const [key, value] of Object.entries(args)) assert.equal(planned.args[key], value, `${sentence}: ${key}`);
    if (lineKey) assert.equal(planned.args.lines[0][lineKey], lineValue, sentence);
  }
  for (const [sentence, name] of [['invoice Kiran Stores 5000 GST 18% and check 26AS', 'create_invoice'], ['received 5000 against INV-0001 and check 26AS', 'record_receipt'], ['received 5000 from Kiran Stores against INV-0001, remind me about tds tomorrow', 'record_receipt']]) {
    const fresh = books();
    const held = await chat(fresh, sentence);
    assert.equal(held.awaitingConfirmation, true, `${sentence}: ${held.reply}`);
    assert.equal(fresh.pendingChatAction.name, name, sentence);
    assert.doesNotMatch(held.reply, /No TDS credit is on record|two entries/, sentence);
    await chat(fresh, 'no');
    assert.equal(fresh.pendingChatAction ?? null, null, sentence);
  }
});

const CHECK_NOT_RUN = /I have not run the 26AS check; ask for it on its own\.$/;

test('R2: a receipt that carries TDS and then asks for a 26AS check gets the answer it gets alone, says the check was not run, and records nothing', async () => {
  const cases = [
    ['received 8500 against INV-0001, tds 1500 and check 26AS', 'received 8500 against INV-0001, tds 1500', 8500, 1500],
    ['received 88500 less 1500 tds against INV-0001 and check 26AS', 'received 88500 less 1500 tds against INV-0001', 88500, 1500],
    ['received 88500 against INV-0001 with tds withheld 1500 and check 26AS', 'received 88500 against INV-0001 with tds withheld 1500', 88500, 1500],
    ['received 88500 after 1500 tds against INV-0001, then check 26AS', 'received 88500 after 1500 tds against INV-0001', 88500, 1500],
    ['received 88500 against INV-0001, tds 1500, and compare with 26AS', 'received 88500 against INV-0001, tds 1500', 88500, 1500],
    ['record receipt 8500 tds 1500 INV-0001 and verify 26AS', 'record receipt 8500 tds 1500 INV-0001', 8500, 1500],
    ['Kiran Stores paid 8500, tds 1500 withheld, and then reconcile with 26AS', 'Kiran Stores paid 8500, tds 1500 withheld', 8500, 1500],
    ['collected 88500 net of 1500 tds from Kiran Stores so check 26AS', 'collected 88500 net of 1500 tds from Kiran Stores', 88500, 1500],
  ];
  const state = books();
  for (const [sentence, alone, cash, tds] of cases) {
    const planned = plan(state, sentence);
    assert.equal(planned.kind, 'reply', `${sentence}: ${JSON.stringify(planned)}`);
    assert.deepEqual(planned.tools, [], sentence);
    assertSteps(planned.reply, sentence, { cash, tds, invoice: 'INV-0001' });
    assert.match(planned.reply, CHECK_NOT_RUN, sentence);
    assert.doesNotMatch(planned.reply, /No TDS credit is on record/, sentence);
    const answer = plan(state, alone);
    assert.equal(answer.kind, 'reply', `${alone}: ${JSON.stringify(answer)}`);
    assert.equal(planned.reply, `${answer.reply} I have not run the 26AS check; ask for it on its own.`, `${sentence}: the answer is the one ${alone} gets`);
  }
  for (const [sentence, , cash, tds] of cases.slice(0, 4)) {
    const fresh = books();
    const said = await chat(fresh, sentence);
    assert.equal(said.awaitingConfirmation, undefined, `${sentence}: ${said.reply}`);
    assertSteps(said.reply, sentence, { cash, tds, invoice: 'INV-0001' });
    assert.match(said.reply, CHECK_NOT_RUN, sentence);
    assert.equal(fresh.pendingChatAction ?? null, null, sentence);
    assert.deepEqual(receiptsOf(fresh, 'INV-0001'), [], `${sentence}: nothing is recorded`);
  }
});

test('R2: a payment, a TDS statement or a certificate that carries TDS and then asks for a check keeps the route it has alone', async () => {
  const state = books();
  const paid = plan(state, 'paid Acme Steel 4000 with tds withheld 400 and check 26AS');
  assert.notEqual(paid.name, 'tds_credit_check', JSON.stringify(paid));
  assert.deepEqual(paid, plan(state, 'paid Acme Steel 4000 with tds withheld 400'), 'the check clause changes nothing');
  assert.equal(paid.kind, 'reply');
  assert.match(paid.reply, /more than one amount/);

  const statement = plan(state, 'customer deducted 1500 tds on invoice INV-0001 under 194J and check 26AS');
  assert.equal(statement.kind, 'tool', JSON.stringify(statement));
  assert.equal(statement.name, 'record_tds_withheld', JSON.stringify(statement));
  assert.deepEqual(statement.args, { invoiceId: 'INV-0001', amount: 1500, section: '194J' });
  assert.deepEqual(statement, plan(state, 'customer deducted 1500 tds on invoice INV-0001 under 194J'), 'the check clause changes nothing');
  const fresh = books();
  const held = await chat(fresh, 'customer deducted 1500 tds on invoice INV-0001 under 194J and check 26AS');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.equal(fresh.pendingChatAction.name, 'record_tds_withheld');
  await chat(fresh, 'no');
  assert.equal(fresh.pendingChatAction ?? null, null);

  for (const sentence of ['received 9440 from TDS Experts and check 26AS', 'received 9440 against INV-0002 from TDS Experts and then check 26AS']) {
    const planned = plan(state, sentence);
    assert.equal(planned.kind, 'tool', `${sentence}: ${JSON.stringify(planned)}`);
    assert.equal(planned.name, 'record_receipt', `${sentence}: ${JSON.stringify(planned)}`);
    assert.equal(planned.args.invoiceId, 'INV-0002', sentence);
    assert.equal(planned.args.amount, 9440, sentence);
  }
});

test('R2: a posting that carries TDS keeps its own answer when the TDS is a TDS undo, a party name or a book that is not India', async () => {
  const state = books();
  const undone = plan(state, 'undo the 1500 tds on invoice INV-0001 and check 26AS');
  assert.equal(undone.kind, 'reply', JSON.stringify(undone));
  assert.equal(undone.reply, 'A TDS entry cannot be reversed from chat yet, so nothing was changed; your CA can correct it. I have not run the 26AS check; ask for it on its own.');
  assert.deepEqual(undone.tools, []);
  for (const sentence of ['remove TDS Experts invoice INV-0006 for 9440 and check 26AS', 'delete the TDS Experts invoice INV-0006 of 9440 and check 26AS', 'undo TDS Experts invoice 9440 INV-0006 and check 26AS']) {
    const planned = plan(state, sentence);
    assert.doesNotMatch(String(planned.reply || ''), /TDS entry cannot be reversed/, `${sentence}: a party named TDS is not a TDS entry`);
    assert.notEqual(planned.name, 'tds_credit_check', sentence);
  }
  const us = usBooks();
  const abroad = plan(us, 'received 8500 against INV-0001, tds 1500 and check 26AS');
  assert.equal(abroad.kind, 'reply', JSON.stringify(abroad));
  assert.equal(abroad.reply, 'TDS withheld by customers is for India books, so I have recorded nothing.');
  assert.equal(abroad.blocked, true);
  const session = await usSession();
  const said = await session.chat('received 8500 against INV-0001, tds 1500 and check 26AS');
  assert.equal(said.reply, 'TDS withheld by customers is for India books, so I have recorded nothing.');
});

test('R2: a statement about TDS credit in 26AS, a TDS figure in the check clause, a question, or a check with no posting before it is still the 26AS check', () => {
  const state = books();
  for (const sentence of [
    'have I received 5000 against INV-0001, and can you check 26AS?',
    'did I receive 88500 less 1500 tds against INV-0001 and check 26AS?',
    'received 5000 against INV-0001 and check 26AS for the tds withheld by customers',
    'I got 50000 tds credit, compare with 26AS',
    'received 50000 tds credit and check 26AS',
    'received 5000 against INV-0001 and check the 2000 tds in 26AS',
    'received 5000 against INV-0001 and check 26AS, tds withheld 2000 is missing',
    'received 5000 against INV-0001 and check 26AS for tds of 2000',
    'received 5000 as per 26AS, then check the books',
    'check 26AS and then record receipt 8500 tds 1500 INV-0001',
  ]) {
    assert.equal(plan(state, sentence).name, 'tds_credit_check', `${sentence}: ${JSON.stringify(plan(state, sentence))}`);
  }
});

test('R2: a TDS figure that no TDS planner claims keeps the check, and a posting that says no TDS keeps its posting route', () => {
  const state = books();
  for (const sentence of ['tds on invoice INV-0001 is 2000, check 26AS', 'invoice INV-0001 tds 2000 check 26AS', 'received the tds certificate for 88500 and check 26AS']) {
    const planned = plan(state, sentence);
    assert.equal(planned.name, 'tds_credit_check', `${sentence}: ${JSON.stringify(planned)}`);
    assert.deepEqual(planned.args, {}, sentence);
  }
  for (const sentence of [
    'received 5000 against INV-0001, tds 0 and check 26AS',
    'received 5000 against INV-0001, no tds and check 26AS',
    'received 5000 against INV-0001, tds exempt and check 26AS',
    'received 5000 against INV-0001, tds: nil and check 26AS',
    'received 5000 against INV-0001, 0 tds then check 26AS',
    'received 5000 against INV-0001 with no tds, check 26AS',
  ]) {
    const planned = plan(state, sentence);
    assert.equal(planned.name, 'record_receipt', `${sentence}: ${JSON.stringify(planned)}`);
    assert.equal(planned.args.invoiceId, 'INV-0001', sentence);
    assert.equal(planned.args.amount, 5000, sentence);
  }
  const named = plan(state, 'invoice TDS Experts 8000 GST 18% and check 26AS');
  assert.equal(named.name, 'create_invoice', JSON.stringify(named));
  assert.equal(named.args.partyName, 'TDS Experts');
  assert.deepEqual(named, plan(state, 'invoice TDS Experts 8000 GST 18%'), 'the check clause changes nothing');
  for (const [sentence, alone] of [['bill from Acme Steel 4000 tds 400, check 26AS', 'bill from Acme Steel 4000 tds 400'], ['paid Acme Steel 4000 tds 400, check 26AS', 'paid Acme Steel 4000 tds 400']]) {
    const planned = plan(state, sentence);
    assert.notEqual(planned.name, 'tds_credit_check', `${sentence}: ${JSON.stringify(planned)}`);
    assert.deepEqual(planned, plan(state, alone), `${sentence}: the check clause changes nothing`);
  }
});

test('R2: a check request with no posting before it stays the 26AS check, and a cheque called a check is not a 26AS check', () => {
  const state = books();
  for (const sentence of [
    'the books show 50000, please check 26AS',
    'sales were 50000 this month, check 26AS',
    'my balance is 50000 and check 26AS',
    '50000 and check 26AS',
    'received the money and check 26AS',
    'my invoice was paid, check 26AS',
  ]) {
    const planned = plan(state, sentence);
    assert.equal(planned.name, 'tds_credit_check', `${sentence}: ${JSON.stringify(planned)}`);
    assert.deepEqual(planned.args, {}, sentence);
  }
  const cheque = plan(state, 'received 8500 against INV-0001, tds 1500 by check');
  assert.equal(cheque.kind, 'reply', JSON.stringify(cheque));
  assertSteps(cheque.reply, 'received 8500 against INV-0001, tds 1500 by check', { cash: 8500, tds: 1500, invoice: 'INV-0001' });
  assert.doesNotMatch(cheque.reply, /26AS/, 'no 26AS check was asked, so none is said to be left out');
});

test('R2: a check request that carries an amount, a question or a 26AS figure is still the 26AS check', () => {
  const state = books();
  for (const sentence of [
    'check 26AS against the books',
    'reconcile TDS against 26AS',
    'does the 2000 tds on INV-0001 show in 26AS?',
    'my tds of 50000 is missing from 26AS',
    'I received 50000 tds credit in 26AS, compare with books',
    'we received 50000 tds credit in 26AS and check the books',
    'tds of 5000 in books but 26AS shows 4000',
    'books show 40000 tds, 26AS shows 50000',
    'show 26AS vs books, tds 5000 in books',
    'did Kiran Stores pay 5000, and check 26AS?',
  ]) {
    const planned = plan(state, sentence);
    assert.equal(planned.name, 'tds_credit_check', `${sentence}: ${JSON.stringify(planned)}`);
  }
  assert.equal(plan(state, 'check 26AS for FY 2025-26').args.fy, '2025-26');
});

test('R4: a receipt or payment said as a noun gives the cash amount and the TDS amount the right way round', async () => {
  const state = books();
  const nouns = [
    'record receipt 9000 tds 1000 INV-0001',
    'receipt 9000 tds 1000 INV-0001',
    'payment 9000 tds 1000 INV-0001',
    'add receipt 9000 tds 1000 INV-0001',
    'enter receipt 9000 tds 1000 for INV-0001',
    'Kiran Stores receipt 9000 tds 1000',
    'INV-0001 receipt 9000 tds 1000',
    'record receipt of 9000 tds 1000 against INV-0001',
    'record receipt of ₹9,000 tds ₹1,000 against INV-0001',
    'received in bank 9000 tds 1000 INV-0001',
    'got payment 9000 tds 1000 INV-0001',
    'payment against INV-0001 9000 tds 1000',
    'receipt for INV-0001: 9000 tds 1000',
    'record payment from Kiran Stores 9000 tds 1000',
    'Kiran Stores payment 9000 tds 1000',
    'receipt amount 9000 tds amount 1000 INV-0001',
    'record receipt 9000 INV-0001 tds 1000',
    'receipt of 9,000 tds 1,000 for INV-0001',
    'record receipt 9000 tds of 1000 INV-0001',
    'record receipt 9000 tds: 1000 INV-0001',
    'receipt Rs. 9000 tds Rs. 1000 INV-0001',
    'neft receipt 9000 tds 1000 INV-0001',
    'record receipt 9000 tds 1000 on 2026-10-20 INV-0001',
  ];
  for (const sentence of nouns) {
    const planned = plan(state, sentence);
    assert.equal(planned.kind, 'reply', `${sentence}: ${JSON.stringify(planned)}`);
    assertSteps(planned.reply, sentence, { cash: 9000, tds: 1000, invoice: 'INV-0001' });
    const said = await chat(state, sentence);
    assert.equal(said.awaitingConfirmation, undefined, `${sentence}: ${said.reply}`);
    assertSteps(said.reply, sentence, { cash: 9000, tds: 1000, invoice: 'INV-0001' });
  }
  assertSteps(plan(state, 'record receipt 98,000 tds 2,000 INV-0001').reply, 'record receipt 98,000 tds 2,000 INV-0001', { cash: 98000, tds: 2000, invoice: 'INV-0001' });
  assertSteps(plan(state, 'payment 98000 tds 2000 under 194C INV-0001').reply, 'payment 98000 tds 2000 under 194C INV-0001', { cash: 98000, tds: 2000, invoice: 'INV-0001' });
  assert.match(plan(state, 'receipt 98000 tds 2000 under 194C for INV-0001').reply, /then say "record tds withheld 2000 on INV-0001 under 194C"/);
  assert.deepEqual(receiptsOf(state, 'INV-0001'), []);
});

test('R4: the verb forms, the comma forms and the forms that put the TDS first keep the right figures', () => {
  const state = books();
  for (const sentence of [
    'received 9000 tds 1000 INV-0001',
    'payment received 9000 tds 1000',
    'record receipt 9000 INV-0001, tds 1000',
    'receipt 9000 less tds 1000 INV-0001',
    'tds 1000 receipt 9000 INV-0001',
    'received 9000 after 1000 tds INV-0001',
    'got 9000 after 1000 tds',
    'received 9000 against INV-0001, 1000 tds cut',
    'INV-0001 paid 9000 tds 1000',
    'Kiran Stores paid 9000, tds 1000 withheld, INV-0001',
    'receipt after lunch 9000 tds 1000 INV-0001',
    'record receipt, less discount, 9000 tds 1000 INV-0001',
  ]) {
    assertSteps(plan(state, sentence).reply, sentence, { cash: 9000, tds: 1000, invoice: 'INV-0001' });
  }
});

test('R4: a deduction word before the first amount keeps the TDS first and the cash second', async () => {
  const state = books();
  const rows = [
    ['customer cut 2000 tds 98000 received INV-0001', 98000, 2000],
    ['customer cut 1500 tds 88500 received INV-0001', 88500, 1500],
    ['customer deducted 1500 tds 88500 payment INV-0001', 88500, 1500],
    ['customer withheld 1500 tds 88500 received INV-0001', 88500, 1500],
    ['Kiran Stores cut 1500 tds 88500 receipt INV-0001', 88500, 1500],
    ['cutting 1500 tds 88500 received INV-0001', 88500, 1500],
    ['Kiran Stores deducting 1500 tds 88500 paid INV-0001', 88500, 1500],
    ['customer cut ₹1,500 tds ₹88,500 received INV-0001', 88500, 1500],
    ['customer cut Rs. 1500 tds Rs. 88500 received INV-0001', 88500, 1500],
    ['customer cut 1500 tds: 88500 received INV-0001', 88500, 1500],
    ['customer cut 1500 tds of 88500 received INV-0001', 88500, 1500],
    ['customer deducted 1500 as tds 88500 received INV-0001', 88500, 1500],
    ['customer withheld 1500 tds 88500 received INV-0001 on 2026-10-20', 88500, 1500],
  ];
  for (const [sentence, cash, tds] of rows) {
    const planned = plan(state, sentence);
    assert.equal(planned.kind, 'reply', `${sentence}: ${JSON.stringify(planned)}`);
    assertSteps(planned.reply, sentence, { cash, tds, invoice: 'INV-0001' });
    assert.doesNotMatch(planned.reply, /the amount that reached your bank|the TDS amount/, `${sentence}: both figures were read`);
    const said = await chat(state, sentence);
    assert.equal(said.awaitingConfirmation, undefined, `${sentence}: ${said.reply}`);
    assertSteps(said.reply, sentence, { cash, tds, invoice: 'INV-0001' });
  }
  assert.deepEqual(receiptsOf(state, 'INV-0001'), []);
});

test('R4: a gross less the TDS, an amount net of it, or a period after the second amount is not read as the TDS', () => {
  const state = books();
  const netted = [
    ['received 100000 less 2000 tds = 98000 INV-0001', 2000],
    ['received 90000 less 1500 tds = 88500 INV-0001', 1500],
    ['received 90000 minus 1500 tds 88500 INV-0001', 1500],
    ['record receipt 100000 - 1500 tds 88500 INV-0001', 1500],
    ['received 90000 \u2212 1500 tds 88500 INV-0001', 1500],
    ['received 88500 after deducting 1500 tds 88500 INV-0001', 1500],
    ['received 90000 including 1500 tds 88500 INV-0001', 1500],
    ['payment 90000 excluding 1500 tds 88500 INV-0001', 1500],
    ['received 90000 of which 1500 tds 88500 INV-0001', 1500],
    ['received 90000 after 1500 tds 88500 INV-0001', 1500],
    ['received 90000 net of 1500 tds 88500 INV-0001', 1500],
  ];
  for (const [sentence, tds] of netted) {
    const planned = plan(state, sentence);
    assert.equal(planned.kind, 'reply', `${sentence}: ${JSON.stringify(planned)}`);
    const steps = stepsOf(planned.reply);
    assert.ok(steps, `${sentence}: ${planned.reply}`);
    assert.equal(steps.tds, String(tds), `${sentence}: ${planned.reply}`);
    assert.doesNotMatch(planned.reply, /\(use [^)]*the TDS amount/, `${sentence}: the TDS amount was read`);
    assert.equal(steps.invoice, 'INV-0001', sentence);
    assert.match(planned.reply, /recorded nothing/, sentence);
  }
  const periods = [
    'received 88500, 1500 tds 30 days INV-0001',
    'received 88500 against INV-0001, 1500 tds 45 days',
    'receipt 88500, 1500 tds 2 months INV-0001',
    'receipt 88500, 1500 tds 1 week INV-0001',
    'receipt 88500, 1500 tds 2 years INV-0001',
    'received 88500 after 1500 tds 30 days INV-0001',
    'received 88500 net of 1500 tds 30 days INV-0001',
    'received 88500 less 1500 tds 30-day terms INV-0001',
    'record receipt 88500, 1500 tds, payment in 30 days INV-0001',
  ];
  for (const sentence of periods) {
    const planned = plan(state, sentence);
    assert.equal(planned.kind, 'reply', `${sentence}: ${JSON.stringify(planned)}`);
    assertSteps(planned.reply, sentence, { cash: 88500, tds: 1500, invoice: 'INV-0001' });
    assert.doesNotMatch(planned.reply, /the amount that reached your bank|the TDS amount/, `${sentence}: both figures were read`);
  }
  const reported = plan(state, 'received 98000 after 2000 tds 30 days INV-0001');
  assertSteps(reported.reply, 'received 98000 after 2000 tds 30 days INV-0001', { cash: 98000, tds: 2000, invoice: 'INV-0001' });
  assert.doesNotMatch(reported.reply, /the amount that reached your bank|the TDS amount/, 'both figures were read, and 30 is neither');
});

test('R6: a receipt that says tds 0, 0 tds, tds exempt or tds-free is a plain receipt, like no tds, tds nil and tds free', async () => {
  const tails = ['no tds', 'tds nil', 'tds free', 'tds 0', 'tds: 0', 'tds = 0', 'tds 0.00', 'tds Rs 0', 'tds ₹0', '0 tds', '0.00 tds', '₹0 tds', 'tds 0%', '0% tds', 'tds exempt', 'tds exempted', 'tds is exempt', 'tds-free', 'tds-exempt', 'tds none', 'tds: none', 'tds: exempt', 'tds: exempted', 'tds: free', 'tds: nil', 'tds = nil', 'tds = free', 'tds = exempt', 'tds=none', 'tds - nil', 'tds: zero', 'tds is none', 'tds-none', 'TDS: NIL'];
  const state = books();
  for (const tail of tails) {
    const sentence = `received 5000 against INV-0001, ${tail}`;
    const planned = plan(state, sentence);
    assert.equal(planned.kind, 'tool', `${sentence}: ${JSON.stringify(planned)}`);
    assert.deepEqual([planned.name, planned.args], ['record_receipt', { invoiceId: 'INV-0001', mode: 'bank', date: TODAY, amount: 5000 }], sentence);
  }
  for (const sentence of [
    'received 5000 against INV-0001 tds 0',
    'received 5000 against INV-0001 tds exempt',
    'received 5000 against INV-0001 tds-free',
    'received 5000 from Kiran Stores against INV-0004, 0 tds',
    'INV-0001 paid 5000 tds 0',
    'Kiran Stores paid 5000 on INV-0001, 0 tds cut',
    'received 5000 against INV-0001, tds 0. thanks',
    'received 5000 against INV-0001, tds 0, no gst',
    'received 5000 against INV-0001 tds: exempt',
    'received 5000 from Kiran Stores against INV-0004, tds = nil',
    'INV-0001 paid 5000 tds: none',
    'Kiran Stores paid 5000 on INV-0001, tds none, thanks',
  ]) {
    const planned = plan(state, sentence);
    assert.equal(planned.name, 'record_receipt', `${sentence}: ${JSON.stringify(planned)}`);
    assert.equal(planned.args.amount, 5000, sentence);
  }
  for (const [zero, plain] of [['received 5000 from Kiran Stores tds 0', 'received 5000 from Kiran Stores, no tds'], ['received 5000 from Kiran Stores, 0 tds', 'received 5000 from Kiran Stores, no tds'], ['tds 0 received 5000 against INV-0001', 'received 5000 against INV-0001']]) {
    assert.notEqual(plan(state, zero).kind === 'reply' && /receipt that carries TDS/.test(plan(state, zero).reply), true, zero);
    if (!/^tds 0/.test(zero)) assert.deepEqual(plan(state, zero), plan(state, plain), `${zero} reads as ${plain}`);
  }
  const held = await chat(state, 'received 5000 against INV-0001, tds 0');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.match(held.reply, /Receipt of ₹5,000\.00 against INV-0001/, held.reply);
  assert.doesNotMatch(held.reply, /two entries/);
  await chat(state, 'no');
});

test('R6: a real TDS amount, a percentage and a number that only ends in zero are still a receipt that carries TDS', async () => {
  const state = books();
  for (const [tail, tds] of [['tds 1000', 1000], ['after 10 tds', 10], ['after 20 tds', 20], ['after 100 tds', 100], ['after 1,000 tds', 1000], ['after 2000 tds', 2000], ['tds 10', 10], ['less 500 tds', 500]]) {
    const sentence = `received 5000 against INV-0001 ${tail}`;
    const planned = plan(state, sentence);
    assert.equal(planned.kind, 'reply', `${sentence}: ${JSON.stringify(planned)}`);
    assertSteps(planned.reply, sentence, { cash: 5000, tds, invoice: 'INV-0001' });
  }
  for (const sentence of ['received 5000 against INV-0001, tds 0.5%', 'received 5000 against INV-0001, tds 2%']) {
    const planned = plan(state, sentence);
    assert.equal(planned.kind, 'reply', `${sentence}: ${JSON.stringify(planned)}`);
    assert.match(planned.reply, /a receipt that carries TDS is two entries/, sentence);
    assert.match(planned.reply, /use the TDS amount/, sentence);
  }
  const asked = await chat(state, 'customer deducted tds 0 on INV-0001');
  assert.equal(asked.awaitingConfirmation, undefined, asked.reply);
  assert.match(asked.reply, /recorded nothing/);
});

test('R7: a customer whose name contains TDS is a customer, and a sentence that sends a TDS paper is not a receipt', async () => {
  const state = books();
  const receipts = [
    ['received 9440 from TDS Experts', { invoiceId: 'INV-0002', amount: 9440 }],
    ['received 9440 against INV-0002 from TDS Experts', { invoiceId: 'INV-0002', amount: 9440 }],
    ['received 5000 from TDS Experts', { invoiceId: 'INV-0002', amount: 5000 }],
  ];
  for (const [sentence, args] of receipts) {
    const planned = plan(state, sentence);
    assert.equal(planned.kind, 'tool', `${sentence}: ${JSON.stringify(planned)}`);
    assert.equal(planned.name, 'record_receipt', `${sentence}: ${JSON.stringify(planned)}`);
    assert.equal(planned.args.invoiceId, args.invoiceId, sentence);
    assert.equal(planned.args.amount, args.amount, sentence);
  }
  for (const sentence of ['TDS Experts paid 9440', 'TDS Experts paid 9440 against INV-0002']) {
    const old = plan(state, sentence);
    assert.equal(old.kind, 'tool', `${sentence}: ${JSON.stringify(old)}`);
    assert.equal(old.name, 'tds_summary', sentence);
  }
  const papers = [
    ['Kiran Stores sent form 16A for 2000 tds', 'tds_certificates'],
    ['Kiran Stores sent the tds certificate, tds 2000', 'tds_certificates'],
    ['Kiran Stores sent 16A, 2000 tds', 'monitor_tds'],
  ];
  for (const [sentence, name] of papers) {
    const planned = plan(state, sentence);
    assert.equal(planned.kind, 'tool', `${sentence}: ${JSON.stringify(planned)}`);
    assert.equal(planned.name, name, `${sentence}: ${JSON.stringify(planned)}`);
  }
  const fresh = books();
  const held = await chat(fresh, 'received 9440 from TDS Experts');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.match(held.reply, /Receipt of ₹9,440\.00 against INV-0002 \(TDS Experts\)/, held.reply);
  await chat(fresh, 'no');
  for (const [sentence] of papers) {
    const said = await chat(books(), sentence);
    assert.doesNotMatch(said.reply, /receipt that carries TDS|recorded nothing, because/, `${sentence}: ${said.reply}`);
  }
});

test('R7: a TDS word beside a party named TDS, or beside money that was sent, is still a receipt that carries TDS', () => {
  const state = books();
  assertSteps(plan(state, 'received 9440 from TDS Experts after 1000 tds').reply, 'received 9440 from TDS Experts after 1000 tds', { cash: 9440, tds: 1000, invoice: 'INV-0002' });
  assertSteps(plan(state, 'TDS Experts paid 9440, tds 1000 cut').reply, 'TDS Experts paid 9440, tds 1000 cut', { cash: 9440, tds: 1000, invoice: 'INV-0002' });
  for (const sentence of ['Kiran Stores sent 98000, tds 2000 cut', 'Kiran Stores sent 98000 after 2000 tds', 'Kiran Stores sent us 98000, 2000 tds cut', 'Kiran Stores sent the payment 98000, tds 2000']) {
    assertSteps(plan(state, sentence).reply, sentence, { cash: 98000, tds: 2000, invoice: 'INV-0001' });
  }
  for (const sentence of ['received 98000 against INV-0001, tds withheld 2000', 'received the tds certificate from Kiran Stores']) {
    assert.ok(plan(state, sentence), sentence);
  }
  assert.equal(plan(state, 'received 98000 against INV-0001, tds withheld 2000').kind, 'reply');
  assert.doesNotMatch(String(plan(state, 'received the tds certificate from Kiran Stores').reply || ''), /then say "record tds withheld/);
});

test('R9: a reply that asks for a date shows an example in the same format as its instruction', async () => {
  const sentences = [
    'record tds withheld 500 on INV-0001 yesterday',
    'withheld 2000 tds on INV-0001 this month',
    'record tds withheld 500 on INV-0001 dated 2026-02-30',
    'record tds withheld 500 on INV-0001 on 1 October and 5 October',
  ];
  for (const sentence of sentences) {
    const state = books();
    const asked = plan(state, sentence);
    assert.equal(asked.kind, 'reply', `${sentence}: ${JSON.stringify(asked)}`);
    const said = await chat(state, sentence);
    assert.equal(said.awaitingConfirmation, undefined, `${sentence}: ${said.reply}`);
    for (const reply of [asked.reply, said.reply]) {
      const example = /for example "([^"]+)"/.exec(reply);
      assert.ok(example, `${sentence}: ${reply}`);
      const exampleIsIso = /\d{4}-\d{2}-\d{2}/.test(example[1]);
      assert.equal(/YYYY-MM-DD/.test(reply), exampleIsIso, `${sentence}: the instruction and the example disagree: ${reply}`);
      assert.match(reply, /I have recorded nothing\.$/, sentence);
    }
    assert.match(said.reply, /^Say the date, for example "record tds withheld 2000 on INV-0001 under 194J dated 15 October 2026"\. I have recorded nothing\.$/, said.reply);
    const quoted = /for example "([^"]+)"/.exec(said.reply)[1];
    const parsed = plan(books(), quoted);
    assert.equal(parsed.kind, 'tool', `${quoted}: ${JSON.stringify(parsed)}`);
    assert.deepEqual([parsed.name, parsed.args.invoiceId, parsed.args.amount, parsed.args.section, parsed.args.date], ['record_tds_withheld', 'INV-0001', 2000, '194J', '2026-10-15'], quoted);
  }
});
