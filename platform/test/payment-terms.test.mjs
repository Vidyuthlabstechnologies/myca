import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { createInvoice, recordReceipt } from '../src/invoice.mjs';
import { localToday } from '../src/dates.mjs';
import { previewOf } from '../src/chat-confirm.mjs';
import { cashForecast } from '../src/cash-forecast.mjs';
import { businessSummary } from '../src/business-summary.mjs';
import { termsLabel, overdueBy, customerTerms } from '../src/payment-terms.mjs';
import { planTermsFromChat, takeInvoiceTerms } from '../src/terms-intent.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';

const TODAY = localToday();
const shift = (days) => {
  const [y, m, d] = TODAY.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};
const line = { description: 'Consulting', hsn: '998311', qty: 1, rate: 50000, gstRate: 18 };

test('a customer\'s terms give every new invoice a due date; an invoice can override them; old invoices keep theirs', async () => {
  const state = createState();
  const before = createInvoice(state, { id: 'INV-0001', date: '2026-09-01', partyName: 'ABC Ltd', partyGstin: '27AAACH7409R1Z1', lines: [line] });
  assert.equal(before.invoice.dueDate, undefined);
  const set = await runTool(state, 'set_payment_terms', { partyName: 'ABC Ltd', days: 30 });
  assert.equal(set.ok, true, JSON.stringify(set));
  assert.equal(set.gstin, '27AAACH7409R1Z1', 'the customer is found and keyed by GSTIN');
  const next = createInvoice(state, { id: 'INV-0002', date: '2026-09-10', partyName: 'abc ltd', partyGstin: '27AAACH7409R1Z1', lines: [line] });
  assert.equal(next.invoice.paymentTermsDays, 30);
  assert.equal(next.invoice.dueDate, '2026-10-10');
  const po = createInvoice(state, { id: 'INV-0003', date: '2026-09-10', partyName: 'ABC Ltd', partyGstin: '27AAACH7409R1Z1', lines: [line], paymentTermsDays: 45 });
  assert.equal(po.invoice.dueDate, '2026-10-25');
  assert.equal(state.invoices[0].dueDate, undefined);
  assert.equal(createInvoice(state, { date: '2026-09-10', partyName: 'ABC Ltd', lines: [line], paymentTermsDays: 400 }).error, 'BAD_TERMS');
  const walkIn = createInvoice(state, { date: '2026-09-10', partyName: 'Walk-in', lines: [line] });
  assert.equal(walkIn.invoice.dueDate, undefined, 'no terms, no due date');
  const doc = (await runTool(state, 'invoice_document', { id: 'INV-0002' })).data;
  assert.equal(doc.dueDate, '2026-10-10');
  assert.equal(doc.paymentTermsDays, 30);
});

test('terms can be set before the first invoice, by name, and show in the preview', async () => {
  const state = createState();
  const preview = previewOf(state, 'set_payment_terms', { partyName: 'New Client', days: 0 });
  assert.equal(preview.summary, 'New Client: Due on receipt.');
  assert.match(preview.effects[0], /no invoice to this customer yet/);
  await runTool(state, 'set_payment_terms', { partyName: 'New Client', days: 15 });
  assert.equal(customerTerms(state, { name: 'new client' }), 15);
  const invoice = previewOf(state, 'create_invoice', { partyName: 'New Client', lines: [line], date: '2026-09-01' });
  assert.match(invoice.summary, /Due 2026-09-16 \(Net 15, New Client's usual terms\)\.$/);
  assert.deepEqual(previewOf(state, 'set_payment_terms', { partyName: 'X', days: -1 }).blockers, ['Terms are a whole number of days from 0 to 365.']);
  assert.deepEqual(previewOf(state, 'set_payment_terms', { days: 10 }).blockers, ['Say which customer.']);
  assert.equal(termsLabel(0), 'Due on receipt');
  assert.equal(termsLabel(45), 'Net 45');
});

test('overdue means past the agreed terms, on the dashboard and in the forecast', () => {
  const state = createState();
  createInvoice(state, { id: 'INV-0001', date: shift(-40), partyName: 'Late Co', lines: [line], paymentTermsDays: 30 });
  createInvoice(state, { id: 'INV-0002', date: shift(-5), partyName: 'On Time Co', lines: [line], paymentTermsDays: 30 });
  assert.equal(overdueBy(state.invoices[0]), 10);
  assert.equal(overdueBy(state.invoices[1]), 0);
  const owed = businessSummary(state, {}).data.owedToYou;
  assert.deepEqual(owed.overdue, { total: 59000, invoices: 1 });
  const d = cashForecast(state, { days: 30, from: TODAY }).data;
  const onTime = d.coming.rows.find((row) => /On Time Co/.test(row.label));
  assert.equal(onTime.date, shift(25), 'without a paying habit the due date is used');
  assert.equal(onTime.basis, 'terms Net 30; no payment history yet');
  assert.ok(d.overdue.rows.some((row) => /Late Co/.test(row.label)));
});

test('a customer\'s paying habit wins over their terms in the forecast, and both are shown', () => {
  const state = createState();
  createInvoice(state, { id: 'INV-0001', date: shift(-80), partyName: 'Slow Co', lines: [line], paymentTermsDays: 30 });
  recordReceipt(state, { invoiceId: 'INV-0001', amount: 59000, date: shift(-35), mode: 'bank' });
  createInvoice(state, { id: 'INV-0002', date: shift(-10), partyName: 'Slow Co', lines: [line], paymentTermsDays: 30 });
  const row = cashForecast(state, { days: 60, from: TODAY }).data.coming.rows.find((r) => r.label.startsWith('INV-0002'));
  assert.equal(row.date, shift(35));
  assert.equal(row.basis, 'Slow Co usually pays in 45 days; terms Net 30');
});

test('chat: terms are set in plain words, and "net 45" on an invoice sets that invoice\'s due date without being read as an amount', async () => {
  assert.deepEqual(planTermsFromChat('Retail Mart pays in 45 days').args, { partyName: 'Retail Mart', days: 45 });
  assert.deepEqual(planTermsFromChat("set Retail Mart's terms to net 60").args, { partyName: 'Retail Mart', days: 60 });
  assert.deepEqual(planTermsFromChat('terms for Kiran Stores: on receipt').args, { partyName: 'Kiran Stores', days: 0 });
  assert.equal(planTermsFromChat('did Retail Mart pay?'), null);
  assert.equal(planTermsFromChat('Retail Mart paid 5000'), null);
  assert.deepEqual(takeInvoiceTerms('invoice ABC 500 GST 18% net 45'), { text: 'invoice ABC 500 GST 18%', days: 45 });
  const state = createState();
  const held = await chat(state, 'Create an invoice for ABC Ltd for Rs. 50,000 for consulting services GST 18% net 45');
  assert.equal(held.awaitingConfirmation, true, JSON.stringify(held));
  assert.match(held.preview.summary, /total ₹59,000\.00\..*Due \d{1,2} [A-Z][a-z]+ \d{4} \(Net 45\)\.$/);
  await chat(state, 'yes');
  assert.equal(state.invoices[0].paymentTermsDays, 45);
  const terms = await chat(state, 'ABC Ltd pays in 30 days');
  assert.equal(terms.awaitingConfirmation, true);
  assert.match((await chat(state, 'yes')).reply, /^Noted\. ABC Ltd: Net 30\./);
});

test('terms persist and the contracts are strict', async () => {
  const state = createState();
  await runTool(state, 'set_payment_terms', { partyName: 'ABC', days: 30 });
  const back = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.equal(customerTerms(back, { name: 'ABC' }), 30);
  assert.equal(validateAssistantToolCall('set_payment_terms', { partyName: 'ABC', days: 30 }).ok, true);
  assert.equal(validateAssistantToolCall('set_payment_terms', { partyName: 'ABC', days: 3.5 }).ok, false);
  assert.equal(validateAssistantToolCall('create_invoice', { partyName: 'A', lines: [line], paymentTermsDays: 45 }).ok, true);
  assert.equal(validateAssistantToolCall('create_invoice', { partyName: 'A', lines: [line], paymentTermsDays: 999 }).ok, false);
});
