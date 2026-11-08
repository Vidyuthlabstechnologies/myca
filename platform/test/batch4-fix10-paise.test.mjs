import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { createInvoice, createPurchase, billOutstanding } from '../src/invoice.mjs';
import { outstandingOf } from '../src/credit-notes.mjs';
import { chat } from '../src/router.mjs';
import { planLocalToolCall } from '../src/assistant-contract.mjs';
import * as intent from '../src/intent.mjs';
import { localToday } from '../src/dates.mjs';

const TODAY = localToday();
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec'];

function books(rate) {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  const sale = createInvoice(state, { date: '2026-10-01', partyName: 'Kiran Stores', lines: [{ description: 'Services', qty: 1, rate, gstRate: 0 }] });
  assert.equal(sale.ok, true, JSON.stringify(sale));
  const bill = createPurchase(state, { date: '2026-10-02', partyName: 'Fabric Co', partyGstin: '27AABCT1332L1ZE', supplierInvoiceNo: 'F-1', lines: [{ description: 'Goods', hsn: '5208', qty: 1, rate, gstRate: 0 }] });
  assert.equal(bill.ok, true, JSON.stringify(bill));
  return state;
}

const plan = (state, sentence) => planLocalToolCall(state, sentence);

function words(out) {
  return out && out.kind === 'tool' ? `${out.name} ${JSON.stringify(out.args)}` : JSON.stringify(out);
}

function toolArgs(state, sentence, name) {
  const out = plan(state, sentence);
  assert.equal(out && out.kind, 'tool', `${sentence} -> ${words(out)}`);
  assert.equal(out.name, name, `${sentence} -> ${words(out)}`);
  return out.args;
}

function latestDay(month, day) {
  const year = Number(TODAY.slice(0, 4));
  const pad = (n) => String(n).padStart(2, '0');
  const thisYear = `${year}-${pad(month)}-${pad(day)}`;
  return thisYear <= TODAY ? thisYear : `${year - 1}-${pad(month)}-${pad(day)}`;
}

function failures(wrong) {
  return `${wrong.length} wrong, first ones:\n${wrong.slice(0, 8).join('\n')}`;
}

test('P1: an amount with paise before payment, receipt, cheque or part words keeps its paise when the sentence also has a reference, a date or terms', () => {
  const state = books(1200000);
  const cases = [
    ['received 11800.50 payment against INV-0001 utr 4567891234', 'record_receipt', 11800.5],
    ['received 2500.75 part payment against INV-0001 ref 4471', 'record_receipt', 2500.75],
    ['received 5000.50 cheque against INV-0001 ref 4471', 'record_receipt', 5000.5],
    ['received 1,18,000.50 payment against INV-0001 utr 4567891234', 'record_receipt', 118000.5],
    ['Kiran Stores paid 5000.50 payment ref 4471', 'record_receipt', 5000.5],
    ['got 5000.50 payment from Kiran Stores utr 4567891234', 'record_receipt', 5000.5],
    ['received 5000.50 payment against INV-0001 in 30 days', 'record_receipt', 5000.5],
    ['received 5000.50 receipt against INV-0001 ref 4471', 'record_receipt', 5000.5],
    ['received 250.75 invoice against INV-0001 on 12 oct', 'record_receipt', 250.75],
    ['paid Fabric Co 11800.50 payment ref 998877', 'record_payment', 11800.5],
    ['paid Fabric Co 5000.50 cheque utr 4567891234', 'record_payment', 5000.5],
    ['paid Fabric Co 2500.75 part ref 4471', 'record_payment', 2500.75],
    ['paid Fabric Co 99.99 bill neft no 998877', 'record_payment', 99.99],
    ['paid Fabric Co 12.50 instalment dated 2026-10-12', 'record_payment', 12.5],
  ];
  for (const [sentence, name, amount] of cases) {
    assert.equal(toolArgs(state, sentence, name).amount, amount, sentence);
    assert.deepEqual(intent.amountsSaid(sentence), [amount], sentence);
    assert.equal(intent.soleAmountSaid(sentence), amount, sentence);
  }
});

test('P1: 1,344 sentences of seven amounts with paise, sixteen count words and six tails are read with the amount that was said', () => {
  const state = books(1200000);
  const counts = ['invoice', 'invoices', 'bill', 'bills', 'cheque', 'cheques', 'check', 'receipt', 'receipts', 'payment', 'payments', 'instalment', 'installment', 'tranche', 'part', 'parts'];
  const amounts = ['11800.50', '11800.5', '1,18,000.50', '250.75', '99.99', '5000.05', '12.50'];
  const tails = [['utr 4567891234', TODAY], ['ref 4471', TODAY], ['on 12 oct', latestDay(10, 12)], ['dated 2026-10-12', '2026-10-12'], ['in 30 days', TODAY], ['neft no 998877', TODAY]];
  const ownedByAnotherPlanner = (word, tail, name) => (name === 'record_payment' && ['invoice', 'invoices', 'receipt'].includes(word)) || (name === 'record_receipt' && word === 'invoice' && tail.startsWith('dated'));
  const wrong = [];
  const elsewhere = [];
  let total = 0;
  for (const word of counts) {
    for (const said of amounts) {
      for (const [tail, date] of tails) {
        const amount = Number(said.replace(/,/g, ''));
        for (const [sentence, name] of [[`received ${said} ${word} against INV-0001 ${tail}`, 'record_receipt'], [`paid Fabric Co ${said} ${word} ${tail}`, 'record_payment']]) {
          total += 1;
          const out = plan(state, sentence);
          if (ownedByAnotherPlanner(word, tail, name)) {
            elsewhere.push(sentence);
            if (out && out.kind === 'tool' && out.args && out.args.amount !== undefined && out.args.amount !== amount) wrong.push(`${sentence} -> ${words(out)}`);
          } else if (!out || out.kind !== 'tool' || out.name !== name || out.args.amount !== amount || out.args.date !== date) {
            wrong.push(`${sentence} -> ${words(out)}`);
          }
        }
      }
    }
  }
  assert.equal(total, 1344);
  assert.equal(elsewhere.length, 133);
  assert.equal(wrong.length, 0, failures(wrong));
});

test('P1: the receipt and the payment from the finding are previewed and recorded with their paise', async () => {
  const state = books(11800.5);
  const held = await chat(state, 'received 11800.50 payment against INV-0001 utr 4567891234');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.match(held.reply, /^Receipt of ₹11,800\.50 against INV-0001 \(Kiran Stores\) by bank on /, held.reply);
  assert.match(held.reply, /INV-0001 becomes paid\./, held.reply);
  const done = await chat(state, 'yes');
  assert.equal(done.posted, true, done.reply);
  assert.match(done.reply, /^Recorded ₹11,800\.50 received from Kiran Stores by bank on /, done.reply);
  assert.match(done.reply, /INV-0001 is paid in full\./, done.reply);
  assert.deepEqual(state.invoices[0].receipts.map((receipt) => receipt.amount), [11800.5]);
  assert.equal(outstandingOf(state, state.invoices[0]), 0);

  const heldPay = await chat(state, 'paid Fabric Co 11800.50 payment ref 998877');
  assert.equal(heldPay.awaitingConfirmation, true, heldPay.reply);
  assert.match(heldPay.reply, /^Pay Fabric Co ₹11,800\.50 against BILL-0001 /, heldPay.reply);
  assert.match(heldPay.reply, /BILL-0001 becomes paid\./, heldPay.reply);
  const donePay = await chat(state, 'yes');
  assert.equal(donePay.posted, true, donePay.reply);
  assert.match(donePay.reply, /^Paid Fabric Co ₹11,800\.50 against BILL-0001 /, donePay.reply);
  assert.match(donePay.reply, /BILL-0001 is paid in full\./, donePay.reply);
  assert.equal(billOutstanding(state.purchases[0]), 0);
});

test('P1: a bill, cheque or instalment number after a figure is a reference, so the figure in front of it stays the amount', () => {
  const state = books(1200000);
  const paid = [
    ['paid Fabric Co 99 bill no 55', 99],
    ['paid Fabric Co 98 bill no 55', 98],
    ['paid Fabric Co 50 bill no 55', 50],
    ['paid Fabric Co 51 bill no 55', 51],
    ['paid Fabric Co 100 bill no 55', 100],
    ['paid Fabric Co 750 bill no 55', 750],
    ['paid 99 to Fabric Co bill no 55', 99],
    ['paid Fabric Co 99 payment no 55', 99],
    ['paid Fabric Co 99 bill number 12', 99],
    ['paid Fabric Co 99 cheque # 55', 99],
    ['paid Fabric Co 99 bill #4471', 99],
    ['paid Fabric Co 60 instalment 2', 60],
    ['paid Fabric Co 60 instalment 2 of 3', 60],
    ['paid Fabric Co 60 instalment no 2', 60],
  ];
  for (const [sentence, amount] of paid) {
    assert.equal(toolArgs(state, sentence, 'record_payment').amount, amount, sentence);
  }
  const received = [
    ['received 99 from Kiran Stores against INV-0001 bill no 55', 99],
    ['received 99 against INV-0001 receipt no 55', 99],
    ['received 99 against INV-0001 invoice no 12', 99],
    ['received 99 against INV-0001 receipt number 55', 99],
    ['received 60 against INV-0001 instalment 2', 60],
  ];
  for (const [sentence, amount] of received) {
    assert.equal(toolArgs(state, sentence, 'record_receipt').amount, amount, sentence);
  }
  assert.deepEqual(intent.amountsSaid('paid Fabric Co 99 bill no 55'), [99]);
  assert.deepEqual(intent.amountsSaid('paid Fabric Co 60 instalment 2'), [60]);
  assert.equal(intent.soleAmountSaid('paid Fabric Co 99 bill no 55'), 99);
  assert.equal(intent.soleAmountSaid('paid Fabric Co 60 instalment 2'), 60);
});

test('P1: a small figure in front of a part number or a bare bill number is never read as the number that follows it', () => {
  const state = books(1200000);
  const cases = [
    ['paid Fabric Co 60 part 2', 60, 'record_payment'],
    ['paid Fabric Co 99 part 2', 99, 'record_payment'],
    ['paid Fabric Co 10 part 2', 10, 'record_payment'],
    ['paid Fabric Co 5 part 2', 5, 'record_payment'],
    ['paid 99 to Fabric Co part 2', 99, 'record_payment'],
    ['paid Fabric Co 60 tranche 2', 60, 'record_payment'],
    ['paid Fabric Co 60 part no 2', 60, 'record_payment'],
    ['paid Fabric Co 99 bill 55', 99, 'record_payment'],
    ['paid Fabric Co 60 payment 55', 60, 'record_payment'],
    ['received 99 from Kiran Stores against INV-0001 part 2', 99, 'record_receipt'],
    ['received 60 against INV-0001 tranche 2', 60, 'record_receipt'],
  ];
  for (const [sentence, first, name] of cases) {
    const out = plan(state, sentence);
    if (out.kind === 'tool') {
      assert.equal(out.name, name, `${sentence} -> ${words(out)}`);
      assert.equal(out.args.amount, first, `${sentence} -> ${words(out)}`);
    } else {
      assert.equal(out.kind, 'reply', `${sentence} -> ${words(out)}`);
      assert.match(out.reply, /more than one amount/, sentence);
      assert.match(out.reply, /recorded nothing/, sentence);
      assert.deepEqual(out.tools, [], sentence);
    }
    assert.notEqual(intent.soleAmountSaid(sentence), Number(sentence.match(/(?:part|tranche|bill|payment)(?: no)? (\d+)/)[1]), sentence);
  }
});

test('P1: a count of documents, payments or parts in front of the amount or after it is still not an amount, and two real amounts are still asked', () => {
  const state = books(1200000);
  const received = [
    ['received 2 payments 5000 against INV-0001', 5000],
    ['received 5000 against INV-0001 in 2 payments', 5000],
    ['received 5000 against INV-0001 against 2 bills', 5000],
    ['received 5000 against INV-0001 by 3 cheques', 5000],
    ['received 5000 against INV-0001 for 3 invoices', 5000],
    ['received 3 receipts 7500 against INV-0001', 7500],
    ['received 2 instalments 5000 against INV-0001', 5000],
    ['received 2 parts 5000 against INV-0001', 5000],
    ['received 2 tranches 5000 against INV-0001', 5000],
    ['received 2 instalments 50 against INV-0001', 50],
    ['received 2 parts 50 against INV-0001', 50],
    ['received 2 payments 50 against INV-0001', 50],
    ['received 5000 against INV-0001 (first instalment of 3)', 5000],
    ['received 5000 against INV-0001, instalment 2 of 3', 5000],
    ['received 5000.50 in 2 payments against INV-0001 ref 4471', 5000.5],
    ['received 2 payments 5000.50 against INV-0001 ref 4471', 5000.5],
    ['received 1 payment 5000 against INV-0001', 5000],
    ['received 1 payment 50 against INV-0001', 50],
    ['received 1 part 99 against INV-0001', 99],
    ['received 1 part 2 months 5000 against INV-0001', 5000],
    ['received 5000 against INV-0001, 1 part of 3 parts', 5000],
    ['received 1 payment #4471 5000.50 against INV-0001', 5000.5],
    ['received 1 receipt 5000.50 against INV-0001 utr 4567891234', 5000.5],
  ];
  for (const [sentence, amount] of received) {
    assert.equal(toolArgs(state, sentence, 'record_receipt').amount, amount, sentence);
  }
  const paid = [
    ['paid 3 bills 12000 to Fabric Co', 12000],
    ['paid Fabric Co 3 bills 12000', 12000],
    ['paid Fabric Co 12000 against 3 bills', 12000],
    ['paid Fabric Co 12000.50 in 2 payments utr 4567891234', 12000.5],
    ['paid Fabric Co 3 bill 12000', 12000],
  ];
  for (const [sentence, amount] of paid) {
    assert.equal(toolArgs(state, sentence, 'record_payment').amount, amount, sentence);
  }
  for (const sentence of ['received 5000 and 3000.50 payment against INV-0001', 'received 5000.50 and 3000 against INV-0001 utr 4567891234', 'received 5000.50 payment and 3000.25 payment against INV-0001']) {
    const out = plan(state, sentence);
    assert.equal(out.kind, 'reply', `${sentence} -> ${words(out)}`);
    assert.match(out.reply, /more than one amount/, sentence);
    assert.match(out.reply, /recorded nothing/, sentence);
  }
  assert.deepEqual(intent.amountsSaid('received 2 payments 5000 and 3000.25 payment'), [5000, 3000.25]);
});

test('P2: paise followed by a month name is part of the amount, not a day, in the money reader', () => {
  const state = books(1200000);
  const cases = [
    ['received 12500.25 march rent against INV-0001', 'record_receipt', 12500.25],
    ['paid Fabric Co 12500.25 march rent', 'record_payment', 12500.25],
    ['received 12500.15 april rent against INV-0001', 'record_receipt', 12500.15],
    ['paid Fabric Co 7500.10 oct', 'record_payment', 7500.1],
    ['received 5000.05 may against INV-0001', 'record_receipt', 5000.05],
    ['received 1,18,000.25 sept from Kiran Stores', 'record_receipt', 118000.25],
    ['paid Fabric Co 2500.75 december', 'record_payment', 2500.75],
  ];
  for (const [sentence, name, amount] of cases) {
    const args = toolArgs(state, sentence, name);
    assert.equal(args.amount, amount, sentence);
    assert.equal(args.date, TODAY, `${sentence}: nothing in it is a date`);
    assert.deepEqual(intent.amountsSaid(sentence), [amount], sentence);
    assert.equal(intent.moneyDate(sentence, TODAY), TODAY, sentence);
  }
});

test('P2: 2,232 sentences of paise from .01 to .31 in front of every spelling of a month are read with the amount and today as the date', () => {
  const state = books(1200000);
  const wrong = [];
  let total = 0;
  for (const month of MONTHS) {
    for (let paise = 1; paise <= 31; paise += 1) {
      const said = `12500.${String(paise).padStart(2, '0')}`;
      const amount = Number(said);
      for (const [sentence, name] of [[`received ${said} ${month} rent against INV-0001`, 'record_receipt'], [`paid Fabric Co ${said} ${month} rent`, 'record_payment'], [`received ${said} ${month} from Kiran Stores`, 'record_receipt']]) {
        total += 1;
        const out = plan(state, sentence);
        if (!out || out.kind !== 'tool' || out.name !== name || out.args.amount !== amount || out.args.date !== TODAY) wrong.push(`${sentence} -> ${words(out)}`);
      }
    }
  }
  assert.equal(total, 2232);
  assert.equal(wrong.length, 0, failures(wrong));
});

test('P2: the receipt of 12500.25 with a month name after it is previewed and recorded as 12,500.25 on the day it is said', async () => {
  const state = books(12500.25);
  const held = await chat(state, 'received 12500.25 march rent against INV-0001');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.match(held.reply, /^Receipt of ₹12,500\.25 against INV-0001 \(Kiran Stores\) by bank on /, held.reply);
  assert.match(held.reply, /INV-0001 becomes paid\./, held.reply);
  const done = await chat(state, 'yes');
  assert.equal(done.posted, true, done.reply);
  assert.match(done.reply, /^Recorded ₹12,500\.25 received from Kiran Stores by bank on /, done.reply);
  assert.match(done.reply, /INV-0001 is paid in full\./, done.reply);
  assert.deepEqual(state.invoices[0].receipts.map((receipt) => [receipt.amount, receipt.date]), [[12500.25, TODAY]]);
  assert.equal(outstandingOf(state, state.invoices[0]), 0);

  const heldPay = await chat(state, 'paid Fabric Co 12500.25 march rent');
  assert.equal(heldPay.awaitingConfirmation, true, heldPay.reply);
  assert.match(heldPay.reply, /^Pay Fabric Co ₹12,500\.25 against BILL-0001 /, heldPay.reply);
  const donePay = await chat(state, 'yes');
  assert.equal(donePay.posted, true, donePay.reply);
  assert.match(donePay.reply, /BILL-0001 is paid in full\./, donePay.reply);
  assert.deepEqual(state.purchases[0].payments.map((payment) => [payment.amount, payment.date]), [[12500.25, TODAY]]);
  assert.equal(billOutstanding(state.purchases[0]), 0);
});

test('P2: a day in front of a month name is still a date, with or without paise on the amount', () => {
  const state = books(1200000);
  const march12 = latestDay(3, 12);
  const received = [
    ['received 5000 against INV-0001 on 12 march', { amount: 5000, date: march12 }],
    ['received 5000 12 march against INV-0001', { amount: 5000, date: march12 }],
    ['received 5000 against INV-0001 on march 12', { amount: 5000, date: march12 }],
    ['received 5,000 12 march against INV-0001', { amount: 5000, date: march12 }],
    ['received 5000.50 on 12 march against INV-0001', { amount: 5000.5, date: march12 }],
    ['received 5000.50 12 march against INV-0001', { amount: 5000.5, date: march12 }],
    ['received 5000.50 12th march against INV-0001', { amount: 5000.5, date: march12 }],
    ['received 5000 from Kiran Stores on 12 March 2026', { amount: 5000, date: '2026-03-12' }],
    ['received 5000.25 against INV-0001, 12 march', { amount: 5000.25, date: march12 }],
    ['received 5000.25 against INV-0001. 12 march', { amount: 5000.25, date: march12 }],
  ];
  for (const [sentence, wanted] of received) {
    assert.deepEqual(toolArgs(state, sentence, 'record_receipt'), { invoiceId: 'INV-0001', mode: 'bank', ...wanted }, sentence);
    assert.equal(intent.moneyDate(sentence, TODAY), wanted.date, sentence);
  }
  const paid = [
    ['paid Fabric Co 5000 12th march', { amount: 5000, date: march12 }],
    ['paid Fabric Co 5000 on 12 march', { amount: 5000, date: march12 }],
    ['paid Fabric Co 5000.75 on march 12', { amount: 5000.75, date: march12 }],
    ['paid Fabric Co 5000.75 12 march', { amount: 5000.75, date: march12 }],
  ];
  for (const [sentence, wanted] of paid) {
    assert.deepEqual(toolArgs(state, sentence, 'record_payment'), { billId: 'BILL-0001', mode: 'bank', ...wanted }, sentence);
  }
});

test('P2: in an audit trail sentence paise in front of a month name are not a date, and a day in front of a month name still is', () => {
  const state = books(1000);
  assert.deepEqual(plan(state, 'audit trail for 5000.05 march'), plan(state, 'audit trail for march'));
  assert.deepEqual(plan(state, 'audit trail for 5000.05 oct'), plan(state, 'audit trail for oct'));
  assert.deepEqual(plan(state, 'audit trail for 5000,05 march'), plan(state, 'audit trail for march'));
  assert.equal(plan(state, 'audit trail for 5000.05 march').kind, 'tool');
  assert.deepEqual(plan(state, 'audit trail for 5000.05 march 2026'), { kind: 'tool', name: 'audit_trail', args: { period: '2026-03' } });
  assert.deepEqual(plan(state, 'audit trail for 5000,05 march 2026'), { kind: 'tool', name: 'audit_trail', args: { period: '2026-03' } });
  assert.deepEqual(plan(state, 'audit trail for 12500.25 march 2026'), { kind: 'tool', name: 'audit_trail', args: { period: '2026-03' } });
  assert.deepEqual(plan(state, 'audit trail for 5000.05 march 2026 in excel'), { kind: 'tool', name: 'export_xlsx', args: { report: 'audit_trail', period: '2026-03' } });
  assert.equal(plan(state, 'audit trail for 5000.05 march in excel').kind, 'tool');

  const yearless = plan(state, 'audit trail for 5 march');
  assert.equal(yearless.kind, 'reply');
  assert.match(yearless.reply, /could not read that date range/);
  assert.equal(plan(state, 'audit trail for 5th march').kind, 'reply');
  assert.equal(plan(state, 'audit trail for march 5').kind, 'reply');
  assert.deepEqual(plan(state, 'audit trail for 5 march 2026'), { kind: 'tool', name: 'audit_trail', args: { from: '2026-03-05', to: '2026-03-05' } });
  assert.deepEqual(plan(state, 'audit trail for march 5, 2026'), { kind: 'tool', name: 'audit_trail', args: { from: '2026-03-05', to: '2026-03-05' } });
  assert.deepEqual(plan(state, 'audit trail from 5 march 2026 to 31 march 2026'), { kind: 'tool', name: 'audit_trail', args: { from: '2026-03-05', to: '2026-03-31' } });
  assert.deepEqual(plan(state, 'audit trail for 5 march 2026 in excel'), { kind: 'tool', name: 'export_xlsx', args: { report: 'audit_trail', from: '2026-03-05', to: '2026-03-05' } });
  assert.deepEqual(plan(state, 'audit trail for 5,000 march'), plan(state, 'audit trail for march'));
});

test('P3: TDS withheld with paise in front of a month name is the amount said and has no date', () => {
  const state = books(50000);
  const cases = [
    ['record tds withheld 1000.25 march on INV-0001 under 194C', { invoiceId: 'INV-0001', amount: 1000.25, section: '194C' }],
    ['Kiran Stores withheld tds 1000.15 april on INV-0001 under 194C', { invoiceId: 'INV-0001', amount: 1000.15, section: '194C' }],
    ['record tds withheld 1000.25 march on INV-0001', { invoiceId: 'INV-0001', amount: 1000.25 }],
    ['tds of 1000.25 march deducted by Kiran Stores on INV-0001', { invoiceId: 'INV-0001', amount: 1000.25 }],
    ['record tds withheld 7500.10 oct on INV-0001', { invoiceId: 'INV-0001', amount: 7500.1 }],
    ['record tds withheld 1,18,000.05 may on INV-0001', { invoiceId: 'INV-0001', amount: 118000.05 }],
    ['record tds withheld 1000.25 sept on INV-0001 under 194J', { invoiceId: 'INV-0001', amount: 1000.25, section: '194J' }],
  ];
  for (const [sentence, args] of cases) {
    assert.deepEqual(toolArgs(state, sentence, 'record_tds_withheld'), args, sentence);
  }
});

test('P3: 2,232 TDS sentences of paise from .01 to .31 in front of every spelling of a month plan the amount said and no date', () => {
  const state = books(50000);
  const wrong = [];
  let total = 0;
  for (const month of MONTHS) {
    for (let paise = 1; paise <= 31; paise += 1) {
      const said = `1000.${String(paise).padStart(2, '0')}`;
      const amount = Number(said);
      for (const sentence of [`record tds withheld ${said} ${month} on INV-0001`, `tds of ${said} ${month} deducted by Kiran Stores on INV-0001`, `Kiran Stores withheld tds ${said} ${month} on INV-0001 under 194C`]) {
        total += 1;
        const out = plan(state, sentence);
        if (!out || out.kind !== 'tool' || out.name !== 'record_tds_withheld' || out.args.amount !== amount || 'date' in out.args) wrong.push(`${sentence} -> ${words(out)}`);
      }
    }
  }
  assert.equal(total, 2232);
  assert.equal(wrong.length, 0, failures(wrong));
});

test('P3: the TDS of 1000.25 with a month name after it is previewed and recorded as 1,000.25, leaving 48,999.75 owed', async () => {
  const state = books(50000);
  const held = await chat(state, 'record tds withheld 1000.25 march on INV-0001 under 194C');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.match(held.reply, /^TDS of ₹1,000\.25 withheld by Kiran Stores on INV-0001 \(section 194C\), dated 1 Oct 2026/, held.reply);
  const done = await chat(state, 'yes');
  assert.equal(done.posted, true, done.reply);
  assert.match(done.reply, /^Recorded TDS of ₹1,000\.25 withheld on INV-0001, dated 1 Oct 2026; ₹48,999\.75 still owed\./, done.reply);
  assert.equal(outstandingOf(state, state.invoices[0]), 48999.75);
});

test('P3: a TDS date said as a day in front of a month name is still read, with or without paise on the amount', () => {
  const state = books(50000);
  const march25 = latestDay(3, 25);
  const cases = [
    ['record tds withheld 1000 on 25 march on INV-0001', { invoiceId: 'INV-0001', amount: 1000, date: march25 }],
    ['record tds withheld 1000 25 march on INV-0001', { invoiceId: 'INV-0001', amount: 1000, date: march25 }],
    ['record tds withheld 1000.25 on 25 march on INV-0001', { invoiceId: 'INV-0001', amount: 1000.25, date: march25 }],
    ['record tds withheld 1000.25 25 march on INV-0001', { invoiceId: 'INV-0001', amount: 1000.25, date: march25 }],
    ['record tds withheld 1000.25 on INV-0001 on 25th march', { invoiceId: 'INV-0001', amount: 1000.25, date: march25 }],
    ['record tds withheld 1000 on INV-0001 on march 25', { invoiceId: 'INV-0001', amount: 1000, date: march25 }],
    ['tds of 1000 deducted by Kiran Stores on INV-0001 on 25 march', { invoiceId: 'INV-0001', amount: 1000, date: march25 }],
    ['Kiran Stores withheld tds 1000 on 25 march 2026 on INV-0001 under 194C', { invoiceId: 'INV-0001', amount: 1000, section: '194C', date: '2026-03-25' }],
  ];
  for (const [sentence, args] of cases) {
    assert.deepEqual(toolArgs(state, sentence, 'record_tds_withheld'), args, sentence);
  }
});
