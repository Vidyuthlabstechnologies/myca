import { AsyncLocalStorage } from 'node:async_hooks';
import { createHmac } from 'node:crypto';

const store = new AsyncLocalStorage();

export function withProviderJournal(journal, fn) {
  return store.run({ journal, seq: 0 }, fn);
}

// Only ever compared for equality. It is keyed, so someone who can read the journal cannot
// work a short code (an EVC OTP, say) back out of a fingerprint by trying every value.
function fingerprintKey() {
  return `myca.provider-journal.v1:${process.env.MYCA_BOOKS_KEY || process.env.MYCA_TOKEN_SECRET || ''}`;
}

export function providerFingerprint(...parts) {
  return createHmac('sha256', fingerprintKey()).update(parts.map((part) => String(part ?? '')).join('\u0000')).digest('hex');
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
