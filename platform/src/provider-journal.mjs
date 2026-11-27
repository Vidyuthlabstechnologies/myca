import { AsyncLocalStorage } from 'node:async_hooks';

const store = new AsyncLocalStorage();

export function withProviderJournal(journal, fn) {
  return store.run({ journal, seq: 0 }, fn);
}

// The text a retry of the same call must match. It is compared for equality and kept only inside
// the sealed journal entry, never hashed or stored in the clear. One-time codes and credentials
// are left out: a filing retried with a fresh code is the same filing and must replay.
const NOT_PART_OF_THE_CALL = /^(otp|evc|pin|pass(word|code)?|secret|token)$/i;

function withoutCodes(value) {
  if (Array.isArray(value)) return value.map(withoutCodes);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !NOT_PART_OF_THE_CALL.test(key)).map(([key, inner]) => [key, withoutCodes(inner)]));
  return value;
}

function canonical(part) {
  const text = String(part ?? '');
  try {
    return JSON.stringify(withoutCodes(JSON.parse(text)));
  } catch {
    return text;
  }
}

export function providerFingerprint(...parts) {
  return parts.map(canonical).join('\u0000');
}

export async function journaledCall(fingerprint, call) {
  const scope = store.getStore();
  if (!scope) return call();
  scope.seq += 1;
  const seq = scope.seq;
  const recorded = scope.journal.lookup(seq, fingerprint);
  if (recorded) return recorded;
  const result = await call();
  if (result && result.ok === true) await scope.journal.record(seq, fingerprint, result);
  return result;
}
