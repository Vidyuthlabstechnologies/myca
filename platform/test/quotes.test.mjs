import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { localToday } from '../src/dates.mjs';
import { previewOf } from '../src/chat-confirm.mjs';
import { trialBalance } from '../src/ledger.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';

const TODAY = localToday();
const shift = (days) => {
  const [y, m, d] = TODAY.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};
const consulting = { description: 'Consulting', hsn: '998311', qty: 1, rate: 50000, gstRate: 18 };

test('a quote prices GST like an invoice, by place of supply, and posts nothing', async () => {
  const state = createState();
  const local = await runTool(state, 'create_quote', { partyName: 'ABC Ltd', partyGstin: '27AAACH7409R1Z1', lines: [consulting], date: '2026-10-01' });
  assert.equal(local.ok, true, JSON.stringify(local));
  assert.equal(local.quote.id, 'QT-0001');
  assert.deepEqual([local.quote.taxable, local.quote.cgst, local.quote.sgst, local.quote.igst, local.quote.total], [50000, 4500, 4500, 0, 59000]);
  assert.equal(local.quote.validUntil, '2026-10-31');
  assert.equal(local.quote.status, 'open');
  const away = await runTool(state, 'create_quote', { partyName: 'Gujarat Mills', partyGstin: '24AAACF7856R1ZY', lines: [consulting], date: '2026-10-01', validDays: 7 });
  assert.equal(away.quote.igst, 9000);
  assert.equal(away.quote.validUntil, '2026-10-08');
  assert.equal(state.ledger.transfers.length, 0);
  assert.equal(state.invoices.length, 0);
});

test('a quote needs a customer, a GST rate in force, and a sensible validity; nothing is assumed', async () => {
  const state = createState();
  assert.equal((await runTool(state, 'create_quote', { partyName: 'A', lines: [{ ...consulting, gstRate: undefined }] })).error, 'RATE_REQUIRED');
  assert.equal((await runTool(state, 'create_quote', { partyName: 'A', lines: [{ ...consulting, gstRate: 17 }] })).error, 'RATE_NOT_IN_FORCE');
  assert.equal((await runTool(state, 'create_quote', { partyName: '', lines: [consulting] })).error, 'CUSTOMER_REQUIRED');
  assert.equal((await runTool(state, 'create_quote', { partyName: 'A', lines: [consulting], validDays: 0 })).error, 'BAD_VALIDITY');
  assert.equal((await runTool(state, 'create_quote', { partyName: 'A', lines: [] })).error, 'NO_LINES');
  assert.deepEqual(previewOf(state, 'create_quote', { partyName: 'A', lines: [{ ...consulting, gstRate: undefined }] }).blockers, ['Give the GST rate for each item; MyCA does not assume one.']);
  assert.equal((state.quotes || []).length, 0);
});

test('an accepted quote becomes an invoice with the same lines, linked both ways, and only once', async () => {
  const state = createState();
  await runTool(state, 'create_quote', { partyName: 'ABC Ltd', partyGstin: '27AAACH7409R1Z1', lines: [consulting] });
  await runTool(state, 'set_payment_terms', { partyName: 'ABC Ltd', partyGstin: '27AAACH7409R1Z1', days: 45 });
  assert.equal((await runTool(state, 'mark_quote', { id: 'QT-0001', outcome: 'accepted' })).quote.status, 'accepted');
  const preview = previewOf(state, 'convert_quote', { id: 'QT-0001' });
  assert.match(preview.summary, /^From quote QT-0001: Invoice to ABC Ltd \(27AAACH7409R1Z1\).*total ₹59,000\.00\..*Net 45/);
  const made = await runTool(state, 'convert_quote', { id: 'QT-0001' });
  assert.equal(made.ok, true, JSON.stringify(made));
  assert.equal(made.invoice.quoteId, 'QT-0001');
  assert.equal(made.invoice.total, 59000);
  assert.equal(made.invoice.paymentTermsDays, 45);
  assert.equal(made.quote.status, 'invoiced');
  assert.equal(made.quote.invoiceId, made.invoice.id);
  assert.equal(trialBalance(state.ledger).balanced, true);
  assert.equal((await runTool(state, 'convert_quote', { id: 'QT-0001' })).error, 'ALREADY_INVOICED');
  assert.equal((await runTool(state, 'mark_quote', { id: 'QT-0001', outcome: 'declined' })).error, 'ALREADY_INVOICED');
  const doc = (await runTool(state, 'invoice_document', { id: made.invoice.id })).data;
  assert.equal(doc.quoteId, 'QT-0001');
});

test('a declined quote cannot be invoiced; an expired one can, and the preview says it expired', async () => {
  const state = createState();
  await runTool(state, 'create_quote', { partyName: 'A', lines: [consulting] });
  await runTool(state, 'mark_quote', { id: 'QT-0001', outcome: 'declined' });
  assert.equal((await runTool(state, 'convert_quote', { id: 'QT-0001' })).error, 'QUOTE_DECLINED');
  await runTool(state, 'create_quote', { partyName: 'B', lines: [consulting], date: shift(-40), validDays: 30 });
  const listed = (await runTool(state, 'list_quotes', {})).data.quotes;
  assert.equal(listed.find((q) => q.id === 'QT-0002').state, 'expired');
  assert.equal(listed.find((q) => q.id === 'QT-0001').state, 'declined');
  assert.equal((await runTool(state, 'list_quotes', { status: 'expired' })).data.quotes.length, 1);
  assert.match(previewOf(state, 'convert_quote', { id: 'QT-0002' }).summary, /The quote expired on /);
  assert.equal((await runTool(state, 'convert_quote', { id: 'QT-0002' })).ok, true);
});

test('the quote document is laid out like an invoice for the PDF', async () => {
  const state = createState();
  await runTool(state, 'create_quote', { partyName: 'ABC Ltd', partyGstin: '27AAACH7409R1Z1', lines: [consulting] });
  const doc = (await runTool(state, 'quote_document', { id: 'qt-0001' })).data;
  assert.equal(doc.kind, 'quote');
  assert.equal(doc.buyer.name, 'ABC Ltd');
  assert.equal(doc.total, 59000);
  assert.equal(doc.status, 'open');
  assert.match(doc.validUntil, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal((await runTool(state, 'quote_document', { id: 'QT-0009' })).error, 'QUOTE_NOT_FOUND');
});

test('chat: a quote by message, then "QT-0001 accepted" and "make QT-0001 an invoice"', async () => {
  const state = createState();
  const held = await chat(state, 'quote ABC Ltd 50000 for consulting GST 18% valid for 15 days');
  assert.equal(held.awaitingConfirmation, true, JSON.stringify(held));
  assert.match(held.preview.summary, /^Quote to ABC Ltd dated .*total ₹59,000\.00\. Valid until /);
  assert.match((await chat(state, 'yes')).reply, /^Quote QT-0001 to ABC Ltd for ₹59,000\.00, valid until .*Nothing was posted/);
  assert.match((await chat(state, 'quote ABC Ltd 50000 for consulting')).reply, /will not guess the GST rate/);
  await chat(state, 'QT-0001 accepted');
  await chat(state, 'yes');
  assert.equal(state.quotes[0].status, 'accepted');
  const convert = await chat(state, 'make QT-0001 an invoice');
  assert.equal(convert.awaitingConfirmation, true, JSON.stringify(convert));
  assert.match((await chat(state, 'yes')).reply, /^Posted INV-0001 to ABC Ltd for ₹59,000\.00 from quote QT-0001\.$/);
});

test('quotes persist, appear in the snapshot reads, and the contracts are strict', async () => {
  const state = createState();
  await runTool(state, 'create_quote', { partyName: 'A', lines: [consulting] });
  const back = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.equal(back.quotes.length, 1);
  assert.equal(back.quoteSeq, 1);
  assert.equal(isRemoteQuery('list_quotes'), true);
  assert.equal(isRemoteQuery('quote_document'), true);
  assert.equal(isRemoteQuery('create_quote'), false);
  assert.equal(validateAssistantToolCall('create_quote', { partyName: 'A', lines: [consulting], validDays: 15 }).ok, true);
  assert.equal(validateAssistantToolCall('mark_quote', { id: 'QT-0001', outcome: 'maybe' }).ok, false);
  assert.equal(validateAssistantToolCall('convert_quote', { id: 'INV-0001' }).ok, false);
});
