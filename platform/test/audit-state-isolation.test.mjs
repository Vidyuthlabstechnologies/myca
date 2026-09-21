import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openSession } from '../src/session.mjs';

const dirs = [];
after(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });

function freshSession() {
  const dir = mkdtempSync(join(tmpdir(), 'myca-isolation-'));
  dirs.push(dir);
  const path = join(dir, 'MyCA', 'state.json');
  return { sess: openSession(path), path };
}

async function activateClient(sess, clientId) {
  assert.equal((await sess.tool('add_client', { clientId, name: `Client ${clientId}`, state: '29' })).ok, true);
  assert.equal((await sess.tool('set_active_client', { clientId })).ok, true);
}

test('H7: approval ids stay unique while a client book is active', async () => {
  const { sess } = freshSession();
  await sess.tool('approval_request', { operationId: 'gst_file_gstr1_evc' });
  await activateClient(sess, 'CL-2');
  const a = await sess.tool('approval_request', { operationId: 'gst_file_gstr1_evc' });
  const b = await sess.tool('approval_request', { operationId: 'einvoice_cancel' });
  assert.notEqual(a.data.approval.approvalId, b.data.approval.approvalId);
  const ids = sess.state.approvals.map((x) => x.approvalId);
  assert.equal(new Set(ids).size, ids.length);
});

test('H7: document ids stay unique and each reads back its own content under a client', async () => {
  const { sess } = freshSession();
  await sess.tool('save_document', { kind: 'k', fileName: 'self.txt', content: 'SELF DOC' });
  await activateClient(sess, 'CL-2');
  const one = await sess.tool('save_document', { kind: 'k', fileName: 'one.txt', content: 'FIRST' });
  const two = await sess.tool('save_document', { kind: 'k', fileName: 'two.txt', content: 'SECOND' });
  assert.notEqual(one.data.documentId, two.data.documentId);
  assert.equal((await sess.tool('get_document', { documentId: one.data.documentId })).data.content, 'FIRST');
  assert.equal((await sess.tool('get_document', { documentId: two.data.documentId })).data.content, 'SECOND');
});

test('H7: audit event ids stay unique across client switches', async () => {
  const { sess } = freshSession();
  await activateClient(sess, 'CL-2');
  await sess.tool('approval_request', { operationId: 'gst_file_gstr1_evc' });
  await sess.tool('save_document', { kind: 'k', fileName: 'one.txt', content: 'FIRST' });
  const ids = sess.state.auditEvents.map((e) => e.eventId);
  assert.equal(new Set(ids).size, ids.length);
});

test('H7: integration_connect persists while a client book is active', async () => {
  const { sess, path } = freshSession();
  await activateClient(sess, 'CL-2');
  assert.equal((await sess.tool('integration_connect', { requirementId: 'REQ-CA-006', provider: 'sandbox' })).ok, true);
  assert.equal(sess.state.integrationConnections['REQ-CA-006']?.status, 'connected');
  assert.equal(openSession(path).state.integrationConnections['REQ-CA-006']?.status, 'connected');
});

const INWARD = readFileSync(new URL('../../sprints/sprint-5-filing-assistant/test/fixtures/inward.csv', import.meta.url), 'utf8');

test('H14: a firm attachment never feeds a client\'s return', async () => {
  const { sess } = freshSession();
  await sess.attachFile('inward', 'inward.csv', INWARD);
  await activateClient(sess, 'CL-3');
  const gstr3b = await sess.tool('prepare_gstr3b', {});
  assert.equal(gstr3b.data.itc.netItc, 0);
});

test('H14: a client attachment stays on that client, survives reload, and never reaches SELF', async () => {
  const { sess, path } = freshSession();
  const selfBefore = (await sess.tool('prepare_gstr3b', {})).data.itc.netItc;
  await activateClient(sess, 'CL-2');
  await sess.attachFile('inward', 'inward.csv', INWARD);
  assert.equal((await sess.tool('prepare_gstr3b', {})).data.itc.netItc, 130400);
  await sess.tool('set_active_client', { clientId: 'SELF' });
  assert.equal((await sess.tool('prepare_gstr3b', {})).data.itc.netItc, selfBefore);
  const reopened = openSession(path);
  assert.match(reopened.state.extraBooks['CL-2'].attachments.inward.sha256, /^[a-f0-9]{64}$/);
  assert.equal(reopened.state.extraBooks['CL-2'].files.inward, INWARD);
  assert.equal(reopened.state.attachments.inward, undefined);
});
