import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createState, loadState, saveState, serialize, pinVaultPath } from '../src/store.mjs';
import { openSession } from '../src/session.mjs';
import { addUser, changePin, findUser, verifyUserPin } from '../src/identity.mjs';

const SECRET_FIELDS = ['pinHash', 'pinSalt', 'failedAttempts', 'lockedUntil'];

function freshPath() {
  return join(mkdtempSync(join(tmpdir(), 'myca-pins-')), 'state.json');
}

function assertNoPinMaterial(text, where) {
  for (const field of SECRET_FIELDS) assert.equal(text.includes(field), false, `${where} must not contain ${field}`);
}

test('the books file on disk carries no PIN material', () => {
  const path = freshPath();
  const state = createState();
  assert.equal(changePin(state, 'USR-ADMIN', '1234', '4821').ok, true);
  addUser(state, { userId: 'USR-RAVI', name: 'Ravi', role: 'staff' }, '7733');
  saveState(path, state);
  const text = readFileSync(path, 'utf8');
  assertNoPinMaterial(text, 'state.json');
  assert.match(text, /USR-RAVI/);
  assertNoPinMaterial(JSON.stringify(serialize(state)), 'serialize()');
  assert.equal(typeof state.firmUsers[0].pinHash, 'string', 'the open books keep the PIN in memory');
});

test('the vault is encrypted and a PIN survives a save and reload', () => {
  const path = freshPath();
  const state = createState();
  assert.equal(changePin(state, 'USR-ADMIN', '1234', '4821').ok, true);
  saveState(path, state);
  const vault = readFileSync(pinVaultPath(path), 'utf8');
  assert.equal(vault.includes(state.firmUsers[0].pinHash), false);
  assert.equal(vault.includes('USR-ADMIN'), false);
  const loaded = loadState(path);
  assert.equal(verifyUserPin(findUser(loaded, 'USR-ADMIN'), '4821').ok, true);
  assert.equal(verifyUserPin(findUser(loaded, 'USR-ADMIN'), '1234').ok, false);
});

test('a books file written before this change is migrated on the next save', () => {
  const path = freshPath();
  const state = createState();
  assert.equal(changePin(state, 'USR-ADMIN', '1234', '9090').ok, true);
  const legacy = serialize(state);
  legacy.firmUsers = state.firmUsers.map((user) => ({ ...user }));
  writeFileSync(path, JSON.stringify(legacy));
  assert.match(readFileSync(path, 'utf8'), /pinHash/);
  const loaded = loadState(path);
  assert.equal(verifyUserPin(findUser(loaded, 'USR-ADMIN'), '9090').ok, true);
  saveState(path, loaded);
  assertNoPinMaterial(readFileSync(path, 'utf8'), 'migrated state.json');
  assert.equal(verifyUserPin(findUser(loadState(path), 'USR-ADMIN'), '9090').ok, true);
});

test('the vault is rewritten when a PIN changes and left alone otherwise', () => {
  const path = freshPath();
  const state = createState();
  assert.equal(changePin(state, 'USR-ADMIN', '1234', '4821').ok, true);
  saveState(path, state);
  const first = readFileSync(pinVaultPath(path), 'utf8');
  state.company.name = 'Renamed';
  saveState(path, state);
  assert.equal(readFileSync(pinVaultPath(path), 'utf8'), first);
  assert.equal(changePin(state, 'USR-ADMIN', '4821', '5566').ok, true);
  saveState(path, state);
  assert.notEqual(readFileSync(pinVaultPath(path), 'utf8'), first);
  assert.equal(verifyUserPin(findUser(loadState(path), 'USR-ADMIN'), '5566').ok, true);
  assert.ok(statSync(path).size > 0);
});

test('a damaged vault never blocks opening the books', () => {
  const path = freshPath();
  const state = createState();
  assert.equal(changePin(state, 'USR-ADMIN', '1234', '4821').ok, true);
  saveState(path, state);
  writeFileSync(pinVaultPath(path), '{not json');
  const loaded = loadState(path);
  assert.equal(loaded.company.name, state.company.name);
  assert.equal(findUser(loaded, 'USR-ADMIN').name, 'Firm Admin');
});

test('a backup carries no PIN material, and a restore keeps the PINs already on this machine', async () => {
  const path = freshPath();
  const session = openSession(path);
  assert.equal(changePin(session.state, 'USR-ADMIN', '1234', '6602').ok, true);
  session.persist();
  const backup = session.backup();
  assertNoPinMaterial(JSON.stringify(backup), 'backup');

  const tampered = JSON.parse(JSON.stringify(backup));
  tampered.state.firmUsers[0].pinHash = 'a'.repeat(64);
  tampered.state.firmUsers[0].pinSalt = 'b'.repeat(32);
  const restored = await session.restore({ ...tampered, confirm: true });
  assert.equal(restored.ok, true);
  assert.equal((await session.signIn('USR-ADMIN', '6602')).ok, true);
  assert.notEqual(findUser(session.state, 'USR-ADMIN').pinHash, 'a'.repeat(64));
  assertNoPinMaterial(readFileSync(path, 'utf8'), 'state.json after restore');
  assert.equal(existsSync(pinVaultPath(path)), true);
});
