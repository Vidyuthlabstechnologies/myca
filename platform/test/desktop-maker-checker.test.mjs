import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openSession } from '../src/session.mjs';

const dirs = [];
after(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });

function freshSession() {
  const dir = mkdtempSync(join(tmpdir(), 'myca-maker-checker-'));
  dirs.push(dir);
  return openSession(join(dir, 'MyCA', 'state.json'));
}

test('on the desktop an approval needs a signed-in user, and who asked and who decided come from the sign-in, never the request', async () => {
  const sess = freshSession();
  const anonymous = await sess.tool('approval_request', { operationId: 'gst_file_gstr1_evc', requestedBy: 'anyone' });
  assert.equal(anonymous.error, 'SIGN_IN_REQUIRED');
  assert.equal((await sess.signIn('USR-ADMIN', '1234')).ok, true);
  const asked = await sess.tool('approval_request', { operationId: 'gst_file_gstr1_evc', requestedBy: 'someone-else' });
  assert.equal(asked.ok, true);
  assert.equal(asked.data.approval.requestedBy, 'usr-admin');
  const self = await sess.tool('approval_decide', { approvalId: asked.data.approval.approvalId, decision: 'approve', decidedBy: 'madeup', role: 'partner' });
  assert.equal(self.error, 'MAKER_CHECKER_VIOLATION');
  const added = await sess.caApi('POST', '/api/ca/users', { userId: 'USR-PARTNER', name: 'Partner', role: 'partner', pin: '4321' });
  assert.equal(added.ok, true);
  await sess.signOut();
  const noDecider = await sess.tool('approval_decide', { approvalId: asked.data.approval.approvalId, decision: 'approve', decidedBy: 'madeup', role: 'partner' });
  assert.equal(noDecider.error, 'SIGN_IN_REQUIRED');
  assert.equal((await sess.signIn('USR-PARTNER', '4321')).ok, true);
  const decided = await sess.tool('approval_decide', { approvalId: asked.data.approval.approvalId, decision: 'approve', decidedBy: 'madeup', role: 'admin' });
  assert.equal(decided.ok, true);
  assert.equal(decided.data.approval.decidedBy, 'usr-partner');
  assert.equal(decided.data.approval.decidedRole, 'partner');
});

test('adding a desktop user needs a signed-in admin or partner', async () => {
  const sess = freshSession();
  const out = await sess.caApi('POST', '/api/ca/users', { userId: 'USR-X', name: 'X', role: 'partner', pin: '9999' });
  assert.equal(out.error, 'ADMIN_SIGN_IN_REQUIRED');
});

test('a wrong PIN is remembered across a restart, so the lockout cannot be reset by reopening the books', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'myca-pin-'));
  dirs.push(dir);
  const path = join(dir, 'MyCA', 'state.json');
  const first = openSession(path);
  assert.equal((await first.signIn('USR-ADMIN', '0000')).error, 'INVALID_PIN');
  const reopened = openSession(path);
  const user = reopened.state.firmUsers.find((u) => u.userId === 'USR-ADMIN');
  assert.equal(user.failedAttempts, 1);
});
