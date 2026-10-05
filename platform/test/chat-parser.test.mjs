import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { chat } from '../src/router.mjs';
import { createInvoice } from '../src/invoice.mjs';
import { parseDocument, receiptAmount } from '../src/intent.mjs';

function line(text) {
  const doc = parseDocument(text);
  return doc ? { party: doc.partyName, ...doc.lines[0] } : null;
}

test('a percentage is a GST rate, never a price', () => {
  assert.deepEqual(line('invoice Kiran Stores 8000 at 18%'), { party: 'Kiran Stores', description: 'Supply', qty: 1, rate: 8000, gstRate: 18 });
  assert.deepEqual(line('invoice Kiran 8000 @ 5%'), { party: 'Kiran', description: 'Supply', qty: 1, rate: 8000, gstRate: 5 });
  assert.equal(line('invoice Kiran 8000 18% gst').gstRate, 18);
  assert.equal(line('invoice Kiran 8000 GST 0%').gstRate, 0);
  assert.equal(line('invoice Kiran 8000 gst 12 percent').gstRate, 12);
  assert.equal(line('invoice Kiran 8000 gst 2.5').gstRate, 2.5);
});

test('an amount is read with or without the word "at"', () => {
  assert.equal(line('create invoice for Kiran 8000 gst 18').rate, 8000);
  assert.equal(line('sale to Kiran 8000 cash gst 5').rate, 8000);
  assert.equal(line('sold to Kiran Rs. 8,000.50 gst 18').rate, 8000.5);
  assert.equal(line('invoice Kiran ₹8,000 gst 18').rate, 8000);
  assert.equal(line('invoice Kiran 8k gst 18').rate, 8000);
  assert.equal(line('invoice Kiran 1.5 lakh gst 18').rate, 150000);
  assert.equal(line('bought from Yarn Co 4000 gst 5').party, 'Yarn Co');
});

test('"N things at P" is N at P each; a quantity without "at" is kept as a note on one line', () => {
  assert.deepEqual(line('invoice Acme Traders 10 widgets at 500 gst 18'), { party: 'Acme Traders', description: 'Supply', qty: 10, rate: 500, gstRate: 18 });
  assert.deepEqual(line('Invoice Retail Mart GSTIN 27aaach7409r1z1, 10 rolls at 50,000, GST 5%'), { party: 'Retail Mart', description: 'Supply', qty: 10, rate: 50000, gstRate: 5 });
  assert.deepEqual(line('invoice Kiran qty 3 at 250 gst 12'), { party: 'Kiran', description: 'Supply', qty: 3, rate: 250, gstRate: 12 });
  assert.deepEqual(line('sold to Kiran 2 units 8000 gst 18%'), { party: 'Kiran', description: 'Supply (2 units)', qty: 1, rate: 8000, gstRate: 18 });
});

test('a sentence that could mean two amounts, or none, is not guessed', () => {
  assert.equal(parseDocument('invoice Kiran 8000 5000 gst 18'), null);
  assert.equal(parseDocument('invoice Kiran gst 18'), null);
  assert.equal(parseDocument('format 2'), null);
  assert.equal(parseDocument('8000'), null);
  assert.equal(parseDocument('what is the flat 2 percent thing'), null);
  assert.equal(parseDocument('invoice Kiran on 05-08-2026 gst 18'), null);
});

test('no GST rate is assumed: the parsed line has none and nothing is previewed', async () => {
  assert.equal('gstRate' in parseDocument('invoice Apna at 500').lines[0], false);
  assert.equal('gstRate' in parseDocument('invoice Kiran gst 8000').lines[0], false);
  const state = createState();
  for (const text of ['invoice Kiran 8000', 'invoice Apna at 500', 'purchase from Fabric Co 4000']) {
    const out = await chat(state, text);
    assert.match(out.reply, /will not guess the GST rate/, text);
    assert.equal(out.awaitingConfirmation, undefined, text);
    assert.equal(state.pendingChatAction, null, text);
  }
  assert.equal(state.invoices.length, 0);
  assert.equal((state.purchases || []).length, 0);
});

test('chat previews what was said, with the engine doing the tax', async () => {
  const state = createState();
  const sale = await chat(state, 'invoice Kiran Stores 8000 at 18%');
  assert.equal(sale.awaitingConfirmation, true, sale.reply);
  assert.deepEqual([sale.preview.figures.taxable, sale.preview.figures.tax, sale.preview.figures.total], [8000, 1440, 9440]);
  await chat(state, 'no');

  const many = await chat(state, 'invoice Acme Traders 10 widgets at 500 gst 18');
  assert.deepEqual([many.preview.figures.taxable, many.preview.figures.total], [5000, 5900]);
  const posted = await chat(state, 'yes');
  assert.equal(posted.posted, true);
  assert.equal(state.invoices[0].lines[0].qty, 10);
  assert.equal(state.invoices[0].total, 5900);
});

test('a receipt takes the amount that was said, and the whole balance only when none was', async () => {
  assert.equal(receiptAmount('payment received INV-0002 5000'), 5000);
  assert.equal(receiptAmount('received 5,000 against INV-0002 by cash'), 5000);
  assert.equal(receiptAmount('INV-0002 paid 1.2 lakh'), 120000);
  assert.equal(receiptAmount('record receipt INV-0002'), null);
  assert.equal(receiptAmount('INV-0002 paid on 05-08-2026'), null);
  assert.equal(receiptAmount('INV-0002 paid 3000 then 2000'), null);

  const state = createState();
  createInvoice(state, { id: 'INV-0002', date: '2026-08-01', partyName: 'Gujarat Weaves', partyGstin: '', lines: [{ description: 'Cloth', qty: 1, rate: 10000, gstRate: 5 }] });
  const part = await chat(state, 'payment received INV-0002 4000 cash');
  assert.equal(part.awaitingConfirmation, true, part.reply);
  assert.equal(part.preview.figures.amount, 4000);
  assert.match(part.preview.summary, /by cash/);
  await chat(state, 'yes');
  assert.deepEqual(state.invoices[0].receipts.map((r) => r.amount), [4000]);

  const rest = await chat(state, 'record receipt INV-0002');
  assert.equal(rest.preview.figures.amount, 6500);
  const tooMuch = await chat(state, 'received 99999 against INV-0002');
  assert.equal(tooMuch.blocked, true);
});

test('a question that looks like a sale still posts nothing', async () => {
  const state = createState();
  const out = await chat(state, 'should I invoice Kiran 8000 at 18%?');
  assert.equal(out.awaitingConfirmation, undefined);
  assert.equal(state.pendingChatAction, null);
});
