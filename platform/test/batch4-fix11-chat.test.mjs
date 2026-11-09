import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createState } from '../src/store.mjs';
import { createInvoice, createPurchase } from '../src/invoice.mjs';
import { runTool } from '../src/tools.mjs';
import { chat, propose, fmtToolResult } from '../src/router.mjs';
import { planLocalToolCall } from '../src/assistant-contract.mjs';
import { normalizeChat, amountsSaid, soleAmountSaid, receiptAmount, documentProblemReply, receiptDate } from '../src/intent.mjs';
import { takeInvoiceTerms } from '../src/terms-intent.mjs';
import { previewOf } from '../src/chat-confirm.mjs';
import { localToday } from '../src/dates.mjs';

const HEADER = 'SECTION,SUPPLIER GSTIN,SUPPLIER NAME,INVOICE NO,INVOICE DATE,TAXABLE VALUE,CGST,SGST,IGST,CESS,TOTAL VALUE,ITC AVAILABILITY';
const TWO_B = [
  HEADER,
  'B2B,27AABCT1332L1ZE,FABRIC CO,F-101,05-09-2026,10000,250,250,0,0,10500,Y',
  'B2B,29AABCL1234J1ZL,PACK HOUSE,PH-9,10-09-2026,5000,0,0,600,0,5600,Y',
  'B2B,33AAACZ1234F1Z5,THREAD LTD,T-55,11-09-2026,8000,0,0,960,0,8960,Y',
  'B2B,27AAACD1111A1Z5,DYE WORKS,DW-3,15-09-2026,2000,180,180,0,0,2360,Y',
  'CDNR,27AABCT1332L1ZE,FABRIC CO,CN-7,20-09-2026,1000,25,25,0,0,1050,Y',
].join('\n');

const OTHER_COUNTRY = 'That is for a different country edition, so nothing was changed.';
const NEUTRAL_PREVIEW = 'I could not work out what this would do, so nothing was posted.';
const JURISDICTION_SENTENCE = 'Say which sales tax applies (the jurisdiction code, for example TX or TX-AUSTIN), or that the sale is exempt and why. I will not guess a rate.';
const JS_TEXT = /undefined|TypeError|ReferenceError|RangeError|Cannot read|is not a function|\[object/;
const RAW_CODE = /\b[A-Z]{3,}(?:_[A-Z0-9]+)+\b/g;
const SETTING_NAMES = new Set(['MYCA_MODEL_API_KEY', 'MYCA_PROVIDER_ENV', 'MYCA_ENABLE_LIVE_CALLS', 'MYCA_GSP_API_KEY', 'MYCA_GSP_API_SECRET', 'MYCA_GSP_TEST_API_KEY', 'MYCA_MOCK_MODE', 'NVIDIA_NIM_API_KEY']);

function sale(state, partyName, rate, date, gstRate = 0) {
  const out = createInvoice(state, { date, partyName, lines: [{ description: 'Services', qty: 1, rate, gstRate }] });
  assert.notEqual(out.ok, false, JSON.stringify(out));
  return out.invoice;
}

function bill(state, partyName, partyGstin, supplierInvoiceNo, date, rate, gstRate) {
  const out = createPurchase(state, { date, partyName, partyGstin, supplierInvoiceNo, lines: [{ description: 'Goods', hsn: '5208', qty: 1, rate, gstRate }] });
  assert.notEqual(out.ok, false, JSON.stringify(out));
  return out.invoice;
}

function indiaBooks() {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  sale(state, 'Kiran Stores', 100000, '2026-10-01');
  sale(state, 'Audit Trail Associates', 5000, '2026-10-02', 18);
  bill(state, 'Fabric Co', '27AABCT1332L1ZE', 'F-101', '2026-09-05', 10000, 5);
  bill(state, 'Pack House', '29AABCL1234J1ZL', 'PH-9', '2026-09-10', 6000, 12);
  bill(state, 'Dye Works', '27AAACD1111A1Z5', 'DW-3', '2026-09-14', 2000, 18);
  return state;
}

async function indiaBooksWith2b() {
  const state = indiaBooks();
  const added = await runTool(state, 'import_gstr2b', { period: '2026-09', csv: TWO_B, fileName: 'GSTR2B_092026.csv' });
  assert.equal(added.ok, true, JSON.stringify(added));
  return state;
}

function usBooks() {
  const state = createState();
  state.company = { name: 'Maple Street Bakery', country: 'US', gstin: '', state: '', pan: '', fy: '', address: '12 Maple St, Austin, TX 78701' };
  return state;
}

function planned(state, say) {
  return planLocalToolCall(state, say);
}

function cpuMs(run) {
  const before = process.cpuUsage();
  run();
  const used = process.cpuUsage(before);
  return (used.user + used.system) / 1000;
}

function fastestOfThree(run, limit) {
  let best = Infinity;
  for (let attempt = 0; attempt < 3 && best >= limit; attempt += 1) best = Math.min(best, cpuMs(run));
  return best;
}

function quotedStrings(source) {
  const found = [];
  const length = source.length;
  let at = 0;
  while (at < length) {
    const ch = source[at];
    if (ch === '/' && source[at + 1] === '/') {
      const end = source.indexOf('\n', at);
      at = end < 0 ? length : end;
    } else if (ch === '/' && source[at + 1] === '*') {
      const end = source.indexOf('*/', at + 2);
      at = end < 0 ? length : end + 2;
    } else if (ch === "'" || ch === '"') {
      let to = at + 1;
      let text = '';
      let clean = true;
      while (to < length && source[to] !== ch && source[to] !== '\n') {
        if (source[to] === '\\') {
          clean = false;
          to += 2;
        } else {
          text += source[to];
          to += 1;
        }
      }
      if (source[to] === ch && clean) found.push(text);
      at = to + 1;
    } else at += 1;
  }
  return found;
}

const CHAT_TEST_FILES = ['chat-routing.test.mjs', 'batch4-fix-chat-other.test.mjs', 'batch4-fix2-chat.test.mjs', 'batch4-fix-tds-chat.test.mjs'];
const SENTENCE_LIKE = /^[A-Za-z0-9₹][A-Za-z0-9₹ ,.'%/:#@&()+*?!-]*$/;

function harvestedSentences() {
  const seen = new Set();
  for (const file of CHAT_TEST_FILES) {
    for (const text of quotedStrings(readFileSync(new URL(`./${file}`, import.meta.url), 'utf8'))) {
      const sentence = text.trim();
      if (sentence.length < 8 || sentence.length > 200 || !sentence.includes(' ') || !SENTENCE_LIKE.test(sentence)) continue;
      seen.add(sentence);
    }
  }
  return [...seen];
}

function pickedSentences(count) {
  const all = harvestedSentences();
  const stride = Math.max(1, Math.floor(all.length / count));
  return all.filter((_, index) => index % stride === 0).slice(0, count);
}

const PREFIXES = ['₹', 'Rs.', 'rs.', 'RS.', 'Rs', 'rs', 'RS', 'INR', 'inr', 'Inr'];
const FIGURES = [['5000', 5000], ['5,000.50', 5000.5], ['5k', 5000], ['1.5 lakh', 150000]];

function lineTotal(plan) {
  return plan.args.lines[0].rate * plan.args.lines[0].qty;
}

const FLOWS = [
  ['a receipt', (a) => `received ${a} against INV-0001`, 'record_receipt', (plan) => plan.args.amount],
  ['a receipt named by customer', (a) => `received ${a} from Kiran Stores`, 'record_receipt', (plan) => plan.args.amount],
  ['a customer saying paid', (a) => `Kiran Stores paid ${a} on INV-0001`, 'record_receipt', (plan) => plan.args.amount],
  ['a receipt with a cheque number', (a) => `received ${a} against INV-0001 by cheque no 123456`, 'record_receipt', (plan) => plan.args.amount],
  ['a payment to a supplier', (a) => `paid Fabric Co ${a}`, 'record_payment', (plan) => plan.args.amount],
  ['a payment with the amount first', (a) => `paid ${a} to Fabric Co`, 'record_payment', (plan) => plan.args.amount],
  ['a payment against a bill', (a) => `paid ${a} against BILL-0001`, 'record_payment', (plan) => plan.args.amount],
  ['a bill', (a) => `bill from Fabric Co ${a} GST 5%`, 'create_purchase', lineTotal],
  ['an invoice', (a) => `invoice Kiran Stores ${a} for consulting GST 18%`, 'create_invoice', lineTotal],
  ['an expense', (a) => `paid ${a} rent`, 'post_expense', (plan) => plan.args.amount],
  ['an expense in cash', (a) => `spent ${a} on petrol by cash`, 'post_expense', (plan) => plan.args.amount],
  ['TDS withheld', (a) => `record tds withheld ${a} on INV-0001 under 194J`, 'record_tds_withheld', (plan) => plan.args.amount],
  ['a TDS deposit', (a) => `deposited TDS ${a}, challan 0510308 05112026 12345`, 'record_tds_deposit', (plan) => plan.args.amount],
  ['advance tax', (a) => `paid advance tax ${a} challan 0510001234567`, 'record_advance_tax', (plan) => plan.args.amount],
  ['a quote', (a) => `quote Maple Cafe ${a} for cakes GST 12%`, 'create_quote', lineTotal],
  ['a credit note', (a) => `credit note for INV-0001 ${a} damaged goods`, 'create_credit_note', (plan) => plan.args.amount, ['5k', '1.5 lakh']],
];

test('S1: a rupee prefix written without a space is part of the amount', () => {
  const reads = [
    ['Rs.5000', [5000]], ['rs.5000', [5000]], ['RS.5000', [5000]], ['Rs5000', [5000]], ['rs5000', [5000]], ['INR5000', [5000]], ['inr5000', [5000]], ['₹5000', [5000]],
    ['Rs.5,000.50', [5000.5]], ['Rs.5k', [5000]], ['Rs.1.5 lakh', [150000]], ['Rs.1.5lakh', [150000]], ['Rs.2cr', [20000000]], ['Rs5,00,000', [500000]],
    ['received Rs.5000 against INV-0001', [5000]], ['received (Rs.5000) against INV-0001', [5000]], ['received Rs.5000.', [5000]], ['received Rs.5000/- against INV-0001', [5000]],
    ['paid,Rs.5000', [5000]], ['Rs. 5000', [5000]], ['Rs 5000', [5000]], ['rs.  5000', [5000]],
  ];
  for (const [text, expected] of reads) assert.deepEqual(amountsSaid(text), expected, text);
  assert.equal(soleAmountSaid('received Rs.5000 against INV-0001'), 5000);
  assert.equal(soleAmountSaid('received rs.5000 against INV-0001 by cheque no 123456'), 5000);
  assert.equal(receiptAmount('received rs.5000 against INV-0001'), 5000);
  assert.equal(receiptAmount('received Rs5000 against INV-0001'), 5000);
});

test('S1: letters in front of digits that are not a rupee prefix are not a currency, and the digits after a point are not a second amount', () => {
  const reads = [
    ['tours5000', []], ['bars.5000', []], ['hrs.5000', []], ['Mars5000', []], ['fors5000', []], ['INV-0001', []], ['Rs.5000abc', []], ['Rs.', []],
    ['12500.25', [12500.25]], ['1.5000', [1.5]], ['Rs.12500.25', [12500.25]], ['Rs.1.5000', [1.5]], ['received 12500.25 against INV-0001', [12500.25]],
  ];
  for (const [text, expected] of reads) assert.deepEqual(amountsSaid(text), expected, text);
});

test('S1: the sentences of the report plan the amount that was said', () => {
  const state = indiaBooks();
  const cases = [
    ['received Rs.5000 against INV-0001', 'record_receipt', 5000],
    ['received rs.5000 against INV-0001 by cheque no 123456', 'record_receipt', 5000],
    ['received Rs5000 against INV-0001', 'record_receipt', 5000],
    ['paid Fabric Co Rs.4000', 'record_payment', 4000],
    ['paid Rs.4,000.50 to Fabric Co', 'record_payment', 4000.5],
    ['record tds withheld Rs.2000 on INV-0001 under 194J', 'record_tds_withheld', 2000],
  ];
  for (const [say, tool, amount] of cases) {
    const plan = planned(state, say);
    assert.equal(plan.kind, 'tool', say);
    assert.equal(plan.name, tool, say);
    assert.equal(plan.args.amount, amount, say);
  }
  const invoice = planned(state, 'invoice Kiran Stores Rs.50000 for consulting GST 18%');
  assert.equal(invoice.name, 'create_invoice');
  assert.equal(invoice.args.partyName, 'Kiran Stores');
  assert.equal(lineTotal(invoice), 50000);
});

test('S1: the preview of a receipt said with Rs.5000 shows 5,000 and not the whole invoice', async () => {
  const state = indiaBooks();
  const out = await chat(state, 'received Rs.5000 against INV-0001');
  assert.match(out.reply, /Receipt of ₹5,000\.00 against INV-0001/);
  assert.match(out.reply, /INV-0001 becomes partly paid/);
  assert.doesNotMatch(out.reply, /becomes paid\./);
  const cheque = await chat(indiaBooks(), 'received rs.5000 against INV-0001 by cheque no 123456');
  assert.match(cheque.reply, /Receipt of ₹5,000\.00 against INV-0001/);
  const supplier = await chat(indiaBooks(), 'paid Fabric Co Rs.4000');
  assert.match(supplier.reply, /Pay Fabric Co ₹4,000\.00 against BILL-0001/);
});

test('S1: every prefix spelling, with and without a space, plans what the same sentence with a rupee sign plans', () => {
  const state = indiaBooks();
  for (const [flow, say, tool, read, unread = []] of FLOWS) {
    for (const [figure, value] of FIGURES) {
      const reference = planned(state, say(`₹${figure}`));
      if (!unread.includes(figure)) {
        assert.equal(reference.kind, 'tool', `${flow} with ₹${figure}`);
        assert.equal(reference.name, tool, `${flow} with ₹${figure}`);
        assert.equal(read(reference), value, `${flow} with ₹${figure}`);
      }
      for (const prefix of PREFIXES) {
        for (const gap of ['', ' ']) {
          const sentence = say(`${prefix}${gap}${figure}`);
          assert.deepEqual(planned(state, sentence), reference, sentence);
        }
      }
    }
  }
});

test('S1: a glued prefix beside a cheque number, a date, a reference or a count reads the same as the rupee sign', () => {
  const state = indiaBooks();
  const tails = [
    '', ' cheque 123456', ' by cheque no 123456', ' vide cheque 004512', ' on 12 oct', ' on 12 October 2026', ' dated 2026-10-12', ' dated 12/10/2026', ' net 30', ' in 30 days',
    ' ref 998877', ' utr 4567891234', ' txn id 556677', ' neft 1234567890', ' for 3 instalments', ' instalment 2 of 3', ' part 2', ' bill no 55', ' invoice no 12', ' yesterday', ' by upi',
  ];
  for (const prefix of ['Rs.', 'rs.', 'Rs', 'INR']) {
    for (const tail of tails) {
      for (const make of [(a) => `received ${a} against INV-0001${tail}`, (a) => `paid Fabric Co ${a}${tail}`, (a) => `Kiran Stores paid ${a} on INV-0001${tail}`]) {
        const sentence = make(`${prefix}5000`);
        assert.deepEqual(planned(state, sentence), planned(state, make('₹5000')), sentence);
      }
    }
  }
  assert.equal(planned(state, 'received Rs.5000 against INV-0001 cheque 123456').args.amount, 5000);
  assert.equal(planned(state, 'paid Fabric Co INR4000 bill no 55').args.amount, 4000);
});

test('S1: two glued amounts, a zero and a negative amount are refused like the rupee sign refuses them', () => {
  const state = indiaBooks();
  for (const prefix of ['Rs.', 'rs.', 'Rs', 'INR']) {
    for (const make of [
      (a) => `received ${a}5000 and ${a}2000 against INV-0001`,
      (a) => `received ${a}0 against INV-0001`,
      (a) => `paid Fabric Co ${a}0`,
    ]) {
      const sentence = make(prefix);
      assert.deepEqual(planned(state, sentence), planned(state, make('₹')), sentence);
    }
  }
  for (const prefix of ['Rs.', 'rs.', 'RS.']) {
    for (const make of [
      (a) => `received ${a}-500 against INV-0001`,
      (a) => `paid Fabric Co ${a}-500`,
      (a) => `invoice Kiran Stores 5000 GST 18% and ${a}-500`,
    ]) {
      const sentence = make(prefix);
      assert.deepEqual(planned(state, sentence), planned(state, make('₹')), sentence);
    }
  }
  assert.equal(planned(state, 'received Rs.5000 and Rs.2000 against INV-0001').kind, 'reply');
  assert.match(planned(state, 'received Rs.0 against INV-0001').reply, /zero or less/);
});

test('S1: the controls that must not move still plan what they planned', () => {
  const state = indiaBooks();
  const today = planned(state, 'received 5000 against INV-0001').args.date;
  const controls = [
    ['received 12500.25 against INV-0001', 'record_receipt', { invoiceId: 'INV-0001', mode: 'bank', date: today, amount: 12500.25 }],
    ['paid 1.5000 against BILL-0001', 'record_payment', { billId: 'BILL-0001', mode: 'bank', date: today, amount: 1.5 }],
    ['received INV-0001', 'record_receipt', { invoiceId: 'INV-0001', mode: 'bank', date: today }],
    ['received tours5000 against INV-0001', 'record_receipt', { invoiceId: 'INV-0001', mode: 'bank', date: today }],
    ['received bars.5000 against INV-0001', 'record_receipt', { invoiceId: 'INV-0001', mode: 'bank', date: today }],
    ['received 5000 against INV-0001 by cheque no 123456', 'record_receipt', { invoiceId: 'INV-0001', mode: 'bank', date: today, amount: 5000 }],
    ['received 5000 against INV-0001 cheque 123456', 'record_receipt', { invoiceId: 'INV-0001', mode: 'bank', date: today, amount: 5000 }],
    ['received 5000 against INV-0001 dated 2026-10-12', 'record_receipt', { invoiceId: 'INV-0001', mode: 'bank', date: '2026-10-12', amount: 5000 }],
    ['received 5000 against INV-0001 net 30', 'record_receipt', { invoiceId: 'INV-0001', mode: 'bank', date: today, amount: 5000 }],
    ['received ₹5000 against INV-0001', 'record_receipt', { invoiceId: 'INV-0001', mode: 'bank', date: today, amount: 5000 }],
    ['received Rs. 5000 against INV-0001', 'record_receipt', { invoiceId: 'INV-0001', mode: 'bank', date: today, amount: 5000 }],
    ['Kiran Stores withheld tds Rs.2000 on INV-0001 under 194C', 'record_tds_withheld', { invoiceId: 'INV-0001', amount: 2000, section: '194C' }],
  ];
  for (const [say, tool, args] of controls) {
    const plan = planned(state, say);
    assert.equal(plan.kind, 'tool', say);
    assert.equal(plan.name, tool, say);
    assert.deepEqual(plan.args, args, say);
  }
  assert.match(planned(state, 'paid Fabric Co net 30').reply, /cannot tell whether that is a payment or an agreed payment term/);
});

test('S2: normalizeChat collapses a run of three or more whitespace characters and leaves one and two alone', () => {
  assert.equal(normalizeChat('hello   world'), 'hello world');
  assert.equal(normalizeChat('hello\t\t\tworld'), 'hello world');
  assert.equal(normalizeChat('hello \t \tworld'), 'hello world');
  assert.equal(normalizeChat('hello\n\n\nworld'), 'hello\nworld');
  assert.equal(normalizeChat('hello  \n  world'), 'hello\nworld');
  assert.equal(normalizeChat('hello\r\n\r\nworld'), 'hello\nworld');
  assert.equal(normalizeChat('hello   world'), 'hello world');
  assert.equal(normalizeChat(`${' '.repeat(1500)}hello${' '.repeat(1500)}world${' '.repeat(1500)}`), 'hello world');
  assert.equal(normalizeChat('hello  world'), 'hello  world');
  assert.equal(normalizeChat('hello\t\tworld'), 'hello\t\tworld');
  assert.equal(normalizeChat('hello \tworld'), 'hello \tworld');
  assert.equal(normalizeChat('hello\r\nworld'), 'hello\r\nworld');
  assert.equal(normalizeChat('hello\n world'), 'hello\n world');
  assert.equal(normalizeChat('  hello world  '), 'hello world');
  assert.equal(normalizeChat('paid 5000    -    books are closed'), 'paid 5000');
  assert.equal(normalizeChat('paid 5000 – books are closed'), 'paid 5000');
  assert.equal(normalizeChat(null), '');
  assert.equal(normalizeChat(undefined), '');
});

test('S2: a sentence with runs of one and two whitespace characters is read exactly as before', () => {
  const before = (text) => {
    const capped = String(text || '').slice(0, 4096).replace(/[–—]/g, '-');
    return (capped.includes(' - ') ? capped.replace(/\s+-\s+(books|itc|ap|gst input|follow).*$/i, '') : capped).trim();
  };
  const sentences = pickedSentences(220).filter((sentence) => !/\s{2}/.test(sentence));
  assert.ok(sentences.length >= 150, `${sentences.length} sentences`);
  for (const sentence of sentences) {
    for (const gap of ['  ', '\t', '\t\t', ' \t', '\r\n', ' \n', '\n\n', '\n']) {
      const spaced = sentence.replace(/ /g, gap);
      assert.equal(normalizeChat(spaced), before(spaced), JSON.stringify(spaced));
    }
  }
  const state = indiaBooks();
  const pinned = [
    ['received  5000  against  INV-0001', 'record_receipt', { invoiceId: 'INV-0001', amount: 5000 }],
    ['received\t5000\tagainst\tINV-0001', 'record_receipt', { invoiceId: 'INV-0001', amount: 5000 }],
    ['paid  Fabric Co  4000', 'record_payment', { billId: 'BILL-0001', amount: 4000 }],
    ['paid  5000  rent', 'post_expense', { narration: 'rent', amount: 5000 }],
    ['received  5000  from  Kiran Stores', 'record_receipt', { invoiceId: 'INV-0001', amount: 5000 }],
    ['record  tds  withheld  2000  on  INV-0001  under  194J', 'record_tds_withheld', { invoiceId: 'INV-0001', amount: 2000, section: '194J' }],
    ['credit  note  for  INV-0001  1000  damaged goods', 'create_credit_note', { invoiceId: 'INV-0001', amount: 1000, reason: 'damaged goods' }],
    ['Fabric Co pays in  30 days', 'set_payment_terms', { partyName: 'Fabric Co', days: 30 }],
    ['bill  from  Fabric Co  5000  GST 5%', 'company_profile', {}],
  ];
  for (const [say, tool, args] of pinned) {
    const plan = planned(state, say);
    assert.equal(plan.name, tool, say);
    for (const [key, value] of Object.entries(args)) assert.equal(plan.args[key], value, `${say} ${key}`);
  }
  const invoice = planned(state, 'invoice  Kiran Stores  5000 for consulting  GST 18%');
  assert.equal(invoice.name, 'create_invoice');
  assert.equal(invoice.args.partyName, 'Kiran Stores');
  assert.deepEqual(invoice.args.lines, [{ description: 'Supply', qty: 1, rate: 5000, gstRate: 18 }]);
});

const RUN_KINDS = { spaces: ' ', tabs: '\t', newlines: '\n', mixed: ' \t \n\t' };

function paddedMessage(sentence, kind, where) {
  const length = where === 'middle' ? 2001 - sentence.length : 2000 - sentence.length;
  const run = RUN_KINDS[kind].repeat(Math.ceil(length / RUN_KINDS[kind].length)).slice(0, length);
  if (where === 'start') return run + sentence;
  if (where === 'end') return sentence + run;
  const at = sentence.indexOf(' ');
  return sentence.slice(0, at) + run + sentence.slice(at + 1);
}

function collapsedMessage(sentence, kind, where) {
  if (where !== 'middle') return sentence;
  const joiner = RUN_KINDS[kind].includes('\n') ? '\n' : ' ';
  const at = sentence.indexOf(' ');
  return sentence.slice(0, at) + joiner + sentence.slice(at + 1);
}

test('S2: a message of 2,000 characters plans in a bounded time whatever whitespace it holds, and plans as the same message with each run collapsed', async () => {
  const state = await indiaBooksWith2b();
  const sentences = pickedSentences(220);
  assert.ok(sentences.length >= 200, `${sentences.length} sentences harvested`);
  let slowest = 0;
  for (const where of ['middle', 'start', 'end']) {
    for (const kind of Object.keys(RUN_KINDS)) {
      for (const sentence of sentences) {
        const message = paddedMessage(sentence, kind, where);
        assert.equal(message.length, 2000, `${kind} ${where} ${sentence}`);
        const ms = fastestOfThree(() => planLocalToolCall(state, message), 100);
        slowest = Math.max(slowest, ms);
        assert.ok(ms < 100, `${kind} run ${where} of ${JSON.stringify(sentence)} took ${ms.toFixed(0)} ms of CPU`);
        assert.deepEqual(planLocalToolCall(state, message), planLocalToolCall(state, collapsedMessage(sentence, kind, where)), `${kind} ${where} ${sentence}`);
      }
    }
  }
  assert.ok(slowest < 100);
});

test('S2: the invoice terms reader does not stall on a long run of whitespace', () => {
  for (const unit of [' ', '\t', '\n', ' \t']) {
    const run = unit.repeat(Math.ceil(1600 / unit.length)).slice(0, 1600);
    const quiet = `invoice${run}Kiran Stores 5000`;
    assert.ok(fastestOfThree(() => takeInvoiceTerms(quiet), 100) < 100, `${JSON.stringify(unit)} in the middle`);
    assert.deepEqual(takeInvoiceTerms(quiet), { text: quiet, days: null });
    const termed = `invoice Kiran Stores 5000${run}net 30`;
    assert.ok(fastestOfThree(() => takeInvoiceTerms(termed), 100) < 100, `${JSON.stringify(unit)} before the terms`);
    assert.deepEqual(takeInvoiceTerms(termed), { text: 'invoice Kiran Stores 5000', days: 30 });
  }
});

test('S2: 2,000 characters of one repeated token plan in a bounded time', async () => {
  const state = await indiaBooksWith2b();
  const tokens = [',', '.', '1', '-', 'and', 'tds', 'gst', 'inv-0001', 'INV-0001', '5000', 'Rs.', 'of', 'for', 'net 30', 'every', 'withheld', 'received', 'paid', 'ims', 'audit trail'];
  const starts = ['', 'received 5000 against INV-0001 ', 'invoice Kiran Stores 5000 GST 18% ', 'paid Fabric Co ', 'tds ', 'accept all matched in ims ', 'record tds withheld 2000 on INV-0001 '];
  let slowest = { ms: 0, text: '' };
  for (const token of tokens) {
    for (const joiner of [' ', '']) {
      for (const start of starts) {
        let text = start;
        while (text.length < 2000) text += token + joiner;
        text = text.slice(0, 2000);
        const ms = fastestOfThree(() => planLocalToolCall(state, text), 100);
        if (ms > slowest.ms) slowest = { ms, text: `${start}${token}` };
        assert.ok(ms < 100, `${JSON.stringify(start + token)} took ${ms.toFixed(0)} ms of CPU`);
      }
    }
  }
  assert.ok(slowest.ms < 100);
});

const QUOTE_LEADS = ['quote', 'quotation', 'estimate', 'make a quote', 'send a quote', 'proforma', 'pro forma invoice', 'proforma invoice', 'PI', 'sales order', 'sale order', 'book a sales order', 'delivery challan', 'challan', 'send a delivery challan'];

test('S3: the quote family on an Indian book keeps its rupee wording', () => {
  const state = indiaBooks();
  for (const lead of QUOTE_LEADS) {
    assert.equal(planned(state, `${lead} Maple Cafe 99999999999 for cakes GST 12%`).reply, 'That amount is larger than I will take from a chat message (the limit is ₹100 crore); enter it as a form if it is right. I have recorded nothing.', lead);
    assert.equal(planned(state, `${lead} Maple Cafe 5000 for cakes dated 31/02/2026 GST 12%`).reply, '31/02/2026 is not a date I can read; say it as 2026-08-15 or 15/08/2026. I have recorded nothing.', lead);
    assert.match(planned(state, `${lead} Maple Cafe 5000 for cakes -300 GST 12%`).reply, /^A negative number cannot be part of an invoice or bill/, lead);
  }
});

test('S3: the quote family on a US book names no rupee amount and no India date hint', () => {
  const state = usBooks();
  for (const lead of QUOTE_LEADS) {
    const large = planned(state, `${lead} Maple Cafe 99999999999 for cakes GST 12%`);
    assert.equal(large.kind, 'reply', lead);
    assert.doesNotMatch(large.reply, /₹|crore|rupee/i, lead);
    assert.match(large.reply, /larger than I will take from a chat message/, lead);
    assert.match(large.reply, /I have recorded nothing\.$/, lead);
    const dated = planned(state, `${lead} Maple Cafe 5000 for cakes dated 31/02/2026 GST 12%`);
    assert.equal(dated.kind, 'reply', lead);
    assert.match(dated.reply, /^31\/02\/2026 is not a date I can read/, lead);
    assert.doesNotMatch(dated.reply, /2026-08-15|15\/08\/2026/, lead);
    assert.match(dated.reply, /I have recorded nothing\.$/, lead);
  }
});

test('S3: the repeating invoice and the plain invoice problems follow the book country too', () => {
  const us = usBooks();
  const india = indiaBooks();
  const repeating = 'repeat invoice to Maple Cafe 99999999999 for rent GST 18% every month from 2026-12-01';
  assert.doesNotMatch(planned(us, repeating).reply, /₹|crore/);
  assert.match(planned(india, repeating).reply, /the limit is ₹100 crore/);
  assert.doesNotMatch(planned(us, 'invoice Maple Cafe 99999999999 for cakes GST 12%').reply, /₹|crore/);
  assert.match(planned(india, 'invoice Maple Cafe 99999999999 for cakes GST 12%').reply, /the limit is ₹100 crore/);
  assert.match(planned(india, 'bill from Fabric Co 99999999999 GST 5%').reply, /the limit is ₹100 crore/);
  assert.match(documentProblemReply({ problem: 'AMOUNT_TOO_LARGE' }).reply, /the limit is ₹100 crore/);
  assert.match(documentProblemReply({ problem: 'AMOUNT_TOO_LARGE' }, 'IN').reply, /the limit is ₹100 crore/);
  assert.doesNotMatch(documentProblemReply({ problem: 'AMOUNT_TOO_LARGE' }, 'US').reply, /₹|crore/);
  assert.doesNotMatch(documentProblemReply({ problem: 'INVALID_DATE', said: '31/02/2026' }, 'US').reply, /2026-08-15|15\/08\/2026/);
});

const GST_SENTENCES = ['review GST', 'review GST for September', 'gst review', 'review gstr-1', 'paid GST', 'paid GST FY limit', 'paid gst 5000 by bank', 'paid GST for October', 'gst challan paid 5000', 'GST credit balance at start of September: IGST 0, CGST 1200, SGST 1200', 'IFF for July', 'quarterly GSTR-1 for Q2 2026-27', 'gstr-9 for 2025-26', 'annual return', 'gst payable'];

test('S4: a sentence that only makes sense for India answers a US book with the country sentence and never throws', async () => {
  for (const say of GST_SENTENCES) {
    const plan = planned(usBooks(), say);
    assert.equal(plan.kind, 'reply', say);
    assert.equal(plan.reply, OTHER_COUNTRY, say);
    assert.deepEqual(plan.tools, [], say);
    const out = await chat(usBooks(), say);
    assert.equal(out.reply, OTHER_COUNTRY, say);
    assert.notEqual(out.posted, true, say);
    assert.equal(out.awaitingConfirmation, undefined, say);
  }
  const existing = await chat(usBooks(), 'gst payable');
  assert.equal(existing.reply, OTHER_COUNTRY);
});

test('S4: the same sentences on an Indian book plan as before', () => {
  const state = indiaBooks();
  const plan = (say) => planned(state, say);
  assert.equal(plan('review GST').name, 'gst_review_answer');
  assert.equal(plan('review gstr-1').name, 'gst_review_answer');
  assert.equal(plan('review the return').name, 'gst_review_answer');
  assert.equal(plan('review GST for September').name, 'gst_review_answer');
  assert.equal(plan('review GST for September').args.period, '2026-09');
  assert.match(plan('review GST for August').reply, /nothing to review/);
  for (const say of ['paid GST', 'paid GST FY limit', 'paid gst 5000 by bank', 'gst challan paid 5000']) {
    assert.equal(plan(say).name, 'record_gst_payment', say);
    assert.deepEqual(plan(say).args, { mode: 'bank' }, say);
  }
  assert.equal(plan('paid GST for October').name, 'record_gst_payment');
  assert.match(plan('paid GST for October').args.period, /^\d{4}-10$/);
  assert.deepEqual(plan('GST credit balance at start of September: IGST 0, CGST 1200, SGST 1200').args, { period: plan('GST credit balance at start of September: IGST 0, CGST 1200, SGST 1200').args.period, igst: 0, cgst: 1200, sgst: 1200 });
  assert.equal(plan('IFF for July').name, 'export_iff');
  assert.equal(plan('quarterly GSTR-1 for Q2 2026-27').name, 'export_gstr1_quarter');
  assert.equal(plan('gstr-9 for 2025-26').name, 'gstr9_draft');
  assert.equal(plan('gst payable').name, 'gst_payable');
});

test('S4: US sentences that share a word with the India ones keep working', async () => {
  const state = usBooks();
  assert.notEqual(planned(state, 'review sales tax for TX').reply, OTHER_COUNTRY);
  assert.equal(planned(state, 'review sales tax for TX').name, 'sales_tax_review');
  assert.equal(planned(state, 'review the sales tax return').name, 'sales_tax_overview');
  const advance = await chat(usBooks(), 'paid advance tax 5000');
  assert.match(advance.reply, /\$5,000\.00/);
  assert.notEqual(advance.reply, OTHER_COUNTRY);
  for (const say of ['review the return', 'review my tax return', 'review the 1099 return']) {
    let plan;
    assert.doesNotThrow(() => { plan = planned(usBooks(), say); }, say);
    assert.doesNotMatch(String(plan.reply || ''), JS_TEXT, say);
  }
});

function stateThatThrows(error) {
  return new Proxy(indiaBooks(), {
    get(target, key, receiver) {
      if (key === 'invoices') throw error;
      return Reflect.get(target, key, receiver);
    },
  });
}

const engineText = (...parts) => parts.join(' ');

test('S4: the preview never shows the text of a JavaScript error, and a plain Error with its own sentence is shown as before', () => {
  for (const kind of [TypeError, ReferenceError, RangeError, SyntaxError, EvalError, URIError]) {
    const preview = previewOf(stateThatThrows(new kind(engineText('Cannot', 'read', 'properties', 'of', 'undefined', '(reading', "'amount')"))), 'record_receipt', { invoiceId: 'INV-0001', amount: 5000 });
    assert.deepEqual(preview.blockers, [NEUTRAL_PREVIEW], kind.name);
  }
  const plain = previewOf(stateThatThrows(new Error('The books are being closed; try again in a minute.')), 'record_receipt', { invoiceId: 'INV-0001', amount: 5000 });
  assert.deepEqual(plain.blockers, ['I could not work out what this would do: The books are being closed; try again in a minute.']);
  const bare = previewOf(stateThatThrows('The books are busy.'), 'record_receipt', { invoiceId: 'INV-0001', amount: 5000 });
  assert.deepEqual(bare.blockers, ['I could not work out what this would do: The books are busy.']);
  const nothing = previewOf(stateThatThrows(null), 'record_receipt', { invoiceId: 'INV-0001', amount: 5000 });
  assert.equal(nothing.blockers.length, 1);
  assert.doesNotMatch(nothing.blockers[0], JS_TEXT);
});

test('S4: a form that asks a US book to preview an India-only action gets the neutral sentence, not a JavaScript message', () => {
  const preview = previewOf(usBooks(), 'record_gst_payment', { mode: 'bank' });
  assert.deepEqual(preview.blockers, [NEUTRAL_PREVIEW]);
  const held = propose(usBooks(), 'record_gst_payment', { mode: 'bank' });
  assert.match(held.reply, /I did not post anything, because:/);
  assert.doesNotMatch(held.reply, JS_TEXT);
  assert.equal(held.posted, false);
});

test('S4: a US quote that names a rate but no jurisdiction gets the sentence a US invoice gets', async () => {
  const invoice = previewOf(usBooks(), 'create_invoice', { partyName: 'Maple Cafe', lines: [{ description: 'cakes', qty: 1, rate: 5000 }] });
  assert.deepEqual(invoice.blockers, [JURISDICTION_SENTENCE]);
  for (const say of ['quote Maple Cafe 5000 for cakes GST 12.5%', 'quote Maple Cafe 5000 for cakes tax 12.5%', 'proforma Maple Cafe 5000 for cakes GST 12%', 'sales order Maple Cafe 5000 for cakes GST 12%', 'delivery challan Maple Cafe 5000 for cakes GST 12%']) {
    const out = await chat(usBooks(), say);
    assert.equal(out.reply, `I did not post anything, because:\n· ${JURISDICTION_SENTENCE}`, say);
    assert.doesNotMatch(out.reply, RAW_CODE, say);
    assert.equal(out.posted, false, say);
  }
  const direct = await runTool(usBooks(), 'create_quote', { partyName: 'Maple Cafe', lines: [{ description: 'cakes', qty: 1, rate: 5000 }] });
  assert.equal(direct.error, 'JURISDICTION_REQUIRED');
  assert.equal(fmtToolResult('create_quote', direct), JURISDICTION_SENTENCE);
  const exemptNoReason = await runTool(usBooks(), 'create_quote', { partyName: 'Maple Cafe', taxExempt: true, lines: [{ description: 'cakes', qty: 1, rate: 5000 }] });
  assert.equal(exemptNoReason.error, 'EXEMPTION_REASON_REQUIRED');
  assert.doesNotMatch(fmtToolResult('create_quote', exemptNoReason), RAW_CODE);
  const unknown = previewOf(usBooks(), 'create_quote', { partyName: 'Maple Cafe', taxJurisdiction: 'TX', lines: [{ description: 'cakes', qty: 1, rate: 5000 }] });
  assert.equal(unknown.blockers.length, 1);
  assert.doesNotMatch(unknown.blockers[0], RAW_CODE);
});

test('S4: an Indian quote keeps asking for the GST rate, and posts with one', async () => {
  const state = indiaBooks();
  const asked = await chat(state, 'quote Maple Cafe 5000 for cakes');
  assert.match(asked.reply, /I will not guess the GST rate/);
  const held = await chat(state, 'quote Maple Cafe 5000 for cakes GST 12%');
  assert.equal(held.awaitingConfirmation, true);
  assert.match(held.reply, /Quote to Maple Cafe/);
});

test('S4: a tool that fails with the text of a JavaScript error is answered in plain words, and the codes that have a sentence keep it', async () => {
  const far = await chat(indiaBooks(), 'can I afford 50000 on 2099-03-31');
  assert.equal(far.reply, 'That did not go through, so nothing was changed.');
  const faults = [
    engineText('Cannot', 'read', 'properties', 'of', 'undefined', '(reading', "'amount')"),
    engineText('Cannot', 'set', 'properties', 'of', 'null', '(setting', "'a')"),
    engineText('Cannot', 'destructure', 'property', "'a'", 'of', 'undefined'),
    engineText('lowestAfter', 'is', 'not', 'a', 'function'),
    engineText('foo', 'is', 'not', 'defined'),
    engineText('x', 'is', 'not', 'iterable'),
    engineText('undefined', 'is', 'not', 'iterable'),
    engineText('[object', 'Object]'),
    engineText('TypeError:', 'bad'),
  ];
  for (const error of faults) {
    const said = fmtToolResult('can_afford', { ok: false, error });
    assert.equal(said, 'That did not go through, so nothing was changed.', error);
    assert.doesNotMatch(said, JS_TEXT, error);
  }
  assert.equal(fmtToolResult('x', { ok: false, error: 'NOT_FOR_COUNTRY' }), OTHER_COUNTRY);
  assert.equal(fmtToolResult('x', { ok: false, error: 'SOMETHING_ELSE' }), 'That did not go through (something else), so nothing was changed.');
  assert.equal(fmtToolResult('x', { ok: false, error: 'csv required' }), 'That did not go through (csv required), so nothing was changed.');
});

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function intentVocabulary() {
  const dir = new URL('../src/', import.meta.url);
  const words = new Map();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('-intent.mjs') && file !== 'assistant-contract.mjs') continue;
    const cleaned = readFileSync(new URL(file, dir), 'utf8').replace(/\\[a-zA-Z]/g, ' ').replace(/[^A-Za-z' ]/g, ' ');
    for (const word of cleaned.split(/\s+/)) {
      const lower = word.toLowerCase();
      if (/^[a-z][a-z']{2,}$/.test(lower)) words.set(lower, (words.get(lower) || 0) + 1);
    }
  }
  const skip = new Set(['const', 'return', 'function', 'null', 'true', 'false', 'undefined', 'new', 'else', 'let', 'var', 'void', 'typeof', 'case', 'break', 'for', 'import', 'from', 'export']);
  return [...words.keys()].filter((word) => !skip.has(word)).sort();
}

const FUZZ_NAMES = ['Kiran Stores', 'Fabric Co', 'Maple Cafe', 'Pack House', 'Dye Works', 'Thread Ltd', 'Ravi Traders', 'Walk-in'];
const FUZZ_IDS = ['INV-0001', 'INV-0002', 'BILL-0001', 'QT-0001', 'PI-0001', 'SO-0001', 'DC-0001', 'CN-0001', 'EXP-0001', 'RP-0001', 'inv-0001', 'INV-9999'];
const FUZZ_FIGURES = ['5000', '5,000', '5000.50', 'Rs.5000', 'Rs 5000', 'Rs5000', 'INR5000', '₹5000', '₹1,50,000', '2k', '1.5 lakh', '2 crore', '0', '-500', '99999999999', '12500.25', '18%', '12.5%', 'GST 18%', 'GST 12.5%', 'tax 8%'];
const FUZZ_TAILS = ['yes', 'no', 'confirm', 'cancel', 'help', '?', 'by cheque no 123456', 'UTR 4567891234', 'net 30', 'by cash', 'GSTIN 27AABCT1332L1ZE', 'TAN MUMA12345B', 'under 194J', 'in excel', 'limit 5', 'for job work', 'valid 30 days', 'every month', 'from 2026-12-01', 'for September', 'FY 2025-26', '31/02/2026'];

function fuzzSentences(count, seed, vocabulary, seeds) {
  const next = mulberry32(seed);
  const pick = (list) => list[Math.floor(next() * list.length)];
  const token = () => {
    const roll = next();
    if (roll < 0.58) return pick(vocabulary);
    if (roll < 0.68) return pick(FUZZ_NAMES);
    if (roll < 0.76) return pick(FUZZ_IDS);
    if (roll < 0.9) return pick(FUZZ_FIGURES);
    return pick(FUZZ_TAILS);
  };
  const mutate = (sentence) => {
    const parts = sentence.split(/\s+/);
    for (let step = 1 + Math.floor(next() * 3); step > 0; step -= 1) {
      const kind = Math.floor(next() * 7);
      const at = Math.floor(next() * Math.max(1, parts.length));
      if (kind === 0 && parts.length > 2) parts.splice(at, 1);
      else if (kind === 1) parts[at] = token();
      else if (kind === 2) parts.splice(at, 0, token());
      else if (kind === 3 && parts.length > 1) {
        const other = Math.floor(next() * parts.length);
        [parts[at], parts[other]] = [parts[other], parts[at]];
      } else if (kind === 4) parts.push(pick(FUZZ_TAILS));
      else if (kind === 5) parts.splice(at, 0, pick(FUZZ_FIGURES));
      else parts.splice(at, 0, pick(FUZZ_IDS));
    }
    return parts.join(' ');
  };
  const made = new Set();
  let guard = 0;
  while (made.size < count && guard < count * 20) {
    guard += 1;
    const roll = next();
    let sentence;
    if (roll < 0.5) sentence = mutate(pick(seeds));
    else if (roll < 0.6) sentence = pick(seeds);
    else if (roll < 0.75) {
      const first = pick(seeds).split(/\s+/);
      const second = pick(seeds).split(/\s+/);
      sentence = [...first.slice(0, 1 + Math.floor(next() * first.length)), ...second.slice(Math.floor(next() * second.length))].join(' ');
    } else sentence = Array.from({ length: 2 + Math.floor(next() * 6) }, token).join(' ');
    sentence = sentence.replace(/\s+/g, ' ').trim();
    if (sentence && sentence.length <= 400) made.add(sentence);
  }
  return [...made];
}

function leaksIn(reply) {
  const found = [];
  if (JS_TEXT.test(reply)) found.push(`JavaScript text: ${reply.replace(/\s+/g, ' ').slice(0, 120)}`);
  for (const code of new Set(reply.match(RAW_CODE) || [])) if (!SETTING_NAMES.has(code)) found.push(`raw code ${code}`);
  return found;
}

test('S4: a fuzz of sentences on a US book, an Indian book and an empty book never throws and never shows JavaScript text or a bare code', async (t) => {
  const wanted = Number(process.env.MYCA_FUZZ_SENTENCES || 4000);
  const seeds = pickedSentences(100000);
  const sentences = fuzzSentences(wanted, 20261108, intentVocabulary(), seeds);
  assert.ok(sentences.length >= wanted * 0.99, `${sentences.length} distinct sentences`);
  t.diagnostic(`${sentences.length} distinct sentences on each of three books`);
  const builders = { us: usBooks, india: indiaBooks, empty: createState };
  for (const [book, build] of Object.entries(builders)) {
    let state = build();
    let index = 0;
    for (const sentence of sentences) {
      index += 1;
      if (index % 250 === 0) state = build();
      let plan;
      try {
        plan = planLocalToolCall(state, sentence);
      } catch (error) {
        assert.fail(`${book}: planning ${JSON.stringify(sentence)} threw ${error.message}`);
      }
      assert.deepEqual(leaksIn(String(plan && plan.reply ? plan.reply : '')), [], `${book}: plan of ${JSON.stringify(sentence)}`);
      let out;
      try {
        out = await chat(state, sentence);
      } catch (error) {
        assert.fail(`${book}: chat ${JSON.stringify(sentence)} threw ${error.message}`);
      }
      assert.deepEqual(leaksIn(String(out && out.reply ? out.reply : '')), [], `${book}: reply to ${JSON.stringify(sentence)}`);
    }
  }
});

test('"yesterday" and "the day before yesterday" date a receipt or a payment one or two days back; a said date still wins', () => {
  const state = indiaBooks();
  const today = localToday();
  const back = (count) => {
    const day = new Date(`${today}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() - count);
    return day.toISOString().slice(0, 10);
  };
  assert.equal(receiptDate('received 5000 yesterday', '2026-03-01'), '2026-02-28');
  assert.equal(receiptDate('received 5000 the day before yesterday', '2026-01-01'), '2025-12-30');
  assert.equal(receiptDate('received 5000 day before yesterday', '2024-03-01'), '2024-02-28');
  assert.equal(receiptDate('received 5000', '2026-11-09'), '2026-11-09');
  assert.equal(receiptDate('received 5000 yesterday', 'not-a-date'), 'not-a-date');
  for (const [sentence, count] of [['received 5000 against INV-0001 yesterday', 1], ['Kiran Stores paid 5000 on INV-0001 the day before yesterday', 2], ['paid Fabric Co 4000 yesterday', 1]]) {
    const plan = planned(state, sentence);
    assert.equal(plan.kind, 'tool', `${sentence}: ${JSON.stringify(plan)}`);
    assert.equal(plan.args.date, back(count), sentence);
  }
  assert.equal(planned(state, 'received 5000 against INV-0001 yesterday dated 2026-10-12').args.date, '2026-10-12');
});
