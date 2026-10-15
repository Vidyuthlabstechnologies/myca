import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { integrationReadiness } from '../src/integration-contract.mjs';
import { handleCaApi } from '../src/ca-api.mjs';

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Sharma & Co', gstin: '27AABCU9603R1ZN', state: '27' };
  return state;
}

test('a firm asks a client for documents, tracks what arrives, and sees what is overdue; the message is drafted', async () => {
  const state = books();
  await runTool(state, 'add_client', { clientId: 'CL-001', name: 'Beta Traders', gstin: '', state: '29' });
  const asked = await chat(state, 'request from CL-001: bank statement, sales register for 2026-09 by 2026-10-20');
  assert.match(asked.reply, /DRQ-0001: asked Beta Traders for bank statement, sales register for (2026-09|September 2026), by (2026-10-20|20 October 2026)/);
  assert.match(asked.reply, /Dear Beta Traders,/);
  assert.match(asked.reply, /• bank statement/);
  const open = await runTool(state, 'document_requests', { asOf: '2026-10-25' });
  assert.equal(open.ok, true);
  assert.equal(open.data.open, 1);
  assert.deepEqual(open.data.requests[0].outstanding, ['bank statement', 'sales register']);
  const got = await chat(state, 'received bank statement for DRQ-0001');
  assert.match(got.reply, /Still waiting on sales register/);
  const unknown = await runTool(state, 'record_document_received', { id: 'DRQ-0001', item: 'form 16' });
  assert.equal(unknown.error, 'ITEM_NOT_IN_REQUEST');
  const all = await chat(state, 'received everything for DRQ-0001');
  assert.match(all.reply, /DRQ-0001 is complete/);
  assert.equal((await runTool(state, 'document_requests', {})).data.open, 0);
  const noClient = await runTool(state, 'request_documents', { clientId: 'CL-999', items: ['bank statement'] });
  assert.equal(noClient.error, 'CLIENT_NOT_FOUND');
  const copy = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.equal(copy.documentRequests.length, 1);
  assert.equal(copy.documentRequests[0].status, 'complete');
  const viaApi = handleCaApi(state, 'GET', '/api/ca/document-requests', { status: 'all' });
  assert.equal(viaApi.data.requests.length, 1);
  const posted = handleCaApi(state, 'POST', '/api/ca/document-requests', { clientId: 'CL-001', items: ['gstr-2b'], period: '2026-10' });
  assert.equal(posted.ok, true, JSON.stringify(posted));
  assert.equal(posted.request.id, 'DRQ-0002');
});

test('every chat message lands in the eval log with its tool and outcome; a reviewer corrects one; the firm notes are searchable', async () => {
  const state = books();
  await chat(state, 'invoice Kiran Stores 50000 GST 18%');
  await chat(state, 'who owes me?');
  await chat(state, 'blorp the snozzle');
  const log = await runTool(state, 'eval_events', {});
  assert.equal(log.ok, true);
  assert.equal(log.data.total, 3);
  const latest = log.data.events[0];
  assert.equal(latest.input, 'blorp the snozzle');
  assert.equal(typeof latest.toolName, 'string');
  const held = log.data.events.find((e) => e.input.startsWith('invoice Kiran'));
  assert.equal(held.outcome, 'held');
  assert.equal(held.toolName, 'create_invoice');
  const fixed = await runTool(state, 'correct_eval', { id: latest.id, correctTool: 'business_summary', note: 'owner meant the summary' });
  assert.equal(fixed.ok, true, JSON.stringify(fixed));
  assert.equal((await runTool(state, 'eval_events', { status: 'corrected' })).data.events.length, 1);
  const said = await chat(state, 'eval log');
  assert.match(said.reply, /3 messages logged/);
  assert.match(said.reply, /corrected: business_summary/);

  await runTool(state, 'add_reminder', { text: 'Call Beta Traders about the audit file', due: '2099-01-10', assignedTo: 'USR-ADMIN' });
  const mine = await runTool(state, 'list_reminders', { assignedTo: 'usr-admin' });
  assert.equal(mine.data.reminders.length, 1);
  assert.equal(mine.data.reminders[0].assignedTo, 'USR-ADMIN');
  const nobody = await runTool(state, 'add_reminder', { text: 'x', due: '2099-01-10', assignedTo: 'USR-NOBODY' });
  assert.equal(nobody.error, 'USER_NOT_FOUND');
  const found = await chat(state, 'search notes for audit file');
  assert.match(found.reply, /1 note mentions "audit file"/);
  assert.match(found.reply, /reminder REM-0001/);
  const corrections = await runTool(state, 'search_firm_notes', { query: 'snozzle' });
  assert.equal(corrections.data.hits.some((h) => h.kind === 'correction'), true);
  assert.equal((await runTool(state, 'search_firm_notes', { query: 'x' })).error, 'QUERY_TOO_SHORT');

  const readiness = integrationReadiness({});
  const practice = readiness.rows ? readiness.rows : readiness.requirements || [];
  const byId = Object.fromEntries((practice.length ? practice : []).map((r) => [r.id, r]));
  for (const id of ['task_deadline', 'client_chase', 'notifications', 'knowledge_base', 'eval_logs']) {
    assert.equal(byId[id]?.status, 'built-in', `${id} is built in: ${JSON.stringify(Object.keys(readiness))}`);
    assert.equal(byId[id]?.connection?.builtIn, true);
  }
});
