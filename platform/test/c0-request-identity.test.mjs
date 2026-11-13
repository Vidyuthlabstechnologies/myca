import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createState } from '../src/store.mjs';
import { openSession } from '../src/session.mjs';
import { bookView } from '../src/book-view.mjs';
import { runTool } from '../src/tools.mjs';
import { decideApproval } from '../src/approvals.mjs';

const OWNER = { userId: 'USR-OWNER', role: 'admin', name: 'Asha' };
const STAFF = { userId: 'USR-STAFF', role: 'staff', name: 'Ravi' };
const PARTNER = { userId: 'USR-PARTNER', role: 'partner', name: 'Meera' };
const SALE = {
  partyName: 'Kiran Stores',
  partyGstin: '',
  lines: [{ description: 'Supply', qty: 1, rate: 8000, gstRate: 18 }],
};
const REQUEST = { operationId: 'gstr1_file', requirementId: 'REQ-CA-003', params: { period: '092026' } };

function session() {
  return openSession(join(mkdtempSync(join(tmpdir(), 'myca-actor-')), 'state.json'));
}

function lastEvent(s, action) {
  return s.state.auditEvents.filter((event) => event.action === action).at(-1);
}

test('each request is audited under the actor it was made with', async () => {
  const s = session();
  const { preview } = await s.propose('create_invoice', SALE, { actor: STAFF });
  await s.confirm(preview.token, { actor: OWNER });
  await s.query('gst_payable', {}, { actor: STAFF });
  assert.equal(lastEvent(s, 'chat.propose').actorId, 'USR-STAFF');
  assert.equal(lastEvent(s, 'chat.confirm').actorId, 'USR-OWNER');
  assert.equal(lastEvent(s, 'tool.gst_payable').actorId, 'USR-STAFF');
});

test('two actors interleaved on one session never borrow each other identity', async () => {
  const s = session();
  await Promise.all([
    s.query('gst_payable', {}, { actor: OWNER }),
    s.query('deadlines', {}, { actor: STAFF }),
    s.query('gst_payable', {}, { actor: STAFF }),
    s.query('deadlines', {}, { actor: OWNER }),
  ]);
  const seen = s.state.auditEvents.filter((event) => event.action.startsWith('tool.')).slice(-4);
  assert.deepEqual(seen.map((event) => event.actorId), ['USR-OWNER', 'USR-STAFF', 'USR-STAFF', 'USR-OWNER']);
  assert.equal(s.activeUser(), null, 'a per-request actor never becomes the signed-in desktop user');
});

test('a signed-in caller cannot claim to be someone else through the arguments', async () => {
  const state = createState();
  const asStaff = bookView(state, state, { actor: STAFF });
  const out = await runTool(asStaff, 'approval_request', { ...REQUEST, requestedBy: 'USR-PARTNER', role: 'partner' });
  assert.equal(out.ok, true);
  assert.equal(state.approvals.length, 1);
  assert.equal(state.approvals[0].requestedBy, 'usr-staff');
  assert.notEqual(state.approvals[0].requestedBy, 'usr-partner');
});

test('without a session actor the arguments are used as before', async () => {
  const state = createState();
  const out = await runTool(bookView(state, state), 'approval_request', { ...REQUEST, requestedBy: 'USR-PARTNER' });
  assert.equal(out.ok, true);
  assert.equal(state.approvals[0].requestedBy, 'usr-partner');
});

test('the assistant marker is never upgraded to the signed-in user', async () => {
  const state = createState();
  const asOwner = bookView(state, state, { actor: OWNER });
  const out = await runTool(asOwner, 'sandbox_operation', { operationId: 'einvoice_generate', params: { invoiceId: 'INV-0001' }, actorId: 'assistant' });
  assert.equal(out.ok, false);
  assert.equal(out.error, 'ASSISTANT_BLOCKED_FOR_OPERATION');
});

test('a tool the model runs for a signed-in person cannot name another requester or role', async () => {
  const state = createState();
  const asPartner = bookView(state, state, { actor: PARTNER });
  const out = await runTool(asPartner, 'approval_request', { ...REQUEST, requestedBy: 'USR-OWNER', role: 'admin', actorId: 'assistant' });
  assert.equal(out.ok, true);
  assert.equal(state.approvals[0].requestedBy, 'usr-partner');
  assert.equal(state.approvals[0].requestedRole, 'partner');
  const own = decideApproval(state, { approvalId: state.approvals[0].approvalId, decision: 'approve', actor: PARTNER });
  assert.equal(own.ok, false);
  assert.equal(own.error, 'MAKER_CHECKER_VIOLATION');
  const other = decideApproval(state, { approvalId: state.approvals[0].approvalId, decision: 'approve', actor: OWNER });
  assert.equal(other.ok, true);
});

test('the actor on a view is frozen and unreachable for writes', () => {
  const state = createState();
  const view = bookView(state, state, { actor: STAFF });
  assert.equal(view.__actor.userId, 'USR-STAFF');
  assert.throws(() => { view.__actor.role = 'partner'; }, TypeError);
  assert.throws(() => { view.__actor = OWNER; }, /VIEW_WRITE_UNKNOWN_KEY/);
  assert.equal(bookView(state, state).__actor, null);
});
