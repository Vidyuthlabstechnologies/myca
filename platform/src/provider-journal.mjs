import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';

const store = new AsyncLocalStorage();

export function withProviderJournal(journal, fn) {
  return store.run({ journal, seq: 0 }, fn);
}

export function providerFingerprint(...parts) {
  return createHash('sha256').update(parts.map((part) => String(part ?? '')).join('\u0000')).digest('hex');
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
