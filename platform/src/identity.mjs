import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { normalizeUserId } from './approvals.mjs';

export const USER_ROLES = new Set(['partner', 'reviewer', 'admin', 'staff']);
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000;

export const PIN_FIELDS = Object.freeze(['pinHash', 'pinSalt', 'failedAttempts', 'lockedUntil']);

export function withoutPin(user) {
  if (!user || typeof user !== 'object') return user;
  const copy = { ...user };
  for (const field of PIN_FIELDS) delete copy[field];
  return copy;
}

export function pinRecords(state) {
  const records = {};
  for (const user of state?.firmUsers || []) {
    if (!user?.userId || !user.pinHash || !user.pinSalt) continue;
    records[normalizeUserId(user.userId)] = {
      pinHash: user.pinHash,
      pinSalt: user.pinSalt,
      failedAttempts: Number(user.failedAttempts) || 0,
      lockedUntil: Number(user.lockedUntil) || 0,
    };
  }
  return records;
}

export function applyPinRecords(state, records) {
  if (!records || typeof records !== 'object') return state;
  for (const user of state?.firmUsers || []) {
    const key = normalizeUserId(user?.userId);
    if (!Object.hasOwn(records, key)) continue;
    const record = records[key];
    if (typeof record?.pinHash !== 'string' || typeof record?.pinSalt !== 'string') continue;
    user.pinHash = record.pinHash;
    user.pinSalt = record.pinSalt;
    user.failedAttempts = Number(record.failedAttempts) || 0;
    user.lockedUntil = Number(record.lockedUntil) || 0;
  }
  return state;
}

export function hashPin(pin, salt) {
  const cleanPin = String(pin ?? '');
  const cleanSalt = String(salt ?? '');
  return scryptSync(cleanPin, cleanSalt, 32).toString('hex');
}

export function createPinRecord(pin) {
  const salt = randomBytes(16).toString('hex');
  const hash = hashPin(pin, salt);
  return { pinHash: hash, pinSalt: salt, failedAttempts: 0, lockedUntil: 0 };
}

const defaultPinRecords = new Map();

// The default PIN is public knowledge, so deriving it afresh for every user and every
// load adds a key derivation to each request and no secrecy. One record per process.
function defaultPinRecord(pin) {
  const key = String(pin ?? '');
  if (!defaultPinRecords.has(key)) defaultPinRecords.set(key, Object.freeze(createPinRecord(key)));
  return { ...defaultPinRecords.get(key) };
}

function createUserProfile(spec = {}) {
  const userId = String(spec.userId || spec.id || '').trim().toUpperCase() || 'USR-ADMIN';
  const role = String(spec.role || 'staff').toLowerCase();
  const validRole = USER_ROLES.has(role) ? role : 'staff';
  return {
    userId,
    name: String(spec.name || userId),
    role: validRole,
    clientIds: Array.isArray(spec.clientIds) ? [...spec.clientIds] : ['SELF'],
  };
}

export function createUser(spec = {}, pin = '1234') {
  return { ...createUserProfile(spec), ...createPinRecord(pin) };
}

export function isUserLocked(user, now = Date.now()) {
  return Number(user?.lockedUntil || 0) > now;
}

export function verifyUserPin(user, pin, now = Date.now()) {
  if (!user || typeof user !== 'object') return { ok: false, error: 'USER_NOT_FOUND' };
  if (isUserLocked(user, now)) {
    const remainingSeconds = Math.ceil((user.lockedUntil - now) / 1000);
    return { ok: false, error: 'USER_LOCKED_OUT', remainingSeconds };
  }
  if (!user.pinHash || !user.pinSalt) {
    return { ok: false, error: 'PIN_NOT_SET' };
  }
  const attemptHash = Buffer.from(hashPin(pin, user.pinSalt), 'hex');
  const actualHash = Buffer.from(user.pinHash, 'hex');
  const match = attemptHash.length === actualHash.length && timingSafeEqual(attemptHash, actualHash);
  if (!match) {
    user.failedAttempts = (Number(user.failedAttempts) || 0) + 1;
    if (user.failedAttempts >= LOCKOUT_THRESHOLD) {
      user.lockedUntil = now + LOCKOUT_DURATION_MS;
      user.failedAttempts = 0;
      return { ok: false, error: 'USER_LOCKED_OUT', remainingSeconds: Math.ceil(LOCKOUT_DURATION_MS / 1000) };
    }
    return { ok: false, error: 'INVALID_PIN', attemptsRemaining: LOCKOUT_THRESHOLD - user.failedAttempts };
  }
  user.failedAttempts = 0;
  user.lockedUntil = 0;
  return { ok: true, user: { userId: user.userId, name: user.name, role: user.role, clientIds: user.clientIds } };
}

export function sanitizeUser(user) {
  if (!user) return null;
  return {
    userId: user.userId,
    name: user.name,
    role: user.role,
    clientIds: user.clientIds || [],
    hasPin: Boolean(user.pinHash),
    locked: isUserLocked(user),
  };
}

export function ensureDefaultAdmin(state, defaultPin = '1234') {
  state.firmUsers = Array.isArray(state.firmUsers) ? state.firmUsers : [];
  if (state.firmUsers.length === 0) {
    state.firmUsers.push({
      ...createUserProfile({ userId: 'USR-ADMIN', name: 'Firm Admin', role: 'admin', clientIds: ['SELF'] }),
      ...defaultPinRecord(defaultPin),
    });
  } else {
    for (const u of state.firmUsers) {
      if (!u.pinHash || !u.pinSalt) {
        Object.assign(u, defaultPinRecord(defaultPin));
      }
    }
  }
  return state.firmUsers;
}

export function findUser(state, userId) {
  const norm = normalizeUserId(userId);
  return (state.firmUsers || []).find((u) => normalizeUserId(u.userId) === norm);
}

export function listUsers(state) {
  ensureDefaultAdmin(state);
  return (state.firmUsers || []).map(sanitizeUser);
}

export function addUser(state, spec = {}, pin = '1234') {
  ensureDefaultAdmin(state);
  const userId = String(spec.userId || spec.id || '').trim().toUpperCase();
  if (!userId) return { ok: false, error: 'USER_ID_REQUIRED' };
  if (findUser(state, userId)) return { ok: false, error: 'USER_EXISTS' };
  const user = createUser(spec, pin);
  state.firmUsers.push(user);
  return { ok: true, user: sanitizeUser(user) };
}

export function changePin(state, userId, oldPin, newPin) {
  const user = findUser(state, userId);
  if (!user) return { ok: false, error: 'USER_NOT_FOUND' };
  const verified = verifyUserPin(user, oldPin);
  if (!verified.ok) return verified;
  const nextPin = String(newPin || '').trim();
  if (nextPin.length < 4) return { ok: false, error: 'PIN_TOO_SHORT' };
  Object.assign(user, createPinRecord(nextPin));
  return { ok: true, userId: user.userId };
}
