import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createState } from '../src/store.mjs';
import { openSession } from '../src/session.mjs';
import { handleCaApi } from '../src/ca-api.mjs';
import {
  hashPin,
  createPinRecord,
  createUser,
  verifyUserPin,
  isUserLocked,
  sanitizeUser,
  ensureDefaultAdmin,
  findUser,
  listUsers,
  addUser,
  changePin,
} from '../src/identity.mjs';

test('identity: hashPin produces consistent scrypt digests for same salt', () => {
  const salt = 'a'.repeat(32);
  const hash1 = hashPin('1234', salt);
  const hash2 = hashPin('1234', salt);
  assert.equal(hash1, hash2);
  assert.equal(hash1.length, 64);
  assert.notEqual(hashPin('4321', salt), hash1);
});

test('identity: verifyUserPin succeeds on correct PIN and fails on incorrect PIN', () => {
  const user = createUser({ userId: 'USR-TEST', name: 'Tester', role: 'partner' }, '9876');
  assert.equal(user.userId, 'USR-TEST');
  assert.equal(user.role, 'partner');
  assert.ok(user.pinHash);
  assert.ok(user.pinSalt);

  const okResult = verifyUserPin(user, '9876');
  assert.equal(okResult.ok, true);
  assert.equal(okResult.user.userId, 'USR-TEST');

  const badResult = verifyUserPin(user, '0000');
  assert.equal(badResult.ok, false);
  assert.equal(badResult.error, 'INVALID_PIN');
  assert.equal(badResult.attemptsRemaining, 4);
});

test('identity: 5 consecutive failed attempts trigger 5-minute lockout', () => {
  const user = createUser({ userId: 'USR-LOCK', name: 'Lockout Test', role: 'staff' }, '1111');
  const now = Date.now();

  for (let i = 1; i <= 4; i++) {
    const res = verifyUserPin(user, 'wrong', now);
    assert.equal(res.ok, false);
    assert.equal(res.attemptsRemaining, 5 - i);
  }

  const fifth = verifyUserPin(user, 'wrong', now);
  assert.equal(fifth.ok, false);
  assert.equal(fifth.error, 'USER_LOCKED_OUT');
  assert.equal(fifth.remainingSeconds, 300);
  assert.equal(isUserLocked(user, now), true);

  const lockedAttempt = verifyUserPin(user, '1111', now + 1000);
  assert.equal(lockedAttempt.ok, false);
  assert.equal(lockedAttempt.error, 'USER_LOCKED_OUT');

  const afterLockout = verifyUserPin(user, '1111', now + 301000);
  assert.equal(afterLockout.ok, true);
});

test('identity: sanitizeUser never exposes pinHash or pinSalt', () => {
  const user = createUser({ userId: 'USR-SEC', name: 'Secret Test', role: 'reviewer' }, '5555');
  const sanitized = sanitizeUser(user);
  assert.equal(sanitized.userId, 'USR-SEC');
  assert.equal(sanitized.name, 'Secret Test');
  assert.equal(sanitized.role, 'reviewer');
  assert.equal(sanitized.hasPin, true);
  assert.equal('pinHash' in sanitized, false);
  assert.equal('pinSalt' in sanitized, false);
});

test('identity: listUsers, addUser, and changePin operate on state', () => {
  const state = createState();
  const initial = listUsers(state);
  assert.equal(initial.length, 1);
  assert.equal(initial[0].userId, 'USR-ADMIN');

  const added = addUser(state, { userId: 'USR-STAFF1', name: 'Staff One', role: 'staff' }, '4321');
  assert.equal(added.ok, true);
  assert.equal(added.user.userId, 'USR-STAFF1');

  const duplicate = addUser(state, { userId: 'USR-STAFF1' }, '1111');
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.error, 'USER_EXISTS');

  const changed = changePin(state, 'USR-STAFF1', '4321', '8888');
  assert.equal(changed.ok, true);

  const verifyOld = verifyUserPin(findUser(state, 'USR-STAFF1'), '4321');
  assert.equal(verifyOld.ok, false);

  const verifyNew = verifyUserPin(findUser(state, 'USR-STAFF1'), '8888');
  assert.equal(verifyNew.ok, true);
});

test('identity: caApi routes support sanitized user list, user creation, and PIN verification', () => {
  const state = createState();
  const list = handleCaApi(state, 'GET', '/api/ca/users');
  assert.equal(list.ok, true);
  assert.equal(list.data.users[0].userId, 'USR-ADMIN');
  assert.equal('pinHash' in list.data.users[0], false);

  const created = handleCaApi(state, 'POST', '/api/ca/users', {
    userId: 'USR-NEW',
    name: 'New Person',
    role: 'staff',
    pin: '2468',
  });
  assert.equal(created.ok, true);
  assert.equal(created.data.userId, 'USR-NEW');

  const verify = handleCaApi(state, 'POST', '/api/ca/users/verify-pin', {
    userId: 'USR-NEW',
    pin: '2468',
  });
  assert.equal(verify.ok, true);
  assert.equal(verify.data.userId, 'USR-NEW');

  const verifyFail = handleCaApi(state, 'POST', '/api/ca/users/verify-pin', {
    userId: 'USR-NEW',
    pin: '9999',
  });
  assert.equal(verifyFail.ok, false);
  assert.equal(verifyFail.error, 'INVALID_PIN');
});

test('identity: session signIn attributes audit events to the signed-in user', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'myca-ident-'));
  const dataPath = join(dir, 'state.json');
  try {
    const session = openSession(dataPath);
    assert.equal(session.activeUser(), null);

    const loginFail = await session.signIn('USR-ADMIN', '0000');
    assert.equal(loginFail.ok, false);

    const loginOk = await session.signIn('USR-ADMIN', '1234');
    assert.equal(loginOk.ok, true);
    assert.equal(session.activeUser()?.userId, 'USR-ADMIN');

    await session.tool('list_invoices', {});
    const lastAudit = session.state.auditEvents[session.state.auditEvents.length - 1];
    assert.equal(lastAudit.actorId, 'USR-ADMIN');

    await session.signOut();
    assert.equal(session.activeUser(), null);

    await session.tool('list_invoices', {});
    const anonAudit = session.state.auditEvents[session.state.auditEvents.length - 1];
    assert.equal(anonAudit.actorId, 'renderer');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
