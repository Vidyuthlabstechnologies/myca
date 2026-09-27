import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { createInvoice } from '../src/invoice.mjs';
import { registerClient, setActiveClient } from '../src/ca-api.mjs';
import { getBook } from '../src/books.mjs';
import { refreshExceptions, listExceptions, decideException, summarise } from '../src/exceptions.mjs';
import { bookView } from '../src/book-view.mjs';

const fixture = (name) => readFileSync(fileURLToPath(new URL(`../../sprints/sprint-3-gst-recon/test/fixtures/${name}`, import.meta.url)), 'utf8');
const AS_OF = '2026-09-27';

function quietBooks() {
  const state = createState();
  state.invoices = [];
  state.purchases = [];
  return state;
}

test('queue: an invoice GSTR-1 cannot report becomes an exception carrying its value', () => {
  const state = quietBooks();
  createInvoice(state, {
    id: 'INV-BAD', date: '2026-08-20', partyName: 'Auto Parts Co', partyGstin: '12ABCPM1634M1ZV',
    lines: [{ description: 'Oil', hsn: '2710', qty: 1, rate: 120000, gstRate: 28 }],
  });
  refreshExceptions(state, {}, { clientId: 'SELF' });
  const rows = listExceptions(state);
  const held = rows.find((r) => r.code === 'RATE_NOT_IN_FORCE');
  assert.ok(held, JSON.stringify(rows.map((r) => r.code)));
  assert.equal(held.severity, 'high');
  assert.deepEqual(held.evidence.invoiceIds, ['INV-BAD']);
  assert.ok(held.moneyAtRisk > 0, 'the invoice value is at risk');
  assert.match(held.why, /28%/);
});

test('queue: refreshing twice keeps one record, and fixing the cause resolves it', () => {
  const state = quietBooks();
  createInvoice(state, {
    id: 'INV-BAD', date: '2026-08-20', partyName: 'Auto Parts Co', partyGstin: '12ABCPM1634M1ZV',
    lines: [{ description: 'Oil', hsn: '2710', qty: 1, rate: 120000, gstRate: 28 }],
  });
  refreshExceptions(state, {}, { clientId: 'SELF' });
  const first = listExceptions(state).find((r) => r.code === 'RATE_NOT_IN_FORCE');
  const second = refreshExceptions(state, {}, { clientId: 'SELF' });
  assert.equal(second.added, 0, 'the same finding is not raised twice');
  assert.equal(listExceptions(state).filter((r) => r.code === 'RATE_NOT_IN_FORCE').length, 1);
  assert.equal(listExceptions(state)[0].id, first.id);

  state.invoices = [];
  const third = refreshExceptions(state, {}, { clientId: 'SELF' });
  assert.equal(third.autoResolved >= 1, true);
  assert.equal(listExceptions(state).length, 0, 'nothing open once the cause is gone');
  const closed = listExceptions(state, { status: 'all' })[0];
  assert.equal(closed.status, 'resolved');
  assert.equal(closed.resolution, 'no_longer_detected');
});

test('queue: an overdue return is raised, and a return due next week is medium', () => {
  const state = quietBooks();
  refreshExceptions(state, {
    deadlines: [
      { clientId: 'SELF', returnType: 'GSTR-3B', period: '2026-08', dueDate: '2026-09-20', daysUntil: -7, level: 'overdue' },
      { clientId: 'SELF', returnType: 'GSTR-1', period: '2026-09', dueDate: '2026-10-11', daysUntil: 4, level: 'on_track' },
      { clientId: 'SELF', returnType: 'ITR', period: 'FY 2025-26', dueDate: '2026-12-31', daysUntil: 95, level: 'on_track' },
    ],
  }, { clientId: 'SELF' });
  const rows = listExceptions(state);
  assert.deepEqual(rows.map((r) => [r.code, r.severity]), [['RETURN_OVERDUE', 'high'], ['RETURN_DUE_SOON', 'medium']]);
});

test('queue: reconciliation findings arrive with the rule that produced them and the money', () => {
  const state = quietBooks();
  const recon = {
    itcAvailability: { blocked: [{ code: 'NOT_IN_2B', section: 'Section 16(2)(aa)', reason: 'Invoice absent from GSTR-2B', blockedCredit: 2400, purchase: { invoiceNo: 'INV-1003', gstin: '27AABCU9603R1ZN', supplierName: 'ABC' } }] },
    rule37A: { reverse: [{ purchase: { invoiceNo: 'INV-1001', gstin: '27AABCU9603R1ZN' }, period: '2025-04', supplierBy: '2026-09-30', reverseBy: '2026-11-30', reversalItc: 12000, rulesUsed: ['gst.rule37a.deadlines@2026-09-30'] }] },
    match: { unmatched: { inBooksNotIn2B: [], creditNotesIn2BNotInBooks: [], creditNotesInBooksNotIn2B: [] }, matched: [], creditNotes: [] },
  };
  refreshExceptions(state, { reconcile: recon }, { clientId: 'SELF' });
  const rows = listExceptions(state);
  const blocked = rows.find((r) => r.code === 'NOT_IN_2B');
  const reversal = rows.find((r) => r.code === 'RULE_37A_REVERSAL');
  assert.equal(blocked.moneyAtRisk, 2400);
  assert.match(blocked.why, /16\(2\)\(aa\)/);
  assert.equal(reversal.moneyAtRisk, 12000);
  assert.deepEqual(reversal.ruleIds, ['gst.rule37a.deadlines@2026-09-30']);
  assert.match(reversal.title, /by 2026-11-30/);
  assert.equal(summarise(rows).moneyAtRisk, 14400);
});

test('queue: an import that held a row back shows up as work to do', async () => {
  const state = quietBooks();
  const csv = [
    'Date,Voucher Type,Voucher No,Particulars,Amount,GSTIN,Narration',
    '01-08-2026,Sales,7001,Apna Retail,1180,27AAACH7409R1Z1,No rate given',
  ].join('\n');
  const imported = await runTool(state, 'import_tally', { csv });
  assert.equal(imported.data.ledger.posted, 0);
  refreshExceptions(state, {}, { clientId: 'SELF' });
  const held = listExceptions(state).find((r) => r.source === 'import');
  assert.ok(held, 'the held-back voucher is queued');
  assert.equal(held.code, 'GST_RATE_UNKNOWN');
  assert.match(held.why, /Nothing was guessed/);
});

test('queue: broken books are critical and rank above everything else', () => {
  const state = quietBooks();
  createInvoice(state, { id: 'INV-OK', date: '2026-08-02', partyName: 'Apna', partyGstin: '27AABCT1332L1ZE', lines: [{ description: 'F', hsn: '5208', qty: 1, rate: 1000, gstRate: 5 }] });
  state.ledger.transfers[0].amount = 999n;
  refreshExceptions(state, {
    deadlines: [{ clientId: 'SELF', returnType: 'GSTR-1', period: '2026-08', dueDate: '2026-09-11', daysUntil: -16, level: 'overdue' }],
  }, { clientId: 'SELF' });
  const rows = listExceptions(state);
  assert.equal(rows[0].severity, 'critical');
  assert.match(rows[0].code, /BOOKS_NOT_TIED|LEDGER_CHAIN_BROKEN/);
});

test('decide: waiving needs a reason, records who and why, and leaves the open queue', () => {
  const state = quietBooks();
  refreshExceptions(state, {
    deadlines: [{ clientId: 'SELF', returnType: 'GSTR-9', period: 'FY 2025-26', dueDate: '2026-09-20', daysUntil: -7, level: 'overdue' }],
  }, { clientId: 'SELF' });
  const target = listExceptions(state)[0];

  assert.equal(decideException(state, state, { id: target.id, decision: 'waive' }).error, 'NOTE_REQUIRED');
  assert.equal(decideException(state, state, { id: 'EXC-999999', decision: 'resolve', note: 'x' }).error, 'EXCEPTION_NOT_FOUND');
  assert.equal(decideException(state, state, { id: target.id, decision: 'assign' }).error, 'OWNER_REQUIRED');

  const assigned = decideException(state, state, { id: target.id, decision: 'assign', owner: 'Priya', actorId: 'ca' });
  assert.equal(assigned.exception.status, 'in_review');
  assert.equal(listExceptions(state).length, 1, 'in review is still open work');

  const waived = decideException(state, state, { id: target.id, decision: 'waive', note: 'Turnover below the GSTR-9 threshold; confirmed with the client.', actorId: 'ca-2' });
  assert.equal(waived.exception.status, 'waived');
  assert.equal(listExceptions(state).length, 0);
  assert.equal(listExceptions(state, { status: 'waived' }).length, 1);

  const events = state.auditEvents.filter((e) => e.action.startsWith('exceptions.'));
  assert.deepEqual(events.map((e) => e.action), ['exceptions.assign', 'exceptions.waive']);
  assert.equal(events[1].actorId, 'ca-2');
  assert.match(events[1].metadata.note, /Turnover below/);
  assert.equal(events[1].metadata.from, 'in_review');
  assert.equal(events[1].metadata.to, 'waived');
});

test('decide: a waived exception stays waived while it is still detected, and can be reopened', () => {
  const state = quietBooks();
  const deadlines = [{ clientId: 'SELF', returnType: 'GSTR-9', period: 'FY 2025-26', dueDate: '2026-09-20', daysUntil: -7, level: 'overdue' }];
  refreshExceptions(state, { deadlines }, { clientId: 'SELF' });
  const target = listExceptions(state)[0];
  decideException(state, state, { id: target.id, decision: 'waive', note: 'Not applicable this year.' });
  refreshExceptions(state, { deadlines }, { clientId: 'SELF' });
  assert.equal(listExceptions(state).length, 0, 'a waiver is not undone by a refresh');
  decideException(state, state, { id: target.id, decision: 'reopen', note: 'Client corrected the turnover.' });
  assert.equal(listExceptions(state).length, 1);
});

test('tool: the client queue refreshes from the engines and reconciles when a 2B is attached', async () => {
  const state = quietBooks();
  state.files.gstr2b = fixture('gstr2b-b2b.csv');
  state.files.gstr3b = fixture('gstr3b.csv');
  state.files.purchaseRegister = fixture('purchaseregister.csv');
  const out = await runTool(state, 'exceptions', { asOfDate: AS_OF });
  assert.equal(out.ok, true);
  assert.equal(out.data.reconciled, true);
  const codes = out.data.exceptions.map((e) => e.code);
  assert.ok(codes.includes('NOT_IN_2B'), JSON.stringify(codes));
  assert.ok(out.data.summary.moneyAtRisk > 0);
  assert.equal(out.data.clientId, 'SELF');
});

test('tool: the firm queue covers every client book', async () => {
  const state = quietBooks();
  registerClient(state, { clientId: 'CL-9', name: 'Beta Traders', gstin: '29AAACF7856R1ZO', state: '29' });
  const out = await runTool(state, 'exceptions', { scope: 'firm', asOfDate: AS_OF });
  assert.equal(out.ok, true);
  const clients = new Set(out.data.exceptions.map((e) => e.clientId));
  assert.ok(clients.has('CL-9'), 'the client book is included');
  assert.ok(clients.has('SELF'));
});

test('tool: one client’s exceptions never leak into another book', async () => {
  const state = quietBooks();
  registerClient(state, { clientId: 'CL-9', name: 'Beta Traders', gstin: '29AAACF7856R1ZO', state: '29' });
  setActiveClient(state, 'CL-9');
  const clientBook = getBook(state, 'CL-9');
  const view = bookView(state, clientBook);
  await runTool(view, 'exceptions', { asOfDate: AS_OF });
  assert.ok(clientBook.exceptions.length > 0, 'the client book holds its own queue');
  assert.equal((state.exceptions || []).length, 0, 'the firm book is untouched');
});

test('chat: asking what needs attention lists the queue, and waiving previews before it hides anything', async () => {
  const state = quietBooks();
  const listed = await chat(state, 'what needs attention');
  assert.equal(listed.tools[0].name, 'exceptions');
  const id = listed.tools[0].result.data.exceptions[0]?.id;
  assert.ok(id, 'the demo books have something to work on');

  const noReason = await chat(state, `waive ${id}`);
  assert.equal(noReason.blocked, true);
  assert.match(noReason.reply, /Say why/);

  const preview = await chat(state, `waive ${id} because the return was filed on the portal yesterday`);
  assert.equal(preview.awaitingConfirmation, true);
  assert.match(preview.preview.summary, /^Waive/);
  assert.equal(listExceptions(state).some((e) => e.id === id), true, 'still open while the preview waits');

  await chat(state, 'yes');
  assert.equal(listExceptions(state).some((e) => e.id === id), false);
  assert.equal(state.auditEvents.some((e) => e.action === 'exceptions.waive'), true);
});
