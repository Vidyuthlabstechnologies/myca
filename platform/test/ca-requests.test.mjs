import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { propose, confirmPending } from '../src/router.mjs';
import { createInvoice, createPurchase } from '../src/invoice.mjs';
import { bookView } from '../src/book-view.mjs';
import { previewOf } from '../src/chat-confirm.mjs';
import { contextFor } from '../src/ca-requests.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';

function books() {
  const state = createState();
  createInvoice(state, { id: 'INV-0001', date: '2026-09-03', partyName: 'Retail Mart', partyGstin: '27AAACH7409R1Z1', lines: [{ description: 'Cloth', hsn: '5208', qty: 1, rate: 10000, gstRate: 5 }] });
  createPurchase(state, { date: '2026-09-04', partyName: 'Fabric Co', partyGstin: '27AABCT1332L1ZE', supplierInvoiceNo: 'F-101', lines: [{ description: 'Grey', hsn: '5208', qty: 1, rate: 4000, gstRate: 5 }] });
  return state;
}

test('the engine attaches the facts for each kind of subject, and refuses what is not in the books', async () => {
  const state = books();
  const invoice = contextFor(state, { kind: 'invoice', id: 'inv-0001' });
  assert.equal(invoice.title, 'Invoice INV-0001 to Retail Mart');
  assert.ok(invoice.facts.some((fact) => fact.includes('total ₹10,500.00')));
  assert.ok(invoice.facts.some((fact) => fact.startsWith('Line: Cloth, HSN 5208, GST 5%')));
  assert.equal(contextFor(state, { kind: 'bill', id: 'BILL-0001' }).title, 'Bill F-101 from Fabric Co');
  const period = contextFor(state, { kind: 'period', period: '2026-09' });
  assert.equal(period.title, 'GST for 2026-09');
  assert.match(period.facts[0], /tax on sales ₹500\.00/);
  await runTool(state, 'post_expense', { narration: 'Shop rent', amount: 1000, date: '2026-09-05' });
  assert.match(contextFor(state, { kind: 'expense', id: 'EXP-0001' }).facts[0], /under Rent/);
  assert.equal(contextFor(state, { kind: 'invoice', id: 'INV-0009' }).error, 'SUBJECT_NOT_FOUND');
  assert.equal(contextFor(state, { kind: 'payroll' }).error, 'UNKNOWN_SUBJECT');
  assert.deepEqual(contextFor(state, { kind: 'other' }).facts, []);
});

test('the owner asks, the accountant answers, and the thread records who said what', async () => {
  const root = books();
  const owner = bookView(root, root, { actor: { userId: 'u-owner', role: 'admin' } });
  const ca = bookView(root, root, { actor: { userId: 'u-ca', role: 'partner' } });
  const asked = await runTool(owner, 'ask_ca', { subject: { kind: 'invoice', id: 'INV-0001' }, note: 'Should this be IGST? Goods went to Gujarat.' });
  assert.equal(asked.ok, true, JSON.stringify(asked));
  assert.equal(asked.request.id, 'ASK-0001');
  assert.equal(asked.request.askedBy, 'u-owner');
  assert.equal(asked.request.status, 'open');
  const answered = await runTool(ca, 'reply_ca', { id: 'ASK-0001', text: 'The place of supply is where goods are delivered; raise a credit note and re-invoice with IGST.' });
  assert.equal(answered.request.status, 'answered');
  assert.deepEqual(answered.request.messages.map((m) => [m.by, m.role]), [['u-owner', 'admin'], ['u-ca', 'partner']]);
  const followUp = await runTool(owner, 'reply_ca', { id: 'ASK-0001', text: 'Thanks, will do.' });
  assert.equal(followUp.request.status, 'open', 'the asker replying puts it back with the CA');
  const list = (await runTool(owner, 'list_ca_requests', {})).data;
  assert.equal(list.requests.length, 1);
  assert.equal(list.waitingOnCa, 1);
  assert.match(list.requests[0].text, /^Nalanda Textiles LLP: Invoice INV-0001 to Retail Mart\n- Dated 2026-09-03/);
  assert.match(list.requests[0].text, /: Thanks, will do\.$/);
});

test('only the asker or the owner closes a question; closed questions take no replies', async () => {
  const root = books();
  const staff = bookView(root, root, { actor: { userId: 'u-staff', role: 'staff' } });
  const ca = bookView(root, root, { actor: { userId: 'u-ca', role: 'partner' } });
  const owner = bookView(root, root, { actor: { userId: 'u-owner', role: 'admin' } });
  await runTool(staff, 'ask_ca', { subject: { kind: 'period', period: '2026-09' }, note: 'Is September right?' });
  assert.equal((await runTool(ca, 'close_ca', { id: 'ASK-0001' })).error, 'NOT_YOURS_TO_CLOSE');
  assert.equal((await runTool(owner, 'close_ca', { id: 'ASK-0001' })).ok, true);
  assert.equal((await runTool(staff, 'reply_ca', { id: 'ASK-0001', text: 'x' })).error, 'REQUEST_CLOSED');
  assert.equal((await runTool(owner, 'close_ca', { id: 'ASK-0001' })).error, 'REQUEST_CLOSED');
  assert.equal((await runTool(owner, 'list_ca_requests', {})).data.requests.length, 0);
  assert.equal((await runTool(owner, 'list_ca_requests', { status: 'closed' })).data.requests[0].closedBy, 'u-owner');
});

test('asking is previewed with what will be attached, posts nothing to the ledger, and persists', async () => {
  const state = books();
  const before = state.ledger.transfers.length;
  const preview = previewOf(state, 'ask_ca', { subject: { kind: 'invoice', id: 'INV-0001' }, note: 'Is the HSN right?' });
  assert.deepEqual(preview.blockers, []);
  assert.equal(preview.summary, 'Ask your CA about Invoice INV-0001 to Retail Mart: "Is the HSN right?"');
  assert.match(preview.effects[0], /^MyCA attaches: Dated 2026-09-03/);
  assert.deepEqual(previewOf(state, 'ask_ca', { subject: { kind: 'invoice', id: 'INV-0001' }, note: '  ' }).blockers, ['Write what you want to ask.']);
  const held = await propose(state, 'ask_ca', { subject: { kind: 'invoice', id: 'INV-0001' }, note: 'Is the HSN right?' });
  assert.equal(held.awaitingConfirmation, true, JSON.stringify(held));
  const done = await confirmPending(state, held.preview.token);
  assert.match(done.reply, /^Sent to your CA in MyCA \(ASK-0001\)/);
  assert.equal(state.ledger.transfers.length, before);
  const back = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.equal(back.caRequests.length, 1);
  assert.equal(back.caRequestSeq, 1);
});

test('contracts are strict and the list is a remote read', () => {
  assert.equal(validateAssistantToolCall('ask_ca', { subject: { kind: 'invoice', id: 'INV-0001' }, note: 'x' }).ok, true);
  assert.equal(validateAssistantToolCall('ask_ca', { subject: { kind: 'payroll' }, note: 'x' }).ok, false);
  assert.equal(validateAssistantToolCall('ask_ca', { subject: { kind: 'invoice', extra: 1 }, note: 'x' }).ok, false);
  assert.equal(validateAssistantToolCall('ask_ca', { subject: { kind: 'other' } }).ok, false);
  assert.equal(validateAssistantToolCall('reply_ca', { id: 'INV-0001', text: 'x' }).ok, false);
  assert.equal(isRemoteQuery('list_ca_requests'), true);
  assert.equal(isRemoteQuery('ask_ca'), false);
});
